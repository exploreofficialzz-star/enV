package com.chastech.env

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.chastech.env.data.ToolRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun NativeExpandedToolForm(tool:ToolRecord,backend:Boolean){
    val context=LocalContext.current; val scope=rememberCoroutineScope()
    var input by rememberSaveable(tool.id){mutableStateOf("")};var options by rememberSaveable(tool.id){mutableStateOf("{}")};var output by rememberSaveable(tool.id){mutableStateOf("")};var error by rememberSaveable(tool.id){mutableStateOf("")};var working by rememberSaveable(tool.id){mutableStateOf(false)}
    var files by remember{mutableStateOf<List<NativeBackendEngine.InputFile>>(emptyList())};var bytes by remember{mutableStateOf<ByteArray?>(null)};var mime by remember{mutableStateOf("application/octet-stream")};var filename by remember{mutableStateOf("env-output.bin")}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()){uris->files=uris.mapNotNull{readFile(context,it)}}
    val saver=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(mime)){uri->if(uri!=null&&bytes!=null)context.contentResolver.openOutputStream(uri)?.use{it.write(bytes)}}
    Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
        Text(if(backend)"Native Kotlin · enV backend API" else "Native Kotlin · offline engine",style=MaterialTheme.typography.labelLarge)
        if(backend || tool.engine.type in setOf("image","video","audio","pdf","file-converter","mockup","post") || tool.category.equals("screenshots",true)) OutlinedButton({picker.launch(arrayOf("*/*"))}){Text(if(files.isEmpty())"Choose file(s)" else "Selected ${files.size} file(s)")}
        OutlinedTextField(input,{input=it},label={Text(if(tool.id.contains("url"))"URL" else "Input")},modifier=Modifier.fillMaxWidth(),minLines=2)
        if(backend||tool.engine.type=="custom")OutlinedTextField(options,{options=it},label={Text("Options JSON")},modifier=Modifier.fillMaxWidth(),minLines=2)
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){Button(enabled=!working,onClick={working=true;scope.launch{runCatching{withContext(Dispatchers.IO){if(backend)NativeBackendEngine.execute(tool,input,options,files) else NativeExpandedEngine.run(tool,input,options)}}.fold({r->output=r.text?:"Output ready: ${r.fileName?:tool.id}";bytes=r.bytes;mime=r.mimeType?:"application/octet-stream";filename=r.fileName?:"${tool.id}.bin";error=""},{error=it.message?:"Tool failed";output=""});working=false}}){Text(if(working)"Running…" else "Run")};OutlinedButton({input="";options="{}";output="";error="";bytes=null}){Text("Reset")}}
        if(bytes!=null)OutlinedButton({saver.launch(filename)}){Text("Save $filename")};if(output.isNotBlank()){Text(output);OutlinedButton({context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output",output))}){Text("Copy")}};if(error.isNotBlank())Text(error,color=MaterialTheme.colorScheme.error)
    }
}
private fun readFile(context:Context,uri:Uri):NativeBackendEngine.InputFile?{val name=context.contentResolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())it.getString(0) else "input"}?:"input";val mime=context.contentResolver.getType(uri)?:("application/octet-stream");val data=runCatching{context.contentResolver.openInputStream(uri)?.use{it.readBytes()}}.getOrNull()?:return null;return NativeBackendEngine.InputFile(name,mime,data)}
