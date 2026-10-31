package com.chastech.env.engine

/** Small-deflection Euler-Bernoulli cantilever, with invented isotropic E. */
data class NativeLabBeamBendingResult(
    val projectId:String,val projectRevision:Int,val entityId:String,
    val materialId:String,val forceN:Double,val lengthM:Double,
    val depthM:Double,val widthM:Double,val assumedYoungModulusPa:Double,
    val secondMomentM4:Double,val bendingStiffnessNm2:Double,
    val tipDeflectionM:Double,val maximumStressPa:Double,val surfaceStrain:Double,
    val evidence:String="physics-model-computed",
    val materialEvidence:String="hypothetical-user-assumed",
    val validity:String="Ideal static slender rectangular cantilever, linear elastic, "+
        "homogeneous and isotropic, perfectly clamped. Material stiffness is "+
        "hypothetical, never measured. No failure stress, fatigue, shear, "+
        "buckling, torsion, creep, load rating or safety certification."
)
object NativeWorldLabStructural {
    fun bending(p:NativeWorldLabProject,entityId:String,forceN:Double):NativeLabBeamBendingResult {
        require(forceN.isFinite()&&forceN in 0.0..1e8) {
            "Downward cantilever tip load must be finite and between 0 and 100,000,000 N"
        }
        val solid=p.entities.firstOrNull{it.id==entityId}
            ?:error("Choose a solid for beam bending")
        require(solid.shape=="box"){"Only rectangular box beams are supported"}
        val matter=p.materials.firstOrNull{it.id==solid.materialId}
        val young=matter?.youngModulusPa
        require(young!=null&&young>0.0){"Assign assumed positive Young's modulus"}
        val length=solid.dimensionsMeters.x
        val depth=solid.dimensionsMeters.y
        val width=solid.dimensionsMeters.z
        require(length/depth>=5.0){
            "Euler-Bernoulli reference requires beam length at least five times its depth"
        }
        val secondMoment=width*depth*depth*depth/12.0
        val stiffness=young*secondMoment
        val displacement=forceN*length*length*length/(3.0*stiffness)
        val stress=forceN*length*depth/(2.0*secondMoment)
        val strain=stress/young
        require(listOf(secondMoment,stiffness,displacement,stress,strain)
            .all{it.isFinite()}&&stiffness>0.0){
            "Bending values exceeded finite bounds"
        }
        require(displacement<=length*0.1 && strain<=0.01){
            "Predicted deflection or strain exceeds the small-deformation model domain"
        }
        return NativeLabBeamBendingResult(p.id,p.revision,solid.id,
            matter.id,forceN,length,depth,width,young,
            secondMoment,stiffness,displacement,stress,strain)
    }
}
