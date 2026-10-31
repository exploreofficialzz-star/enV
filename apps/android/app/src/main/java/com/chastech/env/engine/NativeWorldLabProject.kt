package com.chastech.env.engine

import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.time.OffsetDateTime
import kotlin.math.PI

/**
 * Strict native Kotlin decoder for World Lab v1 interchange files.
 * This is not a physics solver or claim of full native authoring parity.
 */
data class NativeLabVector(val x: Double, val y: Double, val z: Double)
data class NativeLabMaterial(
    val id: String, val name: String, val densityKgM3: Double?,
    val youngModulusPa: Double?, val evidence: String,
)
data class NativeLabSolid(
    val id: String, val name: String, val shape: String, val positionMeters: NativeLabVector,
    val dimensionsMeters: NativeLabVector, val color: String, val materialId: String?,
    val scientificRole: String, val opacity: Double,
) {
    fun volumeMetersCubed(): Double = when (shape) {
        "box" -> dimensionsMeters.x * dimensionsMeters.y * dimensionsMeters.z
        "sphere" -> PI * dimensionsMeters.x * dimensionsMeters.x * dimensionsMeters.x / 6.0
        "cylinder" -> PI * dimensionsMeters.x * dimensionsMeters.z * dimensionsMeters.y / 4.0
        else -> error("Unsupported solid geometry")
    }
}
data class NativeLabCircuitNode(val id:String,val label:String)
data class NativeLabCircuitComponent(
    val id:String,val kind:String,val positiveNodeId:String,val negativeNodeId:String,
    val voltageV:Double?=null,val resistanceOhm:Double?=null,
    val name:String?=null,val assumption:String?=null,val evidence:String?=null,
    val assumedResistanceOhm:Double?=null
)
data class NativeLabCircuitNetwork(
    val id:String,val name:String,val groundNodeId:String,
    val nodes:List<NativeLabCircuitNode>,val components:List<NativeLabCircuitComponent>
)
data class NativeLabAssembly(
    val id:String,val name:String,val entityIds:List<String>
)
data class NativeLabDigitalInput(val id:String,val label:String,val value:Boolean)
data class NativeLabDigitalGate(val id:String,val name:String,val assumption:String,
    val inputNodeIds:List<String>,val truthTable:List<Int>,val evidence:String)
data class NativeLabDigitalOutput(val id:String,val label:String,val sourceNodeId:String)
data class NativeLabDigitalNetwork(val id:String,val name:String,
    val inputs:List<NativeLabDigitalInput>,val gates:List<NativeLabDigitalGate>,
    val outputs:List<NativeLabDigitalOutput>)
/** Deterministic Boolean truth-table evaluation; no real chip physics. */
object NativeWorldLabDigitalLogic {
    fun evaluate(n:NativeLabDigitalNetwork):Map<String,Int> {
        val state=n.inputs.associate{it.id to if(it.value)1 else 0}.toMutableMap()
        for(g in n.gates){
            var row=0
            for(id in g.inputNodeIds)row=row*2+requireNotNull(state[id])
            state[g.id]=g.truthTable[row]
        }
        return n.outputs.associate{it.id to requireNotNull(state[it.sourceNodeId])}
    }
}

