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
data class NativeWorldLabProject(
    val id: String, val title: String, val revision: Int, val createdAt: String,
    val updatedAt: String, val cameraPositionMeters: NativeLabVector,
    val cameraLookingAtMeters: NativeLabVector, val entities: List<NativeLabSolid>,
    val materials: List<NativeLabMaterial>,
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
        keys(p,setOf("format","schemaVersion","id","title","revision","createdAt","updatedAt",
            "world","camera","entities","materials"))
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
        return NativeWorldLabProject(projectId,title,revision.toInt(),created,updated,
            vector(camera.getJSONArray("positionMeters")),
            vector(camera.getJSONArray("lookingAtMeters")),entities,materials)
    }
}
