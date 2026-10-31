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
struct NativeLabCollisionResult:Encodable {
    let format="env-world-lab-object-collision"
    let modelVersion="1.0.0"
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
        let energyBefore=0.5*(ml*velocityLeftMps*velocityLeftMps+mr*velocityRightMps*velocityRightMps)
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


/// A single frictionless first-contact impulse for two nonrotating spherical solids.
struct NativeSphereImpactSample {
    let timeSeconds:Double
    let firstCentreM:[Double]
    let secondCentreM:[Double]
    let firstVelocityMps:[Double]
    let secondVelocityMps:[Double]
    let collided:Bool
}
struct NativeSphereImpactResult:Encodable {
    let format="env-world-lab-sphere-impact-3d"
    let modelVersion="1.0.0"
    let evidence="physics-model-computed"
    let assumptionEvidence="hypothetical-user-assumed"
    let projectId:String
    let projectRevision:Int
    let firstEntityId:String
    let secondEntityId:String
    let firstMaterialId:String
    let secondMaterialId:String
    let initialFirstCentreM:[Double]
    let initialSecondCentreM:[Double]
    let firstInitialVelocityMps:[Double]
    let secondInitialVelocityMps:[Double]
    let firstFinalVelocityMps:[Double]
    let secondFinalVelocityMps:[Double]
    let firstRadiusM:Double
    let secondRadiusM:Double
    let firstMassKg:Double
    let secondMassKg:Double
    let impactTimeSeconds:Double
    let durationSeconds:Double
    let restitution:Double
    let impactNormal:[Double]
    let impulseNs:[Double]
    let momentumBeforeKgMps:[Double]
    let momentumAfterKgMps:[Double]
    let angularMomentumBeforeKgM2PerS:[Double]
    let angularMomentumAfterKgM2PerS:[Double]
    let energyBeforeJ:Double
    let energyAfterJ:Double
    let dissipatedEnergyJ:Double
    let validity="One first contact of two ideal smooth, nonrotating rigid spheres in force-free 3D space; instantaneous frictionless normal impulse. No gravitation, obstacles, walls, spin, rolling, deformability, fracture, or secondary contact. Density and restitution are invented user assumptions, not measured evidence."
    func sample(_ time:Double)throws->NativeSphereImpactSample {
        guard time.isFinite,time>=0,time<=durationSeconds else {
            throw NativeWorldLabError.invalid("Sphere playback time is outside simulated interval")
        }
        let before=min(time,impactTimeSeconds)
        let after=max(0,time-impactTimeSeconds)
        func trajectory(_ p:[Double],_ v:[Double],_ w:[Double])->[Double] {
            (0..<3).map{i in p[i]+v[i]*before+w[i]*after}
        }
        return NativeSphereImpactSample(timeSeconds:time,
            firstCentreM:trajectory(initialFirstCentreM,
                firstInitialVelocityMps,firstFinalVelocityMps),
            secondCentreM:trajectory(initialSecondCentreM,
                secondInitialVelocityMps,secondFinalVelocityMps),
            firstVelocityMps:time<impactTimeSeconds ? firstInitialVelocityMps:firstFinalVelocityMps,
            secondVelocityMps:time<impactTimeSeconds ? secondInitialVelocityMps:secondFinalVelocityMps,
            collided:time>=impactTimeSeconds)
    }
}
enum NativeWorldLabSphereImpact {
    private static func add(_ a:[Double],_ b:[Double])->[Double] {
        (0..<3).map{i in a[i]+b[i]}
    }
    private static func sub(_ a:[Double],_ b:[Double])->[Double] {
        (0..<3).map{i in a[i]-b[i]}
    }
    private static func scale(_ a:[Double],_ value:Double)->[Double] {
        a.map{$0*value}
    }
    private static func dot(_ a:[Double],_ b:[Double])->Double {
        (0..<3).reduce(0){sum,i in sum+a[i]*b[i]}
    }
    private static func norm(_ a:[Double])->Double {sqrt(dot(a,a))}
    private static func cross(_ a:[Double],_ b:[Double])->[Double] {
        [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
    }
    static func evaluate(_ project:NativeWorldLabProject,
        firstId:String,secondId:String,
        firstVelocityMps:[Double],secondVelocityMps:[Double],
        restitution:Double,durationSeconds:Double=4)throws->NativeSphereImpactResult {
        guard firstId != secondId,
              let a=project.entities.first(where:{$0.id==firstId}),
              let b=project.entities.first(where:{$0.id==secondId}),
              a.shape=="sphere",b.shape=="sphere" else {
            throw NativeWorldLabError.invalid("Real spatial contact needs two distinct spheres")
        }
        guard firstVelocityMps.count==3,secondVelocityMps.count==3,
              firstVelocityMps.allSatisfy({$0.isFinite}),
              secondVelocityMps.allSatisfy({$0.isFinite}),
              norm(firstVelocityMps)<=100,norm(secondVelocityMps)<=100,
              restitution.isFinite,restitution>=0,restitution<=1,
              durationSeconds.isFinite,durationSeconds>0,durationSeconds<=30 else {
            throw NativeWorldLabError.invalid("Sphere velocities <=100 m/s, restitution 0–1 and duration (0,30] s")
        }
        let pa=a.positionMeters
        let pb=b.positionMeters
        let ra=a.dimensionsMeters[0]/2
        let rb=b.dimensionsMeters[0]/2
        let d=sub(pb,pa)
        let rel=sub(secondVelocityMps,firstVelocityMps)
        let radius=ra+rb
        guard norm(d)>radius+1e-9 else {
            throw NativeWorldLabError.invalid("Spheres must start separated, never touching or overlapping")
        }
        let qa=dot(rel,rel)
        let qb=2*dot(d,rel)
        let qc=dot(d,d)-radius*radius
        guard qa>0,qb<0 else {
            throw NativeWorldLabError.invalid("Sphere velocities must initially approach")
        }
        let discriminant=qb*qb-4*qa*qc
        guard discriminant>=0 else {
            throw NativeWorldLabError.invalid("These spheres miss one another")
        }
        let hit=(-qb-sqrt(discriminant))/(2*qa)
        guard hit.isFinite,hit>=0,hit<=durationSeconds else {
            throw NativeWorldLabError.invalid("No 3D sphere collision occurs within duration")
        }
        let n=scale(add(d,scale(rel,hit)),1/radius)
        let closing=dot(rel,n)
        guard abs(norm(n)-1)<=1e-7,closing < -1e-10 else {
            throw NativeWorldLabError.invalid("Sphere contact is non-inward or lacks geometric validity")
        }
        guard let matA=project.materials.first(where:{$0.id==a.materialId}),
              let matB=project.materials.first(where:{$0.id==b.materialId}),
              let rhoA=matA.densityKgM3,let rhoB=matB.densityKgM3 else {
            throw NativeWorldLabError.invalid("Both spheres require assumed invented densities")
        }
        let ma=rhoA*a.volumeMetersCubed
        let mb=rhoB*b.volumeMetersCubed
        guard ma.isFinite,mb.isFinite,ma>=0.001,mb>=0.001,
              ma<=10000,mb<=10000 else {
            throw NativeWorldLabError.invalid("Sphere inertial mass must be 0.001–10000 kg")
        }
        let impulse=scale(n,-(1+restitution)*closing/(1/ma+1/mb))
        let va=sub(firstVelocityMps,scale(impulse,1/ma))
        let vb=add(secondVelocityMps,scale(impulse,1/mb))
        let pBefore=add(scale(firstVelocityMps,ma),scale(secondVelocityMps,mb))
        let pAfter=add(scale(va,ma),scale(vb,mb))
        let eBefore=0.5*(ma*dot(firstVelocityMps,firstVelocityMps)+mb*dot(secondVelocityMps,secondVelocityMps))
        let eAfter=0.5*(ma*dot(va,va)+mb*dot(vb,vb))
        let lost=0.5*ma*mb/(ma+mb)*(1-restitution*restitution)*closing*closing
        let hitA=add(pa,scale(firstVelocityMps,hit))
        let hitB=add(pb,scale(secondVelocityMps,hit))
        let angularBefore=add(scale(cross(hitA,firstVelocityMps),ma),
            scale(cross(hitB,secondVelocityMps),mb))
        let angularAfter=add(scale(cross(hitA,va),ma),scale(cross(hitB,vb),mb))
        let tol=1e-8
        guard (impulse+va+vb+pBefore+pAfter+angularBefore+angularAfter).allSatisfy({$0.isFinite}),
              [eBefore,eAfter,lost].allSatisfy({$0.isFinite}),
              norm(sub(pBefore,pAfter))<=tol*max(1,norm(pBefore)),
              norm(sub(angularBefore,angularAfter))<=tol*max(1,norm(angularBefore)),
              abs(eBefore-eAfter-lost)<=tol*max(1,eBefore),
              eAfter<=eBefore+tol*max(1,eBefore) else {
            throw NativeWorldLabError.invalid("3D contact violated energy or momentum conservation")
        }
        return NativeSphereImpactResult(projectId:project.id,
            projectRevision:project.revision,firstEntityId:a.id,secondEntityId:b.id,
            firstMaterialId:matA.id,secondMaterialId:matB.id,
            initialFirstCentreM:pa,initialSecondCentreM:pb,
            firstInitialVelocityMps:firstVelocityMps,secondInitialVelocityMps:secondVelocityMps,
            firstFinalVelocityMps:va,secondFinalVelocityMps:vb,
            firstRadiusM:ra,secondRadiusM:rb,firstMassKg:ma,secondMassKg:mb,
            impactTimeSeconds:hit,durationSeconds:durationSeconds,restitution:restitution,
            impactNormal:n,impulseNs:impulse,
            momentumBeforeKgMps:pBefore,momentumAfterKgMps:pAfter,
            angularMomentumBeforeKgM2PerS:angularBefore,
            angularMomentumAfterKgM2PerS:angularAfter,
            energyBeforeJ:eBefore,energyAfterJ:eAfter,dissipatedEnergyJ:lost)
    }
}


/// Local exact event-based multi-sphere physics. All mass/restitution assumptions
/// are user-defined, with isolated or disjoint simultaneous smooth hard-sphere impacts.
private struct GroupVector {
    let x:Double
    let y:Double
    let z:Double
    init(_ a:[Double]) {x=a[0];y=a[1];z=a[2]}
    init(_ x:Double,_ y:Double,_ z:Double){self.x=x;self.y=y;self.z=z}
    static func +(a:Self,b:Self)->Self{Self(a.x+b.x,a.y+b.y,a.z+b.z)}
    static func -(a:Self,b:Self)->Self{Self(a.x-b.x,a.y-b.y,a.z-b.z)}
    static func *(a:Self,k:Double)->Self{Self(a.x*k,a.y*k,a.z*k)}
    func dot(_ b:Self)->Double{x*b.x+y*b.y+z*b.z}
    func cross(_ b:Self)->Self {
        Self(y*b.z-z*b.y,z*b.x-x*b.z,x*b.y-y*b.x)
    }
    var length:Double{sqrt(dot(self))}
    var finite:Bool{x.isFinite && y.isFinite && z.isFinite}
    var values:[Double]{[x,y,z]}
}
struct NativeGroupSphereStart:Encodable {
    let entityId:String
    let materialId:String
    let radiusM:Double
    let massKg:Double
    let positionM:[Double]
    let velocityMps:[Double]
}
struct NativeGroupSphereEvent:Encodable {
    let atSeconds:Double
    let firstEntityId:String
    let secondEntityId:String
    let contactNormal:[Double]
    let impulseNs:[Double]
    let energyLostJ:Double
    let totalEnergyAfterJ:Double
    let totalMomentumAfterKgMps:[Double]
}
struct NativeGroupSphereSample {
    let entityId:String
    let positionM:[Double]
    let velocityMps:[Double]
}
struct NativeGroupFrame {
    let timeSeconds:Double
    let completedEvents:Int
    let objects:[NativeGroupSphereSample]
}
struct NativeGroupSphereRun:Encodable {
    let format="env-world-lab-multi-sphere-impact"
    let modelVersion="1.0.0"
    let evidence="physics-model-computed"
    let materialEvidence="hypothetical-user-assumed"
    let projectId:String
    let projectRevision:Int
    let initial:[NativeGroupSphereStart]
    let restitution:Double
    let durationSeconds:Double
    let events:[NativeGroupSphereEvent]
    let totalInitialEnergyJ:Double
    let totalFinalEnergyJ:Double
    let totalDissipatedEnergyJ:Double
    let initialMomentumKgMps:[Double]
    let finalMomentumKgMps:[Double]
    let initialAngularMomentumKgM2PerS:[Double]
    let finalAngularMomentumKgM2PerS:[Double]
    let validity="Exact event-driven free-flight hard spheres (2–12), with isolated or disjoint simultaneous frictionless binary contacts. No shared-sphere multi-contact resolution, external gravity, rotation, friction, walls, joints, deformation, fracture or measured material properties. Inertial densities and restitution are user-assumed."

