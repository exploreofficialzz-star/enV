package com.chastech.env

import android.content.ContentValues
import android.content.Context
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.common.InputImage
import com.google.android.gms.tasks.Tasks
import android.os.ParcelFileDescriptor
import android.graphics.pdf.PdfRenderer
import android.graphics.Bitmap
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.ByteArrayOutputStream
import java.util.Locale
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import java.util.zip.ZipInputStream
import java.util.zip.CRC32

private data class ABookNoteRecord(
    val id:String,val title:String,val body:String,val notebook:String,val tags:String,
    val pinned:Boolean,val archived:Boolean,val deletedAt:Long?,val createdAt:Long,val updatedAt:Long,val revision:Int
)
private data class ABookFileRecord(val id:String,val noteId:String,val name:String,val mime:String,val relativePath:String,val size:Long,val createdAt:Long)

private fun parseABookPageGroups(value:String,pageCount:Int):List<List<Int>>{
    require(pageCount>0){"This PDF has no readable pages."}
    val groups=value.split(";").map{it.trim()}.filter{it.isNotEmpty()}
    require(groups.size>=2){"Enter at least two page groups, for example 1-3;4-6."}
    require(groups.size<=100){"Create up to 100 PDF parts at a time."}
    val used=mutableSetOf<Int>()
    return groups.map{group->
        val pages=mutableListOf<Int>()
        group.split(",").map{it.trim()}.forEach{token->
            require(Regex("^\\d+(?:-\\d+)?$").matches(token)){"Invalid page range: $token"}
            val parts=token.split("-")
            val first=parts[0].toInt();val last=parts.getOrNull(1)?.toInt()?:first
            require(first>=1&&last>=first&&last<=pageCount){"Choose page numbers from 1 to $pageCount."}
            require(pages.size+last-first+1<=5000){"A maximum of 5,000 pages can be split at once."}
            for(page in first..last){require(used.add(page)){"Page $page appears in more than one part."};pages.add(page);require(used.size<=5000){"A maximum of 5,000 pages can be split in one operation."}}
        }
        require(pages.isNotEmpty()){"Each PDF part must contain at least one page."}
        pages
    }
}

private suspend fun recognizeABookPdfOffline(file: File): String = withContext(Dispatchers.IO) {
    require(file.isFile && file.length() in 1..(100L * 1024 * 1024)) {
        "Choose a readable PDF smaller than 100 MB."
    }
    val output = StringBuilder()
    val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    try {
        PdfRenderer(descriptor).use { renderer ->
            require(renderer.pageCount in 1..100) {
                "On-device OCR supports PDFs with 1 to 100 pages per operation."
            }
            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            try {
                for (index in 0 until renderer.pageCount) {
                    val page = renderer.openPage(index)
                    try {
                        val scale = minOf(1600f / page.width, 2200f / page.height, 2f)
                        val width = (page.width * scale).toInt().coerceAtLeast(1)
                        val height = (page.height * scale).toInt().coerceAtLeast(1)
                        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                        try {
                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                            val recognized = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)))
                            if (recognized.text.isNotBlank()) {
                                if (output.isNotEmpty()) output.append("\n\n")
                                output.append("Page ").append(index + 1).append("\n")
                                    .append(recognized.text)
                            }
                        } finally {
                            bitmap.recycle()
                        }
                    } finally {
                        page.close()
                    }
                    if (output.length >= 150_000) break
                }
            } finally {
                recognizer.close()
            }
        }
    } finally {
        descriptor.close()
    }
    output.toString().take(150_000)
}

private fun safeABookPdfName(value:String):String =
    value.substringBeforeLast(".",value).replace(Regex("[^A-Za-z0-9._-]+"),"-").trim('-').take(80).ifBlank{"document"}

private data class ABookRevisionRecord(val id:String,val noteId:String,val title:String,val body:String,val notebook:String,val tags:String,val revision:Int,val createdAt:Long)

