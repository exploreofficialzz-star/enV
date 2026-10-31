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
import com.chastech.env.engine.NativeWorldLabEditor
import com.chastech.env.engine.NativeWorldLabProjectCodec
import com.chastech.env.engine.NativeWorldLabHydrostatics
import com.chastech.env.engine.NativeLabHydroResult
import com.chastech.env.engine.NativeWorldLabDc
import com.chastech.env.engine.NativeLabDcResult
import com.chastech.env.engine.NativeWorldLabProjectStore
import com.chastech.env.engine.NativeWorldLabScience
import com.chastech.env.engine.NativeDropInput
import com.chastech.env.engine.NativeDropResult
import com.chastech.env.engine.NativeWorldLabDropScience
import com.chastech.env.engine.NativeActuatorInput
import com.chastech.env.engine.NativeActuatorResult
import com.chastech.env.engine.NativeActuatorThermal
import com.chastech.env.engine.NativeActuatorNumericalAudit
import com.chastech.env.engine.NativeWorldLabActuator
import com.chastech.env.engine.NativeWorldLabNetworkMotor
import com.chastech.env.engine.NativeLabNetworkMotorRun
import kotlin.math.PI
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
    val localProjects=remember(context){NativeWorldLabProjectStore(context.filesDir)}
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
    var projectJson by remember { mutableStateOf<String?>(null) }
    var dcRun by remember { mutableStateOf<NativeLabDcResult?>(null) }
    var savedSnapshot by remember { mutableStateOf<String?>(null) }
    var confirmation by remember { mutableStateOf<String?>(null) }
    var requestImport by remember { mutableStateOf(false) }
    var proposedName by remember { mutableStateOf("") }
    var proposedDensity by remember { mutableStateOf("") }
    var deviceName by remember { mutableStateOf("") }
    var deviceAssumption by remember { mutableStateOf("") }
    var deviceResistance by remember { mutableStateOf("") }
    var junctionName by remember { mutableStateOf("") }
    var positiveWire by remember { mutableStateOf("supply") }
    var negativeWire by remember { mutableStateOf("ground") }
    var selected by remember { mutableIntStateOf(0) }
    var hydroRun by remember { mutableStateOf<NativeLabHydroResult?>(null) }
    var fluidDensity by remember { mutableStateOf(1000.0) }
    var immersionFraction by remember { mutableFloatStateOf(0.5f) }
    var dropRun by remember { mutableStateOf<NativeDropResult?>(null) }
    var dropEntityId by remember { mutableStateOf<String?>(null) }
    var dropFrame by remember { mutableIntStateOf(0) }
    var dropPlaying by remember { mutableStateOf(false) }
    var dropSpeed by remember { mutableFloatStateOf(1f) }
    var motorResult by remember { mutableStateOf<NativeActuatorResult?>(null) }
    var wiredMotor by remember { mutableStateOf<NativeLabNetworkMotorRun?>(null) }
    var motorAudit by remember { mutableStateOf<NativeActuatorNumericalAudit?>(null) }
    var motorEntityId by remember { mutableStateOf<String?>(null) }
    var motorFrame by remember { mutableIntStateOf(0) }
    var motorPlaying by remember { mutableStateOf(false) }
    var motorThermalEnabled by remember { mutableStateOf(false) }
    var motorSpeed by remember { mutableFloatStateOf(1f) }
    var warning by remember { mutableStateOf("") }
    var snapMeters by remember { mutableStateOf(0.5) }
    var measurementTargetIndex by remember { mutableIntStateOf(0) }
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
    fun applyProjectEdit(transform:(String)->String){
        runCatching {
            val previous=projectJson?:error("Create or import a project first.")
            val next=transform(previous)
            val parsed=NativeWorldLabProjectCodec.decode(next)
            projectJson=next
            project=parsed
            dcRun=null;wiredMotor=null;hydroRun=null
            selected=selected.coerceIn(0,(parsed.entities.size-1).coerceAtLeast(0))
            warning=""
        }.onFailure{warning=it.message?:"Project edit failed; previous project retained."}
    }
    fun newProject(){
        runCatching {
            val json=NativeWorldLabEditor.blank()
            val parsed=NativeWorldLabProjectCodec.decode(json)
            project=parsed;projectJson=json;savedSnapshot=null;selected=0;warning=""
        }.onFailure{warning=it.message?:"Could not create a World Lab project."}
    }
    fun loadSavedProject(){
        scope.launch {
            runCatching { withContext(Dispatchers.IO){localProjects.loadLatest()} }
                .onSuccess { stored->
                    if(stored==null) warning="There is no saved World Lab project on this device."
                    else {
                        projectJson=stored.json;project=NativeWorldLabProjectCodec.decode(stored.json)
                        savedSnapshot=stored.json;selected=0;warning=""
                    }
                }.onFailure{warning=it.message?:"The saved project could not be recovered safely."}
        }
    }
    fun askReplace(action:String){
        if(projectJson!=null && savedSnapshot!=projectJson) confirmation=action
        else when(action){
            "new"->newProject()
            "open"->loadSavedProject()
            "import"->requestImport=true
        }
    }
    val exportPicker=rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if(uri!=null){
            val json=projectJson
            if(json!=null)scope.launch {
                runCatching {
                    withContext(Dispatchers.IO){
                        val bytes=json.toByteArray(Charsets.UTF_8)
                        require(bytes.size<=NativeWorldLabProjectCodec.MAX_BYTES)
                        context.contentResolver.openOutputStream(uri,"wt")?.use{
                            it.write(bytes);it.flush()
                        }?:error("Could not open an export destination.")
                    }
                }.onSuccess{warning=""}
                    .onFailure{warning=it.message?:"Project export failed."}
            }
        }
    }
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
                val json=out.toString(Charsets.UTF_8.name())
                Pair(json,NativeWorldLabProjectCodec.decode(json))
            } }.onSuccess { projectJson=it.first;project=it.second;selected=0;warning="" }
                .onFailure { warning=it.message?:"Unable to inspect this project." }
        }
    }
    LaunchedEffect(projectJson) {
        // Edited/imported geometry and materials invalidate earlier hypothetical drop results.
        dropPlaying=false;dropRun=null;dropEntityId=null;dropFrame=0
        motorPlaying=false;motorResult=null;motorEntityId=null;motorFrame=0
    }
    LaunchedEffect(requestImport) {
        if(requestImport){
            requestImport=false
            picker.launch(arrayOf("application/json","text/plain","*/*"))
        }
    }
    LaunchedEffect(dropPlaying,dropSpeed,dropRun) {
        while(dropPlaying) {
            delay(40)
            val result=dropRun?:break
            val stride=kotlin.math.max(1,kotlin.math.round(0.04f*dropSpeed/result.stepSeconds).toInt())
            dropFrame=(dropFrame+stride).coerceAtMost(result.samples.lastIndex)
            if(dropFrame==result.samples.lastIndex)dropPlaying=false
        }
    }
    LaunchedEffect(motorPlaying,motorSpeed,motorResult) {
        while(motorPlaying) {
            delay(40)
            val result=motorResult?:break
            val stride=kotlin.math.max(1,kotlin.math.round(0.04f*motorSpeed/result.stepSeconds).toInt())
            motorFrame=(motorFrame+stride).coerceAtMost(result.samples.lastIndex)
            if(motorFrame==result.samples.lastIndex)motorPlaying=false
        }
    }
    LaunchedEffect(playing,speed) {
        while(playing) {
            delay(40)
            time=(time+0.04f*speed).coerceAtMost(12f)
            if(time>=12f)playing=false
        }
    }
    if(confirmation!=null) AlertDialog(
        onDismissRequest={confirmation=null},
        title={Text("Discard unsaved changes?")},
        text={Text("Your current unsaved project will be replaced. Save locally or export JSON first if you want to keep it.")},
        confirmButton={TextButton(onClick={
            val choice=confirmation;confirmation=null
            when(choice){
                "new"->newProject()
                "open"->loadSavedProject()
                "import"->requestImport=true
            }
        }){Text("Discard and continue")}},
        dismissButton={TextButton(onClick={confirmation=null}){Text("Keep editing")}}
    )
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
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
            Button(onClick={askReplace("new")}){Text("New project")}
            OutlinedButton(onClick={projectJson?.let{exportPicker.launch("world-lab-project.json")}},
                enabled=projectJson!=null){Text("Export JSON")}
        }
        OutlinedButton(onClick={askReplace("import")}) {
            Text("Import World Lab project JSON")
        }
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            Button(onClick={
                val json=projectJson
                if(json!=null)scope.launch{
                    runCatching { withContext(Dispatchers.IO){localProjects.save(json)} }
                        .onSuccess{savedSnapshot=json;warning=""}
                        .onFailure{warning=it.message?:"Could not save the project locally."}
                }
            },enabled=projectJson!=null){Text("Save locally")}
            OutlinedButton(onClick={askReplace("open")}){Text("Open last saved")}
        }
        if(projectJson!=null && savedSnapshot!=projectJson)
            Text("Unsaved changes on this device. Export JSON or Save locally to preserve this project.",
                style=MaterialTheme.typography.bodySmall)
        if(project!=null){
            Text(project!!.title+" · "+project!!.entities.size+" solids",style=MaterialTheme.typography.titleSmall)
            Text("Connected DC circuits",style=MaterialTheme.typography.titleSmall)
            if(project!!.networks.isEmpty()){
                OutlinedButton(onClick={applyProjectEdit{NativeWorldLabEditor.addStarterCircuit(it)}}){
                    Text("Build first circuit")
                }
            }else{
                val net=project!!.networks.first()
                Text(net.name+" · "+net.components.size+" wired parts")
                Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    OutlinedButton(onClick={applyProjectEdit{
                        NativeWorldLabEditor.addParallelCircuitResistor(it)
                    }},enabled=net.components.size<48){
                        Text("Add parallel resistor")
                    }
                    OutlinedButton(onClick={
                        runCatching{dcRun=NativeWorldLabDc.solve(net,project!!);warning=""}
                            .onFailure{dcRun=null;warning=it.message?:"Circuit not solvable"}
                    }){Text("Calculate circuit")}
                }
                OutlinedTextField(value=deviceName,onValueChange={deviceName=it},
                    label={Text("Invented electrical component name")},singleLine=true)
                OutlinedTextField(value=deviceAssumption,onValueChange={deviceAssumption=it},
                    label={Text("Unverified behavior assumption")},singleLine=true)
                OutlinedTextField(value=deviceResistance,onValueChange={deviceResistance=it},
                    label={Text("Optional assumed resistance Ω")},singleLine=true)
                OutlinedButton(onClick={
                    runCatching{
                        val ohms=if(deviceResistance.isBlank())null else
                            deviceResistance.toDoubleOrNull()?:error("Enter a valid assumed resistance")
                        applyProjectEdit{NativeWorldLabEditor.inventOhmicDevice(
                            it,deviceName,deviceAssumption,ohms)}
                        deviceName="";deviceAssumption="";deviceResistance=""
                    }.onFailure{warning=it.message?:"Device cannot be added"}
                },enabled=net.components.size<48&&deviceName.isNotBlank()&&
                    deviceAssumption.isNotBlank()){
                    Text("Add hypothetical component")
                }
                Text("A new material has no electrical law unless you explicitly assume one.",
                    style=MaterialTheme.typography.bodySmall)
                Text("Connect more parts and wires",style=MaterialTheme.typography.titleSmall)
                OutlinedTextField(value=junctionName,onValueChange={junctionName=it},
                    label={Text("New junction name")},singleLine=true)
                OutlinedButton(onClick={
                    applyProjectEdit{NativeWorldLabEditor.addCircuitNode(it,junctionName)}
                    junctionName=""
                },enabled=junctionName.isNotBlank()&&net.nodes.size<24){
                    Text("Add wire junction")
                }
                net.nodes.forEach{node->
                    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        Text(node.label,modifier=Modifier.weight(1f))
                        OutlinedButton(onClick={applyProjectEdit{
                            NativeWorldLabEditor.removeUnusedCircuitNode(it,node.id)
                        }},enabled=net.nodes.size>2&&node.id!=net.groundNodeId&&
                            net.components.none{
                                it.positiveNodeId==node.id||it.negativeNodeId==node.id
                            }){Text("Remove unused")}
                    }
                }
                fun cycleWire(current:String,exclude:String):String{
                    val candidates=net.nodes.map{it.id}.filter{it!=exclude}
                    val pos=candidates.indexOf(current)
                    return candidates[(pos+1).coerceAtLeast(0)%candidates.size]
                }
                Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                    OutlinedButton(onClick={
                        positiveWire=cycleWire(positiveWire,negativeWire)
                    }){Text("From: "+(net.nodes.firstOrNull{it.id==positiveWire}?.label?:"Choose"))}
                    OutlinedButton(onClick={
                        negativeWire=cycleWire(negativeWire,positiveWire)
                    }){Text("To: "+(net.nodes.firstOrNull{it.id==negativeWire}?.label?:"Choose"))}
                }
                OutlinedButton(onClick={applyProjectEdit{
                    NativeWorldLabEditor.addCircuitResistor(it,positiveWire,negativeWire)
                }},enabled=net.components.size<48&&positiveWire!=negativeWire&&
                    net.nodes.any{it.id==positiveWire}&&net.nodes.any{it.id==negativeWire}){
                    Text("Connect 200 Ω resistor")
                }
                net.components.forEach{part->
                    Text((if(part.kind=="dc-source")"Source" else part.name?:part.kind)+
                        " · "+part.positiveNodeId+" → "+part.negativeNodeId,
                        style=MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
                        OutlinedButton(onClick={applyProjectEdit{
                            NativeWorldLabEditor.rewireCircuitPart(it,part.id,
                                cycleWire(part.positiveNodeId,part.negativeNodeId),
                                part.negativeNodeId)
                        }}){Text("Change from")}
                        OutlinedButton(onClick={applyProjectEdit{
                            NativeWorldLabEditor.rewireCircuitPart(it,part.id,
                                part.positiveNodeId,
                                cycleWire(part.negativeNodeId,part.positiveNodeId))
                        }}){Text("Change to")}
                    }
                }
                net.components.filter{it.kind=="dc-source"||it.kind=="resistor"}.forEach{part->
                    Text((if(part.kind=="dc-source")"Voltage: " else "Resistance: ")+
                        labNumber(part.voltageV?:part.resistanceOhm)+
                        (if(part.kind=="dc-source")" V" else " Ω"))
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                        val step=if(part.kind=="dc-source")1.0 else 10.0
                        OutlinedButton(onClick={applyProjectEdit{
                            NativeWorldLabEditor.adjustCircuitComponent(it,part.id,-step)
                        }}){Text("−")}
                        OutlinedButton(onClick={applyProjectEdit{
                            NativeWorldLabEditor.adjustCircuitComponent(it,part.id,step)
                        }}){Text("+")}
                        if(part.kind=="resistor"){
                            OutlinedButton(onClick={applyProjectEdit{
                                NativeWorldLabEditor.removeCircuitComponent(it,part.id)
                            }}){Text("Remove")}
                        }
                    }
                }
                net.components.filter{it.kind=="hypothetical-device"}.forEach{invented->
                    Text(invented.name.orEmpty()+
                        (invented.assumedResistanceOhm?.let{" — assumed "+labNumber(it)+" Ω"}
                            ?:" — unknown electrical law"),
                        style=MaterialTheme.typography.bodySmall)
                }
                dcRun?.takeIf{it.projectId==project!!.id &&
                    it.projectRevision==project!!.revision && it.networkId==net.id}?.let{result->
                    Text("Delivered DC power: "+labNumber(result.deliveredPowerW)+" W")
                    Text("Resistor heat: "+labNumber(result.resistorHeatW)+" W")
                    Text("Power residual: "+labNumber(result.powerResidualW)+" W")
                    result.branchCurrentsA.forEach{(id,current)->
                        Text(id+": "+labNumber(current)+" A")
                    }
                    Text(result.validity,style=MaterialTheme.typography.bodySmall)
                }
            }
            Row(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                listOf("box" to "Add cube","sphere" to "Add sphere","cylinder" to "Add cylinder")
                    .forEach { (shape,label) ->
                        OutlinedButton(onClick={applyProjectEdit { NativeWorldLabEditor.addSolid(it,shape) }},
                            enabled=project!!.entities.size<200,modifier=Modifier.weight(1f)){
                            Text(label)
                        }
                    }
            }
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
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    OutlinedButton(onClick={
                        val scaled=solid.dimensionsMeters.let{listOf(it.x,it.y,it.z)}.map{(it*0.9).coerceAtLeast(0.001)}
                        applyProjectEdit{NativeWorldLabEditor.resizeSolid(it,solid.id,scaled)}
                    }){Text("Smaller")}
                    OutlinedButton(onClick={
                        val scaled=solid.dimensionsMeters.let{listOf(it.x,it.y,it.z)}.map{(it*1.1).coerceAtMost(10000.0)}
                        applyProjectEdit{NativeWorldLabEditor.resizeSolid(it,solid.id,scaled)}
                    }){Text("Larger")}
                }
                Text("Place with precision",style=MaterialTheme.typography.titleSmall)
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                    OutlinedButton(onClick={
                        snapMeters=when(snapMeters){0.1->0.5;0.5->1.0;1.0->5.0;else->0.1}
                    }){Text("Grid "+labNumber(snapMeters)+" m")}
                    OutlinedButton(onClick={
                        applyProjectEdit{NativeWorldLabEditor.snapSolid(it,solid.id,snapMeters)}
                    }){Text("Snap center")}
                }
                val alternatives=project!!.entities.filter{it.id!=solid.id}
                if(alternatives.isNotEmpty()){
                    val target=alternatives[measurementTargetIndex%alternatives.size]
                    OutlinedButton(onClick={
                        measurementTargetIndex=(measurementTargetIndex+1)%alternatives.size
                    }){Text("Measure to: "+target.name+" (change)")}
                    val measured=NativeWorldLabEditor.measureCenters(project!!,solid.id,target.id)
                    Text("Center distance: "+labNumber(measured.centerDistanceM)+" m")
                    Text("Horizontal distance: "+labNumber(measured.horizontalDistanceM)+" m")
                    Text("Offset X/Y/Z: "+labNumber(measured.offsetXM)+" / "+
                        labNumber(measured.offsetYM)+" / "+labNumber(measured.offsetZM)+" m")
                    Text("Center distances are geometry only, not surface clearance.",
                        style=MaterialTheme.typography.bodySmall)
                }
                Text("Material: "+(material?.name?:"Unknown")+" (hypothetical)")
                Text("Assumed mass: "+labNumber(derivedMass)+" kg")
                Text("Try floating your invention",style=MaterialTheme.typography.titleSmall)
                Text("Assumed fluid density: "+labNumber(fluidDensity)+" kg/m³")
                Slider(value=fluidDensity.toFloat(),onValueChange={
                    fluidDensity=it.toDouble();hydroRun=null
                },valueRange=100f..2500f,
                    modifier=Modifier.semantics {contentDescription="Fluid density"})
                Text("Immersion: "+labNumber(immersionFraction.toDouble()*100)+"% of height")
                Slider(value=immersionFraction,onValueChange={
                    immersionFraction=it;hydroRun=null
                },valueRange=0f..1f,
                    modifier=Modifier.semantics {contentDescription="Fraction of solid submerged"})
                OutlinedButton(onClick={
                    runCatching{
                        hydroRun=NativeWorldLabHydrostatics.evaluate(project!!,solid.id,
                            fluidDensity,solid.dimensionsMeters.y*immersionFraction.toDouble())
                        warning=""
                    }.onFailure{hydroRun=null;warning=it.message?:"Fluid experiment failed"}
                }){Text("Calculate buoyancy")}
                hydroRun?.takeIf{it.projectId==project!!.id &&
                    it.projectRevision==project!!.revision && it.entityId==solid.id}?.let{fluid->
                    Text("Displaced liquid: "+labNumber(fluid.displacedVolumeM3)+" m³")
                    Text("Buoyancy force: "+labNumber(fluid.buoyancyForceN)+" N")
                    Text("Bottom pressure: "+labNumber(fluid.bottomGaugePressurePa)+" Pa")
                    Text("Status: "+fluid.status)
                    Text("Net upward force: "+labNumber(fluid.netUpwardForceN)+" N")
                    Text("Equilibrium draft: "+labNumber(fluid.equilibriumDraftM)+" m")
                    Text(fluid.validity,style=MaterialTheme.typography.bodySmall)
                }
                if(derivedMass!=null && derivedMass in 0.001..10000.0){
                    OutlinedButton(onClick={mass=derivedMass.toFloat();kind="spring";time=0f;playing=false}) {
                        Text("Test assumed mass as spring mass")
                    }
                    OutlinedButton(onClick={
                        runCatching {
                            val dimensions=solid.dimensionsMeters
                            val area=if(solid.shape=="box")dimensions.x*dimensions.z
                                else PI*dimensions.x*dimensions.z/4.0
                            val result=NativeWorldLabDropScience.evaluate(NativeDropInput(
                                massKg=derivedMass,supportingHalfHeightM=dimensions.y/2,
                                projectedAreaM2=area,
                                dragCoefficient=if(solid.shape=="sphere")0.47 else 1.05))
                            dropRun=result;dropEntityId=solid.id;dropFrame=0;dropPlaying=true;warning=""
                            playing=false
                        }.onFailure{warning=it.message?:"This drop test exceeded the supported model."}
                    }) { Text("Drop this solid") }
                    OutlinedButton(onClick={
                        motorThermalEnabled=!motorThermalEnabled
                        motorResult=null;motorAudit=null;motorPlaying=false
                    }) { Text(if(motorThermalEnabled)"Coil heating: on" else "Coil heating: off") }
                    OutlinedButton(onClick={
                        runCatching {
                            val input=NativeActuatorInput(massKg=derivedMass,
                                thermal=if(motorThermalEnabled)NativeActuatorThermal() else null)
                            val result=NativeWorldLabActuator.evaluate(input)
                            motorAudit=NativeWorldLabActuator.numericalAudit(input,result)
                            motorResult=result;wiredMotor=null;motorEntityId=solid.id;motorFrame=0;motorPlaying=true
                            dropPlaying=false;playing=false;warning=""
                        }.onFailure{warning=it.message?:"This powered mechanism is outside the local solver limits."}
                    }) { Text("Power this solid") }
                    if(project!!.networks.isNotEmpty()){
                        OutlinedButton(onClick={
                            runCatching{
                                val connected=NativeWorldLabNetworkMotor.evaluate(
                                    project!!,project!!.networks.first(),solid.id,
                                    derivedMass,motorThermalEnabled)
                                val sourceVoltage=project!!.networks.first().components
                                    .first{it.kind=="dc-source"}.voltageV?:0.0
                                val input=NativeActuatorInput(massKg=derivedMass,
                                    supplyVoltageV=sourceVoltage,
                                    thermal=if(motorThermalEnabled)NativeActuatorThermal() else null)
                                wiredMotor=connected;motorResult=connected.motor
                                motorAudit=NativeWorldLabActuator.numericalAudit(input,connected.motor)
                                motorEntityId=solid.id;motorFrame=0;motorPlaying=true
                                dropPlaying=false;playing=false;warning=""
                            }.onFailure{warning=it.message?:"Connected motor cannot be calculated."}
                        }){Text("Wire motor to circuit")}
                    }
                    if(motorEntityId==solid.id && motorResult!=null){
                        val run=checkNotNull(motorResult)
                        val sample=run.samples[motorFrame.coerceIn(0,run.samples.lastIndex)]
                        Canvas(Modifier.fillMaxWidth().height(100.dp)
                            .background(Color(0xFF16232B),RoundedCornerShape(12.dp))
                            .semantics { contentDescription="Calculated electromechanical lifting scene" }) {
                            val y=size.height*0.86f
                            val frac=(sample.heightM/4).coerceIn(0.0,1.0).toFloat()
                            drawLine(Color.LightGray,Offset(0f,y),Offset(size.width,y),strokeWidth=3f)
                            drawCircle(Color(0xFF69C3C3),size.minDimension*0.09f,
                                Offset(size.width/2,y-frac*size.height*0.72f))
                        }
                        Text("Electrical current: "+labNumber(sample.currentA)+" A")
                        Text("Powered height: "+labNumber(sample.heightM)+" m")
                        Text("Upward force: "+labNumber(sample.motorForceN)+" N")
                        Text("Back-EMF: "+labNumber(sample.backEmfV)+" V")
                        Text("Coil heating: "+labNumber(sample.resistiveHeatW)+" W")
                        sample.coilTemperatureK?.let{Text("Coil temperature: "+labNumber(it)+" K")}
                        sample.coilResistanceOhm?.let{Text("Hot resistance: "+labNumber(it)+" Ω")}
                        if(sample.coilTemperatureK!=null){
                            Text("Stored coil heat: "+labNumber(sample.thermalEnergyJ)+" J")
                            Text("Cooling: "+labNumber(sample.coolingPowerW)+" W")
                        }
                        Text("Energy balance residual: "+labNumber(sample.energyResidualJ)+" J")
                        wiredMotor?.takeIf{it.projectId==project!!.id &&
                            it.projectRevision==project!!.revision &&
                            it.entityId==solid.id}?.let{wired->
                            val observed=wired.samples[motorFrame.coerceIn(0,wired.samples.lastIndex)]
                            Text("Total DC source current: "+labNumber(observed.totalSourceCurrentA)+" A")
                            Text("Passive resistor heat: "+labNumber(observed.passiveResistorHeatW)+" W")
                            Text("Combined energy residual: "+labNumber(observed.combinedEnergyResidualJ)+" J")
                            Text(wired.validity,style=MaterialTheme.typography.bodySmall)
                        }
                        motorAudit?.let { audit ->
                            Text("Numerical self-check: "+audit.status+". "+audit.explanation)
                        }
                        Slider(value=motorFrame.toFloat(),onValueChange={
                            motorPlaying=false;motorFrame=it.toInt().coerceIn(0,run.samples.lastIndex)
                        },valueRange=0f..run.samples.lastIndex.toFloat(),
                            modifier=Modifier.semantics { contentDescription="Motor simulated time" })
                        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick={motorPlaying=!motorPlaying}) {
                                Text(if(motorPlaying)"Pause motor" else "Play motor")
                            }
                            OutlinedButton(onClick={motorPlaying=false;motorFrame=0}){Text("Reset motor")}
                        }
                        Text("Hypothetical values, coupled 1D coil and lift calculation. Not measured or certified.",
                            style=MaterialTheme.typography.bodySmall)
                    }
                    if(dropEntityId==solid.id && dropRun!=null) {
                        val drop=checkNotNull(dropRun)
                        val sample=drop.samples[dropFrame.coerceIn(0,drop.samples.lastIndex)]
                        Canvas(Modifier.fillMaxWidth().height(100.dp)
                            .background(Color(0xFF16232B),RoundedCornerShape(12.dp))
                            .semantics { contentDescription="Calculated vertical drop and ground contact" }) {
                            val floorY=size.height*0.85f
                            val fraction=(sample.heightAboveGroundM/5.0).coerceIn(0.0,1.0).toFloat()
                            drawLine(Color.LightGray,Offset(0f,floorY),Offset(size.width,floorY),strokeWidth=3f)
                            drawCircle(Color(0xFFF2B877),size.minDimension*0.08f,
                                Offset(size.width/2,floorY-fraction*size.height*0.7f))
                        }
                        Text("Computed drop height: "+labNumber(sample.heightAboveGroundM)+" m")
                        Text("Computed vertical speed: "+labNumber(kotlin.math.abs(sample.velocityMps))+" m/s")
                        Text("Estimated surface impacts: "+drop.impactCount)
                        Slider(value=dropFrame.toFloat(),onValueChange={
                            dropPlaying=false;dropFrame=it.toInt().coerceIn(0,drop.samples.lastIndex)
                        },valueRange=0f..drop.samples.lastIndex.toFloat(),
                            modifier=Modifier.semantics { contentDescription="Drop simulated time" })
                        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick={dropPlaying=!dropPlaying}){
                                Text(if(dropPlaying)"Pause drop" else "Play drop")
                            }
                            OutlinedButton(onClick={dropPlaying=false;dropFrame=0}){Text("Reset drop")}
                        }
                        Text("Simplified gravity, drag and flat-ground contact; assumed density, not verified strength.",
                            style=MaterialTheme.typography.bodySmall)
                    }
                }
            }
            OutlinedTextField(value=proposedName,onValueChange={proposedName=it},
                label={Text("Invented material name")},singleLine=true,
                modifier=Modifier.fillMaxWidth())
            OutlinedTextField(value=proposedDensity,onValueChange={proposedDensity=it},
                label={Text("Hypothetical density (kg/m³), or blank")},singleLine=true,
                modifier=Modifier.fillMaxWidth())
            Button(onClick={
                runCatching {
                    require(proposedName.isNotBlank()){"Name your invented material first."}
                    val density=proposedDensity.trim().takeIf{it.isNotEmpty()}?.toDouble()
                    val id=java.util.UUID.randomUUID().toString()
                    val edited=NativeWorldLabEditor.addHypotheticalMaterial(
                        requireNotNull(projectJson),proposedName,density,id=id)
                    val linked=solid?.let{NativeWorldLabEditor.assignMaterial(edited,it.id,id)}?:edited
                    projectJson=linked
                    project=NativeWorldLabProjectCodec.decode(linked)
                    proposedName="";proposedDensity="";warning=""
                }.onFailure{warning=it.message?:"Hypothetical material was not saved."}
            }){Text("Save invented material")}
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
