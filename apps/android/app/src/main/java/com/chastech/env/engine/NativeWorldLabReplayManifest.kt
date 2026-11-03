package com.chastech.env.engine

import java.time.Instant
import java.time.ZoneId
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Portable deterministic replay descriptor for the three local reference models.
 * This is a model-input manifest, not a serialized live process, random state or event queue.
 */
data class NativeWorldLabReplayManifest(
    val format:String,
    val schemaVersion:Int,
    val modelId:String,
    val modelVersion:String,
    val worldEpochUTC:String,
    val timezoneDisplay:String,
    val parameters:Map<String,Double>,
    val sampleTimesSeconds:List<Double>,
    val mandatoryEventTimesSeconds:List<Double>,
    val eventQueuePolicy:String,
    val randomStatePolicy:String,
    val solverStatePolicy:String,
    val inputFingerprint:String
) {
    fun validate() {
        require(format==NativeWorldLabReplayCodec.FORMAT&&schemaVersion==1){
            "Replay manifest format or schema is unsupported."
        }
        require(modelId in setOf("damped-oscillator","rc-circuit","heat-rod")&&modelVersion=="1.0.0"){
            "Replay manifest model or solver version is unsupported."
        }
        require(worldEpochUTC.endsWith("Z")&&runCatching{Instant.parse(worldEpochUTC)}.isSuccess){
            "Replay world epoch must be a valid UTC-Z timestamp."
        }
        require(runCatching{ZoneId.of(timezoneDisplay)}.isSuccess){
            "Replay display timezone is unsupported."
        }
        require(parameters.keys==NativeWorldLabReplayCodec.parameterKeys(modelId)&&
            parameters.values.all{it.isFinite()}){
            "Replay manifest parameter set is incomplete, unknown or non-finite."
        }
        require(sampleTimesSeconds.size in 2..121&&sampleTimesSeconds.first()==0.0&&
            sampleTimesSeconds.last()<=12.0&&sampleTimesSeconds.all{it.isFinite()&&it>=0.0}&&
            sampleTimesSeconds.zipWithNext().all{it.second>it.first}){
            "Replay sample axis must be strictly increasing from zero through at most 12 seconds."
        }
        require(mandatoryEventTimesSeconds.isEmpty()){
            "These deterministic reference models do not define mandatory event queues."
        }
        require(eventQueuePolicy=="empty-no-discrete-events"&&
            randomStatePolicy=="deterministic-no-random-state"&&
            solverStatePolicy=="rebuild-from-validated-inputs"){
            "Replay manifest declares unsupported event, random or solver-state behavior."
        }
        require(inputFingerprint.matches(Regex("^[0-9a-f]{16}$"))&&
            inputFingerprint==NativeWorldLabReplayCodec.fingerprint(this)){
            "Replay manifest input fingerprint does not match its contents."
        }
    }
}

data class NativeWorldLabReplayedRun(
    val manifest:NativeWorldLabReplayManifest,
    val input:NativeLabInput,
    val samples:List<NativeLabResult>
)

object NativeWorldLabReplayCodec {
    const val FORMAT="env-world-lab-replay-manifest"
    const val MAX_BYTES=64*1024
    private const val VERSION="1.0.0"
    private val rootKeys=setOf("format","schemaVersion","modelId","modelVersion","worldEpochUTC",
        "timezoneDisplay","parameters","sampleTimesSeconds","mandatoryEventTimesSeconds",
        "eventQueuePolicy","randomStatePolicy","solverStatePolicy","inputFingerprint")
    private val policyEvents="empty-no-discrete-events"
    private val policyRandom="deterministic-no-random-state"
    private val policySolver="rebuild-from-validated-inputs"

    fun parameterKeys(modelId:String):Set<String> = when(modelId){
        "damped-oscillator"->linkedSetOf("massKg","springNPerM","dampingNsPerM","initialDisplacementM","initialVelocityMPerS")
        "rc-circuit"->linkedSetOf("resistanceOhm","capacitanceF","supplyVoltageV","initialVoltageV")
        "heat-rod"->linkedSetOf("thermalDiffusivityM2PerS","lengthMeters","ambientTemperatureK","centerTemperatureK")
        else->throw IllegalArgumentException("Unsupported deterministic reference model.")
    }

    private fun parameters(input:NativeLabInput):Pair<String,Map<String,Double>> = when(input){
        is NativeLabInput.Spring->"damped-oscillator" to linkedMapOf(
            "massKg" to input.massKg,"springNPerM" to input.springNPerM,
            "dampingNsPerM" to input.dampingNsPerM,
            "initialDisplacementM" to input.x0,"initialVelocityMPerS" to input.v0)
        is NativeLabInput.RC->"rc-circuit" to linkedMapOf(
            "resistanceOhm" to input.resistanceOhm,"capacitanceF" to input.capacitanceF,
            "supplyVoltageV" to input.supplyV,"initialVoltageV" to input.initialV)
        is NativeLabInput.Heat->"heat-rod" to linkedMapOf(
            "thermalDiffusivityM2PerS" to input.diffusivityM2S,"lengthMeters" to input.lengthM,
            "ambientTemperatureK" to input.backgroundK,"centerTemperatureK" to input.centerK)
    }

    fun create(input:NativeLabInput,worldEpochUTC:String,timezoneDisplay:String,
        sampleTimesSeconds:List<Double> = (0..120).map{it/10.0}):NativeWorldLabReplayManifest {
        val (modelId,params)=parameters(input)
        val base=NativeWorldLabReplayManifest(FORMAT,1,modelId,VERSION,worldEpochUTC,timezoneDisplay,
            params,sampleTimesSeconds,emptyList(),policyEvents,policyRandom,policySolver,"0000000000000000")
        val manifest=base.copy(inputFingerprint=fingerprint(base))
        manifest.validate()
        return manifest
    }