private class ABookLocalDb(context:Context):SQLiteOpenHelper(context.applicationContext,"env-a-book.db",null,1){
    override fun onCreate(db:SQLiteDatabase){
        db.execSQL("CREATE TABLE notes(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,notebook TEXT NOT NULL,tags TEXT NOT NULL,pinned INTEGER NOT NULL,archived INTEGER NOT NULL,deleted_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revision INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE revisions(id TEXT PRIMARY KEY,note_id TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,notebook TEXT NOT NULL,tags TEXT NOT NULL,revision INTEGER NOT NULL,created_at INTEGER NOT NULL)")
        db.execSQL("CREATE INDEX revisions_note ON revisions(note_id,created_at DESC)")
        db.execSQL("CREATE TABLE attachments(id TEXT PRIMARY KEY,note_id TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,path TEXT NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL)")
        db.execSQL("CREATE INDEX attachments_note ON attachments(note_id)")
    }
    override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int){ /* Never drop local notes. */ }
    private fun read(c:android.database.Cursor)=ABookNoteRecord(
        c.getString(c.getColumnIndexOrThrow("id")),c.getString(c.getColumnIndexOrThrow("title")),
        c.getString(c.getColumnIndexOrThrow("body")),c.getString(c.getColumnIndexOrThrow("notebook")),
        c.getString(c.getColumnIndexOrThrow("tags")),c.getInt(c.getColumnIndexOrThrow("pinned"))!=0,
        c.getInt(c.getColumnIndexOrThrow("archived"))!=0,
        if(c.isNull(c.getColumnIndexOrThrow("deleted_at")))null else c.getLong(c.getColumnIndexOrThrow("deleted_at")),
        c.getLong(c.getColumnIndexOrThrow("created_at")),c.getLong(c.getColumnIndexOrThrow("updated_at")),
        c.getInt(c.getColumnIndexOrThrow("revision"))
    )
    fun notes(includeArchived:Boolean=false,includeDeleted:Boolean=false):List<ABookNoteRecord> =
        readableDatabase.query("notes",null,when { includeDeleted && includeArchived -> null; includeDeleted -> "deleted_at IS NOT NULL"; includeArchived -> "deleted_at IS NULL"; else -> "deleted_at IS NULL AND archived=0" },null,null,null,"pinned DESC,updated_at DESC")
            .use{c->buildList{while(c.moveToNext())add(read(c))}}
    fun save(note:ABookNoteRecord):ABookNoteRecord{
        val db=writableDatabase;db.beginTransaction()
        try{
            val old=db.query("notes",null,"id=?",arrayOf(note.id),null,null,null).use{if(it.moveToFirst())read(it)else null}
            val changed=old!=null&&(old.title!=note.title||old.body!=note.body||old.notebook!=note.notebook||old.tags!=note.tags)
            var rev=old?.revision?:0
            if(changed&&old!=null){
                rev++
                db.insertOrThrow("revisions",null,ContentValues().apply{
                    put("id",UUID.randomUUID().toString());put("note_id",old.id);put("title",old.title);put("body",old.body)
                    put("notebook",old.notebook);put("tags",old.tags);put("revision",rev);put("created_at",System.currentTimeMillis())
                })
                db.execSQL("DELETE FROM revisions WHERE note_id=? AND id NOT IN (SELECT id FROM revisions WHERE note_id=? ORDER BY created_at DESC LIMIT 40)",arrayOf(old.id,old.id))
            }
            val saved=note.copy(updatedAt=System.currentTimeMillis(),revision=rev)
            db.insertWithOnConflict("notes",null,ContentValues().apply{
                put("id",saved.id);put("title",saved.title);put("body",saved.body);put("notebook",saved.notebook);put("tags",saved.tags)
                put("pinned",if(saved.pinned)1 else 0);put("archived",if(saved.archived)1 else 0)
                if(saved.deletedAt==null)putNull("deleted_at") else put("deleted_at",saved.deletedAt)
                put("created_at",saved.createdAt);put("updated_at",saved.updatedAt);put("revision",saved.revision)
            },SQLiteDatabase.CONFLICT_REPLACE)
            db.setTransactionSuccessful();return saved
        }finally{db.endTransaction()}
    }
    fun attachments(noteId:String):List<ABookFileRecord> =
        readableDatabase.query("attachments",null,"note_id=?",arrayOf(noteId),null,null,"created_at").use{c->buildList{
            while(c.moveToNext())add(ABookFileRecord(c.getString(c.getColumnIndexOrThrow("id")),c.getString(c.getColumnIndexOrThrow("note_id")),c.getString(c.getColumnIndexOrThrow("name")),c.getString(c.getColumnIndexOrThrow("mime")),c.getString(c.getColumnIndexOrThrow("path")),c.getLong(c.getColumnIndexOrThrow("size")),c.getLong(c.getColumnIndexOrThrow("created_at")) ))
        }}
    fun restore(noteId:String){
        writableDatabase.update("notes",ContentValues().apply{putNull("deleted_at");put("archived",0);put("updated_at",System.currentTimeMillis())},"id=?",arrayOf(noteId))
    }
    fun revisions(noteId:String):List<ABookRevisionRecord> = readableDatabase.query("revisions",null,"note_id=?",arrayOf(noteId),null,null,"created_at DESC").use{c->buildList{
        while(c.moveToNext())add(ABookRevisionRecord(c.getString(c.getColumnIndexOrThrow("id")),c.getString(c.getColumnIndexOrThrow("note_id")),c.getString(c.getColumnIndexOrThrow("title")),c.getString(c.getColumnIndexOrThrow("body")),c.getString(c.getColumnIndexOrThrow("notebook")),c.getString(c.getColumnIndexOrThrow("tags")),c.getInt(c.getColumnIndexOrThrow("revision")),c.getLong(c.getColumnIndexOrThrow("created_at"))))
    }}
    fun restoreRevision(noteId:String,revisionId:String):ABookNoteRecord? {
        val db=writableDatabase;db.beginTransaction()
        try{
            val old=db.query("revisions",null,"id=? AND note_id=?",arrayOf(revisionId,noteId),null,null,null).use{if(it.moveToFirst())ABookRevisionRecord(it.getString(it.getColumnIndexOrThrow("id")),it.getString(it.getColumnIndexOrThrow("note_id")),it.getString(it.getColumnIndexOrThrow("title")),it.getString(it.getColumnIndexOrThrow("body")),it.getString(it.getColumnIndexOrThrow("notebook")),it.getString(it.getColumnIndexOrThrow("tags")),it.getInt(it.getColumnIndexOrThrow("revision")),it.getLong(it.getColumnIndexOrThrow("created_at")))else null}?:return null
            val current=db.query("notes",null,"id=?",arrayOf(noteId),null,null,null).use{if(it.moveToFirst())read(it)else null}?:return null
            val next=current.copy(title=old.title,body=old.body,notebook=old.notebook,tags=old.tags,revision=current.revision+1,updatedAt=System.currentTimeMillis())
            db.insertOrThrow("revisions",null,ContentValues().apply{put("id",UUID.randomUUID().toString());put("note_id",noteId);put("title",current.title);put("body",current.body);put("notebook",current.notebook);put("tags",current.tags);put("revision",current.revision);put("created_at",System.currentTimeMillis())})
            db.update("notes",ContentValues().apply{put("title",next.title);put("body",next.body);put("notebook",next.notebook);put("tags",next.tags);put("revision",next.revision);put("updated_at",next.updatedAt)},"id=?",arrayOf(noteId))
            db.setTransactionSuccessful();return next
        }finally{db.endTransaction()}
    }
    fun permanentlyDelete(noteId:String):List<String>{
        val db=writableDatabase;db.beginTransaction()
        try{
            val paths=db.query("attachments",arrayOf("path"),"note_id=?",arrayOf(noteId),null,null,null).use{c->buildList{while(c.moveToNext())add(c.getString(0))}}
            db.delete("attachments","note_id=?",arrayOf(noteId));db.delete("revisions","note_id=?",arrayOf(noteId));db.delete("notes","id=?",arrayOf(noteId))
            db.setTransactionSuccessful();return paths
        }finally{db.endTransaction()}
    }
    fun importLibrary(importNotes:List<ABookNoteRecord>,importRevisions:List<ABookRevisionRecord>,importAttachments:List<ABookFileRecord>){
        val db=writableDatabase;db.beginTransaction()
        try{
            importNotes.forEach{note->db.insertOrThrow("notes",null,ContentValues().apply{
                put("id",note.id);put("title",note.title);put("body",note.body);put("notebook",note.notebook);put("tags",note.tags)
                put("pinned",if(note.pinned)1 else 0);put("archived",if(note.archived)1 else 0)
                if(note.deletedAt==null)putNull("deleted_at")else put("deleted_at",note.deletedAt)
                put("created_at",note.createdAt);put("updated_at",note.updatedAt);put("revision",note.revision)
            })}
            importRevisions.forEach{revision->db.insertOrThrow("revisions",null,ContentValues().apply{
                put("id",revision.id);put("note_id",revision.noteId);put("title",revision.title);put("body",revision.body)
                put("notebook",revision.notebook);put("tags",revision.tags);put("revision",revision.revision);put("created_at",revision.createdAt)
            })}
            importAttachments.forEach{attachment->db.insertOrThrow("attachments",null,ContentValues().apply{
                put("id",attachment.id);put("note_id",attachment.noteId);put("name",attachment.name);put("mime",attachment.mime)
                put("path",attachment.relativePath);put("size",attachment.size);put("created_at",attachment.createdAt)
            })}
            db.setTransactionSuccessful()
        }finally{db.endTransaction()}
    }

    fun addFiles(records:List<ABookFileRecord>){
        if(records.isEmpty())return
        val db=writableDatabase
        db.beginTransaction()
        try{
            records.forEach{record->
                db.insertOrThrow("attachments",null,ContentValues().apply{
                    put("id",record.id);put("note_id",record.noteId);put("name",record.name);put("mime",record.mime)
                    put("path",record.relativePath);put("size",record.size);put("created_at",record.createdAt)
                })
            }
            db.setTransactionSuccessful()
        }finally{db.endTransaction()}
    }
}


