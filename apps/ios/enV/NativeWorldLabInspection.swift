import Foundation
import SceneKit
import CoreFoundation

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


// MARK: - Recorded scientific field layers (native scalar/vector/tensor interchange)

enum NativeWorldLabFieldKind:String { case scalar,vector,tensor }
enum NativeWorldLabFieldPlane:String,CaseIterable,Identifiable {
    case xy,xz,yz
    var id:String {rawValue}
    var axes:(u:Int,v:Int,normal:Int) {
        switch self {
        case .xy:return (0,1,2)
        case .xz:return (0,2,1)
        case .yz:return (1,2,0)
        }
    }
}
struct NativeWorldLabFieldCell:Equatable {
    let uIndex:Int
    let vIndex:Int
    let components:[Double?]
}
struct NativeWorldLabFieldSliceFrame:Equatable {
    let sampleTimeSeconds:Double
    let sampleIndex:Int
    let plane:NativeWorldLabFieldPlane
    let sliceIndex:Int
    let dimensionU:Int
    let dimensionV:Int
    let cells:[NativeWorldLabFieldCell]
}
struct NativeWorldLabFieldVectorPoint:Equatable {
    let u:Double
    let v:Double
}
struct NativeWorldLabFieldStreamlineFrame:Equatable {
    let sampleTimeSeconds:Double
    let sampleIndex:Int
    let plane:NativeWorldLabFieldPlane
    let sliceIndex:Int
    let paths:[[NativeWorldLabFieldVectorPoint]]
}
struct NativeWorldLabFieldLayer:Equatable {
    let id:String
    let label:String
    let kind:NativeWorldLabFieldKind
    let siUnits:String
    let displayUnits:String
    let scaleToSI:Double
    let offsetToSI:Double
    let spatialFrame:String
    let crs:String
    let originMeters:[Double]
    let worldDateUTC:String
    let sampleTimesSeconds:[Double]
    let timezoneDisplay:String
    let sourceDescription:String
    let calibrationStatus:String
    let calibrationMethod:String
    let dimensions:[Int]
    let spacingMeters:[Double]
    let interpolationMethod:String
    let interpolationValidated:Bool
    let mask:[Bool]?
    let values:[Double?]
    let minimumSI:Double
    let maximumSI:Double
    let permissionsScope:String
    let readRoles:Set<String>
    let exportAllowed:Bool
    let rendererKind:String
    let rendererImplementationId:String
    let legendTitle:String
    let accessibleDescription:String
    let validity:String

