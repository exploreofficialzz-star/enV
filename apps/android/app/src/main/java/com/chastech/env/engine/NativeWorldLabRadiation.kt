package com.chastech.env.engine

import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** Independent Kotlin Stefan-Boltzmann lumped radiation reference model.
 * All emitted predictions depend on hypothetical density, specific heat,
 * and explicitly user-assumed surface emissivity.
 */
data class NativeRadiationSample(val timeSeconds:Double,val temperatureK:Double,
    val netRadiatedPowerW:Double,val transferredEnergyJ:Double,
    val internalThermalEnergyJ:Double,val energyResidualJ:Double)
data class NativeRadiationRun(
    val format:String="env-world-lab-thermal-radiation",
    val modelVersion:String="1.0.0",val evidence:String="physics-model-computed",
    val inputEvidence:String="hypothetical-user-assumed",
    val projectId:String,val projectRevision:Int,val entityId:String,val materialId:String,
    val initialTemperatureK:Double,val environmentTemperatureK:Double,
    val emissivity:Double,val durationSeconds:Double,
    val massKg:Double,val areaM2:Double,val assumedDensityKgM3:Double,
    val assumedSpecificHeatJPerKgK:Double,val steps:Int,
    val samples:List<NativeRadiationSample>,val validity:String
){
    fun sample(timeSeconds:Double):NativeRadiationSample{
        require(timeSeconds.isFinite()&&timeSeconds in 0.0..durationSeconds){
            "Radiative playback time must stay in the recorded interval"
        }
        if(timeSeconds==0.0)return samples.first()
        if(timeSeconds==durationSeconds)return samples.last()
        val hi=samples.indexOfFirst{it.timeSeconds>=timeSeconds}.let{
            if(it<1)samples.lastIndex else it
        }
        val a=samples[hi-1];val b=samples[hi]
        val t=(timeSeconds-a.timeSeconds)/(b.timeSeconds-a.timeSeconds)
        fun blend(x:Double,y:Double)=x+(y-x)*t
        return NativeRadiationSample(timeSeconds,blend(a.temperatureK,b.temperatureK),
            blend(a.netRadiatedPowerW,b.netRadiatedPowerW),
            blend(a.transferredEnergyJ,b.transferredEnergyJ),
            blend(a.internalThermalEnergyJ,b.internalThermalEnergyJ),
            blend(a.energyResidualJ,b.energyResidualJ))
    }
}
object NativeWorldLabRadiation {
    const val SIGMA=5.670374419e-8
    fun evaluate(project:NativeWorldLabProject,entityId:String,
        startK:Double,environmentK:Double,emissivity:Double,duration:Double):NativeRadiationRun{
        val solid=project.entities.find{it.id==entityId}
            ?:throw IllegalArgumentException("Select an authored radiating solid")
        val matter=project.materials.find{it.id==solid.materialId}
            ?:throw IllegalArgumentException("Assign an invented thermal material")
        require(matter.evidence=="hypothetical-user-assumed"){
            "Material properties must be inventor assumptions"
        }
        val density=matter.densityKgM3
            ?:throw IllegalArgumentException("Invented density is required")
        val specificHeat=matter.specificHeatJPerKgK
            ?:throw IllegalArgumentException("Invented specific heat is required")
        val x=solid.dimensionsMeters.x
        val y=solid.dimensionsMeters.y
        val z=solid.dimensionsMeters.z
        val area=when(solid.shape){
            "box"->2*(x*y+x*z+y*z)
            "sphere"->PI*x*x
            "cylinder"->PI*x*(y+x/2)
            else->throw IllegalArgumentException("Unsupported radiating solid")
        }
        return evaluateParameters(project.id,project.revision,solid.id,matter.id,
            solid.volumeMetersCubed()*density,area,density,specificHeat,
            startK,environmentK,emissivity,duration)
    }
    fun evaluateParameters(projectId:String,projectRevision:Int,entityId:String,
        materialId:String,massKg:Double,areaM2:Double,densityKgM3:Double,
        specificHeatJPerKgK:Double,startK:Double,environmentK:Double,
        emissivity:Double,duration:Double):NativeRadiationRun{
        require(projectId.isNotBlank()&&entityId.isNotBlank()&&materialId.isNotBlank()&&
            projectRevision>=0){"Radiative experiment source identity is invalid"}
        val heatCapacity=massKg*specificHeatJPerKgK
        require(massKg.isFinite()&&massKg in 1e-9..1e15&&areaM2.isFinite()&&
            areaM2 in 1e-9..1e9&&densityKgM3.isFinite()&&
            densityKgM3 in 0.001..1e9&&specificHeatJPerKgK.isFinite()&&
            specificHeatJPerKgK in 0.01..1e7&&heatCapacity.isFinite()&&
            heatCapacity in 1e-9..1e20){"Invented heat capacity or geometry is outside bounds"}
        require(startK.isFinite()&&startK in 1.0..3000.0&&environmentK.isFinite()&&
            environmentK in 1.0..3000.0&&emissivity.isFinite()&&
            emissivity in 0.0..1.0&&duration.isFinite()&&duration in 0.01..3600.0){
            "Radiation assumptions must be finite and within the model"
        }
        val maxT=max(startK,environmentK)
        val coefficient=emissivity*SIGMA*areaM2
        val stability=if(coefficient==0.0)Double.POSITIVE_INFINITY else
            0.05*heatCapacity/(4*coefficient*maxT.pow(3))
        val candidate=max(120.0,ceil(duration/stability))
        require(candidate.isFinite()&&candidate<=20000){
            "Radiative dynamics exceed the 20,000-step local budget"
        }
        val steps=candidate.toInt()
        val dt=duration/steps
        val stride=max(1,ceil(steps/120.0).toInt())
        var temp=startK
        var transferred=0.0
        val samples=mutableListOf<NativeRadiationSample>()
        fun power(t:Double)=coefficient*(t.pow(4)-environmentK.pow(4))
        fun derivative(t:Double)=-power(t)/heatCapacity
        fun snapshot(step:Int){
            val actual=heatCapacity*(startK-temp)
            samples.add(NativeRadiationSample(step*dt,temp,power(temp),transferred,
                heatCapacity*temp,actual-transferred))
        }
        snapshot(0)
        for(step in 1..steps){
            val k1=derivative(temp)
            val k2=derivative(temp+dt*k1/2)
            val k3=derivative(temp+dt*k2/2)
            val k4=derivative(temp+dt*k3)
            val delta=dt*(k1+2*k2+2*k3+k4)/6
            temp+=delta
            transferred-=heatCapacity*delta
            require(temp.isFinite()&&temp in 0.001..3500.0){
                "Radiative temperature became nonphysical"
            }
            val tolerance=1e-7*max(1.0,maxT)
            require(temp>=min(startK,environmentK)-tolerance&&
                temp<=maxT+tolerance){"Radiation integration exceeded thermal bounds"}
            if(step%stride==0||step==steps)snapshot(step)
        }
        return NativeRadiationRun(projectId=projectId,projectRevision=projectRevision,
            entityId=entityId,materialId=materialId,initialTemperatureK=startK,
            environmentTemperatureK=environmentK,emissivity=emissivity,
            durationSeconds=duration,massKg=massKg,areaM2=areaM2,
            assumedDensityKgM3=densityKgM3,assumedSpecificHeatJPerKgK=specificHeatJPerKgK,
            steps=steps,samples=samples,
            validity="Grey-body Stefan-Boltzmann radiation of a lumped isothermal "+
                "invented solid in a fixed uniform ideal environment. Assumed "+
                "emissivity, density and heat capacity. No measured atmosphere, "+
                "solar flux, spectral details, view factors or phase changes.")
    }
}