    fun toInput(manifest:NativeWorldLabReplayManifest):NativeLabInput {
        val p=manifest.parameters
        return when(manifest.modelId){
            "damped-oscillator"->NativeLabInput.Spring(p.getValue("massKg"),p.getValue("springNPerM"),
                p.getValue("dampingNsPerM"),p.getValue("initialDisplacementM"),
                p.getValue("initialVelocityMPerS"))
            "rc-circuit"->NativeLabInput.RC(p.getValue("resistanceOhm"),p.getValue("capacitanceF"),
                p.getValue("supplyVoltageV"),p.getValue("initialVoltageV"))
            else->NativeLabInput.Heat(p.getValue("thermalDiffusivityM2PerS"),p.getValue("lengthMeters"),
                p.getValue("ambientTemperatureK"),p.getValue("centerTemperatureK"))
        }
    }

    private fun bits(value:Double)=String.format(Locale.ROOT,"%016x",java.lang.Double.doubleToRawLongBits(value))
    private fun canonical(value:NativeWorldLabReplayManifest):String = buildString {
        append("env-world-lab-replay-v1\n")
        append(value.modelId).append('\n').append(value.modelVersion).append('\n')
        append(value.worldEpochUTC).append('\n').append(value.timezoneDisplay).append('\n')
        parameterKeys(value.modelId).forEach{key->append(key).append('=').append(bits(value.parameters.getValue(key))).append('\n')}
        value.sampleTimesSeconds.forEach{append("sample=").append(bits(it)).append('\n')}
        append(value.eventQueuePolicy).append('\n').append(value.randomStatePolicy).append('\n')
        append(value.solverStatePolicy).append('\n')
    }
    fun fingerprint(value:NativeWorldLabReplayManifest):String {
        var hash=14695981039346656037uL
        canonical(value).toByteArray(Charsets.UTF_8).forEach{byte->
            hash=(hash xor byte.toUByte().toULong())*1099511628211uL
        }
        return hash.toString(16).padStart(16,'0')
    }

    fun encode(manifest:NativeWorldLabReplayManifest):ByteArray {
        manifest.validate()
        val params=JSONObject()
        parameterKeys(manifest.modelId).forEach{params.put(it,manifest.parameters.getValue(it))}
        val root=JSONObject().put("format",manifest.format).put("schemaVersion",manifest.schemaVersion)
            .put("modelId",manifest.modelId).put("modelVersion",manifest.modelVersion)
            .put("worldEpochUTC",manifest.worldEpochUTC).put("timezoneDisplay",manifest.timezoneDisplay)
            .put("parameters",params).put("sampleTimesSeconds",JSONArray(manifest.sampleTimesSeconds))
            .put("mandatoryEventTimesSeconds",JSONArray(manifest.mandatoryEventTimesSeconds))
            .put("eventQueuePolicy",manifest.eventQueuePolicy).put("randomStatePolicy",manifest.randomStatePolicy)
            .put("solverStatePolicy",manifest.solverStatePolicy).put("inputFingerprint",manifest.inputFingerprint)
        val bytes=root.toString(2).toByteArray(Charsets.UTF_8)
        require(bytes.size<=MAX_BYTES){"Deterministic replay manifest exceeds 64 KB."}
        return bytes
    }

    fun decodeAndReplay(data:ByteArray):NativeWorldLabReplayedRun {
        require(data.isNotEmpty()&&data.size<=MAX_BYTES){"Replay manifest must be between 1 byte and 64 KB."}
        val root=JSONObject(String(data,Charsets.UTF_8))
        require(root.keys().asSequence().toSet()==rootKeys){"Replay manifest contains unknown or missing fields."}
        val modelId=root.getString("modelId")
        val p=root.getJSONObject("parameters")
        require(p.keys().asSequence().toSet()==parameterKeys(modelId)){"Replay parameters contain unknown or missing fields."}
        val parameters=parameterKeys(modelId).associateWith{key->
            val raw=p.get(key)
            require(raw is Number&&raw.toDouble().isFinite()){"Replay parameter '$key' must be finite."}
            raw.toDouble()
        }
        val sampleArray=root.getJSONArray("sampleTimesSeconds")
        val events=root.getJSONArray("mandatoryEventTimesSeconds")
        val manifest=NativeWorldLabReplayManifest(
            format=root.getString("format"),schemaVersion=root.getInt("schemaVersion"),
            modelId=modelId,modelVersion=root.getString("modelVersion"),
            worldEpochUTC=root.getString("worldEpochUTC"),timezoneDisplay=root.getString("timezoneDisplay"),
            parameters=parameters,
            sampleTimesSeconds=(0 until sampleArray.length()).map{sampleArray.getDouble(it)},
            mandatoryEventTimesSeconds=(0 until events.length()).map{events.getDouble(it)},
            eventQueuePolicy=root.getString("eventQueuePolicy"),randomStatePolicy=root.getString("randomStatePolicy"),
            solverStatePolicy=root.getString("solverStatePolicy"),inputFingerprint=root.getString("inputFingerprint"))
        manifest.validate()
        val input=toInput(manifest)
        val samples=manifest.sampleTimesSeconds.map{time->NativeWorldLabScience.evaluate(input,time)}
        return NativeWorldLabReplayedRun(manifest,input,samples)
    }
}
