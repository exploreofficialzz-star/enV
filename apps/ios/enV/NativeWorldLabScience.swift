import Foundation

/// Offline reference calculations with identical bounded SI assumptions to the
/// Web World Lab 1.0.0 engine. Not measured data or a generalized physics solver.
enum NativeLabInput {
    case spring(massKg:Double=1,springNPerM:Double=4,dampingNsPerM:Double=0.5,
                x0:Double=0.5,v0:Double=0)
    case rc(resistanceOhm:Double=1000,capacitanceF:Double=0.001,
            supplyV:Double=10,initialV:Double=0)
    case heat(diffusivityM2S:Double=0.02,lengthM:Double=2,
              backgroundK:Double=293.15,centerK:Double=373.15)
}
struct NativeLabResult {
    let timeSeconds:Double
    let modelVersion="1.0.0"
    var xMeters:Double?
    var velocityMPerS:Double?
    var mechanicalEnergyJ:Double?
    var voltageV:Double?
    var currentA:Double?
    var resistorHeatW:Double?
    var storedEnergyJ:Double?
    var temperatureK:[Double]?
    var meanTemperatureK:Double?
    var peakTemperatureK:Double?
}
enum NativeWorldLabScience {
    static let heatCells=21
    private static func domain(_ n:Double,_ low:Double,_ high:Double,_ label:String)throws{
        guard n.isFinite && n>=low && n<=high else {
            throw NativeWorldLabError.invalid("\(label) is outside the finite scientific domain")
        }
    }
    static func evaluate(_ input:NativeLabInput,atSeconds t:Double)throws->NativeLabResult{
        try domain(t,0,30,"Simulation time")
        var stable=1.0/240.0
        switch input {
        case let .spring(m,k,c,x,v):
            try domain(m,0.001,10000,"Mass")
            try domain(k,0.001,1e6,"Spring")
            try domain(c,0,1e5,"Damping")
            try domain(x,-10,10,"Position")
            try domain(v,-100,100,"Velocity")
            stable=0.08/max(1,max(sqrt(k/m),c/m))
        case let .rc(r,c,v,v0):
            try domain(r,0.001,1e9,"Resistance")
            try domain(c,1e-9,1000,"Capacitance")
            try domain(v,-1000,1000,"Supply")
            let voltage = try NativeWorldLabSI.declare(v,unit:"V")
            _ = try NativeWorldLabSI.convert(voltage,to:"V")
            try NativeWorldLabSI.connect(
                .init(id:"source",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"),
                .init(id:"capacitor",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical"))
            try domain(v0,-1000,1000,"Initial voltage")
        case let .heat(alpha,length,ambient,center):
            try domain(alpha,1e-7,100,"Diffusivity")
            try domain(length,0.1,100,"Length")
            try domain(ambient,0,2000,"Temperature")
            try domain(center,0,2000,"Center")
            stable=0.45*pow(length/Double(heatCells),2)/alpha
        }
        let required=t==0 ? 0 : ceil(t/min(1.0/240.0,stable))
        guard required.isFinite && required<=50000 else {
            throw NativeWorldLabError.invalid("Exceeded 50,000-step mobile reference budget")
        }
        let steps=Int(required),h=steps==0 ? 0 : t/Double(steps)
        var result=NativeLabResult(timeSeconds:t)
        switch input {
        case let .spring(m,k,c,startX,startV):
            var x=startX,v=startV
            func derivative(_ x:Double,_ v:Double)->(Double,Double){
                (v,-(k*x+c*v)/m)
            }
            for _ in 0..<steps {
                let (a1,b1)=derivative(x,v)
                let (a2,b2)=derivative(x+h*a1/2,v+h*b1/2)
                let (a3,b3)=derivative(x+h*a2/2,v+h*b2/2)
                let (a4,b4)=derivative(x+h*a3,v+h*b3)
                x+=h*(a1+2*a2+2*a3+a4)/6
                v+=h*(b1+2*b2+2*b3+b4)/6
            }
            guard x.isFinite && v.isFinite else {
                throw NativeWorldLabError.invalid("Nonfinite motion")
            }
            result.xMeters=x;result.velocityMPerS=v
            result.mechanicalEnergyJ=(m*v*v+k*x*x)/2
        case let .rc(r,c,supply,initial):
            let voltage=supply+(initial-supply)*exp(-t/(r*c))
            let current=(supply-voltage)/r
            result.voltageV=voltage;result.currentA=current
            result.resistorHeatW=current*current*r
            result.storedEnergyJ=c*voltage*voltage/2
        case let .heat(alpha,length,ambient,center):
            var cells=Array(repeating:ambient,count:heatCells)
            cells[heatCells/2]=center
            let dx=length/Double(heatCells),ratio=alpha*h/(dx*dx)
            for _ in 0..<steps {
                var flux = [Double](repeating: 0, count: heatCells - 1)
                for cell in 0..<(heatCells - 1) {
                    let difference = cells[cell + 1] - cells[cell]
                    flux[cell] = ratio * difference
                }
                var next = cells
                for cell in 0..<heatCells {
                    let outgoing: Double = cell < heatCells - 1 ? flux[cell] : 0
                    let incoming: Double = cell > 0 ? flux[cell - 1] : 0
                    next[cell] = cells[cell] + outgoing - incoming
                }
                cells = next
            }
            guard cells.allSatisfy({$0.isFinite && $0>=0 && $0<=2000}) else {
                throw NativeWorldLabError.invalid("Invalid heat profile")
            }
            result.temperatureK=cells
            result.meanTemperatureK=cells.reduce(0,+)/Double(heatCells)
            result.peakTemperatureK=cells.max()
        }
        return result
    }
}


/// Native Swift reference for gravity, quadratic drag, and contact against a flat plane.
/// Material mass must originate from a validated hypothetical assumption; not a certified analysis.
struct NativeDropInput {
    let massKg:Double
    let supportingHalfHeightM:Double
    var dropHeightM:Double=5
    var initialVelocityMps:Double=0
    var gravityMps2:Double=9.80665
    var airDensityKgM3:Double=1.225
    let projectedAreaM2:Double
    var dragCoefficient:Double=0.47
    var restitution:Double=0.3
    var durationSeconds:Double=6
}
struct NativeDropSample {
    let timeSeconds:Double
    let heightAboveGroundM:Double
    let velocityMps:Double
    let kineticEnergyJ:Double
    let gravitationalEnergyJ:Double
    let grounded:Bool
}
struct NativeDropResult {
    let samples:[NativeDropSample]
    let impactCount:Int
    let stepSeconds:Double
    let modelVersion="1.0.0"
    let evidence="physics-model-computed"
    let inputEvidence="hypothetical-user-assumed"
    let validity="Bounded 1D centre-of-mass gravity, quadratic drag and flat-ground contact; no rotation or material failure."
}
enum NativeWorldLabDropScience {
    private static func valid(_ n:Double,_ low:Double,_ high:Double,_ label:String)throws{
        guard n.isFinite && n >= low && n <= high else {
            throw NativeWorldLabError.invalid("\(label) outside bounded scientific domain")
        }
    }
    static func evaluate(_ i:NativeDropInput,stepSeconds:Double=1.0/240)throws->NativeDropResult {
        try valid(i.massKg,0.001,10000,"Mass")
        try valid(i.supportingHalfHeightM,0.0005,5000,"Half-height")
        try valid(i.dropHeightM,0,100,"Release height")
        try valid(i.initialVelocityMps,-100,100,"Velocity")
        try valid(i.gravityMps2,0,100,"Gravity")
        try valid(i.airDensityKgM3,0,100,"Air density")
        try valid(i.projectedAreaM2,0.000001,100000,"Projected area")
        try valid(i.dragCoefficient,0,3,"Drag coefficient")
        try valid(i.restitution,0,1,"Restitution")
        try valid(i.durationSeconds,0.01,20,"Duration")
        try valid(stepSeconds,0.001,1.0/30,"Step")
        let steps=Int(ceil(i.durationSeconds/stepSeconds))
        guard steps<=20000 else { throw NativeWorldLabError.invalid("Drop exceeds local solver budget") }
        let dt=i.durationSeconds/Double(steps)
        let k=0.5*i.airDensityKgM3*i.dragCoefficient*i.projectedAreaM2/i.massKg
        var height=i.dropHeightM
        var v=i.initialVelocityMps
        var impacts=0
        var samples:[NativeDropSample]=[]
        samples.reserveCapacity(steps+1)
        for n in 0...steps {
            samples.append(NativeDropSample(
                timeSeconds:Double(n)*dt,heightAboveGroundM:height,velocityMps:v,
                kineticEnergyJ:0.5*i.massKg*v*v,
                gravitationalEnergyJ:i.massKg*i.gravityMps2*height,
                grounded:height==0 && v==0))
            if n==steps || (height==0 && v==0) {continue}
            v+=(-i.gravityMps2-k*v*abs(v))*dt
            guard v.isFinite && abs(v)<=10000 else {
                throw NativeWorldLabError.invalid("Drop model exceeded stability envelope")
            }
            height+=v*dt
            if height<=0 {
                height=0
                if v<0 {
                    impacts+=1
                    v = -v*i.restitution
                    if v<max(0.025,i.gravityMps2*dt) {v=0}
                }
            }
        }
        return NativeDropResult(samples:samples,impactCount:impacts,stepSeconds:dt)
    }
}


/** Source-aware, dimension-checked SI numerical exchange. Native Swift implementation
 * deliberately independent from Web and Kotlin to expose parity drift through tests.
 */
struct NativeScienceQuantity {
    let valueSI:Double
    let unit:String
    let dimension:[Int]
    let evidence:String
    let sourceId:String?
    let uncertaintySI:Double?
}
struct NativeSciencePort {
    let id:String
    let direction:String
    let unit:String
    let frame:String
    let flow:String
}
enum NativeWorldLabSI {
    private struct Spec {
        let dimension:[Int]
        let factor:Double
    }
    private static let units:[String:Spec]=[
        "1":.init(dimension:[0,0,0,0,0,0,0],factor:1),
        "kg":.init(dimension:[1,0,0,0,0,0,0],factor:1),
        "g":.init(dimension:[1,0,0,0,0,0,0],factor:0.001),
        "m":.init(dimension:[0,1,0,0,0,0,0],factor:1),
        "cm":.init(dimension:[0,1,0,0,0,0,0],factor:0.01),
        "mm":.init(dimension:[0,1,0,0,0,0,0],factor:0.001),
        "km":.init(dimension:[0,1,0,0,0,0,0],factor:1000),
        "s":.init(dimension:[0,0,1,0,0,0,0],factor:1),
        "ms":.init(dimension:[0,0,1,0,0,0,0],factor:0.001),
        "min":.init(dimension:[0,0,1,0,0,0,0],factor:60),
        "h":.init(dimension:[0,0,1,0,0,0,0],factor:3600),
        "A":.init(dimension:[0,0,0,1,0,0,0],factor:1),
        "mA":.init(dimension:[0,0,0,1,0,0,0],factor:0.001),
        "K":.init(dimension:[0,0,0,0,1,0,0],factor:1),
        "mol":.init(dimension:[0,0,0,0,0,1,0],factor:1),
        "cd":.init(dimension:[0,0,0,0,0,0,1],factor:1),
        "m2":.init(dimension:[0,2,0,0,0,0,0],factor:1),
        "m3":.init(dimension:[0,3,0,0,0,0,0],factor:1),
        "m/s":.init(dimension:[0,1,-1,0,0,0,0],factor:1),
        "m/s2":.init(dimension:[0,1,-2,0,0,0,0],factor:1),
        "kg/m3":.init(dimension:[1,-3,0,0,0,0,0],factor:1),
        "N":.init(dimension:[1,1,-2,0,0,0,0],factor:1),
        "N/m":.init(dimension:[1,0,-2,0,0,0,0],factor:1),
        "N/A":.init(dimension:[1,1,-2,-1,0,0,0],factor:1),
        "Pa":.init(dimension:[1,-1,-2,0,0,0,0],factor:1),
        "kPa":.init(dimension:[1,-1,-2,0,0,0,0],factor:1000),
        "J":.init(dimension:[1,2,-2,0,0,0,0],factor:1),
        "kJ":.init(dimension:[1,2,-2,0,0,0,0],factor:1000),
        "W":.init(dimension:[1,2,-3,0,0,0,0],factor:1),
        "V":.init(dimension:[1,2,-3,-1,0,0,0],factor:1),
        "ohm":.init(dimension:[1,2,-3,-2,0,0,0],factor:1),
        "F":.init(dimension:[-1,-2,4,2,0,0,0],factor:1),
        "H":.init(dimension:[1,2,-2,-2,0,0,0],factor:1),
        "C":.init(dimension:[0,0,1,1,0,0,0],factor:1),
        "J/K":.init(dimension:[1,2,-2,0,-1,0,0],factor:1),
        "J/(kg*K)":.init(dimension:[0,2,-2,0,-1,0,0],factor:1),
        "W/K":.init(dimension:[1,2,-3,0,-1,0,0],factor:1),
        "W/(m*K)":.init(dimension:[1,1,-3,0,-1,0,0],factor:1)
    ]
    static func declare(_ value:Double,unit:String,
        evidence:String="hypothetical-user-assumed",sourceId:String?=nil,
        uncertainty:Double?=nil)throws->NativeScienceQuantity {
        guard let spec=units[unit],value.isFinite,abs(value)<=1e30,
            ["measured-observed","hypothetical-user-assumed","physics-model-computed"].contains(evidence),
            (sourceId==nil || sourceId?.range(of:"^[A-Za-z0-9:_-]{1,120}$",options:.regularExpression) != nil),
            (evidence != "measured-observed" || !(sourceId ?? "").isEmpty),
            (uncertainty==nil || (uncertainty!.isFinite && uncertainty!>=0 && uncertainty!<=1e30)),
            (unit != "K" || value>=0) else {
            throw NativeWorldLabError.invalid("Invalid source, physical quantity or SI unit")
        }
        return NativeScienceQuantity(valueSI:value*spec.factor,unit:unit,
            dimension:spec.dimension,evidence:evidence,
            sourceId:sourceId,uncertaintySI:uncertainty.map{$0*spec.factor})
    }
    static func convert(_ value:NativeScienceQuantity,to unit:String)throws->Double {
        guard let input=units[value.unit],let output=units[unit],
            value.valueSI.isFinite,
            value.dimension==input.dimension && input.dimension==output.dimension else {
            throw NativeWorldLabError.invalid("Scientific quantity dimension mismatch")
        }
        return value.valueSI/output.factor
    }
    static func connect(_ source:NativeSciencePort,_ target:NativeSciencePort)throws {
        guard ["output","bidirectional"].contains(source.direction),
            ["input","bidirectional"].contains(target.direction),
            source.frame==target.frame,source.flow==target.flow,
            let origin=units[source.unit],let destination=units[target.unit],
            origin.dimension==destination.dimension else {
            throw NativeWorldLabError.invalid("Scientific port unit, flow or frame mismatch")
        }
    }
}


struct NativeScienceComponent {
    let id:String
    let modelId:String
    let ports:[NativeSciencePort]
}
struct NativeScienceEdge {
    let fromComponentId:String
    let fromPortId:String
    let toComponentId:String
    let toPortId:String
    let delayed:Bool
}
struct NativeScientificGraph {
    let projectId:String
    let projectRevision:Int
    let components:[NativeScienceComponent]
    let connections:[NativeScienceEdge]
}
/** Swift-native strict graph preflight; project JSON is data, not executable adapters. */
enum NativeWorldLabGraph {
    private static func validId(_ value:String)->Bool{
        !value.isEmpty && value.range(of:"^[A-Za-z0-9_-]{1,120}$",
                                     options:.regularExpression) != nil
    }
    static func validate(_ graph:NativeScientificGraph)throws {
        guard validId(graph.projectId),graph.projectRevision>=0,
              graph.projectRevision<=1_000_000_000,
              (1...128).contains(graph.components.count),
              graph.connections.count<=512 else {
            throw NativeWorldLabError.invalid("Invalid scientific graph identity or capacity")
        }
        var parts:[String:NativeScienceComponent]=[:]
        for item in graph.components {
            guard validId(item.id),validId(item.modelId),parts[item.id]==nil,
                  (1...20).contains(item.ports.count) else {
                throw NativeWorldLabError.invalid("Duplicate component or unsupported port count")
            }
            var used=Set<String>()
            for port in item.ports {
                guard validId(port.id),used.insert(port.id).inserted,
                      ["input","output","bidirectional"].contains(port.direction),
                      ["SCALAR","LOCAL_ENU","ECEF","INERTIAL"].contains(port.frame),
                      ["electrical","mechanical","thermal","fluid","chemical","signal"].contains(port.flow) else {
                    throw NativeWorldLabError.invalid("Invalid scientific port metadata")
                }
                _ = try NativeWorldLabSI.declare(0,unit:port.unit)
            }
            parts[item.id]=item
        }
        var targetIds=Set<String>()
        var adjacency=Dictionary(uniqueKeysWithValues:parts.keys.map{($0,Set<String>())})
        for edge in graph.connections {
            guard let origin=parts[edge.fromComponentId]?.ports.first(where:{$0.id==edge.fromPortId}),
                  let destination=parts[edge.toComponentId]?.ports.first(where:{$0.id==edge.toPortId}) else {
                throw NativeWorldLabError.invalid("Scientific graph references an unknown port")
            }
            try NativeWorldLabSI.connect(origin,destination)
            guard targetIds.insert(edge.toComponentId+":"+edge.toPortId).inserted else {
                throw NativeWorldLabError.invalid("Scientific input has multiple upstream drivers")
            }
            if !edge.delayed {
                adjacency[edge.fromComponentId,default:[]].insert(edge.toComponentId)
            }
        }
        var seen=Set<String>(),active=Set<String>()
        func visit(_ key:String)throws {
            if seen.contains(key){return}
            guard !active.contains(key) else {
                throw NativeWorldLabError.invalid("Instantaneous scientific feedback cycle")
            }
            active.insert(key)
            for next in adjacency[key] ?? [] {try visit(next)}
            active.remove(key)
            seen.insert(key)
        }
        for key in parts.keys {try visit(key)}
    }
}
