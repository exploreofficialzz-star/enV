package com.chastech.env

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
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

/** Device-side computed Newtonian trajectories. No unconsented network traffic. */
@Composable
fun NativeWorldLabGravityPanel(project:NativeWorldLabProject,onError:(String)->Unit){
    val spheres=project.entities.filter{it.shape=="sphere"}
    var selected by remember(project){mutableStateOf(spheres.take(2).map{it.id}.toSet())}
    var speeds by remember(project){mutableStateOf<Map<String,List<String>>>(emptyMap())}
    var duration by remember(project){mutableStateOf("30")}
    var steps by remember(project){mutableStateOf("480")}
    var run by remember(project){mutableStateOf<NativeGravityRun?>(null)}
    var time by remember(project){mutableFloatStateOf(0f)}
    var playing by remember(project){mutableStateOf(false)}
    var rate by remember(project){mutableFloatStateOf(1f)}
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    val savedScience=remember(context){NativeWorldLabEvidenceStore(context.filesDir)}
    val export=rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")){uri->
        if(uri!=null&&run!=null)scope.launch{
            runCatching{withContext(Dispatchers.IO){
                val evidence=run?:error("No computed gravitational evidence")
                val json=NativeWorldLabEvidenceJson.gravity(evidence).toString(2).toByteArray(Charsets.UTF_8)
                require(json.size<=1048576){"Gravity evidence is larger than 1 MB"}
                context.contentResolver.openOutputStream(uri,"wt")?.use{
                    it.write(json);it.flush()
                } ?: error("Cannot open gravity evidence destination")
            }}.onFailure{onError(it.message?:"Gravity evidence export failed")}
        }
    }
    LaunchedEffect(playing,run,rate){
        while(playing){
            delay(40)
            val active=run?:break
            time=(time+0.04f*rate).coerceAtMost(active.durationSeconds.toFloat())
            if(time>=active.durationSeconds.toFloat())playing=false
        }
    }
    Text("Explore invented gravity",style=MaterialTheme.typography.titleSmall)
    Text("The native device calculates Newtonian attraction between two to eight "+
        "spheres with user-assumed density. No cloud upload, measured planets or impacts.",
        style=MaterialTheme.typography.bodySmall)
    if(spheres.size<2){
        Text("Add at least two spherical solids and assign invented density.")
        return
    }
    Column(Modifier.fillMaxWidth().heightIn(max=270.dp).verticalScroll(rememberScrollState())){
        spheres.forEach{solid->
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                Checkbox(checked=solid.id in selected,onCheckedChange={yes->
                    selected=if(yes)selected+solid.id else selected-solid.id
                    playing=false;run=null
                })
                Text(solid.name+" · "+solid.id.take(8),
                    modifier=Modifier.weight(1f))
            }
            if(solid.id in selected){
                val fields=speeds[solid.id]?:listOf("0","0","0")
                Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    for(axis in 0..2)OutlinedTextField(value=fields[axis],
                        onValueChange={next->
                            val values=fields.toMutableList();values[axis]=next
                            speeds=speeds+(solid.id to values)
                            playing=false;run=null
                        },label={Text(listOf("X","Y","Z")[axis]+" m/s")},
                        singleLine=true,modifier=Modifier.weight(1f))
                }
            }
        }
    }
    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
        OutlinedTextField(value=duration,onValueChange={duration=it;run=null},
            label={Text("Duration (s)")},singleLine=true,modifier=Modifier.weight(1f))
        OutlinedTextField(value=steps,onValueChange={steps=it;run=null},
            label={Text("Steps")},singleLine=true,modifier=Modifier.weight(1f))
    }
    OutlinedButton(onClick={
        runCatching{
            val vectors=selected.associateWith{id->
                val v=speeds[id]?:listOf("0","0","0")
                NativeLabVector(v[0].toDouble(),v[1].toDouble(),v[2].toDouble())
            }
            run=NativeWorldLabGravity.evaluate(project,spheres.filter{it.id in selected}
                .map{it.id},vectors,duration.toDouble(),steps.toInt())
            time=0f;playing=false;onError("")
        }.onFailure{run=null;playing=false
            onError(it.message?:"Gravity assumption outside supported domain")}
    },enabled=selected.size in 2..8){Text("Calculate gravity on device")}
    if(selected.size>8)Text("Native local solver supports at most 8 bodies. "+
        "Reduce the selection; no automatic account upload occurs.")
    run?.let{active->
        val sample=active.sample(time.toDouble())
        Text("Energy drift: "+String.format("%.4g",active.energyDriftFraction*100)+" %")
        Canvas(Modifier.fillMaxWidth().height(150.dp)
            .background(Color(0xFF16232B),RoundedCornerShape(12.dp))
            .semantics{contentDescription="XY projection of native computed gravity trajectory"}){
            val points=active.frames.flatMap{it.positionsM}
            val xmin=points.minOf{it.x}-1;val xmax=points.maxOf{it.x}+1
            val ymin=points.minOf{it.y}-1;val ymax=points.maxOf{it.y}+1
            val sx=(size.width*0.85f/(xmax-xmin)).toFloat()
            val sy=(size.height*0.85f/(ymax-ymin)).toFloat()
            sample.positionsM.forEachIndexed{i,position->
                drawCircle(if(i%2==0)Color(0xFF69C3C3) else Color(0xFFF2B877),
                    5f.coerceAtLeast(active.bodies[i].radiusM.toFloat()*minOf(sx,sy)),
                    Offset(size.width*0.05f+(position.x-xmin).toFloat()*sx,
                        size.height*0.95f-(position.y-ymin).toFloat()*sy))
            }
        }
        Slider(value=time,onValueChange={time=it;playing=false},
            valueRange=0f..active.durationSeconds.toFloat(),
            modifier=Modifier.semantics{contentDescription="Gravity simulation time"})
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedButton(onClick={playing=!playing}){
                Text(if(playing)"Pause" else "Play")
            }
            OutlinedButton(onClick={playing=false;time=0f}){Text("Reset")}
            OutlinedButton(onClick={export.launch("world-lab-gravity-evidence.json")}){
                Text("Export evidence")
            }
            OutlinedButton(onClick={
                scope.launch{
                    runCatching{withContext(Dispatchers.IO){
                        savedScience.save(project,NativeWorldLabEvidenceJson.gravity(active))
                    }}.onSuccess{
                        onError("Gravity evidence saved in private device history.")
                    }.onFailure{
                        onError(it.message?:"Save the project before retaining evidence.")
                    }
                }
            }){Text("Keep on device")}
        }
        Slider(value=rate,onValueChange={rate=it},valueRange=0.1f..10f,
            modifier=Modifier.semantics{contentDescription="Gravity playback speed"})
        Text(active.validity,style=MaterialTheme.typography.bodySmall)
    }
}
