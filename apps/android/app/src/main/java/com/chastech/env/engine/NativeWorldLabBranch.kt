package com.chastech.env.engine

import java.time.Instant
import java.util.UUID

data class NativeWorldLabBranchChange(
    val field:String,
    val previous:Double?,
    val next:Double?
)
data class NativeWorldLabBranchRecord(
    val format:String="env-world-lab-native-branch",
    val schemaVersion:Int=1,
    val branchId:String,
    val sourceRunId:String,
    val sourceModelId:String,
    val sourceModelVersion:String="1.0.0",
    val targetModelId:String,
    val targetModelVersion:String="1.0.0",
    val createdAtUTC:String,
    val sourceTimeSeconds:Double,
    val targetTimeSeconds:Double,
    val fidelity:String="recomputed-new-run",
    val sourceParameters:Map<String,Double>,
    val targetParameters:Map<String,Double>,
    val inputDiff:List<NativeWorldLabBranchChange>
)
object NativeWorldLabBranch {
    private fun parameters(input:NativeLabInput):Map<String,Double> = when(input) {
        is NativeLabInput.Spring -> mapOf(
            "massKg" to input.massKg,"springNPerM" to input.springNPerM,
            "dampingNsPerM" to input.dampingNsPerM,"x0" to input.x0,"v0" to input.v0)
        is NativeLabInput.RC -> mapOf(
            "resistanceOhm" to input.resistanceOhm,"capacitanceF" to input.capacitanceF,
            "supplyV" to input.supplyV,"initialV" to input.initialV)
        is NativeLabInput.Heat -> mapOf(
            "diffusivityM2S" to input.diffusivityM2S,"lengthM" to input.lengthM,
            "backgroundK" to input.backgroundK,"centerK" to input.centerK)
    }
    private fun modelId(input:NativeLabInput):String=when(input) {
        is NativeLabInput.Spring->"spring"
        is NativeLabInput.RC->"rc"
        is NativeLabInput.Heat->"heat"
    }
    fun create(source:NativeLabInput,target:NativeLabInput,sourceTimeSeconds:Double,
        sourceRunId:String=UUID.randomUUID().toString(),createdAtUTC:String=Instant.now().toString()
    ):NativeWorldLabBranchRecord {
        require(sourceRunId.matches(Regex("[A-Za-z0-9_-]{1,120}"))){
            "Branch source run ID is invalid"
        }
        require(runCatching{Instant.parse(createdAtUTC)}.isSuccess){
            "Branch creation time must be a valid UTC timestamp"
        }
        // Validate both source and target with their own native equations before recording.
        NativeWorldLabScience.evaluate(source,sourceTimeSeconds)
        NativeWorldLabScience.evaluate(target,sourceTimeSeconds)
        val before=parameters(source);val after=parameters(target)
        val changes=(before.keys+after.keys).toSortedSet().mapNotNull{field->
            val old=before[field];val next=after[field]
            if(old==next)null else NativeWorldLabBranchChange(field,old,next)
        }
        return NativeWorldLabBranchRecord(
            branchId=UUID.randomUUID().toString(),sourceRunId=sourceRunId,
            sourceModelId=modelId(source),targetModelId=modelId(target),
            createdAtUTC=Instant.parse(createdAtUTC).toString(),
            sourceTimeSeconds=sourceTimeSeconds,targetTimeSeconds=sourceTimeSeconds,
            sourceParameters=before.toSortedMap(),targetParameters=after.toSortedMap(),
            inputDiff=changes
        )
    }
    fun recompute(target:NativeLabInput,record:NativeWorldLabBranchRecord):NativeLabResult {
        require(record.format=="env-world-lab-native-branch"&&record.schemaVersion==1&&
            record.fidelity=="recomputed-new-run"&&record.targetModelId==modelId(target)&&
            record.targetParameters==parameters(target)) {
            "Branch record does not match the selected target inputs or model version"
        }
        return NativeWorldLabScience.evaluate(target,record.targetTimeSeconds)
    }
}
