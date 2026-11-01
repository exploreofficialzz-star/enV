import Foundation
import SceneKit

enum NativeWorldLabInspectionMode:String,CaseIterable,Identifiable {
    case normal, transparent, xray, cutaway, isolate, exploded
    var id:String { rawValue }
    var title:String {
        switch self {
        case .normal:return "Normal"
        case .transparent:return "See Inside"
        case .xray:return "X-ray style"
        case .cutaway:return "Cutaway"
        case .isolate:return "Isolate"
        case .exploded:return "Exploded"
        }
    }
}
enum NativeWorldLabInspectionAxis:String,CaseIterable,Identifiable {
    case x,y,z
    var id:String { rawValue }
    var index:Int { self == .x ? 0 : self == .y ? 1 : 2 }
}
struct NativeWorldLabInspectionSettings {
    var mode:NativeWorldLabInspectionMode = .normal
    var opacity:Double = 0.32
    var axis:NativeWorldLabInspectionAxis = .x
    var cutawayFraction:Double = 0
    var explosionDistanceMeters:Double = 1
    init(mode:NativeWorldLabInspectionMode = .normal,opacity:Double = 0.32,
         axis:NativeWorldLabInspectionAxis = .x,cutawayFraction:Double = 0,
         explosionDistanceMeters:Double = 1) {
        self.mode=mode;self.opacity=opacity;self.axis=axis
        self.cutawayFraction=cutawayFraction;self.explosionDistanceMeters=explosionDistanceMeters
    }
    func validate() throws {
        guard opacity.isFinite,(0...1).contains(opacity),
              cutawayFraction.isFinite,(-1...1).contains(cutawayFraction),
              explosionDistanceMeters.isFinite,(0...10).contains(explosionDistanceMeters) else {
            throw NativeWorldLabError.invalid("Inspection display settings are outside their safe visual bounds")
        }
    }
}
enum NativeWorldLabInspectionGeometry {
    static func targetIds(project:NativeWorldLabProject,selectedId:String?) -> Set<String> {
        guard let id=selectedId,project.entities.contains(where:{$0.id==id}) else{return []}
        return Set(project.assemblies?.first(where:{$0.entityIds.contains(id)})?.entityIds ?? [id])
    }
    static func isVisible(project:NativeWorldLabProject,selectedId:String?,
                          mode:NativeWorldLabInspectionMode,id:String)->Bool {
        let ids=targetIds(project:project,selectedId:selectedId)
        return mode != .isolate || ids.isEmpty || ids.contains(id)
    }
    static func renderPosition(project:NativeWorldLabProject,selectedId:String?,
        settings:NativeWorldLabInspectionSettings,id:String)->[Double] {
        guard let item=project.entities.first(where:{$0.id==id}) else{return [0,0,0]}
        let ids=targetIds(project:project,selectedId:selectedId)
        guard settings.mode == .exploded,ids.contains(id),settings.explosionDistanceMeters>0 else {
            return item.positionMeters
        }
        let parts=project.entities.filter{ids.contains($0.id)}
        guard parts.count>1 else{return item.positionMeters}
        let centre=(0..<3).map{axis in parts.map{$0.positionMeters[axis]}.reduce(0,+)/Double(parts.count)}
        var delta=(0..<3).map{item.positionMeters[$0]-centre[$0]}
        var norm=sqrt(delta.reduce(0){$0+$1*$1})
        if norm<1e-9 {
            let index=max(0,ids.sorted().firstIndex(of:id) ?? 0)
            let angle=2*Double.pi*Double(index)/Double(parts.count)
            delta=[cos(angle),0,sin(angle)];norm=1
        }
        return (0..<3).map{item.positionMeters[$0]+delta[$0]/norm*settings.explosionDistanceMeters}
    }
    static func planeOffset(project:NativeWorldLabProject,selectedId:String?,
        settings:NativeWorldLabInspectionSettings)->Double? {
        guard settings.mode == .cutaway,
              let item=project.entities.first(where:{$0.id==selectedId}) else{return nil}
        let axis=settings.axis.index
        return item.positionMeters[axis]+item.dimensionsMeters[axis]*0.5*settings.cutawayFraction
    }
    static func clipPolygon(_ polygon:[[Double]],axis:Int,offset:Double)->[[Double]] {
        clipped(polygon,axis:axis,offset:offset).vertices
    }
    private static func clipped(_ polygon:[[Double]],axis:Int,offset:Double)->(vertices:[[Double]],intersections:[[Double]]) {
        guard polygon.count>=3,(0...2).contains(axis),offset.isFinite else{return([],[])}
        var output:[[Double]]=[],crossings:[[Double]]=[]
        for i in polygon.indices {
            let current=polygon[i],previous=polygon[(i+polygon.count-1)%polygon.count]
            guard current.count==3,previous.count==3 else{return([],[])}
            let dc=current[axis]-offset,dp=previous[axis]-offset
            let insideCurrent=dc>= -1e-10,insidePrevious=dp>= -1e-10
            if insideCurrent != insidePrevious {
                let denominator=dp-dc
                if abs(denominator)>1e-14 {
                    let t=min(1,max(0,dp/denominator))
                    let point=(0..<3).map{previous[$0]+(current[$0]-previous[$0])*t}
                    output.append(point);crossings.append(point)
                }
            }
            if insideCurrent {output.append(current)}
        }
        return(output,crossings)
    }
    private static func rotate(_ p:[Double],_ r:[Double])->[Double] {
        let x=p[0],y=p[1],z=p[2]
        let rx=r[0],ry=r[1],rz=r[2]
        let cx=cos(rx),sx=sin(rx),cy=cos(ry),sy=sin(ry),cz=cos(rz),sz=sin(rz)
        return [
            (cy*cz+sy*sx*sz)*x+(-cy*sz+sy*sx*cz)*y+(sy*cx)*z,
            (cx*sz)*x+(cx*cz)*y+(-sx)*z,
            (-sy*cz+cy*sx*sz)*x+(sy*sz+cy*sx*cz)*y+(cy*cx)*z
        ]
    }
    private static func primitive(_ solid:NativeLabSolid)->([[Double]],[[Int]]) {
        let d=solid.dimensionsMeters
        if solid.shape=="sphere" {
            let lat=16,lon=32,r=d[0]/2
            var v=[[0.0,r,0.0]]
            for i in 1..<lat {
                let phi=Double.pi*Double(i)/Double(lat)
                for j in 0..<lon {
                    let theta=2*Double.pi*Double(j)/Double(lon)
                    v.append([r*sin(phi)*cos(theta),r*cos(phi),r*sin(phi)*sin(theta)])
                }
            }
            let south=v.count;v.append([0,-r,0])
            var t=[[Int]]()
            for j in 0..<lon {t.append([0,1+j,1+(j+1)%lon])}
            for ring in 0..<(lat-2) {for j in 0..<lon {
                let a=1+ring*lon+j,b=1+ring*lon+(j+1)%lon
                let c=1+(ring+1)*lon+(j+1)%lon,e=1+(ring+1)*lon+j
                t.append([a,b,c]);t.append([a,c,e])
            }}
            let last=1+(lat-2)*lon
            for j in 0..<lon {t.append([last+j,south,last+(j+1)%lon])}
            return(v,t)
        }
        if solid.shape=="cylinder" {
            let segments=32,r=d[0]/2,h=d[1]/2
            var v=[[0.0,h,0.0],[0.0,-h,0.0]]
            for j in 0..<segments {let a=2*Double.pi*Double(j)/Double(segments);v.append([r*cos(a),h,r*sin(a)])}
            for j in 0..<segments {let a=2*Double.pi*Double(j)/Double(segments);v.append([r*cos(a),-h,r*sin(a)])}
            var t=[[Int]]()
            for j in 0..<segments {
                let n=(j+1)%segments,top=2+j,topN=2+n,bottom=2+segments+j,bottomN=2+segments+n
                t.append([0,topN,top]);t.append([1,bottom,bottomN])
                t.append([top,bottom,topN]);t.append([topN,bottom,bottomN])
            }
            return(v,t)
        }
        let hx=d[0]/2,hy=d[1]/2,hz=d[2]/2
        let v=[[-hx,-hy,-hz],[hx,-hy,-hz],[hx,hy,-hz],[-hx,hy,-hz],
               [-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz]]
        let faces=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]]
        let t=faces.flatMap{f in [[f[0],f[1],f[2]],[f[0],f[2],f[3]]]}
        return(v,t)
    }
    static func makeCutawayGeometry(_ solid:NativeLabSolid,axis:Int,offset:Double)->SCNGeometry {
        let (local,triangles)=primitive(solid)
        let centre=solid.positionMeters,rotation=solid.effectiveRotationRadians
        let world=local.map{p->[Double] in let q=rotate(p,rotation);return [q[0]+centre[0],q[1]+centre[1],q[2]+centre[2]]}
        var vertices=[SCNVector3](),normals=[SCNVector3](),indices=[Int32](),intersections=[[Double]]()
        func addTriangle(_ a:[Double],_ b:[Double],_ c:[Double]) {
            let ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2]
            let vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2]
            let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx
            let length=sqrt(nx*nx+ny*ny+nz*nz)
            guard length>1e-14,length.isFinite else{return}
            let normal=SCNVector3(Float(nx/length),Float(ny/length),Float(nz/length))
            for p in [a,b,c] {
                vertices.append(SCNVector3(Float(p[0]),Float(p[1]),Float(p[2])))
                normals.append(normal);indices.append(Int32(indices.count))
            }
        }
        for tri in triangles {
            let result=clipped(tri.map{world[$0]},axis:axis,offset:offset)
            intersections.append(contentsOf:result.intersections)
            guard result.vertices.count>=3 else{continue}
            for i in 1..<(result.vertices.count-1) {
                addTriangle(result.vertices[0],result.vertices[i],result.vertices[i+1])
            }
        }
        var unique=[[Double]](),keys=Set<String>()
        for point in intersections {
            let key=point.map{String(Int64(($0*1e7).rounded()))}.joined(separator:":")
            if keys.insert(key).inserted{unique.append(point)}
        }
        if unique.count>=3 {
            let centrePoint=(0..<3).map{axisIndex in unique.map{$0[axisIndex]}.reduce(0,+)/Double(unique.count)}
            let planeAxes=axis==0 ? [1,2] : axis==1 ? [2,0] : [0,1]
            unique.sort{a,b in
                atan2(a[planeAxes[1]]-centrePoint[planeAxes[1]],a[planeAxes[0]]-centrePoint[planeAxes[0]]) <
                atan2(b[planeAxes[1]]-centrePoint[planeAxes[1]],b[planeAxes[0]]-centrePoint[planeAxes[0]])
            }
            for i in unique.indices {addTriangle(centrePoint,unique[i],unique[(i+1)%unique.count])}
        }
        let source=SCNGeometrySource(vertices:vertices)
        let normalSource=SCNGeometrySource(normals:normals)
        let element=SCNGeometryElement(indices:indices,primitiveType:.triangles)
        let geometry=SCNGeometry(sources:[source,normalSource],elements:[element])
        geometry.firstMaterial?.isDoubleSided=true
        return geometry
    }
}