private fun createABookBackup(context:Context,db:ABookLocalDb):File{
    val allNotes=db.notes(true,true)
    require(allNotes.size<=10000){"This library contains more than 10,000 notes and cannot be exported in one backup."}
    val notesJson=JSONArray();val revisionsJson=JSONArray();val attachmentsJson=JSONArray()
    val archiveFiles=linkedMapOf<String,ByteArray>()
    var totalBytes=0L;var attachmentIndex=0;var revisionCount=0
    allNotes.forEach{note->
        require(note.title.length<=10000&&note.body.length<=5000000&&note.notebook.length<=500){"A note exceeds the supported backup size."}
        val noteTags=JSONArray(note.tags)
        require(noteTags.length()<=50){"A note has too many tags to export."}
        for(tagIndex in 0 until noteTags.length())require(noteTags.getString(tagIndex).length<=200){"A note tag exceeds the supported size."}
        notesJson.put(JSONObject().apply{
            put("id",note.id);put("title",note.title);put("body",note.body);put("notebook",note.notebook)
            put("tags",noteTags);put("pinned",note.pinned);put("archived",note.archived)
            put("deletedAt",note.deletedAt?:JSONObject.NULL);put("createdAt",note.createdAt);put("updatedAt",note.updatedAt);put("revision",note.revision)
        })
        db.revisions(note.id).forEach{revision->
            revisionCount++;require(revisionCount<=100000){"This library contains more than 100,000 revisions and cannot be exported in one backup."}
            require(revision.title.length<=10000&&revision.body.length<=5000000&&revision.notebook.length<=500&&revision.revision>=0){"A revision exceeds the supported backup size."}
            val revisionTags=JSONArray(revision.tags);require(revisionTags.length()<=50){"A revision has too many tags to export."}
            for(tagIndex in 0 until revisionTags.length())require(revisionTags.getString(tagIndex).length<=200){"A revision tag exceeds the supported size."}
            revisionsJson.put(JSONObject().apply{
                put("id",revision.id);put("noteId",revision.noteId);put("title",revision.title);put("body",revision.body)
                put("notebook",revision.notebook);put("tags",revisionTags);put("revision",revision.revision);put("createdAt",revision.createdAt)
            })
        }
        db.attachments(note.id).forEach{attachment->
            attachmentIndex++;require(attachmentIndex<=10000){"This library contains more than 10,000 attachments and cannot be exported in one backup."}
            require(attachment.id.isNotBlank()&&attachment.id.length<=180&&attachment.name.length<=500&&attachment.mime.length<=200){"An attachment has invalid metadata."}
            val root=context.filesDir.canonicalFile
            val file=File(context.filesDir,attachment.relativePath).canonicalFile
            require(file.path.startsWith(root.path+File.separator)&&file.isFile){"A local attachment is missing or outside A book storage."}
            val bytes=file.readBytes()
            require(bytes.size<=100*1024*1024){"An attachment exceeds the 100 MB backup limit."}
            totalBytes+=bytes.size
            require(totalBytes<=150L*1024*1024){"The local library exceeds the 150 MB backup limit."}
            val entryPath="attachments/"+(attachmentIndex-1)+".bin"
            archiveFiles[entryPath]=bytes
            attachmentsJson.put(JSONObject().apply{
                put("id",attachment.id);put("noteId",note.id);put("name",attachment.name);put("type",attachment.mime)
                put("size",bytes.size);put("createdAt",attachment.createdAt);put("path",entryPath)
            })
        }
    }
    val manifest=JSONObject().put("format","env.abook.archive.v1").put("createdAt",System.currentTimeMillis())
        .put("notes",notesJson).put("revisions",revisionsJson).put("attachments",attachmentsJson)
    val manifestBytes=manifest.toString().toByteArray(Charsets.UTF_8)
    require(manifestBytes.size+totalBytes<=150L*1024*1024){"The full backup exceeds A book's 150 MB safety limit."}
    archiveFiles["manifest.json"]=manifestBytes
    val output=File(context.cacheDir,"a-book-backup-"+UUID.randomUUID()+".zip")
    ZipOutputStream(FileOutputStream(output)).use{zip->
        archiveFiles.forEach{(name,bytes)->
            val crc=CRC32().apply{update(bytes)}
            val entry=ZipEntry(name).apply{method=ZipEntry.STORED;size=bytes.size.toLong();compressedSize=bytes.size.toLong();this.crc=crc.value}
            zip.putNextEntry(entry);zip.write(bytes);zip.closeEntry()
        }
    }
    require(output.length()<=180L*1024*1024){"The backup exceeds A book's 180 MB export limit."}
    return output
}