data class NativeWorldLabProject(
    val id: String, val title: String, val revision: Int, val createdAt: String,
    val updatedAt: String, val cameraPositionMeters: NativeLabVector,
    val cameraLookingAtMeters: NativeLabVector, val entities: List<NativeLabSolid>,
    val materials: List<NativeLabMaterial>,
    val networks: List<NativeLabCircuitNetwork> = emptyList(),
    val assemblies:List<NativeLabAssembly> = emptyList(),
    val digitalNetworks:List<NativeLabDigitalNetwork> = emptyList(),
)
object NativeWorldLabProjectCodec {
    const val MAX_BYTES=1024*1024
    private val validId=Regex("[A-Za-z0-9_-]{1,120}")
    private val validHex=Regex("#[A-Fa-f0-9]{6}")
    private fun keys(o: JSONObject, names: Set<String>) {
        require(o.keys().asSequence().toSet()==names) { "Unexpected or missing World Lab JSON fields" }
    }
    private fun name(o: JSONObject, field: String, limit: Int=120): String {
        val s=o.get(field) as? String ?: error("$field must be a string")
        require(s.isNotBlank() && s.length<=limit)
        return s
    }
    private fun id(o: JSONObject, field: String): String {
        val s=name(o,field)
        require(validId.matches(s))
        return s
    }
    private fun number(o: JSONObject, field: String, min: Double, max: Double): Double {
        val n=(o.get(field) as? Number)?.toDouble() ?: error("$field must be a numeric value")
        require(n.isFinite() && n>=min && n<=max) { "Invalid $field" }
        return n
    }
    private fun optionalNumber(o: JSONObject, field: String, min: Double, max: Double): Double? =
        if(o.isNull(field)) null else number(o,field,min,max)
    private fun vector(array: JSONArray, positive: Boolean=false): NativeLabVector {
        require(array.length()==3) { "A 3D vector needs exactly three numbers" }
        fun coordinate(i:Int): Double {
            val n=(array.get(i) as? Number)?.toDouble() ?: error("Vector coordinate must be numeric")
            require(n.isFinite() && (if(positive) n in 0.001..10000.0 else n in -100000.0..100000.0))
            return n
        }
        return NativeLabVector(coordinate(0),coordinate(1),coordinate(2))
    }
    fun decode(json: String): NativeWorldLabProject {
        require(json.toByteArray(StandardCharsets.UTF_8).size<=MAX_BYTES) { "World Lab project exceeds 1 MB" }
        val p=JSONObject(json)
        val essential=setOf("format","schemaVersion","id","title","revision","createdAt","updatedAt",
            "world","camera","entities","materials")
        val supplied=p.keys().asSequence().toSet()
        require(supplied.subtract(setOf("networks","assemblies","digitalNetworks"))==essential &&
            supplied.size<=essential.size+3) {
            "Unexpected World Lab project keys"
        }
        require(p.getString("format")=="env-world-lab" && p.getInt("schemaVersion")==1)
        val projectId=id(p,"id")
        val title=name(p,"title")
        val revision=number(p,"revision",0.0,1000000000.0)
        require(revision%1.0==0.0)
        val created=name(p,"createdAt",80);val updated=name(p,"updatedAt",80)
        require(!OffsetDateTime.parse(updated).isBefore(OffsetDateTime.parse(created)))
        val world=p.getJSONObject("world")
        keys(world,setOf("frame","representation","origin","terrainSource"))
        require(world.getString("frame")=="LOCAL_ENU")
        require(world.getString("representation")=="representative-not-measured")
        val origin=vector(world.getJSONArray("origin"))
        require(origin.x==0.0 && origin.y==0.0 && origin.z==0.0 && world.isNull("terrainSource"))
        val camera=p.getJSONObject("camera")
        keys(camera,setOf("positionMeters","lookingAtMeters"))
        val solidArray=p.getJSONArray("entities")
        val materialsArray=p.getJSONArray("materials")
        require(solidArray.length()<=200 && materialsArray.length()<=100)
        val materials=(0 until materialsArray.length()).map { i ->
            val o=materialsArray.getJSONObject(i)
            keys(o,setOf("id","name","densityKgM3","youngModulusPa","evidence"))
            require(o.getString("evidence")=="hypothetical-user-assumed")
            NativeLabMaterial(id(o,"id"),name(o,"name"),optionalNumber(o,"densityKgM3",0.001,1e9),
                optionalNumber(o,"youngModulusPa",0.0,1e15),o.getString("evidence"))
        }
        require(materials.map { it.id }.toSet().size==materials.size)
        val entities=(0 until solidArray.length()).map { i ->
            val o=solidArray.getJSONObject(i)
            keys(o,setOf("id","name","shape","positionMeters","dimensionsMeters","color",
                "materialId","scientificRole","opacity"))
            val shape=name(o,"shape")
            require(shape in setOf("box","sphere","cylinder"))
            val dim=vector(o.getJSONArray("dimensionsMeters"),positive=true)
            if(shape=="sphere") require(dim.x==dim.y && dim.y==dim.z)
            if(shape=="cylinder") require(dim.x==dim.z)
            val color=name(o,"color")
            require(validHex.matches(color))
            val materialId=if(o.isNull("materialId")) null else id(o,"materialId")
            val role=name(o,"scientificRole")
            require(role in setOf("visual-only","reference-solid"))
            NativeLabSolid(id(o,"id"),name(o,"name"),shape,vector(o.getJSONArray("positionMeters")),
                dim,color,materialId,role,number(o,"opacity",0.0,1.0))
        }
        require(entities.map { it.id }.toSet().size==entities.size)
        val materialIds=materials.map { it.id }.toSet()
        require(entities.all { it.materialId==null || it.materialId in materialIds })
        val networkArray=if(p.has("networks"))p.getJSONArray("networks") else JSONArray()
        require(networkArray.length()<=12){"Too many portable circuits"}
        val networks=(0 until networkArray.length()).map{i->
            val net=networkArray.getJSONObject(i)
            keys(net,setOf("id","name","groundNodeId","nodes","components"))
            val nodeArray=net.getJSONArray("nodes")
            val componentArray=net.getJSONArray("components")
            require(nodeArray.length() in 2..24 && componentArray.length() in 1..48)
            val nodes=(0 until nodeArray.length()).map{j->
                val o=nodeArray.getJSONObject(j)
                keys(o,setOf("id","label"))
                NativeLabCircuitNode(id(o,"id"),name(o,"label",80))
            }
            val nodeIds=nodes.map{it.id}.toSet()
            require(nodeIds.size==nodes.size)
            val ground=id(net,"groundNodeId")
            require(ground in nodeIds)
            val components=(0 until componentArray.length()).map{j->
                val comp=componentArray.getJSONObject(j)
                val kind=name(comp,"kind")
                val common=setOf("id","kind","positiveNodeId","negativeNodeId")
                val extras=when(kind){
                    "dc-source"->setOf("voltageV")
                    "resistor"->setOf("resistanceOhm")
                    "hypothetical-device"->setOf("name","assumption","evidence")
                    else->error("Unsupported electrical component type")
                }
                if(kind=="hypothetical-device" && comp.has("assumedResistanceOhm"))
                    keys(comp,common+extras+setOf("assumedResistanceOhm"))
                else keys(comp,common+extras)
                val from=id(comp,"positiveNodeId")
                val to=id(comp,"negativeNodeId")
                require(from in nodeIds && to in nodeIds && from!=to) {
                    "Circuit ports must reference two distinct existing nodes"
                }
                val voltage=if(kind=="dc-source")number(comp,"voltageV",-1000.0,1000.0) else null
                val resistance=if(kind=="resistor")number(comp,"resistanceOhm",0.01,1e9) else null
                val inventName=if(kind=="hypothetical-device")name(comp,"name") else null
                val assumption=if(kind=="hypothetical-device")name(comp,"assumption",500) else null
                val evidence=if(kind=="hypothetical-device")name(comp,"evidence") else null
                require(evidence==null||evidence=="hypothetical-user-assumed")
                val assumed=if(kind=="hypothetical-device" && comp.has("assumedResistanceOhm"))
                    number(comp,"assumedResistanceOhm",0.01,1e9) else null
                NativeLabCircuitComponent(id(comp,"id"),kind,from,to,
                    voltage,resistance,inventName,assumption,evidence,assumed)
            }
            require(components.map{it.id}.toSet().size==components.size)
            NativeLabCircuitNetwork(id(net,"id"),name(net,"name"),ground,nodes,components)
        }
        require(networks.map{it.id}.toSet().size==networks.size)
        val rawGroups=if(p.has("assemblies"))p.getJSONArray("assemblies") else JSONArray()
        require(rawGroups.length()<=50){"Portable assemblies exceed 50 groups"}
        val entitySet=entities.map{it.id}.toSet()
        val allMembers=mutableSetOf<String>()
        val groupIds=mutableSetOf<String>()
        val assemblies=(0 until rawGroups.length()).map{i->
            val group=rawGroups.getJSONObject(i)
            keys(group,setOf("id","name","entityIds"))
            val groupId=id(group,"id")
            require(groupIds.add(groupId)){"Duplicate assembly ID"}
            val title=name(group,"name")
            val rawMembers=group.getJSONArray("entityIds")
            require(rawMembers.length() in 2..30){"Assemblies require 2–30 existing solids"}
            val ids=(0 until rawMembers.length()).map{j->
                val identity=rawMembers.getString(j)
                require(validId.matches(identity)&&identity in entitySet){
                    "Assembly includes an unknown solid"
                }
                require(allMembers.add(identity)){
                    "One solid cannot belong to overlapping assemblies"
                }
                identity
            }
            NativeLabAssembly(groupId,title,ids)
        }
        val digitalArray=if(p.has("digitalNetworks"))p.getJSONArray("digitalNetworks") else JSONArray()
        require(digitalArray.length()<=8){"Too many digital networks"}
        val digitalNetworkIds=mutableSetOf<String>()
        val digital=(0 until digitalArray.length()).map{i->
            val n=digitalArray.getJSONObject(i)
            keys(n,setOf("id","name","inputs","gates","outputs"))
            val digitalId=id(n,"id")
            require(digitalNetworkIds.add(digitalId)){"Duplicate digital network"}
            val ins=n.getJSONArray("inputs");val gates=n.getJSONArray("gates")
            val outs=n.getJSONArray("outputs")
            require(ins.length() in 1..12 && gates.length() in 1..32 &&
                outs.length() in 1..16){"Invalid digital network capacity"}
            val used=mutableSetOf<String>();val known=mutableSetOf<String>()
            val inputs=(0 until ins.length()).map{j->
                val x=ins.getJSONObject(j)
                keys(x,setOf("id","label","value"))
                val key=id(x,"id")
                require(used.add(key)){"Duplicate digital input"}
                require(x.get("value") is Boolean){"Digital switch must be Boolean"}
                known.add(key)
                NativeLabDigitalInput(key,name(x,"label",80),x.getBoolean("value"))
            }
            val parts=(0 until gates.length()).map{j->
                val g=gates.getJSONObject(j)
                keys(g,setOf("id","name","assumption","inputNodeIds","truthTable","evidence"))
                val key=id(g,"id")
                require(used.add(key)){"Duplicate digital gate"}
                val origin=g.getJSONArray("inputNodeIds")
                require(origin.length() in 1..4){"Digital gate requires 1–4 inputs"}
                val wires=(0 until origin.length()).map{k->
                    val port=origin.getString(k)
                    require(port in known){"Missing or cyclic digital port"}
                    port
                }
                require(wires.toSet().size==wires.size){"Repeated digital gate port"}
                val truth=g.getJSONArray("truthTable")
                require(truth.length()==(1 shl wires.size)){"Incomplete digital truth table"}
                val table=(0 until truth.length()).map{k->
                    val b=truth.get(k)
                    require(b is Number && b.toDouble() in listOf(0.0,1.0)){
                        "Digital truth table permits only 0 and 1"
                    }
                    b.toInt()
                }
                require(g.getString("evidence")=="hypothetical-user-assumed")
                known.add(key)
                NativeLabDigitalGate(key,name(g,"name"),name(g,"assumption",500),
                    wires,table,"hypothetical-user-assumed")
            }
            val outputs=(0 until outs.length()).map{j->
                val o=outs.getJSONObject(j)
                keys(o,setOf("id","label","sourceNodeId"))
                val key=id(o,"id")
                require(used.add(key)){"Duplicate digital output"}
                val upstream=id(o,"sourceNodeId")
                require(upstream in known){"Digital output source is missing"}
                NativeLabDigitalOutput(key,name(o,"label",80),upstream)
            }
            NativeLabDigitalNetwork(digitalId,name(n,"name"),inputs,parts,outputs)
        }
        return NativeWorldLabProject(projectId,title,revision.toInt(),created,updated,
            vector(camera.getJSONArray("positionMeters")),
            vector(camera.getJSONArray("lookingAtMeters")),entities,materials,networks,assemblies,digital)
    }
}

