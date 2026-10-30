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
