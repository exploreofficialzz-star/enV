package com.chastech.env.engine

import java.time.Instant
import java.time.ZoneId
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.roundToInt

/** Immutable metadata for one already-computed native solver recording. */
data class NativeWorldLabRecordedRun(
    val runId:String,
    val modelId:String,
    val modelVersion:String,
    val worldEpochUTC:String,
    val sampleTimesSeconds:List<Double>,
    val mandatoryEventTimesSeconds:List<Double> = emptyList(),
) {
    fun validate() {
        require(runId.isNotBlank() && runId.length<=160) { "Recorded run ID is invalid." }
        require(modelId.isNotBlank() && modelId.length<=120) { "Recorded model ID is invalid." }
        require(modelVersion.isNotBlank() && modelVersion.length<=80) { "Recorded model version is invalid." }
        require(worldEpochUTC.endsWith("Z") && runCatching { Instant.parse(worldEpochUTC) }.isSuccess) {
            "World epoch must be a canonical UTC timestamp."
        }
        require(sampleTimesSeconds.size in 2..200_000 &&
            sampleTimesSeconds.last()<=315_576_000.0 &&
            sampleTimesSeconds.all { it.isFinite() && it>=0.0 } &&
            sampleTimesSeconds.zipWithNext().all { (a,b)->b>a }) {
            "Recorded sample times must be finite, non-negative and strictly increasing."
        }
        require(mandatoryEventTimesSeconds.size<=100_000 &&
            mandatoryEventTimesSeconds.all { event ->
                event.isFinite() && event>=0.0 && event<=durationSeconds
            }) {
            "Mandatory events must be finite and present in the immutable recording."
        }
    }
    val durationSeconds:Double get()=sampleTimesSeconds.last()
}

/** Clock state for cached solver output. Null solverInternalTime means the solver did not export it. */
data class NativeWorldLabRecordedClock(
    val wallTimeUTC:String,
    val worldDateUTC:String,
    val simulationTimeSeconds:Double,
    val solverInternalTimeSeconds:Double?,
    val displaySampleTimeSeconds:Double,
    val sampleIndex:Int,
    val playbackRate:Double,
    val direction:String,
    val paused:Boolean,
    val timezoneDisplay:String,
    val fidelity:String = "recorded-sample-playback",
)

data class NativeWorldLabRecordedCheckpoint(
    val format:String = "env-world-lab-recorded-clock",
    val schemaVersion:Int = 1,
    val runId:String,
    val modelId:String,
    val modelVersion:String,
    val worldEpochUTC:String,
    val sampleIndex:Int,
    val sampleTimeSeconds:Double,
    val clock:NativeWorldLabRecordedClock,
) {
    fun validate(run:NativeWorldLabRecordedRun) {
        require(format=="env-world-lab-recorded-clock" && schemaVersion==1) {
            "Recorded checkpoint format or schema version is unsupported."
        }
        require(runId==run.runId && modelId==run.modelId && modelVersion==run.modelVersion &&
            worldEpochUTC==run.worldEpochUTC) {
            "Checkpoint belongs to a different immutable solver run."
        }
        require(sampleIndex in run.sampleTimesSeconds.indices &&
            abs(sampleTimeSeconds-run.sampleTimesSeconds[sampleIndex])<=1e-9) {
            "Checkpoint sample index and recorded sample time do not match."
        }
        val nearest=NativeWorldLabRecordedTime.nearestIndex(run,clock.simulationTimeSeconds)
        require(nearest==sampleIndex &&
            abs(clock.displaySampleTimeSeconds-sampleTimeSeconds)<=1e-9 &&
            clock.sampleIndex==sampleIndex) {
            "Checkpoint clock does not identify its exact recorded display sample."
        }
        NativeWorldLabRecordedTime.validateClock(clock,run)
    }
}

object NativeWorldLabRecordedTime {
    private const val EPS=1e-9

    fun nearestIndex(run:NativeWorldLabRecordedRun,timeSeconds:Double):Int {
        run.validate()
        require(timeSeconds.isFinite() && timeSeconds in 0.0..run.durationSeconds) {
            "Seek time is outside the recorded run."
        }
        var best=0
        var delta=Double.POSITIVE_INFINITY
        run.sampleTimesSeconds.forEachIndexed { index,value ->
            val distance=abs(value-timeSeconds)
            if(distance<delta){delta=distance;best=index}
        }
        return best
    }

    fun validateClock(clock:NativeWorldLabRecordedClock,run:NativeWorldLabRecordedRun) {
        with(clock) { validate(run) }
    }

