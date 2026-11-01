package com.chastech.env

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.chastech.env.engine.NativeWorldLabFieldKind
import com.chastech.env.engine.NativeWorldLabFieldLayer
import com.chastech.env.engine.NativeWorldLabFieldLayerCodec
import com.chastech.env.engine.NativeWorldLabFieldPlane
import java.io.ByteArrayOutputStream

@Composable
internal fun NativeWorldLabFieldImportPanel(timeSeconds:Double) {
    val context=LocalContext.current
    var layer by remember { mutableStateOf<NativeWorldLabFieldLayer?>(null) }
    var status by remember { mutableStateOf("Only public field layers can be opened until an authenticated dataset permission context is available.") }
    val importer=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->
        if(uri!=null){
            runCatching {
                val bytes=context.contentResolver.openInputStream(uri)?.use { input ->
                    val out=ByteArrayOutputStream()
                    val buffer=ByteArray(8192)
                    while(true){
                        val read=input.read(buffer)
                        if(read<0)break
                        require(out.size()+read<=NativeWorldLabFieldLayerCodec.MAX_BYTES){
                            "Field layer import exceeds 16 MB."
                        }
                        out.write(buffer,0,read)
                    }
                    out.toByteArray()
                }?:error("Could not open the selected field-layer file.")
                NativeWorldLabFieldLayerCodec.decode(bytes,emptySet())
            }.onSuccess {
                layer=it
                status="Loaded ${it.label} · ${it.sourceDescription} · ${it.sampleTimesSeconds.size} recorded times."
            }.onFailure {
                status=it.message?: "Field layer could not be imported."
            }
        }
    }
    Column(verticalArrangement=Arrangement.spacedBy(6.dp),modifier=Modifier.fillMaxWidth().padding(top=8.dp)) {
        Text("Recorded scientific field",style=MaterialTheme.typography.titleSmall)
        Button(onClick={importer.launch(arrayOf("application/json","text/json"))}) {
            Text("Import field-layer JSON")
        }
        Text(status,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.secondary)
        layer?.let { value ->
            NativeWorldLabFieldRenderer(value,timeSeconds)
        }
    }
}

