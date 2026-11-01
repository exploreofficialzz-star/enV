package com.chastech.env

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
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
import java.util.Locale

@Composable
fun NativeWorldLabRadiationPanel(project:NativeWorldLabProject,onError:(String)->Unit){
    var index by remember(project.id,project.revision){mutableIntStateOf(0)}
    var start by remember(project.id,project.revision){mutableStateOf("400")}
    var environment by remember(project.id,project.revision){mutableStateOf("300")}
    var emissivity by remember(project.id,project.revision){mutableStateOf("0.8")}
    var duration by remember(project.id,project.revision){mutableStateOf("1000")}
    var run by remember(project.id,project.revision){mutableStateOf<NativeRadiationRun?>(null)}
    var fraction by remember(project.id,project.revision){mutableFloatStateOf(0f)}
    var playing by remember(project.id,project.revision){mutableStateOf(false)}
    var speed by remember(project.id,project.revision){mutableFloatStateOf(1f)}
    val context=androidx.compose.ui.platform.LocalContext.current
    val scope=rememberCoroutineScope()
    val science=remember(context){NativeWorldLabEvidenceStore(context.filesDir)}
    var saveStatus by remember(project.id,project.revision){mutableStateOf("")}
    val export=rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")){uri->
        if(uri!=null&&run!=null)scope.launch{
            runCatching{withContext(Dispatchers.IO){
                val active=run?:error("No radiation calculation")
                val evidence=NativeWorldLabExtendedEvidence.radiation(active)
                val bytes=evidence.toString(2).toByteArray(Charsets.UTF_8)
                require(bytes.size<=1048576){"Radiation evidence exceeds 1 MB"}
                context.contentResolver.openOutputStream(uri,"wt")?.use{
                    it.write(bytes);it.flush()
                }?:error("Radiation export destination is unavailable")
            }}.onFailure{onError(it.message?:"Radiation export unavailable")}
        }
    }
    LaunchedEffect(playing,speed,run){
        while(playing){
            delay(40)
            if(run==null)break
            fraction=(fraction+0.04f*speed/8f).coerceAtMost(1f)
            if(fraction>=1f)playing=false
        }
    }
    Text("Radiate heat from invented matter",style=MaterialTheme.typography.titleSmall)
    Text("Ideal Stefan-Boltzmann net heating/cooling. All emissivity, "+
        "density, heat capacity and environmental conditions are assumptions.",
        style=MaterialTheme.typography.bodySmall)
    if(project.entities.isEmpty()){
        Text("Create a solid and assign invented density and heat capacity.")
        return
    }
    val target=project.entities[index%project.entities.size]
    OutlinedButton(onClick={
        index=(index+1)%project.entities.size;run=null;playing=false
    }){Text("Radiating solid: "+target.name)}
    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
        OutlinedTextField(value=start,onValueChange={start=it;run=null;playing=false},
            label={Text("Initial K")},modifier=Modifier.weight(1f),singleLine=true)
        OutlinedTextField(value=environment,
            onValueChange={environment=it;run=null;playing=false},
            label={Text("Surroundings K")},modifier=Modifier.weight(1f),singleLine=true)
    }
    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
        OutlinedTextField(value=emissivity,
            onValueChange={emissivity=it;run=null;playing=false},
            label={Text("Emissivity 0–1")},modifier=Modifier.weight(1f),singleLine=true)
        OutlinedTextField(value=duration,
            onValueChange={duration=it;run=null;playing=false},
            label={Text("Duration s")},modifier=Modifier.weight(1f),singleLine=true)
    }
    OutlinedButton(onClick={
        runCatching{
            run=NativeWorldLabRadiation.evaluate(project,target.id,
                start.toDouble(),environment.toDouble(),emissivity.toDouble(),
                duration.toDouble())
            fraction=0f;playing=false;onError("")
        }.onFailure{run=null;playing=false;onError(it.message?:"Radiation input unsupported")}
    }){Text("Calculate radiation locally")}
    run?.takeIf{it.projectId==project.id&&it.projectRevision==project.revision&&
        it.entityId==target.id}?.let{active->
        val observed=active.sample(active.durationSeconds*fraction)
        Text("Temperature "+String.format(Locale.US,"%.6g",observed.temperatureK)+
            " K · net radiation "+String.format(Locale.US,"%.6g",observed.netRadiatedPowerW)+" W")
        Canvas(Modifier.fillMaxWidth().height(100.dp)
            .semantics{contentDescription="Calculated radiative temperature trajectory"}){
            val samples=active.samples
            val low=minOf(active.initialTemperatureK,active.environmentTemperatureK)
            val high=maxOf(active.initialTemperatureK,active.environmentTemperatureK)
            val range=maxOf(1.0,high-low)
            for(i in 0 until samples.lastIndex){
                val a=samples[i];val b=samples[i+1]
                val x1=(a.timeSeconds/active.durationSeconds*size.width).toFloat()
                val x2=(b.timeSeconds/active.durationSeconds*size.width).toFloat()
                val y1=(size.height*(0.9f-0.8f*((a.temperatureK-low)/range).toFloat()))
                val y2=(size.height*(0.9f-0.8f*((b.temperatureK-low)/range).toFloat()))
                drawLine(Color(0xFF328A9B),Offset(x1,y1),Offset(x2,y2),strokeWidth=3.dp.toPx())
            }
        }
        Slider(value=fraction,onValueChange={fraction=it;playing=false},
            valueRange=0f..1f,modifier=Modifier.semantics{
                contentDescription="Radiative experiment simulated time"
            })
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedButton(onClick={playing=!playing}){Text(if(playing)"Pause":"Play")}
            OutlinedButton(onClick={playing=false;fraction=0f}){Text("Reset")}
            OutlinedButton(onClick={speed=if(speed==1f)4f else if(speed==4f)0.1f else 1f}){
                Text("Speed "+speed+"×")
            }
        }
        Text("Transferred heat "+String.format(Locale.US,"%.6g",observed.transferredEnergyJ)+
            " J; energy residual "+String.format(Locale.US,"%.5g",observed.energyResidualJ)+" J")
        OutlinedButton(onClick={
            runCatching {
                science.save(project,NativeWorldLabExtendedEvidence.radiation(active))
            }.onSuccess{
                saveStatus="Radiative evidence preserved with this saved invention."
                onError("")
            }.onFailure{
                saveStatus=""
                onError(it.message?:"Save this invention before keeping radiative evidence")
            }
        }){Text("Keep heat with saved invention")}
        if(saveStatus.isNotBlank())Text(saveStatus,style=MaterialTheme.typography.bodySmall)
        OutlinedButton(onClick={export.launch("world-lab-radiative-heat.json")}){
            Text("Export radiative evidence")
        }
        Text(active.validity,style=MaterialTheme.typography.bodySmall)
    }
}
