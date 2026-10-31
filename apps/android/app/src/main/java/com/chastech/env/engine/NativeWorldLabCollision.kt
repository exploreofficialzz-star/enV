package com.chastech.env.engine

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Exact event-time one-dimensional central collision; not general 3D rigid dynamics. */
data class NativeLabCollisionSample(
    val timeSeconds:Double,val leftCenterXM:Double,val rightCenterXM:Double,
    val leftVelocityMps:Double,val rightVelocityMps:Double,val collided:Boolean,
)
data class NativeLabCollisionResult(
    val projectId:String,val projectRevision:Int,val leftEntityId:String,
    val rightEntityId:String,val leftMaterialId:String,val rightMaterialId:String,
    val leftMassKg:Double,val rightMassKg:Double,
    val leftStartXM:Double,val rightStartXM:Double,
    val leftHalfWidthM:Double,val rightHalfWidthM:Double,
    val leftInitialVelocityMps:Double,val rightInitialVelocityMps:Double,
    val restitution:Double,val durationSeconds:Double,
    val impactTimeSeconds:Double,val contactXM:Double,
    val leftFinalVelocityMps:Double,val rightFinalVelocityMps:Double,
    val impulseNs:Double,val momentumBeforeKgMps:Double,val momentumAfterKgMps:Double,
    val energyBeforeJ:Double,val energyAfterJ:Double,val dissipatedEnergyJ:Double,
    val evidence:String="physics-model-computed",
    val inputEvidence:String="hypothetical-user-assumed",
    val validity:String="Ideal rigid primitive pair with aligned Y/Z centres, "+
        "single instantaneous frictionless X impact, no spin, gravity-driven horizontal "+
        "acceleration, secondary contacts, deformation or failure. Assumed densities "+
        "give inertial masses; restitution is a user assumption, not measured."
) {
    fun sample(timeSeconds:Double):NativeLabCollisionSample{
        require(timeSeconds.isFinite()&&timeSeconds>=0&&timeSeconds<=durationSeconds){
            "Impact playback time is outside the simulated interval"
        }
        val before=min(timeSeconds,impactTimeSeconds)
        val after=max(0.0,timeSeconds-impactTimeSeconds)
        return NativeLabCollisionSample(timeSeconds,
            leftStartXM+leftInitialVelocityMps*before+leftFinalVelocityMps*after,
            rightStartXM+rightInitialVelocityMps*before+rightFinalVelocityMps*after,
            if(timeSeconds<impactTimeSeconds)leftInitialVelocityMps else leftFinalVelocityMps,
            if(timeSeconds<impactTimeSeconds)rightInitialVelocityMps else rightFinalVelocityMps,
            timeSeconds>=impactTimeSeconds)
    }
}
object NativeWorldLabCollision {
    fun evaluate(project:NativeWorldLabProject,firstId:String,secondId:String,
        velocityLeftMps:Double,velocityRightMps:Double,
        restitution:Double,durationSeconds:Double=4.0):NativeLabCollisionResult{
        require(firstId!=secondId){"Choose two distinct physical solids"}
        val a=project.entities.firstOrNull{it.id==firstId}
        val b=project.entities.firstOrNull{it.id==secondId}
        require(a!=null&&b!=null){"Both collision solids must exist"}
        require(a.shape in setOf("box","sphere","cylinder")&&b.shape in setOf("box","sphere","cylinder")){
            "Current central-impact model supports box, sphere or cylinder primitives"
        }
        val left=if(a.positionMeters.x<b.positionMeters.x)a else b
        val right=if(left.id==a.id)b else a
        require(left.positionMeters.x<right.positionMeters.x){
            "Solid centres must start at distinct X positions"
        }
        require(abs(left.positionMeters.y-right.positionMeters.y)<=1e-8 &&
            abs(left.positionMeters.z-right.positionMeters.z)<=1e-8){
            "1D impacts require aligned Y and Z centres"
        }
        val halfLeft=left.dimensionsMeters.x/2.0
        val halfRight=right.dimensionsMeters.x/2.0
        val gap=right.positionMeters.x-halfRight-(left.positionMeters.x+halfLeft)
        require(gap>1e-9){"Collision solids must start separated, not overlapping"}
        require(listOf(velocityLeftMps,velocityRightMps,restitution,durationSeconds)
            .all{it.isFinite()}&&
            abs(velocityLeftMps)<=100&&abs(velocityRightMps)<=100&&
            restitution in 0.0..1.0&&durationSeconds>0&&durationSeconds<=30){
            "Finite velocities ±100 m/s, restitution 0–1 and duration (0,30] are required"
        }
        val relative=velocityLeftMps-velocityRightMps
        require(relative>0){"The left object must approach the right object"}
        val impact=gap/relative
        require(impact<=durationSeconds){"No collision takes place in the chosen duration"}
        val leftMaterial=project.materials.firstOrNull{it.id==left.materialId}
        val rightMaterial=project.materials.firstOrNull{it.id==right.materialId}
        val ml=leftMaterial?.densityKgM3?.times(left.volumeMetersCubed())
        val mr=rightMaterial?.densityKgM3?.times(right.volumeMetersCubed())
        require(ml!=null&&mr!=null&&ml.isFinite()&&mr.isFinite()&&
            ml in 0.001..10000.0&&mr in 0.001..10000.0){
            "Both solids need assigned finite inventor-assumed mass from density"
        }
        val impulse=(1+restitution)*relative/(1/ml+1/mr)
        val vl=velocityLeftMps-impulse/ml
        val vr=velocityRightMps+impulse/mr
        val momentumBefore=ml*velocityLeftMps+mr*velocityRightMps
        val momentumAfter=ml*vl+mr*vr
        val energyBefore=0.5*(ml*velocityLeftMps*velocityLeftMps+
            mr*velocityRightMps*velocityRightMps)
        val energyAfter=0.5*(ml*vl*vl+mr*vr*vr)
        val lost=0.5*(ml*mr/(ml+mr))*(1-restitution*restitution)*relative*relative
        val contact=left.positionMeters.x+halfLeft+velocityLeftMps*impact
        require(listOf(impulse,vl,vr,momentumBefore,momentumAfter,
            energyBefore,energyAfter,lost,contact).all{it.isFinite()}&&
            abs(momentumAfter-momentumBefore)<=1e-8*max(1.0,abs(momentumBefore))&&
            abs(energyBefore-energyAfter-lost)<=1e-8*max(1.0,energyBefore)&&
            energyAfter<=energyBefore+1e-8*max(1.0,energyBefore)){
            "Impulse conservation audit exceeded finite numerical tolerances"
        }
        return NativeLabCollisionResult(project.id,project.revision,
            left.id,right.id,leftMaterial.id,rightMaterial.id,ml,mr,
            left.positionMeters.x,right.positionMeters.x,halfLeft,halfRight,
            velocityLeftMps,velocityRightMps,restitution,durationSeconds,
            impact,contact,vl,vr,impulse,momentumBefore,momentumAfter,
            energyBefore,energyAfter,lost)
    }
}