    fun NativeWorldLabRecordedClock.validate(run:NativeWorldLabRecordedRun) {
        require(wallTimeUTC.endsWith("Z") && runCatching{Instant.parse(wallTimeUTC)}.isSuccess &&
            worldDateUTC.endsWith("Z") && runCatching{Instant.parse(worldDateUTC)}.isSuccess) {
            "Wall and world clocks must be valid UTC timestamps."
        }
        require(simulationTimeSeconds.isFinite() &&
            simulationTimeSeconds in 0.0..run.durationSeconds &&
            sampleIndex in run.sampleTimesSeconds.indices &&
            abs(displaySampleTimeSeconds-run.sampleTimesSeconds[sampleIndex])<=EPS &&
            nearestIndex(run,simulationTimeSeconds)==sampleIndex) {
            "Simulation time and selected recorded display sample are inconsistent."
        }
        require(solverInternalTimeSeconds==null ||
            (solverInternalTimeSeconds.isFinite() && solverInternalTimeSeconds>=0.0)) {
            "Solver internal time is invalid."
        }
        require(playbackRate.isFinite() && playbackRate in 0.01..100.0 &&
            direction in setOf("forward","reverse-recording") &&
            timezoneDisplay.length<=100 && runCatching{ZoneId.of(timezoneDisplay)}.isSuccess &&
            fidelity=="recorded-sample-playback") {
            "Recorded playback clock settings are invalid."
        }
        val expected=Instant.parse(run.worldEpochUTC).plusNanos((simulationTimeSeconds*1e9).toLong())
        require(abs(expected.toEpochMilli()-Instant.parse(worldDateUTC).toEpochMilli())<=1L) {
            "World date does not agree with the recorded simulation time."
        }
    }

    fun start(run:NativeWorldLabRecordedRun,wallTimeUTC:String,timezoneDisplay:String,
        playbackRate:Double=1.0,direction:String="forward"):NativeWorldLabRecordedClock {
        run.validate()
        val index=0
        val state=NativeWorldLabRecordedClock(
            wallTimeUTC=wallTimeUTC,worldDateUTC=run.worldEpochUTC,
            simulationTimeSeconds=0.0,solverInternalTimeSeconds=null,
            displaySampleTimeSeconds=run.sampleTimesSeconds[index],sampleIndex=index,
            playbackRate=playbackRate,direction=direction,paused=true,
            timezoneDisplay=timezoneDisplay)
        state.validate(run)
        return state
    }

    fun advance(run:NativeWorldLabRecordedRun,state:NativeWorldLabRecordedClock,
        elapsedSeconds:Double,paused:Boolean=state.paused):NativeWorldLabRecordedClock {
        run.validate();state.validate(run)
        require(elapsedSeconds.isFinite() && elapsedSeconds in 0.0..60.0) {
            "Elapsed wall time is outside the supported range."
        }
        val wall=Instant.parse(state.wallTimeUTC).plusNanos((elapsedSeconds*1e9).toLong()).toString()
        if(paused)return state.copy(wallTimeUTC=wall,paused=true).also{it.validate(run)}
        val signed=elapsedSeconds*state.playbackRate*
            if(state.direction=="reverse-recording") -1.0 else 1.0
        var next=(state.simulationTimeSeconds+signed).coerceIn(0.0,run.durationSeconds)
        val crossed=run.mandatoryEventTimesSeconds.filter { event ->
            if(signed>0)event>state.simulationTimeSeconds+EPS&&event<=next+EPS
            else if(signed<0)event<state.simulationTimeSeconds-EPS&&event>=next-EPS
            else false
        }
        if(crossed.isNotEmpty())next=if(signed>0)crossed.minOrNull()!! else crossed.maxOrNull()!!
        val index=nearestIndex(run,next)
        val sample=run.sampleTimesSeconds[index]
        val world=Instant.parse(run.worldEpochUTC).plusNanos((next*1e9).toLong()).toString()
        return state.copy(wallTimeUTC=wall,worldDateUTC=world,
            simulationTimeSeconds=next,solverInternalTimeSeconds=null,
            displaySampleTimeSeconds=sample,sampleIndex=index,paused=false).also{it.validate(run)}
    }

    fun seek(run:NativeWorldLabRecordedRun,state:NativeWorldLabRecordedClock,
        timeSeconds:Double):NativeWorldLabRecordedClock {
        run.validate();state.validate(run)
        val index=nearestIndex(run,timeSeconds)
        val sample=run.sampleTimesSeconds[index]
        return state.copy(worldDateUTC=Instant.parse(run.worldEpochUTC)
            .plusNanos((sample*1e9).toLong()).toString(),simulationTimeSeconds=sample,
            solverInternalTimeSeconds=null,displaySampleTimeSeconds=sample,sampleIndex=index,
            paused=true).also{it.validate(run)}
    }

    fun step(run:NativeWorldLabRecordedRun,state:NativeWorldLabRecordedClock,
        direction:Int):NativeWorldLabRecordedClock {
        require(direction==1||direction==-1) { "Recorded step direction must be +1 or -1." }
        run.validate();state.validate(run)
        val index=(state.sampleIndex+direction).coerceIn(run.sampleTimesSeconds.indices)
        return seek(run,state,run.sampleTimesSeconds[index])
    }

