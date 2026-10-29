package com.chastech.env.engine

import java.util.Base64
import java.util.zip.CRC32
import org.json.JSONArray
import org.json.JSONObject

/** Portable enV 3D project data. A renderer is intentionally separate from this contract. */
data class NativeGameVector(val x: Double, val y: Double, val z: Double)
data class NativeGameAssetSource(val projectId: String, val screenId: String, val updatedAt: String)
data class NativeGameAsset(
    val id: String, val name: String, val kind: String, val dataUrl: String,
    val source: NativeGameAssetSource? = null, val width: Int? = null, val height: Int? = null,
)
data class NativeGameObject(
    val id: String, val name: String, val kind: String, val assetId: String? = null,
    val position: NativeGameVector, val rotation: NativeGameVector, val scale: NativeGameVector,
    val color: String, val visible: Boolean, val locked: Boolean, val collider: Boolean,
    val player: Boolean, val speed: Double,
)
data class NativeGameProject(
    val format: String, val version: Int, val id: String, val name: String,
    val objects: List<NativeGameObject>, val assets: List<NativeGameAsset>,
)

object NativeGameProjectCodec {
    const val MAX_ASSET_BYTES = 15 * 1024 * 1024
    const val MAX_PROJECT_BYTES = 100 * 1024 * 1024
    private val colorPattern = Regex("^#[0-9a-fA-F]{6}$")
    private val base64Pattern = Regex("^[A-Za-z0-9+/]*={0,2}$")
    private val kinds = setOf("box", "sphere", "cylinder", "ground", "artboard", "model")
    private val unsupportedExtensions = setOf("KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu")

    fun decode(json: String): NativeGameProject {
        require(json.toByteArray(Charsets.UTF_8).size <= MAX_PROJECT_BYTES) { "Project files must be 100 MB or smaller." }
        val root = try { JSONObject(json) } catch (_: Exception) { throw IllegalArgumentException("The project data is malformed.") }
        val versionNumber = root.number("version")
        require(versionNumber == 1.0 && root.string("format") == "env-3d-game") { "The project version is unsupported." }
        val assetsArray = root.array("assets"); val objectsArray = root.array("objects")
        require(assetsArray.length() <= 100 && objectsArray.length() <= 500) { "Project size is invalid." }
        val assets = (0 until assetsArray.length()).map { index ->
            val item = assetsArray.objectAt(index)
            val source = if (item.has("source")) item.objectValue("source").let { NativeGameAssetSource(it.string("projectId"), it.string("screenId"), it.string("updatedAt")) } else null
            NativeGameAsset(item.string("id"), item.string("name"), item.string("kind"), item.string("dataUrl"), source, item.optionalInt("width"), item.optionalInt("height"))
        }
        val objects = (0 until objectsArray.length()).map { index ->
            val item = objectsArray.objectAt(index)
            NativeGameObject(item.string("id"), item.string("name"), item.string("kind"), item.optionalString("assetId"),
                item.vector("position"), item.vector("rotation"), item.vector("scale"), item.string("color"),
                item.bool("visible"), item.bool("locked"), item.bool("collider"), item.bool("player"), item.number("speed"))
        }
        return NativeGameProject("env-3d-game", 1, root.string("id"), root.string("name"), objects, assets).also(::validate)
    }

    fun encode(project: NativeGameProject): String {
        validate(project)
        fun vec(value: NativeGameVector) = JSONObject().put("x", value.x).put("y", value.y).put("z", value.z)
        val assets = JSONArray(); project.assets.forEach { asset ->
            val item = JSONObject().put("id", asset.id).put("name", asset.name).put("kind", asset.kind).put("dataUrl", asset.dataUrl)
            asset.source?.let { item.put("source", JSONObject().put("projectId", it.projectId).put("screenId", it.screenId).put("updatedAt", it.updatedAt)) }
            asset.width?.let { item.put("width", it) }; asset.height?.let { item.put("height", it) }; assets.put(item)
        }
        val objects = JSONArray(); project.objects.forEach { obj ->
            val item = JSONObject().put("id", obj.id).put("name", obj.name).put("kind", obj.kind)
                .put("position", vec(obj.position)).put("rotation", vec(obj.rotation)).put("scale", vec(obj.scale))
                .put("color", obj.color).put("visible", obj.visible).put("locked", obj.locked).put("collider", obj.collider).put("player", obj.player).put("speed", obj.speed)
            obj.assetId?.let { item.put("assetId", it) }; objects.put(item)
        }
        return JSONObject().put("format", project.format).put("version", project.version).put("id", project.id).put("name", project.name).put("objects", objects).put("assets", assets).toString()
    }

