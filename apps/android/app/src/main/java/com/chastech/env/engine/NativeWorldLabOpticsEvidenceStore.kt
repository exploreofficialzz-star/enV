package com.chastech.env.engine

import org.json.JSONObject
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** Private, append-only typed optical results. No implicit cloud or account sync.
 * The record schema matches portable Web scientificEvidence entries.
 */
class NativeWorldLabOpticsEvidenceStore(private val root:File){
    private val folder=File(root,"WorldLabOpticsEvidence")
    private val idPattern=Regex("[A-Za-z0-9_-]{1,120}")
    private fun safeId(id:String):String {
        require(idPattern.matches(id)){"Invalid invented project identity."}
        return id
    }
    private fun dir(projectId:String)=File(folder,safeId(projectId))
    private fun file(projectId:String,recordId:String)=
        File(dir(projectId),safeId(recordId)+".json")
    private fun validate(bytes:ByteArray,projectId:String,id:String):JSONObject {
        require(bytes.size<=2*1024*1024){"Optical evidence exceeds 2 MB."}
        val outer=JSONObject(String(bytes,StandardCharsets.UTF_8))
        require(outer.length()==6&&
            outer.getString("id")==id&&outer.getString("projectId")==projectId&&
            outer.getString("kind")=="interface-optics"&&
            outer.getInt("projectRevision")>=0){"Optical evidence identity was changed."}
        val result=outer.getJSONObject("result")
        require(result.getString("format")=="env-world-lab-interface-optics"&&
            result.getString("modelVersion")=="1.0.0"&&
            result.getString("evidence")=="physics-model-computed"&&
            result.getString("materialEvidence")=="hypothetical-user-assumed"&&
            result.getString("projectId")==projectId&&
            result.getInt("projectRevision")==outer.getInt("projectRevision")){
            "Optical evidence does not match this project."
        }
        val first=result.getDouble("firstIndex")
        val second=result.getDouble("secondIndex")
        val refl=result.getDouble("unpolarizedReflectance")
        val trans=result.getDouble("unpolarizedTransmittance")
        require(first.isFinite()&&first in 1.0..5.0&&
            second.isFinite()&&second in 1.0..5.0&&
            refl.isFinite()&&refl in 0.0..1.0&&
            trans.isFinite()&&trans in 0.0..1.0&&
            kotlin.math.abs(refl+trans-1)<1e-9){
            "Optical evidence violates its finite conservation envelope."
        }
        return outer
    }
    @Synchronized fun save(run:NativeLabOpticsResult):String {
        val stored=NativeWorldLabProjectStore(root).read(run.projectId)
        require(stored.revision>=run.projectRevision){
            "Save the invention locally before retaining optical evidence."
        }
        val recordId=UUID.randomUUID().toString()
        val result=JSONObject().apply {
            put("format","env-world-lab-interface-optics")
            put("modelVersion","1.0.0")
            put("evidence","physics-model-computed")
            put("materialEvidence","hypothetical-user-assumed")
            put("projectId",run.projectId);put("projectRevision",run.projectRevision)
            put("firstMaterialId",run.firstMaterialId)
            put("secondMaterialId",run.secondMaterialId)
            put("firstIndex",run.firstIndex);put("secondIndex",run.secondIndex)
            put("incidentAngleDegrees",run.incidentDegrees)
            put("reflectedAngleDegrees",run.incidentDegrees)
            put("transmittedAngleDegrees",run.transmittedDegrees?:JSONObject.NULL)
            put("criticalAngleDegrees",run.criticalDegrees?:JSONObject.NULL)
            put("totalInternalReflection",run.totalInternalReflection)
            put("sReflectance",run.sReflectance);put("pReflectance",run.pReflectance)
            put("unpolarizedReflectance",run.reflectance)
            put("unpolarizedTransmittance",run.transmittance)
            put("energyResidual",kotlin.math.abs(1-run.reflectance-run.transmittance))
            put("validity",run.validity)
        }
        val envelope=JSONObject().apply{
            put("id",recordId);put("projectId",run.projectId)
            put("projectRevision",run.projectRevision)
            put("createdAt",OffsetDateTime.now(ZoneOffset.UTC).toString())
            put("kind","interface-optics");put("result",result)
        }
        val bytes=envelope.toString().toByteArray(StandardCharsets.UTF_8)
        validate(bytes,run.projectId,recordId)
        val dir=dir(run.projectId)
        require(dir.isDirectory||dir.mkdirs()){"Cannot create private optics history."}
        require((dir.listFiles()?.count{it.isFile&&it.extension=="json"}?:0)<20){
            "Optical evidence history is full (20 records)."
        }
        val target=file(run.projectId,recordId)
        require(!target.exists()){"Optical evidence record already exists."}
        val temp=File.createTempFile("optic-",".tmp",dir)
        try{
            temp.writeBytes(bytes)
            try{
                Files.move(temp.toPath(),target.toPath(),StandardCopyOption.ATOMIC_MOVE)
            }catch(_:java.nio.file.AtomicMoveNotSupportedException){
                Files.move(temp.toPath(),target.toPath())
            }
        }finally{temp.delete()}
        return recordId
    }
    @Synchronized fun list(projectId:String):List<String> {
        val folder=dir(projectId)
        if(!folder.isDirectory)return emptyList()
        val records=folder.listFiles()?.filter{it.isFile&&it.extension=="json"}
            ?:error("Cannot inspect optical evidence history.")
        require(records.size<=20){"Optical evidence quota was exceeded."}
        for(record in records)read(projectId,record.name.removeSuffix(".json"))
        return records.sortedByDescending{it.lastModified()}.map{it.name.removeSuffix(".json")}
    }
    @Synchronized fun read(projectId:String,id:String):String {
        val target=file(projectId,id)
        require(target.isFile&&target.length()<=2*1024*1024){
            "Optical evidence is missing or too large."
        }
        val bytes=target.readBytes()
        validate(bytes,projectId,id)
        return String(bytes,StandardCharsets.UTF_8)
    }
}
