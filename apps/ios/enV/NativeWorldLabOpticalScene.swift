import Foundation

/// Geometric optics through authored boxes/spheres. No web runtime or server.
struct NativeOpticalSceneSegment:Encodable {
    let startMeters:[Double]
    let endMeters:[Double]
    let kind:String
    let entityId:String?
    let travelMeters:Double
    let incidentIndex:Double
    let transmittedIndex:Double?
    let reflectance:Double
    let transmittance:Double
    let survivingRayPowerFraction:Double
}
struct NativeOpticalSceneInput:Encodable {
    let originMeters:[Double]
    let direction:[Double]
    let maximumDistanceMeters:Double
    let maximumInterfaces:Int
}
struct NativeOpticalSceneRay:Encodable {
    let format="env-world-lab-optical-scene-ray"
    let modelVersion="1.0.0"
    let evidence="physics-model-computed"
    let materialEvidence="hypothetical-user-assumed"
    let projectId:String
    let projectRevision:Int
    let input:NativeOpticalSceneInput
    let segments:[NativeOpticalSceneSegment]
    let accountedLostBranchPowerFraction:Double
    let finalPrimaryRayPowerFraction:Double
    let validity="Single geometric primary ray through user-invented " +
        "non-overlapping box/sphere solids with hypothetically assumed " +
        "isotropic, transparent refractive indices and Fresnel/Snell " +
        "boundary behavior. Reflected partial branches are not propagated. " +
        "No measured material identity, absorption, diffraction or " +
        "physical instrument calibration is inferred."
}
enum NativeWorldLabOpticalScene {
    private static let epsilon=1e-6
    private struct Body {
        let id:String
        let shape:String
        let position:[Double]
        let half:[Double]
        let index:Double
    }
    private struct Hit {
        let distance:Double
        let normal:[Double]
    }
    private static func add(_ a:[Double],_ b:[Double])->[Double]{
        zip(a,b).map(+)
    }
    private static func sub(_ a:[Double],_ b:[Double])->[Double]{
        zip(a,b).map(-)
    }
    private static func scaled(_ a:[Double],_ factor:Double)->[Double]{
        a.map{$0*factor}
    }
    private static func dot(_ a:[Double],_ b:[Double])->Double{
        zip(a,b).reduce(0){$0+$1.0*$1.1}
    }
    private static func unit(_ input:[Double])throws->[Double]{
        let magnitude=sqrt(dot(input,input))
        guard magnitude.isFinite,magnitude>=1e-12 else {
            throw NativeWorldLabError.invalid("Optical ray direction must be nonzero.")
        }
        return scaled(input,1/magnitude)
    }
    private static func bounded(_ a:[Double])->Bool{
        a.count==3&&a.allSatisfy{$0.isFinite&&abs($0)<=100000}
    }
    private static func inside(_ a:[Double],_ b:Body)->Bool{
        let diff=sub(a,b.position)
        if b.shape=="sphere" {return sqrt(dot(diff,diff))<b.half[0]-epsilon}
        return zip(diff,b.half).allSatisfy{abs($0.0)<$0.1-epsilon}
    }
    private static func intersect(_ origin:[Double],_ direction:[Double],
        _ body:Body)throws->Hit?{
        if body.shape=="sphere"{
            let diff=sub(origin,body.position)
            let projected=dot(diff,direction)
            let disc=projected*projected-dot(diff,diff)+pow(body.half[0],2)
            if disc<0{return nil}
            let root=sqrt(disc)
            var t = -projected-root
            if t<=epsilon{t = -projected+root}
            if t<=epsilon{return nil}
            return Hit(distance:t,normal:try unit(
                sub(add(origin,scaled(direction,t)),body.position)))
        }
        var entry = -Double.infinity
        var exit = Double.infinity
        var entryNormal=[0.0,0.0,0.0]
        var exitNormal=[0.0,0.0,0.0]
        for axis in 0..<3{
            let lo=body.position[axis]-body.half[axis]
            let hi=body.position[axis]+body.half[axis]
            let component=direction[axis]
            if abs(component)<1e-12{
                if origin[axis]<lo||origin[axis]>hi{return nil}
                continue
            }
            var near=(lo-origin[axis])/component
            var far=(hi-origin[axis])/component
            var sign = -1.0
            if near>far {swap(&near,&far);sign = 1}
            if near>entry{
                entry=near
                entryNormal=[0,0,0];entryNormal[axis]=sign
            }
            if far<exit{
                exit=far
                exitNormal=[0,0,0];exitNormal[axis] = -sign
            }
            if entry>exit{return nil}
        }
        if exit<=epsilon{return nil}
        return entry>epsilon ?
            Hit(distance:entry,normal:entryNormal):
            Hit(distance:exit,normal:exitNormal)
    }
    static func trace(_ project:NativeWorldLabProject,
        input:NativeOpticalSceneInput)throws->NativeOpticalSceneRay{
        guard bounded(input.originMeters),bounded(input.direction),
            input.maximumDistanceMeters.isFinite,
            (0.1...1000).contains(input.maximumDistanceMeters),
            (1...16).contains(input.maximumInterfaces) else {
            throw NativeWorldLabError.invalid("Ray path and event budget exceed native limits.")
        }
        let bodies:[Body]=project.entities.compactMap{entity in
            guard entity.scientificRole=="reference-solid",
                ["box","sphere"].contains(entity.shape),
                let material=project.materials.first(where:{$0.id==entity.materialId}),
                let index=material.refractiveIndex else{return nil}
            return Body(id:entity.id,shape:entity.shape,
                position:entity.positionMeters,
                half:entity.dimensionsMeters.map{$0/2},index:index)
        }
        guard (1...40).contains(bodies.count) else{
            throw NativeWorldLabError.invalid("Invent 1–40 indexed box/sphere solids.")
        }
        guard !bodies.contains(where:{inside(input.originMeters,$0)}) else{
            throw NativeWorldLabError.invalid("Start optical rays outside all solids.")
        }
        var origin=input.originMeters
        var direction=try unit(input.direction)
        var medium:String?
        var travelled=0.0,power=1.0,discarded=0.0
        var segments:[NativeOpticalSceneSegment]=[]
        for step in 0...input.maximumInterfaces{
            let remaining=input.maximumDistanceMeters-travelled
            if remaining<=epsilon{break}
            var collisions:[(Body,Hit)]=[]
            for body in bodies{
                if let hit=try intersect(origin,direction,body),
                    hit.distance<=remaining+epsilon{
                    collisions.append((body,hit))
                }
            }
            collisions.sort{$0.1.distance<$1.1.distance}
            if collisions.isEmpty{
                segments.append(NativeOpticalSceneSegment(
                    startMeters:origin,endMeters:add(origin,scaled(direction,remaining)),
                    kind:"escaped",entityId:nil,travelMeters:remaining,
                    incidentIndex:medium.flatMap{id in
                        bodies.first(where:{$0.id==id})?.index} ?? 1,
                    transmittedIndex:nil,reflectance:0,transmittance:1,
                    survivingRayPowerFraction:power))
                break
            }
            if collisions.count>1 &&
                abs(collisions[0].1.distance-collisions[1].1.distance)<1e-7 {
                throw NativeWorldLabError.invalid("Ambiguous simultaneous optical surfaces.")
            }
            let (body,hit)=collisions[0]
            guard medium==nil||medium==body.id else{
                throw NativeWorldLabError.invalid("Nested/overlapping solids are unsupported.")
            }
            let entering=dot(direction,hit.normal)<0
            guard (entering&&medium==nil)||(!entering&&medium==body.id) else{
                throw NativeWorldLabError.invalid("Ambiguous optical medium transition.")
            }
            let n1=entering ? 1.0 : body.index
            let n2=entering ? body.index : 1.0
            let normal=entering ? hit.normal : scaled(hit.normal,-1)
            let cosI=max(0,-dot(direction,normal))
            let ratio=n1/n2
            let k=1-ratio*ratio*(1-cosI*cosI)
            let total=k<0
            let cosT=total ? 0 : sqrt(max(0,k))
            let rs=total ? 1 : pow((n1*cosI-n2*cosT)/(n1*cosI+n2*cosT),2)
            let rp=total ? 1 : pow((n2*cosI-n1*cosT)/(n2*cosI+n1*cosT),2)
            let reflectance=min(1,max(0,(rs+rp)/2))
            let transmittance=1-reflectance
            let old=power
            if !total {power*=transmittance;discarded+=old*reflectance}
            let end=add(origin,scaled(direction,hit.distance))
            segments.append(NativeOpticalSceneSegment(startMeters:origin,
                endMeters:end,kind:total ?
                    "total-internal-reflection":"transmitted",
                entityId:body.id,travelMeters:hit.distance,
                incidentIndex:n1,transmittedIndex:total ? nil : n2,
                reflectance:reflectance,transmittance:transmittance,
                survivingRayPowerFraction:power))
            travelled+=hit.distance
            direction=try unit(total ?
                add(direction,scaled(normal,2*cosI)):
                add(scaled(direction,ratio),scaled(normal,ratio*cosI-cosT)))
            if !total {medium=entering ? body.id : nil}
            origin=add(end,scaled(direction,2*epsilon))
            if step==input.maximumInterfaces{
                segments.append(NativeOpticalSceneSegment(startMeters:end,
                    endMeters:end,kind:"limit",entityId:nil,
                    travelMeters:0,incidentIndex:total ? n1 : n2,
                    transmittedIndex:nil,reflectance:0,transmittance:1,
                    survivingRayPowerFraction:power))
            }
        }
        guard !segments.isEmpty,segments.allSatisfy({
            bounded($0.endMeters)&&$0.survivingRayPowerFraction.isFinite&&
            (0...1).contains($0.survivingRayPowerFraction)
        })else{
            throw NativeWorldLabError.invalid("Optical trace left the finite native domain.")
        }
        return NativeOpticalSceneRay(projectId:project.id,
            projectRevision:project.revision,input:input,
            segments:segments,accountedLostBranchPowerFraction:discarded,
            finalPrimaryRayPowerFraction:power)
    }
}