@Composable
private fun NativeWorldLabFieldRenderer(layer:NativeWorldLabFieldLayer,timeSeconds:Double) {
    var plane by remember(layer.id){mutableStateOf(NativeWorldLabFieldPlane.XY)}
    var sliceIndex by remember(layer.id){mutableStateOf((layer.dimensions[plane.normal]-1)/2)}
    var tensorComponent by remember(layer.id){mutableStateOf(0)}
    val maximumSlice=layer.dimensions[plane.normal]-1
    val frame=remember(layer,timeSeconds,plane,sliceIndex,tensorComponent){
        runCatching {
            when(layer.kind){
                NativeWorldLabFieldKind.SCALAR->layer.scalarSlice(timeSeconds,plane,sliceIndex)
                NativeWorldLabFieldKind.TENSOR->layer.tensorSlice(timeSeconds,tensorComponent,plane,sliceIndex)
                NativeWorldLabFieldKind.VECTOR->layer.vectorGlyphs(timeSeconds,plane,sliceIndex)
            }
        }
    }
    val streamlines=remember(layer,timeSeconds,plane,sliceIndex){
        if(layer.kind==NativeWorldLabFieldKind.VECTOR&&layer.rendererKind=="streamlines")
            runCatching{layer.vectorStreamlines(timeSeconds,plane,sliceIndex)} else null
    }
    Column(verticalArrangement=Arrangement.spacedBy(5.dp),modifier=Modifier.fillMaxWidth()) {
        Text(layer.legendTitle,style=MaterialTheme.typography.titleMedium)
        Text("${layer.kind.name.lowercase()} · ${layer.rendererKind} · ${layer.crs} · ${layer.displayUnits}",
            style=MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
            NativeWorldLabFieldPlane.values().forEach { candidate ->
                OutlinedButton(onClick={
                    plane=candidate
                    sliceIndex=((layer.dimensions[candidate.normal]-1)/2)
                }) { Text(candidate.name) }
            }
        }
        Text("Slice ${sliceIndex+1}/${maximumSlice+1}",style=MaterialTheme.typography.bodySmall)
        if(maximumSlice>0)Slider(value=sliceIndex.toFloat(),onValueChange={sliceIndex=it.toInt()},
            valueRange=0f..maximumSlice.toFloat(),steps=(maximumSlice-1).coerceAtLeast(0))
        if(layer.kind==NativeWorldLabFieldKind.TENSOR){
            Text("Tensor component: "+listOf("Txx","Txy","Txz","Tyx","Tyy","Tyz","Tzx","Tzy","Tzz")[tensorComponent])
            Slider(value=tensorComponent.toFloat(),onValueChange={tensorComponent=it.toInt()},
                valueRange=0f..8f,steps=7)
        }
        frame.fold(onSuccess={data->
            val componentLabel=if(layer.kind==NativeWorldLabFieldKind.TENSOR)
                listOf("Txx","Txy","Txz","Tyx","Tyy","Tyz","Tzx","Tzy","Tzz")[tensorComponent]
                else "Recorded component"
            Canvas(Modifier.fillMaxWidth().height(190.dp).semantics {
                contentDescription=layer.accessibleDescription+"; "+componentLabel+
                    "; "+plane.name+" slice ${sliceIndex+1}; time ${data.sampleTimeSeconds} seconds"
            }) {
                val gridWidth=data.dimensionU
                val gridHeight=data.dimensionV
                val cellW=size.width/gridWidth
                val cellH=size.height/gridHeight
                if(layer.kind==NativeWorldLabFieldKind.SCALAR||layer.kind==NativeWorldLabFieldKind.TENSOR){
                    data.cells.forEach { cell ->
                        val value=cell.components.getOrNull(if(layer.kind==NativeWorldLabFieldKind.TENSOR)tensorComponent else 0)
                        val fill=if(value==null)Color.Gray.copy(alpha=0.45f) else {
                            val t=((value-layer.minimumSI)/(layer.maximumSI-layer.minimumSI).coerceAtLeast(1e-12)).coerceIn(0.0,1.0).toFloat()
                            Color(red=t,green=0.18f+0.36f*(1-t),blue=1-t,alpha=0.94f)
                        }
                        drawRect(fill,topLeft=Offset(cell.uIndex*cellW,size.height-(cell.vIndex+1)*cellH),
                            size=Size(cellW,cellH))
                        drawRect(Color.Black.copy(alpha=0.28f),topLeft=Offset(cell.uIndex*cellW,size.height-(cell.vIndex+1)*cellH),
                            size=Size(cellW,cellH),style=Stroke(0.7f))
                    }
                }else if(layer.rendererKind=="glyphs"){
                    data.cells.forEach { cell ->
                        val u=cell.components.getOrNull(plane.u)?:return@forEach
                        val v=cell.components.getOrNull(plane.v)?:return@forEach
                        val length=kotlin.math.sqrt(u*u+v*v)
                        if(length<1e-12||!length.isFinite())return@forEach
                        val start=Offset((cell.uIndex+0.5f)*cellW,size.height-(cell.vIndex+0.5f)*cellH)
                        val scale=0.34f*minOf(cellW,cellH)/length.toFloat().coerceAtLeast(1e-12f)
                        val end=Offset(start.x+u.toFloat()*scale,start.y-v.toFloat()*scale)
                        drawLine(Color(0xFF246BCE),start,end,strokeWidth=2.2f)
                        drawCircle(Color(0xFF246BCE),2.5f,end)
                    }
                }
                streamlines?.getOrNull()?.paths?.forEach { points ->
                    if(points.size>=2){
                        val path=Path()
                        points.forEachIndexed { index,point ->
                            val x=point.u.toFloat()*size.width
                            val y=size.height-point.v.toFloat()*size.height
                            if(index==0)path.moveTo(x,y) else path.lineTo(x,y)
                        }
                        drawPath(path,Color(0xFF246BCE),style=Stroke(width=2.4f))
                    }
                }
            }
            Text("Sample ${data.sampleIndex+1}/${layer.sampleTimesSeconds.size} · ${data.sampleTimeSeconds} s · ${data.cells.count{cell->cell.components.any{it!=null}}} cells with recorded values",
                style=MaterialTheme.typography.bodySmall)
        },onFailure={error->
            Text(error.message?: "Field slice is unavailable.",color=MaterialTheme.colorScheme.error,
                style=MaterialTheme.typography.bodySmall)
        })
        Text("Source: ${layer.sourceDescription} · calibration: ${layer.calibrationStatus} (${layer.calibrationMethod})",
            style=MaterialTheme.typography.bodySmall)
        Text(layer.validity,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.secondary)
    }
}