private fun importABookBackup(context:Context,db:ABookLocalDb,source:File):Int{
    require(source.isFile&&source.length() in 1..(180L*1024*1024)){"Choose a valid A book backup smaller than 180 MB."}
    val entries=linkedMapOf<String,ByteArray>();var expanded=0L
    ZipInputStream(source.inputStream()).use{zip->
        var entry=zip.nextEntry
        while(entry!=null){
            val name=entry.name
            require(!entry.isDirectory&&!name.startsWith("/")&&!name.contains("\\")&&name.split("/").none{it==".."||it=="."||it.isEmpty()}){"The backup contains an unsafe file path."}
            require(!entries.containsKey(name)&&entries.size<10001){"The backup contains duplicate or excessive entries."}
            val output=ByteArrayOutputStream()
            val buffer=ByteArray(8192);var count:Int
            while(zip.read(buffer).also{count=it}!=-1){
                output.write(buffer,0,count);expanded+=count
                require(output.size()<=100*1024*1024&&expanded<=150L*1024*1024){"The backup expands beyond A book's safety limits."}
            }
            entries[name]=output.toByteArray()
            zip.closeEntry();entry=zip.nextEntry
        }
    }
    val manifestBytes=entries["manifest.json"]?:throw IllegalArgumentException("This file is not an A book backup.")
    val manifest=JSONObject(String(manifestBytes,Charsets.UTF_8))
    require(manifest.optString("format")=="env.abook.archive.v1"){"This is not a supported A book backup."}
    val noteArray=manifest.optJSONArray("notes")?:throw IllegalArgumentException("The backup has no notes section.")
    val revisionArray=manifest.optJSONArray("revisions")?:JSONArray()
    val attachmentArray=manifest.optJSONArray("attachments")?:JSONArray()
    require(noteArray.length()<=10000&&revisionArray.length()<=100000&&attachmentArray.length()<=10000){"The backup contains too many records."}

    val idMap=linkedMapOf<String,String>()
    val importedNotes=mutableListOf<ABookNoteRecord>()
    for(i in 0 until noteArray.length()){
        val item=noteArray.getJSONObject(i)
        val oldId=item.getString("id")
        require(oldId.isNotBlank()&&oldId.length<=180&&!idMap.containsKey(oldId)){"The backup contains an invalid or duplicate note ID."}
        val title=item.getString("title");val body=item.getString("body");val notebook=item.getString("notebook")
        require(title.length<=10000&&body.length<=5000000&&notebook.length<=500){"A note exceeds the supported size."}
        val tags=item.optJSONArray("tags")?:JSONArray()
        require(tags.length()<=50){"A note has too many tags."}
        val normalizedTags=JSONArray()
        for(j in 0 until tags.length()){val tag=tags.getString(j);require(tag.length<=200);normalizedTags.put(tag)}
        val pinned=item.getBoolean("pinned");val archived=item.getBoolean("archived")
        val deleted=if(item.isNull("deletedAt"))null else item.getLong("deletedAt")
        val created=item.getLong("createdAt");val updated=item.getLong("updatedAt");val revision=item.getInt("revision")
        require(revision>=0){"A note has an invalid revision number."}
        val newId=UUID.randomUUID().toString();idMap[oldId]=newId
        importedNotes.add(ABookNoteRecord(newId,title,body,notebook,normalizedTags.toString(),pinned,archived,deleted,created,updated,revision))
    }
    val importedRevisions=mutableListOf<ABookRevisionRecord>();val revisionIds=mutableSetOf<String>()
    for(i in 0 until revisionArray.length()){
        val item=revisionArray.getJSONObject(i);val originalRevisionId=item.getString("id")
        require(originalRevisionId.isNotBlank()&&originalRevisionId.length<=180&&revisionIds.add(originalRevisionId)){"The backup contains an invalid or duplicate revision ID."}
        val newNoteId=idMap[item.getString("noteId")]?:throw IllegalArgumentException("A revision refers to a missing note.")
        val revisionTitle=item.getString("title");val revisionBody=item.getString("body");val revisionNotebook=item.getString("notebook");val revisionNumber=item.getInt("revision")
        require(revisionTitle.length<=10000&&revisionBody.length<=5000000&&revisionNotebook.length<=500&&revisionNumber>=0){"A revision exceeds the supported size."}
        val tags=item.optJSONArray("tags")?:JSONArray()
        require(tags.length()<=50){"A revision has too many tags."}
        val normalized=JSONArray();for(j in 0 until tags.length()){val tag=tags.getString(j);require(tag.length<=200);normalized.put(tag)}
        importedRevisions.add(ABookRevisionRecord(UUID.randomUUID().toString(),newNoteId,revisionTitle,revisionBody,revisionNotebook,normalized.toString(),revisionNumber,item.getLong("createdAt")))
    }
    val copiedFiles=mutableListOf<File>()
    val importedAttachments=mutableListOf<ABookFileRecord>()
    val expectedPaths=mutableSetOf("manifest.json");var totalAttachmentBytes=0L;val attachmentIds=mutableSetOf<String>()
    try{
        for(i in 0 until attachmentArray.length()){
            val item=attachmentArray.getJSONObject(i)
            val newNoteId=idMap[item.getString("noteId")]?:throw IllegalArgumentException("An attachment refers to a missing note.")
            val originalAttachmentId=item.getString("id")
            require(originalAttachmentId.isNotBlank()&&originalAttachmentId.length<=180&&attachmentIds.add(originalAttachmentId)){"The backup contains an invalid or duplicate attachment ID."}
            val archivePath=item.getString("path")
            require(Regex("^attachments/\\d+\\.bin$").matches(archivePath)&&expectedPaths.add(archivePath)){"The backup contains an unsafe or duplicate attachment path."}
            val bytes=entries[archivePath]?:throw IllegalArgumentException("A backup attachment is missing.")
            val size=item.getLong("size")
            require(size==bytes.size.toLong()&&size<=100L*1024*1024){"A backup attachment failed its size check."}
            totalAttachmentBytes+=size;require(totalAttachmentBytes<=150L*1024*1024){"Backup attachments exceed 150 MB."}
            val name=item.getString("name");val mime=item.getString("type")
            require(name.isNotBlank()&&name.length<=500&&mime.length<=200){"A backup attachment has invalid metadata."}
            val id=UUID.randomUUID().toString()
            val ext=name.substringAfterLast('.', "").filter{it.isLetterOrDigit()}.take(10)
            val folder=File(context.filesDir,"a-book/attachments/"+newNoteId).apply{mkdirs()}
            val root=context.filesDir.canonicalFile;val safeFolder=folder.canonicalFile
            require(safeFolder.path.startsWith(root.path+File.separator)){"Unsafe local attachment destination."}
            val destination=File(safeFolder,id+(if(ext.isNotEmpty())".$ext" else ""))
            destination.writeBytes(bytes);copiedFiles.add(destination)
            val relative="a-book/attachments/"+newNoteId+"/"+destination.name
            importedAttachments.add(ABookFileRecord(id,newNoteId,name,mime,relative,size,item.getLong("createdAt")))
        }
        require(entries.keys==expectedPaths){"The backup contains unexpected files."}
        db.importLibrary(importedNotes,importedRevisions,importedAttachments)
        return importedNotes.size
    }catch(error:Throwable){
        copiedFiles.forEach{it.delete()}
        throw error
    }
}


