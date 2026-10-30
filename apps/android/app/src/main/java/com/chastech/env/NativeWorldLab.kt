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
import com.chastech.env.engine.NativeLabInput
import com.chastech.env.engine.NativeWorldLabProject
import com.chastech.env.engine.NativeWorldLabProjectCodec
import com.chastech.env.engine.NativeWorldLabScience
import java.io.ByteArrayOutputStream
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Offline bounded World Lab science. Canvas is a schematic, never a measured field. */
@Composable
fun NativeWorldLabForm() {
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    var kind by remember { mutableStateOf("spring") }
    var time by remember { mutableFloatStateOf(0f) }
    var speed by remember { mutableFloatStateOf(1f) }
    var playing by remember { mutableStateOf(false) }
    var mass by remember { mutableFloatStateOf(1f) }
    var spring by remember { mutableFloatStateOf(4f) }
    var resistance by remember { mutableFloatStateOf(1000f) }
    var diffusivity by remember { mutableFloatStateOf(0.02f) }
    var inside by remember { mutableStateOf(false) }
    var project by remember { mutableStateOf<NativeWorldLabProject?>(null) }
    var selected by remember { mutableIntStateOf(0) }
    var warning by remember { mutableStateOf("") }
    val model=when(kind) {
        "spring"->NativeLabInput.Spring(massKg=mass.toDouble(),springNPerM=spring.toDouble())
        "rc"->NativeLabInput.RC(resistanceOhm=resistance.toDouble())
        else->NativeLabInput.Heat(diffusivityM2S=diffusivity.toDouble())
    }
    val result=remember(model,time) { runCatching {
        NativeWorldLabScience.evaluate(model,time.toDouble())
    } }
    val observation=result.getOrNull()
    val solid=project?.entities?.getOrNull(selected)
    val material=project?.materials?.firstOrNull { it.id==solid?.materialId }
    val derivedMass=if(solid!=null && material?.densityKgM3!=null)
        solid.volumeMetersCubed()*material.densityKgM3 else null
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if(uri!=null)scope.launch {
            runCatching { withContext(Dispatchers.IO) {
                val out=ByteArrayOutputStream()
                context.contentResolver.openInputStream(uri)?.use { input ->
                    val buffer=ByteArray(16384)
                    while(true) {
                        val read=input.read(buffer)
                        if(read<0)break
                        require(out.size()+read<=NativeWorldLabProjectCodec.MAX_BYTES) {
                            "Project must be 1 MB or smaller."
                        }
                        out.write(buffer,0,read)
                    }
                }?:error("File could not be opened.")
                NativeWorldLabProjectCodec.decode(out.toString(Charsets.UTF_8.name()))
            } }.onSuccess { project=it;selected=0;warning="" }
                .onFailure { warning=it.message?:"Unable to inspect this project." }
        }
    }
    LaunchedEffect(playing,speed) {
        while(playing) {
            delay(40)
            time=(time+0.04f*speed).coerceAtMost(12f)
            if(time>=12f)playing=false
        }
    }
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Text("The World Lab",style=MaterialTheme.typography.titleLarge)
        Text("Native offline reference models. Ground and shapes are illustrative, not measured or certified.",
            style=MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
            listOf("spring" to "Spring","rc" to "Circuit","heat" to "Heat").forEach { pair ->
                if(kind==pair.first) Button(onClick={playing=false;time=0f;kind=pair.first},
                    modifier=Modifier.weight(1f)) { Text(pair.second) }
                else OutlinedButton(onClick={playing=false;time=0f;kind=pair.first},
                    modifier=Modifier.weight(1f)) { Text(pair.second) }
            }
        }
        Canvas(Modifier.fillMaxWidth().height(170.dp)
            .background(Color(0xFF16232B),RoundedCornerShape(12.dp))
            .semantics { contentDescription="Computed experiment schematic. Numeric model values are available below." }) {
            if(kind=="spring") {
                drawLine(Color.LightGray,Offset(size.width*0.1f,size.height/2),
                    Offset(size.width*0.9f,size.height/2),strokeWidth=3f)
                val x=((observation?.xMeters?:0.0).coerceIn(-1.0,1.0)*size.width*0.3).toFloat()
                drawCircle(Color(0xFFF2B877),size.minDimension*0.11f,
                    Offset(size.width/2+x,size.height/2))
            }else if(kind=="rc") {
                drawRect(Color.Gray,Offset(size.width*0.28f,size.height*0.2f),
                    Size(size.width*0.44f,size.height*0.6f))
                val ratio=((observation?.voltageV?:0.0)/10.0).coerceIn(0.0,1.0).toFloat()
                drawRect(Color(0xFF65B7CD),
                    Offset(size.width*0.28f,size.height*(0.8f-0.6f*ratio)),
                    Size(size.width*0.44f,size.height*0.6f*ratio))
            }else {
                val temperatures=observation?.temperatureK?:List(21){293.15}
                temperatures.forEachIndexed { i,kelvin ->
                    val hot=((kelvin-293.15)/80.0).coerceIn(0.0,1.0).toFloat()
                    drawRect(Color(0.2f+0.78f*hot,0.32f+0.47f*hot,0.56f),
                        Offset(size.width*(0.07f+0.86f*i/21),size.height*0.38f),
                        Size(size.width*0.86f/21*0.96f,size.height*0.24f))
                }
            }
        }
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
            Button(onClick={playing=!playing}) { Text(if(playing)"Pause" else "Play") }
            OutlinedButton(onClick={playing=false;time=0f}) { Text("Reset") }
            OutlinedButton(onClick={playing=false;time=(time+1f/240f).coerceAtMost(12f)}) { Text("Step") }
            OutlinedButton(onClick={inside=!inside}) { Text(if(inside)"Hide" else "See inside") }
        }
        Text("Simulated time: "+labNumber(time.toDouble())+" s")
        Slider(value=time,onValueChange={time=it;playing=false},valueRange=0f..12f,
            modifier=Modifier.semantics { contentDescription="Simulated elapsed time" })
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
            listOf(0.1f,1f,10f).forEach { rate ->
                OutlinedButton(onClick={speed=rate}) { Text(labNumber(rate.toDouble())+"×") }
            }
        }
        if(kind=="spring") {
            Text("Assumed mass: "+labNumber(mass.toDouble())+" kg")
            Slider(value=mass.coerceIn(0.1f,100f),onValueChange={mass=it;playing=false},
                valueRange=0.1f..100f)
            Text("Spring stiffness: "+labNumber(spring.toDouble())+" N/m")
            Slider(value=spring,onValueChange={spring=it;playing=false},valueRange=0.1f..30f)
        }else if(kind=="rc") {
            Text("Resistance: "+labNumber(resistance.toDouble())+" Ω")
            Slider(value=resistance,onValueChange={resistance=it;playing=false},valueRange=100f..10000f)
        }else{
            Text("Thermal diffusivity: "+labNumber(diffusivity.toDouble())+" m²/s")
            Slider(value=diffusivity,onValueChange={diffusivity=it;playing=false},valueRange=0.001f..0.08f)
        }
        Text("Computed observations",style=MaterialTheme.typography.titleMedium)
        if(observation==null) Text(result.exceptionOrNull()?.message?:"Unsupported input",
            color=MaterialTheme.colorScheme.error)
        else if(kind=="spring") {
            Text("Position: "+labNumber(observation.xMeters)+" m")
            Text("Velocity: "+labNumber(observation.velocityMPerS)+" m/s")
            Text("Mechanical energy: "+labNumber(observation.mechanicalEnergyJ)+" J")
        }else if(kind=="rc") {
            Text("Capacitor voltage: "+labNumber(observation.voltageV)+" V")
            Text("Current: "+labNumber(observation.currentA)+" A")
            Text("Resistor heating: "+labNumber(observation.resistorHeatW)+" W")
        }else{
            Text("Mean temperature: "+labNumber(observation.meanTemperatureK)+" K")
            Text("Hottest cell: "+labNumber(observation.peakTemperatureK)+" K")
            if(inside) Text("21 computed internal cell temperatures (K): "+
                observation.temperatureK.orEmpty().joinToString(", "){labNumber(it)},
                style=MaterialTheme.typography.bodySmall)
        }
        if(inside && kind!="heat") Text("This is a model illustration, not X-ray imaging.",
            style=MaterialTheme.typography.bodySmall)
        HorizontalDivider()
        OutlinedButton(onClick={picker.launch(arrayOf("application/json","text/plain","*/*"))}) {
            Text("Inspect World Lab project JSON")
        }
        if(project!=null){
            Text(project!!.title+" · "+project!!.entities.size+" solids",style=MaterialTheme.typography.titleSmall)
            if(solid!=null) {
                Row {
                    TextButton(onClick={selected=(selected-1+project!!.entities.size)%project!!.entities.size}) {
                        Text("Previous")
                    }
                    Text(solid.name,modifier=Modifier.weight(1f).padding(top=12.dp))
                    TextButton(onClick={selected=(selected+1)%project!!.entities.size}) {
                        Text("Next")
                    }
                }
                Text("Ideal "+solid.shape+" volume: "+labNumber(solid.volumeMetersCubed())+" m³")
                Text("Material: "+(material?.name?:"Unknown")+" (hypothetical)")
                Text("Assumed mass: "+labNumber(derivedMass)+" kg")
                if(derivedMass!=null && derivedMass in 0.001..10000.0){
                    OutlinedButton(onClick={mass=derivedMass.toFloat();kind="spring";time=0f;playing=false}) {
                        Text("Test assumed mass as spring mass")
                    }
                }
            }
            Text("Objects are inspected numerically. Collisions, deformation, and unknown material properties are not simulated.",
                style=MaterialTheme.typography.bodySmall)
        }
        if(warning.isNotBlank()) Text(warning,color=MaterialTheme.colorScheme.error)
        Text("Science model 1.0.0 · hypothesis, not engineering certification.",
            style=MaterialTheme.typography.labelSmall)
    }
}
private fun labNumber(n:Double?):String =
    n?.takeIf{it.isFinite()}?.let{"%.5g".format(Locale.US,it)}?:"Unknown"
