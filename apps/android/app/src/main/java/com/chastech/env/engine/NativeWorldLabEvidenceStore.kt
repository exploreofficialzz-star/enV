package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.AtomicMoveNotSupportedException
import java.time.Instant
import java.util.UUID

/** Private Android scientific history: 20 immutable evidence records per saved
 * invention, 2 MB per record. Scientific provenance is not reinterpreted. */
class NativeWorldLabEvidenceStore(private val root:File){
    private val base=File(root,"world-lab-science-v1")
    private fun id(s:String):String{
        require(s.matches(Regex("[A-Za-z0-9_-]{1,120}"))){"Invalid scientific record identifier"}
        return s
    }
    private fun folder(projectId:String)=File(base,id(projectId))
    private fun file(projectId:String,recordId:String)=
        File(folder(projectId),id(recordId)+".json")
    private fun validated(raw:String,expectedProject:String?=null):JSONObject{
        val bytes=raw.toByteArray(StandardCharsets.UTF_8)
        require(bytes.size<=2*1024*1024){"Scientific evidence exceeds 2 MB"}
        val record=JSONObject(raw)
        val allowed=setOf("id","projectId","projectRevision","createdAt","kind","result")
        require(record.length()==allowed.size&&
            record.keys().asSequence().all{it in allowed}){
            "Scientific evidence needs a complete strict portable envelope"}
        val recordId=id(record.getString("id"))
        val projectId=id(record.getString("projectId"))
        if(expectedProject!=null)require(projectId==expectedProject){
            "Scientific record belongs to another invention"}
        val revision=record.getInt("projectRevision")
        require(revision>=0){"Invalid scientific revision"}
        Instant.parse(record.getString("createdAt"))
        val kind=record.getString("kind")
        val result=record.getJSONObject("result")
        require(result.getString("projectId")==projectId&&
            result.getInt("projectRevision")==revision&&
            result.getString("modelVersion")=="1.0.0"&&
            result.getString("evidence")=="physics-model-computed"&&
            (result.optString("materialEvidence")== "hypothetical-user-assumed" ||
                result.optString("inputEvidence")=="hypothetical-user-assumed")&&
            result.getString("validity").length in 30..2000){
            "Scientific result does not match the saved hypothesis"}
        when(kind){
            "newton-gravity"->{
                require(result.getString("format")=="env-world-lab-newton-gravity"&&
                    result.getJSONArray("bodies").length() in 2..32&&
                    result.getJSONArray("frames").length() in 2..241){
                    "Invalid native gravity evidence dimensions"}
            }
            "material-heat"->{
                require(result.getString("format")=="env-world-lab-material-heat-transfer"&&
                    result.getJSONArray("samples").length()==121){
                    "Invalid native contact-heat evidence dimensions"}
            }
            "elastic-wave","thermal-radiation"->{
                NativeWorldLabExtendedEvidence.validate(kind,result)
            }
            "interface-optics","optical-scene-ray"->{
                NativeWorldLabOpticsEvidenceStore(root).validatePortableEnvelope(
                    raw,projectId)
            }
            else->error("Unknown invented scientific calculation kind")
        }
        require(recordId.isNotBlank()){"Missing evidence ID"}
        return record
    }
    private fun atomic(dest:File,bytes:ByteArray){
        require(dest.parentFile.isDirectory||dest.parentFile.mkdirs()){"Cannot create science history"}
        val temp=File.createTempFile(".world-lab-evidence-", ".tmp",dest.parentFile)
        try{
            FileOutputStream(temp).use{it.write(bytes);it.fd.sync()}
            try{
                Files.move(temp.toPath(),dest.toPath(),StandardCopyOption.ATOMIC_MOVE)
            }catch(_:AtomicMoveNotSupportedException){
                Files.move(temp.toPath(),dest.toPath())
            }
        }finally{temp.delete()}
    }
    fun validateEnvelope(raw:String,projectId:String):JSONObject=
        validated(raw,projectId)
    @Synchronized fun importRecord(projectId:String,record:JSONObject){
        val savedProject=NativeWorldLabProjectStore(root).read(projectId)
        val json=record.toString()
        val checked=validated(json,projectId)
        require(checked.getInt("projectRevision")<=savedProject.revision){
            "Scientific evidence is newer than the local invention"}
        val recordId=checked.getString("id")
        if(checked.getString("kind") in setOf("interface-optics","optical-scene-ray")){
            val optics=NativeWorldLabOpticsEvidenceStore(root)
            if(recordId in optics.list(projectId)){
                require(NativeWorldLabJsonEquality.same(JSONObject(optics.read(projectId,recordId)),checked)){
                    "A different immutable optical result already uses this ID"
                }
                return
            }
        }
        val dest=file(projectId,recordId)
        if(dest.isFile){
            val existing=read(projectId,checked.getString("id"))
            require(NativeWorldLabJsonEquality.same(existing,record)){
                "Immutable scientific evidence cannot replace a different record"}
            return
        }
        val dir=folder(projectId)
        val count=dir.listFiles()?.count{it.isFile&&it.extension=="json"}?:0
        val opticalCount=NativeWorldLabOpticsEvidenceStore(root).list(projectId).size
        require(count+opticalCount<20){
            "Combined scientific history has reached the 20-record limit"
        }
        atomic(dest,json.toByteArray(StandardCharsets.UTF_8))
    }
    @Synchronized fun save(project:NativeWorldLabProject,
        result:JSONObject):String{
        // A local saved project must exist before scientific evidence is committed.
        val previous=NativeWorldLabProjectStore(root).read(project.id)
        require(previous.revision>=project.revision){
            "Save the matching invention locally before preserving its evidence"}
        require(result.getString("projectId")==project.id&&
            result.getInt("projectRevision")==project.revision){
            "Scientific evidence must identify the exact calculated invention"}
        val recordId=UUID.randomUUID().toString()
        val kind=when(result.getString("format")){
            "env-world-lab-newton-gravity"->"newton-gravity"
            "env-world-lab-material-heat-transfer"->"material-heat"
            "env-world-lab-interface-optics"->"interface-optics"
            "env-world-lab-optical-scene-ray"->"optical-scene-ray"
            "env-world-lab-elastic-wave"->"elastic-wave"
            "env-world-lab-thermal-radiation"->"thermal-radiation"
            else->error("Unrecognized scientific evidence")
        }
        val envelope=JSONObject().put("id",recordId).put("projectId",project.id)
            .put("projectRevision",project.revision)
            .put("createdAt",Instant.now().toString())
            .put("kind",kind).put("result",result)
        val json=envelope.toString()
        validated(json,project.id)
        val dir=folder(project.id)
        val count=if(dir.isDirectory)
            dir.listFiles()?.count{it.isFile&&it.extension=="json"}?:0 else 0
        val opticalCount=NativeWorldLabOpticsEvidenceStore(root).list(project.id).size
        require(count+opticalCount<20){
            "Combined scientific device history is full (20 records)"
        }
        atomic(file(project.id,recordId),json.toByteArray(StandardCharsets.UTF_8))
        return recordId
    }
    @Synchronized fun read(projectId:String,recordId:String):JSONObject{
        val dest=file(projectId,recordId)
        require(dest.isFile&&dest.length()<=2*1024*1024){"Scientific record missing or too large"}
        val result=validated(dest.readText(StandardCharsets.UTF_8),projectId)
        require(result.getString("id")==recordId){"Scientific evidence file ID mismatch"}
        return result
    }
    @Synchronized fun list(projectId:String):List<JSONObject>{
        val dir=folder(projectId)
        if(!dir.isDirectory)return emptyList()
        val entries=dir.listFiles()?.filter{it.isFile&&it.extension=="json"}
            ?:error("Scientific record folder cannot be listed")
        require(entries.size<=20){"Science history exceeded the 20-record quota"}
        return entries.sortedByDescending{it.lastModified()}.map{
            read(projectId,it.name.removeSuffix(".json"))
        }
    }
    @Synchronized fun delete(projectId:String,recordId:String){
        read(projectId,recordId)
        require(file(projectId,recordId).delete()){"Could not discard saved evidence"}
    }
}
/** Shared evidence conversion; Android JSON representation is explicit,
 * platform-native and can be exchanged without JS serialization. */