/**
 * Native Kotlin nodal DC circuit solution with grounded nodes and ideal sources.
 * Internal units are SI. Does not claim to model any hypothetical device.
 */
data class NativeLabDcResult(
    val projectId:String,val projectRevision:Int,val networkId:String,
    val nodeVoltagesV:Map<String,Double>,val branchCurrentsA:Map<String,Double>,
    val networkSnapshot:NativeLabCircuitNetwork,
    val deliveredPowerW:Double,val resistorHeatW:Double,val powerResidualW:Double,
    val evidence:String="physics-model-computed",
    val validity:String="Ideal bounded linear DC sources and ohmic resistors; no transient or real material inference."
)
object NativeWorldLabDc {
    fun solve(network:NativeLabCircuitNetwork,project:NativeWorldLabProject):NativeLabDcResult {
        val ground=network.groundNodeId
        val nodes=network.nodes.map{it.id}.filter{it!=ground}
        val sources=network.components.filter{it.kind=="dc-source"}
        require(sources.isNotEmpty()&&sources.size<=12){"1–12 DC voltage sources are required"}
        val m=nodes.size+sources.size
        require(m in 1..36){"Circuit matrix exceeds local resource limits"}
        val index=nodes.withIndex().associate{it.value to it.index}
        fun node(id:String):Int=if(id==ground)-1 else index[id]?:error("Missing DC node")
        val a=Array(m){DoubleArray(m+1)}
        network.components.forEach{component->
            val positive=node(component.positiveNodeId)
            val negative=node(component.negativeNodeId)
            when(component.kind){
                "resistor","hypothetical-device"->{
                    val ohms=component.resistanceOhm?:component.assumedResistanceOhm
                        ?:error("Unknown invention needs an explicit supported Ohmic law")
                    val conductance=1.0/ohms
                    if(positive>=0)a[positive][positive]+=conductance
                    if(negative>=0)a[negative][negative]+=conductance
                    if(positive>=0&&negative>=0){
                        a[positive][negative]-=conductance
                        a[negative][positive]-=conductance
                    }
                }
                "dc-source"->{
                    val col=nodes.size+sources.indexOfFirst{it.id==component.id}
                    if(positive>=0){a[positive][col]+=1.0;a[col][positive]+=1.0}
                    if(negative>=0){a[negative][col]-=1.0;a[col][negative]-=1.0}
                    a[col][m]=requireNotNull(component.voltageV)
                }
                else->error("Unsupported DC component")
            }
        }
        val scale=maxOf(1.0,a.maxOf{row->row.copyOfRange(0,m).maxOf{kotlin.math.abs(it)}})
        for(col in 0 until m){
            var pivot=col
            for(row in col+1 until m)
                if(kotlin.math.abs(a[row][col])>kotlin.math.abs(a[pivot][col]))pivot=row
            require(kotlin.math.abs(a[pivot][col])>1e-12*scale){
                "DC circuit contains floating or contradictory nodes"
            }
            val tmp=a[col];a[col]=a[pivot];a[pivot]=tmp
            val divisor=a[col][col]
            for(j in col..m)a[col][j]/=divisor
            for(row in 0 until m){
                if(row==col)continue
                val coefficient=a[row][col]
                for(j in col..m)a[row][j]-=coefficient*a[col][j]
            }
        }
        val voltages=mutableMapOf(ground to 0.0)
        nodes.forEachIndexed{j,id->voltages[id]=a[j][m]}
        val currents=mutableMapOf<String,Double>()
        var delivered=0.0;var heat=0.0
        for(c in network.components){
            val current=if(c.kind=="dc-source"){
                a[nodes.size+sources.indexOfFirst{it.id==c.id}][m]
            }else{
                val ohms=c.resistanceOhm?:c.assumedResistanceOhm
                    ?:error("Invented device is missing its assumed Ohmic law")
                (requireNotNull(voltages[c.positiveNodeId])-
                    requireNotNull(voltages[c.negativeNodeId]))/ohms
            }
            require(current.isFinite()&&kotlin.math.abs(current)<=1e6){"DC current outside solver bounds"}
            currents[c.id]=current
            if(c.kind=="dc-source")delivered-=requireNotNull(c.voltageV)*current
            else heat+=current*current*requireNotNull(
                c.resistanceOhm?:c.assumedResistanceOhm)
        }
        val residual=delivered-heat
        require(delivered.isFinite()&&heat.isFinite()&&residual.isFinite()&&
            kotlin.math.abs(residual)<=1e-8*maxOf(1.0,kotlin.math.abs(delivered),heat)){
            "DC circuit failed power-conservation requirements"
        }
        // Project decoder constructs fresh immutable data classes/lists;
        // reference this specific parsed network in the evidence record.
        return NativeLabDcResult(project.id,project.revision,network.id,
            voltages.toMap(),currents.toMap(),network,delivered,heat,residual)
    }
}

