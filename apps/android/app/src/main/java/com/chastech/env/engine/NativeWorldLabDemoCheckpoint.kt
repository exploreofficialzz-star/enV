package com.chastech.env.engine
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId

data class NativeWorldLabDemoCheckpoint(
 val modelId:String,val timeSeconds:Double,val massKg:Double,
 val springNPerM:Double,val resistanceOhm:Double,val diffusivityM2PerS:Double,
 val wallTimeUTC:String?=null,val worldEpochUTC:String?=null,
 val solverInternalTimeSeconds:Double?=null,val displaySampleTimeSeconds:Double?=null,
 val playbackRate:Double?=null,val playbackDirection:String?=null,val timezoneDisplay:String?=null
)
object NativeWorldLabDemoCheckpointCodec {
 const val FORMAT="env-world-lab-native-demo-checkpoint"
 const val MODEL_VERSION="1.0.0"
 private val baseKeys=setOf("format","schemaVersion","modelVersion","modelId","timeSeconds","massKg","springNPerM","resistanceOhm","diffusivityM2PerS")
 private val clockKeys=setOf("wallTimeUTC","worldEpochUTC","solverInternalTimeSeconds","displaySampleTimeSeconds","playbackRate","playbackDirection","timezoneDisplay")
 fun encode(v:NativeWorldLabDemoCheckpoint):String {
  validate(v)
  val fields=listOf(v.wallTimeUTC,v.worldEpochUTC,v.solverInternalTimeSeconds,v.displaySampleTimeSeconds,v.playbackRate,v.playbackDirection,v.timezoneDisplay)
  require(fields.all{it==null}||fields.all{it!=null}){"Clock checkpoint fields must be all present or all absent"}
  val version=if(fields.all{it!=null})2 else 1
  val o=JSONObject().put("format",FORMAT).put("schemaVersion",version).put("modelVersion",MODEL_VERSION)
   .put("modelId",v.modelId).put("timeSeconds",v.timeSeconds).put("massKg",v.massKg)
   .put("springNPerM",v.springNPerM).put("resistanceOhm",v.resistanceOhm).put("diffusivityM2PerS",v.diffusivityM2PerS)
  if(version==2)o.put("wallTimeUTC",v.wallTimeUTC).put("worldEpochUTC",v.worldEpochUTC)
   .put("solverInternalTimeSeconds",v.solverInternalTimeSeconds).put("displaySampleTimeSeconds",v.displaySampleTimeSeconds)
   .put("playbackRate",v.playbackRate).put("playbackDirection",v.playbackDirection).put("timezoneDisplay",v.timezoneDisplay)
  return o.toString(2)
 }
 fun decode(json:String):NativeWorldLabDemoCheckpoint {
  require(json.toByteArray(Charsets.UTF_8).size<=16*1024){"Timeline checkpoint exceeds 16 KB"}
  val o=JSONObject(json);val version=o.getInt("schemaVersion")
  val expected=when(version){1->baseKeys;2->baseKeys+clockKeys;else->throw IllegalArgumentException("Unsupported timeline checkpoint version")}
  require(o.keys().asSequence().toSet()==expected){"Unexpected or missing timeline checkpoint fields"}
  require(o.getString("format")==FORMAT&&o.getString("modelVersion")==MODEL_VERSION){"Unsupported timeline checkpoint format"}
  val v=NativeWorldLabDemoCheckpoint(o.getString("modelId"),number(o,"timeSeconds"),number(o,"massKg"),
   number(o,"springNPerM"),number(o,"resistanceOhm"),number(o,"diffusivityM2PerS"),
   if(version==2)o.getString("wallTimeUTC") else null,
   if(version==2)o.getString("worldEpochUTC") else null,
   if(version==2)number(o,"solverInternalTimeSeconds") else null,
   if(version==2)number(o,"displaySampleTimeSeconds") else null,
   if(version==2)number(o,"playbackRate") else null,
   if(version==2)o.getString("playbackDirection") else null,
   if(version==2)o.getString("timezoneDisplay") else null)
  validate(v);return v
 }
 private fun number(o:JSONObject,key:String):Double {
  val n=o.get(key) as? Number?:throw IllegalArgumentException("$key must be numeric")
  return n.toDouble().also{require(it.isFinite()){"$key must be finite"}}
 }
 private fun validate(v:NativeWorldLabDemoCheckpoint){
  require(v.modelId in setOf("spring","rc","heat")){"Unknown reference experiment"}
  require(v.timeSeconds.isFinite()&&v.timeSeconds in 0.0..12.0)
  require(v.massKg.isFinite()&&v.massKg in 0.1..100.0)
  require(v.springNPerM.isFinite()&&v.springNPerM in 0.1..30.0)
  require(v.resistanceOhm.isFinite()&&v.resistanceOhm in 100.0..10000.0)
  require(v.diffusivityM2PerS.isFinite()&&v.diffusivityM2PerS in 0.001..0.08)
  val fields=listOf(v.wallTimeUTC,v.worldEpochUTC,v.solverInternalTimeSeconds,v.displaySampleTimeSeconds,v.playbackRate,v.playbackDirection,v.timezoneDisplay)
  require(fields.all{it==null}||fields.all{it!=null}){"Clock checkpoint fields must be all present or all absent"}
  if(fields.all{it!=null}){
   require(v.wallTimeUTC!!.endsWith("Z")&&v.worldEpochUTC!!.endsWith("Z")){"Clock timestamps must be UTC"}
   Instant.parse(v.wallTimeUTC);Instant.parse(v.worldEpochUTC)
   require(v.solverInternalTimeSeconds!!.isFinite()&&v.solverInternalTimeSeconds in 0.0..12.0)
   require(v.displaySampleTimeSeconds!!.isFinite()&&v.displaySampleTimeSeconds in 0.0..12.0)
   require(v.playbackRate!!.isFinite()&&v.playbackRate in 0.01..100.0)
   require(v.playbackDirection in setOf("forward","reverse-recording"))
   require(!v.timezoneDisplay.isNullOrBlank()&&v.timezoneDisplay.length<=120)
   ZoneId.of(v.timezoneDisplay)
  }
 }
}
