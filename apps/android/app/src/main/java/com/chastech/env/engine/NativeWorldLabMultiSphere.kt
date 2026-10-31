package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** Bounded event-driven 3D frictionless binary sphere impacts. No simultaneous contacts. */
private data class MV(val x:Double,val y:Double,val z:Double) {
    operator fun plus(o:MV)=MV(x+o.x,y+o.y,z+o.z)
    operator fun minus(o:MV)=MV(x-o.x,y-o.y,z-o.z)
    operator fun times(k:Double)=MV(x*k,y*k,z*k)
    fun dot(o:MV)=x*o.x+y*o.y+z*o.z
    fun norm()=sqrt(dot(this))
    fun cross(o:MV)=MV(y*o.z-z*o.y,z*o.x-x*o.z,x*o.y-y*o.x)
    fun finite()=listOf(x,y,z).all{it.isFinite()}
    fun xyz()=NativeLabVector(x,y,z)
    companion object {
        fun of(v:NativeLabVector)=MV(v.x,v.y,v.z)
    }
}
data class NativeGroupSphere(val entityId:String,val materialId:String,
    val radiusM:Double,val massKg:Double,val positionM:NativeLabVector,
    val velocityMps:NativeLabVector)
data class NativeGroupEvent(
    val atSeconds:Double,val firstEntityId:String,val secondEntityId:String,
    val contactNormal:NativeLabVector,val impulseNs:NativeLabVector,
    val energyLostJ:Double
)
data class NativeGroupSampleSphere(val entityId:String,
    val positionM:NativeLabVector,val velocityMps:NativeLabVector)
data class NativeGroupSample(val timeSeconds:Double,val completedEvents:Int,
    val objects:List<NativeGroupSampleSphere>)