/** Upright primitive immersion in a static, incompressible fluid; no fluid-flow dynamics. */
data class NativeLabHydroResult(
    val projectId:String,val projectRevision:Int,val entityId:String,
    val fluidDensityKgM3:Double,val immersionDepthM:Double,
    val displacedVolumeM3:Double,val buoyancyForceN:Double,
    val bottomGaugePressurePa:Double,val netUpwardForceN:Double?,
    val equilibriumDraftM:Double?,val status:String,
    val validity:String="Static liquid, ideal upright primitive and user-assumed density; "+
        "no waves, stability, flow or certified material behavior."
)
object NativeWorldLabHydrostatics {
    fun displacedVolume(solid:NativeLabSolid,depthM:Double):Double {
        require(depthM.isFinite()&&depthM in 0.0..solid.dimensionsMeters.y){
            "Immersion must be between zero and the solid's vertical extent"
        }
        val d=depthM
        val x=solid.dimensionsMeters.x
        val z=solid.dimensionsMeters.z
        return when(solid.shape){
            "box"->x*z*d
            "cylinder"->PI*x*z*d/4.0
            "sphere"->{
                val r=solid.dimensionsMeters.y/2.0
                PI*d*d*(3.0*r-d)/3.0
            }
            else->error("Hydrostatics supports only the three ideal primitive solids")
        }
    }
    fun evaluate(project:NativeWorldLabProject,solidId:String,
        fluidDensityKgM3:Double,immersionDepthM:Double,gravityMps2:Double=9.80665
    ):NativeLabHydroResult {
        require(fluidDensityKgM3.isFinite()&&fluidDensityKgM3 in 0.01..25000.0){
            "Fluid density is outside supported bounds"
        }
        require(gravityMps2.isFinite()&&gravityMps2 in 0.0..100.0){"Gravity outside model bounds"}
        val solid=project.entities.firstOrNull{it.id==solidId}
            ?:error("Select an invention for the buoyancy experiment")
        val volume=displacedVolume(solid,immersionDepthM)
        val density=project.materials.firstOrNull{it.id==solid.materialId}?.densityKgM3
        val mass=density?.let{solid.volumeMetersCubed()*it}
        val force=volume*fluidDensityKgM3*gravityMps2
        val net=mass?.let{force-it*gravityMps2}
        val full=solid.volumeMetersCubed()*fluidDensityKgM3
        val status=when{
            mass==null->"unknown-mass"
            mass>full->"sinking"
            mass==full->"neutrally-buoyant"
            else->"floating"
        }
        val draft=mass?.let{
            if(it>=full)solid.dimensionsMeters.y else {
                var lower=0.0;var upper=solid.dimensionsMeters.y
                val displacement=it/fluidDensityKgM3
                repeat(64){
                    val mid=(lower+upper)/2.0
                    if(displacedVolume(solid,mid)<displacement)lower=mid else upper=mid
                }
                (lower+upper)/2.0
            }
        }
        val pressure=fluidDensityKgM3*gravityMps2*immersionDepthM
        require(listOf(volume,force,pressure,net?:0.0,draft?:0.0).all{it.isFinite()}){
            "Buoyancy computation left its numerical domain"
        }
        return NativeLabHydroResult(project.id,project.revision,solidId,
            fluidDensityKgM3,immersionDepthM,volume,force,pressure,net,draft,status)
    }
}

