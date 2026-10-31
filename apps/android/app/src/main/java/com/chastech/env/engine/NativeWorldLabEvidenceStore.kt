package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.AtomicMoveNotSupportedException
import java.time.Instant
import java.util.UUID

/** Private Android scientific history: 20 immutable evidence records per saved
 * invention, 2 MB per record. Scientific provenance is not reinterpreted. */
class NativeWorldLabEvidenceStore(private val root:File){
    private val base=File(root,"world-lab-science-v1")
    private fun id(s:String):String{
        require(s.matches(Regex("[A-Za-z0-9_-]{1,120}"))){"Invalid scientific record identifier"}
        return s
    }
    private fun folder(projectId:String)=File(base,id(projectId))
    private fun file(projectId:String,recordId:String)=
        File(folder(projectId),id(recordId)+".json")
    private fun validated(raw:String,expectedProject:String?=null):JSONObject{
        val bytes=raw.toByteArray(StandardCharsets.UTF_8)
        require(bytes.size<=2*1024*1024){"Scientific evidence exceeds 2 MB"}
        val record=JSONObject(raw)
        val allowed=setOf("id","projectId","projectRevision","createdAt","kind","result")
        require(record.length()==allowed.size&&
            record.keys().asSequence().all{it in allowed}){
            "Scientific evidence needs a complete strict portable envelope"}
        val recordId=id(record.getString("id"))
        val projectId=id(record.getString("projectId"))
        if(expectedProject!=null)require(projectId==expectedProject){
            "Scientific record belongs to another invention"}
        val revision=record.getInt("projectRevision")
        require(revision>=0){"Invalid scientific revision"}
        Instant.parse(record.getString("createdAt"))
        val kind=record.getString("kind")
        val result=record.getJSONObject("result")
        require(result.getString("projectId")==projectId&&
            result.getInt("projectRevision")==revision&&
            result.getString("modelVersion")=="1.0.0"&&
            result.getString("evidence")=="physics-model-computed"&&
            result.getString("materialEvidence")=="hypothetical-user-assumed"&&
            result.getString("validity").length in 30..2000){
            "Scientific result does not match the saved hypothesis"}
        when(kind){
            "newton-gravity"->{
                require(result.getString("format")=="env-world-lab-newton-gravity"&&
                    result.getJSONArray("bodies").length() in 2..8&&
                    result.getJSONArray("frames").length() in 2..241){
                    "Invalid native gravity evidence dimensions"}
            }
            "material-heat"->{
                require(result.getString("format")=="env-world-lab-material-heat-transfer"&&
                    result.getJSONArray("samples").length()==121){
                    "Invalid native contact-heat evidence dimensions"}
            }
            else->error("Unknown invented scientific calculation kind")
        }
        require(recordId.isNotBlank()){"Missing evidence ID"}
        return record
    }
    private fun atomic(dest:File,bytes:ByteArray){
        require(dest.parentFile.isDirectory||dest.parentFile.mkdirs()){"Cannot create science history"}
        val temp=File.createTempFile(".world-lab-evidence-", ".tmp",dest.parentFile)
        try{
            FileOutputStream(temp).use{it.write(bytes);it.fd.sync()}
            try{
                Files.move(temp.toPath(),dest.toPath(),StandardCopyOption.ATOMIC_MOVE)
            }catch(_:AtomicMoveNotSupportedException){
                Files.move(temp.toPath(),dest.toPath())
            }
        }finally{temp.delete()}
    }
    @Synchronized fun save(project:NativeWorldLabProject,
        result:JSONObject):String{
        // A local saved project must exist before scientific evidence is committed.
        val previous=NativeWorldLabProjectStore(root).read(project.id)
        require(previous.revision>=project.revision){
            "Save the matching invention locally before preserving its evidence"}
        require(result.getString("projectId")==project.id&&
            result.getInt("projectRevision")==project.revision){
            "Scientific evidence must identify the exact calculated invention"}
        val recordId=UUID.randomUUID().toString()
        val kind=when(result.getString("format")){
            "env-world-lab-newton-gravity"->"newton-gravity"
            "env-world-lab-material-heat-transfer"->"material-heat"
            else->error("Unrecognized scientific evidence")
        }
        val envelope=JSONObject().put("id",recordId).put("projectId",project.id)
            .put("projectRevision",project.revision)
            .put("createdAt",Instant.now().toString())
            .put("kind",kind).put("result",result)
        val json=envelope.toString()
        validated(json,project.id)
        val dir=folder(project.id)
        if(dir.isDirectory){
            val count=dir.listFiles()?.count{it.isFile&&it.extension=="json"}?:0
            require(count<20){"Scientific device history is full (20 records)"}
        }
        atomic(file(project.id,recordId),json.toByteArray(StandardCharsets.UTF_8))
        return recordId
    }
    @Synchronized fun read(projectId:String,recordId:String):JSONObject{
        val dest=file(projectId,recordId)
        require(dest.isFile&&dest.length()<=2*1024*1024){"Scientific record missing or too large"}
        val result=validated(dest.readText(StandardCharsets.UTF_8),projectId)
        require(result.getString("id")==recordId){"Scientific evidence file ID mismatch"}
        return result
    }
    @Synchronized fun list(projectId:String):List<JSONObject>{
        val dir=folder(projectId)
        if(!dir.isDirectory)return emptyList()
        val entries=dir.listFiles()?.filter{it.isFile&&it.extension=="json"}
            ?:error("Scientific record folder cannot be listed")
        require(entries.size<=20){"Science history exceeded the 20-record quota"}
        return entries.sortedByDescending{it.lastModified()}.map{
            read(projectId,it.name.removeSuffix(".json"))
        }
    }
    @Synchronized fun delete(projectId:String,recordId:String){
        read(projectId,recordId)
        require(file(projectId,recordId).delete()){"Could not discard saved evidence"}
    }
}
/** Shared evidence conversion; Android JSON representation is explicit,
 * platform-native and can be exchanged without JS serialization. */
