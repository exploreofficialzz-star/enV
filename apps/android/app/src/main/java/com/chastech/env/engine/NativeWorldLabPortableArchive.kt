package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.AtomicMoveNotSupportedException
import java.util.UUID

/**
 * Native Android portable archive v1/v2. Historical Web numerical runs are
 * strictly wrapped and preserved as uninterpreted evidence, not recomputed.
 * The app never executes code from a transferred scientific archive.
 */
data class NativeWorldLabPortableContent(val projectJson:String,
    val project:NativeWorldLabProject,
    val numericalRuns:JSONArray,val scienceEvidence:JSONArray)

class NativeWorldLabPortableArchiveStore(private val root:File){
    private val opaque=File(root,"world-lab-portable-runs-v1")
    private fun file(id:String):File{
        require(id.matches(Regex("[A-Za-z0-9_-]{1,120}"))){"Invalid archive project ID"}
        return File(opaque,id+".json")
    }
    private fun strict(obj:JSONObject,keys:Set<String>){
        require(obj.length()==keys.size&&obj.keys().asSequence().all{it in keys}){
            "Archive has missing or unexpected portable fields"}
    }
    fun decode(json:String):NativeWorldLabPortableContent{
        require(json.toByteArray(StandardCharsets.UTF_8).size<=24*1024*1024){
            "Complete invention archive exceeds 24 MB"}
        val archive=JSONObject(json)
        val version=archive.getInt("schemaVersion")
        require(archive.getString("format")=="env-world-lab-archive"&&version in 1..2){
            "Unsupported World Lab portable archive version"}
        strict(archive,if(version==1)setOf("format","schemaVersion","project","recordedRuns")
            else setOf("format","schemaVersion","project","recordedRuns","scientificEvidence"))
        val source=archive.getJSONObject("project").toString()
        require(source.toByteArray(StandardCharsets.UTF_8).size<=NativeWorldLabProjectCodec.MAX_BYTES){
            "Portable invention exceeds the 1 MB project limit"}
        val project=NativeWorldLabProjectCodec.decode(source)
        val recorded=archive.getJSONArray("recordedRuns")
        val evidence=if(version==2)archive.getJSONArray("scientificEvidence")else JSONArray()
        require(recorded.length()<=20&&evidence.length()<=20){
            "Portable archive exceeds its scientific record quotas"}
        val ids=mutableSetOf<String>()
        for(i in 0 until recorded.length()){
            val row=recorded.getJSONObject(i)
            strict(row,setOf("projectId","run"))
            require(row.getString("projectId")==project.id){
                "Numerical record belongs to another invention"}
            val run=row.getJSONObject("run")
            val runId=run.getString("id")
            require(runId.matches(Regex("[A-Za-z0-9_-]{1,120}"))&&ids.add(runId)&&
                run.getString("format")=="env-world-lab-run"&&
                run.getInt("schemaVersion")==1&&
                run.getString("evidence")=="physics-model-computed"&&
                run.getJSONArray("samples").length() in 2..50001&&
                row.toString().toByteArray(StandardCharsets.UTF_8).size<=8*1024*1024){
                "Legacy numeric experiment is unsupported or repeated"}
        }
        val store=NativeWorldLabEvidenceStore(root)
        for(i in 0 until evidence.length()){
            val row=evidence.getJSONObject(i)
            store.validateEnvelope(row.toString(),project.id)
            require(ids.add(row.getString("id"))){
                "Archive scientific record IDs must be unique"}
            require(row.getInt("projectRevision")<=project.revision){
                "Archive evidence is from a newer project revision"}
        }
        return NativeWorldLabPortableContent(source,project,recorded,evidence)
    }
    fun export(projectJson:String):String{
        val project=NativeWorldLabProjectCodec.decode(projectJson)
        val original=if(file(project.id).isFile)JSONArray(
            file(project.id).readText(StandardCharsets.UTF_8))else JSONArray()
        val records=NativeWorldLabEvidenceStore(root).list(project.id)
        val optics=NativeWorldLabOpticsEvidenceStore(root)
        val opticalRecords=optics.list(project.id).map{
            JSONObject(optics.read(project.id,it))
        }
        val total=records+opticalRecords
        require(total.size<=20){"Combined science evidence exceeds the 20-record archive budget."}
        require(total.map{it.getString("id")}.toSet().size==total.size){
            "Existing private science histories contain duplicate record identities."
        }
        val archive=JSONObject().put("format","env-world-lab-archive")
            .put("schemaVersion",2).put("project",JSONObject(projectJson))
            .put("recordedRuns",original)
            .put("scientificEvidence",JSONArray().apply{total.forEach{put(it)}})
        val result=archive.toString()
        decode(result)
        return result
    }
    /** Existing IDs cannot be overwritten during portable interchange.
     * The original legacy runs remain byte-preserved in private app storage. */
    @Synchronized fun import(json:String):NativeWorldLabPortableContent{
        val content=decode(json)
        val saved=File(File(root,"world-lab-v1"),content.project.id+".json")
        val originalArchive=File(File(root,"ImportedPortableArchives"),
            content.project.id+".json")
        if(saved.exists()){
            require(saved.isFile&&originalArchive.isFile&&
                originalArchive.readText(StandardCharsets.UTF_8)==json&&
                NativeWorldLabProjectStore(root).read(content.project.id).json==
                    content.projectJson){
                "An invention with this ID already exists; only an identical "+
                "previously interrupted archive import may resume."
            }
        }
        if(originalArchive.exists()){
            require(originalArchive.isFile&&
                originalArchive.readText(StandardCharsets.UTF_8)==json){
                "A different portable archive already owns this recovery identity."
            }
        }else{
            val backupDir=originalArchive.parentFile
            require(backupDir.isDirectory||backupDir.mkdirs()){
                "Cannot preserve the original portable archive for recovery."
            }
            val tmp=File.createTempFile(".world-lab-original-",".tmp",backupDir)
            try{
                tmp.writeText(json,StandardCharsets.UTF_8)
                try{
                    Files.move(tmp.toPath(),originalArchive.toPath(),
                        StandardCopyOption.ATOMIC_MOVE)
                }catch(_:AtomicMoveNotSupportedException){
                    Files.move(tmp.toPath(),originalArchive.toPath())
                }
            }finally{tmp.delete()}
        }
        val dir=opaque
        require(dir.isDirectory||dir.mkdirs()){"Cannot create portable archive directory"}
        // Preserve the original legacy payload first, before importing any edits.
        val temp=File.createTempFile(".world-lab-numeric-", ".tmp",dir)
        val destination=file(content.project.id)
        try{
            val encoded=content.numericalRuns.toString()
            if(destination.exists()){
                require(destination.isFile&&
                    destination.readText(StandardCharsets.UTF_8)==encoded){
                    "Stored historical experiments conflict with this immutable import."
                }
            }else{
                temp.writeText(encoded,StandardCharsets.UTF_8)
                try{
                    Files.move(temp.toPath(),destination.toPath(),
                        StandardCopyOption.ATOMIC_MOVE)
                }catch(_:AtomicMoveNotSupportedException){
                    Files.move(temp.toPath(),destination.toPath())
                }
            }
        }finally{temp.delete()}
        NativeWorldLabProjectStore(root).save(content.projectJson)
        val history=NativeWorldLabEvidenceStore(root)
        for(i in 0 until content.scienceEvidence.length())
            history.importRecord(content.project.id,content.scienceEvidence.getJSONObject(i))
        return content
    }
}