    var cellCount:Int { dimensions[0]*dimensions[1]*dimensions[2] }
    var componentCount:Int {
        switch kind {case .scalar:return 1;case .vector:return 3;case .tensor:return 9}
    }
    func nearestSampleIndex(_ timeSeconds:Double)throws->Int {
        guard timeSeconds.isFinite,timeSeconds>=0 else {
            throw NativeWorldLabError.invalid("Field sample time must be finite and non-negative.")
        }
        var best=0,distance=Double.infinity
        for (index,value) in sampleTimesSeconds.enumerated() {
            let next=abs(value-timeSeconds)
            if next<distance {best=index;distance=next}
        }
        return best
    }
    private func cellIndex(_ x:Int,_ y:Int,_ z:Int)->Int {
        x+dimensions[0]*(y+dimensions[1]*z)
    }
    private func recordedValues(_ sampleIndex:Int)->[Double?] {
        let count=cellCount*componentCount
        let start=sampleIndex*count
        return Array(values[start..<(start+count)])
    }
    private func extractSlice(_ timeSeconds:Double,_ plane:NativeWorldLabFieldPlane,
        _ requestedSlice:Int)throws->NativeWorldLabFieldSliceFrame {
        let axes=plane.axes
        guard requestedSlice>=0,requestedSlice<dimensions[axes.normal] else {
            throw NativeWorldLabError.invalid("Field slice index is outside the grid resolution.")
        }
        let sampleIndex=try nearestSampleIndex(timeSeconds)
        let frame=recordedValues(sampleIndex)
        var cells:[NativeWorldLabFieldCell]=[]
        cells.reserveCapacity(dimensions[axes.u]*dimensions[axes.v])
        for v in 0..<dimensions[axes.v] {
            for u in 0..<dimensions[axes.u] {
                var c=[0,0,0]
                c[axes.u]=u;c[axes.v]=v;c[axes.normal]=requestedSlice
                let start=cellIndex(c[0],c[1],c[2])*componentCount
                cells.append(NativeWorldLabFieldCell(uIndex:u,vIndex:v,
                    components:Array(frame[start..<(start+componentCount)])))
            }
        }
        return NativeWorldLabFieldSliceFrame(sampleTimeSeconds:sampleTimesSeconds[sampleIndex],
            sampleIndex:sampleIndex,plane:plane,sliceIndex:requestedSlice,
            dimensionU:dimensions[axes.u],dimensionV:dimensions[axes.v],cells:cells)
    }
    func scalarSlice(_ timeSeconds:Double,plane:NativeWorldLabFieldPlane = .xy,
        sliceIndex:Int?=nil)throws->NativeWorldLabFieldSliceFrame {
        guard kind == .scalar,rendererKind=="slice" else {
            throw NativeWorldLabError.invalid("Scalar slices require a scalar field with the slice renderer.")
        }
        return try extractSlice(timeSeconds,plane,sliceIndex ?? (dimensions[plane.axes.normal]-1)/2)
    }
    func tensorSlice(_ timeSeconds:Double,component:Int,plane:NativeWorldLabFieldPlane = .xy,
        sliceIndex:Int?=nil)throws->NativeWorldLabFieldSliceFrame {
        guard kind == .tensor,rendererKind=="slice" else {
            throw NativeWorldLabError.invalid("Tensor slices require a tensor field with the slice renderer.")
        }
        guard (0...8).contains(component) else {
            throw NativeWorldLabError.invalid("Tensor component must be between 0 and 8.")
        }
        return try extractSlice(timeSeconds,plane,sliceIndex ?? (dimensions[plane.axes.normal]-1)/2)
    }
    func vectorGlyphs(_ timeSeconds:Double,plane:NativeWorldLabFieldPlane = .xy,
        sliceIndex:Int?=nil)throws->NativeWorldLabFieldSliceFrame {
        guard kind == .vector,rendererKind=="glyphs" else {
            throw NativeWorldLabError.invalid("Vector glyphs require the vector glyph renderer.")
        }
        return try extractSlice(timeSeconds,plane,sliceIndex ?? (dimensions[plane.axes.normal]-1)/2)
    }
    func vectorStreamlines(_ timeSeconds:Double,plane:NativeWorldLabFieldPlane = .xy,
        sliceIndex:Int?=nil)throws->NativeWorldLabFieldStreamlineFrame {
        guard kind == .vector,rendererKind=="streamlines" else {
            throw NativeWorldLabError.invalid("Vector streamlines require the vector streamline renderer.")
        }
        guard interpolationMethod=="linear",interpolationValidated else {
            throw NativeWorldLabError.invalid("Streamlines require validated linear interpolation.")
        }
        let slice=sliceIndex ?? (dimensions[plane.axes.normal]-1)/2
        let grid=try extractSlice(timeSeconds,plane,slice)
        let width=grid.dimensionU,height=grid.dimensionV
        func vector(_ u:Double,_ v:Double)->(Double,Double)? {
            guard u>=0,v>=0,u<=Double(width-1),v<=Double(height-1) else{return nil}
            let x0=Int(floor(u)),y0=Int(floor(v))
            let x1=min(x0+1,width-1),y1=min(y0+1,height-1)
            let fu=u-Double(x0),fv=v-Double(y0)
            func comp(_ x:Int,_ y:Int,_ component:Int)->Double? {
                let cell=grid.cells[y*width+x]
                return cell.components[component]
            }
            func bilinear(_ component:Int)->Double? {
                guard let a=comp(x0,y0,component),let b=comp(x1,y0,component),
                      let c=comp(x0,y1,component),let d=comp(x1,y1,component) else{return nil}
                return (1-fv)*((1-fu)*a+fu*b)+fv*((1-fu)*c+fu*d)
            }
            guard let uValue=bilinear(plane.axes.u),let vValue=bilinear(plane.axes.v) else{return nil}
            return (uValue,vValue)
        }
        func direction(_ u:Double,_ v:Double)->(Double,Double)? {
            guard let raw=vector(u,v) else{return nil}
            let length=hypot(raw.0,raw.1)
            guard length.isFinite,length>1e-12 else{return nil}
            return (raw.0/length,raw.1/length)
        }
        var paths:[[NativeWorldLabFieldVectorPoint]]=[]
        for seedIndex in 1...7 {
            var u=Double(max(0,width-1))*Double(seedIndex)/8
            var v=Double(max(0,height-1))*0.05
            var points:[NativeWorldLabFieldVectorPoint]=[]
            for _ in 0...120 {
                guard u>=0,v>=0,u<=Double(width-1),v<=Double(height-1) else{break}
                points.append(NativeWorldLabFieldVectorPoint(
                    u:width<=1 ? 0 : u/Double(width-1),
                    v:height<=1 ? 0 : v/Double(height-1)))
                guard let k1=direction(u,v),
                      let k2=direction(u+k1.0*0.1,v+k1.1*0.1) else{break}
                let nextU=u+k2.0*0.2,nextV=v+k2.1*0.2
                if abs(nextU-u)+abs(nextV-v)<1e-8 {break}
                u=nextU;v=nextV
            }
            if points.count>=2 {paths.append(points)}
        }
        return NativeWorldLabFieldStreamlineFrame(sampleTimeSeconds:grid.sampleTimeSeconds,
            sampleIndex:grid.sampleIndex,plane:plane,sliceIndex:slice,paths:paths)
    }
}

