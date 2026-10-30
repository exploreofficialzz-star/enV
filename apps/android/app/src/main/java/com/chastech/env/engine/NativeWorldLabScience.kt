package com.chastech.env.engine

import kotlin.math.*

/** Three bounded offline science models, matching Web World Lab 1.0.0.
 * Model-computed outputs are NOT measurements, material-strength evidence or 3D collisions.
 */
sealed interface NativeLabInput {
    data class Spring(val massKg:Double=1.0,val springNPerM:Double=4.0,
        val dampingNsPerM:Double=0.5,val x0:Double=0.5,val v0:Double=0.0):NativeLabInput
    data class RC(val resistanceOhm:Double=1000.0,val capacitanceF:Double=0.001,
        val supplyV:Double=10.0,val initialV:Double=0.0):NativeLabInput
    data class Heat(val diffusivityM2S:Double=0.02,val lengthM:Double=2.0,
        val backgroundK:Double=293.15,val centerK:Double=373.15):NativeLabInput
}
data class NativeLabResult(val timeSeconds:Double, val modelVersion:String="1.0.0",
    val xMeters:Double?=null,val velocityMPerS:Double?=null,val mechanicalEnergyJ:Double?=null,
    val voltageV:Double?=null,val currentA:Double?=null,val resistorHeatW:Double?=null,
    val storedEnergyJ:Double?=null,val temperatureK:List<Double>?=null,
    val meanTemperatureK:Double?=null,val peakTemperatureK:Double?=null)

object NativeWorldLabScience {
    const val HEAT_CELLS=21
    private fun domain(n:Double,min:Double,max:Double,label:String){
        require(n.isFinite()&&n>=min&&n<=max){"$label must be finite in [$min, $max]"}
    }
    fun evaluate(input:NativeLabInput, atSeconds:Double):NativeLabResult {
        domain(atSeconds,0.0,30.0,"Simulation time")
        val stable=when(input){
            is NativeLabInput.Spring->{
                domain(input.massKg,0.001,10000.0,"Mass")
                domain(input.springNPerM,0.001,1e6,"Spring stiffness")
                domain(input.dampingNsPerM,0.0,1e5,"Damping")
                domain(input.x0,-10.0,10.0,"Initial position")
                domain(input.v0,-100.0,100.0,"Initial velocity")
                0.08/max(1.0,max(sqrt(input.springNPerM/input.massKg),
                    input.dampingNsPerM/input.massKg))
            }
            is NativeLabInput.RC->{
                domain(input.resistanceOhm,0.001,1e9,"Resistance")
                domain(input.capacitanceF,1e-9,1000.0,"Capacitance")
                domain(input.supplyV,-1000.0,1000.0,"Voltage")
                domain(input.initialV,-1000.0,1000.0,"Initial voltage")
                1.0/240.0
            }
            is NativeLabInput.Heat->{
                domain(input.diffusivityM2S,1e-7,100.0,"Diffusivity")
                domain(input.lengthM,0.1,100.0,"Length")
                domain(input.backgroundK,0.0,2000.0,"Temperature")
                domain(input.centerK,0.0,2000.0,"Center temperature")
                0.45*(input.lengthM/HEAT_CELLS).pow(2)/input.diffusivityM2S
            }
        }
        val requested=if(atSeconds==0.0)0.0 else ceil(atSeconds/min(1.0/240.0,stable))
        require(requested<=50000){"Model exceeds 50,000-step local scientific limit"}
        val steps=requested.toInt()
        val h=if(steps==0)0.0 else atSeconds/steps
        return when(input){
            is NativeLabInput.Spring->{
                var x=input.x0;var v=input.v0
                fun d(x:Double,v:Double)=Pair(v,
                    -(input.springNPerM*x+input.dampingNsPerM*v)/input.massKg)
                repeat(steps){
                    val (a1,b1)=d(x,v)
                    val (a2,b2)=d(x+h*a1/2,v+h*b1/2)
                    val (a3,b3)=d(x+h*a2/2,v+h*b2/2)
                    val (a4,b4)=d(x+h*a3,v+h*b3)
                    x+=h*(a1+2*a2+2*a3+a4)/6
                    v+=h*(b1+2*b2+2*b3+b4)/6
                }
                require(x.isFinite()&&v.isFinite()){"Nonfinite calculated motion"}
                NativeLabResult(atSeconds,xMeters=x,velocityMPerS=v,
                    mechanicalEnergyJ=(input.massKg*v*v+input.springNPerM*x*x)/2)
            }
            is NativeLabInput.RC->{
                val voltage=input.supplyV+(input.initialV-input.supplyV)*
                    exp(-atSeconds/(input.resistanceOhm*input.capacitanceF))
                val current=(input.supplyV-voltage)/input.resistanceOhm
                NativeLabResult(atSeconds,voltageV=voltage,currentA=current,
                    resistorHeatW=current*current*input.resistanceOhm,
                    storedEnergyJ=input.capacitanceF*voltage*voltage/2)
            }
            is NativeLabInput.Heat->{
                var cells=DoubleArray(HEAT_CELLS){i->
                    if(i==HEAT_CELLS/2)input.centerK else input.backgroundK}
                val dx=input.lengthM/HEAT_CELLS
                val ratio=input.diffusivityM2S*h/(dx*dx)
                repeat(steps){
                    val flux=DoubleArray(HEAT_CELLS-1){i->ratio*(cells[i+1]-cells[i])}
                    cells=DoubleArray(HEAT_CELLS){i->
                        cells[i]+(if(i<HEAT_CELLS-1)flux[i] else 0.0)-
                            (if(i>0)flux[i-1] else 0.0)}
                }
                require(cells.all{it.isFinite()&&it>=0.0&&it<=2000.0}){"Invalid temperature field"}
                NativeLabResult(atSeconds,temperatureK=cells.toList(),
                    meanTemperatureK=cells.average(),peakTemperatureK=cells.maxOrNull())
            }
        }
    }
}


