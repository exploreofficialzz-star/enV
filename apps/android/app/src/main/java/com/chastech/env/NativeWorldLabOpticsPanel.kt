package com.chastech.env

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.chastech.env.engine.NativeWorldLabOpticsEvidenceStore
import androidx.compose.ui.unit.dp
import com.chastech.env.engine.NativeWorldLabProject
import com.chastech.env.engine.NativeWorldLabOptics
import com.chastech.env.engine.NativeLabOpticsResult

/** Native offline invented-material optics, no WebView or cloud transport. */
@Composable
fun NativeWorldLabOpticsPanel(project:NativeWorldLabProject,onMessage:(String)->Unit){
    val materials=project.materials
    if(materials.size<2)return
    var firstId by remember { mutableStateOf("") }
    var secondId by remember { mutableStateOf("") }
    var angle by remember { mutableStateOf("30") }
    var result by remember { mutableStateOf<NativeLabOpticsResult?>(null) }
    val context=LocalContext.current
    val store=remember(context){NativeWorldLabOpticsEvidenceStore(context.filesDir)}
    var records by remember(project.id,project.revision){
        mutableStateOf(runCatching{store.list(project.id)}.getOrDefault(emptyList()))
    }
    var chosenEvidence by remember { mutableStateOf("") }
    val export=rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")){uri->
        if(uri!=null&&chosenEvidence.isNotEmpty()){
            runCatching{
                val text=store.read(project.id,chosenEvidence)
                context.contentResolver.openOutputStream(uri,"wt")?.use{
                    it.write(text.toByteArray(Charsets.UTF_8));it.flush()
                }?:error("Cannot open the optical evidence destination.")
            }.onSuccess{onMessage("Exported portable optical evidence.")}
                .onFailure{onMessage(it.message?:"Optical export failed.")}
        }
    }
    val first=materials.firstOrNull{it.id==firstId}?:materials[0]
    val second=materials.firstOrNull{it.id==secondId&&it.id!=first.id}
        ?:materials.first{it.id!=first.id}
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
        Text("Invented light and optical materials",style=MaterialTheme.typography.titleSmall)
        Text("Assumed refractive indices, planar Fresnel/Snell boundary only. "+
            "No measured material identity, absorption or spectral behavior.",
            style=MaterialTheme.typography.bodySmall)
        OutlinedButton(onClick={
            val next=(materials.indexOf(first)+1)%materials.size
            firstId=materials[next].id;secondId="";result=null
        }){Text("From "+first.name+" (n="+(first.refractiveIndex?:"unknown")+") · change")}
        OutlinedButton(onClick={
            val options=materials.filter{it.id!=first.id}
            val next=(options.indexOf(second)+1)%options.size
            secondId=options[next].id;result=null
        }){Text("Into "+second.name+" (n="+(second.refractiveIndex?:"unknown")+") · change")}
        OutlinedTextField(value=angle,onValueChange={angle=it;result=null},
            label={Text("Incident angle, degrees")},singleLine=true,
            modifier=Modifier.fillMaxWidth())
        OutlinedButton(onClick={
            runCatching {
                NativeWorldLabOptics.calculate(project,first.id,second.id,angle.toDouble())
            }.onSuccess{result=it;onMessage("Calculated optical interface on device.")}
                .onFailure{result=null;onMessage(it.message?:"Unsupported optics input.")}
        }){Text("Calculate light behavior locally")}
        result?.takeIf{it.projectId==project.id&&
            it.projectRevision==project.revision&&
            it.firstMaterialId==first.id&&it.secondMaterialId==second.id}?.let{run->
            Text("Reflected: "+String.format("%.3f",run.reflectance*100)+"% · "+
                "Transmitted: "+String.format("%.3f",run.transmittance*100)+"%")
            Text(if(run.totalInternalReflection)"Total internal reflection" else
                "Refracted angle: "+String.format("%.3f",run.transmittedDegrees)+"°")
            OutlinedButton(onClick={
                runCatching{store.save(run)}.onSuccess{
                    records=store.list(project.id)
                    onMessage("Saved portable optical evidence locally.")
                }.onFailure{onMessage(it.message?:"Optical record could not be saved.")}
            }){Text("Keep optical evidence on device")}
            Text(run.validity,style=MaterialTheme.typography.bodySmall)
        }
        if(records.isNotEmpty()){
            Text("Saved optical experiments: "+records.size,
                style=MaterialTheme.typography.bodySmall)
            OutlinedButton(onClick={
                chosenEvidence=records.first()
                export.launch("world-lab-optical-evidence-"+chosenEvidence+".json")
            }){Text("Export latest optical evidence")}
        }
    }
}
