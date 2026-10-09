package com.chastech.env

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import com.chastech.env.data.ToolRecord
import com.chastech.env.engine.NativeFileConverterEngine

@Composable
fun NativeFileConverterToolForm(tool: ToolRecord) {
    val context=LocalContext.current
    var file by remember { mutableStateOf<NativeBackendEngine.InputFile?>(null) }
    var output by remember { mutableStateOf<NativeFileConverterEngine.Result?>(null) }
    var error by rememberSaveable(tool.id) { mutableStateOf("") }
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if(uri!=null) file=readConverterFile(context,uri) }
    val saver=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri -> if(uri!=null&&output?.bytes!=null) context.contentResolver.openOutputStream(uri)?.use { it.write(output!!.bytes) } }
    val baseName=file?.name?.substringBeforeLast('.') ?: "output"
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Text("Native Kotlin · local file conversion",style=MaterialTheme.typography.labelLarge)
        Button(onClick={picker.launch(arrayOf("*/*"))}) { Text(if(file==null) "Choose file" else file!!.name) }
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            Button(enabled=file!=null,onClick={ runCatching { NativeFileConverterEngine.run(tool,file!!.name,file!!.bytes) }.fold({output=it;error=""},{output=null;error=it.message?:"Conversion failed."}) }) { Text("Convert") }
            OutlinedButton(onClick={file=null;output=null;error=""}) { Text("Reset") }
        }
        output?.text?.let { Text(it,modifier=Modifier.fillMaxWidth().heightIn(max=280.dp),style=MaterialTheme.typography.bodySmall) }
        output?.bytes?.let { OutlinedButton(onClick={saver.launch("$baseName.${output!!.extension}")}) { Text("Save ${output!!.extension.uppercase()}") } }
        if(error.isNotBlank()) Text(error,color=MaterialTheme.colorScheme.error)
    }
}
private fun readConverterFile(context:Context,uri:android.net.Uri):NativeBackendEngine.InputFile? {
    val name=context.contentResolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),null,null,null)?.use { if(it.moveToFirst()) it.getString(0) else "input" } ?: "input"
    val mime=context.contentResolver.getType(uri) ?: "application/octet-stream"
    val bytes=runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull() ?: return null
    return NativeBackendEngine.InputFile(name,mime,bytes)
}
