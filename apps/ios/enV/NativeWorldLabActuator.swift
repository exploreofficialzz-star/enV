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


/// A static assumed Boolean signal switches a bounded native physical motor.
struct NativeDigitalMotorResult {
    let projectId:String
    let projectRevision:Int
    let networkId:String
    let outputId:String
    let entityId:String
    let logicBit:Int
    let input:NativeActuatorInput
    let motor:NativeActuatorResult
    let validity="A hypothetical static Boolean output controls an ideal voltage in a one-dimensional motor experiment; not a real processor, switching electronic circuit, measured material, timing model or device certification."
}
enum NativeWorldLabDigitalMotor {
    static func evaluate(_ project:NativeWorldLabProject,networkId:String,
        outputId:String,entityId:String,massKg:Double,
        energizedVoltageV:Double=24,thermal:Bool=false)throws->NativeDigitalMotorResult {
        guard energizedVoltageV.isFinite,energizedVoltageV>=0,
              energizedVoltageV<=1000 else {
            throw NativeWorldLabError.invalid("Assumed logic-controlled voltage outside bounds")
        }
        guard project.entities.contains(where:{$0.id==entityId}),
              let network=project.digitalNetworks?.first(where:{$0.id==networkId}),
              network.outputs.contains(where:{$0.id==outputId}) else {
            throw NativeWorldLabError.invalid("Digital output or selected physical solid is missing")
        }
        let computed=try NativeWorldLabDigitalLogic.evaluate(network)
        guard let bit=computed[outputId],bit==0 || bit==1 else {
            throw NativeWorldLabError.invalid("Digital output has no Boolean result")
        }
        var input=NativeActuatorInput(massKg:massKg)
        input.supplyVoltageV=energizedVoltageV*Double(bit)
        if thermal {input.thermal=NativeActuatorThermalInput()}
        let motor=try NativeWorldLabActuator.evaluate(input)
        return NativeDigitalMotorResult(projectId:project.id,
            projectRevision:project.revision,networkId:networkId,
            outputId:outputId,entityId:entityId,logicBit:bit,input:input,motor:motor)
    }
}


/// Analytic beam response under an explicit invented stiffness assumption.
struct NativeLabBeamBendingResult {
    let projectId:String
    let projectRevision:Int
    let entityId:String
    let materialId:String
    let forceN:Double
    let lengthM:Double
    let depthM:Double
    let widthM:Double
    let assumedYoungModulusPa:Double
    let secondMomentM4:Double
    let bendingStiffnessNm2:Double
    let tipDeflectionM:Double
    let maximumStressPa:Double
    let surfaceStrain:Double
    let evidence="physics-model-computed"
    let materialEvidence="hypothetical-user-assumed"
    let validity="Ideal homogeneous isotropic linearly elastic rectangular cantilever, static point load and fixed support. Assumed Young's modulus is not measured. No material fracture, yield limit, buckling, fatigue, torsion, shear, safety factor or certification is predicted."
}
enum NativeWorldLabStructural {
    static func bending(_ project:NativeWorldLabProject,
        entityId:String,forceN:Double)throws->NativeLabBeamBendingResult {
        guard forceN.isFinite,forceN>=0,forceN<=1e8 else {
            throw NativeWorldLabError.invalid("Cantilever tip load must be finite and between 0 and 100,000,000 N")
        }
        guard let solid=project.entities.first(where:{$0.id==entityId}) else {
            throw NativeWorldLabError.invalid("Select a solid for beam bending")
        }
        guard solid.shape=="box" else {
            throw NativeWorldLabError.invalid("Only rectangular box beams are supported")
        }
        guard let material=project.materials.first(where:{$0.id==solid.materialId}),
              let young=material.youngModulusPa,young>0 else {
            throw NativeWorldLabError.invalid("Assign a hypothetical positive Young's modulus")
        }
        let length=solid.dimensionsMeters[0]
        let depth=solid.dimensionsMeters[1]
        let width=solid.dimensionsMeters[2]
        guard length/depth>=5 else {
            throw NativeWorldLabError.invalid("Beam length must be at least five times its depth")
        }
        let secondMoment=width*depth*depth*depth/12
        let stiffness=young*secondMoment
        let displacement=forceN*length*length*length/(3*stiffness)
        let stress=forceN*length*depth/(2*secondMoment)
        let strain=stress/young
        guard [secondMoment,stiffness,displacement,stress,strain].allSatisfy({$0.isFinite}),
              stiffness>0 else {
            throw NativeWorldLabError.invalid("Bending exceeds finite numerical limits")
        }
        guard displacement<=length*0.1,strain<=0.01 else {
            throw NativeWorldLabError.invalid("Bending exceeds the small-deformation reference domain")
        }
        return NativeLabBeamBendingResult(projectId:project.id,
            projectRevision:project.revision,entityId:solid.id,
            materialId:material.id,forceN:forceN,lengthM:length,
            depthM:depth,widthM:width,assumedYoungModulusPa:young,
            secondMomentM4:secondMoment,bendingStiffnessNm2:stiffness,
            tipDeflectionM:displacement,maximumStressPa:stress,
            surfaceStrain:strain)
    }
}


