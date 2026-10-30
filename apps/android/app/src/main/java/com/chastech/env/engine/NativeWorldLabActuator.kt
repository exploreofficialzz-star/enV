package com.chastech.env.engine

import kotlin.math.*

/**
 * One-axis R-L motor/coil coupled to a lifted solid. The same k represents
 * force per ampere and speed-induced back-EMF; this is an illustrative
 * reference, NOT certified motor/aircraft/material performance.
 */
data class NativeActuatorInput(
    val massKg:Double,
    val gravityMps2:Double=9.80665,
    val initialHeightM:Double=0.0,
    val supplyVoltageV:Double=24.0,
    val resistanceOhm:Double=2.0,
    val inductanceH:Double=0.3,
    val forceConstantNPerA:Double=8.0,
    val dampingNsPerM:Double=0.5,
    val durationSeconds:Double=4.0
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
    val energyResidualJ:Double
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
    private fun derivative(s:DoubleArray,i:NativeActuatorInput):DoubleArray{
        val v=s[1];val current=s[2]
        return doubleArrayOf(v,
            (i.forceConstantNPerA*current-i.dampingNsPerM*v)/i.massKg-i.gravityMps2,
            (i.supplyVoltageV-i.resistanceOhm*current-i.forceConstantNPerA*v)/i.inductanceH)
    }
    private fun step(s:DoubleArray,i:NativeActuatorInput,dt:Double,clamp:Boolean):DoubleArray{
        val k1=derivative(s,i)
        fun shifted(k:DoubleArray,f:Double)=DoubleArray(3){j->s[j]+dt*k[j]*f}
        val k2=derivative(shifted(k1,0.5),i)
        val k3=derivative(shifted(k2,0.5),i)
        val k4=derivative(shifted(k3,1.0),i)
        val n=DoubleArray(3){j->s[j]+dt*(k1[j]+2*k2[j]+2*k3[j]+k4[j])/6}
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
        val rate=max(1.0,max(i.resistanceOhm/i.inductanceH,
            max(i.dampingNsPerM/i.massKg,i.forceConstantNPerA/sqrt(i.inductanceH*i.massKg))))
        val steps=ceil(i.durationSeconds/min(requestedStepSeconds,0.06/rate)).toInt()
        require(steps<=50000){"The actuator needs a specialized stiff solver"}
        val dt=i.durationSeconds/steps
        var state=doubleArrayOf(i.initialHeightM,0.0,0.0)
        var supplied=0.0;var dissipated=0.0
        val initialEnergy=i.massKg*i.gravityMps2*i.initialHeightM
        val output=ArrayList<NativeActuatorSample>(steps+1)
        for(n in 0..steps){
            val h=state[0];val v=state[1];val a=state[2]
            val ke=0.5*i.massKg*v*v
            val pe=i.massKg*i.gravityMps2*h
            val magnetic=0.5*i.inductanceH*a*a
            require(listOf(h,v,a,ke,pe,magnetic,supplied,dissipated).all{it.isFinite()} &&
                abs(a)<1e7&&abs(v)<1e5&&h<1e5){"Actuator exceeded stability envelope"}
            output.add(NativeActuatorSample(
                n*dt,h,v,a,i.forceConstantNPerA*a,i.forceConstantNPerA*v,
                i.resistanceOhm*a*a,i.supplyVoltageV*a,ke,pe,magnetic,
                supplied+initialEnergy-ke-pe-magnetic-dissipated))
            if(n==steps)break
            val next=step(state,i,dt,true)
            val c2=next[2];val v2=next[1]
            supplied+=0.5*dt*i.supplyVoltageV*(a+c2)
            dissipated+=0.5*dt*(i.resistanceOhm*(a*a+c2*c2)+i.dampingNsPerM*(v*v+v2*v2))
            if(next[0]==0.0 && v2==0.0 && (h>0||v<0)){
                val raw=step(state,i,dt,false)
                if(raw[1]<0)dissipated+=0.5*i.massKg*raw[1]*raw[1]
            }
            state=next
        }
        return NativeActuatorResult(output,dt)
    }
}
