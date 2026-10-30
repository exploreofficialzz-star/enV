import Foundation

/// Bounded native Swift electromechanical reference: one moving degree of freedom
/// coupled to an R-L coil with speed-dependent back-EMF. Not motor certification.
struct NativeActuatorInput {
    let massKg:Double
    var gravityMps2:Double=9.80665
    var initialHeightM:Double=0
    var supplyVoltageV:Double=24
    var resistanceOhm:Double=2
    var inductanceH:Double=0.3
    var forceConstantNPerA:Double=8
    var dampingNsPerM:Double=0.5
    var durationSeconds:Double=4
}
struct NativeActuatorSample {
    let timeSeconds:Double
    let heightM:Double
    let velocityMps:Double
    let currentA:Double
    let motorForceN:Double
    let backEmfV:Double
    let resistiveHeatW:Double
    let sourcePowerW:Double
    let kineticEnergyJ:Double
    let gravityEnergyJ:Double
    let magneticEnergyJ:Double
    let energyResidualJ:Double
}
struct NativeActuatorResult {
    let samples:[NativeActuatorSample]
    let stepSeconds:Double
    let modelVersion="1.0.0"
    let evidence="physics-model-computed"
    let inputEvidence="hypothetical-user-assumed"
    let validity="1D R-L coil, back-EMF, gravity, damping and flat ground; hypothetical parameters, no certified 3D motor."
}
enum NativeWorldLabActuator {
    private static func bounded(_ n:Double,_ a:Double,_ b:Double,_ field:String)throws {
        guard n.isFinite && n>=a && n<=b else {
            throw NativeWorldLabError.invalid("\(field) outside scientific reference limits")
        }
    }
    private static func derivative(_ s:[Double],_ i:NativeActuatorInput)->[Double] {
        let v=s[1];let c=s[2]
        return [v,
            (i.forceConstantNPerA*c-i.dampingNsPerM*v)/i.massKg-i.gravityMps2,
            (i.supplyVoltageV-i.resistanceOhm*c-i.forceConstantNPerA*v)/i.inductanceH]
    }
    private static func step(_ s:[Double],_ i:NativeActuatorInput,_ dt:Double,clamp:Bool)->[Double] {
        let k1=derivative(s,i)
        func shifted(_ k:[Double],_ f:Double)->[Double] {
            return (0..<3).map{j in s[j]+dt*k[j]*f}
        }
        let k2=derivative(shifted(k1,0.5),i)
        let k3=derivative(shifted(k2,0.5),i)
        let k4=derivative(shifted(k3,1),i)
        var n=(0..<3).map{j in s[j]+dt*(k1[j]+2*k2[j]+2*k3[j]+k4[j])/6}
        if clamp && (n[0]<0 || (n[0]==0 && n[1]<0)) {
            n[0]=0;n[1]=0
        }
        return n
    }
    static func evaluate(_ i:NativeActuatorInput,
                         requestedStepSeconds:Double=1.0/240)throws->NativeActuatorResult {
        try bounded(i.massKg,0.001,10000,"Mass")
        try bounded(i.gravityMps2,0,100,"Gravity")
        try bounded(i.initialHeightM,0,100,"Initial height")
        try bounded(i.supplyVoltageV,0,1000,"Voltage")
        try bounded(i.resistanceOhm,0.01,10000,"Resistance")
        try bounded(i.inductanceH,0.0001,1000,"Inductance")
        try bounded(i.forceConstantNPerA,0,10000,"Motor constant")
        try bounded(i.dampingNsPerM,0,100000,"Damping")
        try bounded(i.durationSeconds,0.1,12,"Duration")
        try bounded(requestedStepSeconds,0.0001,0.05,"Step")
        let rate=max(1,max(i.resistanceOhm/i.inductanceH,
            max(i.dampingNsPerM/i.massKg,
                i.forceConstantNPerA/sqrt(i.inductanceH*i.massKg))))
        let steps=Int(ceil(i.durationSeconds/min(requestedStepSeconds,0.06/rate)))
        guard steps<=50000 else {
            throw NativeWorldLabError.invalid("The actuator needs a specialized stiff solver")
        }
        let dt=i.durationSeconds/Double(steps)
        var state:[Double]=[i.initialHeightM,0,0]
        var supplied=0.0
        var dissipated=0.0
        let initial=i.massKg*i.gravityMps2*i.initialHeightM
        var output:[NativeActuatorSample]=[]
        output.reserveCapacity(steps+1)
        for n in 0...steps {
            let h=state[0];let v=state[1];let current=state[2]
            let ke=0.5*i.massKg*v*v
            let pe=i.massKg*i.gravityMps2*h
            let magnetic=0.5*i.inductanceH*current*current
            guard [h,v,current,ke,pe,magnetic,supplied,dissipated].allSatisfy({$0.isFinite}),
                abs(current)<1e7,abs(v)<1e5,h<1e5 else {
                throw NativeWorldLabError.invalid("Actuator exceeded stability envelope")
            }
            output.append(NativeActuatorSample(
                timeSeconds:Double(n)*dt,heightM:h,velocityMps:v,currentA:current,
                motorForceN:i.forceConstantNPerA*current,
                backEmfV:i.forceConstantNPerA*v,
                resistiveHeatW:i.resistanceOhm*current*current,
                sourcePowerW:i.supplyVoltageV*current,
                kineticEnergyJ:ke,gravityEnergyJ:pe,magneticEnergyJ:magnetic,
                energyResidualJ:supplied+initial-ke-pe-magnetic-dissipated))
            if n==steps {break}
            let next=step(state,i,dt,clamp:true)
            let current2=next[2];let velocity2=next[1]
            supplied+=0.5*dt*i.supplyVoltageV*(current+current2)
            dissipated+=0.5*dt*(i.resistanceOhm*(current*current+current2*current2)
                +i.dampingNsPerM*(v*v+velocity2*velocity2))
            if next[0]==0 && velocity2==0 && (h>0 || v<0) {
                let raw=step(state,i,dt,clamp:false)
                if raw[1]<0 {dissipated+=0.5*i.massKg*raw[1]*raw[1]}
            }
            state=next
        }
        return NativeActuatorResult(samples:output,stepSeconds:dt)
    }
}
