package com.chastech.env.engine

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.max

/** Insulated two-slab thermal transfer with inventor-assumed material properties. */
data class NativeMaterialHeatFrame(val timeSeconds:Double,
    val firstTemperatureK:Double,val secondTemperatureK:Double,
    val interfaceHeatFlowW:Double,val energyResidualJ:Double)
data class NativeMaterialHeatRun(val projectId:String,val projectRevision:Int,
    val firstEntityId:String,val secondEntityId:String,
    val firstMaterialId:String,val secondMaterialId:String,
    val firstCapacityJPerK:Double,val secondCapacityJPerK:Double,
    val conductanceWPerK:Double,val equilibriumTemperatureK:Double,
    val initialFirstTemperatureK:Double,val initialSecondTemperatureK:Double,
    val durationSeconds:Double,val samples:List<NativeMaterialHeatFrame>,
    val validity:String) {
    fun sample(time:Double):NativeMaterialHeatFrame{
        require(time.isFinite()){"Heat simulation time must be finite"}
        val i=kotlin.math.round((time.coerceIn(0.0,durationSeconds)/
            durationSeconds)*120).toInt().coerceIn(0,samples.lastIndex)
        return samples[i]
    }
}
object NativeWorldLabHeatTransfer {
    fun evaluate(project:NativeWorldLabProject,firstId:String,secondId:String,
        firstTemperatureK:Double,secondTemperatureK:Double,
        durationSeconds:Double=100.0):NativeMaterialHeatRun{
        require(firstId!=secondId){"Choose two distinct solids"}
        val a=project.entities.find{it.id==firstId}
        val b=project.entities.find{it.id==secondId}
        require(a!=null&&b!=null&&a.shape=="box"&&b.shape=="box"){
            "Native contact heat exchange requires two rectangular solid boxes"}
        val am=project.materials.find{it.id==a.materialId}
        val bm=project.materials.find{it.id==b.materialId}
        require(am!=null&&bm!=null&&am.densityKgM3!=null&&bm.densityKgM3!=null&&
            am.specificHeatJPerKgK!=null&&bm.specificHeatJPerKgK!=null&&
            am.thermalConductivityWPerMK!=null&&bm.thermalConductivityWPerMK!=null){
            "Both invented materials need density, thermal conductivity and specific heat"}
        val u=a.positionMeters;val v=b.positionMeters
        val du=a.dimensionsMeters;val dv=b.dimensionsMeters
        require(abs(u.y-v.y)<1e-7&&abs(u.z-v.z)<1e-7&&
            abs(du.y-dv.y)<1e-7&&abs(du.z-dv.z)<1e-7&&
            abs(abs(u.x-v.x)-(du.x+dv.x)/2)<1e-7){
            "Thermal interface requires face-touching X-aligned boxes with equal Y/Z cross-section"}
        require(firstTemperatureK.isFinite()&&firstTemperatureK in 200.0..2000.0&&
            secondTemperatureK.isFinite()&&secondTemperatureK in 200.0..2000.0&&
            durationSeconds.isFinite()&&durationSeconds in 0.1..3600.0){
            "Thermal temperature or simulated duration outside supported SI domain"}
        val ca=a.volumeMetersCubed()*am.densityKgM3*am.specificHeatJPerKgK
        val cb=b.volumeMetersCubed()*bm.densityKgM3*bm.specificHeatJPerKgK
        val area=du.y*du.z
        val g=1/(du.x/(2*am.thermalConductivityWPerMK*area)+
            dv.x/(2*bm.thermalConductivityWPerMK*area))
        val total=ca+cb
        val eq=(ca/total)*firstTemperatureK+(cb/total)*secondTemperatureK
        val decay=g*(1/ca+1/cb)
        require(listOf(ca,cb,g,eq,decay).all{it.isFinite()}&&ca>0&&cb>0&&g>0){
            "Invented material thermal capacity or conductance exceeded finite bounds"}
        val samples=(0..120).map{i->
            val t=i/120.0*durationSeconds
            val difference=(firstTemperatureK-secondTemperatureK)*exp(-decay*t)
            val t1=eq+cb/total*difference
            val t2=eq-ca/total*difference
            val flow=g*(t1-t2)
            val residual=ca*(t1-firstTemperatureK)+cb*(t2-secondTemperatureK)
            val tol=1e-7*max(1.0,max(abs(ca*(firstTemperatureK-secondTemperatureK)),
                abs(cb*(firstTemperatureK-secondTemperatureK))))
            require(listOf(t1,t2,flow,residual).all{it.isFinite()}&&abs(residual)<=tol){
                "Thermal energy conservation audit failed"}
            NativeMaterialHeatFrame(t,t1,t2,flow,residual)
        }
        return NativeMaterialHeatRun(project.id,project.revision,a.id,b.id,
            am.id,bm.id,ca,cb,g,eq,firstTemperatureK,secondTemperatureK,
            durationSeconds,samples,
            "Two insulated face-contacting ideal slabs with user-assumed density, "+
            "specific heat and conductivity. No internal spatial gradients, phase "+
            "changes, radiation, convection, thermal safety or measured material data.")
    }
}