/** 1D immersed primitive motion, no hydrodynamic velocity-field simulation. */
data class NativeLabFluidMotionInput(
    val fluidDensityKgM3:Double,
    val waterSurfaceHeightM:Double,
    val startingBottomHeightM:Double,
    val linearDragNsPerM:Double,
    val gravityMps2:Double=9.80665,
    val durationSeconds:Double=4.0
)
data class NativeLabFluidMotionSample(
    val timeSeconds:Double,val bottomHeightM:Double,val velocityMps:Double,
    val immersionDepthM:Double,val displacedVolumeM3:Double,
    val buoyancyForceN:Double,val dragForceN:Double,
    val weightForceN:Double,val kineticEnergyJ:Double,val gravitationalEnergyJ:Double,
    val cumulativeBuoyancyWorkJ:Double,val dissipatedEnergyJ:Double,
    val energyResidualJ:Double,val grounded:Boolean
)
data class NativeLabFluidMotionRun(
    val projectId:String,val projectRevision:Int,val entityId:String,
    val materialId:String,val massKg:Double,
    val input:NativeLabFluidMotionInput,
    val samples:List<NativeLabFluidMotionSample>,val stepSeconds:Double,
    val evidence:String="physics-model-computed",
    val validity:String="One-dimensional buoyancy of an upright solid in a fixed fluid surface; "+
        "assumed linear damping and inelastic bottom; no flow, waves or validated real matter."
)
object NativeWorldLabFluidMotion {
    fun evaluate(p:NativeWorldLabProject,id:String,input:NativeLabFluidMotionInput,
        requestedStepSeconds:Double=1.0/240):NativeLabFluidMotionRun {
        fun bounded(v:Double,lo:Double,hi:Double,label:String){
            require(v.isFinite() && v in lo..hi){"$label outside bounded fluid model"}
        }
        bounded(input.fluidDensityKgM3,0.01,25000.0,"Fluid density")
        bounded(input.waterSurfaceHeightM,0.0,20.0,"Fluid surface")
        bounded(input.startingBottomHeightM,0.0,20.0,"Initial height")
        bounded(input.linearDragNsPerM,0.0,10000.0,"Assumed drag")
        bounded(input.gravityMps2,0.0,100.0,"Gravity")
        bounded(input.durationSeconds,0.1,12.0,"Duration")
        bounded(requestedStepSeconds,0.0001,0.05,"Solver step")
        val solid=p.entities.firstOrNull{it.id==id}
            ?:error("Selected solid is missing")
        val material=p.materials.firstOrNull{it.id==solid.materialId}
            ?:error("Motion needs an explicit hypothetical mass assumption")
        val density=material.densityKgM3?:error("Unknown matter has no supplied density")
        val mass=solid.volumeMetersCubed()*density
        bounded(mass,0.001,10000.0,"Invention mass")
        val rate=maxOf(1.0,input.linearDragNsPerM/mass)
        val steps=kotlin.math.ceil(input.durationSeconds/
            kotlin.math.min(requestedStepSeconds,0.05/rate)).toInt()
        require(steps<=50000){"Specialized stiff-fluid solver required"}
        val dt=input.durationSeconds/steps
        data class Force(val depth:Double,val displaced:Double,val buoyancy:Double,
            val drag:Double,val weight:Double,val acceleration:Double)
        fun forces(h:Double,v:Double):Force {
            val depth=(input.waterSurfaceHeightM-kotlin.math.max(0.0,h))
                .coerceIn(0.0,solid.dimensionsMeters.y)
            val displaced=NativeWorldLabHydrostatics.displacedVolume(solid,depth)
            val buoyancy=input.fluidDensityKgM3*input.gravityMps2*displaced
            val weight=mass*input.gravityMps2
            val drag=-input.linearDragNsPerM*v
            return Force(depth,displaced,buoyancy,drag,weight,
                (buoyancy+drag-weight)/mass)
        }
        fun derivative(s:DoubleArray):DoubleArray {
            val f=forces(s[0],s[1])
            return if(s[0]<=0.0&&s[1]<=0.0&&f.buoyancy<=f.weight)
                doubleArrayOf(0.0,0.0)
            else doubleArrayOf(s[1],f.acceleration)
        }
        fun advance(s:DoubleArray):DoubleArray {
            val k1=derivative(s)
            fun shifted(k:DoubleArray,f:Double)=doubleArrayOf(
                s[0]+dt*k[0]*f,s[1]+dt*k[1]*f)
            val k2=derivative(shifted(k1,0.5))
            val k3=derivative(shifted(k2,0.5))
            val k4=derivative(shifted(k3,1.0))
            return doubleArrayOf(
                s[0]+dt*(k1[0]+2*k2[0]+2*k3[0]+k4[0])/6.0,
                s[1]+dt*(k1[1]+2*k2[1]+2*k3[1]+k4[1])/6.0)
        }
        var s=doubleArrayOf(input.startingBottomHeightM,0.0)
        var buoyancyWork=0.0;var dissipated=0.0
        val initial=mass*input.gravityMps2*s[0]
        val samples=ArrayList<NativeLabFluidMotionSample>(steps+1)
        for(j in 0..steps){
            val h=s[0];val v=s[1];val f=forces(h,v)
            val ke=0.5*mass*v*v
            val pe=mass*input.gravityMps2*h
            val residual=initial+buoyancyWork-ke-pe-dissipated
            require(listOf(h,v,ke,pe,residual,buoyancyWork,dissipated,f.buoyancy).all{
                it.isFinite()} && h<=1000 && kotlin.math.abs(v)<=10000){
                "Fluid motion exceeded its finite numerical range"
            }
            samples.add(NativeLabFluidMotionSample(j*dt,h,v,f.depth,
                f.displaced,f.buoyancy,f.drag,f.weight,ke,pe,
                buoyancyWork,dissipated,residual,h==0.0&&v==0.0))
            if(j==steps)break
            val raw=advance(s)
            val next=if(raw[0]<0.0||(raw[0]==0.0&&raw[1]<0.0))
                doubleArrayOf(0.0,0.0) else raw
            val after=forces(next[0],next[1])
            buoyancyWork+=0.5*(f.buoyancy+after.buoyancy)*(next[0]-h)
            dissipated+=0.5*dt*input.linearDragNsPerM*(v*v+next[1]*next[1])
            if(next[0]==0.0&&next[1]==0.0&&(h>0.0||v<0.0)&&raw[1]<0)
                dissipated+=0.5*mass*raw[1]*raw[1]
            s=next
        }
        return NativeLabFluidMotionRun(p.id,p.revision,id,material.id,mass,
            input,samples,dt)
    }
}

