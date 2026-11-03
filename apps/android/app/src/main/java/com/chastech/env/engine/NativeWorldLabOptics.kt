package com.chastech.env.engine

import kotlin.math.*

/** Offline, lossless single-plane Fresnel/Snell model of invented indices. */
data class NativeLabOpticsResult(
    val projectId:String,val projectRevision:Int,
    val firstMaterialId:String,val secondMaterialId:String,
    val firstIndex:Double,val secondIndex:Double,
    val sReflectance:Double,val pReflectance:Double,
    val incidentDegrees:Double,val transmittedDegrees:Double?,
    val criticalDegrees:Double?,val totalInternalReflection:Boolean,
    val reflectance:Double,val transmittance:Double,
    val validity:String
)
object NativeWorldLabOptics {
    fun calculate(project:NativeWorldLabProject,firstId:String,
        secondId:String,angleDegrees:Double):NativeLabOpticsResult {
        require(firstId!=secondId){"Use two distinct invented materials."}
        val a=project.materials.firstOrNull{it.id==firstId}
        val b=project.materials.firstOrNull{it.id==secondId}
        val n1=a?.refractiveIndex;val n2=b?.refractiveIndex
        require(n1!=null&&n2!=null&&n1 in 1.0..5.0&&n2 in 1.0..5.0){
            "Both invented materials need assumed refractive indices (1–5)."
        }
        require(angleDegrees.isFinite()&&angleDegrees in 0.0..89.9){
            "Incidence must be between 0 and 89.9 degrees."
        }
        val angle=Math.toRadians(angleDegrees)
        val sine=n1/n2*sin(angle)
        val total=sine>1
        val refracted=if(total)null else Math.toDegrees(asin(min(1.0,sine)))
        val ci=cos(angle)
        val ct=if(total)0.0 else sqrt(max(0.0,1-sine*sine))
        val rs=if(total)1.0 else ((n1*ci-n2*ct)/(n1*ci+n2*ct)).pow(2)
        val rp=if(total)1.0 else ((n2*ci-n1*ct)/(n2*ci+n1*ct)).pow(2)
        val reflectance=((rs+rp)/2).coerceIn(0.0,1.0)
        return NativeLabOpticsResult(project.id,project.revision,firstId,secondId,
            n1,n2,rs,rp,angleDegrees,refracted,
            if(n1>n2)Math.toDegrees(asin(n2/n1)) else null,
            total,reflectance,1-reflectance,
            "Lossless planar, isotropic nonmagnetic Fresnel/Snell model with assumed "+
            "refractive indices. No measured material properties, absorption, "+
            "dispersion, diffraction, phase or safety validation.")
    }
}
