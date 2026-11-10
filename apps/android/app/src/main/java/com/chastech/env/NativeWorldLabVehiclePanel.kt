package com.chastech.env

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.chastech.env.engine.NativeWorldLabProject
import com.chastech.env.engine.NativeWorldLabVehicle
import com.chastech.env.engine.NativeWorldLabVehicleInput
import com.chastech.env.engine.NativeWorldLabVehicleRun
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.Locale

private fun NativeWorldLabVehicleRun.toEvidenceJson():String {
    val samples=JSONArray()
    this.samples.forEach { s ->
        samples.put(JSONObject().put("timeSeconds",s.timeSeconds).put("distanceMeters",s.distanceMeters)
            .put("altitudeMeters",s.altitudeMeters).put("horizontalSpeedMps",s.horizontalSpeedMps)
            .put("verticalSpeedMps",s.verticalSpeedMps).put("wheelDriveForceN",s.wheelDriveForceN)
            .put("cruiseThrustN",s.cruiseThrustN).put("rotorThrustN",s.rotorThrustN)
            .put("wingLiftN",s.wingLiftN).put("dragN",s.dragN).put("normalForceN",s.normalForceN)
            .put("loadFactor",s.loadFactor).put("batteryCurrentA",s.batteryCurrentA)
            .put("terminalVoltageV",s.terminalVoltageV).put("batteryPowerW",s.batteryPowerW)
            .put("batterySoc",s.batterySoc).put("batteryTemperatureK",s.batteryTemperatureK)
            .put("motorTemperatureK",s.motorTemperatureK).put("airborne",s.airborne)
            .put("powerLimited",s.powerLimited).put("motorAvailable",s.motorAvailable)
            .put("energyUsedWh",s.energyUsedWh))
    }
    return JSONObject().put("format","env-world-lab-native-vehicle-run-v1")
        .put("projectId",projectId).put("projectRevision",projectRevision).put("runId",runId)
        .put("modelVersion","1.0.0").put("evidence","physics-model-computed")
        .put("outcome",outcome).put("validity",validity)
        .put("preflight",JSONArray(preflight)).put("events",JSONArray(events))
        .put("failureReasons",JSONArray(failureReasons))
        .put("input",JSONObject().put("mode",input.mode).put("massKg",input.massKg)
            .put("frontalAreaM2",input.frontalAreaM2).put("dragCoefficient",input.dragCoefficient)
            .put("airDensityKgM3",input.airDensityKgM3).put("tireFriction",input.tireFriction)
            .put("batteryVoltageV",input.batteryVoltageV).put("batteryMaxCurrentA",input.batteryMaxCurrentA)
            .put("batteryCapacityWh",input.batteryCapacityWh).put("driveThrottle",input.driveThrottle)
            .put("rotorDiskAreaM2",input.rotorDiskAreaM2).put("rotorMaxThrustN",input.rotorMaxThrustN)
            .put("wingAreaM2",input.wingAreaM2).put("wingLiftCoefficient",input.wingLiftCoefficient)
            .put("takeoffSpeedMps",input.takeoffSpeedMps))
        .put("samples",samples).toString(2)
}

