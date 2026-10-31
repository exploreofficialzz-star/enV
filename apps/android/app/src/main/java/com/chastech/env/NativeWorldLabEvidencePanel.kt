package com.chastech.env

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.chastech.env.engine.NativeWorldLabEvidenceStore
import com.chastech.env.engine.NativeWorldLabProject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** Private scientific history, distinct from the invention's mutable geometry. */
@Composable
fun NativeWorldLabEvidencePanel(project:NativeWorldLabProject,onError:(String)->Unit){
    val context=LocalContext.current
    val store=remember(context){NativeWorldLabEvidenceStore(context.filesDir)}
    val scope=rememberCoroutineScope()
    var items by remember(project.id){mutableStateOf<List<JSONObject>>(emptyList())}
    var pendingExport by remember(project.id){mutableStateOf<String?>(null)}
    var pendingDelete by remember(project.id){mutableStateOf<String?>(null)}
    fun refresh(){
        scope.launch{
            runCatching{withContext(Dispatchers.IO){store.list(project.id)}}
                .onSuccess{items=it}
                .onFailure{onError(it.message?:"Stored science history cannot be opened")}
        }
    }
    LaunchedEffect(project.id){refresh()}
    val export=rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")){uri->
        val id=pendingExport
        if(uri!=null&&id!=null)scope.launch{
            runCatching{withContext(Dispatchers.IO){
                val bytes=store.read(project.id,id).toString(2).toByteArray(Charsets.UTF_8)
                require(bytes.size<=2*1024*1024){"Science archive exceeds 2 MB"}
                context.contentResolver.openOutputStream(uri,"wt")?.use{
                    it.write(bytes);it.flush()
                }?:error("Could not open evidence export destination")
            }}.onFailure{onError(it.message?:"Scientific export failed")}
            pendingExport=null
        }
    }
    Text("Recorded scientific evidence",style=MaterialTheme.typography.titleSmall)
    Text("Immutable hypothetical science records are private to this device. "+
        "Saving a project is required first. Nothing is uploaded automatically.",
        style=MaterialTheme.typography.bodySmall)
    OutlinedButton(onClick={refresh}){Text("Refresh device science history")}
    if(items.isEmpty())Text("No saved gravity or thermal records for this invention.",
        style=MaterialTheme.typography.bodySmall)
    items.forEach{record->
        val id=record.optString("id")
        Text(record.optString("kind")+" · project revision "+
            record.optInt("projectRevision"))
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedButton(onClick={
                pendingExport=id;export.launch("world-lab-"+id+".json")
            }){Text("Export")}
            OutlinedButton(onClick={pendingDelete=id}){Text("Discard")}
        }
    }
    if(pendingDelete!=null)AlertDialog(
        onDismissRequest={pendingDelete=null},
        title={Text("Discard saved scientific evidence?")},
        text={Text("The selected device copy is removed. Saved projects and exported files stay intact.")},
        confirmButton={TextButton(onClick={
            val id=pendingDelete
            pendingDelete=null
            if(id!=null)scope.launch{
                runCatching{withContext(Dispatchers.IO){store.delete(project.id,id)}}
                    .onSuccess{refresh()}
                    .onFailure{onError(it.message?:"Could not discard science record")}
            }
        }){Text("Discard record")}},
        dismissButton={TextButton(onClick={pendingDelete=null}){Text("Cancel")}}
    )
}
