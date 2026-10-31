package com.chastech.env.engine

import kotlin.math.*

/**
 * One-axis R-L motor/coil coupled to a lifted solid. The same k represents
 * force per ampere and speed-induced back-EMF; this is an illustrative
 * reference, NOT certified motor/aircraft/material performance.
 */
data class NativeActuatorThermal(
    val initialTemperatureK:Double=293.15,
    val ambientTemperatureK:Double=293.15,
    val heatCapacityJPerK:Double=80.0,
    val coolingWPerK:Double=0.3,
    val resistanceTemperatureCoefficientPerK:Double=0.004
)
data class NativeActuatorInput(
    val massKg:Double,
    val gravityMps2:Double=9.80665,
    val initialHeightM:Double=0.0,
    val supplyVoltageV:Double=24.0,
    val resistanceOhm:Double=2.0,
    val inductanceH:Double=0.3,
    val forceConstantNPerA:Double=8.0,
    val dampingNsPerM:Double=0.5,
    val durationSeconds:Double=4.0,
    val thermal:NativeActuatorThermal?=null
)
data class NativeActuatorSample(
    val timeSeconds:Double,
    val heightM:Double,
    val velocityMps:Double,
    val currentA:Double,
    val motorForceN:Double,
    val backEmfV:Double,
    val resistiveHeatW:Double,
    val sourcePowerW:Double,
    val kineticEnergyJ:Double,
    val gravityEnergyJ:Double,
    val magneticEnergyJ:Double,
    val energyResidualJ:Double,
    val suppliedEnergyJ:Double,
    val dissipatedEnergyJ:Double,
    val coilTemperatureK:Double?=null,
    val coilResistanceOhm:Double?=null,
    val thermalEnergyJ:Double=0.0,
    val coolingPowerW:Double=0.0
)
data class NativeActuatorNumericalAudit(
    val status:String,
    val maximumRelativeStateDifference:Double?,
    val maximumEnergyResidualFraction:Double,
    val explanation:String
)
data class NativeActuatorResult(
    val samples:List<NativeActuatorSample>,val stepSeconds:Double,
    val modelVersion:String="1.0.0",
    val evidence:String="physics-model-computed",
    val inputEvidence:String="hypothetical-user-assumed",
    val validity:String="1D R-L coil, back-EMF, gravity, damping and flat ground; hypothetical parameters, no 3D motor certification."
)
object NativeWorldLabActuator {
    private fun bounded(n:Double,low:Double,high:Double,label:String){
        require(n.isFinite()&&n>=low&&n<=high){"$label outside scientific reference limits"}
    }
    private fun resistance(i:NativeActuatorInput,t:Double):Double {
        val params=i.thermal?:return i.resistanceOhm
        return i.resistanceOhm*(1+params.resistanceTemperatureCoefficientPerK*(t-params.ambientTemperatureK))
    }
    private fun derivative(s:DoubleArray,i:NativeActuatorInput):DoubleArray{
        val v=s[1];val current=s[2];val t=s[3]
        val r=resistance(i,t)
        val heat=r*current*current
        val cooling=i.thermal?.let{it.coolingWPerK*(t-it.ambientTemperatureK)}?:0.0
        val heating=i.thermal?.let{(heat-cooling)/it.heatCapacityJPerK}?:0.0
        // At a resting unilateral stop the object cannot move downward or
        // induce a generator current until the coil can lift its weight.
        if(s[0]<=0.0 && v<=0.0 && i.forceConstantNPerA*current<=i.massKg*i.gravityMps2)
            return doubleArrayOf(0.0,0.0,(i.supplyVoltageV-r*current)/i.inductanceH,heating)
        return doubleArrayOf(v,
            (i.forceConstantNPerA*current-i.dampingNsPerM*v)/i.massKg-i.gravityMps2,
            (i.supplyVoltageV-r*current-i.forceConstantNPerA*v)/i.inductanceH,heating)
    }
    private fun step(s:DoubleArray,i:NativeActuatorInput,dt:Double,clamp:Boolean):DoubleArray{
        val k1=derivative(s,i)
        fun shifted(k:DoubleArray,f:Double)=DoubleArray(4){j->s[j]+dt*k[j]*f}
        val k2=derivative(shifted(k1,0.5),i)
        val k3=derivative(shifted(k2,0.5),i)
        val k4=derivative(shifted(k3,1.0),i)
        val n=DoubleArray(4){j->s[j]+dt*(k1[j]+2*k2[j]+2*k3[j]+k4[j])/6}
        if(clamp&&(n[0]<0||(n[0]==0.0&&n[1]<0))) {n[0]=0.0;n[1]=0.0}
        return n
    }
    fun evaluate(i:NativeActuatorInput,requestedStepSeconds:Double=1.0/240):NativeActuatorResult{
        bounded(i.massKg,0.001,10000.0,"Mass")
        bounded(i.gravityMps2,0.0,100.0,"Gravity")
        bounded(i.initialHeightM,0.0,100.0,"Initial height")
        bounded(i.supplyVoltageV,0.0,1000.0,"Voltage")
        bounded(i.resistanceOhm,0.01,10000.0,"Resistance")
        bounded(i.inductanceH,0.0001,1000.0,"Inductance")
        bounded(i.forceConstantNPerA,0.0,10000.0,"Motor constant")
        bounded(i.dampingNsPerM,0.0,100000.0,"Damping")
        bounded(i.durationSeconds,0.1,12.0,"Duration")
        bounded(requestedStepSeconds,0.0001,0.05,"Step")
        i.thermal?.let{t->
            bounded(t.initialTemperatureK,1.0,1500.0,"Initial temperature")
            bounded(t.ambientTemperatureK,1.0,1500.0,"Ambient temperature")
            bounded(t.heatCapacityJPerK,1.0,1000000.0,"Heat capacity")
            bounded(t.coolingWPerK,0.0,10000.0,"Cooling")
            bounded(t.resistanceTemperatureCoefficientPerK,0.0,0.02,"Temperature coefficient")
            require(resistance(i,t.initialTemperatureK)>=0.01){"Initial hot resistance is invalid"}
        }
        val rate=max(1.0,max(i.resistanceOhm/i.inductanceH,
            max(i.dampingNsPerM/i.massKg,i.forceConstantNPerA/sqrt(i.inductanceH*i.massKg))))
        val steps=ceil(i.durationSeconds/min(requestedStepSeconds,0.06/rate)).toInt()
        require(steps<=50000){"The actuator needs a specialized stiff solver"}
        val dt=i.durationSeconds/steps
        val temp0=i.thermal?.initialTemperatureK?:293.15
        var state=doubleArrayOf(i.initialHeightM,0.0,0.0,temp0)
        var supplied=0.0;var dissipated=0.0
        val initialEnergy=i.massKg*i.gravityMps2*i.initialHeightM
        val output=ArrayList<NativeActuatorSample>(steps+1)
        for(n in 0..steps){
            val h=state[0];val v=state[1];val a=state[2];val t=state[3]
            val r=resistance(i,t)
            val heat=r*a*a
            val cooling=i.thermal?.let{it.coolingWPerK*(t-it.ambientTemperatureK)}?:0.0
            val stored=i.thermal?.let{it.heatCapacityJPerK*(t-temp0)}?:0.0
            val ke=0.5*i.massKg*v*v
            val pe=i.massKg*i.gravityMps2*h
            val magnetic=0.5*i.inductanceH*a*a
            require(listOf(h,v,a,t,r,stored,ke,pe,magnetic,supplied,dissipated).all{it.isFinite()} &&
                r>=0.01&&r<=1e6&&t>=1&&t<=2000&&abs(a)<1e7&&abs(v)<1e5&&h<1e5){"Actuator exceeded stability envelope"}
            output.add(NativeActuatorSample(
                n*dt,h,v,a,i.forceConstantNPerA*a,i.forceConstantNPerA*v,
                heat,i.supplyVoltageV*a,ke,pe,magnetic,
                supplied+initialEnergy-ke-pe-magnetic-stored-dissipated,supplied,dissipated,
                coilTemperatureK=if(i.thermal==null)null else t,
                coilResistanceOhm=if(i.thermal==null)null else r,
                thermalEnergyJ=stored,coolingPowerW=cooling))
            if(n==steps)break
            val next=step(state,i,dt,true)
            val c2=next[2];val v2=next[1]
            supplied+=0.5*dt*i.supplyVoltageV*(a+c2)
            val t2=next[3]
            val heat2=resistance(i,t2)*c2*c2
            val cooling2=i.thermal?.let{it.coolingWPerK*(t2-it.ambientTemperatureK)}?:0.0
            val loss1=i.dampingNsPerM*v*v+(if(i.thermal==null)heat else cooling)
            val loss2=i.dampingNsPerM*v2*v2+(if(i.thermal==null)heat2 else cooling2)
            dissipated+=0.5*dt*(loss1+loss2)
            if(next[0]==0.0 && v2==0.0 && (h>0||v<0)){
                val raw=step(state,i,dt,false)
                if(raw[1]<0)dissipated+=0.5*i.massKg*raw[1]*raw[1]
            }
            state=next
        }
        return NativeActuatorResult(output,dt,
            modelVersion=if(i.thermal==null)"1.0.0" else "1.1.0",
            validity=if(i.thermal==null)"Bounded 1D R-L actuator with hypothetical inputs."
                else "Bounded 1D electrical, thermal and mechanical coupling with "+
                    "hypothetical heat capacity, cooling and resistance feedback; not certified.")
    }

