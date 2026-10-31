package com.chastech.env

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.chastech.env.engine.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** Real two-material heat exchange on Android, with offline numerical playback. */
@Composable
fun NativeWorldLabHeatPanel(project:NativeWorldLabProject,onError:(String)->Unit){
    val boxes=project.entities.filter{it.shape=="box"}
    var first by remember(project){mutableIntStateOf(0)}
    var second by remember(project){mutableIntStateOf(1)}
    var temperatureA by remember(project){mutableStateOf("400")}
    var temperatureB by remember(project){mutableStateOf("300")}
    var duration by remember(project){mutableStateOf("100")}
    var run by remember(project){mutableStateOf<NativeMaterialHeatRun?>(null)}
    var time by remember(project){mutableFloatStateOf(0f)}
    var playing by remember(project){mutableStateOf(false)}
    var speed by remember(project){mutableFloatStateOf(1f)}
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val export=rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")){uri->
        if(uri!=null&&run!=null)scope.launch {
            runCatching{withContext(Dispatchers.IO){
                val actual=run?:error("No calculated thermal evidence")
                val bytes=JSONObject()
                    .put("format","env-world-lab-material-heat-transfer")
                    .put("modelVersion","1.0.0")
                    .put("evidence","physics-model-computed")
                    .put("materialEvidence","hypothetical-user-assumed")
                    .put("projectId",actual.projectId)
                    .put("projectRevision",actual.projectRevision)
                    .put("firstEntityId",actual.firstEntityId)
                    .put("secondEntityId",actual.secondEntityId)
                    .put("firstMaterialId",actual.firstMaterialId)
                    .put("secondMaterialId",actual.secondMaterialId)
                    .put("firstThermalCapacityJPerK",actual.firstCapacityJPerK)
                    .put("secondThermalCapacityJPerK",actual.secondCapacityJPerK)
                    .put("conductanceWPerK",actual.conductanceWPerK)
                    .put("equilibriumTemperatureK",actual.equilibriumTemperatureK)
                    .put("durationSeconds",actual.durationSeconds)
                    .put("validity",actual.validity)
                    .put("samples",JSONArray().apply{actual.samples.forEach{sample->
                        put(JSONObject()
                            .put("timeSeconds",sample.timeSeconds)
                            .put("firstTemperatureK",sample.firstTemperatureK)
                            .put("secondTemperatureK",sample.secondTemperatureK)
                            .put("interfaceHeatFlowW",sample.interfaceHeatFlowW)
                            .put("energyResidualJ",sample.energyResidualJ))
                    }}).toString(2).toByteArray(Charsets.UTF_8)
                require(bytes.size<=1048576){"Thermal evidence exceeds 1 MB"}
                context.contentResolver.openOutputStream(uri,"wt")?.use{
                    it.write(bytes);it.flush()
                }?:error("Could not open evidence destination")
            }}.onFailure{onError(it.message?:"Thermal export unavailable")}
        }
    }
    LaunchedEffect(playing,speed,run){
        while(playing){
            delay(40)
            val r=run?:break
            time=(time+0.04f*speed).coerceAtMost(r.durationSeconds.toFloat())
            if(time>=r.durationSeconds.toFloat())playing=false
        }
    }
    Text("Exchange heat between invented materials",
        style=MaterialTheme.typography.titleSmall)
    Text("Two touching box solids exchange energy using their invented density, "+
        "specific heat and conductivity. No measurements, radiation or phase change.",
        style=MaterialTheme.typography.bodySmall)
    if(boxes.size<2){
        Text("Place at least two box solids and assign each a thermal material.")
        return
    }
    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
        OutlinedButton(onClick={
            first=(first+1)%boxes.size
            playing=false;run=null
        },modifier=Modifier.weight(1f)){
            Text("First: "+boxes[first%boxes.size].name)
        }
        OutlinedButton(onClick={
            second=(second+1)%boxes.size
            playing=false;run=null
        },modifier=Modifier.weight(1f)){
            Text("Second: "+boxes[second%boxes.size].name)
        }
    }
    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
        OutlinedTextField(value=temperatureA,onValueChange={temperatureA=it;run=null},
            label={Text("First K")},singleLine=true,modifier=Modifier.weight(1f))
        OutlinedTextField(value=temperatureB,onValueChange={temperatureB=it;run=null},
            label={Text("Second K")},singleLine=true,modifier=Modifier.weight(1f))
        OutlinedTextField(value=duration,onValueChange={duration=it;run=null},
            label={Text("Seconds")},singleLine=true,modifier=Modifier.weight(1f))
    }
    OutlinedButton(onClick={
        runCatching{
            val calculation=NativeWorldLabHeatTransfer.evaluate(project,
                boxes[first%boxes.size].id,boxes[second%boxes.size].id,
                temperatureA.toDouble(),temperatureB.toDouble(),duration.toDouble())
            run=calculation;time=0f;playing=false;onError("")
        }.onFailure{
            playing=false;run=null;onError(it.message?:"Thermal assumptions unsupported")
        }
    },enabled=first%boxes.size!=second%boxes.size){Text("Calculate local heat exchange")}
    run?.let{active->
        val sample=active.sample(time.toDouble())
        Text("First: "+String.format("%.4f",sample.firstTemperatureK)+" K; "+
            "Second: "+String.format("%.4f",sample.secondTemperatureK)+" K")
        Text("Interface energy flow: "+String.format("%.5g",sample.interfaceHeatFlowW)+" W")
        Text("Energy residual: "+String.format("%.5g",sample.energyResidualJ)+" J")
        Canvas(Modifier.fillMaxWidth().height(110.dp)
            .background(Color(0xFF16232B),RoundedCornerShape(12.dp))
            .semantics{contentDescription="Calculated temperatures of two invented solids"}){
            val vals=listOf(sample.firstTemperatureK,sample.secondTemperatureK)
            for(i in vals.indices){
                val fraction=((vals[i]-200)/1800).coerceIn(0.0,1.0).toFloat()
                val color=Color(0.2f+0.75f*fraction,0.4f+0.35f*fraction,
                    0.85f-0.65f*fraction)
                drawRect(color,topLeft=Offset(size.width*(0.08f+0.44f*i),
                    size.height*0.15f),size=Size(size.width*0.4f,size.height*0.7f))
            }
        }
        Slider(value=time,onValueChange={time=it;playing=false},
            valueRange=0f..active.durationSeconds.toFloat(),
            modifier=Modifier.semantics{contentDescription="Thermal transfer simulated time"})
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedButton(onClick={playing=!playing}) {
                Text(if(playing)"Pause heat":"Play heat")
            }
            OutlinedButton(onClick={playing=false;time=0f}){Text("Reset")}
            OutlinedButton(onClick={export.launch("world-lab-material-heat.json")}){
                Text("Export evidence")
            }
        }
        Slider(value=speed,onValueChange={speed=it},valueRange=0.1f..10f,
            modifier=Modifier.semantics{contentDescription="Heat playback speed"})
        Text(active.validity,style=MaterialTheme.typography.bodySmall)
    }
}
