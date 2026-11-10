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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.chastech.env.engine.*
import java.util.Locale

/** Local geometry-derived light path through the actual invented 3D solids. */
@Composable
fun NativeWorldLabRayPanel(project:NativeWorldLabProject,onMessage:(String)->Unit){
    val eligible=project.entities.filter{entity->
        entity.scientificRole=="reference-solid"&&entity.shape in setOf("box","sphere")&&
        project.materials.any{it.id==entity.materialId&&it.refractiveIndex!=null}
    }
    var originText by remember(project.id){mutableStateOf("-4,0,0")}
    var directionText by remember(project.id){mutableStateOf("1,0,0")}
    var distanceText by remember(project.id){mutableStateOf("10")}
    var contactsText by remember(project.id){mutableStateOf("8")}
    var run by remember(project.id,project.revision){
        mutableStateOf<NativeOpticalSceneRun?>(null)
    }
    val context=LocalContext.current
    val savedEvidence=remember(context){NativeWorldLabOpticsEvidenceStore(context.filesDir)}
    var exportJson by remember {mutableStateOf("")}
    val export=rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")){uri->
        if(uri!=null&&exportJson.isNotEmpty()){
            runCatching{
                val bytes=exportJson.toByteArray(Charsets.UTF_8)
                require(bytes.size<=2*1024*1024){"Optical ray evidence exceeds 2 MB."}
                context.contentResolver.openOutputStream(uri,"wt")?.use{
                    it.write(bytes);it.flush()
                }?:error("Cannot open the selected optical evidence file.")
            }.onSuccess{onMessage("Exported portable optical 3D ray evidence.")}
                .onFailure{onMessage(it.message?:"Optical ray export failed.")}
        }
    }
    fun parseVector(raw:String):NativeRayVector{
        val parts=raw.split(",").map{it.trim().toDouble()}
        require(parts.size==3){"Ray vector needs X,Y,Z coordinates."}
        return NativeRayVector(parts[0],parts[1],parts[2])
    }
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
        Text("Trace light through invented 3D geometry",
            style=MaterialTheme.typography.titleSmall)
        LabNote("This runs on the phone, using the geometry and refractive "+
            "assumptions you already invented. One primary ray only; other "+
            "reflected rays, absorption and diffraction are not traced.")
        Text("Eligible indexed boxes or spheres: "+eligible.size)
        if(eligible.isNotEmpty()){
            OutlinedButton(onClick={
                val target=eligible.first()
                val length=kotlin.math.max(2.0,target.dimensionsMeters.x)
                originText=String.format(Locale.US,"%.5f,%.5f,%.5f",
                    target.positionMeters.x-2*length,
                    target.positionMeters.y,target.positionMeters.z)
                directionText="1,0,0"
                distanceText=kotlin.math.min(1000.0,length*5).toString()
                run=null
            }){Text("Aim at "+eligible.first().name)}
        }
        OutlinedTextField(value=originText,onValueChange={originText=it;run=null},
            label={Text("Start X,Y,Z (metres)")},
            singleLine=true,modifier=Modifier.fillMaxWidth())
        OutlinedTextField(value=directionText,
            onValueChange={directionText=it;run=null},
            label={Text("Travel direction X,Y,Z")},
            singleLine=true,modifier=Modifier.fillMaxWidth())
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
            OutlinedTextField(value=distanceText,
                onValueChange={distanceText=it;run=null},
                label={Text("Distance (m)")},singleLine=true,modifier=Modifier.weight(1f))
            OutlinedTextField(value=contactsText,
                onValueChange={contactsText=it;run=null},
                label={Text("Max boundaries")},singleLine=true,
                modifier=Modifier.weight(1f))
        }
        OutlinedButton(enabled=eligible.isNotEmpty(),onClick={
            runCatching{
                NativeWorldLabOpticalScene.trace(project,
                    parseVector(originText),parseVector(directionText),
                    distanceText.toDouble(),contactsText.toInt())
            }.onSuccess{
                run=it
                onMessage("Computed light intersections with invented solid geometry.")
            }.onFailure{
                run=null
                onMessage(it.message?:"The optical geometry is unsupported.")
            }
        }){Text("Trace invented geometry locally")}
        run?.takeIf{it.projectId==project.id&&it.projectRevision==project.revision}
            ?.let{record->
            Text("Segments: "+record.segments.size+
                " · primary light: "+String.format(Locale.US,"%.2f",record.finalPower*100)+"%"+
                " · excluded reflection: "+
                String.format(Locale.US,"%.2f",record.discardedPower*100)+"%")
            val points=record.segments.flatMap{listOf(it.start,it.end)}
            val minX=points.minOf{it.x}
            val maxX=points.maxOf{it.x}
            val minY=points.minOf{it.y}
            val maxY=points.maxOf{it.y}
            val span=kotlin.math.max(1.0,kotlin.math.max(maxX-minX,maxY-minY))
            LabNote("XY projection of real calculated 3D rays; Z is not visible here.")
            Canvas(modifier=Modifier.fillMaxWidth().height(184.dp)){
                fun pos(vector:NativeRayVector):Offset{
                    val scale=0.9f*kotlin.math.min(size.width,size.height)/span.toFloat()
                    return Offset(
                        size.width*0.5f+
                            (vector.x-(minX+maxX)/2).toFloat()*scale,
                        size.height*0.5f-
                            (vector.y-(minY+maxY)/2).toFloat()*scale)
                }
                for(segment in record.segments){
                    if(segment.kind=="limit")continue
                    drawLine(
                        color=if(segment.kind=="total-internal-reflection")
                            Color(0xFFFF9800) else Color(0xFF00BCD4),
                        start=pos(segment.start),end=pos(segment.end),
                        strokeWidth=3.dp.toPx())
                }
            }
            record.segments.take(16).forEachIndexed{index,part->
                Text((index+1).toString()+": "+part.kind+
                    " · "+String.format(Locale.US,"%.3f",part.travelledMeters)+" m",
                    style=MaterialTheme.typography.bodySmall)
            }
            OutlinedButton(onClick={
                runCatching{savedEvidence.save(record)}.onSuccess{
                    onMessage("Saved 3D ray evidence with this device's invention.")
                }.onFailure{
                    onMessage(it.message?:"Could not retain optical scene evidence.")
                }
            }){Text("Keep 3D ray evidence on device")}
            OutlinedButton(onClick={
                runCatching{record.portableEvidence()}.onSuccess{
                    exportJson=it
                    export.launch("world-lab-invented-3d-light-trace.json")
                }.onFailure{onMessage(it.message?:"Unable to export ray evidence.")}
            }){Text("Export 3D light trace evidence")}
            LabNote(record.validity)
        }
    }
}