    /**
     * Step-halving and energy bookkeeping audit of this specific local 1D
     * reference model. Internal numerical consistency is not measured proof.
     */
    fun numericalAudit(input:NativeActuatorInput,run:NativeActuatorResult):NativeActuatorNumericalAudit {
        require((run.modelVersion=="1.0.0"||run.modelVersion=="1.1.0") && run.samples.size>=2 &&
            run.stepSeconds.isFinite() && run.stepSeconds>0) {
            "A completed native actuator trajectory is required"
        }
        val start=run.samples.first()
        val initial=start.kineticEnergyJ+start.gravityEnergyJ+start.magneticEnergyJ+start.thermalEnergyJ
        var worstEnergy=0.0
        for(s in run.samples) {
            require(listOf(s.energyResidualJ,s.suppliedEnergyJ,s.dissipatedEnergyJ,
                s.kineticEnergyJ,s.gravityEnergyJ,s.magneticEnergyJ,s.thermalEnergyJ).all{it.isFinite()}) {
                "Non-finite native actuator energy evidence"
            }
            val scale=maxOf(1.0,abs(initial)+abs(s.suppliedEnergyJ),
                abs(s.kineticEnergyJ)+abs(s.gravityEnergyJ)+abs(s.magneticEnergyJ)+abs(s.thermalEnergyJ)+
                    abs(s.dissipatedEnergyJ))
            worstEnergy=max(worstEnergy,abs(s.energyResidualJ)/scale)
        }
        val half=run.stepSeconds/2
        if(half<0.0001) return NativeActuatorNumericalAudit(
            "unavailable",null,worstEnergy,
            "The local solver cannot verify a halved step at this resolution."
        )
        val refined=try {evaluate(input,half)}
            catch(_:IllegalArgumentException) {
                return NativeActuatorNumericalAudit(
                    "unavailable",null,worstEnergy,
                    "The reference solver cannot complete a bounded half-step run."
                )
            }
        var worstState=0.0
        for(s in run.samples) {
            val index=(s.timeSeconds/refined.stepSeconds).roundToInt()
                .coerceIn(0,refined.samples.lastIndex)
            val f=refined.samples[index]
            val dHeight=abs(s.heightM-f.heightM)/maxOf(1.0,abs(s.heightM),abs(f.heightM))
            val dCurrent=abs(s.currentA-f.currentA)/maxOf(1.0,abs(s.currentA),abs(f.currentA))
            require(dHeight.isFinite()&&dCurrent.isFinite()) {
                "Non-finite native actuator step comparison"
            }
            worstState=maxOf(worstState,dHeight,dCurrent)
        }
        val okay=worstState<=0.01 && worstEnergy<=0.02
        return NativeActuatorNumericalAudit(
            if(okay)"within-internal-tolerance" else "outside-internal-tolerance",
            worstState,worstEnergy,
            if(okay)"Internal numerical thresholds met; assumed materials are not verified."
            else "Numerical thresholds exceeded; this trajectory needs review."
        )
    }
}

