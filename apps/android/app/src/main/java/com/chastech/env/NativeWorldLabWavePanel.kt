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

/** Local, numeric, inventor-assumption-bound material wave experiment. */
@Composable
fun NativeWorldLabWavePanel(project:NativeWorldLabProject,onError:(String)->Unit){
    val rods=project.entities.filter{it.shape=="box"||it.shape=="cylinder"}
    var index by remember(project.id,project.revision){mutableIntStateOf(0)}
    var mode by remember(project.id,project.revision){mutableStateOf("1")}
    var amplitude by remember(project.id,project.revision){mutableStateOf("0.00001")}
    var cycles by remember(project.id,project.revision){mutableStateOf("4")}
    var run by remember(project.id,project.revision){mutableStateOf<NativeElasticWaveRun?>(null)}
    var fraction by remember(project.id,project.revision){mutableFloatStateOf(0f)}
    var playing by remember(project.id,project.revision){mutableStateOf(false)}
    var rate by remember(project.id,project.revision){mutableFloatStateOf(1f)}
    val context=androidx.compose.ui.platform.LocalContext.current
    val scope=rememberCoroutineScope()
    val science=remember(context){NativeWorldLabEvidenceStore(context.filesDir)}
    var saveStatus by remember(project.id,project.revision){mutableStateOf("")}
    val export=rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")){uri->
        if(uri!=null&&run!=null)scope.launch{
            runCatching{withContext(Dispatchers.IO){
                val active=run?:error("No elastic-wave experiment")
                val fields=NativeWorldLabExtendedEvidence.wave(active)
                val bytes=fields.toString(2).toByteArray(Charsets.UTF_8)
                require(bytes.size<=1048576){"Wave evidence exceeds 1 MB"}
                context.contentResolver.openOutputStream(uri,"wt")?.use{
                    it.write(bytes);it.flush()
                }?:error("Wave document destination is unavailable")
            }}.onFailure{onError(it.message?:"Wave export failed")}
        }
    }
    LaunchedEffect(playing,rate,run){
        while(playing){
            delay(40)
            val active=run?:break
            fraction=(fraction+0.04f*rate/(active.cycles*0.75f)).coerceAtMost(1f)
            if(fraction>=1f)playing=false
        }
    }
    Text("Make waves inside invented matter",style=MaterialTheme.typography.titleSmall)
    LabNote("Exact 1D free-ended standing mode from invented density and stiffness. "+
        "Not a measurement, bending/fracture model or sound propagation in air.")
    if(rods.isEmpty()){
        Text("Invent a box or cylinder and assign density and Young's modulus.")
        return
    }
    val target=rods[index%rods.size]
    OutlinedButton(onClick={index=(index+1)%rods.size;run=null;playing=false}){
        Text("Rod: "+target.name)
    }
    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
        OutlinedTextField(value=mode,onValueChange={mode=it;run=null;playing=false},
            label={Text("Mode 1–12")},modifier=Modifier.weight(1f),singleLine=true)
        OutlinedTextField(value=cycles,onValueChange={cycles=it;run=null;playing=false},
            label={Text("Cycles 1–20")},modifier=Modifier.weight(1f),singleLine=true)
    }
    OutlinedTextField(value=amplitude,onValueChange={amplitude=it;run=null;playing=false},
        label={Text("Small displacement amplitude (m)")},singleLine=true)
    OutlinedButton(onClick={
        runCatching{
            val result=NativeWorldLabElasticWave.evaluate(project,target.id,
                mode.toInt(),amplitude.toDouble(),cycles.toInt())
            run=result;fraction=0f;playing=false;onError("")
        }.onFailure{run=null;playing=false;onError(it.message?:"Unsupported wave assumptions")}
    }){Text("Calculate wave locally")}
    run?.takeIf{it.projectId==project.id&&it.projectRevision==project.revision&&
        it.entityId==target.id}?.let{active->
        val sample=active.sample(active.durationSeconds*fraction.toDouble())
        Text("Wave speed "+String.format(Locale.US,"%.5g",active.waveSpeedMps)+
            " m/s · frequency "+String.format(Locale.US,"%.5g",active.frequencyHz)+" Hz")
        Text("Maximum axial stress "+String.format(Locale.US,"%.5g",active.maximumStressPa)+" Pa")
        Canvas(Modifier.fillMaxWidth().height(115.dp)
            .semantics{contentDescription="Calculated axial displacement profile inside invented bar"}){
            val vals=sample.displacementsMeters
            for(i in 0 until vals.lastIndex){
                val x1=size.width*i/vals.lastIndex
                val x2=size.width*(i+1)/vals.lastIndex
                val y1=size.height*(0.5f-0.35f*(vals[i]/active.amplitudeMeters).toFloat())
                val y2=size.height*(0.5f-0.35f*(vals[i+1]/active.amplitudeMeters).toFloat())
                drawLine(Color(0xFF328A9B),Offset(x1,y1),Offset(x2,y2),strokeWidth=3.dp.toPx())
            }
        }
        Slider(value=fraction,onValueChange={fraction=it;playing=false},
            valueRange=0f..1f,modifier=Modifier.semantics{
                contentDescription="Elastic wave simulated time"
            })
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedButton(onClick={playing=!playing}){Text(if(playing)"Pause wave" else "Play wave")}
            OutlinedButton(onClick={playing=false;fraction=0f}){Text("Reset")}
            OutlinedButton(onClick={rate=if(rate==1f)4f else if(rate==4f)0.1f else 1f}){
                Text("Speed "+rate+"×")
            }
        }
        Text("Kinetic: "+String.format(Locale.US,"%.5g",sample.kineticEnergyJ)+
            " J; strain: "+String.format(Locale.US,"%.5g",sample.strainEnergyJ)+" J")
        Text("Total conserved ideal energy: "+
            String.format(Locale.US,"%.5g",sample.totalEnergyJ)+" J")
        OutlinedButton(onClick={
            runCatching {
                science.save(project,NativeWorldLabExtendedEvidence.wave(active))
            }.onSuccess{
                saveStatus="Wave evidence preserved with this saved invention."
                onError("")
            }.onFailure{
                saveStatus=""
                onError(it.message?:"Save this invention before keeping wave evidence")
            }
        }){Text("Keep wave with saved invention")}
        if(saveStatus.isNotBlank())Text(saveStatus,style=MaterialTheme.typography.bodySmall)
        OutlinedButton(onClick={export.launch("world-lab-elastic-wave.json")}){
            Text("Export elastic-wave evidence")
        }
        LabNote(active.validity)
    }
}
