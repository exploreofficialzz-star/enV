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