    fun validate(project: NativeGameProject) {
        require(project.format == "env-3d-game" && project.version == 1) { "The project version is unsupported." }
        require(project.id.validText(120) && project.name.validText(100) && project.objects.size <= 500 && project.assets.size <= 100) { "Project metadata or size is invalid." }
        require(project.objects.map { it.id }.distinct().size == project.objects.size && project.assets.map { it.id }.distinct().size == project.assets.size) { "The project contains duplicate IDs." }
        require(project.objects.count { it.player } <= 1) { "A project can have only one player." }
        project.assets.forEach(::validateAsset)
        project.objects.forEach { obj ->
            require(obj.id.validText(120) && obj.name.validText(160) && obj.kind in kinds && (obj.assetId == null || obj.assetId.length <= 120) && obj.position.valid() && obj.rotation.valid() && obj.scale.valid(true) && colorPattern.matches(obj.color) && obj.speed.isFinite() && obj.speed in 0.1..20.0) { "An object's properties are invalid." }
            if (obj.kind == "artboard" || obj.kind == "model") {
                val expected = if (obj.kind == "model") "glb" else "artboard"
                require(project.assets.any { it.id == obj.assetId && it.kind == expected }) { "An object references a missing or incompatible asset." }
            }
        }
    }

    private fun validateAsset(asset: NativeGameAsset) {
        require(asset.id.validText(120) && asset.name.validText(160) && asset.kind in setOf("glb", "artboard") && (asset.width == null || asset.width in 1..4096) && (asset.height == null || asset.height in 1..4096)) { "Asset metadata is invalid." }
        asset.source?.let { require(it.projectId.length <= 120 && it.screenId.length <= 120 && it.updatedAt.length <= 80) { "Artboard source metadata is invalid." } }
        val prefix = if (asset.kind == "glb") "data:model/gltf-binary;base64," else "data:image/png;base64,"
        require(asset.dataUrl.startsWith(prefix) && asset.dataUrl.length <= (MAX_ASSET_BYTES * 4L + 2) / 3 + 128) { "Asset data is invalid or too large." }
        val encoded = asset.dataUrl.removePrefix(prefix); require(base64Pattern.matches(encoded)) { "Asset data is not valid base64." }
        val bytes = try { Base64.getDecoder().decode(encoded) } catch (_: IllegalArgumentException) { throw IllegalArgumentException("Asset data is not valid base64.") }
        require(bytes.size <= MAX_ASSET_BYTES) { "Asset data is too large." }
        if (asset.kind == "glb") validateGlb(bytes)
        else {
            val (width, height) = validatePng(bytes)
            require((asset.width == null || asset.width == width) && (asset.height == null || asset.height == height)) { "Artboard dimensions are inconsistent." }
        }
    }

    private fun validatePng(bytes: ByteArray): Pair<Int, Int> {
        fun invalid(): Nothing = throw IllegalArgumentException("The Artboard image is not a valid PNG.")
        if (bytes.size < 45 || bytes.take(8).map { it.toInt() and 255 } != listOf(137, 80, 78, 71, 13, 10, 26, 10)) invalid()
        fun u32(offset: Int): Long = (0..3).fold(0L) { value, i -> (value shl 8) or (bytes[offset + i].toLong() and 255L) }
        var offset = 8; var width = 0; var height = 0; var pixels = false; var ended = false
        while (offset + 12 <= bytes.size) {
            val length = u32(offset)
            if (length > bytes.size - offset - 12L) invalid()
            val count = length.toInt(); val type = bytes.copyOfRange(offset + 4, offset + 8).toString(Charsets.US_ASCII)
            val crc = CRC32().apply { update(bytes, offset + 4, count + 4) }
            if (crc.value != u32(offset + 8 + count)) invalid()
            if (offset == 8) {
                if (type != "IHDR" || count != 13) invalid()
                val rawWidth = u32(offset + 8); val rawHeight = u32(offset + 12)
                if (rawWidth !in 1L..4096L || rawHeight !in 1L..4096L) invalid()
                width = rawWidth.toInt(); height = rawHeight.toInt()
            } else if (type == "IHDR") invalid()
            if (type == "IDAT") pixels = true
            offset += count + 12
            if (type == "IEND") { if (count != 0 || offset != bytes.size) invalid(); ended = true; break }
        }
        if (!ended || !pixels) invalid()
        return width to height
    }

