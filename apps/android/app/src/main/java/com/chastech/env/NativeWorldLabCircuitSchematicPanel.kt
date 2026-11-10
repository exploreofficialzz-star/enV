package com.chastech.env

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.chastech.env.engine.NativeLabBranchFlow
import com.chastech.env.engine.NativeLabBranchFlowDirection
import com.chastech.env.engine.NativeLabCircuitComponent
import com.chastech.env.engine.NativeLabCircuitNetwork
import com.chastech.env.engine.NativeLabDcResult
import com.chastech.env.engine.NativeWorldLabBranchCurrent
import kotlin.math.abs
import java.util.Locale

@Composable
internal fun NativeWorldLabCircuitSchematicPanel(
    network:NativeLabCircuitNetwork,
    result:NativeLabDcResult?
) {
    val validResult=result?.takeIf { it.networkId==network.id }
    val wire=MaterialTheme.colorScheme.onSurface.copy(alpha=0.68f)
    val outline=MaterialTheme.colorScheme.outline
    val currentColor=MaterialTheme.colorScheme.primary
    val nodes=network.nodes
    val schematicDescription=buildString {
        append("Two-node circuit schematic. ")
        if(nodes.size==2)append(nodes[0].label+" and "+nodes[1].label+". ")
        if(validResult==null)append("Calculate the circuit for solver-derived current arrows.")
        else network.components.forEach { component ->
            val reading=validResult.branchCurrentsA[component.id]
            val flow=reading?.let { nativeCircuitFlow(component,it) }
            append(component.kind).append(" ")
            append(flow?.let(::nativeCircuitFlowDescription)?: "current unavailable")
            append(". ")
        }
    }

    Column(
        modifier=Modifier.fillMaxWidth().semantics {
            contentDescription=schematicDescription
        },
        verticalArrangement=Arrangement.spacedBy(5.dp)
    ) {
        Text("Calculated circuit flow",style=MaterialTheme.typography.titleSmall)
        if(nodes.size==2) {
            Canvas(
                modifier=Modifier.fillMaxWidth()
                    .height((58+network.components.size*52).coerceAtMost(500).dp)
            ) {
                val left=size.width*0.12f
                val right=size.width*0.88f
                val center=(left+right)/2f
                val spacing=size.height/(network.components.size+1).toFloat()
                val top=spacing*0.45f
                val bottom=size.height-spacing*0.45f
                val halfSymbol=(size.width*0.045f).coerceIn(14f,28f)
                drawLine(wire,Offset(left,top),Offset(left,bottom),strokeWidth=2.5f)
                drawLine(wire,Offset(right,top),Offset(right,bottom),strokeWidth=2.5f)
                drawCircle(wire,4f,Offset(left,top))
                drawCircle(wire,4f,Offset(right,top))
                network.components.forEachIndexed { index,component ->
                    val y=spacing*(index+1)
                    drawLine(wire,Offset(left,y),Offset(center-halfSymbol,y),strokeWidth=2f)
                    drawLine(wire,Offset(center+halfSymbol,y),Offset(right,y),strokeWidth=2f)
                    if(component.kind=="dc-source") {
                        drawLine(outline,Offset(center-5f,y-10f),Offset(center-5f,y+10f),strokeWidth=3f)
                        drawLine(outline,Offset(center+5f,y-6f),Offset(center+5f,y+6f),strokeWidth=2f)
                    } else {
                        drawRect(outline,topLeft=Offset(center-halfSymbol,y-8f),
                            size=Size(halfSymbol*2f,16f),style=Stroke(width=2f))
                    }
                    val signed=validResult?.branchCurrentsA?.get(component.id)
                    val flow=signed?.let{nativeCircuitFlow(component,it)}
                    if(flow!=null && flow.direction!=NativeLabBranchFlowDirection.ZERO) {
                        val leftToRight=flow.fromNodeId==nodes[0].id &&
                            flow.toNodeId==nodes[1].id
                        val rightToLeft=flow.fromNodeId==nodes[1].id &&
                            flow.toNodeId==nodes[0].id
                        if(leftToRight||rightToLeft) {
                            val sign=if(leftToRight)1f else -1f
                            val arrowStart=if(leftToRight)left+8f else right-8f
                            val arrowTip=if(leftToRight)center-halfSymbol-5f else center+halfSymbol+5f
                            val end=Offset(arrowTip,y)
                            drawLine(currentColor,Offset(arrowStart,y),end,strokeWidth=2.8f)
                            drawLine(currentColor,end,Offset(arrowTip-sign*8f,y-5f),strokeWidth=2.8f)
                            drawLine(currentColor,end,Offset(arrowTip-sign*8f,y+5f),strokeWidth=2.8f)
                        }
                    }
                }
            }
            Text("Node A: "+nodes[0].label+"     Node B: "+nodes[1].label,
                style=MaterialTheme.typography.bodySmall)
            network.components.forEach { component ->
                val label=if(component.kind=="dc-source")"Source" else
                    component.name?:if(component.kind=="resistor")"Resistor" else component.kind
                val current=validResult?.branchCurrentsA?.get(component.id)
                val flow=current?.let{nativeCircuitFlow(component,it)}
                Text(label+" · "+(flow?.let(::nativeCircuitFlowDescription)
                    ?: "Current not calculated"),style=MaterialTheme.typography.bodySmall)
            }
        } else {
            Text(
                "This network has "+nodes.size+" nodes. Its calculated branch directions remain " +
                    "topological from/to node records; no spatial wire positions are inferred.",
                style=MaterialTheme.typography.bodySmall
            )
            network.components.forEach { component ->
                val current=validResult?.branchCurrentsA?.get(component.id)
                val flow=current?.let{nativeCircuitFlow(component,it)}
                Text(component.id+" · "+(flow?.let(::nativeCircuitFlowDescription)
                    ?: "Current not calculated"),style=MaterialTheme.typography.bodySmall)
            }
        }
        val passiveLoads=network.components.filter {
            it.kind=="resistor"||it.kind=="hypothetical-device"
        }
        val zeroSourceCurrent=network.components.filter{it.kind=="dc-source"}.all { source ->
            abs(validResult?.branchCurrentsA?.get(source.id)?:Double.NaN)<=1e-12
        }
        if(validResult!=null&&passiveLoads.isEmpty()&&zeroSourceCurrent) {
            Text("Open circuit · no passive load is connected · source current 0 A · power transferred 0 W",
                color=MaterialTheme.colorScheme.secondary,
                style=MaterialTheme.typography.bodySmall)
        }
        LabNote("Legend · arrows show conventional current direction · A = amperes · 0 A = no arrow")
        Text("Topology-only circuit schematic; not measured wiring geometry or a spatial electric or magnetic field.",
            style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.secondary)
    }
}

private fun nativeCircuitFlow(
    component:NativeLabCircuitComponent,
    signedCurrentA:Double
):NativeLabBranchFlow? = runCatching {
    NativeWorldLabBranchCurrent.resolve(
        component.positiveNodeId,component.negativeNodeId,signedCurrentA)
}.getOrNull()

private fun nativeCircuitFlowDescription(flow:NativeLabBranchFlow):String =
    if(flow.direction==NativeLabBranchFlowDirection.ZERO) "0 A · no net branch current"
    else {
        val from=flow.fromNodeId.orEmpty()
        val to=flow.toNodeId.orEmpty()
        String.format(Locale.US,"%.5g A · %s → %s",flow.magnitudeA,from,to)
    }
