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
            try domain(v0,-1000,1000,"Initial voltage")
            try NativeWorldLabGraph.validate(NativeWorldLabExecution.idealRCGraph())
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
            let voltage:Double
            let current:Double
            if t<0.001 {
                voltage=initial
                current=(supply-voltage)/r
            } else {
                let adapters=try NativeWorldLabExecution.idealRCAdapters(
                    sourceVoltageV:supply,resistanceOhm:r,capacitanceF:c,initialVoltageV:initial)
                let run=try NativeWorldLabExecution.execute(
                    NativeWorldLabExecution.idealRCGraph(),adapters:adapters,
                    durationSeconds:t,stepSeconds:min(1.0/240.0,stable))
                guard let last=run.samples.last,
                      let solvedVoltage=last.values["load:Vc"]?.valueSI,
                      let solvedCurrent=last.values["load:I"]?.valueSI else {
                    throw NativeWorldLabError.invalid("RC graph scheduler omitted its voltage or current output")
                }
                voltage=solvedVoltage;current=solvedCurrent
            }
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
        guard steps<=50000 else { throw NativeWorldLabError.invalid("Drop exceeds local solver budget") }
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
        let canonical=value*spec.factor
        let sigma=uncertainty.map{$0*spec.factor}
        guard canonical.isFinite,sigma.map({$0.isFinite}) ?? true else {
            throw NativeWorldLabError.invalid("Scientific value or uncertainty exceeds finite SI bounds")
        }
        return NativeScienceQuantity(valueSI:canonical,unit:unit,
            dimension:spec.dimension,evidence:evidence,sourceId:sourceId,uncertaintySI:sigma)
    }
    static func validate(_ value:NativeScienceQuantity)throws {
        guard let spec=units[value.unit],value.dimension==spec.dimension,
              value.valueSI.isFinite,abs(value.valueSI)<=1e30,
              ["measured-observed","physics-model-computed","hypothetical-user-assumed"].contains(value.evidence),
              value.sourceId.map({$0.range(of:"^[A-Za-z0-9:_-]{1,120}$",options:.regularExpression) != nil}) ?? true,
              value.evidence != "measured-observed" || !(value.sourceId ?? "").isEmpty,
              value.uncertaintySI.map({$0.isFinite&&(0...1e30).contains($0)}) ?? true,
              value.unit != "K" || value.valueSI>=0 else {
            throw NativeWorldLabError.invalid("Invalid canonical scientific quantity or provenance")
        }
    }
    static func convert(_ value:NativeScienceQuantity,to unit:String)throws->Double {
        try validate(value)
        guard let input=units[value.unit],let output=units[unit],
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


/// Registered app-owned native solver adapter. Imported projects never provide closures.
struct NativeScientificStepOutput {
    let outputs:[String:NativeScienceQuantity]
    let suppliedW:Double
    let dissipatedW:Double
    let storedRateW:Double
    let nextEventSeconds:Double?
    init(outputs:[String:NativeScienceQuantity],suppliedW:Double,dissipatedW:Double,
         storedRateW:Double,nextEventSeconds:Double?=nil){
        self.outputs=outputs;self.suppliedW=suppliedW;self.dissipatedW=dissipatedW
        self.storedRateW=storedRateW;self.nextEventSeconds=nextEventSeconds
    }
}
struct NativeScientificAdapter {
    let componentId:String
    let modelId:String
    let modelVersion:String
    let initialOutputs:[String:NativeScienceQuantity]
    let advance:(Double,Double,[String:NativeScienceQuantity]) throws -> NativeScientificStepOutput
    init(componentId:String,modelId:String,modelVersion:String,
         initialOutputs:[String:NativeScienceQuantity]=[:],
         advance:@escaping (Double,Double,[String:NativeScienceQuantity]) throws -> NativeScientificStepOutput) {
        self.componentId=componentId;self.modelId=modelId;self.modelVersion=modelVersion
        self.initialOutputs=initialOutputs;self.advance=advance
    }
}
struct NativeScientificExchangeSample {
    let timeSeconds:Double;let stepSeconds:Double;let eventBoundary:Bool
    let values:[String:NativeScienceQuantity]
    let suppliedW:Double;let dissipatedW:Double;let storedRateW:Double;let residualW:Double
}
struct NativeScientificRun {
    let graph:NativeScientificGraph
    let samples:[NativeScientificExchangeSample]
}
enum NativeWorldLabExecution {
    static func execute(_ graph:NativeScientificGraph,adapters:[NativeScientificAdapter],
        durationSeconds:Double,stepSeconds:Double,powerToleranceW:Double=1e-6)throws->NativeScientificRun {
        try NativeWorldLabGraph.validate(graph)
        guard durationSeconds.isFinite,(0.001...60).contains(durationSeconds),
              stepSeconds.isFinite,(0.00001...1).contains(stepSeconds),
              ceil(durationSeconds/stepSeconds)<=50000,
              powerToleranceW.isFinite,(0...1e6).contains(powerToleranceW) else {
            throw NativeWorldLabError.invalid("Scientific timeline or tolerance exceeds the bounded budget")
        }
        guard adapters.count==graph.components.count else {
            throw NativeWorldLabError.invalid("One trusted adapter is required for each component")
        }
        var byId:[String:NativeScientificAdapter]=[:]
        for adapter in adapters {
            guard byId[adapter.componentId]==nil else {
                throw NativeWorldLabError.invalid("Duplicate trusted component adapter")
            }
            byId[adapter.componentId]=adapter
        }
        let components=Dictionary(uniqueKeysWithValues:graph.components.map{($0.id,$0)})
        for component in graph.components {
            guard let adapter=byId[component.id],adapter.modelId==component.modelId,
                  adapter.modelVersion.range(of:"^[0-9]+\\.[0-9]+\\.[0-9]+$",options:.regularExpression) != nil else {
                throw NativeWorldLabError.invalid("Unregistered or mismatched scientific model version")
            }
        }
        var adjacency=Dictionary(uniqueKeysWithValues:graph.components.map{($0.id,Set<String>())})
        var indegree=Dictionary(uniqueKeysWithValues:graph.components.map{($0.id,0)})
        for edge in graph.connections where !edge.delayed {
            if adjacency[edge.fromComponentId,default:[]].insert(edge.toComponentId).inserted {
                indegree[edge.toComponentId,default:0]+=1
            }
        }
        var ready=indegree.filter{$0.value==0}.map{$0.key}.sorted()
        var order:[String]=[]
        while !ready.isEmpty {
            let id=ready.removeFirst();order.append(id)
            for next in (adjacency[id] ?? []).sorted() {
                indegree[next,default:0]-=1
                if indegree[next]==0 {ready.append(next);ready.sort()}
            }
        }
        guard order.count==components.count else {
            throw NativeWorldLabError.invalid("Algebraic loop requires an explicitly supported implicit solver")
        }
        var incoming:[String:[NativeScienceEdge]]=[:]
        for edge in graph.connections {incoming[edge.toComponentId,default:[]].append(edge)}
        var samples:[NativeScientificExchangeSample]=[]
        var now=0.0
        var scheduled:Double?
        var previous:[String:NativeScienceQuantity]=[:]
        for adapter in adapters {
            guard let component=components[adapter.componentId] else {
                throw NativeWorldLabError.invalid("Initial state references an unknown component")
            }
            for (portId,value) in adapter.initialOutputs {
                guard let port=component.ports.first(where:{$0.id==portId}),
                      port.direction != "input",port.unit==value.unit else {
                    throw NativeWorldLabError.invalid("Initial state references an unregistered output port or unit")
                }
                try NativeWorldLabSI.validate(value)
                previous[adapter.componentId+":"+portId]=value
            }
        }
        while now<durationSeconds-1e-12 && samples.count<50000 {
            let end=min(durationSeconds,min(now+stepSeconds,scheduled ?? durationSeconds))
            guard end>now+1e-12 else {
                throw NativeWorldLabError.invalid("Scientific solver failed to advance")
            }
            var values:[String:NativeScienceQuantity]=[:]
            var nextEvents:[Double]=[]
            var supplied=0.0,dissipated=0.0,stored=0.0
            for id in order {
                guard let component=components[id],let adapter=byId[id] else {
                    throw NativeWorldLabError.invalid("Missing trusted scientific component adapter")
                }
                var inputs:[String:NativeScienceQuantity]=[:]
                for edge in incoming[id] ?? [] {
                    let sourceMap=edge.delayed ? previous : values
                    guard let source=sourceMap[edge.fromComponentId+":"+edge.fromPortId] else {
                        throw NativeWorldLabError.invalid(edge.delayed ?
                            "Delayed scientific input requires a registered initial output value" :
                            "Connected scientific source did not emit its declared output port")
                    }
                    guard let port=component.ports.first(where:{$0.id==edge.toPortId}) else {
                        throw NativeWorldLabError.invalid("Scientific edge targets an absent port")
                    }
                    let converted=NativeScienceQuantity(valueSI:source.valueSI,unit:port.unit,
                        dimension:source.dimension,evidence:source.evidence,
                        sourceId:source.sourceId,uncertaintySI:source.uncertaintySI)
                    try NativeWorldLabSI.validate(converted)
                    inputs[port.id]=converted
                }
                let output=try adapter.advance(end,end-now,inputs)
                guard [output.suppliedW,output.dissipatedW,output.storedRateW].allSatisfy({$0.isFinite&&abs($0)<=1e18}),
                      output.dissipatedW>=0 else {
                    throw NativeWorldLabError.invalid("Scientific solver emitted an invalid rate or negative dissipation")
                }
                for (portId,value) in output.outputs {
                    guard let port=component.ports.first(where:{$0.id==portId}),
                          port.direction != "input",value.unit==port.unit else {
                        throw NativeWorldLabError.invalid("Solver output port or unit is not registered")
                    }
                    try NativeWorldLabSI.validate(value)
                    values[id+":"+portId]=value
                }
                supplied+=output.suppliedW;dissipated+=output.dissipatedW;stored+=output.storedRateW
                if let event=output.nextEventSeconds {
                    guard event.isFinite,event>end+1e-10,event<=durationSeconds else {
                        throw NativeWorldLabError.invalid("Solver proposed an invalid future event boundary")
                    }
                    nextEvents.append(event)
                }
            }
            let residual=supplied-dissipated-stored
            guard residual.isFinite,abs(residual)<=powerToleranceW+1e-9*max(1,abs(supplied),abs(dissipated)) else {
                throw NativeWorldLabError.invalid("Power conservation residual exceeded tolerance")
            }
            samples.append(NativeScientificExchangeSample(timeSeconds:end,stepSeconds:end-now,
                eventBoundary:scheduled.map{abs(end-$0)<1e-9} ?? false,values:values,
                suppliedW:supplied,dissipatedW:dissipated,storedRateW:stored,residualW:residual))
            previous=values;now=end;scheduled=nextEvents.min()
        }
        guard let last=samples.last,abs(last.timeSeconds-durationSeconds)<=1e-9 else {
            throw NativeWorldLabError.invalid("Scientific simulation failed to reach its duration")
        }
        return NativeScientificRun(graph:graph,samples:samples)
    }
    static func idealRCGraph(projectId:String="native-rc-reference",
        projectRevision:Int=0)->NativeScientificGraph {
        NativeScientificGraph(projectId:projectId,projectRevision:projectRevision,components:[
            NativeScienceComponent(id:"source",modelId:"ideal-dc-source",ports:[
                NativeSciencePort(id:"V",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical")]),
            NativeScienceComponent(id:"load",modelId:"series-rc-load",ports:[
                NativeSciencePort(id:"Vin",direction:"input",unit:"V",frame:"SCALAR",flow:"electrical"),
                NativeSciencePort(id:"Vc",direction:"output",unit:"V",frame:"SCALAR",flow:"electrical"),
                NativeSciencePort(id:"I",direction:"output",unit:"A",frame:"SCALAR",flow:"electrical")])
        ],connections:[NativeScienceEdge(fromComponentId:"source",fromPortId:"V",
            toComponentId:"load",toPortId:"Vin",delayed:false)])
    }
    static func idealRCAdapters(sourceVoltageV:Double,resistanceOhm:Double,
        capacitanceF:Double,initialVoltageV:Double=0)throws->[NativeScientificAdapter] {
        guard sourceVoltageV.isFinite,abs(sourceVoltageV)<=1000,
              initialVoltageV.isFinite,abs(initialVoltageV)<=1000,
              resistanceOhm.isFinite,(0.001...1e9).contains(resistanceOhm),
              capacitanceF.isFinite,(1e-9...1000).contains(capacitanceF) else {
            throw NativeWorldLabError.invalid("Ideal RC assumptions are outside the supported physical domain")
        }
        let source=NativeScientificAdapter(componentId:"source",modelId:"ideal-dc-source",modelVersion:"1.0.0"){_,_,_ in
            NativeScientificStepOutput(outputs:["V":try NativeWorldLabSI.declare(sourceVoltageV,unit:"V")],
                suppliedW:0,dissipatedW:0,storedRateW:0)
        }
        var capacitorVoltage=initialVoltageV
        let load=NativeScientificAdapter(componentId:"load",modelId:"series-rc-load",modelVersion:"1.0.0"){_,delta,inputs in
            guard let connected=inputs["Vin"] else {
                throw NativeWorldLabError.invalid("RC load requires its connected source voltage")
            }
            guard delta.isFinite,delta>0 else {
                throw NativeWorldLabError.invalid("RC solver requires a positive finite step")
            }
            let connectedVoltage=try NativeWorldLabSI.convert(connected,to:"V")
            let voltage=connectedVoltage+(capacitorVoltage-connectedVoltage)*exp(-delta/(resistanceOhm*capacitanceF))
            let current=(connectedVoltage-voltage)/resistanceOhm
            capacitorVoltage=voltage
            return NativeScientificStepOutput(
                outputs:["Vc":try NativeWorldLabSI.declare(voltage,unit:"V",evidence:"physics-model-computed"),
                         "I":try NativeWorldLabSI.declare(current,unit:"A",evidence:"physics-model-computed")],
                suppliedW:connectedVoltage*current,dissipatedW:current*current*resistanceOhm,
                storedRateW:voltage*current)
        }
        return [source,load]
    }
}
