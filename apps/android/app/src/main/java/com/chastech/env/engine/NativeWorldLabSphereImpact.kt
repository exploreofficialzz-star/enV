package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Analytic FIRST 3D central contact for two smooth spheres in otherwise empty space.
 * Invented inertial masses and restitution are user assumptions, not measurements.
 */
private data class ImpactVector(val x:Double,val y:Double,val z:Double) {
    operator fun plus(v:ImpactVector)=ImpactVector(x+v.x,y+v.y,z+v.z)
    operator fun minus(v:ImpactVector)=ImpactVector(x-v.x,y-v.y,z-v.z)
    operator fun times(s:Double)=ImpactVector(x*s,y*s,z*s)
    fun dot(v:ImpactVector)=x*v.x+y*v.y+z*v.z
    fun cross(v:ImpactVector)=ImpactVector(y*v.z-z*v.y,z*v.x-x*v.z,x*v.y-y*v.x)
    fun norm()=sqrt(dot(this))
    fun finite()=listOf(x,y,z).all{it.isFinite()}
    fun toNative()=NativeLabVector(x,y,z)
    companion object {fun from(v:NativeLabVector)=ImpactVector(v.x,v.y,v.z)}
}
data class NativeSphereImpactSample(
    val timeSeconds:Double,
    val firstCentreM:NativeLabVector,val secondCentreM:NativeLabVector,
    val firstVelocityMps:NativeLabVector,val secondVelocityMps:NativeLabVector,
    val collided:Boolean,
)
data class NativeSphereImpactResult(
    val projectId:String,val projectRevision:Int,
    val firstEntityId:String,val secondEntityId:String,
    val firstMaterialId:String,val secondMaterialId:String,
    val initialFirstCentreM:NativeLabVector,val initialSecondCentreM:NativeLabVector,
    val firstInitialVelocityMps:NativeLabVector,val secondInitialVelocityMps:NativeLabVector,
    val firstFinalVelocityMps:NativeLabVector,val secondFinalVelocityMps:NativeLabVector,
    val firstRadiusM:Double,val secondRadiusM:Double,
    val firstMassKg:Double,val secondMassKg:Double,
    val impactTimeSeconds:Double,val durationSeconds:Double,val restitution:Double,
    val impactNormal:NativeLabVector,val impulseNs:NativeLabVector,
    val momentumBeforeKgMps:NativeLabVector,val momentumAfterKgMps:NativeLabVector,
    val angularMomentumBeforeKgM2PerS:NativeLabVector,
    val angularMomentumAfterKgM2PerS:NativeLabVector,
    val energyBeforeJ:Double,val energyAfterJ:Double,val dissipatedEnergyJ:Double,
    val evidence:String="physics-model-computed",
    val assumptionEvidence:String="hypothetical-user-assumed",
    val validity:String="Two ideal smooth, nonrotating rigid spheres in empty 3D free-flight; "+
        "one instantaneous normal impulse, no gravity, friction, rolling, deformation, "+
        "obstacles, secondary contacts or fracture. Invented mass and restitution "+
        "are user assumptions, not verified material evidence."
) {
    fun sample(timeSeconds:Double):NativeSphereImpactSample {
        require(timeSeconds.isFinite()&&timeSeconds in 0.0..durationSeconds){
            "3D sphere playback time exceeds modeled interval"
        }
        val before=min(timeSeconds,impactTimeSeconds)
        val after=max(0.0,timeSeconds-impactTimeSeconds)
        fun trajectory(p:NativeLabVector,v:NativeLabVector,w:NativeLabVector)=
            NativeLabVector(p.x+v.x*before+w.x*after,
                p.y+v.y*before+w.y*after,p.z+v.z*before+w.z*after)
        return NativeSphereImpactSample(timeSeconds,
            trajectory(initialFirstCentreM,firstInitialVelocityMps,firstFinalVelocityMps),
            trajectory(initialSecondCentreM,secondInitialVelocityMps,secondFinalVelocityMps),
            if(timeSeconds<impactTimeSeconds)firstInitialVelocityMps else firstFinalVelocityMps,
            if(timeSeconds<impactTimeSeconds)secondInitialVelocityMps else secondFinalVelocityMps,
            timeSeconds>=impactTimeSeconds)
    }
    fun toEvidenceJson():String {
        fun vec(v:NativeLabVector)=JSONArray().put(v.x).put(v.y).put(v.z)
        return JSONObject().put("format","env-world-lab-sphere-impact-3d")
            .put("modelVersion","1.0.0").put("evidence",evidence)
            .put("assumptionEvidence",assumptionEvidence)
            .put("projectId",projectId).put("projectRevision",projectRevision)
            .put("firstEntityId",firstEntityId).put("secondEntityId",secondEntityId)
            .put("firstMaterialId",firstMaterialId).put("secondMaterialId",secondMaterialId)
            .put("initialFirstCentreM",vec(initialFirstCentreM))
            .put("initialSecondCentreM",vec(initialSecondCentreM))
            .put("firstInitialVelocityMps",vec(firstInitialVelocityMps))
            .put("secondInitialVelocityMps",vec(secondInitialVelocityMps))
            .put("firstFinalVelocityMps",vec(firstFinalVelocityMps))
            .put("secondFinalVelocityMps",vec(secondFinalVelocityMps))
            .put("firstRadiusM",firstRadiusM).put("secondRadiusM",secondRadiusM)
            .put("firstMassKg",firstMassKg).put("secondMassKg",secondMassKg)
            .put("impactTimeSeconds",impactTimeSeconds)
            .put("durationSeconds",durationSeconds).put("restitution",restitution)
            .put("impactNormal",vec(impactNormal)).put("impulseNs",vec(impulseNs))
            .put("momentumBeforeKgMps",vec(momentumBeforeKgMps))
            .put("momentumAfterKgMps",vec(momentumAfterKgMps))
            .put("angularMomentumBeforeKgM2PerS",vec(angularMomentumBeforeKgM2PerS))
            .put("angularMomentumAfterKgM2PerS",vec(angularMomentumAfterKgM2PerS))
            .put("energyBeforeJ",energyBeforeJ).put("energyAfterJ",energyAfterJ)
            .put("dissipatedEnergyJ",dissipatedEnergyJ)
            .put("validity",validity).toString(2)
    }
}
object NativeWorldLabSphereImpact {
    fun evaluate(project:NativeWorldLabProject,firstId:String,secondId:String,
        firstVelocityMps:NativeLabVector,secondVelocityMps:NativeLabVector,
        restitution:Double,durationSeconds:Double=4.0):NativeSphereImpactResult {
        require(firstId!=secondId){"Choose two distinct spheres"}
        val a=project.entities.firstOrNull{it.id==firstId}
        val b=project.entities.firstOrNull{it.id==secondId}
        require(a!=null&&b!=null&&a.shape=="sphere"&&b.shape=="sphere"){
            "The real spatial reference needs two existing spherical solids"
        }
        val vA=ImpactVector.from(firstVelocityMps)
        val vB=ImpactVector.from(secondVelocityMps)
        require(vA.finite()&&vB.finite()&&vA.norm()<=100&&vB.norm()<=100&&
            restitution.isFinite()&&restitution in 0.0..1.0&&
            durationSeconds.isFinite()&&durationSeconds>0&&durationSeconds<=30){
            "Velocity magnitude <=100 m/s, restitution 0-1 and finite duration (0,30] s"
        }
        val pA=ImpactVector.from(a.positionMeters)
        val pB=ImpactVector.from(b.positionMeters)
        val ra=a.dimensionsMeters.x/2
        val rb=b.dimensionsMeters.x/2
        val separation=pB-pA
        val relative=vB-vA
        val radius=ra+rb
        require(separation.norm()>radius+1e-9){
            "Spheres must start separated without contact or overlap"
        }
        val qa=relative.dot(relative)
        val qb=2*separation.dot(relative)
        val qc=separation.dot(separation)-radius*radius
        require(qa>0&&qb<0){"Spheres must approach one another"}
        val discriminant=qb*qb-4*qa*qc
        require(discriminant>=0){"Spheres miss, so no impact exists"}
        val hit=(-qb-sqrt(discriminant))/(2*qa)
        require(hit.isFinite()&&hit in 0.0..durationSeconds){
            "No sphere collision occurs during this simulation"
        }
        val normal=(separation+relative*hit)*(1/radius)
        require(abs(normal.norm()-1)<=1e-7){
            "Impact normal violates analytic geometric limits"
        }
        val closing=relative.dot(normal)
        require(closing< -1e-10){"No inward-moving contact occurs on this trajectory"}
        val materialA=project.materials.firstOrNull{it.id==a.materialId}
        val materialB=project.materials.firstOrNull{it.id==b.materialId}
        val ma=materialA?.densityKgM3?.times(a.volumeMetersCubed())
        val mb=materialB?.densityKgM3?.times(b.volumeMetersCubed())
        require(ma!=null&&mb!=null&&ma.isFinite()&&mb.isFinite()&&
            ma in 0.001..10000.0&&mb in 0.001..10000.0){
            "Both spheres need invented densities producing finite masses 0.001-10000 kg"
        }
        val impulse=normal*(-(1+restitution)*closing/(1/ma+1/mb))
        val nextA=vA-impulse*(1/ma)
        val nextB=vB+impulse*(1/mb)
        val beforeMomentum=vA*ma+vB*mb
        val afterMomentum=nextA*ma+nextB*mb
        val beforeEnergy=0.5*(ma*vA.dot(vA)+mb*vB.dot(vB))
        val afterEnergy=0.5*(ma*nextA.dot(nextA)+mb*nextB.dot(nextB))
        val lost=0.5*ma*mb/(ma+mb)*(1-restitution*restitution)*closing*closing
        val hitA=pA+vA*hit
        val hitB=pB+vB*hit
        val beforeAngular=hitA.cross(vA)*ma+hitB.cross(vB)*mb
        val afterAngular=hitA.cross(nextA)*ma+hitB.cross(nextB)*mb
        val tol=1e-8
        require(listOf(impulse,nextA,nextB,beforeMomentum,afterMomentum,
            beforeAngular,afterAngular).all{it.finite()}&&
            listOf(beforeEnergy,afterEnergy,lost).all{it.isFinite()}&&
            (beforeMomentum-afterMomentum).norm()<=tol*max(1.0,beforeMomentum.norm())&&
            (beforeAngular-afterAngular).norm()<=tol*max(1.0,beforeAngular.norm())&&
            abs(beforeEnergy-afterEnergy-lost)<=tol*max(1.0,beforeEnergy)&&
            afterEnergy<=beforeEnergy+tol*max(1.0,beforeEnergy)){
            "3D collision failed momentum, angular momentum or energy invariants"
        }
        return NativeSphereImpactResult(project.id,project.revision,a.id,b.id,
            materialA.id,materialB.id,a.positionMeters,b.positionMeters,
            firstVelocityMps,secondVelocityMps,nextA.toNative(),nextB.toNative(),
            ra,rb,ma,mb,hit,durationSeconds,restitution,normal.toNative(),
            impulse.toNative(),beforeMomentum.toNative(),afterMomentum.toNative(),
            beforeAngular.toNative(),afterAngular.toNative(),
            beforeEnergy,afterEnergy,lost)
    }
}
