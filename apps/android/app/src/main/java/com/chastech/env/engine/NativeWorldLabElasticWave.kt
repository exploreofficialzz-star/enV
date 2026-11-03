package com.chastech.env.engine

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Analytical 1D linear elastic free-free bar standing mode.
 * Invented density and modulus are assumptions, never measured properties.
 */
data class NativeElasticWaveSample(
    val timeSeconds:Double,val positionsMeters:List<Double>,
    val displacementsMeters:List<Double>,val velocitiesMetersPerSecond:List<Double>,
    val stressesPa:List<Double>,val kineticEnergyJ:Double,
    val strainEnergyJ:Double,val totalEnergyJ:Double,
)
data class NativeElasticWaveRun(
    val format:String="env-world-lab-elastic-wave",val modelVersion:String="1.0.0",
    val evidence:String="physics-model-computed",
    val inputEvidence:String="hypothetical-user-assumed",
    val projectId:String,val projectRevision:Int,val entityId:String,val materialId:String,
    val mode:Int,val amplitudeMeters:Double,val cycles:Int,
    val lengthMeters:Double,val crossSectionM2:Double,
    val assumedDensityKgM3:Double,val assumedYoungModulusPa:Double,
    val waveSpeedMps:Double,val frequencyHz:Double,val periodSeconds:Double,
    val durationSeconds:Double,val maximumStressPa:Double,val totalEnergyJ:Double,
    val validity:String,
){
    fun sample(timeSeconds:Double,points:Int=41):NativeElasticWaveSample {
        require(timeSeconds.isFinite()&&timeSeconds>=0.0&&timeSeconds<=durationSeconds){
            "Wave time must stay within the recorded interval"
        }
        require(points in 3..101){"Wave sampling needs 3 to 101 positions"}
        val angle=2*PI*frequencyHz*timeSeconds
        val k=PI*mode/lengthMeters
        val omega=2*PI*frequencyHz
        val positions=(0 until points).map{it*lengthMeters/(points-1)}
        val displacement=positions.map{amplitudeMeters*cos(k*it)*cos(angle)}
        val velocity=positions.map{-amplitudeMeters*omega*cos(k*it)*sin(angle)}
        val stress=positions.map{-assumedYoungModulusPa*amplitudeMeters*k*
            sin(k*it)*cos(angle)}
        val kinetic=totalEnergyJ*sin(angle)*sin(angle)
        val strain=totalEnergyJ*cos(angle)*cos(angle)
        return NativeElasticWaveSample(timeSeconds,positions,displacement,velocity,
            stress,kinetic,strain,kinetic+strain)
    }
}
object NativeWorldLabElasticWave {
    fun evaluate(project:NativeWorldLabProject,entityId:String,
        mode:Int,amplitudeMeters:Double,cycles:Int):NativeElasticWaveRun {
        val solid=project.entities.find{it.id==entityId}
            ?:throw IllegalArgumentException("Choose a saved invented rod")
        require(solid.shape=="box"||solid.shape=="cylinder"){
            "A uniform rod must be a box or circular cylinder"
        }
        val material=project.materials.find{it.id==solid.materialId}
            ?:throw IllegalArgumentException("Assign invented material to this rod")
        require(material.evidence=="hypothetical-user-assumed"){
            "The model requires clearly declared material assumptions"
        }
        val density=material.densityKgM3
            ?:throw IllegalArgumentException("The material needs assumed density")
        val modulus=material.youngModulusPa
            ?:throw IllegalArgumentException("The material needs assumed Young's modulus")
        val width=solid.dimensionsMeters.x
        val depth=solid.dimensionsMeters.z
        val area=if(solid.shape=="box")width*depth else PI*width*width/4
        return evaluateParameters(project.id,project.revision,solid.id,material.id,
            solid.dimensionsMeters.y,area,density,modulus,mode,amplitudeMeters,cycles)
    }
    /** Separate mathematical entry point for reference/golden testing. */
    fun evaluateParameters(projectId:String,projectRevision:Int,entityId:String,
        materialId:String,lengthMeters:Double,crossSectionM2:Double,
        densityKgM3:Double,youngModulusPa:Double,mode:Int,
        amplitudeMeters:Double,cycles:Int):NativeElasticWaveRun {
        require(projectId.isNotBlank()&&entityId.isNotBlank()&&materialId.isNotBlank()&&
            projectRevision>=0){"World Lab source identity is invalid"}
        require(lengthMeters.isFinite()&&lengthMeters in 0.001..10000.0&&
            crossSectionM2.isFinite()&&crossSectionM2 in 1e-10..1e8){
            "Rod geometry is outside the elastic reference model"
        }
        require(densityKgM3.isFinite()&&densityKgM3 in 0.001..1e9&&
            youngModulusPa.isFinite()&&youngModulusPa in 1.0..1e15){
            "Invented density and modulus require finite positive values"
        }
        require(mode in 1..12&&cycles in 1..20){"Mode or cycle count is unsupported"}
        val maximumAmplitude=minOf(0.01,0.001*lengthMeters/(PI*mode))
        require(amplitudeMeters.isFinite()&&amplitudeMeters in 1e-9..maximumAmplitude){
            "Wave amplitude violates the small-strain assumption"
        }
        val speed=sqrt(youngModulusPa/densityKgM3)
        require(speed.isFinite()&&speed in 1e-6..1e6){
            "Invented wave speed is outside this reference model"
        }
        val frequency=mode*speed/(2*lengthMeters)
        val period=1/frequency
        val duration=period*cycles
        require(duration.isFinite()&&duration in 1e-9..1e7){
            "Wave duration is outside the bounded model"
        }
        val omega=2*PI*frequency
        val energy=0.25*densityKgM3*crossSectionM2*lengthMeters*
            (amplitudeMeters*omega)*(amplitudeMeters*omega)
        val stress=youngModulusPa*amplitudeMeters*PI*mode/lengthMeters
        require(energy.isFinite()&&energy>=0&&energy<=1e40&&
            stress.isFinite()&&stress>=0&&stress<=1e16){
            "Wave energy or stress exceeds finite limits"
        }
        return NativeElasticWaveRun(projectId=projectId,projectRevision=projectRevision,
            entityId=entityId,materialId=materialId,mode=mode,
            amplitudeMeters=amplitudeMeters,cycles=cycles,lengthMeters=lengthMeters,
            crossSectionM2=crossSectionM2,assumedDensityKgM3=densityKgM3,
            assumedYoungModulusPa=youngModulusPa,waveSpeedMps=speed,
            frequencyHz=frequency,periodSeconds=period,durationSeconds=duration,
            maximumStressPa=stress,totalEnergyJ=energy,
            validity="Analytical linear 1D free-free axial bar; ideal homogeneous density "+
                "and modulus are user assumptions. No damping, fracture, bending, "+
                "acoustics in air or measured material response.")
    }
}