data class NativeGroupRun(
    val projectId:String,val projectRevision:Int,val initial:List<NativeGroupSphere>,
    val restitution:Double,val durationSeconds:Double,val events:List<NativeGroupEvent>,
    val initialEnergyJ:Double,val finalEnergyJ:Double,val dissipationJ:Double,
    val initialMomentum:NativeLabVector,val finalMomentum:NativeLabVector,
    val initialAngular:NativeLabVector,val finalAngular:NativeLabVector,
    val validity:String="Event-driven free-flight model for 2–12 ideal hard spheres, "+
        "with single isolated frictionless binary collisions. No simultaneous contacts, "+
        "gravity, spin, friction, breakage, material heating, deformation or stacks. "+
        "Invented densities and restitution are assumptions, not measurements."
) {
    fun sample(t:Double):NativeGroupSample{
        require(t.isFinite()&&t>=0&&t<=durationSeconds){"Sample time outside group run"}
        val position=initial.associate{it.entityId to MV.of(it.positionM)}.toMutableMap()
        val velocity=initial.associate{it.entityId to MV.of(it.velocityMps)}.toMutableMap()
        val masses=initial.associate{it.entityId to it.massKg}
        var time=0.0
        var contacts=0
        fun advance(dt:Double) {
            for((id,p)in position)position[id]=p+velocity.getValue(id)*dt
        }
        for(event in events){
            if(event.atSeconds>t)break
            advance(event.atSeconds-time);time=event.atSeconds;contacts++
            val imp=MV.of(event.impulseNs)
            velocity[event.firstEntityId]=velocity.getValue(event.firstEntityId)-
                imp*(1/masses.getValue(event.firstEntityId))
            velocity[event.secondEntityId]=velocity.getValue(event.secondEntityId)+
                imp*(1/masses.getValue(event.secondEntityId))
        }
        advance(t-time)
        return NativeGroupSample(t,contacts,initial.map{
            NativeGroupSampleSphere(it.entityId,position.getValue(it.entityId).xyz(),
                velocity.getValue(it.entityId).xyz())
        })
    }
    fun toEvidenceJson():String {
        fun vec(v:NativeLabVector)=JSONArray().put(v.x).put(v.y).put(v.z)
        val balls=JSONArray()
        for(o in initial)balls.put(JSONObject().put("entityId",o.entityId)
            .put("materialId",o.materialId).put("radiusM",o.radiusM)
            .put("massKg",o.massKg).put("positionM",vec(o.positionM))
            .put("velocityMps",vec(o.velocityMps)))
        val contacts=JSONArray()
        for(e in events)contacts.put(JSONObject().put("atSeconds",e.atSeconds)
            .put("firstEntityId",e.firstEntityId).put("secondEntityId",e.secondEntityId)
            .put("contactNormal",vec(e.contactNormal)).put("impulseNs",vec(e.impulseNs))
            .put("energyLostJ",e.energyLostJ))
        return JSONObject().put("format","env-world-lab-multi-sphere-impact")
            .put("modelVersion","1.0.0").put("evidence","physics-model-computed")
            .put("materialEvidence","hypothetical-user-assumed")
            .put("projectId",projectId).put("projectRevision",projectRevision)
            .put("initial",balls).put("restitution",restitution)
            .put("durationSeconds",durationSeconds).put("events",contacts)
            .put("totalInitialEnergyJ",initialEnergyJ).put("totalFinalEnergyJ",finalEnergyJ)
            .put("totalDissipatedEnergyJ",dissipationJ)
            .put("initialMomentumKgMps",vec(initialMomentum))
            .put("finalMomentumKgMps",vec(finalMomentum))
            .put("initialAngularMomentumKgM2PerS",vec(initialAngular))
            .put("finalAngularMomentumKgM2PerS",vec(finalAngular))
            .put("validity",validity).toString(2)
    }
}
object NativeWorldLabMultiSphere {
    private const val EPS=1e-8
    private const val MAX_EVENTS=128
    private class Moving(val id:String,val materialId:String,
        var pos:MV,var vel:MV,val mass:Double,val radius:Double)
    private fun p(objects:List<Moving>):MV=objects.fold(MV(0.0,0.0,0.0)){v,o->v+o.vel*o.mass}
    private fun l(objects:List<Moving>):MV=objects.fold(MV(0.0,0.0,0.0)){
        v,o->v+o.pos.cross(o.vel)*o.mass
    }
    private fun energy(objects:List<Moving>)=objects.sumOf{0.5*it.mass*it.vel.dot(it.vel)}
    private fun next(a:Moving,b:Moving):Double?{
        val sep=b.pos-a.pos
        val vel=b.vel-a.vel
        val c=sep.dot(sep)-(a.radius+b.radius)*(a.radius+b.radius)
        require(c>=-EPS){"Objects overlapped before contact"}
        val aa=vel.dot(vel);val bb=2*sep.dot(vel)
        if(aa<=1e-18||bb>=-1e-12)return null
        val d=bb*bb-4*aa*c
        if(d<0)return null
        val t=(-bb-sqrt(max(0.0,d)))/(2*aa)
        if(t<=EPS||((sep+vel*t).dot(vel))>=-1e-10)return null
        return t
    }
    fun evaluate(project:NativeWorldLabProject,
        velocities:Map<String,NativeLabVector>,restitution:Double,
        durationSeconds:Double=5.0):NativeGroupRun{
        val spheres=project.entities.filter{it.shape=="sphere"}
        require(spheres.size in 2..12){"Requires 2–12 spheres"}
        require(restitution.isFinite()&&restitution in 0.0..1.0&&
            durationSeconds.isFinite()&&durationSeconds>0&&durationSeconds<=30){
            "Restitution must be 0–1 and duration (0,30] seconds"
        }
        require(velocities.keys.all{id->spheres.any{it.id==id}}){
            "Unknown sphere velocity supplied"
        }
        val objects=spheres.map{s->
            val matter=project.materials.firstOrNull{it.id==s.materialId}
            val mass=matter?.densityKgM3?.times(s.volumeMetersCubed())
            require(matter!=null&&mass!=null&&mass.isFinite()&&mass in 0.001..10000.0){
                "Every sphere needs a hypothetical finite mass from invented density"
            }
            val velocity=MV.of(velocities[s.id]?:NativeLabVector(0.0,0.0,0.0))
            require(velocity.finite()&&velocity.norm()<=100){
                "Sphere speeds must be finite, at most 100 metres per second"
            }
            Moving(s.id,matter.id,MV.of(s.positionMeters),velocity,mass,
                s.dimensionsMeters.x/2)
        }
        for(i in objects.indices)for(j in i+1 until objects.size){
            require((objects[j].pos-objects[i].pos).norm()>
                objects[i].radius+objects[j].radius+EPS){
                "Spheres must start separated, not touching or overlapping"
            }
        }
        val initial=objects.map{NativeGroupSphere(it.id,it.materialId,it.radius,
            it.mass,it.pos.xyz(),it.vel.xyz())}
        val initialE=energy(objects);val initialP=p(objects);val initialL=l(objects)
        val events=mutableListOf<NativeGroupEvent>()
        var time=0.0;var lostTotal=0.0
        while(time<durationSeconds-EPS){
            var shortest=Double.POSITIVE_INFINITY
            val pairs=mutableListOf<Pair<Int,Int>>()
            for(i in objects.indices)for(j in i+1 until objects.size){
                val dt=next(objects[i],objects[j])?:continue
                if(time+dt>durationSeconds+EPS)continue
                if(dt<shortest-EPS){shortest=dt;pairs.clear();pairs.add(i to j)}
                else if(abs(dt-shortest)<=EPS)pairs.add(i to j)
            }
            if(!shortest.isFinite())break
            require(pairs.size==1){"Simultaneous multi-contact is not modeled"}
            require(events.size<MAX_EVENTS){"Sphere event cap reached"}
            val (i,j)=pairs.single()
            for(o in objects)o.pos=o.pos+o.vel*shortest
            time+=shortest
            val a=objects[i];val b=objects[j]
            val sep=b.pos-a.pos;val distance=sep.norm()
            require(abs(distance-a.radius-b.radius)<1e-6){"Inconsistent sphere contact position"}
            val n=sep*(1/distance)
            val closing=(b.vel-a.vel).dot(n)
            require(closing < -1e-10){"Impact must close along normal"}
            val impulse=n*(-(1+restitution)*closing/(1/a.mass+1/b.mass))
            val energyBefore=energy(objects);val pBefore=p(objects);val lBefore=l(objects)
            a.vel=a.vel-impulse*(1/a.mass);b.vel=b.vel+impulse*(1/b.mass)
            val energyAfter=energy(objects)
            val loss=0.5*a.mass*b.mass/(a.mass+b.mass)*
                (1-restitution*restitution)*closing*closing
            require(listOf(energyAfter,loss).all{it.isFinite()}&&
                (pBefore-p(objects)).norm()<=1e-8*max(1.0,pBefore.norm())&&
                (lBefore-l(objects)).norm()<=1e-8*max(1.0,lBefore.norm())&&
                abs(energyBefore-energyAfter-loss)<=1e-8*max(1.0,energyBefore)){
                "Conservation audit failed for sphere impact"
            }
            lostTotal+=loss
            events.add(NativeGroupEvent(time,a.id,b.id,n.xyz(),impulse.xyz(),loss))
        }
        val finalE=energy(objects);val finalP=p(objects);val finalL=l(objects)
        require((finalP-initialP).norm()<=1e-7*max(1.0,initialP.norm())&&
            (finalL-initialL).norm()<=1e-7*max(1.0,initialL.norm())&&
            abs(initialE-finalE-lostTotal)<=1e-7*max(1.0,initialE)){
            "Group conservation audit failed"
        }
        return NativeGroupRun(project.id,project.revision,initial,restitution,
            durationSeconds,events,initialE,finalE,lostTotal,
            initialP.xyz(),finalP.xyz(),initialL.xyz(),finalL.xyz())
    }
}