@Composable
fun NativeABookScreen(){
    val context=LocalContext.current
    val db=remember{ABookLocalDb(context)}
    val scope=rememberCoroutineScope()
    var notes by remember{mutableStateOf(db.notes())}
    var selected by rememberSaveable{mutableStateOf<String?>(null)}
    var title by rememberSaveable{mutableStateOf("")}
    var body by rememberSaveable{mutableStateOf("")}
    var notebook by rememberSaveable{mutableStateOf("Inbox")}
    var tags by rememberSaveable{mutableStateOf("")}
    var search by rememberSaveable{mutableStateOf("")}
    var archived by rememberSaveable{mutableStateOf(false)}
    var showTrash by rememberSaveable{mutableStateOf(false)}
    var confirmPermanentDelete by rememberSaveable{mutableStateOf(false)}
    var selectedPdfIds by rememberSaveable{mutableStateOf(setOf<String>())}
    var splitPageGroups by rememberSaveable{mutableStateOf("1-3;4-6")}
    var pendingZip by remember{mutableStateOf<File?>(null)}
    var revisions by remember{mutableStateOf(emptyList<ABookRevisionRecord>())}
    var status by remember{mutableStateOf("Saved on this device")}
    var error by remember{mutableStateOf("")}
    var files by remember{mutableStateOf(emptyList<ABookFileRecord>())}
    var activePdf by remember{mutableStateOf<ABookFileRecord?>(null)}
    var pdfText by remember{mutableStateOf("")}
    var pendingPdf by remember{mutableStateOf<File?>(null)}

    fun reload(id:String?=selected,trashOnly:Boolean=showTrash){
        notes=db.notes(archived,trashOnly)
        val n=notes.firstOrNull{it.id==id}?:notes.firstOrNull()
        selected=n?.id;title=n?.title.orEmpty();body=n?.body.orEmpty();notebook=n?.notebook?:"Inbox"
        tags=n?.let{runCatching{JSONArray(it.tags).let{a->(0 until a.length()).joinToString(", "){i->a.getString(i)}}}.getOrDefault("")}.orEmpty()
        files=n?.let{db.attachments(it.id)}?:emptyList();revisions=n?.let{db.revisions(it.id)}?:emptyList()
    }

    fun selectedPdfFiles():List<ABookFileRecord> = files.filter{it.id in selectedPdfIds && (it.mime=="application/pdf"||it.name.endsWith(".pdf",true))}
    fun mergeSelectedPdfs(){
        val chosen=selectedPdfFiles()
        if(chosen.size<2){error="Select at least two PDFs to merge";return}
        if(chosen.size>25||chosen.sumOf{it.size}>300L*1024*1024){error="Select up to 25 PDFs with a combined size below 300 MB";return}
        scope.launch{
            status="Merging PDFs locally…";error=""
            val result=withContext(Dispatchers.IO){runCatching{
                PDFBoxResourceLoader.init(context)
                val merged=PDDocument()
                try{
                    var totalPages=0
                    chosen.forEach{record->
                        val source=File(context.filesDir,record.relativePath)
                        PDDocument.load(source).use{input->
                            totalPages+=input.numberOfPages
                            require(totalPages<=5000){"A maximum of 5,000 pages can be merged at once."}
                            input.pages.forEach{page->merged.importPage(page)}
                        }
                    }
                    val output=File(context.cacheDir,"a-book-merged-${UUID.randomUUID()}.pdf")
                    merged.save(output);output
                }finally{merged.close()}
            }}
            result.fold({pendingPdf=it;status="Merged ${chosen.size} PDFs locally";exportPdf.launch("a-book-merged.pdf")},{error=it.message?:"PDF merge failed";status="Not saved"})
        }
    }
    fun rotateSelectedPdfs(){
        val chosen=selectedPdfFiles()
        if(chosen.isEmpty()){error="Select at least one PDF";return}
        if(chosen.size>25||chosen.sumOf{it.size}>300L*1024*1024){error="Select up to 25 PDFs with a combined size below 300 MB";return}
        scope.launch{
            status="Rotating PDFs locally…";error=""
            val result=withContext(Dispatchers.IO){runCatching{
                PDFBoxResourceLoader.init(context)
                val zip=File(context.cacheDir,"a-book-rotated-${UUID.randomUUID()}.zip")
                var totalPages=0
                ZipOutputStream(FileOutputStream(zip)).use{archive->
                    val used=mutableSetOf<String>()
                    chosen.forEach{record->
                        val source=File(context.filesDir,record.relativePath)
                        val rotated=File(context.cacheDir,"a-book-rotate-${UUID.randomUUID()}.pdf")
                        PDDocument.load(source).use{doc->
                            totalPages+=doc.numberOfPages
                            require(totalPages<=5000){"A maximum of 5,000 pages can be processed in one batch."}
                            doc.pages.forEach{page->page.rotation=(page.rotation+90)%360}
                            doc.save(rotated)
                        }
                        val base=safeABookPdfName(record.name)
                        var name="$base-rotated.pdf";var suffix=2
                        while(!used.add(name.lowercase(Locale.ROOT)))name="$base-rotated-${suffix++}.pdf"
                        archive.putNextEntry(ZipEntry(name))
                        rotated.inputStream().use{it.copyTo(archive)}
                        archive.closeEntry();rotated.delete()
                    }
                }
                zip
            }}
            result.fold({pendingZip=it;status="Rotated ${chosen.size} PDFs locally";exportZip.launch("a-book-rotated-pdfs.zip")},{error=it.message?:"PDF batch rotation failed";status="Not saved"})
        }
    }
    fun splitActivePdf(){
        val record=activePdf
        if(record==null){error="Choose a PDF first";return}
        scope.launch{
            status="Splitting PDF locally…";error=""
            val result=withContext(Dispatchers.IO){runCatching{
                PDFBoxResourceLoader.init(context)
                val source=File(context.filesDir,record.relativePath)
                PDDocument.load(source).use{input->
                    val groups=parseABookPageGroups(splitPageGroups,input.numberOfPages)
                    val zip=File(context.cacheDir,"a-book-split-${UUID.randomUUID()}.zip")
                    ZipOutputStream(FileOutputStream(zip)).use{archive->
                        val base=safeABookPdfName(record.name)
                        groups.forEachIndexed{index,pages->
                            val part=PDDocument()
                            try{
                                pages.forEach{number->part.importPage(input.getPage(number-1))}
                                val temp=File(context.cacheDir,"a-book-part-${UUID.randomUUID()}.pdf")
                                part.save(temp)
                                archive.putNextEntry(ZipEntry("$base-part-${(index+1).toString().padStart(2,'0')}.pdf"))
                                temp.inputStream().use{it.copyTo(archive)}
                                archive.closeEntry();temp.delete()
                            }finally{part.close()}
                        }
                    }
                    zip
                }
            }}
            result.fold({pendingZip=it;status="Created local PDF parts";exportZip.launch("${safeABookPdfName(record.name)}-parts.zip")},{error=it.message?:"PDF split failed";status="Not saved"})
        }
    }

    val importPicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()){uris->
        val id=selected?:return@rememberLauncherForActivityResult
        scope.launch{
            status="Saving files on this device…";error=""
            val result=withContext(Dispatchers.IO){runCatching{
                val folder=File(context.filesDir,"a-book/attachments/$id").apply{mkdirs()}
                val copiedFiles=mutableListOf<File>()
                val records=mutableListOf<ABookFileRecord>()
                var totalBytes=0L
                var committed=false
                try{
                    uris.forEach{uri->
                        val name=context.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{c->if(c.moveToFirst())c.getString(0)else null}?.takeIf{it.isNotBlank()}?: "attachment"
                        val ext=name.substringAfterLast('.',"").filter{it.isLetterOrDigit()}.take(10)
                        val fileId=UUID.randomUUID().toString()
                        val destination=File(folder,fileId+(if(ext.isNotEmpty())".$ext" else ""))
                        copiedFiles.add(destination)
                        var fileBytes=0L
                        context.contentResolver.openInputStream(uri)?.use{input->
                            FileOutputStream(destination).use{output->
                                val buffer=ByteArray(8192)
                                while(true){
                                    val count=input.read(buffer)
                                    if(count<0)break
                                    fileBytes+=count.toLong();totalBytes+=count.toLong()
                                    require(fileBytes<=100L*1024*1024){"Each attachment must be 100 MB or smaller so it can be included in a local A book backup."}
                                    require(totalBytes<=150L*1024*1024){"Choose a smaller attachment batch (150 MB maximum per import)."}
                                    output.write(buffer,0,count)
                                }
                            }
                        }?:throw IllegalStateException("Could not read $name")
                        require(fileBytes>0){"$name is empty."}
                        val path="a-book/attachments/"+id+"/"+destination.name
                        records.add(ABookFileRecord(fileId,id,name.take(200),(context.contentResolver.getType(uri)?:"application/octet-stream").take(200),path,fileBytes,System.currentTimeMillis()))
                    }
                    db.addFiles(records)
                    committed=true
                    db.attachments(id)
                }catch(error:Throwable){
                    if(!committed)copiedFiles.forEach{it.delete()}
                    throw error
                }
            }}
            result.fold({files=it;status="Files saved on this device"},{error=it.message?:"Import failed";status="Not saved"})
        }
    }
    fun startLocalBackup(){
        scope.launch{
            status="Preparing local backup…";error=""
            val result=withContext(Dispatchers.IO){runCatching{createABookBackup(context,db)}}
            result.fold({pendingZip=it;status="Local backup ready";exportZip.launch("a-book-backup.zip")},{error=it.message?: "Backup export failed";status="Not saved"})
        }
    }
    val importArchivePicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->
        if(uri!=null){
            scope.launch{
                status="Restoring local backup…";error=""
                val result=withContext(Dispatchers.IO){runCatching{
                    val temp=File(context.cacheDir,"a-book-import-"+UUID.randomUUID()+".zip")
                    context.contentResolver.openInputStream(uri)?.use{input->temp.outputStream().use{output->input.copyTo(output)}}?:throw IllegalStateException("Cannot read the selected backup")
                    try{importABookBackup(context,db,temp)}finally{temp.delete()}
                }}
                result.fold({count->showTrash=false;archived=false;reload();status="Restored "+count+" notes and attachments on this device"},{error=it.message?: "Backup restore failed";status="Not restored"})
            }
        }
    }
    val exportMarkdown=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/markdown")){uri->
        if(uri!=null)runCatching{
            val text="# ${title.ifBlank{"Untitled note"}}\n\n$body\n\nNotebook: $notebook\nTags: $tags\n"
            context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use{it.write(text)}?:throw IllegalStateException("Cannot write export")
        }.onFailure{error=it.message?:"Markdown export failed"}
    }
    val exportZip=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/zip")){uri->
        val source=pendingZip
        if(uri!=null&&source!=null)runCatching{
            context.contentResolver.openOutputStream(uri)?.use{out->source.inputStream().use{it.copyTo(out)}}?:throw IllegalStateException("Cannot write ZIP export")
        }.onFailure{error=it.message?:"ZIP export failed"}
        source?.delete();pendingZip=null
    }
    val exportPdf=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")){uri->
        val source=pendingPdf
        if(uri!=null&&source!=null)runCatching{
            context.contentResolver.openOutputStream(uri)?.use{out->source.inputStream().use{it.copyTo(out)}}?:throw IllegalStateException("Cannot write PDF")
        }.onFailure{error=it.message?:"PDF export failed"}
        source?.delete();pendingPdf=null
    }
    LaunchedEffect(selected,title,body,notebook,tags,archived,showTrash){
        val id=selected?:return@LaunchedEffect
        delay(500);status="Saving on this device…"
        val result=withContext(Dispatchers.IO){runCatching{
            val old=db.notes(true,true).firstOrNull{it.id==id}
            val tagData=JSONArray(tags.split(",").map{it.trim()}.filter{it.isNotEmpty()}.take(50)).toString()
            db.save(ABookNoteRecord(id,title,body,notebook.ifBlank{"Inbox"},tagData,old?.pinned?:false,old?.archived?:false,old?.deletedAt,old?.createdAt?:System.currentTimeMillis(),System.currentTimeMillis(),old?.revision?:0))
        }}
        result.fold({status="Saved on this device";notes=db.notes(archived,showTrash)},{error=it.message?:"Local save failed";status="Not saved"})
    }
    LaunchedEffect(selected){selectedPdfIds=emptySet();files=selected?.let{withContext(Dispatchers.IO){db.attachments(it)}}?:emptyList();activePdf=null;pdfText=""}
    val filtered=notes.filter{n->val q=search.trim().lowercase(Locale.ROOT);q.isEmpty()||(n.title+" "+n.body+" "+n.tags+" "+n.notebook).lowercase(Locale.ROOT).contains(q)}
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(10.dp)){
        Text("A book",style=MaterialTheme.typography.headlineSmall)
        Text("Private notes and PDFs stored on this device.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        Text(status,style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        if(error.isNotBlank())Text(error,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
            Button(onClick={showTrash=false;archived=false;selectedPdfIds=emptySet();val id=UUID.randomUUID().toString();val now=System.currentTimeMillis();db.save(ABookNoteRecord(id,"","","Inbox","[]",false,false,null,now,now,0));reload(id,false)}){Text("New note")}
            OutlinedButton(onClick={exportMarkdown.launch("${title.ifBlank{"note"}}.md")},enabled=selected!=null){Text("Export .md")}
            OutlinedButton(onClick={startLocalBackup}){Text("Export backup")}
            OutlinedButton(onClick={importArchivePicker.launch(arrayOf("*/*"))}){Text("Import backup")}
            OutlinedButton(onClick={showTrash=!showTrash;archived=false;notes=db.notes(false,showTrash);selected=null;title="";body="";files=emptyList();revisions=emptyList()}){Text(if(showTrash)"All notes" else "Trash")}
            if(!showTrash)OutlinedButton(onClick={archived=!archived;notes=db.notes(archived,false)}){Text(if(archived)"Hide archived" else "Archived")}
        }
        OutlinedTextField(search,{search=it},label={Text("Search notes")},modifier=Modifier.fillMaxWidth(),singleLine=true)
        filtered.forEach{n->
            Card(Modifier.fillMaxWidth().clickable{selected=n.id;title=n.title;body=n.body;notebook=n.notebook;tags=runCatching{JSONArray(n.tags).let{a->(0 until a.length()).joinToString(", "){a.getString(it)}}}.getOrDefault("")}){
                Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(4.dp)){
                    Text((if(n.pinned)"★ " else "")+n.title.ifBlank{"Untitled note"},style=MaterialTheme.typography.titleSmall)
                    Text(n.body.take(100).ifBlank{"No content yet"},style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if(selected!=null){
            OutlinedTextField(title,{title=it},label={Text("Title")},modifier=Modifier.fillMaxWidth(),singleLine=true,enabled=notes.firstOrNull{it.id==selected}?.deletedAt==null)
            OutlinedTextField(notebook,{notebook=it},label={Text("Notebook")},modifier=Modifier.fillMaxWidth(),singleLine=true,enabled=notes.firstOrNull{it.id==selected}?.deletedAt==null)
            OutlinedTextField(tags,{tags=it},label={Text("Tags · comma separated")},modifier=Modifier.fillMaxWidth(),singleLine=true,enabled=notes.firstOrNull{it.id==selected}?.deletedAt==null)
            OutlinedTextField(body,{body=it},label={Text("Write a note")},modifier=Modifier.fillMaxWidth().heightIn(min=180.dp),minLines=7,enabled=notes.firstOrNull{it.id==selected}?.deletedAt==null)
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                val selectedNote=notes.firstOrNull{it.id==selected}
                if(selectedNote?.deletedAt!=null){
                    OutlinedButton(onClick={db.restore(selectedNote.id);showTrash=false;reload(selectedNote.id,false)}){Text("Restore")}
                    OutlinedButton(onClick={confirmPermanentDelete=true}){Text("Delete permanently")}
                }else{
                    OutlinedButton(onClick={val n=selectedNote?:return@OutlinedButton;db.save(n.copy(pinned=!n.pinned,title=title,body=body,notebook=notebook));reload(selected)}){Text(if(selectedNote?.pinned==true)"Unpin" else "Pin")}
                    OutlinedButton(onClick={val n=selectedNote?:return@OutlinedButton;db.save(n.copy(archived=!n.archived,title=title,body=body));reload()}){Text(if(selectedNote?.archived==true)"Unarchive" else "Archive")}
                    OutlinedButton(onClick={val n=selectedNote?:return@OutlinedButton;db.save(n.copy(deletedAt=System.currentTimeMillis(),title=title,body=body));reload()}){Text("Trash")}
                }
            }
            if(revisions.isNotEmpty()){
                Text("REVISION HISTORY",style=MaterialTheme.typography.labelMedium)
                revisions.forEach{revision->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text("Revision ${revision.revision}",style=MaterialTheme.typography.bodySmall);OutlinedButton(onClick={val restored=db.restoreRevision(revision.noteId,revision.id);if(restored!=null)reload(restored.id)}){Text("Restore version")}}}
            }
            Button(onClick={importPicker.launch(arrayOf("*/*"))}){Text("Attach files locally")}
            Text("FILES ON THIS DEVICE",style=MaterialTheme.typography.labelMedium)
            files.forEach{f->
                val isPdf=f.mime=="application/pdf"||f.name.endsWith(".pdf",true)
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=androidx.compose.ui.Alignment.CenterVertically){
                    if(isPdf)Checkbox(checked=f.id in selectedPdfIds,onCheckedChange={checked->selectedPdfIds=if(checked)selectedPdfIds+f.id else selectedPdfIds-f.id})
                    Text("${f.name} · ${f.size/1024} KB",modifier=Modifier.weight(1f),style=MaterialTheme.typography.bodySmall)
                    if(isPdf)OutlinedButton(onClick={activePdf=f;pdfText=""}){Text("PDF tools")}
                }
            }
            val selectedCount=selectedPdfFiles().size
            OutlinedTextField(splitPageGroups,{splitPageGroups=it},label={Text("PDF split groups · e.g. 1-3;4-6")},modifier=Modifier.fillMaxWidth(),singleLine=true)
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                OutlinedButton(onClick={mergeSelectedPdfs()},enabled=selectedCount>=2){Text("Merge selected")}
                OutlinedButton(onClick={rotateSelectedPdfs()},enabled=selectedCount>=1){Text("Rotate batch")}
                OutlinedButton(onClick={splitActivePdf()},enabled=activePdf!=null){Text("Split PDF")}
            }
            activePdf?.let{f->
                val local=File(context.filesDir,f.relativePath)
                Text(f.name,style=MaterialTheme.typography.titleSmall)
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    OutlinedButton(onClick={scope.launch{
                        val result=withContext(Dispatchers.IO){runCatching{PDFBoxResourceLoader.init(context);PDDocument.load(local).use{doc->"Pages: ${doc.numberOfPages}\n\n"+PDFTextStripper().getText(doc).take(150000)}}}
                        result.fold({pdfText=it;error=""},{error=it.message?:"Local PDF extraction failed"})
                    }}){Text("Extract text")}
                    OutlinedButton(onClick={scope.launch{
                        val result=withContext(Dispatchers.IO){runCatching{
                            PDFBoxResourceLoader.init(context)
                            val output=File(context.cacheDir,"a-book-rotated-${UUID.randomUUID()}.pdf")
                            PDDocument.load(local).use{doc->doc.pages.forEach{page->page.rotation=(page.rotation+90)%360};doc.save(output)}
                            output
                        }}
                        result.fold({pendingPdf=it;exportPdf.launch("${f.name.substringBeforeLast(".")}-rotated.pdf")},{error=it.message?:"PDF rotation failed"})
                    }}){Text("Rotate 90°")}
                    OutlinedButton(onClick={scope.launch{
                        status="Recognizing scanned PDF locally…";error=""
                        val result=runCatching{recognizeABookPdfOffline(local)}
                        result.fold({text->
                            pdfText=text
                            status=if(text.isBlank())"No readable text found on this PDF" else "OCR completed on this device"
                        },{failure->
                            error=failure.message?:"Local OCR failed"
                            status="OCR not completed"
                        })
                    }}){Text("OCR locally")}
                }
                if(pdfText.isNotBlank()){
                    Text("Text extracted locally",style=MaterialTheme.typography.labelMedium)
                    Text(pdfText,style=MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick={body=listOf(body,pdfText).filter{it.isNotBlank()}.joinToString("\n\n")}){Text("Insert into note")}
                }
            }
            if(pendingPdf!=null)Button(onClick={exportPdf.launch("a-book-edited.pdf")}){Text("Save edited PDF")}
        }else Text("Create a note to start your local library.",style=MaterialTheme.typography.bodySmall)
        Text("PDF text extraction and rotation run locally. Files are not uploaded.",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
    }
    if(confirmPermanentDelete){
        AlertDialog(
            onDismissRequest={confirmPermanentDelete=false},
            title={Text("Delete permanently?")},
            text={Text("This removes the note, its revision history and its attached files from this device. This cannot be undone.")},
            confirmButton={TextButton(onClick={
                confirmPermanentDelete=false
                selected?.let{id->
                    val paths=db.permanentlyDelete(id)
                    paths.forEach{path->
                        val root=context.filesDir.canonicalFile
                        val target=File(context.filesDir,path).canonicalFile
                        if(target.path.startsWith(root.path+File.separator))target.delete()
                    }
                    selected=null;title="";body="";files=emptyList();revisions=emptyList();notes=db.notes(false,true)
                }
            }){Text("Delete permanently",color=MaterialTheme.colorScheme.error)}},
            dismissButton={TextButton(onClick={confirmPermanentDelete=false}){Text("Cancel")}}
        )
    }
}
