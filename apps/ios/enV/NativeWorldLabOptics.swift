import Foundation

/// Native lossless single planar optical boundary, not spectral material proof.
struct NativeOpticalInterfaceRun {
    let projectId:String
    let projectRevision:Int
    let firstMaterialId:String
    let secondMaterialId:String
    let incidentDegrees:Double
    let transmittedDegrees:Double?
    let criticalDegrees:Double?
    let totalInternalReflection:Bool
    let reflectance:Double
    let transmittance:Double
    let validity:String
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
        var reflectance=1.0
        if !total {
            let ci=cos(rad),ct=sqrt(max(0,1-sinT*sinT))
            let rs=pow((n1*ci-n2*ct)/(n1*ci+n2*ct),2)
            let rp=pow((n2*ci-n1*ct)/(n2*ci+n1*ct),2)
            reflectance=min(1,max(0,(rs+rp)/2))
        }
        return NativeOpticalInterfaceRun(projectId:project.id,
            projectRevision:project.revision,
            firstMaterialId:firstId,secondMaterialId:secondId,
            incidentDegrees:angleDegrees,
            transmittedDegrees:total ? nil : asin(min(1,sinT))*180/Double.pi,
            criticalDegrees:n1>n2 ? asin(n2/n1)*180/Double.pi : nil,
            totalInternalReflection:total,reflectance:reflectance,
            transmittance:1-reflectance,
            validity:"Lossless planar isotropic nonmagnetic Fresnel/Snell model. "+
                "All refractive indices are invented assumptions, not measurements. "+
                "No absorption, dispersion, interference or real material certification.")
    }
}
