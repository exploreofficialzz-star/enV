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
