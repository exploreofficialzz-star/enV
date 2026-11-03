package com.chastech.env.engine

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sqrt

/** Native local Newtonian point-mass attraction, distinct from the Web TS solver.
 * Density comes from invented matter, not from measured astronomical bodies. */
private data class GV(val x:Double,val y:Double,val z:Double) {
    operator fun plus(b:GV)=GV(x+b.x,y+b.y,z+b.z)
    operator fun minus(b:GV)=GV(x-b.x,y-b.y,z-b.z)
    operator fun times(k:Double)=GV(x*k,y*k,z*k)
    fun magnitude()=sqrt(x*x+y*y+z*z)
    fun dot(b:GV)=x*b.x+y*b.y+z*b.z
    fun valid()=x.isFinite()&&y.isFinite()&&z.isFinite()
    fun asLab()=NativeLabVector(x,y,z)
    companion object {fun of(v:NativeLabVector)=GV(v.x,v.y,v.z)}
}
data class NativeGravityBody(val entityId:String,val materialId:String,
    val massKg:Double,val radiusM:Double,
    val initialPositionM:NativeLabVector,val initialVelocityMps:NativeLabVector)
data class NativeGravityFrame(val timeSeconds:Double,
    val positionsM:List<NativeLabVector>,val velocitiesMps:List<NativeLabVector>,
    val totalEnergyJ:Double,val energyDriftJ:Double,
    val totalMomentumKgMps:NativeLabVector)