object NativeWorldLabEvidenceJson {
    fun gravity(run:NativeGravityRun):JSONObject {
        fun vec(v:NativeLabVector)=JSONArray().put(v.x).put(v.y).put(v.z)
        return JSONObject().put("format","env-world-lab-newton-gravity")
            .put("modelVersion","1.0.0").put("evidence","physics-model-computed")
            .put("materialEvidence","hypothetical-user-assumed")
            .put("projectId",run.projectId).put("projectRevision",run.projectRevision)
            .put("durationSeconds",run.durationSeconds)
            .put("integrationSteps",run.integrationSteps)
            .put("gravitationalConstantM3KgS2",NativeWorldLabGravity.G)
            .put("energyDriftFraction",run.energyDriftFraction)
            .put("initialEnergyJ",run.initialEnergyJ).put("finalEnergyJ",run.finalEnergyJ)
            .put("initialMomentumKgMps",vec(run.frames.first().totalMomentumKgMps))
            .put("finalMomentumKgMps",vec(run.frames.last().totalMomentumKgMps))
            .put("validity",run.validity)
            .put("bodies",JSONArray().apply{run.bodies.forEach{body->
                put(JSONObject().put("entityId",body.entityId)
                    .put("materialId",body.materialId)
                    .put("massKg",body.massKg).put("radiusM",body.radiusM)
                    .put("initialPositionM",vec(body.initialPositionM))
                    .put("initialVelocityMps",vec(body.initialVelocityMps)))
            }})
            .put("frames",JSONArray().apply{run.frames.forEach{frame->
                put(JSONObject().put("timeSeconds",frame.timeSeconds)
                    .put("positionsM",JSONArray().apply{
                        frame.positionsM.forEach{put(vec(it))}
                    }).put("velocitiesMps",JSONArray().apply{
                        frame.velocitiesMps.forEach{put(vec(it))}
                    }).put("totalEnergyJ",frame.totalEnergyJ)
                    .put("energyDriftJ",frame.energyDriftJ)
                    .put("totalMomentumKgMps",vec(frame.totalMomentumKgMps)))
            }})
    }
    fun heat(run:NativeMaterialHeatRun):JSONObject =
        JSONObject().put("format","env-world-lab-material-heat-transfer")
            .put("modelVersion","1.0.0").put("evidence","physics-model-computed")
            .put("materialEvidence","hypothetical-user-assumed")
            .put("projectId",run.projectId).put("projectRevision",run.projectRevision)
            .put("firstEntityId",run.firstEntityId).put("secondEntityId",run.secondEntityId)
            .put("firstMaterialId",run.firstMaterialId)
            .put("secondMaterialId",run.secondMaterialId)
            .put("firstThermalCapacityJPerK",run.firstCapacityJPerK)
            .put("secondThermalCapacityJPerK",run.secondCapacityJPerK)
            .put("conductanceWPerK",run.conductanceWPerK)
            .put("equilibriumTemperatureK",run.equilibriumTemperatureK)
            .put("durationSeconds",run.durationSeconds).put("validity",run.validity)
            .put("input",JSONObject().put("firstEntityId",run.firstEntityId)
                .put("secondEntityId",run.secondEntityId)
                .put("firstTemperatureK",run.initialFirstTemperatureK)
                .put("secondTemperatureK",run.initialSecondTemperatureK)
                .put("durationSeconds",run.durationSeconds))
            .put("samples",JSONArray().apply{run.samples.forEach{sample->
                put(JSONObject().put("timeSeconds",sample.timeSeconds)
                    .put("firstTemperatureK",sample.firstTemperatureK)
                    .put("secondTemperatureK",sample.secondTemperatureK)
                    .put("interfaceHeatFlowW",sample.interfaceHeatFlowW)
                    .put("energyResidualJ",sample.energyResidualJ))
            }})
}
