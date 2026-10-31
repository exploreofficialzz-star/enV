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
            outer.getString("kind") in setOf("interface-optics","optical-scene-ray")&&
            outer.getInt("projectRevision")>=0){"Optical evidence identity was changed."}
        require(outer.getString("createdAt").let{
            runCatching{OffsetDateTime.parse(it)}.isSuccess
        }){"Optical evidence date is invalid."}
        val result=outer.getJSONObject("result")
        if(outer.getString("kind")=="optical-scene-ray"){
            val requiredRay=setOf("format","modelVersion","evidence",
                "materialEvidence","projectId","projectRevision","input","segments",
                "accountedLostBranchPowerFraction","finalPrimaryRayPowerFraction","validity")
            require(result.keys().asSequence().toSet()==requiredRay&&
                result.getString("format")=="env-world-lab-optical-scene-ray"&&
                result.getString("modelVersion")=="1.0.0"&&
                result.getString("evidence")=="physics-model-computed"&&
                result.getString("materialEvidence")=="hypothetical-user-assumed"&&
                result.getString("projectId")==projectId&&
                result.getInt("projectRevision")==outer.getInt("projectRevision")&&
                result.getString("validity").length in 30..2000){
                "3D optical evidence is not a supported World Lab record."
            }
            fun vector3(value:org.json.JSONArray):Boolean{
                if(value.length()!=3)return false
                return (0..2).all{idx->
                    val v=value.getDouble(idx)
                    v.isFinite()&&kotlin.math.abs(v)<=100000
                }
            }
            val input=result.getJSONObject("input")
            require(input.keys().asSequence().toSet()==setOf("originMeters",
                "direction","maximumDistanceMeters","maximumInterfaces")&&
                vector3(input.getJSONArray("originMeters"))&&
                vector3(input.getJSONArray("direction"))&&
                input.getDouble("maximumDistanceMeters") in 0.1..1000.0&&
                input.getInt("maximumInterfaces") in 1..16){
                "Invented ray origin, direction or simulation budget is unsupported."
            }
            val segments=result.getJSONArray("segments")
            require(segments.length() in 1..18){
                "3D optical evidence has an invalid intersection count."
            }
            for(i in 0 until segments.length()){
                val part=segments.getJSONObject(i)
                require(part.keys().asSequence().toSet()==setOf(
                    "startMeters","endMeters","kind","entityId","travelMeters",
                    "incidentIndex","transmittedIndex","reflectance",
                    "transmittance","survivingRayPowerFraction")&&
                    vector3(part.getJSONArray("startMeters"))&&
                    vector3(part.getJSONArray("endMeters"))&&
                    part.getString("kind") in setOf("transmitted",
                        "total-internal-reflection","escaped","limit")&&
                    part.getDouble("travelMeters")>=0&&
                    part.getDouble("incidentIndex") in 1.0..5.0&&
                    (part.isNull("transmittedIndex")||
                        part.getDouble("transmittedIndex") in 1.0..5.0)&&
                    part.getDouble("reflectance") in 0.0..1.0&&
                    part.getDouble("transmittance") in 0.0..1.0&&
                    part.getDouble("survivingRayPowerFraction") in 0.0..1.0&&
                    kotlin.math.abs(part.getDouble("reflectance")+
                        part.getDouble("transmittance")-1)<1e-9){
                    "Imported 3D optical segment violates finite model bounds."
                }
            }
            val primary=result.getDouble("finalPrimaryRayPowerFraction")
            val ignored=result.getDouble("accountedLostBranchPowerFraction")
            require(primary in 0.0..1.0&&ignored in 0.0..1.0&&
                kotlin.math.abs(primary+ignored-1)<1e-6){
                "Optical 3D evidence does not account for its reflected power."
            }
            return outer
        }
        val required=setOf("format","modelVersion","evidence","materialEvidence",
            "projectId","projectRevision","firstMaterialId","secondMaterialId",
            "firstIndex","secondIndex","incidentAngleDegrees","reflectedAngleDegrees",
            "transmittedAngleDegrees","criticalAngleDegrees",
            "totalInternalReflection","sReflectance","pReflectance",
            "unpolarizedReflectance","unpolarizedTransmittance","energyResidual",
            "validity")
        require(result.keys().asSequence().toSet()==required){
            "Optical evidence fields are incomplete or unrecognized."
        }
        require(result.getString("firstMaterialId")!=result.getString("secondMaterialId")&&
            result.getDouble("incidentAngleDegrees") in 0.0..89.9&&
            result.getDouble("reflectedAngleDegrees")==result.getDouble("incidentAngleDegrees")&&
            result.getString("validity").length in 30..2000){
            "Optical evidence assumptions are invalid."
        }
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
        val s=result.getDouble("sReflectance")
        val p=result.getDouble("pReflectance")
        val residual=result.getDouble("energyResidual")
        val total=result.getBoolean("totalInternalReflection")
        require(s.isFinite()&&p.isFinite()&&s in 0.0..1.0&&p in 0.0..1.0&&
            residual.isFinite()&&residual in 0.0..1e-8&&
            kotlin.math.abs(refl-(s+p)/2)<1e-9&&
            (!total||(result.isNull("transmittedAngleDegrees")&&trans==0.0))){
            "Optical evidence polarizations or power balance are invalid."
        }
        require(first.isFinite()&&first in 1.0..5.0&&
            second.isFinite()&&second in 1.0..5.0&&
            refl.isFinite()&&refl in 0.0..1.0&&
            trans.isFinite()&&trans in 0.0..1.0&&
            kotlin.math.abs(refl+trans-1)<1e-9){
            "Optical evidence violates its finite conservation envelope."
        }
        return outer
    }
    /** Shared validator for complete-archive import (no storage writes). */
    fun validatePortableEnvelope(raw:String,projectId:String):JSONObject {
        val input=JSONObject(raw)
        val identifier=safeId(input.getString("id"))
        return validate(raw.toByteArray(StandardCharsets.UTF_8),projectId,identifier)
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
    @Synchronized fun save(run:NativeOpticalSceneRun):String =
        importRecord(run.portableEvidence(),run.projectId)
    /** Import only an already-saved, project-bound, immutable optical result. */
    @Synchronized fun importRecord(json:String,projectId:String):String {
        val bytes=json.toByteArray(StandardCharsets.UTF_8)
        require(bytes.size<=2*1024*1024){"Imported scientific record exceeds 2 MB."}
        val header=JSONObject(json)
        val id=safeId(header.getString("id"))
        val record=validate(bytes,projectId,id)
        val saved=NativeWorldLabProjectStore(root).read(projectId)
        require(record.getInt("projectRevision")<=saved.revision){
            "Scientific evidence belongs to a later invention revision."
        }
        val destination=file(projectId,id)
        if(destination.exists()){
            require(read(projectId,id)==json){
                "A different immutable optical result already uses this ID."
            }
            return id
        }
        val dir=dir(projectId)
        require(dir.isDirectory||dir.mkdirs()){"Cannot create optical evidence history."}
        require((dir.listFiles()?.count{it.isFile&&it.extension=="json"}?:0)<20){
            "Optical evidence quota is full."
        }
        val temp=File.createTempFile("optic-import-",".tmp",dir)
        try{
            temp.writeBytes(bytes)
            try{
                Files.move(temp.toPath(),destination.toPath(),StandardCopyOption.ATOMIC_MOVE)
            }catch(_:java.nio.file.AtomicMoveNotSupportedException){
                Files.move(temp.toPath(),destination.toPath())
            }
        }finally{temp.delete()}
        return id
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