data class NativeGravityRun(val projectId:String,val projectRevision:Int,
    val bodies:List<NativeGravityBody>,val durationSeconds:Double,
    val integrationSteps:Int,val frames:List<NativeGravityFrame>,
    val initialEnergyJ:Double,val finalEnergyJ:Double,
    val energyDriftFraction:Double,val validity:String) {
    fun sample(seconds:Double):NativeGravityFrame{
        require(seconds.isFinite()){"Time must be finite"}
        val t=seconds.coerceIn(0.0,durationSeconds)
        if(t<=0)return frames.first()
        if(t>=durationSeconds)return frames.last()
        val upper=frames.indexOfFirst{it.timeSeconds>=t}.coerceAtLeast(1)
        val a=frames[upper-1];val b=frames[upper]
        val k=(t-a.timeSeconds)/(b.timeSeconds-a.timeSeconds)
        fun blend(x:NativeLabVector,y:NativeLabVector)=NativeLabVector(
            x.x+(y.x-x.x)*k,x.y+(y.y-x.y)*k,x.z+(y.z-x.z)*k)
        return NativeGravityFrame(t,a.positionsM.zip(b.positionsM).map{(x,y)->blend(x,y)},
            a.velocitiesMps.zip(b.velocitiesMps).map{(x,y)->blend(x,y)},
            a.totalEnergyJ+(b.totalEnergyJ-a.totalEnergyJ)*k,
            a.energyDriftJ+(b.energyDriftJ-a.energyDriftJ)*k,
            blend(a.totalMomentumKgMps,b.totalMomentumKgMps))
    }
}
object NativeWorldLabGravity {
    const val G=6.67430e-11
    private fun force(pos:List<GV>,bodies:List<NativeGravityBody>):Pair<List<GV>,Double>{
        val acceleration=MutableList(pos.size){GV(0.0,0.0,0.0)}
        var potential=0.0
        for(i in pos.indices)for(j in i+1 until pos.size){
            val d=pos[j]-pos[i];val r=d.magnitude()
            require(r.isFinite()&&r>bodies[i].radiusM+bodies[j].radiusM+1e-9){
                "Gravity model reached touching or overlapping bodies; collision dynamics are unsupported"
            }
            val scale=G/(r*r*r)
            require(scale.isFinite()){"Gravity forces exceeded finite bounds"}
            acceleration[i]=acceleration[i]+d*(scale*bodies[j].massKg)
            acceleration[j]=acceleration[j]-d*(scale*bodies[i].massKg)
            potential-=G*bodies[i].massKg*bodies[j].massKg/r
        }
        require(potential.isFinite()&&acceleration.all{it.valid()}){
            "Gravity acceleration exceeded finite bounds"}
        return acceleration to potential
    }
    private data class Audit(val acceleration:List<GV>,val energy:Double,val momentum:GV)
    private fun audit(pos:List<GV>,v:List<GV>,b:List<NativeGravityBody>):Audit {
        val (a,potential)=force(pos,b)
        val kinetic=v.indices.sumOf{0.5*b[it].massKg*v[it].dot(v[it])}
        val momentum=v.indices.fold(GV(0.0,0.0,0.0)){sum,i->sum+v[i]*b[i].massKg}
        val energy=kinetic+potential
        require(energy.isFinite()&&momentum.valid()){"Gravity energy exceeded finite bounds"}
        return Audit(a,energy,momentum)
    }
    fun evaluate(project:NativeWorldLabProject,bodyIds:List<String>,
        velocities:Map<String,NativeLabVector>,durationSeconds:Double=30.0,
        integrationSteps:Int=480):NativeGravityRun {
        require(bodyIds.size in 2..8&&bodyIds.toSet().size==bodyIds.size){
            "Local gravity supports 2–8 distinct spheres"}
        require(velocities.keys.all{it in bodyIds}){"Unknown gravity body velocity"}
        require(durationSeconds.isFinite()&&durationSeconds in 0.1..3600.0&&
            integrationSteps in 2..1200){"Unsupported gravity duration or steps"}
        val bodies=bodyIds.map{id->
            val solid=project.entities.firstOrNull{it.id==id}
                ?:error("Missing gravity sphere")
            require(solid.shape=="sphere"){"Gravity supports spherical geometry only"}
            val material=project.materials.firstOrNull{it.id==solid.materialId}
            val mass=material?.densityKgM3?.times(solid.volumeMetersCubed())
            require(mass!=null&&mass.isFinite()&&mass in 0.001..1e24){
                "Each sphere requires assumed density and supported mass"}
            val speed=velocities[id]?:NativeLabVector(0.0,0.0,0.0)
            val vector=GV.of(speed)
            require(vector.valid()&&vector.magnitude()<=1e6){
                "Gravity velocities must be finite and no faster than 10^6 m/s"}
            NativeGravityBody(id,material.id,mass,solid.dimensionsMeters.x/2,
                solid.positionMeters,speed)
        }
        var p=bodies.map{GV.of(it.initialPositionM)}
        var v=bodies.map{GV.of(it.initialVelocityMps)}
        val original=audit(p,v,bodies)
        var a=original.acceleration
        val dt=durationSeconds/integrationSteps
        val stride=max(1,(integrationSteps+239)/240)
        val frames=mutableListOf<NativeGravityFrame>()
        fun snapshot(step:Int){
            val now=audit(p,v,bodies)
            frames.add(NativeGravityFrame(step*dt,p.map{it.asLab()},v.map{it.asLab()},
                now.energy,now.energy-original.energy,now.momentum.asLab()))
        }
        snapshot(0)
        for(step in 1..integrationSteps){
            val nextPositions=p.indices.map{i->p[i]+v[i]*dt+a[i]*(0.5*dt*dt)}
            val nextAcceleration=force(nextPositions,bodies).first
            val nextVelocity=v.indices.map{i->
                v[i]+(a[i]+nextAcceleration[i])*(0.5*dt)}
            p=nextPositions;v=nextVelocity;a=nextAcceleration
            if(step%stride==0||step==integrationSteps)snapshot(step)
        }
        val final=audit(p,v,bodies)
        val drift=abs(final.energy-original.energy)/max(1.0,abs(original.energy))
        val difference=(final.momentum-original.momentum).magnitude()
        val scale=max(1.0,bodies.sumOf{it.massKg*GV.of(it.initialVelocityMps).magnitude()})
        require(drift<=0.05){"Gravity integration lost over 5% energy; increase steps"}
        require(difference<=1e-7*scale){"Gravity integration momentum audit failed"}
        return NativeGravityRun(project.id,project.revision,bodies,durationSeconds,
            integrationSteps,frames,original.energy,final.energy,drift,
            "Newtonian pairwise point-mass gravity for assumed spherical densities; "+
            "velocity-Verlet integration, nonoverlap and energy audit. No real "+
            "planetary measurements, impacts, tides or relativistic dynamics.")
    }
}
