package com.chastech.env

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.chastech.env.engine.NativeWorldLabEditor
import com.chastech.env.engine.NativeWorldLabProject

@Composable
fun NativeWorldLabMultiCadPanel(
    project:NativeWorldLabProject,
    source:String,
    selectedEntityId:String?,
    onEdit:((String)->String)->Unit,
){
    var selected by remember(project.id){mutableStateOf(setOfNotNull(selectedEntityId))}
    var axis by remember(project.id){mutableIntStateOf(0)}
    var degrees by remember(project.id){mutableStateOf("15")}
    var scale by remember(project.id){mutableStateOf("1.1")}
    var spacing by remember(project.id){mutableStateOf("1")}
    var gap by remember(project.id){mutableStateOf("0.25")}
    var alignment by remember(project.id){mutableStateOf("min")}
    var gridStep by remember(project.id){mutableStateOf("0.5")}
    var plane by remember(project.id){mutableStateOf("0")}
    var patternSpacing by remember(project.id){mutableStateOf("2")}
    var copies by remember(project.id){mutableStateOf("2")}
    var center by remember(project.id){mutableStateOf("0,0,0")}
    var instances by remember(project.id){mutableStateOf("4")}
    var feedback by remember(project.id){mutableStateOf("")}
    LaunchedEffect(project.entities.map{it.id}.toSet()){
        selected=selected.intersect(project.entities.map{it.id}.toSet())
        if(selected.isEmpty()&&selectedEntityId!=null&&project.entities.any{it.id==selectedEntityId})
            selected=setOf(selectedEntityId)
    }
    fun apply(action:(String)->String){
        runCatching{onEdit(action)}.onSuccess{feedback=""}
            .onFailure{feedback=it.message?:"Multi-part CAD operation was rejected"}
    }
    val ids=project.entities.map{it.id}.filter{it in selected}
    Column(Modifier.fillMaxWidth().padding(vertical=8.dp),
        verticalArrangement=Arrangement.spacedBy(8.dp)){
        Text("Multi-part CAD",style=MaterialTheme.typography.titleSmall)
        Text("Select several parts, then apply one atomic transform to all selected geometry. "+
            "Each action creates one project revision; it does not create physical joints.",
            style=MaterialTheme.typography.bodySmall)
        Column(Modifier.fillMaxWidth().heightIn(max=180.dp).verticalScroll(rememberScrollState())){
            project.entities.forEach{solid->
                Row(verticalAlignment=Alignment.CenterVertically){
                    Checkbox(checked=solid.id in selected,onCheckedChange={checked->
                        selected=if(checked)selected+solid.id else selected-solid.id
                    })
                    Text(solid.name+" · "+solid.shape,style=MaterialTheme.typography.bodySmall)
                }
            }
        }
        Text("Selected: "+ids.size+" / "+project.entities.size)
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp),verticalAlignment=Alignment.CenterVertically){
            OutlinedTextField(value=gridStep,onValueChange={gridStep=it},
                label={Text("Grid spacing m")},singleLine=true,modifier=Modifier.weight(1f))
            OutlinedButton(enabled=ids.isNotEmpty(),onClick={
                runCatching{gridStep.toDouble()}.onSuccess{step->
                    apply{NativeWorldLabEditor.snapSolids(it,ids,step)}
                }.onFailure{feedback="Enter a grid spacing from 0.001 to 100 metres"}
            }){Text("Snap selected")}
        }
        if(ids.size==2){
            runCatching{NativeWorldLabEditor.measureCenters(project,ids[0],ids[1])}
                .onSuccess{measurement->
                    Text("Centre distance: "+String.format(java.util.Locale.US,"%.3f",measurement.centerDistanceM)+
                        " m · ΔX "+String.format(java.util.Locale.US,"%.3f",measurement.offsetXM)+
                        " · ΔY "+String.format(java.util.Locale.US,"%.3f",measurement.offsetYM)+
                        " · ΔZ "+String.format(java.util.Locale.US,"%.3f",measurement.offsetZM)+" m",
                        style=MaterialTheme.typography.bodySmall)
                }.onFailure{feedback=it.message?: "Could not measure the selected parts"}
        }else{
            Text("Select exactly two parts to measure their centre-to-centre distance.",
                style=MaterialTheme.typography.bodySmall)
        }
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            listOf("X","Y","Z").forEachIndexed{i,label->
                FilterChip(selected=axis==i,onClick={axis=i},label={Text(label)})
            }
        }
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedTextField(value=degrees,onValueChange={degrees=it},
                label={Text("Rotation °")},singleLine=true,modifier=Modifier.weight(1f))
            OutlinedTextField(value=scale,onValueChange={scale=it},
                label={Text("Uniform scale")},singleLine=true,modifier=Modifier.weight(1f))
        }
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedButton(enabled=ids.isNotEmpty(),onClick={
                runCatching{degrees.toDouble()}.onSuccess{angle->
                    apply{NativeWorldLabEditor.rotateSolids(it,ids,axis,angle)}
                }.onFailure{feedback="Enter a valid rotation angle"}
            }){Text("Rotate parts")}
            OutlinedButton(enabled=ids.isNotEmpty(),onClick={
                runCatching{degrees.toDouble()}.onSuccess{angle->
                    apply{NativeWorldLabEditor.rotateGroupAroundCentroid(it,ids,axis,angle)}
                }.onFailure{feedback="Enter a valid group rotation"}
            }){Text("Rotate group")}
            OutlinedButton(enabled=ids.isNotEmpty(),onClick={
                runCatching{scale.toDouble()}.onSuccess{factor->
                    apply{NativeWorldLabEditor.scaleSolids(it,ids,listOf(factor,factor,factor))}
                }.onFailure{feedback="Enter a valid scale factor"}
            }){Text("Scale parts")}
            OutlinedButton(enabled=ids.isNotEmpty(),onClick={
                runCatching{scale.toDouble()}.onSuccess{factor->
                    apply{NativeWorldLabEditor.scaleGroupAroundCentroid(it,ids,factor)}
                }.onFailure{feedback="Enter a valid group scale"}
            }){Text("Scale group")}
        }
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedTextField(value=spacing,onValueChange={spacing=it},
                label={Text("Duplicate offset m")},singleLine=true,
                modifier=Modifier.weight(1f))
            OutlinedButton(enabled=ids.isNotEmpty()&&project.entities.size+ids.size<=200,
                onClick={
                    runCatching{spacing.toDouble()}.onSuccess{step->
                        val offset=List(3){i->if(i==axis)step else 0.0}
                        apply{NativeWorldLabEditor.duplicateSolids(it,ids,offset)}
                    }.onFailure{feedback="Enter a valid duplicate offset"}
                }){Text("Duplicate all")}
        }
        Column(verticalArrangement=Arrangement.spacedBy(6.dp)){
            Text("Align rotated part bounds",style=MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                listOf("min" to "Minimum","center" to "Center","max" to "Maximum").forEach{(value,label)->
                    FilterChip(selected=alignment==value,onClick={alignment=value},
                        label={Text(label)})
                }
            }
            OutlinedButton(enabled=ids.size>=2,onClick={
                apply{NativeWorldLabEditor.alignSolids(it,ids,axis,alignment)}
            }){Text("Align selected")}
        }
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedTextField(value=gap,onValueChange={gap=it},
                label={Text("Distribution gap m")},singleLine=true,
                modifier=Modifier.weight(1f))
            OutlinedButton(enabled=ids.size>=3,onClick={
                runCatching{gap.toDouble()}.onSuccess{distance->
                    apply{NativeWorldLabEditor.distributeSolids(it,ids,axis,distance)}
                }.onFailure{feedback="Enter a valid nonnegative gap"}
            }){Text("Distribute")}
        }
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedButton(enabled=ids.isNotEmpty(),onClick={
                runCatching{spacing.toDouble()}.onSuccess{distance->
                    val delta=List(3){i->if(i==axis)distance else 0.0}
                    apply{NativeWorldLabEditor.translateSolids(it,ids,delta)}
                }.onFailure{feedback="Enter a valid translation distance"}
            }){Text("Translate selection")}
            OutlinedTextField(value=plane,onValueChange={plane=it},
                label={Text("Mirror plane m")},singleLine=true,modifier=Modifier.weight(1f))
            OutlinedButton(enabled=ids.isNotEmpty(),onClick={
                runCatching{plane.toDouble()}.onSuccess{value->
                    apply{NativeWorldLabEditor.mirrorSolids(it,ids,axis,value)}
                }.onFailure{feedback="Enter a valid mirror plane"}
            }){Text("Mirror all")}
        }
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedTextField(value=patternSpacing,onValueChange={patternSpacing=it},
                label={Text("Pattern spacing m")},singleLine=true,modifier=Modifier.weight(1f))
            OutlinedTextField(value=copies,onValueChange={copies=it},
                label={Text("Copies")},singleLine=true,modifier=Modifier.weight(1f))
            OutlinedButton(enabled=ids.isNotEmpty(),onClick={
                val count=copies.toIntOrNull()
                val step=patternSpacing.toDoubleOrNull()
                if(count==null||step==null)feedback="Enter valid pattern spacing and copy count"
                else apply{NativeWorldLabEditor.linearPatternSolids(it,ids,axis,step,count)}
            }){Text("Linear pattern")}
        }
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedTextField(value=center,onValueChange={center=it},
                label={Text("Circular centre X,Y,Z (m)")},singleLine=true,
                modifier=Modifier.weight(1f))
            OutlinedTextField(value=instances,onValueChange={instances=it},
                label={Text("Instances")},singleLine=true,modifier=Modifier.weight(1f))
            OutlinedButton(enabled=ids.isNotEmpty(),onClick={
                val values=center.split(",").mapNotNull{it.trim().toDoubleOrNull()}
                val count=instances.toIntOrNull()
                if(values.size!=3||count==null)feedback="Enter three centre coordinates and an instance count"
                else apply{NativeWorldLabEditor.circularPatternSolids(it,ids,axis,values,count)}
            }){Text("Circular pattern")}
        }
        Text("Alignment uses rotated primitive bounding extents. Distribution preserves part order and enforces the entered minimum gap. Pattern copies retain geometry/material assumptions and receive new identities.",
            style=MaterialTheme.typography.bodySmall)
        if(feedback.isNotBlank())Text(feedback,color=MaterialTheme.colorScheme.error,
            style=MaterialTheme.typography.bodySmall)
    }
}