    func sample(_ t:Double)throws->NativeGroupFrame{
        guard t.isFinite,t>=0,t<=durationSeconds else {
            throw NativeWorldLabError.invalid("Group sample is outside run duration")
        }
        var positions=Dictionary(uniqueKeysWithValues:initial.map{
            ($0.entityId,GroupVector($0.positionM))
        })
        var speeds=Dictionary(uniqueKeysWithValues:initial.map{
            ($0.entityId,GroupVector($0.velocityMps))
        })
        let masses=Dictionary(uniqueKeysWithValues:initial.map{
            ($0.entityId,$0.massKg)
        })
        var elapsed=0.0
        var completed=0
        func advance(_ dt:Double){
            for (id,pos) in positions {
                if let speed=speeds[id] {positions[id]=pos+speed*dt}
            }
        }
        for event in events {
            if event.atSeconds>t {break}
            advance(event.atSeconds-elapsed)
            elapsed=event.atSeconds
            completed+=1
            let impulse=GroupVector(event.impulseNs)
            if let v=speeds[event.firstEntityId],let m=masses[event.firstEntityId]{
                speeds[event.firstEntityId]=v-impulse*(1/m)
            }
            if let v=speeds[event.secondEntityId],let m=masses[event.secondEntityId]{
                speeds[event.secondEntityId]=v+impulse*(1/m)
            }
        }
        advance(t-elapsed)
        return NativeGroupFrame(timeSeconds:t,completedEvents:completed,
            objects:initial.map{start in
                NativeGroupSphereSample(entityId:start.entityId,
                    positionM:positions[start.entityId]?.values ?? start.positionM,
                    velocityMps:speeds[start.entityId]?.values ?? start.velocityMps)
            })
    }
}
enum NativeWorldLabMultiSphere {
    private struct Moving {
        let id:String
        let materialId:String
        let radius:Double
        let mass:Double
        var position:GroupVector
        var velocity:GroupVector
    }
    private static let tolerance=1e-8
    private static func momentum(_ bodies:[Moving])->GroupVector {
        bodies.reduce(GroupVector(0,0,0)){$0+$1.velocity*$1.mass}
    }
    private static func angular(_ bodies:[Moving])->GroupVector {
        bodies.reduce(GroupVector(0,0,0)){
            $0+$1.position.cross($1.velocity)*$1.mass
        }
    }
    private static func energy(_ bodies:[Moving])->Double {
        bodies.reduce(0.0){$0+0.5*$1.mass*$1.velocity.dot($1.velocity)}
    }
    private static func nextContact(_ a:Moving,_ b:Moving)throws->Double?{
        let d=b.position-a.position
        let v=b.velocity-a.velocity
        let radius=a.radius+b.radius
        let c=d.dot(d)-radius*radius
        guard c >= -tolerance else {
            throw NativeWorldLabError.invalid("Sphere overlap preceded an impact event")
        }
        let aa=v.dot(v)
        let bb=2*d.dot(v)
        if aa<=1e-18 || bb>=(-1e-12){return nil}
        let disc=bb*bb-4*aa*c
        if disc<0 {return nil}
        let t=(-bb-sqrt(max(0,disc)))/(2*aa)
        if t<=tolerance || (d+v*t).dot(v)>=(-1e-10){return nil}
        return t
    }
    static func evaluate(_ project:NativeWorldLabProject,
        velocities:[String:[Double]],restitution:Double,
        durationSeconds:Double=5)throws->NativeGroupSphereRun{
        let spheres=project.entities.filter{$0.shape=="sphere"}
        guard (2...12).contains(spheres.count),restitution.isFinite,
              restitution>=0,restitution<=1,durationSeconds.isFinite,
              durationSeconds>0,durationSeconds<=30 else {
            throw NativeWorldLabError.invalid("Group requires 2–12 spheres, finite restitution 0–1 and duration (0,30]")
        }
        let ids=Set(spheres.map{$0.id})
        guard Set(velocities.keys).isSubset(of:ids) else {
            throw NativeWorldLabError.invalid("Unrecognized sphere velocity ID")
        }
        var bodies=[Moving]()
        for sphere in spheres {
            guard let material=project.materials.first(where:{$0.id==sphere.materialId}),
                  let density=material.densityKgM3 else {
                throw NativeWorldLabError.invalid("Every invented sphere needs a positive assumed density")
            }
            let mass=density*sphere.volumeMetersCubed
            let velocity=velocities[sphere.id] ?? [0,0,0]
            guard mass.isFinite,mass>=0.001,mass<=10000,velocity.count==3,
                  velocity.allSatisfy({$0.isFinite}) else {
                throw NativeWorldLabError.invalid("Sphere mass or velocity is outside finite supported bounds")
            }
            let v=GroupVector(velocity)
            guard v.length<=100 else {
                throw NativeWorldLabError.invalid("Invented sphere speed exceeds 100 m/s")
            }
            bodies.append(Moving(id:sphere.id,materialId:material.id,
                radius:sphere.dimensionsMeters[0]/2,mass:mass,
                position:GroupVector(sphere.positionMeters),velocity:v))
        }
        for i in bodies.indices {
            for j in (i+1)..<bodies.count {
                guard (bodies[j].position-bodies[i].position).length > bodies[i].radius+bodies[j].radius+tolerance else {
                    throw NativeWorldLabError.invalid("Group spheres must start separated, not touching")
                }
            }
        }
        let initial=bodies.map{
            NativeGroupSphereStart(entityId:$0.id,materialId:$0.materialId,
                radiusM:$0.radius,massKg:$0.mass,
                positionM:$0.position.values,velocityMps:$0.velocity.values)
        }
        let energyInitially=energy(bodies)
        let pInitially=momentum(bodies)
        let lInitially=angular(bodies)
        var events=[NativeGroupSphereEvent]()
        var time=0.0
        var lossTotal=0.0
        while time<durationSeconds-tolerance {
            var shortest=Double.infinity
            var ties=[(Int,Int)]()
            for i in bodies.indices {
                for j in (i+1)..<bodies.count {
                    guard let dt=try nextContact(bodies[i],bodies[j]),
                          time+dt<=durationSeconds+tolerance else {continue}
                    if dt<shortest-tolerance {
                        shortest=dt;ties=[(i,j)]
                    }else if abs(dt-shortest)<=tolerance {ties.append((i,j))}
                }
            }
            if !shortest.isFinite {break}
            // Contacts on disjoint sphere pairs can occur at one instant.
            // A shared sphere would require an unvalidated multi-contact law.
            var participants=Set<Int>()
            for (i,j) in ties {
                guard participants.insert(i).inserted,
                      participants.insert(j).inserted else {
                    throw NativeWorldLabError.invalid(
                        "Simultaneous shared-sphere multi-contact is unsupported")
                }
            }
            guard events.count+ties.count<=128 else {
                throw NativeWorldLabError.invalid("Sphere event-limit case is unsupported")
            }
            for k in bodies.indices {
                bodies[k].position=bodies[k].position+bodies[k].velocity*shortest
            }
            time+=shortest
            for (i,j) in ties {
                let d=bodies[j].position-bodies[i].position
                let distance=d.length
                guard abs(distance-bodies[i].radius-bodies[j].radius)<1e-6 else {
                    throw NativeWorldLabError.invalid("Sphere contact geometry failed")
                }
                let normal=d*(1/distance)
                let closing=(bodies[j].velocity-bodies[i].velocity).dot(normal)
                guard closing < (-1e-10) else {
                    throw NativeWorldLabError.invalid("Contact is not closing along its normal")
                }
                let beforeEnergy=energy(bodies)
                let beforeP=momentum(bodies)
                let beforeL=angular(bodies)
                let mi=bodies[i].mass
                let mj=bodies[j].mass
                let impulse=normal*(-(1+restitution)*closing/(1/mi+1/mj))
                bodies[i].velocity=bodies[i].velocity-impulse*(1/mi)
                bodies[j].velocity=bodies[j].velocity+impulse*(1/mj)
                let afterEnergy=energy(bodies)
                let loss=0.5*mi*mj/(mi+mj)*(1-restitution*restitution)*closing*closing
                guard [afterEnergy,loss].allSatisfy({$0.isFinite}),
                      (beforeP-momentum(bodies)).length<=1e-8*max(1,beforeP.length),
                      (beforeL-angular(bodies)).length<=1e-8*max(1,beforeL.length),
                      abs(beforeEnergy-afterEnergy-loss)<=1e-8*max(1,beforeEnergy) else {
                    throw NativeWorldLabError.invalid("Multi-sphere impulse conservation audit failed")
                }
                lossTotal+=loss
                events.append(NativeGroupSphereEvent(atSeconds:time,
                    firstEntityId:bodies[i].id,secondEntityId:bodies[j].id,
                    contactNormal:normal.values,impulseNs:impulse.values,
                    energyLostJ:loss,totalEnergyAfterJ:afterEnergy,
                    totalMomentumAfterKgMps:momentum(bodies).values))
            }
        }
        let finalEnergy=energy(bodies)
        let finalP=momentum(bodies)
        let finalL=angular(bodies)
        guard (finalP-pInitially).length<=1e-7*max(1,pInitially.length),
              (finalL-lInitially).length<=1e-7*max(1,lInitially.length),
              abs(energyInitially-finalEnergy-lossTotal)<=1e-7*max(1,energyInitially) else {
            throw NativeWorldLabError.invalid("Multi-sphere group conservation audit failed")
        }
        return NativeGroupSphereRun(projectId:project.id,
            projectRevision:project.revision,initial:initial,
            restitution:restitution,durationSeconds:durationSeconds,
            events:events,totalInitialEnergyJ:energyInitially,
            totalFinalEnergyJ:finalEnergy,totalDissipatedEnergyJ:lossTotal,
            initialMomentumKgMps:pInitially.values,
            finalMomentumKgMps:finalP.values,
            initialAngularMomentumKgM2PerS:lInitially.values,
            finalAngularMomentumKgM2PerS:finalL.values)
    }
}

 
// Local Newtonian reference using the native Swift project decoder.
// This is not a GR solver or measured astronomy.
struct NativeGravityBody:Encodable {
    let entityId:String
    let massKg:Double
    let radiusM:Double
    let initialPositionM:[Double]
    let initialVelocityMps:[Double]
}
struct NativeGravityFrame:Encodable {
    let timeSeconds:Double
    let positionsM:[[Double]]
    let velocitiesMps:[[Double]]
    let totalEnergyJ:Double
    let energyDriftJ:Double
    let totalMomentumKgMps:[Double]
}
struct NativeGravityRun:Encodable {
    let format="env-world-lab-newton-gravity"
    let modelVersion="1.0.0"
    let evidence="physics-model-computed"
    let materialEvidence="hypothetical-user-assumed"
    let gravitationalConstantM3KgS2=6.67430e-11
    let projectId:String
    let projectRevision:Int
    let bodies:[NativeGravityBody]
    let durationSeconds:Double
    let integrationSteps:Int
    let frames:[NativeGravityFrame]
    let initialEnergyJ:Double
    let finalEnergyJ:Double
    let energyDriftFraction:Double
    let validity:String
    func sample(_ t:Double)throws->NativeGravityFrame {
        guard t.isFinite else {throw NativeWorldLabError.invalid("Gravity time must be finite")}
        let time=max(0,min(durationSeconds,t))
        if time<=0{return frames[0]}
        if time>=durationSeconds{return frames[frames.count-1]}
        let hi=max(1,frames.firstIndex(where:{$0.timeSeconds>=time}) ?? frames.count-1)
        let a=frames[hi-1],b=frames[hi]
        let k=(time-a.timeSeconds)/(b.timeSeconds-a.timeSeconds)
        func blend(_ x:[Double],_ y:[Double])->[Double]{
            (0..<3).map{x[$0]+(y[$0]-x[$0])*k}
        }
        return NativeGravityFrame(timeSeconds:time,
            positionsM:zip(a.positionsM,b.positionsM).map{pair in blend(pair.0,pair.1)},
            velocitiesMps:zip(a.velocitiesMps,b.velocitiesMps).map{pair in blend(pair.0,pair.1)},
            totalEnergyJ:a.totalEnergyJ+(b.totalEnergyJ-a.totalEnergyJ)*k,
            energyDriftJ:a.energyDriftJ+(b.energyDriftJ-a.energyDriftJ)*k,
            totalMomentumKgMps:blend(a.totalMomentumKgMps,b.totalMomentumKgMps))
    }
}
enum NativeWorldLabGravity {
    static let G=6.67430e-11
    private static func forces(_ p:[GroupVector],_ bodies:[NativeGravityBody])throws->([GroupVector],Double) {
        var accel=Array(repeating:GroupVector(0,0,0),count:p.count)
        var potential=0.0
        for i in p.indices {
            for j in (i+1)..<p.count {
                let d=p[j]-p[i],r=d.length
                guard r.isFinite && r>bodies[i].radiusM+bodies[j].radiusM+1e-9 else {
                    throw NativeWorldLabError.invalid("Gravity bodies touched or overlapped; impacts are not modeled")
                }
                let scale=G/(r*r*r)
                guard scale.isFinite else {
                    throw NativeWorldLabError.invalid("Newtonian gravity force overflow")
                }
                accel[i]=accel[i]+d*(scale*bodies[j].massKg)
                accel[j]=accel[j]-d*(scale*bodies[i].massKg)
                potential-=G*bodies[i].massKg*bodies[j].massKg/r
            }
        }
        guard potential.isFinite && accel.allSatisfy({$0.finite}) else {
            throw NativeWorldLabError.invalid("Newtonian gravity exceeded finite bounds")
        }
        return (accel,potential)
    }
    private static func audit(_ p:[GroupVector],_ v:[GroupVector],
        _ b:[NativeGravityBody])throws->([GroupVector],Double,GroupVector) {
        let (a,potential)=try forces(p,b)
        var energy=potential,momentum=GroupVector(0,0,0)
        for i in v.indices {
            energy+=0.5*b[i].massKg*v[i].dot(v[i])
            momentum=momentum+v[i]*b[i].massKg
        }
        guard energy.isFinite && momentum.finite else {
            throw NativeWorldLabError.invalid("Gravity energy or momentum overflow")
        }
        return (a,energy,momentum)
    }
    static func evaluate(_ project:NativeWorldLabProject,
        ids:[String],velocities:[String:[Double]],
        durationSeconds:Double=30,integrationSteps:Int=480)throws->NativeGravityRun {
        guard ids.count>=2 && ids.count<=8 && Set(ids).count==ids.count,
              durationSeconds.isFinite && durationSeconds>=0.1 &&
              durationSeconds<=3600 && integrationSteps>=2 && integrationSteps<=1200,
              velocities.keys.allSatisfy({ids.contains($0)}) else {
            throw NativeWorldLabError.invalid("Native gravity requires 2–8 spheres and valid step limits")
        }
        let bodies=try ids.map{ id -> NativeGravityBody in
            guard let solid=project.entities.first(where:{$0.id==id}),
                  solid.shape=="sphere",
                  let material=project.materials.first(where:{$0.id==solid.materialId}),
                  let density=material.densityKgM3 else {
                throw NativeWorldLabError.invalid("Gravity sphere or assumed matter missing")
            }
            let mass=solid.volumeMetersCubed*density
            let speed=velocities[id] ?? [0,0,0]
            guard mass.isFinite && mass>=0.001 && mass<=1e24,
                  speed.count==3 && speed.allSatisfy({$0.isFinite}),
                  GroupVector(speed).length<=1e6 else {
                throw NativeWorldLabError.invalid("Unsupported assumed mass or gravity speed")
            }
            return NativeGravityBody(entityId:id,massKg:mass,
                radiusM:solid.dimensionsMeters[0]/2,
                initialPositionM:solid.positionMeters,initialVelocityMps:speed)
        }
        var positions=bodies.map{GroupVector($0.initialPositionM)}
        var speeds=bodies.map{GroupVector($0.initialVelocityMps)}
        let start=try audit(positions,speeds,bodies)
        var acceleration=start.0
        let dt=durationSeconds/Double(integrationSteps)
        let stride=max(1,(integrationSteps+239)/240)
        var frames:[NativeGravityFrame]=[]
        func snapshot(_ step:Int)throws {
            let sample=try audit(positions,speeds,bodies)
            frames.append(NativeGravityFrame(timeSeconds:Double(step)*dt,
                positionsM:positions.map{$0.values},velocitiesMps:speeds.map{$0.values},
                totalEnergyJ:sample.1,energyDriftJ:sample.1-start.1,
                totalMomentumKgMps:sample.2.values))
        }
        try snapshot(0)
        for step in 1...integrationSteps {
            let nextPos=positions.indices.map{i in
                positions[i]+speeds[i]*dt+acceleration[i]*(0.5*dt*dt)
            }
            let nextA=try forces(nextPos,bodies).0
            let nextV=speeds.indices.map{i in
                speeds[i]+(acceleration[i]+nextA[i])*(0.5*dt)
            }
            positions=nextPos;speeds=nextV;acceleration=nextA
            if step%stride==0 || step==integrationSteps {try snapshot(step)}
        }
        let final=try audit(positions,speeds,bodies)
        let drift=abs(final.1-start.1)/max(1,abs(start.1))
        let typical=max(1,bodies.reduce(0){$0+$1.massKg*GroupVector($1.initialVelocityMps).length})
        guard drift<=0.05 && (final.2-start.2).length<=1e-7*typical else {
            throw NativeWorldLabError.invalid("Gravity numerical conservation audit failed")
        }
        return NativeGravityRun(projectId:project.id,projectRevision:project.revision,
            bodies:bodies,durationSeconds:durationSeconds,integrationSteps:integrationSteps,
            frames:frames,initialEnergyJ:start.1,finalEnergyJ:final.1,
            energyDriftFraction:drift,
            validity:"Newtonian point-mass gravity with invented density, Verlet integration "+
                "and conservation audit. No measurements, relativistic dynamics, impacts or tides.")
    }
}