/// Pure one-dimensional impact event. Never claims arbitrary 3D rigid-body contact.
struct NativeLabCollisionSample {
    let timeSeconds:Double
    let leftCenterXM:Double
    let rightCenterXM:Double
    let leftVelocityMps:Double
    let rightVelocityMps:Double
    let collided:Bool
}
struct NativeLabCollisionResult {
    let projectId:String
    let projectRevision:Int
    let leftEntityId:String
    let rightEntityId:String
    let leftMaterialId:String
    let rightMaterialId:String
    let leftMassKg:Double
    let rightMassKg:Double
    let leftStartXM:Double
    let rightStartXM:Double
    let leftHalfWidthM:Double
    let rightHalfWidthM:Double
    let leftInitialVelocityMps:Double
    let rightInitialVelocityMps:Double
    let restitution:Double
    let durationSeconds:Double
    let impactTimeSeconds:Double
    let contactXM:Double
    let leftFinalVelocityMps:Double
    let rightFinalVelocityMps:Double
    let impulseNs:Double
    let momentumBeforeKgMps:Double
    let momentumAfterKgMps:Double
    let energyBeforeJ:Double
    let energyAfterJ:Double
    let dissipatedEnergyJ:Double
    let evidence="physics-model-computed"
    let inputEvidence="hypothetical-user-assumed"
    let validity="Single instantaneous, frictionless central impact of ideal rigid primitives sharing Y/Z centres. No rotations, ground friction, 3D joint constraints, deformable contact, breakage, fatigue or secondary impacts. Both inertial masses come from invented user-assumed densities; restitution is not measured."
    func sample(_ time:Double)throws->NativeLabCollisionSample {
        guard time.isFinite,time>=0,time<=durationSeconds else {
            throw NativeWorldLabError.invalid("Collision playback time is outside simulation")
        }
        let before=min(time,impactTimeSeconds)
        let after=max(0,time-impactTimeSeconds)
        return NativeLabCollisionSample(timeSeconds:time,
            leftCenterXM:leftStartXM+leftInitialVelocityMps*before+leftFinalVelocityMps*after,
            rightCenterXM:rightStartXM+rightInitialVelocityMps*before+rightFinalVelocityMps*after,
            leftVelocityMps:time<impactTimeSeconds ? leftInitialVelocityMps:leftFinalVelocityMps,
            rightVelocityMps:time<impactTimeSeconds ? rightInitialVelocityMps:rightFinalVelocityMps,
            collided:time>=impactTimeSeconds)
    }
}
enum NativeWorldLabCollision {
    static func evaluate(_ project:NativeWorldLabProject,firstId:String,secondId:String,
        velocityLeftMps:Double,velocityRightMps:Double,
        restitution:Double,durationSeconds:Double=4)throws->NativeLabCollisionResult {
        guard firstId != secondId,
              let a=project.entities.first(where:{$0.id==firstId}),
              let b=project.entities.first(where:{$0.id==secondId}) else {
            throw NativeWorldLabError.invalid("Choose two different existing physical solids")
        }
        guard ["box","sphere","cylinder"].contains(a.shape),
              ["box","sphere","cylinder"].contains(b.shape) else {
            throw NativeWorldLabError.invalid("Central impact supports box, sphere or cylinder primitives")
        }
        let left=a.positionMeters[0]<b.positionMeters[0] ? a:b
        let right=left.id==a.id ? b:a
        guard left.positionMeters[0]<right.positionMeters[0],
              abs(left.positionMeters[1]-right.positionMeters[1])<=1e-8,
              abs(left.positionMeters[2]-right.positionMeters[2])<=1e-8 else {
            throw NativeWorldLabError.invalid("Boxes need distinct X positions and aligned Y/Z centres")
        }
        let hl=left.dimensionsMeters[0]/2
        let hr=right.dimensionsMeters[0]/2
        let gap=right.positionMeters[0]-hr-(left.positionMeters[0]+hl)
        guard gap>1e-9 else {
            throw NativeWorldLabError.invalid("Collision solids must begin separated without overlap")
        }
        guard [velocityLeftMps,velocityRightMps,restitution,durationSeconds].allSatisfy({$0.isFinite}),
              abs(velocityLeftMps)<=100,abs(velocityRightMps)<=100,
              restitution>=0,restitution<=1,durationSeconds>0,durationSeconds<=30 else {
            throw NativeWorldLabError.invalid("Finite velocities ±100 m/s, restitution 0 to 1 and duration (0,30] s required")
        }
        let relative=velocityLeftMps-velocityRightMps
        guard relative>0 else {
            throw NativeWorldLabError.invalid("The left solid must approach the right solid")
        }
        let hitTime=gap/relative
        guard hitTime<=durationSeconds else {
            throw NativeWorldLabError.invalid("No contact within selected simulation duration")
        }
        guard let leftMaterial=project.materials.first(where:{$0.id==left.materialId}),
              let rightMaterial=project.materials.first(where:{$0.id==right.materialId}),
              let dl=leftMaterial.densityKgM3,let dr=rightMaterial.densityKgM3 else {
            throw NativeWorldLabError.invalid("Both objects require invented assumed densities")
        }
        let ml=dl*left.volumeMetersCubed
        let mr=dr*right.volumeMetersCubed
        guard ml.isFinite,mr.isFinite,ml>=0.001,mr>=0.001,ml<=10000,mr<=10000 else {
            throw NativeWorldLabError.invalid("Inertial mass must be finite between 0.001 and 10000 kg")
        }
        let impulse=(1+restitution)*relative/(1/ml+1/mr)
        let vl=velocityLeftMps-impulse/ml
        let vr=velocityRightMps+impulse/mr
        let momentumBefore=ml*velocityLeftMps+mr*velocityRightMps
        let momentumAfter=ml*vl+mr*vr
        let energyBefore=0.5*(ml*velocityLeftMps*velocityLeftMps+
            mr*velocityRightMps*velocityRightMps)
        let energyAfter=0.5*(ml*vl*vl+mr*vr*vr)
        let lost=0.5*(ml*mr/(ml+mr))*(1-restitution*restitution)*relative*relative
        let contact=left.positionMeters[0]+hl+velocityLeftMps*hitTime
        guard [impulse,vl,vr,momentumBefore,momentumAfter,energyBefore,
               energyAfter,lost,contact].allSatisfy({$0.isFinite}),
              abs(momentumBefore-momentumAfter)<=1e-8*max(1,abs(momentumBefore)),
              abs(energyBefore-energyAfter-lost)<=1e-8*max(1,energyBefore),
              energyAfter<=energyBefore+1e-8*max(1,energyBefore) else {
            throw NativeWorldLabError.invalid("Collision conservation check exceeds numerical tolerance")
        }
        return NativeLabCollisionResult(projectId:project.id,
            projectRevision:project.revision,leftEntityId:left.id,
            rightEntityId:right.id,leftMaterialId:leftMaterial.id,
            rightMaterialId:rightMaterial.id,leftMassKg:ml,rightMassKg:mr,
            leftStartXM:left.positionMeters[0],rightStartXM:right.positionMeters[0],
            leftHalfWidthM:hl,rightHalfWidthM:hr,
            leftInitialVelocityMps:velocityLeftMps,
            rightInitialVelocityMps:velocityRightMps,
            restitution:restitution,durationSeconds:durationSeconds,
            impactTimeSeconds:hitTime,contactXM:contact,
            leftFinalVelocityMps:vl,rightFinalVelocityMps:vr,
            impulseNs:impulse,momentumBeforeKgMps:momentumBefore,
            momentumAfterKgMps:momentumAfter,energyBeforeJ:energyBefore,
            energyAfterJ:energyAfter,dissipatedEnergyJ:lost)
    }
}
