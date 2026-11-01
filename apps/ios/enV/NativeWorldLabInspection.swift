import Foundation
import SceneKit

struct NativeWorldLabInspectionPlane {
    let normal:[Double]
    let offset:Double
}

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
struct NativeWorldLabInspectionSettings:Equatable {
    var mode:NativeWorldLabInspectionMode = .normal
    var opacity:Double = 0.32
    var axis:NativeWorldLabInspectionAxis = .x
    var normal:[Double] = [1,0,0]
    var cutawayFraction:Double = 0
    var explosionDistanceMeters:Double = 1
    init(mode:NativeWorldLabInspectionMode = .normal,opacity:Double = 0.32,
         axis:NativeWorldLabInspectionAxis = .x,normal:[Double] = [1,0,0],
         cutawayFraction:Double = 0,explosionDistanceMeters:Double = 1) {
        self.mode=mode;self.opacity=opacity;self.axis=axis;self.normal=normal
        self.cutawayFraction=cutawayFraction;self.explosionDistanceMeters=explosionDistanceMeters
    }
    func validate() throws {
        let normalLength=normal.count==3 ? sqrt(normal.reduce(0){$0+$1*$1}) : 0
        guard opacity.isFinite,(0...1).contains(opacity),
              normal.count==3,normal.allSatisfy({$0.isFinite && abs($0)<=1}),
              normalLength.isFinite,normalLength>1e-9,
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
    static func plane(project:NativeWorldLabProject,selectedId:String?,
        settings:NativeWorldLabInspectionSettings)->NativeWorldLabInspectionPlane? {
        guard settings.mode == .cutaway,
              let item=project.entities.first(where:{$0.id==selectedId}),
              settings.normal.count==3 else{return nil}
        let length=sqrt(settings.normal.reduce(0){$0+$1*$1})
        guard length.isFinite,length>1e-9 else{return nil}
        let normal=settings.normal.map{$0/length}
        let centreProjection=(0..<3).reduce(0){$0+normal[$1]*item.positionMeters[$1]}
        let projectedHalf=(0..<3).reduce(0){$0+abs(normal[$1])*item.dimensionsMeters[$1]*0.5}
        return NativeWorldLabInspectionPlane(normal:normal,
            offset:centreProjection+projectedHalf*settings.cutawayFraction)
    }
    static func planeOffset(project:NativeWorldLabProject,selectedId:String?,
        settings:NativeWorldLabInspectionSettings)->Double? {
        plane(project:project,selectedId:selectedId,settings:settings)?.offset
    }
    static func clipPolygon(_ polygon:[[Double]],axis:Int,offset:Double)->[[Double]] {
        guard (0...2).contains(axis) else{return []}
        var normal=[0.0,0.0,0.0];normal[axis]=1
        return clipPolygon(polygon,normal:normal,offset:offset)
    }
    static func clipPolygon(_ polygon:[[Double]],normal:[Double],offset:Double)->[[Double]] {
        clipped(polygon,normal:normal,offset:offset).vertices
    }
    private static func clipped(_ polygon:[[Double]],normal:[Double],offset:Double)->(vertices:[[Double]],intersections:[[Double]]) {
        guard polygon.count>=3,normal.count==3,normal.allSatisfy({$0.isFinite}),
              sqrt(normal.reduce(0){$0+$1*$1})>1e-9,offset.isFinite else{return([],[])}
        var output:[[Double]]=[],crossings:[[Double]]=[]
        for i in polygon.indices {
            let current=polygon[i],previous=polygon[(i+polygon.count-1)%polygon.count]
            guard current.count==3,previous.count==3 else{return([],[])}
            let dc=(0..<3).reduce(-offset){$0+current[$1]*normal[$1]}
            let dp=(0..<3).reduce(-offset){$0+previous[$1]*normal[$1]}
            let insideCurrent = dc >= (-1.0e-10)
            let insidePrevious = dp >= (-1.0e-10)
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
        guard (0...2).contains(axis) else{return SCNGeometry()}
        var normal=[0.0,0.0,0.0];normal[axis]=1
        return makeCutawayGeometry(solid,normal:normal,offset:offset)
    }
    static func makeCutawayGeometry(_ solid:NativeLabSolid,normal:[Double],offset:Double)->SCNGeometry {
        guard normal.count==3,normal.allSatisfy({$0.isFinite}),offset.isFinite else{return SCNGeometry()}
        let normalLength=sqrt(normal.reduce(0){$0+$1*$1})
        guard normalLength>1e-9 else{return SCNGeometry()}
        let n=normal.map{$0/normalLength}
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
            let result=clipped(tri.map{world[$0]},normal:n,offset:offset)
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
            let reference=abs(n[0])<0.9 ? [1.0,0.0,0.0] : [0.0,1.0,0.0]
            let crossU=[
                n[1]*reference[2]-n[2]*reference[1],
                n[2]*reference[0]-n[0]*reference[2],
                n[0]*reference[1]-n[1]*reference[0]
            ]
            let crossLength=sqrt(crossU.reduce(0){$0+$1*$1})
            let basisU=crossU.map{$0/crossLength}
            let basisV=[
                n[1]*basisU[2]-n[2]*basisU[1],
                n[2]*basisU[0]-n[0]*basisU[2],
                n[0]*basisU[1]-n[1]*basisU[0]
            ]
            func planeAngle(_ point:[Double])->Double {
                let relative=(0..<3).map{point[$0]-centrePoint[$0]}
                let u=(0..<3).reduce(0){$0+relative[$1]*basisU[$1]}
                let v=(0..<3).reduce(0){$0+relative[$1]*basisV[$1]}
                return atan2(v,u)
            }
            unique.sort{planeAngle($0)<planeAngle($1)}
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


/// Bounded reversible inspection state, separate from invention-edit history.
struct NativeWorldLabInspectionHistory {
    private(set) var past:[NativeWorldLabInspectionSettings]=[]
    private(set) var present=NativeWorldLabInspectionSettings()
    private(set) var future:[NativeWorldLabInspectionSettings]=[]
    static let limit=50
    init(present:NativeWorldLabInspectionSettings = NativeWorldLabInspectionSettings()) {
        self.present=present
    }
    mutating func commit(_ next:NativeWorldLabInspectionSettings)throws {
        try next.validate()
        guard next != present else{return}
        past.append(present)
        if past.count>Self.limit { past.removeFirst(past.count-Self.limit) }
        present=next
        future.removeAll(keepingCapacity:true)
    }
    @discardableResult mutating func undo()->NativeWorldLabInspectionSettings? {
        guard let previous=past.popLast() else{return nil}
        future.insert(present,at:0)
        if future.count>Self.limit { future.removeLast(future.count-Self.limit) }
        present=previous
        return present
    }
    @discardableResult mutating func redo()->NativeWorldLabInspectionSettings? {
        guard !future.isEmpty else{return nil}
        let next=future.removeFirst()
        past.append(present)
        if past.count>Self.limit { past.removeFirst(past.count-Self.limit) }
        present=next
        return present
    }
}