enum NativeWorldLabFieldLayerCodec {
    static let maxBytes=16*1024*1024
    private static let maxCells=100_000
    private static let maxValues=2_000_000
    private static func object(_ value:Any?,_ label:String)throws->[String:Any] {
        guard let result=value as? [String:Any] else {
            throw NativeWorldLabError.invalid("Field layer (label) must be an object.")
        }
        return result
    }
    private static func string(_ object:[String:Any],_ key:String,_ max:Int=1000)throws->String {
        guard let value=object[key] as? String,!value.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
              value.count<=max else {
            throw NativeWorldLabError.invalid("Field layer field '(key)' is missing or too long.")
        }
        return value
    }
    private static func number(_ value:Any?,_ label:String)throws->Double {
        guard let value=value as? NSNumber,CFGetTypeID(value) != CFBooleanGetTypeID() else {
            throw NativeWorldLabError.invalid("Field layer (label) must be a finite number.")
        }
        let result=value.doubleValue
        guard result.isFinite else {throw NativeWorldLabError.invalid("Field layer (label) must be finite.")}
        return result
    }
    private static func numbers(_ value:Any?,_ count:Int,_ label:String)throws->[Double] {
        guard let values=value as? [Any],values.count==count else {
            throw NativeWorldLabError.invalid("Field layer (label) must contain (count) values.")
        }
        return try values.map{try number($0,label)}
    }
    private static func utc(_ value:String)->Bool {
        guard value.hasSuffix("Z") else{return false}
        let formatter=ISO8601DateFormatter()
        formatter.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        if formatter.date(from:value) != nil{return true}
        formatter.formatOptions=[.withInternetDateTime]
        return formatter.date(from:value) != nil
    }
    static func decode(_ data:Data,principalRoles:Set<String>=[])throws->NativeWorldLabFieldLayer {
        guard !data.isEmpty,data.count<=maxBytes else {
            throw NativeWorldLabError.invalid("Field layer JSON must be between 1 byte and 16 MB.")
        }
        guard let root=try JSONSerialization.jsonObject(with:data) as? [String:Any],
              (root["schemaVersion"] as? NSNumber)?.intValue==1 else {
            throw NativeWorldLabError.invalid("Unsupported or malformed field-layer schema.")
        }
        let id=try string(root,"id",120),label=try string(root,"label",240)
        guard let kind=NativeWorldLabFieldKind(rawValue:try string(root,"kind",20)) else {
            throw NativeWorldLabError.invalid("Native field renderer supports scalar, vector and tensor fields only.")
        }
        let units=try object(root["units"],"units")
        let si=try string(units,"si",80),display=try string(units,"display",80)
        let scale=try number(units["scaleToSI"],"unit scale"),offset=try number(units["offsetToSI"],"unit offset")
        guard scale>0 else {throw NativeWorldLabError.invalid("Field unit scale must be positive.")}
        let spatial=try object(root["spatialReference"],"spatial reference")
        let frame=try string(spatial,"frame",30),crs=try string(spatial,"crs",120)
        guard ["LOCAL_ENU","WGS84","EPSG"].contains(frame) else {
            throw NativeWorldLabError.invalid("Unsupported field spatial reference.")
        }
        let origin=try numbers(spatial["originMeters"],3,"origin")
        guard let axes=spatial["axisOrder"] as? [String],axes==["x","y","z"] else {
            throw NativeWorldLabError.invalid("Field coordinate axes must use x,y,z order.")
        }
        let time=try object(root["timeReference"],"time reference")
        guard ["simulation","UTC"].contains(time["kind"] as? String ?? "") else {
            throw NativeWorldLabError.invalid("Unknown field time reference.")
        }
        let worldDate=try string(time,"worldDateUTC",64)
        guard utc(worldDate),let timezone=time["timezoneDisplay"] as? String,timezone.count<=120,
              let sampleRaw=time["sampleTimesSeconds"] as? [Any],!sampleRaw.isEmpty,sampleRaw.count<=100_000 else {
            throw NativeWorldLabError.invalid("Field timeline or timezone is invalid.")
        }
        let samples=try sampleRaw.map{try number($0,"sample time")}
        guard samples.first!>=0,samples.enumerated().allSatisfy({$0.offset==0 || $0.element>samples[$0.offset-1]}) else {
            throw NativeWorldLabError.invalid("Field sample times must be non-negative and strictly increasing.")
        }
        for key in ["acquiredAtUTC","validFromUTC","validToUTC"] {
            if let value=time[key],!(value is NSNull) {
                guard let text=value as? String,utc(text) else {
                    throw NativeWorldLabError.invalid("Field timestamp \\(key) must be UTC.")
                }
            }
        }
        let source=try object(root["source"],"source")
        let sourceDescription:String
        switch source["kind"] as? String {
        case "solver":
            let run=try string(source,"runId",120),model=try string(source,"modelId",120)
            let version=try string(source,"modelVersion",40)
            guard version.range(of:"^\\d+\\.\\d+\\.\\d+$",options:.regularExpression) != nil,
                  source["evidence"] as? String=="physics-model-computed",
                  source["inputEvidence"] as? String=="hypothetical-user-assumed" else {
                throw NativeWorldLabError.invalid("Computed field provenance needs a versioned solver and input evidence.")
            }
            sourceDescription="Solver \\(model) v\\(version) · run \\(run)"
        case "dataset":
            let provider=try string(source,"provider",240),dataset=try string(source,"datasetId",240)
            let version=try string(source,"datasetVersion",120),license=try string(source,"license",240)
            let retrieved=try string(source,"retrievedAtUTC",64)
            guard utc(retrieved),["measured-observed","forecast"].contains(source["evidence"] as? String ?? "") else {
                throw NativeWorldLabError.invalid("Dataset provenance needs UTC retrieval and an evidence type.")
            }
            sourceDescription="Dataset \\(provider) · \\(dataset) v\\(version) · \\(license)"
        default:
            throw NativeWorldLabError.invalid("Field source provenance is missing.")
        }
        let calibration=try object(root["calibration"],"calibration")
        let calibrationStatus=try string(calibration,"status",30)
        guard ["calibrated","uncalibrated","not-applicable"].contains(calibrationStatus) else {
            throw NativeWorldLabError.invalid("Field calibration status is invalid.")
        }
        let calibrationMethod=try string(calibration,"method",500)
        let resolution=try object(root["resolution"],"resolution")
        guard let dimRaw=resolution["dimensions"] as? [Any],dimRaw.count==3 else {
            throw NativeWorldLabError.invalid("Field dimensions must have three axes.")
        }
        let dimensionValues=try dimRaw.map{try number($0,"grid dimension")}
        guard dimensionValues.allSatisfy({$0.rounded()==$0 && $0>0 && $0<=maxCells}) else {
            throw NativeWorldLabError.invalid("Field dimensions are outside the native grid limits.")
        }
        let dimensions=dimensionValues.map{Int($0)}
        let cellCount=dimensions.reduce(1,*)
        guard cellCount<=maxCells,(resolution["sampleCount"] as? NSNumber)?.intValue==cellCount else {
            throw NativeWorldLabError.invalid("Field cell count does not match the grid dimensions.")
        }
        let spacing=try numbers(resolution["spacingMeters"],3,"grid spacing")
        guard spacing.allSatisfy({$0>=0}) else {throw NativeWorldLabError.invalid("Field grid spacing cannot be negative.")}
        let interpolation=try object(root["interpolation"],"interpolation")
        let interpolationMethod=try string(interpolation,"method",20)
        guard ["none","nearest","linear"].contains(interpolationMethod),
              let validated=interpolation["validated"] as? Bool,
              (interpolation["notes"] as? String)?.isEmpty==false,
              interpolationMethod != "linear" || validated else {
            throw NativeWorldLabError.invalid("Field interpolation is unsupported or not validated.")
        }
        let renderer=try object(root["renderer"],"renderer")
        let rendererKind=try string(renderer,"kind",20)
        let implementation=try string(renderer,"implementationId",120)
        let supported=(kind == .scalar && rendererKind=="slice") ||
            (kind == .vector && (rendererKind=="glyphs" || rendererKind=="streamlines")) ||
            (kind == .tensor && rendererKind=="slice")
        guard supported else {throw NativeWorldLabError.invalid("Native field renderer does not implement this kind/renderer pair.")}
        if rendererKind=="streamlines" && (interpolationMethod != "linear" || !validated) {
            throw NativeWorldLabError.invalid("Vector streamlines need validated linear interpolation.")
        }
        let components=kind == .scalar ? 1 : kind == .vector ? 3 : 9
        let expected=samples.count*cellCount*components
        guard expected<=maxValues,let valuesRaw=root["values"] as? [Any],valuesRaw.count==expected else {
            throw NativeWorldLabError.invalid("Field data length exceeds native limits or does not match the grid.")
        }
        let mask:[Bool]?
        if let rawMask=root["mask"],!(rawMask is NSNull) {
            guard let values=rawMask as? [Any],values.count==expected else {
                throw NativeWorldLabError.invalid("Field no-data mask has the wrong length.")
            }
            mask=try values.map { value in
                guard let flag=value as? NSNumber,CFGetTypeID(flag)==CFBooleanGetTypeID() else {
                    throw NativeWorldLabError.invalid("Field no-data mask must contain booleans.")
                }
                return flag.boolValue
            }
        } else {mask=nil}
        var values:[Double?]=[]
        values.reserveCapacity(expected)
        for index in 0..<expected {
            if mask == nil || mask![index] {
                values.append(try number(valuesRaw[index],"field value"))
            } else {
                guard valuesRaw[index] is NSNull else {
                    throw NativeWorldLabError.invalid("Masked field cells must be JSON null.")
                }
                values.append(nil)
            }
        }
        let range=try object(root["range"],"range")
        let minimum=try number(range["minimumSI"],"minimum range")
        let maximum=try number(range["maximumSI"],"maximum range")
        let scaleKind=try string(range,"scale",20)
        guard minimum<=maximum,["linear","log"].contains(scaleKind),
              (scaleKind != "log" || minimum>0),
              values.compactMap({$0}).allSatisfy({$0>=minimum && $0<=maximum && (scaleKind != "log" || $0>0)}) else {
            throw NativeWorldLabError.invalid("Field values exceed the declared SI range.")
        }
        guard let events=root["events"] as? [Any],events.isEmpty,
              root["network"] is NSNull else {
            throw NativeWorldLabError.invalid("Native dense renderer does not accept event/network layers.")
        }
        let permissions=try object(root["permissions"],"permissions")
        let scope=try string(permissions,"scope",20)
        guard ["private","shared","public"].contains(scope),
              let roleArray=permissions["readRoles"] as? [String] else {
            throw NativeWorldLabError.invalid("Field permissions are invalid.")
        }
        let roles=Set(roleArray)
        switch scope {
        case "private":
            guard principalRoles.contains("owner"),roles.contains("owner") || roles.contains("*") else {
                throw NativeWorldLabError.invalid("Private field layer requires the authenticated owner role.")
            }
        case "shared":
            guard principalRoles.contains(where:{roles.contains($0) || roles.contains("*")}) else {
                throw NativeWorldLabError.invalid("Shared field layer is not readable by this principal.")
            }
        default:break
        }
        let exportAllowed=permissions["exportAllowed"] as? Bool ?? false
        let legend=try object(root["legend"],"legend")
        let legendTitle=try string(legend,"title",240)
        let accessible=try string(legend,"accessibleDescription",1000)
        let validity=try string(root,"validity",1000)
        return NativeWorldLabFieldLayer(id:id,label:label,kind:kind,siUnits:si,displayUnits:display,
            scaleToSI:scale,offsetToSI:offset,spatialFrame:frame,crs:crs,originMeters:origin,
            worldDateUTC:worldDate,sampleTimesSeconds:samples,timezoneDisplay:timezone,
            sourceDescription:sourceDescription,calibrationStatus:calibrationStatus,
            calibrationMethod:calibrationMethod,dimensions:dimensions,spacingMeters:spacing,
            interpolationMethod:interpolationMethod,interpolationValidated:validated,
            mask:mask,values:values,minimumSI:minimum,maximumSI:maximum,permissionsScope:scope,
            readRoles:roles,exportAllowed:exportAllowed,rendererKind:rendererKind,
            rendererImplementationId:implementation,legendTitle:legendTitle,
            accessibleDescription:accessible,validity:validity)
    }
}
