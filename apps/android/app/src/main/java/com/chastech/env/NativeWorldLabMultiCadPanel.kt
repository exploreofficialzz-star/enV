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
    val ids=selected.toList()
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
            }){Text("Rotate selection")}
            OutlinedButton(enabled=ids.isNotEmpty(),onClick={
                runCatching{scale.toDouble()}.onSuccess{factor->
                    apply{NativeWorldLabEditor.scaleSolids(it,ids,listOf(factor,factor,factor))}
                }.onFailure{feedback="Enter a valid scale factor"}
            }){Text("Scale selection")}
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
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
            OutlinedButton(enabled=ids.size>=2,onClick={
                apply{NativeWorldLabEditor.alignSolids(it,ids,axis,"min")}
            }){Text("Align minimum")}
            OutlinedTextField(value=gap,onValueChange={gap=it},
                label={Text("Distribution gap m")},singleLine=true,
                modifier=Modifier.weight(1f))
            OutlinedButton(enabled=ids.size>=3,onClick={
                runCatching{gap.toDouble()}.onSuccess{distance->
                    apply{NativeWorldLabEditor.distributeSolids(it,ids,axis,distance)}
                }.onFailure{feedback="Enter a valid nonnegative gap"}
            }){Text("Distribute")}
        }
        Text("Alignment uses rotated primitive bounding extents. Distribution preserves part order and enforces the entered minimum gap.",
            style=MaterialTheme.typography.bodySmall)
        if(feedback.isNotBlank())Text(feedback,color=MaterialTheme.colorScheme.error,
            style=MaterialTheme.typography.bodySmall)
    }
}
