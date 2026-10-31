package com.chastech.env

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
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
            Text(run.validity,style=MaterialTheme.typography.bodySmall)
        }
    }
}