object NativeWorldLabEvidenceJson {
    fun gravity(run:NativeGravityRun):JSONObject {
        fun vec(v:NativeLabVector)=JSONArray().put(v.x).put(v.y).put(v.z)
        return JSONObject().put("format","env-world-lab-newton-gravity")
            .put("modelVersion","1.0.0").put("evidence","physics-model-computed")
            .put("materialEvidence","hypothetical-user-assumed")
            .put("projectId",run.projectId).put("projectRevision",run.projectRevision)
            .put("durationSeconds",run.durationSeconds)
            .put("integrationSteps",run.integrationSteps)
            .put("gravitationalConstantM3KgS2",NativeWorldLabGravity.G)
            .put("energyDriftFraction",run.energyDriftFraction)
            .put("initialEnergyJ",run.initialEnergyJ).put("finalEnergyJ",run.finalEnergyJ)
            .put("initialMomentumKgMps",vec(run.frames.first().totalMomentumKgMps))
            .put("finalMomentumKgMps",vec(run.frames.last().totalMomentumKgMps))
            .put("validity",run.validity)
            .put("bodies",JSONArray().apply{run.bodies.forEach{body->
                put(JSONObject().put("entityId",body.entityId)
                    .put("materialId",body.materialId)
                    .put("massKg",body.massKg).put("radiusM",body.radiusM)
                    .put("initialPositionM",vec(body.initialPositionM))
                    .put("initialVelocityMps",vec(body.initialVelocityMps)))
            }})
            .put("frames",JSONArray().apply{run.frames.forEach{frame->
                put(JSONObject().put("timeSeconds",frame.timeSeconds)
                    .put("positionsM",JSONArray().apply{
                        frame.positionsM.forEach{put(vec(it))}
                    }).put("velocitiesMps",JSONArray().apply{
                        frame.velocitiesMps.forEach{put(vec(it))}
                    }).put("totalEnergyJ",frame.totalEnergyJ)
                    .put("energyDriftJ",frame.energyDriftJ)
                    .put("totalMomentumKgMps",vec(frame.totalMomentumKgMps)))
            }})
    }
    fun heat(run:NativeMaterialHeatRun):JSONObject =
        JSONObject().put("format","env-world-lab-material-heat-transfer")
            .put("modelVersion","1.0.0").put("evidence","physics-model-computed")
            .put("materialEvidence","hypothetical-user-assumed")
            .put("projectId",run.projectId).put("projectRevision",run.projectRevision)
            .put("firstEntityId",run.firstEntityId).put("secondEntityId",run.secondEntityId)
            .put("firstMaterialId",run.firstMaterialId)
            .put("secondMaterialId",run.secondMaterialId)
            .put("firstThermalCapacityJPerK",run.firstCapacityJPerK)
            .put("secondThermalCapacityJPerK",run.secondCapacityJPerK)
            .put("conductanceWPerK",run.conductanceWPerK)
            .put("equilibriumTemperatureK",run.equilibriumTemperatureK)
            .put("durationSeconds",run.durationSeconds).put("validity",run.validity)
            .put("input",JSONObject().put("firstEntityId",run.firstEntityId)
                .put("secondEntityId",run.secondEntityId)
                .put("firstTemperatureK",run.initialFirstTemperatureK)
                .put("secondTemperatureK",run.initialSecondTemperatureK)
                .put("durationSeconds",run.durationSeconds))
            .put("samples",JSONArray().apply{run.samples.forEach{sample->
                put(JSONObject().put("timeSeconds",sample.timeSeconds)
                    .put("firstTemperatureK",sample.firstTemperatureK)
                    .put("secondTemperatureK",sample.secondTemperatureK)
                    .put("interfaceHeatFlowW",sample.interfaceHeatFlowW)
                    .put("energyResidualJ",sample.energyResidualJ))
            }})
}


