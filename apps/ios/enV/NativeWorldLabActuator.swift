import Foundation

/// Bounded native Swift electromechanical reference: one moving degree of freedom
/// coupled to an R-L coil with speed-dependent back-EMF. Not motor certification.
struct NativeActuatorThermalInput {
    var initialTemperatureK:Double=293.15
    var ambientTemperatureK:Double=293.15
    var heatCapacityJPerK:Double=80
    var coolingWPerK:Double=0.3
    var resistanceTemperatureCoefficientPerK:Double=0.004
}
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
    var thermal:NativeActuatorThermalInput?=nil
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
    let suppliedEnergyJ:Double
    let dissipatedEnergyJ:Double
    let coilTemperatureK:Double?
    let coilResistanceOhm:Double?
    let thermalEnergyJ:Double
    let coolingPowerW:Double
}
struct NativeActuatorNumericalAudit {
    let status:String
    let maximumRelativeStateDifference:Double?
    let maximumEnergyResidualFraction:Double
    let explanation:String
}
struct NativeActuatorResult {
    let samples:[NativeActuatorSample]
    let stepSeconds:Double
    let modelVersion:String
    let evidence="physics-model-computed"
    let inputEvidence="hypothetical-user-assumed"
    let validity:String
}
enum NativeWorldLabActuator {
    private static func bounded(_ n:Double,_ a:Double,_ b:Double,_ field:String)throws {
        guard n.isFinite && n>=a && n<=b else {
            throw NativeWorldLabError.invalid("\(field) outside scientific reference limits")
        }
    }
    private static func resistance(_ i:NativeActuatorInput,_ temp:Double)->Double {
        guard let t=i.thermal else {return i.resistanceOhm}
        return i.resistanceOhm*(1+t.resistanceTemperatureCoefficientPerK*(temp-t.ambientTemperatureK))
    }
    private static func derivative(_ s:[Double],_ i:NativeActuatorInput)->[Double] {
        let v=s[1];let c=s[2];let temp=s[3]
        let r=resistance(i,temp)
        let heat=r*c*c
        let cooling=i.thermal.map{$0.coolingWPerK*(temp-$0.ambientTemperatureK)} ?? 0
        let heating=i.thermal.map{(heat-cooling)/$0.heatCapacityJPerK} ?? 0
        // Constrained ground contact is enforced inside intermediate stages,
        // otherwise an unpowered resting coil falsely generates back-EMF.
        if s[0]<=0 && v<=0 && i.forceConstantNPerA*c<=i.massKg*i.gravityMps2 {
            return [0,0,(i.supplyVoltageV-r*c)/i.inductanceH,heating]
        }
        return [v,
            (i.forceConstantNPerA*c-i.dampingNsPerM*v)/i.massKg-i.gravityMps2,
            (i.supplyVoltageV-r*c-i.forceConstantNPerA*v)/i.inductanceH,heating]
    }
    private static func step(_ s:[Double],_ i:NativeActuatorInput,_ dt:Double,clamp:Bool)->[Double] {
        let k1=derivative(s,i)
        func shifted(_ k:[Double],_ f:Double)->[Double] {
            let increment:Double=dt*f
            return [
                s[0]+increment*k[0],
                s[1]+increment*k[1],
                s[2]+increment*k[2],
                s[3]+increment*k[3]
            ]
        }
        let k2=derivative(shifted(k1,0.5),i)
        let k3=derivative(shifted(k2,0.5),i)
        let k4=derivative(shifted(k3,1),i)
        let scale:Double=dt/6
        var n:[Double]=[
            s[0]+scale*(k1[0]+2*k2[0]+2*k3[0]+k4[0]),
            s[1]+scale*(k1[1]+2*k2[1]+2*k3[1]+k4[1]),
            s[2]+scale*(k1[2]+2*k2[2]+2*k3[2]+k4[2]),
            s[3]+scale*(k1[3]+2*k2[3]+2*k3[3]+k4[3])
        ]
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
        if let thermal=i.thermal {
            try bounded(thermal.initialTemperatureK,1,1500,"Initial temperature")
            try bounded(thermal.ambientTemperatureK,1,1500,"Ambient temperature")
            try bounded(thermal.heatCapacityJPerK,1,1000000,"Heat capacity")
            try bounded(thermal.coolingWPerK,0,10000,"Cooling")
            try bounded(thermal.resistanceTemperatureCoefficientPerK,0,0.02,"Temperature coefficient")
            guard resistance(i,thermal.initialTemperatureK)>=0.01 else {
                throw NativeWorldLabError.invalid("Initial coil resistance outside thermal range")
            }
        }
        let rate=max(1,max(i.resistanceOhm/i.inductanceH,
            max(i.dampingNsPerM/i.massKg,
                i.forceConstantNPerA/sqrt(i.inductanceH*i.massKg))))
        let steps=Int(ceil(i.durationSeconds/min(requestedStepSeconds,0.06/rate)))
        guard steps<=50000 else {
            throw NativeWorldLabError.invalid("The actuator needs a specialized stiff solver")
        }
        let dt=i.durationSeconds/Double(steps)
        let initialTemperature=i.thermal?.initialTemperatureK ?? 293.15
        var state:[Double]=[i.initialHeightM,0,0,initialTemperature]
        var supplied=0.0
        var dissipated=0.0
        let initial=i.massKg*i.gravityMps2*i.initialHeightM
        var output:[NativeActuatorSample]=[]
        output.reserveCapacity(steps+1)
        for n in 0...steps {
            let h=state[0];let v=state[1];let current=state[2];let temperature=state[3]
            let r=resistance(i,temperature)
            let heat=r*current*current
            let cooling=i.thermal.map{$0.coolingWPerK*(temperature-$0.ambientTemperatureK)} ?? 0
            let stored=i.thermal.map{$0.heatCapacityJPerK*(temperature-initialTemperature)} ?? 0
            let ke=0.5*i.massKg*v*v
            let pe=i.massKg*i.gravityMps2*h
            let magnetic=0.5*i.inductanceH*current*current
            guard [h,v,current,temperature,r,stored,ke,pe,magnetic,supplied,dissipated].allSatisfy({$0.isFinite}),
                r>=0.01,r<=1e6,temperature>=1,temperature<=2000,
                abs(current)<1e7,abs(v)<1e5,h<1e5 else {
                throw NativeWorldLabError.invalid("Actuator exceeded stability envelope")
            }
            output.append(NativeActuatorSample(
                timeSeconds:Double(n)*dt,heightM:h,velocityMps:v,currentA:current,
                motorForceN:i.forceConstantNPerA*current,
                backEmfV:i.forceConstantNPerA*v,
                resistiveHeatW:heat,
                sourcePowerW:i.supplyVoltageV*current,
                kineticEnergyJ:ke,gravityEnergyJ:pe,magneticEnergyJ:magnetic,
                energyResidualJ:supplied+initial-ke-pe-magnetic-stored-dissipated,
                suppliedEnergyJ:supplied,dissipatedEnergyJ:dissipated,
                coilTemperatureK:i.thermal == nil ? nil : temperature,
                coilResistanceOhm:i.thermal == nil ? nil : r,
                thermalEnergyJ:stored,coolingPowerW:cooling))
            if n==steps {break}
            let next=step(state,i,dt,clamp:true)
            let current2=next[2];let velocity2=next[1]
            supplied+=0.5*dt*i.supplyVoltageV*(current+current2)
            let t2=next[3]
            let heat2=resistance(i,t2)*current2*current2
            let cooling2=i.thermal.map{$0.coolingWPerK*(t2-$0.ambientTemperatureK)} ?? 0
            let loss1=i.dampingNsPerM*v*v+(i.thermal == nil ? heat : cooling)
            let loss2=i.dampingNsPerM*velocity2*velocity2+(i.thermal == nil ? heat2 : cooling2)
            dissipated+=0.5*dt*(loss1+loss2)
            if next[0]==0 && velocity2==0 && (h>0 || v<0) {
                let raw=step(state,i,dt,clamp:false)
                if raw[1]<0 {dissipated+=0.5*i.massKg*raw[1]*raw[1]}
            }
            state=next
        }
        return NativeActuatorResult(samples:output,stepSeconds:dt,
            modelVersion:i.thermal == nil ? "1.0.0" : "1.1.0",
            validity:i.thermal == nil ?
                "Bounded 1D R-L actuator with hypothetical parameters; not certified." :
                "Bounded 1D electrical-thermal-mechanical feedback with hypothetical heat capacity, " +
                "cooling and resistance; not measured or certified.")
    }

