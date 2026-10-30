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