/** Portable, typed, finite analytical evidence shared with the Android
 * project-archive importer. Never deserialize user code or trust solver claims. */
object NativeWorldLabExtendedEvidence {
    fun wave(run:NativeElasticWaveRun):JSONObject {
        val fields=JSONObject()
            .put("format",run.format).put("modelVersion",run.modelVersion)
            .put("projectId",run.projectId).put("projectRevision",run.projectRevision)
            .put("entityId",run.entityId).put("materialId",run.materialId)
            .put("evidence",run.evidence).put("inputEvidence",run.inputEvidence)
            .put("mode",run.mode).put("cycles",run.cycles)
            .put("amplitudeMeters",run.amplitudeMeters)
            .put("lengthMeters",run.lengthMeters).put("crossSectionM2",run.crossSectionM2)
            .put("assumedDensityKgM3",run.assumedDensityKgM3)
            .put("assumedYoungModulusPa",run.assumedYoungModulusPa)
            .put("frequencyHz",run.frequencyHz).put("waveSpeedMps",run.waveSpeedMps)
            .put("periodSeconds",run.periodSeconds)
            .put("durationSeconds",run.durationSeconds)
            .put("maximumStressPa",run.maximumStressPa)
            .put("totalEnergyJ",run.totalEnergyJ)
            .put("validity",run.validity)
        // Optional independently sampled displacement envelope is portable;
        // validation always recomputes exact coefficients from assumptions.
        val frames=JSONArray()
        for(i in 0..80){
            val s=run.sample(run.durationSeconds*i/80.0)
            frames.put(JSONObject()
                .put("timeSeconds",s.timeSeconds)
                .put("positionsMeters",JSONArray(s.positionsMeters))
                .put("displacementsMeters",JSONArray(s.displacementsMeters))
                .put("velocitiesMetersPerSecond",JSONArray(s.velocitiesMetersPerSecond))
                .put("stressesPa",JSONArray(s.stressesPa))
                .put("kineticEnergyJ",s.kineticEnergyJ)
                .put("strainEnergyJ",s.strainEnergyJ)
                .put("totalEnergyJ",s.totalEnergyJ))
        }
        return fields.put("frames",frames)
    }
    fun radiation(run:NativeRadiationRun):JSONObject {
        val fields=JSONObject()
            .put("format",run.format).put("modelVersion",run.modelVersion)
            .put("projectId",run.projectId).put("projectRevision",run.projectRevision)
            .put("entityId",run.entityId).put("materialId",run.materialId)
            .put("evidence",run.evidence).put("inputEvidence",run.inputEvidence)
            .put("initialTemperatureK",run.initialTemperatureK)
            .put("environmentTemperatureK",run.environmentTemperatureK)
            .put("emissivity",run.emissivity)
            .put("durationSeconds",run.durationSeconds)
            .put("massKg",run.massKg).put("areaM2",run.areaM2)
            .put("assumedDensityKgM3",run.assumedDensityKgM3)
            .put("assumedSpecificHeatJPerKgK",run.assumedSpecificHeatJPerKgK)
            .put("steps",run.steps)
            .put("validity",run.validity)
        val samples=JSONArray()
        for(s in run.samples){
            samples.put(JSONObject().put("timeSeconds",s.timeSeconds)
                .put("temperatureK",s.temperatureK)
                .put("netRadiatedPowerW",s.netRadiatedPowerW)
                .put("transferredEnergyJ",s.transferredEnergyJ)
                .put("internalThermalEnergyJ",s.internalThermalEnergyJ)
                .put("energyResidualJ",s.energyResidualJ))
        }
        return fields.put("samples",samples)
    }
    private fun number(source:JSONObject,key:String):Double {
        val value=source.opt(key)
        require(value is Number){"Expected finite numerical scientific evidence field: "+key}
        val result=value.toDouble()
        require(result.isFinite()){"Nonfinite scientific evidence field: "+key}
        return result
    }
    private fun close(a:Double,b:Double)=a.isFinite()&&b.isFinite()&&
        kotlin.math.abs(a-b)<=1e-7*kotlin.math.max(1.0,kotlin.math.abs(b))
    fun validate(kind:String,result:JSONObject) {
        require(result.getString("modelVersion")=="1.0.0"&&
            result.getString("evidence")=="physics-model-computed"&&
            result.getString("inputEvidence")=="hypothetical-user-assumed"&&
            result.getString("entityId").matches(Regex("[A-Za-z0-9_-]{1,120}"))&&
            result.getString("materialId").matches(Regex("[A-Za-z0-9_-]{1,120}"))){
            "Invalid invented scientific source identity"}
        when(kind){
            "elastic-wave"->{
                require(result.getString("format")=="env-world-lab-elastic-wave"){
                    "Incorrect stored wave format"}
                val mode=number(result,"mode")
                val cycles=number(result,"cycles")
                val length=number(result,"lengthMeters")
                val area=number(result,"crossSectionM2")
                val density=number(result,"assumedDensityKgM3")
                val modulus=number(result,"assumedYoungModulusPa")
                val amplitude=number(result,"amplitudeMeters")
                require(mode%1==0.0&&mode in 1.0..12.0&&cycles%1==0.0&&
                    cycles in 1.0..20.0&&length in 0.001..10000.0&&
                    area in 1e-10..1e8&&density in 0.001..1e9&&
                    modulus in 1.0..1e15&&amplitude>=1e-9&&
                    amplitude<=minOf(0.01,0.001*length/(Math.PI*mode))){
                    "Invented wave material or geometry is outside model bounds"}
                val predictedSpeed=kotlin.math.sqrt(modulus/density)
                val predictedFrequency=mode*predictedSpeed/(2*length)
                val predictedEnergy=0.25*density*area*length*
                    Math.pow(amplitude*2*Math.PI*predictedFrequency,2.0)
                val predictedStress=modulus*amplitude*Math.PI*mode/length
                require(predictedSpeed in 1e-6..1e6&&
                    close(number(result,"waveSpeedMps"),predictedSpeed)&&
                    close(number(result,"frequencyHz"),predictedFrequency)&&
                    close(number(result,"periodSeconds"),1/predictedFrequency)&&
                    close(number(result,"durationSeconds"),cycles/predictedFrequency)&&
                    close(number(result,"totalEnergyJ"),predictedEnergy)&&
                    close(number(result,"maximumStressPa"),predictedStress)){
                    "Stored wave result conflicts with its claimed material assumptions"}
            }
            "thermal-radiation"->{
                require(result.getString("format")=="env-world-lab-thermal-radiation"){
                    "Incorrect stored radiative format"}
                val start=number(result,"initialTemperatureK")
                val ambient=number(result,"environmentTemperatureK")
                val duration=number(result,"durationSeconds")
                val epsilon=number(result,"emissivity")
                val mass=number(result,"massKg")
                val area=number(result,"areaM2")
                val density=number(result,"assumedDensityKgM3")
                val specific=number(result,"assumedSpecificHeatJPerKgK")
                val steps=number(result,"steps")
                val heatCapacity=mass*specific
                require(start in 1.0..3000.0&&ambient in 1.0..3000.0&&
                    duration in 0.01..3600.0&&epsilon in 0.0..1.0&&
                    mass in 1e-9..1e15&&area in 1e-9..1e9&&
                    density in 0.001..1e9&&specific in 0.01..1e7&&
                    heatCapacity.isFinite()&&heatCapacity in 1e-9..1e20&&
                    steps%1==0.0&&steps in 120.0..20000.0){
                    "Invalid bounded radiative heat assumptions"}
                val samples=result.getJSONArray("samples")
                require(samples.length() in 2..122){"Unsupported radiative sample count"}
                var oldTime=Double.NEGATIVE_INFINITY
                var oldTemperature=start
                for(i in 0 until samples.length()){
                    val frame=samples.getJSONObject(i)
                    val time=number(frame,"timeSeconds")
                    val temperature=number(frame,"temperatureK")
                    val power=number(frame,"netRadiatedPowerW")
                    val transferred=number(frame,"transferredEnergyJ")
                    val stored=number(frame,"internalThermalEnergyJ")
                    val residual=number(frame,"energyResidualJ")
                    val expected=heatCapacity*(start-temperature)
                    val radiation=epsilon*NativeWorldLabRadiation.SIGMA*area*
                        (Math.pow(temperature,4.0)-Math.pow(ambient,4.0))
                    require(time>=0&&time>=oldTime&&time<=duration+1e-7&&
                        temperature>=minOf(start,ambient)-1e-6&&
                        temperature<=maxOf(start,ambient)+1e-6&&
                        (if(start<ambient)temperature>=oldTemperature-1e-6
                         else temperature<=oldTemperature+1e-6)&&
                        close(power,radiation)&&close(stored,heatCapacity*temperature)&&
                        close(residual,expected-transferred)&&
                        kotlin.math.abs(residual)<=1e-7*maxOf(1.0,kotlin.math.abs(expected))){
                        "Stored radiative curve violates the assumed energy ledger"}
                    oldTime=time;oldTemperature=temperature
                }
                require(close(number(samples.getJSONObject(0),"timeSeconds"),0.0)&&
                    close(oldTime,duration)){
                    "Radiative evidence must cover the complete model duration"}
            }
            else->error("Unknown invented scientific computation")
        }
    }
}