@Composable
fun NativeWorldLabVehiclePanel(project:NativeWorldLabProject,onProblem:(String)->Unit) {
    val context=LocalContext.current
    val scope=rememberCoroutineScope()
    var mode by remember { mutableStateOf("road-only") }
    var mass by remember { mutableStateOf("1200") }
    var drive by remember { mutableFloatStateOf(0.8f) }
    var duration by remember { mutableStateOf("20") }
    var rotorArea by remember { mutableStateOf("15") }
    var rotorThrust by remember { mutableStateOf("10000") }
    var rotorThrottle by remember { mutableFloatStateOf(0.85f) }
    var wingArea by remember { mutableStateOf("18") }
    var wingLift by remember { mutableStateOf("1.4") }
    var takeoffSpeed by remember { mutableStateOf("28") }
    var cruiseThrust by remember { mutableStateOf("1800") }
    var result by remember { mutableStateOf<NativeWorldLabVehicleRun?>(null) }
    var time by remember { mutableFloatStateOf(0f) }
    var status by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val export=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if(uri!=null) runCatching {
            val run=result?:throw IllegalStateException("No vehicle result is ready to export.")
            context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(run.toEvidenceJson()) }
                ?:throw IllegalStateException("Could not write the selected evidence file.")
            status="Native vehicle evidence exported."
        }.onFailure { status=it.message ?: "Vehicle evidence export failed." }
    }
    val active=result?.takeIf { it.projectId==project.id && it.projectRevision==project.revision }
    val sample=active?.let {
        val idx=(time.toDouble()/it.input.durationSeconds*(it.samples.size-1)).toInt().coerceIn(0,it.samples.lastIndex)
        it.samples[idx]
    }
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Text("Build, run and diagnose a vehicle",style=MaterialTheme.typography.titleMedium)
        LabNote("Independent Kotlin reference model. All vehicle, material, motor and battery inputs are inventor assumptions; this is not flight certification.")
        Row(horizontalArrangement=Arrangement.spacedBy(6.dp)) {
            listOf("road-only","rotorcraft","fixed-wing").forEach { value ->
                OutlinedButton(onClick={
                    mode=value
                    result=null;time=0f
                    if(value!="road-only"&&cruiseThrust=="0")cruiseThrust="1800"
                }) { Text(when(value){"road-only"->"Road";"rotorcraft"->"Rotorcraft";else->"Fixed wing"}) }
            }
        }
        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(mass,{mass=it;result=null},label={Text("Mass (kg)")},modifier=Modifier.weight(1f),singleLine=true)
            OutlinedTextField(duration,{duration=it;result=null},label={Text("Duration (s)")},modifier=Modifier.weight(1f),singleLine=true)
        }
        Text("Drive throttle: "+(drive*100).toInt()+"%")
        Slider(value=drive,onValueChange={drive=it;result=null},valueRange=0f..1f)
        if(mode=="rotorcraft") {
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(rotorArea,{rotorArea=it;result=null},label={Text("Rotor disk area (m²)")},modifier=Modifier.weight(1f),singleLine=true)
                OutlinedTextField(rotorThrust,{rotorThrust=it;result=null},label={Text("Maximum thrust (N)")},modifier=Modifier.weight(1f),singleLine=true)
            }
            Text("Rotor throttle: "+(rotorThrottle*100).toInt()+"%")
            Slider(value=rotorThrottle,onValueChange={rotorThrottle=it;result=null},valueRange=0f..1f)
        }
        if(mode=="fixed-wing") {
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(wingArea,{wingArea=it;result=null},label={Text("Wing area (m²)")},modifier=Modifier.weight(1f),singleLine=true)
                OutlinedTextField(wingLift,{wingLift=it;result=null},label={Text("Lift coefficient")},modifier=Modifier.weight(1f),singleLine=true)
            }
            OutlinedTextField(takeoffSpeed,{takeoffSpeed=it;result=null},label={Text("Takeoff speed (m/s)")},modifier=Modifier.fillMaxWidth(),singleLine=true)
        }
        if(mode!="road-only") OutlinedTextField(cruiseThrust,{cruiseThrust=it;result=null},label={Text("Horizontal cruise thrust (N)")},modifier=Modifier.fillMaxWidth(),singleLine=true)
        Button(enabled=!busy,onClick={
            val input=runCatching {
                NativeWorldLabVehicleInput(
                    mode=mode,massKg=mass.toDouble(),driveThrottle=drive.toDouble(),durationSeconds=duration.toDouble(),
                    rotorDiskAreaM2=if(mode=="rotorcraft")rotorArea.toDouble() else null,
                    rotorMaxThrustN=if(mode=="rotorcraft")rotorThrust.toDouble() else null,
                    rotorThrottle=rotorThrottle.toDouble(),
                    wingAreaM2=if(mode=="fixed-wing")wingArea.toDouble() else null,
                    wingLiftCoefficient=if(mode=="fixed-wing")wingLift.toDouble() else null,
                    takeoffSpeedMps=if(mode=="fixed-wing")takeoffSpeed.toDouble() else null,
                    maxCruiseThrustN=if(mode=="road-only")0.0 else cruiseThrust.toDouble()
                )
            }
            input.onFailure { status=it.message ?: "Enter valid vehicle assumptions." }
            input.getOrNull()?.let { chosen ->
                busy=true;result=null;status="Running native vehicle experiment…"
                scope.launch {
                    val computed=withContext(Dispatchers.Default) {
                        runCatching { NativeWorldLabVehicle.evaluate(project.id,project.revision,UUID.randomUUID().toString(),chosen) }
                    }
                    computed.fold({run->result=run;time=0f;status="Native run complete: "+run.outcome},
                        {failure->status=failure.message ?: "Vehicle calculation failed."})
                    busy=false
                }
            }
        }) { Text(if(busy)"Running…" else "Run native vehicle experiment") }
        if(status.isNotBlank()) Text(status,style=MaterialTheme.typography.bodySmall)
        active?.let { run ->
            Text("Preflight diagnostics",style=MaterialTheme.typography.titleSmall)
            run.preflight.forEach { Text(it,style=MaterialTheme.typography.bodySmall) }
            sample?.let { s ->
                Text("Recorded state · "+String.format(Locale.US,"%.2f s",s.timeSeconds),style=MaterialTheme.typography.titleSmall)
                Text("Speed "+String.format(Locale.US,"%.3f",s.horizontalSpeedMps)+" m/s · Altitude "+String.format(Locale.US,"%.3f",s.altitudeMeters)+" m · Lift "+String.format(Locale.US,"%.3f",s.rotorThrustN+s.wingLiftN)+" N",
                    style=MaterialTheme.typography.bodySmall)
                Text("Battery "+String.format(Locale.US,"%.3f",s.batteryCurrentA)+" A · "+String.format(Locale.US,"%.3f",s.terminalVoltageV)+" V · "+
                    (s.batterySoc*100).toInt()+"% · Motor "+String.format(Locale.US,"%.3f",s.motorTemperatureK)+" K",
                    style=MaterialTheme.typography.bodySmall)
                Slider(value=time,valueRange=0f..run.input.durationSeconds.toFloat(),
                    onValueChange={time=it})
            }
            run.events.forEach { Text(it,style=MaterialTheme.typography.bodySmall) }
            run.failureReasons.forEach { Text(it,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall) }
            OutlinedButton(onClick={export.launch("world-lab-native-vehicle-"+run.runId+".json")}) { Text("Export vehicle evidence JSON") }
            LabNote(run.validity)
        }
    }
}