/**
 * Native Kotlin reference for an object dropped under gravity with quadratic
 * air resistance and a flat-ground coefficient of restitution.
 * Hypothetical material mass must be supplied from a separately validated project.
 * This is NOT an object-object collision, rotation or fracture solver.
 */
data class NativeDropInput(
    val massKg:Double,
    val supportingHalfHeightM:Double,
    val dropHeightM:Double=5.0,
    val initialVelocityMps:Double=0.0,
    val gravityMps2:Double=9.80665,
    val airDensityKgM3:Double=1.225,
    val projectedAreaM2:Double,
    val dragCoefficient:Double=0.47,
    val restitution:Double=0.3,
    val durationSeconds:Double=6.0
)
data class NativeDropSample(
    val timeSeconds:Double,
    val heightAboveGroundM:Double,
    val velocityMps:Double,
    val kineticEnergyJ:Double,
    val gravitationalEnergyJ:Double,
    val grounded:Boolean
)
data class NativeDropResult(
    val samples:List<NativeDropSample>,
    val impactCount:Int,
    val stepSeconds:Double,
    val modelVersion:String="1.0.0",
    val evidence:String="physics-model-computed",
    val inputEvidence:String="hypothetical-user-assumed",
    val validity:String="Bounded 1D centre-of-mass gravity, quadratic drag and flat-ground contact; no rotation or material failure."
)
object NativeWorldLabDropScience {
    private fun valid(n:Double,min:Double,max:Double,label:String) {
        require(n.isFinite()&&n>=min&&n<=max){"$label outside bounded scientific domain"}
    }
    fun evaluate(i:NativeDropInput, stepSeconds:Double=1.0/240):NativeDropResult {
        valid(i.massKg,0.001,10000.0,"Mass")
        valid(i.supportingHalfHeightM,0.0005,5000.0,"Half-height")
        valid(i.dropHeightM,0.0,100.0,"Release height")
        valid(i.initialVelocityMps,-100.0,100.0,"Velocity")
        valid(i.gravityMps2,0.0,100.0,"Gravity")
        valid(i.airDensityKgM3,0.0,100.0,"Air density")
        valid(i.projectedAreaM2,0.000001,100000.0,"Projected area")
        valid(i.dragCoefficient,0.0,3.0,"Drag coefficient")
        valid(i.restitution,0.0,1.0,"Restitution")
        valid(i.durationSeconds,0.01,20.0,"Duration")
        valid(stepSeconds,0.001,1.0/30,"Step")
        val steps=ceil(i.durationSeconds/stepSeconds).toInt()
        require(steps<=20000){"Drop experiment exceeds local solver budget"}
        val dt=i.durationSeconds/steps
        val k=0.5*i.airDensityKgM3*i.dragCoefficient*i.projectedAreaM2/i.massKg
        var height=i.dropHeightM
        var v=i.initialVelocityMps
        var impacts=0
        val data=ArrayList<NativeDropSample>(steps+1)
        for (n in 0..steps) {
            data.add(NativeDropSample(n*dt,height,v,0.5*i.massKg*v*v,
                i.massKg*i.gravityMps2*height,height==0.0&&v==0.0))
            if(n==steps || (height==0.0&&v==0.0))continue
            v+=(-i.gravityMps2-k*v*abs(v))*dt
            require(v.isFinite()&&abs(v)<=10000.0){"Drop model exceeded stability envelope"}
            height+=v*dt
            if(height<=0.0) {
                height=0.0
                if(v<0.0) {
                    impacts++
                    v= -v*i.restitution
                    if(v<max(0.025,i.gravityMps2*dt))v=0.0
                }
            }
        }
        return NativeDropResult(data,impacts,dt)
    }
}