/** One ideal supply feeding passive DC branches and a dynamic 1D motor. */
data class NativeLabNetworkMotorSample(
    val timeSeconds:Double,val totalSourceCurrentA:Double,
    val totalSourcePowerW:Double,val passiveResistorHeatW:Double,
    val combinedEnergyResidualJ:Double
)
data class NativeLabNetworkMotorRun(
    val projectId:String,val projectRevision:Int,val networkId:String,
    val entityId:String,val dc:NativeLabDcResult,
    val motor:NativeActuatorResult,val samples:List<NativeLabNetworkMotorSample>,
    val validity:String="Ideal voltage source and parallel motor; no finite battery sag or verified materials."
)
object NativeWorldLabNetworkMotor {
    fun evaluate(p:NativeWorldLabProject,n:NativeLabCircuitNetwork,
        entityId:String,massKg:Double,thermal:Boolean):NativeLabNetworkMotorRun {
        val sources=n.components.filter{it.kind=="dc-source"}
        require(sources.size==1){"Connected motor needs exactly one ideal DC source"}
        val source=sources.first()
        val volts=requireNotNull(source.voltageV)
        require(volts>=0){"Reverse-polarity motor coupling is unsupported"}
        require(p.entities.any{it.id==entityId}){"Selected invention has been removed"}
        val dc=NativeWorldLabDc.solve(n,p)
        val input=NativeActuatorInput(massKg=massKg,supplyVoltageV=volts,
            thermal=if(thermal)NativeActuatorThermal() else null)
        val motor=NativeWorldLabActuator.evaluate(input)
        val passiveSourceCurrent=requireNotNull(dc.branchCurrentsA[source.id])
        val samples=motor.samples.map{step->
            val totalCurrent=passiveSourceCurrent-step.currentA
            val totalPower=-volts*totalCurrent
            val residual=step.energyResidualJ+dc.powerResidualW*step.timeSeconds
            require(listOf(totalCurrent,totalPower,residual).all{it.isFinite()}){
                "Nonfinite connected source or motor energy"
            }
            NativeLabNetworkMotorSample(step.timeSeconds,totalCurrent,totalPower,
                dc.resistorHeatW,residual)
        }
        return NativeLabNetworkMotorRun(p.id,p.revision,n.id,entityId,dc,motor,samples)
    }
}