    private fun validateGlb(bytes: ByteArray) {
        require(bytes.size in 20..MAX_ASSET_BYTES) { "The model is not a valid GLB." }
        fun u32(offset: Int): Long = (0..3).fold(0L) { value, i -> value or ((bytes[offset + i].toLong() and 255L) shl (8 * i)) }
        require(u32(0) == 0x46546c67L && u32(4) == 2L && u32(8) == bytes.size.toLong() && u32(16) == 0x4e4f534aL) { "Only valid glTF 2.0 GLB models are supported." }
        val jsonLength = u32(12); require(jsonLength >= 2 && jsonLength <= bytes.size - 20L) { "The GLB model data is invalid." }
        val gltf = try { JSONObject(bytes.copyOfRange(20, 20 + jsonLength.toInt()).toString(Charsets.UTF_8)) } catch (_: Exception) { throw IllegalArgumentException("The GLB model data is invalid.") }
        require(gltf.optJSONObject("asset")?.opt("version") == "2.0") { "Only glTF 2.0 models are supported." }
        require(!hasExternalUri(gltf)) { "The GLB refers to external files." }
        val extensions = gltf.optJSONArray("extensionsUsed")
        if (extensions != null) require((0 until extensions.length()).none { val extension = extensions.opt(it) as? String; extension != null && unsupportedExtensions.contains(extension) }) { "This GLB requires an external decoder." }
    }
    private fun hasExternalUri(value: Any?): Boolean = when (value) {
        is JSONObject -> value.keys().asSequence().any { key -> val item = value.opt(key); (key == "uri" && item is String && !item.startsWith("data:")) || hasExternalUri(item) }
        is JSONArray -> (0 until value.length()).any { hasExternalUri(value.opt(it)) }
        else -> false
    }
    private fun String.validText(max: Int) = isNotEmpty() && length <= max
    private fun NativeGameVector.valid(positive: Boolean = false) = listOf(x, y, z).all { it.isFinite() && it in -10000.0..10000.0 && (!positive || it > 0) }
    private fun JSONObject.string(key: String) = opt(key) as? String ?: throw IllegalArgumentException("The project data is malformed.")
    private fun JSONObject.optionalString(key: String) = if (has(key)) string(key) else null
    private fun JSONObject.bool(key: String) = opt(key) as? Boolean ?: throw IllegalArgumentException("The project data is malformed.")
    private fun JSONObject.number(key: String): Double = (opt(key) as? Number)?.toDouble() ?: throw IllegalArgumentException("The project data is malformed.")
    private fun JSONObject.optionalInt(key: String): Int? { if (!has(key)) return null; val value = number(key); require(value.isFinite() && value % 1.0 == 0.0 && value in 1.0..4096.0) { "Asset metadata is invalid." }; return value.toInt() }
    private fun JSONObject.array(key: String) = opt(key) as? JSONArray ?: throw IllegalArgumentException("The project data is malformed.")
    private fun JSONObject.objectValue(key: String) = opt(key) as? JSONObject ?: throw IllegalArgumentException("The project data is malformed.")
    private fun JSONArray.objectAt(index: Int) = opt(index) as? JSONObject ?: throw IllegalArgumentException("The project data is malformed.")
    private fun JSONObject.vector(key: String) = objectValue(key).let { NativeGameVector(it.number("x"), it.number("y"), it.number("z")) }
}
