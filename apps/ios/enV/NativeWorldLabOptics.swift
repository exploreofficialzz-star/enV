import Foundation

/// Native lossless single planar optical boundary, not spectral material proof.
struct NativeOpticalInterfaceRun: Encodable {
    let format="env-world-lab-interface-optics"
    let modelVersion="1.0.0"
    let evidence="physics-model-computed"
    let materialEvidence="hypothetical-user-assumed"
    let projectId:String
    let projectRevision:Int
    let firstMaterialId:String
    let secondMaterialId:String
    let firstIndex:Double
    let secondIndex:Double
    let incidentAngleDegrees:Double
    let reflectedAngleDegrees:Double
    let transmittedAngleDegrees:Double?
    let criticalAngleDegrees:Double?
    let sReflectance:Double
    let pReflectance:Double
    let unpolarizedReflectance:Double
    let unpolarizedTransmittance:Double
    let energyResidual:Double
    let totalInternalReflection:Bool
    let validity:String
    var reflectance:Double {unpolarizedReflectance}
    var transmittance:Double {unpolarizedTransmittance}
    var transmittedDegrees:Double? {transmittedAngleDegrees}
}
enum NativeWorldLabOptics {
    static func calculate(_ project:NativeWorldLabProject,firstId:String,
        secondId:String,angleDegrees:Double)throws->NativeOpticalInterfaceRun{
        guard firstId != secondId,
              let a=project.materials.first(where:{$0.id==firstId}),
              let b=project.materials.first(where:{$0.id==secondId}),
              let n1=a.refractiveIndex,let n2=b.refractiveIndex,
              n1.isFinite,n2.isFinite,(1...5).contains(n1),(1...5).contains(n2) else {
            throw NativeWorldLabError.invalid(
                "Select two invented materials with assumed refractive indices.")
        }
        guard angleDegrees.isFinite,(0...89.9).contains(angleDegrees) else{
            throw NativeWorldLabError.invalid("Optical incidence must be 0–89.9 degrees.")
        }
        let rad=angleDegrees*Double.pi/180
        let sinT=n1/n2*sin(rad)
        let total=sinT>1
        var reflectS=1.0,reflectP=1.0
        if !total {
            let ci=cos(rad),ct=sqrt(max(0,1-sinT*sinT))
            reflectS=pow((n1*ci-n2*ct)/(n1*ci+n2*ct),2)
            reflectP=pow((n2*ci-n1*ct)/(n2*ci+n1*ct),2)
        }
        let reflectance=min(1,max(0,(reflectS+reflectP)/2))
        let transmittance=1-reflectance
        return NativeOpticalInterfaceRun(projectId:project.id,
            projectRevision:project.revision,
            firstMaterialId:firstId,secondMaterialId:secondId,
            firstIndex:n1,secondIndex:n2,
            incidentAngleDegrees:angleDegrees,reflectedAngleDegrees:angleDegrees,
            transmittedAngleDegrees:total ? nil : asin(min(1,sinT))*180/Double.pi,
            criticalAngleDegrees:n1>n2 ? asin(n2/n1)*180/Double.pi : nil,
            totalInternalReflection:total,sReflectance:reflectS,
            pReflectance:reflectP,unpolarizedReflectance:reflectance,
            unpolarizedTransmittance:transmittance,
            energyResidual:abs(1-reflectance-transmittance),
            validity:"Lossless planar isotropic nonmagnetic Fresnel/Snell model. "+
                "All refractive indices are invented assumptions, not measurements. "+
                "No absorption, dispersion, interference or real material certification.")
    }
}
