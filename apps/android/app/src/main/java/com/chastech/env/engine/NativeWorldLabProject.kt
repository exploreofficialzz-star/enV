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
    val name:String?=null,val assumption:String?=null,val evidence:String?=null
)
data class NativeLabCircuitNetwork(
    val id:String,val name:String,val groundNodeId:String,
    val nodes:List<NativeLabCircuitNode>,val components:List<NativeLabCircuitComponent>
)
data class NativeWorldLabProject(
    val id: String, val title: String, val revision: Int, val createdAt: String,
    val updatedAt: String, val cameraPositionMeters: NativeLabVector,
    val cameraLookingAtMeters: NativeLabVector, val entities: List<NativeLabSolid>,
    val materials: List<NativeLabMaterial>,
    val networks: List<NativeLabCircuitNetwork> = emptyList(),
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
        require(supplied==essential || supplied==essential+setOf("networks")) {
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
                keys(comp,common+extras)
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
                NativeLabCircuitComponent(id(comp,"id"),kind,from,to,
                    voltage,resistance,inventName,assumption,evidence)
            }
            require(components.map{it.id}.toSet().size==components.size)
            NativeLabCircuitNetwork(id(net,"id"),name(net,"name"),ground,nodes,components)
        }
        require(networks.map{it.id}.toSet().size==networks.size)
        return NativeWorldLabProject(projectId,title,revision.toInt(),created,updated,
            vector(camera.getJSONArray("positionMeters")),
            vector(camera.getJSONArray("lookingAtMeters")),entities,materials,networks)
    }
}

/**
 * Native Kotlin nodal DC circuit solution with grounded nodes and ideal sources.
 * Internal units are SI. Does not claim to model any hypothetical device.
 */
data class NativeLabDcResult(
    val projectId:String,val projectRevision:Int,val networkId:String,
    val nodeVoltagesV:Map<String,Double>,val branchCurrentsA:Map<String,Double>,
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
                "resistor"->{
                    val conductance=1.0/requireNotNull(component.resistanceOhm)
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
                else->error("Hypothetical component has no verified DC behavior")
            }
        }
        val scale=maxOf(1.0,a.maxOf{row->row.maxOf{kotlin.math.abs(it)}})
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
                (requireNotNull(voltages[c.positiveNodeId])-
                    requireNotNull(voltages[c.negativeNodeId]))/requireNotNull(c.resistanceOhm)
            }
            require(current.isFinite()&&kotlin.math.abs(current)<=1e6){"DC current outside solver bounds"}
            currents[c.id]=current
            if(c.kind=="dc-source")delivered-=requireNotNull(c.voltageV)*current
            else heat+=current*current*requireNotNull(c.resistanceOhm)
        }
        val residual=delivered-heat
        require(delivered.isFinite()&&heat.isFinite()&&residual.isFinite()&&
            kotlin.math.abs(residual)<=1e-8*maxOf(1.0,kotlin.math.abs(delivered),heat)){
            "DC circuit failed power-conservation requirements"
        }
        return NativeLabDcResult(project.id,project.revision,network.id,
            voltages.toMap(),currents.toMap(),delivered,heat,residual)
    }
}
