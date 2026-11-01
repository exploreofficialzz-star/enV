package com.chastech.env.engine
import org.json.JSONObject

/** Saved position in the bounded native reference demo, not a hidden solver checkpoint. */
data class NativeWorldLabDemoCheckpoint(
 val modelId:String,val timeSeconds:Double,val massKg:Double,
 val springNPerM:Double,val resistanceOhm:Double,val diffusivityM2PerS:Double
)
object NativeWorldLabDemoCheckpointCodec {
 const val FORMAT="env-world-lab-native-demo-checkpoint"
 const val MODEL_VERSION="1.0.0"
 private val keys=setOf("format","schemaVersion","modelVersion","modelId","timeSeconds",
  "massKg","springNPerM","resistanceOhm","diffusivityM2PerS")
 fun encode(value:NativeWorldLabDemoCheckpoint):String {
  validate(value)
  return JSONObject().put("format",FORMAT).put("schemaVersion",1)
   .put("modelVersion",MODEL_VERSION).put("modelId",value.modelId)
   .put("timeSeconds",value.timeSeconds).put("massKg",value.massKg)
   .put("springNPerM",value.springNPerM).put("resistanceOhm",value.resistanceOhm)
   .put("diffusivityM2PerS",value.diffusivityM2PerS).toString(2)
 }
 fun decode(json:String):NativeWorldLabDemoCheckpoint {
  require(json.toByteArray(Charsets.UTF_8).size<=16*1024){"Timeline checkpoint exceeds 16 KB"}
  val o=JSONObject(json)
  require(o.keys().asSequence().toSet()==keys){"Unexpected or missing timeline checkpoint fields"}
  require(o.getString("format")==FORMAT&&o.getInt("schemaVersion")==1&&
   o.getString("modelVersion")==MODEL_VERSION){"Unsupported timeline checkpoint version"}
  val result=NativeWorldLabDemoCheckpoint(o.getString("modelId"),
   number(o,"timeSeconds"),number(o,"massKg"),number(o,"springNPerM"),
   number(o,"resistanceOhm"),number(o,"diffusivityM2PerS"))
  validate(result)
  return result
 }
 private fun number(o:JSONObject,k:String):Double {
  val n=o.get(k) as? Number?:throw IllegalArgumentException("$k must be numeric")
  val d=n.toDouble();require(d.isFinite()){"$k must be finite"};return d
 }
 private fun validate(v:NativeWorldLabDemoCheckpoint){
  require(v.modelId in setOf("spring","rc","heat")){"Unknown reference experiment"}
  require(v.timeSeconds.isFinite()&&v.timeSeconds in 0.0..12.0)
  require(v.massKg.isFinite()&&v.massKg in 0.1..100.0)
  require(v.springNPerM.isFinite()&&v.springNPerM in 0.1..30.0)
  require(v.resistanceOhm.isFinite()&&v.resistanceOhm in 100.0..10000.0)
  require(v.diffusivityM2PerS.isFinite()&&v.diffusivityM2PerS in 0.001..0.08)
 }
}