/** Structural JSON identity for immutable scientific records. Android's org.json
 * has no JSONObject.similar method. Compare keys and nested values independent
 * of field insertion order; numeric 1 and 1.0 are equivalent.
 */
internal object NativeWorldLabJsonEquality {
    fun same(a:Any?,b:Any?,depth:Int=0):Boolean {
        if(depth>40)return false
        if(a==null||a==org.json.JSONObject.NULL)return b==null||b==org.json.JSONObject.NULL
        if(b==null||b==org.json.JSONObject.NULL)return false
        if(a is org.json.JSONObject&&b is org.json.JSONObject){
            if(a.length()!=b.length())return false
            val keys=a.keys().asSequence().toSet()
            if(keys!=b.keys().asSequence().toSet())return false
            return keys.all{key->same(a.opt(key),b.opt(key),depth+1)}
        }
        if(a is org.json.JSONArray&&b is org.json.JSONArray){
            if(a.length()!=b.length())return false
            return (0 until a.length()).all{i->same(a.opt(i),b.opt(i),depth+1)}
        }
        if(a is Number&&b is Number){
            return runCatching{
                java.math.BigDecimal(a.toString())
                    .compareTo(java.math.BigDecimal(b.toString()))==0
            }.getOrDefault(false)
        }
        return a==b
    }
}
