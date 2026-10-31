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

/** Native calculated multi-body scene, not an externally measured video. */
@Composable
fun NativeWorldLabMultiSpherePanel(
    project:NativeWorldLabProject,
    onError:(String)->Unit,
) {
    val spheres=project.entities.filter{it.shape=="sphere"}
    var inputs by remember(project){
        mutableStateOf<Map<String,List<String>>>(emptyMap())
    }
    var restitution by remember(project){mutableFloatStateOf(1f)}
    var run by remember(project){mutableStateOf<NativeGroupRun?>(null)}
    var time by remember(project){mutableFloatStateOf(0f)}
    var playing by remember(project){mutableStateOf(false)}
    var rate by remember(project){mutableFloatStateOf(1f)}
    val scope=rememberCoroutineScope()
    val context=LocalContext.current
    val export=rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")){uri->
        if(uri!=null){
            val snapshot=run
            if(snapshot!=null)scope.launch {
                runCatching{withContext(Dispatchers.IO){
                    val bytes=snapshot.toEvidenceJson().toByteArray(Charsets.UTF_8)
                    require(bytes.size<=1048576){"Evidence exceeds portable export bounds"}
                    context.contentResolver.openOutputStream(uri,"wt")?.use{
                        it.write(bytes);it.flush()
                    }?:error("Cannot open evidence destination")
                }}.onFailure{onError(it.message?:"Group evidence export failed")}
            }
        }
    }
    LaunchedEffect(playing,rate,run){
        while(playing){
            delay(40)
            val active=run?:break
            time=(time+0.04f*rate).coerceAtMost(active.durationSeconds.toFloat())
            if(time>=active.durationSeconds.toFloat())playing=false
        }
    }
    Text("Collide a group of spheres",style=MaterialTheme.typography.titleSmall)
    Text("Invent each sphere's starting speed. Consecutive 3D contacts transfer momentum and energy. "+
        "Only isolated frictionless rigid impacts are modeled; concurrent impacts are rejected.",
        style=MaterialTheme.typography.bodySmall)
    if(spheres.size !in 2..12){
        Text("Add 2–12 spherical objects and assign density to each.")
        return
    }
    Column(Modifier.fillMaxWidth().heightIn(max=260.dp).verticalScroll(rememberScrollState())){
        spheres.forEachIndexed{index,solid->
            val fields=inputs[solid.id]?:
                if(index==0)listOf("2","0","0") else listOf("0","0","0")
            Text(solid.name+" · "+solid.id.take(8),style=MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                for(axis in 0..2) {
                    OutlinedTextField(
                        value=fields[axis],
                        onValueChange={value->
                            val changed=fields.toMutableList()
                            changed[axis]=value
                            inputs=inputs+ (solid.id to changed)
                            run=null;playing=false
                        },
                        label={Text(listOf("X","Y","Z")[axis]+" m/s")},
                        singleLine=true,modifier=Modifier.weight(1f)
                    )
                }
            }
        }
    }
    Text("Assumed restitution: "+String.format("%.2f",restitution))
    Slider(value=restitution,onValueChange={
        restitution=it;run=null;playing=false
    },valueRange=0f..1f,
        modifier=Modifier.semantics{contentDescription="Group sphere restitution"})
    OutlinedButton(onClick={
        runCatching{
            val velocities=spheres.mapIndexed{index,solid->
                val parts=inputs[solid.id]?:
                    if(index==0)listOf("2","0","0") else listOf("0","0","0")
                require(parts.all{it.trim().isNotEmpty()}){"Enter all X/Y/Z velocities"}
                solid.id to NativeLabVector(parts[0].toDouble(),parts[1].toDouble(),
                    parts[2].toDouble())
            }.toMap()
            run=NativeWorldLabMultiSphere.evaluate(project,velocities,restitution.toDouble())
            time=0f;playing=false;onError("")
        }.onFailure{run=null;playing=false
            onError(it.message?:"Group collision assumptions rejected")}
    }) {Text("Calculate all sphere contacts")}
    run?.let{active->
        val sample=active.sample(time.toDouble().coerceIn(0.0,active.durationSeconds))
        Text("Calculated contacts: "+active.events.size)
        Text("Kinetic energy before/after: "+String.format("%.5g",active.initialEnergyJ)+
            " / "+String.format("%.5g",active.finalEnergyJ)+" J")
        Text("Dissipated energy: "+String.format("%.5g",active.dissipationJ)+" J")
        Text("Total momentum X before/after: "+
            String.format("%.5g / %.5g",active.initialMomentum.x,active.finalMomentum.x)+
            " kg·m/s")
        // Genuine geometric XY projection of the independently computed 3D trajectories.
        Canvas(Modifier.fillMaxWidth().height(140.dp)
            .background(Color(0xFF16232B),RoundedCornerShape(12.dp))
            .semantics{contentDescription="XY projection of computed three-dimensional sphere group motion"}){
            val all=active.initial.map{it.positionM}+
                active.sample(active.durationSeconds).objects.map{it.positionM}
            val minX=all.minOf{it.x}-1
            val maxX=all.maxOf{it.x}+1
            val minY=all.minOf{it.y}-1
            val maxY=all.maxOf{it.y}+1
            val sx=(size.width*0.9f/(maxX-minX)).toFloat()
            val sy=(size.height*0.84f/(maxY-minY)).toFloat()
            for((index,ball)in sample.objects.withIndex()){
                val point=Offset(size.width*0.05f+(ball.positionM.x-minX).toFloat()*sx,
                    size.height*0.9f-(ball.positionM.y-minY).toFloat()*sy)
                val radius=(active.initial[index].radiusM.toFloat()*minOf(sx,sy))
                    .coerceAtLeast(4f)
                drawCircle(if(index%2==0)Color(0xFF69C3C3) else Color(0xFFF2B877),
                    radius,point)
            }
        }
        Text("Simulated time: "+String.format("%.2f",time)+" s")
        Slider(value=time,onValueChange={playing=false;time=it},
            valueRange=0f..active.durationSeconds.toFloat(),
            modifier=Modifier.semantics{contentDescription="Explore group collision time"})
        Text("Impacts completed: "+sample.completedEvents)
        active.events.forEachIndexed{index,event->
            Text("Contact "+(index+1)+": "+event.firstEntityId.take(8)+" → "+
                event.secondEntityId.take(8)+" at "+
                String.format("%.4f",event.atSeconds)+" s")
        }
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedButton(onClick={playing=!playing}){
                Text(if(playing)"Pause group" else "Play group")
            }
            OutlinedButton(onClick={playing=false;time=0f}){Text("Reset group")}
            OutlinedButton(onClick={rate=if(rate==0.1f)1f else if(rate==1f)4f else 0.1f}){
                Text(String.format("%.1f",rate)+"×")
            }
        }
        OutlinedButton(onClick={export.launch("world-lab-multi-sphere-evidence.json")}){
            Text("Export group evidence")
        }
        Text(active.validity,style=MaterialTheme.typography.bodySmall)
    }
}