    /// Internal 1D numerical consistency only. Does not verify motor parameters.
    static func numericalAudit(_ input:NativeActuatorInput,
                               _ run:NativeActuatorResult)throws->NativeActuatorNumericalAudit {
        guard (run.modelVersion=="1.0.0" || run.modelVersion=="1.1.0"),run.samples.count>=2,
            run.stepSeconds.isFinite,run.stepSeconds>0 else {
            throw NativeWorldLabError.invalid("Completed actuator trajectory required")
        }
        let first=run.samples[0]
        let initial=first.kineticEnergyJ+first.gravityEnergyJ+first.magneticEnergyJ+first.thermalEnergyJ
        var worstEnergy=0.0
        for s in run.samples {
            let terms=[s.energyResidualJ,s.suppliedEnergyJ,s.dissipatedEnergyJ,
                s.kineticEnergyJ,s.gravityEnergyJ,s.magneticEnergyJ,s.thermalEnergyJ]
            guard terms.allSatisfy({$0.isFinite}) else {
                throw NativeWorldLabError.invalid("Non-finite actuator energy evidence")
            }
            let inputMagnitude=abs(initial)+abs(s.suppliedEnergyJ)
            let kineticAndGravity=abs(s.kineticEnergyJ)+abs(s.gravityEnergyJ)
            let outputMagnitude=kineticAndGravity+abs(s.magneticEnergyJ)+abs(s.thermalEnergyJ)+abs(s.dissipatedEnergyJ)
            let scale=max(1.0,max(inputMagnitude,outputMagnitude))
            worstEnergy=max(worstEnergy,abs(s.energyResidualJ)/scale)
        }
        let half=run.stepSeconds/2
        if half<0.0001 {
            return NativeActuatorNumericalAudit(status:"unavailable",
                maximumRelativeStateDifference:nil,
                maximumEnergyResidualFraction:worstEnergy,
                explanation:"Half-step resolution exceeds local solver limits.")
        }
        guard let fine=try? evaluate(input,requestedStepSeconds:half) else {
            return NativeActuatorNumericalAudit(status:"unavailable",
                maximumRelativeStateDifference:nil,
                maximumEnergyResidualFraction:worstEnergy,
                explanation:"The bounded half-step solver could not complete.")
        }
        var worstState=0.0
        for s in run.samples {
            let n=Int((s.timeSeconds/fine.stepSeconds).rounded())
            let index=min(max(n,0),fine.samples.count-1)
            let f=fine.samples[index]
            let dHeight=abs(s.heightM-f.heightM)/max(1.0,max(abs(s.heightM),abs(f.heightM)))
            let dCurrent=abs(s.currentA-f.currentA)/max(1.0,max(abs(s.currentA),abs(f.currentA)))
            guard dHeight.isFinite,dCurrent.isFinite else {
                throw NativeWorldLabError.invalid("Non-finite actuator step comparison")
            }
            worstState=max(worstState,max(dHeight,dCurrent))
        }
        let pass=worstState<=0.01 && worstEnergy<=0.02
        return NativeActuatorNumericalAudit(
            status:pass ? "within-internal-tolerance" : "outside-internal-tolerance",
            maximumRelativeStateDifference:worstState,
            maximumEnergyResidualFraction:worstEnergy,
            explanation:pass ?
                "Internal numerical thresholds met; assumed materials are not verified." :
                "Numerical thresholds exceeded; this trajectory needs review.")
    }
}

