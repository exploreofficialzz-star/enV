package com.chastech.env.engine

/**
 * Native, independently implemented World Lab scientific quantity/port contract.
 * SI canonical numerical values; no unknown-property interpolation or measurement
 * claims without a source. Dimension tuple: kg,m,s,A,K,mol,cd.
 */
data class NativeScienceQuantity(
    val valueSI:Double,val unit:String,val dimension:List<Int>,
    val evidence:String,val sourceId:String?,val uncertaintySI:Double?
)
data class NativeSciencePort(
    val id:String,val direction:String,val unit:String,
    val frame:String,val flow:String
)
object NativeWorldLabSI {
    private data class Spec(val dimensions:List<Int>,val factor:Double)
    private val units=mapOf(
        "1" to Spec(listOf(0,0,0,0,0,0,0),1.0),
        "kg" to Spec(listOf(1,0,0,0,0,0,0),1.0),
        "g" to Spec(listOf(1,0,0,0,0,0,0),0.001),
        "m" to Spec(listOf(0,1,0,0,0,0,0),1.0),
        "cm" to Spec(listOf(0,1,0,0,0,0,0),0.01),
        "mm" to Spec(listOf(0,1,0,0,0,0,0),0.001),
        "km" to Spec(listOf(0,1,0,0,0,0,0),1000.0),
        "s" to Spec(listOf(0,0,1,0,0,0,0),1.0),
        "ms" to Spec(listOf(0,0,1,0,0,0,0),0.001),
        "min" to Spec(listOf(0,0,1,0,0,0,0),60.0),
        "h" to Spec(listOf(0,0,1,0,0,0,0),3600.0),
        "A" to Spec(listOf(0,0,0,1,0,0,0),1.0),
        "mA" to Spec(listOf(0,0,0,1,0,0,0),0.001),
        "K" to Spec(listOf(0,0,0,0,1,0,0),1.0),
        "mol" to Spec(listOf(0,0,0,0,0,1,0),1.0),
        "cd" to Spec(listOf(0,0,0,0,0,0,1),1.0),
        "m2" to Spec(listOf(0,2,0,0,0,0,0),1.0),
        "m3" to Spec(listOf(0,3,0,0,0,0,0),1.0),
        "m/s" to Spec(listOf(0,1,-1,0,0,0,0),1.0),
        "m/s2" to Spec(listOf(0,1,-2,0,0,0,0),1.0),
        "kg/m3" to Spec(listOf(1,-3,0,0,0,0,0),1.0),
        "N" to Spec(listOf(1,1,-2,0,0,0,0),1.0),
        "N/m" to Spec(listOf(1,0,-2,0,0,0,0),1.0),
        "N/A" to Spec(listOf(1,1,-2,-1,0,0,0),1.0),
        "Pa" to Spec(listOf(1,-1,-2,0,0,0,0),1.0),
        "kPa" to Spec(listOf(1,-1,-2,0,0,0,0),1000.0),
        "J" to Spec(listOf(1,2,-2,0,0,0,0),1.0),
        "kJ" to Spec(listOf(1,2,-2,0,0,0,0),1000.0),
        "W" to Spec(listOf(1,2,-3,0,0,0,0),1.0),
        "V" to Spec(listOf(1,2,-3,-1,0,0,0),1.0),
        "ohm" to Spec(listOf(1,2,-3,-2,0,0,0),1.0),
        "F" to Spec(listOf(-1,-2,4,2,0,0,0),1.0),
        "H" to Spec(listOf(1,2,-2,-2,0,0,0),1.0),
        "C" to Spec(listOf(0,0,1,1,0,0,0),1.0),
        "J/K" to Spec(listOf(1,2,-2,0,-1,0,0),1.0),
        "J/(kg*K)" to Spec(listOf(0,2,-2,0,-1,0,0),1.0),
        "W/K" to Spec(listOf(1,2,-3,0,-1,0,0),1.0),
        "W/(m*K)" to Spec(listOf(1,1,-3,0,-1,0,0),1.0)
    )
    private val evidenceLabels=setOf("measured-observed","physics-model-computed",
        "hypothetical-user-assumed","unknown-insufficient-evidence")
    fun declare(value:Double,unit:String,
        evidence:String="hypothetical-user-assumed",sourceId:String?=null,
        uncertainty:Double?=null):NativeScienceQuantity {
        val spec=units[unit]?:throw IllegalArgumentException("Unsupported scientific unit")
        require(value.isFinite()&&kotlin.math.abs(value)<=1e30){"Nonfinite scientific value"}
        require(evidence in evidenceLabels&&evidence!="unknown-insufficient-evidence"){
            "Unknown scientific quantity must remain unassigned"}
        if(evidence=="measured-observed")require(!sourceId.isNullOrBlank()){
            "Observed values require recorded provenance"}
        require(sourceId==null||sourceId.matches(Regex("[A-Za-z0-9:_-]{1,120}"))){
            "Invalid scientific source ID"}
        require(uncertainty==null||uncertainty.isFinite()&&uncertainty in 0.0..1e30){
            "Invalid uncertainty"}
        if(unit=="K")require(value>=0){"Absolute Kelvin cannot be negative"}
        val canonical=value*spec.factor
        require(canonical.isFinite()){"Scientific value exceeds finite SI bounds"}
        return NativeScienceQuantity(canonical,unit,spec.dimensions.toList(),evidence,sourceId,
            uncertainty?.times(spec.factor))
    }
    fun convert(quantity:NativeScienceQuantity,unit:String):Double {
        val original=units[quantity.unit]?:error("Unknown scientific source unit")
        val target=units[unit]?:error("Unknown scientific target unit")
        require(original.dimensions==quantity.dimension&&
            original.dimensions==target.dimensions){"Dimensional mismatch"}
        require(quantity.valueSI.isFinite()){"Nonfinite scientific exchange"}
        return quantity.valueSI/target.factor
    }
    fun compatible(from:NativeSciencePort,to:NativeSciencePort) {
        require(from.direction in setOf("output","bidirectional")&&
            to.direction in setOf("input","bidirectional")){"Invalid scientific port direction"}
        require(from.frame==to.frame&&from.flow==to.flow){"Incompatible scientific frame or flow"}
        val source=units[from.unit]?:error("Unknown source port unit")
        val target=units[to.unit]?:error("Unknown target port unit")
        require(source.dimensions==target.dimensions){"Incompatible port dimensions"}
    }
}