    fun checkpoint(run:NativeWorldLabRecordedRun,
        state:NativeWorldLabRecordedClock):NativeWorldLabRecordedCheckpoint {
        run.validate();state.validate(run)
        return NativeWorldLabRecordedCheckpoint(runId=run.runId,modelId=run.modelId,
            modelVersion=run.modelVersion,worldEpochUTC=run.worldEpochUTC,
            sampleIndex=state.sampleIndex,sampleTimeSeconds=state.displaySampleTimeSeconds,
            clock=state).also{it.validate(run)}
    }

    fun restore(run:NativeWorldLabRecordedRun,
        checkpoint:NativeWorldLabRecordedCheckpoint):NativeWorldLabRecordedClock {
        run.validate();checkpoint.validate(run)
        return checkpoint.clock.copy(paused=true).also{it.validate(run)}
    }
}


object NativeWorldLabRecordedCheckpointCodec {
    private const val FORMAT="env-world-lab-recorded-clock"
    private const val MAX_BYTES=16*1024
    private val keys=setOf("format","schemaVersion","runId","modelId","modelVersion",
        "worldEpochUTC","sampleIndex","sampleTimeSeconds","clock")
    private val clockKeys=setOf("wallTimeUTC","worldDateUTC","simulationTimeSeconds",
        "solverInternalTimeSeconds","displaySampleTimeSeconds","sampleIndex","playbackRate",
        "direction","paused","timezoneDisplay","fidelity")
    fun encode(value:NativeWorldLabRecordedCheckpoint,run:NativeWorldLabRecordedRun):String {
        value.validate(run)
        val clock=value.clock
        val clockJson=JSONObject()
            .put("wallTimeUTC",clock.wallTimeUTC)
            .put("worldDateUTC",clock.worldDateUTC)
            .put("simulationTimeSeconds",clock.simulationTimeSeconds)
            .put("solverInternalTimeSeconds",clock.solverInternalTimeSeconds?:JSONObject.NULL)
            .put("displaySampleTimeSeconds",clock.displaySampleTimeSeconds)
            .put("sampleIndex",clock.sampleIndex)
            .put("playbackRate",clock.playbackRate)
            .put("direction",clock.direction)
            .put("paused",clock.paused)
            .put("timezoneDisplay",clock.timezoneDisplay)
            .put("fidelity",clock.fidelity)
        val json=JSONObject().put("format",FORMAT).put("schemaVersion",1)
            .put("runId",value.runId).put("modelId",value.modelId)
            .put("modelVersion",value.modelVersion).put("worldEpochUTC",value.worldEpochUTC)
            .put("sampleIndex",value.sampleIndex).put("sampleTimeSeconds",value.sampleTimeSeconds)
            .put("clock",clockJson).toString(2)
        require(json.toByteArray(Charsets.UTF_8).size<=MAX_BYTES) {
            "Recorded timeline checkpoint exceeds 16 KB."
        }
        return json
    }
    fun decode(json:String,run:NativeWorldLabRecordedRun):NativeWorldLabRecordedCheckpoint {
        require(json.toByteArray(Charsets.UTF_8).size<=MAX_BYTES) {
            "Recorded timeline checkpoint exceeds 16 KB."
        }
        val root=JSONObject(json)
        require(root.keys().asSequence().toSet()==keys &&
            root.getString("format")==FORMAT && root.getInt("schemaVersion")==1) {
            "Recorded checkpoint contains unsupported or missing fields."
        }
        val c=root.getJSONObject("clock")
        require(c.keys().asSequence().toSet()==clockKeys) {
            "Recorded clock contains unsupported or missing fields."
        }
        fun number(o:JSONObject,key:String):Double {
            val value=o.get(key) as? Number?:throw IllegalArgumentException("$key must be numeric.")
            return value.toDouble().also{require(it.isFinite()){"$key must be finite."}}
        }
        val internal=if(c.isNull("solverInternalTimeSeconds"))null
            else number(c,"solverInternalTimeSeconds")
        val clock=NativeWorldLabRecordedClock(
            wallTimeUTC=c.getString("wallTimeUTC"),worldDateUTC=c.getString("worldDateUTC"),
            simulationTimeSeconds=number(c,"simulationTimeSeconds"),
            solverInternalTimeSeconds=internal,
            displaySampleTimeSeconds=number(c,"displaySampleTimeSeconds"),
            sampleIndex=c.getInt("sampleIndex"),playbackRate=number(c,"playbackRate"),
            direction=c.getString("direction"),paused=c.getBoolean("paused"),
            timezoneDisplay=c.getString("timezoneDisplay"),fidelity=c.getString("fidelity"))
        val value=NativeWorldLabRecordedCheckpoint(runId=root.getString("runId"),
            modelId=root.getString("modelId"),modelVersion=root.getString("modelVersion"),
            worldEpochUTC=root.getString("worldEpochUTC"),sampleIndex=root.getInt("sampleIndex"),
            sampleTimeSeconds=number(root,"sampleTimeSeconds"),clock=clock)
        value.validate(run)
        return value
    }
}
