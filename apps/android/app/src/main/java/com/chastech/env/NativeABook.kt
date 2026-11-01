package com.chastech.env

import android.content.ContentValues
import android.content.Context
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
import java.io.File
import java.util.Locale
import java.util.UUID

private data class ABookNoteRecord(
    val id:String,val title:String,val body:String,val notebook:String,val tags:String,
    val pinned:Boolean,val archived:Boolean,val deletedAt:Long?,val createdAt:Long,val updatedAt:Long,val revision:Int
)
private data class ABookFileRecord(val id:String,val name:String,val mime:String,val relativePath:String,val size:Long)
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
        readableDatabase.query("notes",null,when { includeDeleted -> "deleted_at IS NOT NULL"; includeArchived -> "deleted_at IS NULL"; else -> "deleted_at IS NULL AND archived=0" },null,null,null,"pinned DESC,updated_at DESC")
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
            while(c.moveToNext())add(ABookFileRecord(c.getString(c.getColumnIndexOrThrow("id")),c.getString(c.getColumnIndexOrThrow("name")),c.getString(c.getColumnIndexOrThrow("mime")),c.getString(c.getColumnIndexOrThrow("path")),c.getLong(c.getColumnIndexOrThrow("size"))))
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
    fun addFile(noteId:String,name:String,mime:String,path:String,size:Long){
        writableDatabase.insertOrThrow("attachments",null,ContentValues().apply{
            put("id",UUID.randomUUID().toString());put("note_id",noteId);put("name",name);put("mime",mime);put("path",path);put("size",size);put("created_at",System.currentTimeMillis())
        })
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
    val importPicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()){uris->
        val id=selected?:return@rememberLauncherForActivityResult
        scope.launch{
            status="Saving files on this device…";error=""
            val result=withContext(Dispatchers.IO){runCatching{
                val folder=File(context.filesDir,"a-book/attachments/$id").apply{mkdirs()}
                uris.forEach{uri->
                    val name=context.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{c->if(c.moveToFirst())c.getString(0)else null}?: "attachment"
                    val ext=name.substringAfterLast('.',"").filter{it.isLetterOrDigit()}.take(10)
                    val destination=File(folder,UUID.randomUUID().toString()+if(ext.isNotEmpty())".$ext" else "")
                    context.contentResolver.openInputStream(uri)?.use{input->destination.outputStream().use{output->input.copyTo(output)}}?:throw IllegalStateException("Could not read $name")
                    val path="a-book/attachments/"+id+"/"+destination.name
                    db.addFile(id,name.take(200),context.contentResolver.getType(uri)?:"application/octet-stream",path,destination.length())
                }
                db.attachments(id)
            }}
            result.fold({files=it;status="Files saved on this device"},{error=it.message?:"Import failed";status="Not saved"})
        }
    }
    val exportMarkdown=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/markdown")){uri->
        if(uri!=null)runCatching{
            val text="# ${title.ifBlank{"Untitled note"}}\n\n$body\n\nNotebook: $notebook\nTags: $tags\n"
            context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use{it.write(text)}?:throw IllegalStateException("Cannot write export")
        }.onFailure{error=it.message?:"Markdown export failed"}
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
        result.fold({status="Saved on this device";notes=db.notes(archived)},{error=it.message?:"Local save failed";status="Not saved"})
    }
    LaunchedEffect(selected){files=selected?.let{withContext(Dispatchers.IO){db.attachments(it)}}?:emptyList();activePdf=null;pdfText=""}
    val filtered=notes.filter{n->val q=search.trim().lowercase(Locale.ROOT);q.isEmpty()||(n.title+" "+n.body+" "+n.tags+" "+n.notebook).lowercase(Locale.ROOT).contains(q)}
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(10.dp)){
        Text("A book",style=MaterialTheme.typography.headlineSmall)
        Text("Private notes and PDFs stored on this device.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        Text(status,style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
        if(error.isNotBlank())Text(error,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
            Button(onClick={val id=UUID.randomUUID().toString();val now=System.currentTimeMillis();db.save(ABookNoteRecord(id,"","","Inbox","[]",false,false,null,now,now,0));reload(id)}){Text("New note")}
            OutlinedButton(onClick={exportMarkdown.launch("${title.ifBlank{"note"}}.md")},enabled=selected!=null){Text("Export .md")}
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
            OutlinedTextField(title,{title=it},label={Text("Title")},modifier=Modifier.fillMaxWidth(),singleLine=true)
            OutlinedTextField(notebook,{notebook=it},label={Text("Notebook")},modifier=Modifier.fillMaxWidth(),singleLine=true)
            OutlinedTextField(tags,{tags=it},label={Text("Tags · comma separated")},modifier=Modifier.fillMaxWidth(),singleLine=true)
            OutlinedTextField(body,{body=it},label={Text("Write a note")},modifier=Modifier.fillMaxWidth().heightIn(min=180.dp),minLines=7)
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                val selectedNote=notes.firstOrNull{it.id==selected}
                if(selectedNote?.deletedAt!=null){
                    OutlinedButton(onClick={db.restore(selectedNote.id);showTrash=false;reload(selectedNote.id,false)}){Text("Restore")}
                    OutlinedButton(onClick={
                        val paths=db.permanentlyDelete(selectedNote.id)
                        paths.forEach{path->val root=context.filesDir.canonicalFile;val target=File(context.filesDir,path).canonicalFile;if(target.path.startsWith(root.path+File.separator))target.delete()}
                        selected=null;title="";body="";files=emptyList();revisions=emptyList();notes=db.notes(false,true)
                    }){Text("Delete permanently")}
                }else{
                    OutlinedButton(onClick={val n=selectedNote?:return@OutlinedButton;db.save(n.copy(pinned=!n.pinned,title=title,body=body,notebook=notebook));reload(selected)}){Text("Pin")}
                    OutlinedButton(onClick={val n=selectedNote?:return@OutlinedButton;db.save(n.copy(archived=true,title=title,body=body));reload()}){Text("Archive")}
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
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){
                    Text("${f.name} · ${f.size/1024} KB",modifier=Modifier.weight(1f),style=MaterialTheme.typography.bodySmall)
                    if(f.mime=="application/pdf"||f.name.endsWith(".pdf",true))OutlinedButton(onClick={activePdf=f;pdfText=""}){Text("PDF tools")}
                }
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
}