/// Ideal DC source with a dynamic electromechanical branch in parallel.
struct NativeLabNetworkMotorSample {
    let timeSeconds:Double
    let totalSourceCurrentA:Double
    let totalSourcePowerW:Double
    let passiveResistorHeatW:Double
    let combinedEnergyResidualJ:Double
}
struct NativeLabNetworkMotorRun {
    let projectId:String
    let projectRevision:Int
    let networkId:String
    let entityId:String
    let dc:NativeLabDcResult
    let motor:NativeActuatorResult
    let samples:[NativeLabNetworkMotorSample]
    let validity="One ideal stiff DC source powering a parallel dynamic motor; no battery sag or measured materials."
}
enum NativeWorldLabNetworkMotor {
    static func evaluate(_ project:NativeWorldLabProject,
                         network:NativeLabCircuitNetwork,
                         entityId:String,massKg:Double,
                         thermal:Bool) throws -> NativeLabNetworkMotorRun {
        let sources=network.components.filter{$0.kind=="dc-source"}
        guard sources.count==1,let source=sources.first,
              let voltage=source.voltageV,voltage>=0 else {
            throw NativeWorldLabError.invalid("Wired motor requires one supported positive DC source")
        }
        guard project.entities.contains(where:{$0.id==entityId}) else {
            throw NativeWorldLabError.invalid("The selected invention is no longer present")
        }
        let dc=try NativeWorldLabDc.solve(network,project:project)
        var input=NativeActuatorInput(massKg:massKg)
        input.supplyVoltageV=voltage
        if thermal {input.thermal=NativeActuatorThermalInput()}
        let motor=try NativeWorldLabActuator.evaluate(input)
        guard let passiveSourceCurrent=dc.branchCurrentsA[source.id] else {
            throw NativeWorldLabError.invalid("Source current is unknown")
        }
        let samples=try motor.samples.map{sample -> NativeLabNetworkMotorSample in
            let total=passiveSourceCurrent-sample.currentA
            let power = -voltage*total
            let residual=sample.energyResidualJ+dc.powerResidualW*sample.timeSeconds
            guard total.isFinite,power.isFinite,residual.isFinite else {
                throw NativeWorldLabError.invalid("Connected source energy is non-finite")
            }
            return NativeLabNetworkMotorSample(
                timeSeconds:sample.timeSeconds,totalSourceCurrentA:total,
                totalSourcePowerW:power,passiveResistorHeatW:dc.resistorHeatW,
                combinedEnergyResidualJ:residual)
        }
        return NativeLabNetworkMotorRun(
            projectId:project.id,projectRevision:project.revision,
            networkId:network.id,entityId:entityId,dc:dc,motor:motor,samples:samples)
    }
}