/** Model-only Boolean switch over the existing native electromechanical equations. */
data class NativeDigitalMotorResult(
    val projectId:String,val projectRevision:Int,val networkId:String,
    val outputId:String,val entityId:String,val logicBit:Int,
    val input:NativeActuatorInput,val motor:NativeActuatorResult,
    val validity:String="User-assumed static Boolean logic switches an ideal voltage "+
        "for one bounded 1D motor run. No real chip, switching transient, "+
        "semiconductor, timing, measured material or safety certification."
)
object NativeWorldLabDigitalMotor {
    fun evaluate(project:NativeWorldLabProject,networkId:String,outputId:String,
        entityId:String,massKg:Double,energizedVoltageV:Double=24.0,
        thermal:Boolean=false):NativeDigitalMotorResult {
        require(energizedVoltageV.isFinite()&&energizedVoltageV in 0.0..1000.0){
            "Assumed digital motor voltage outside bounded model"
        }
        require(project.entities.any{it.id==entityId}){"Selected physical invention is missing"}
        val circuit=project.digitalNetworks.firstOrNull{it.id==networkId}
            ?:error("Select an invented digital network")
        require(circuit.outputs.any{it.id==outputId}){"Invented output does not exist"}
        val bit=NativeWorldLabDigitalLogic.evaluate(circuit)[outputId]
            ?:error("Invented indicator cannot be calculated")
        require(bit==0||bit==1){"Invented indicator is not Boolean"}
        val input=NativeActuatorInput(massKg=massKg,
            supplyVoltageV=energizedVoltageV*bit,
            thermal=if(thermal)NativeActuatorThermal() else null)
        val motor=NativeWorldLabActuator.evaluate(input)
        return NativeDigitalMotorResult(project.id,project.revision,networkId,
            outputId,entityId,bit,input,motor)
    }
}
