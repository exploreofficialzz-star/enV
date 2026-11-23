package com.chastech.env.scenestudio

/** A scene that cannot be read at all (not JSON, not an object, a different major version, far too large). */
class SceneReadException(message: String) : Exception(message)

/**
 * Reads a scene document into [Scene], filling every default exactly as the web tool's validator does
 * (src/lib/scene-studio/validate.ts).
 *
 * The web tool is where scenes are checked and explained to the person; this reader assumes the scene was
 * checked there. It is still safe on anything: a value of the wrong type or outside its range falls back to the
 * default (what the validator also substitutes), an unusable item is skipped, and only a document that cannot be
 * read at all, or that breaks a size limit, throws [SceneReadException].
 */
object SceneReader {
    const val FORMAT_VERSION = "1.0"
    const val MAX_JSON_BYTES = 1_048_576

    private const val MAX_OBJECTS = 200
    private const val MAX_LIGHTS = 8
    private const val MAX_LAYERS = 100
    private const val MAX_SHOTS = 50
    private const val MAX_AUDIO = 16
    private const val MAX_ANIMATIONS = 400
    private const val MAX_KEYFRAMES = 500
    private const val MAX_DIALOGUE = 200
    private const val MAX_TEXT = 500
    private const val MAX_PARAMS = 32
    private const val MAX_DURATION = 120.0
    private const val MAX_FPS = 60
    private const val MAX_FRAMES = 7200
    private const val MAX_COORDINATE = 10_000.0
    private const val MAX_ID = 64

    private val EASINGS = setOf("linear", "easeIn", "easeOut", "easeInOut", "step")
    private val OBJECT_PROPERTIES = setOf("position", "rotation", "quaternion", "scale", "color", "opacity", "visible", "clip")
    private val CAMERA_PROPERTIES = setOf("position", "lookAt", "fov")
    private val LAYER_PROPERTIES = setOf("position", "scale", "rotation", "opacity", "color", "visible")
    private val ROTATION_ORDERS = setOf("XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX")
    private val ENVIRONMENT_PRESETS = setOf("studio", "day", "sunset", "night", "overcast", "none")
    private val TONE_MAPPINGS = setOf("aces", "neutral", "none")
    private val LAYER_TYPES = setOf("solid", "rect", "ellipse", "text", "image")
    private val LAYER_PLANES = setOf("front", "back")
    private val FONTS = setOf("sans", "serif", "display", "mono")
    private val LIGHT_TYPES = setOf("sun", "ambient", "point")
    private val CAMERA_TYPES = setOf("perspective", "orthographic")
    private val CAPTION_STYLES = setOf("pop", "classic")
    private val CAPTION_PLACEMENTS = setOf("belowSpeaker", "bottomCenter")
    private val EXPORT_FORMATS = setOf("mp4", "webm")
    private val QUALITIES = setOf("low", "medium", "high")

    private val ID_PATTERN = Regex("^[A-Za-z][A-Za-z0-9_-]*$")
    private val COLOR_PATTERN = Regex("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
    private val VERSION_PATTERN = Regex("^\\d+\\.\\d+$")
    private val FENCE_PATTERN = Regex("^```[a-zA-Z]*\\s*\\n([\\s\\S]*?)\\n?```\\s*$")
    private val UNSAFE_KEYS = setOf("__proto__", "constructor", "prototype")

    /** Reads pasted or saved text. Chatbots often wrap JSON in ``` fences; those are removed, as on the web. */
    fun parse(text: String): Scene {
        if (text.toByteArray(Charsets.UTF_8).size > MAX_JSON_BYTES) throw SceneReadException("The scene is larger than 1 MB.")
        var body = text.trim()
        FENCE_PATTERN.find(body)?.let { body = it.groupValues[1].trim() }
        if (body.isEmpty()) throw SceneReadException("Nothing was given to read.")
        val root = try {
            MiniJson.parse(body)
        } catch (e: JsonException) {
            throw SceneReadException("The text is not valid JSON (${e.message}).")
        }
        return fromJson(root)
    }

    /** Reads an already parsed document (the values [MiniJson.parse] returns). */
    fun fromJson(root: Any?): Scene {
        val input = rec(root) ?: throw SceneReadException("A scene must be a JSON object.")
        var version = FORMAT_VERSION
        val given = input["version"]
        if (given != null) {
            if (given !is String || !VERSION_PATTERN.matches(given)) throw SceneReadException("The scene's \"version\" must be text like \"$FORMAT_VERSION\".")
            if (given.substringBefore('.') != FORMAT_VERSION.substringBefore('.')) throw SceneReadException("This scene is version $given, but this app reads version ${FORMAT_VERSION.substringBefore('.')}.x.")
            version = given
        }
        val settings = readSettings(input["settings"])
        val camera = readCamera(input["camera"])
        val lights = readLights(input["lights"])
        val environment = readEnvironment(input["environment"])
        val post = readPost(input["post"])
        val ids = HashMap<String, String>() // id -> "object" | "layer" | "shot"
        val objects = readObjects(input["objects"], ids)
        val shots = readShots(input["shots"], ids)
        val layers = readLayers(input["layers"], settings.duration, ids)
        val audio = readAudio(input["audio"])
        val animations = readAnimations(input["animations"], ids)
        val dialogue = readDialogue(input["dialogue"])
        val voices = readVoices(input["voices"])
        val captions = readCaptions(input["captions"])
        val export = readExport(input["export"])
        return Scene(version, settings, camera, shots, lights, environment, post, objects, layers, audio, animations, dialogue, voices, captions, export)
    }

    // ---- small readers -------------------------------------------------------------------------

    @Suppress("UNCHECKED_CAST")
    private fun rec(v: Any?): Map<String, Any?>? = v as? Map<String, Any?>

    private fun list(v: Any?, max: Int, what: String): List<Any?> {
        val l = v as? List<*> ?: return emptyList()
        if (l.size > max) throw SceneReadException("There are ${l.size} $what; the limit is $max.")
        return l
    }

    private fun isNum(v: Any?) = v is Double && v.isFinite()

    private fun num(o: Map<String, Any?>, key: String, def: Double, lo: Double, hi: Double): Double {
        val v = o[key]
        return if (v is Double && v.isFinite() && v >= lo && v <= hi) v else def
    }

    private fun whole(o: Map<String, Any?>, key: String, def: Int, lo: Int, hi: Int): Int {
        val v = o[key]
        return if (v is Double && v.isFinite() && v == Math.floor(v) && v >= lo && v <= hi) v.toInt() else def
    }

    private fun bool(o: Map<String, Any?>, key: String, def: Boolean): Boolean = o[key] as? Boolean ?: def

    private fun text(o: Map<String, Any?>, key: String, max: Int): String? = (o[key] as? String)?.takeIf { it.length <= max }

    private fun choice(o: Map<String, Any?>, key: String, allowed: Set<String>, def: String): String {
        val v = o[key]
        return if (v is String && v in allowed) v else def
    }

    /** "#abc" and "#aabbcc" are accepted and become lower-case 6-digit hex. */
    fun normalizeColor(v: Any?): String? {
        if (v !is String) return null
        val m = COLOR_PATTERN.find(v) ?: return null
        val h = m.groupValues[1].lowercase()
        return "#" + if (h.length == 3) h.map { "$it$it" }.joinToString("") else h
    }

    private fun color(o: Map<String, Any?>, key: String, def: String): String = normalizeColor(o[key]) ?: def

    private fun colorOrNull(o: Map<String, Any?>, key: String): String? = normalizeColor(o[key])

    /** A list of exactly [n] finite numbers within ±10000, or null. */
    private fun vecOrNull(v: Any?, n: Int): DoubleArray? {
        val l = v as? List<*> ?: return null
        if (l.size != n) return null
        val out = DoubleArray(n)
        for (i in 0 until n) {
            val x = l[i]
            if (x !is Double || !x.isFinite() || Math.abs(x) > MAX_COORDINATE) return null
            out[i] = x
        }
        return out
    }

    private fun vec(o: Map<String, Any?>, key: String, n: Int, def: DoubleArray): DoubleArray = vecOrNull(o[key], n) ?: def.copyOf()

    /** A single number is shorthand for a uniform vector. */
    private fun uniform(v: Any?, n: Int): DoubleArray? {
        if (v is Double && v.isFinite() && Math.abs(v) <= MAX_COORDINATE) return DoubleArray(n) { v }
        return vecOrNull(v, n)
    }

    private fun unit(v: DoubleArray): DoubleArray? {
        val len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2] + v[3] * v[3])
        if (len < 1e-9) return null
        return doubleArrayOf(v[0] / len, v[1] / len, v[2] / len, v[3] / len)
    }

    private fun quatOrNull(v: Any?): DoubleArray? = vecOrNull(v, 4)?.let { unit(it) }

    // ---- sections ------------------------------------------------------------------------------

    private fun readSettings(input: Any?): SceneSettings {
        val o = rec(input) ?: emptyMap()
        val width = whole(o, "width", 1080, 64, 4096)
        val height = whole(o, "height", 1920, 64, 4096)
        val fps = whole(o, "fps", 30, 1, MAX_FPS)
        val duration = num(o, "duration", 8.0, 0.1, MAX_DURATION)
        val frames = Math.floor(fps * duration + 0.5).toInt()
        if (frames > MAX_FRAMES) throw SceneReadException("$duration s at $fps fps is $frames frames; the limit is $MAX_FRAMES.")
        val seedValue = o["seed"]
        val seed = if (seedValue is Double && seedValue.isFinite() && seedValue == Math.floor(seedValue) && seedValue >= 0 && seedValue <= 4_294_967_295.0) seedValue.toLong() else 1L
        return SceneSettings(width, height, fps, duration, color(o, "background", "#101826"), seed)
    }

    private fun readCameraAt(input: Any?): SceneCamera {
        val o = rec(input) ?: emptyMap()
        var amount = 0.0
        var speed = 4.0
        rec(o["shake"])?.let {
            amount = num(it, "amount", 0.0, 0.0, 1.0)
            speed = num(it, "speed", 4.0, 0.1, 20.0)
        }
        return SceneCamera(
            type = choice(o, "type", CAMERA_TYPES, "perspective"),
            position = vec(o, "position", 3, doubleArrayOf(0.0, 2.0, 8.0)),
            lookAt = vec(o, "lookAt", 3, doubleArrayOf(0.0, 1.0, 0.0)),
            fov = num(o, "fov", 45.0, 10.0, 120.0),
            shakeAmount = amount,
            shakeSpeed = speed,
        )
    }

    private fun readCamera(input: Any?): SceneCamera = readCameraAt(input)

    private fun readEnvironment(input: Any?): SceneEnvironment {
        val o = rec(input) ?: emptyMap()
        var fogColor = "#8a9bb0"
        var fogDensity = 0.0
        rec(o["fog"])?.let {
            fogColor = color(it, "color", "#8a9bb0")
            fogDensity = num(it, "density", 0.0, 0.0, 1.0)
        }
        return SceneEnvironment(
            preset = choice(o, "preset", ENVIRONMENT_PRESETS, "studio"),
            intensity = num(o, "intensity", 1.0, 0.0, 5.0),
            hdri = text(o, "hdri", 200)?.takeIf { safeAsset(it) },
            skybox = bool(o, "skybox", false),
            fogColor = fogColor,
            fogDensity = fogDensity,
        )
    }

    private fun readPost(input: Any?): ScenePost {
        val o = rec(input) ?: emptyMap()
        return ScenePost(
            bloom = num(o, "bloom", 0.0, 0.0, 3.0),
            bloomThreshold = num(o, "bloomThreshold", 0.8, 0.0, 1.0),
            vignette = num(o, "vignette", 0.0, 0.0, 1.0),
            grain = num(o, "grain", 0.0, 0.0, 1.0),
            depthOfField = num(o, "depthOfField", 0.0, 0.0, 1.0),
            focusDistance = num(o, "focusDistance", 8.0, 0.1, 1000.0),
            toneMapping = choice(o, "toneMapping", TONE_MAPPINGS, "aces"),
            exposure = num(o, "exposure", 1.0, 0.1, 4.0),
            contrast = num(o, "contrast", 1.0, 0.5, 2.0),
            saturation = num(o, "saturation", 1.0, 0.0, 2.0),
        )
    }

    private fun readLights(input: Any?): List<SceneLight> {
        if (input == null) return listOf(SceneLight("sun", 1.0, "#ffffff", doubleArrayOf(0.0, 5.0, 0.0), doubleArrayOf(-0.4, -1.0, -0.3)))
        return list(input, MAX_LIGHTS, "lights").mapNotNull { item ->
            val o = rec(item) ?: return@mapNotNull null
            SceneLight(
                type = choice(o, "type", LIGHT_TYPES, "sun"),
                intensity = num(o, "intensity", 1.0, 0.0, 20.0),
                color = color(o, "color", "#ffffff"),
                position = vec(o, "position", 3, doubleArrayOf(0.0, 5.0, 0.0)),
                direction = vec(o, "direction", 3, doubleArrayOf(-0.4, -1.0, -0.3)),
            )
        }
    }

    /** Library names or uploaded file names only; never a web address, never a path that climbs out. */
    private fun safeAsset(value: String): Boolean {
        if (Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:").containsMatchIn(value) || value.startsWith("//")) return false
        if (value.contains('\\') || value.startsWith("/") || value.split("/").any { it == ".." } || value.contains('\u0000')) return false
        return true
    }

    private fun readParams(input: Any?): Map<String, Any> {
        val o = rec(input) ?: return emptyMap()
        if (o.size > MAX_PARAMS) return emptyMap()
        val out = LinkedHashMap<String, Any>()
        for ((k, v) in o) {
            if (k in UNSAFE_KEYS) continue
            if (v is String && v.length <= MAX_TEXT) out[k] = v
            else if (v is Boolean) out[k] = v
            else if (v is Double && v.isFinite()) out[k] = v
        }
        return out
    }

    private fun readMaterial(input: Any?): MaterialSettings? {
        val o = rec(input) ?: return null
        return MaterialSettings(
            metallic = num(o, "metallic", 0.0, 0.0, 1.0),
            roughness = num(o, "roughness", 0.6, 0.0, 1.0),
            emissive = colorOrNull(o, "emissive"),
            emissiveIntensity = num(o, "emissiveIntensity", 1.0, 0.0, 20.0),
            texture = text(o, "texture", 200)?.takeIf { safeAsset(it) },
            doubleSided = bool(o, "doubleSided", false),
        )
    }

    private fun claim(ids: MutableMap<String, String>, id: String, kind: String): Boolean {
        if (!ID_PATTERN.matches(id) || id == "camera" || ids.containsKey(id)) return false
        ids[id] = kind
        return true
    }

    private fun readObjects(input: Any?, ids: MutableMap<String, String>): List<SceneObject> {
        val raw = ArrayList<SceneObject>()
        for (item in list(input, MAX_OBJECTS, "objects")) {
            val o = rec(item) ?: continue
            val id = text(o, "id", MAX_ID) ?: continue
            val type = text(o, "type", 64)
            if (type == null || type.isBlank()) continue
            if (!claim(ids, id, "object")) continue
            val quaternion = if (o.containsKey("quaternion")) quatOrNull(o["quaternion"]) else null
            raw.add(
                SceneObject(
                    id = id,
                    type = type,
                    rotationOrder = choice(o, "rotationOrder", ROTATION_ORDERS, "XYZ"),
                    quaternion = quaternion,
                    material = readMaterial(o["material"]),
                    clip = text(o, "clip", 64),
                    clipSpeed = num(o, "clipSpeed", 1.0, 0.0, 10.0),
                    asset = text(o, "asset", 200)?.takeIf { safeAsset(it) },
                    style = text(o, "style", 32),
                    color = colorOrNull(o, "color"),
                    text = text(o, "text", MAX_TEXT),
                    size = if (o.containsKey("size")) uniform(o["size"], 3) else null,
                    params = readParams(o["params"]),
                    position = vec(o, "position", 3, doubleArrayOf(0.0, 0.0, 0.0)),
                    // "ignored when a quaternion is present; zeroed" (same as the validator)
                    rotation = if (quaternion != null) doubleArrayOf(0.0, 0.0, 0.0) else vec(o, "rotation", 3, doubleArrayOf(0.0, 0.0, 0.0)),
                    scale = if (o.containsKey("scale")) uniform(o["scale"], 3) ?: doubleArrayOf(1.0, 1.0, 1.0) else doubleArrayOf(1.0, 1.0, 1.0),
                    visible = bool(o, "visible", true),
                    opacity = num(o, "opacity", 1.0, 0.0, 1.0),
                    parent = text(o, "parent", MAX_ID),
                ),
            )
        }
        // A parent must be another object, and the chain must end: otherwise the link is dropped.
        val byId = raw.associateBy { it.id }
        val fixed = raw.map { o ->
            val p = o.parent
            var keep = p != null && p != o.id && byId.containsKey(p)
            if (keep) {
                var cur: SceneObject? = byId[p]
                var steps = 0
                while (cur != null) {
                    if (cur.id == o.id || steps > raw.size) {
                        keep = false
                        break
                    }
                    cur = cur.parent?.let { byId[it] }
                    steps++
                }
            }
            if (keep || p == null) o else withoutParent(o)
        }
        return fixed
    }

    private fun withoutParent(o: SceneObject) = SceneObject(
        o.id, o.type, o.rotationOrder, o.quaternion, o.material, o.clip, o.clipSpeed, o.asset, o.style, o.color, o.text, o.size,
        o.params, o.position, o.rotation, o.scale, o.visible, o.opacity, null,
    )

    private fun readShots(input: Any?, ids: MutableMap<String, String>): List<SceneShot> {
        val out = ArrayList<SceneShot>()
        for (item in list(input, MAX_SHOTS, "shots")) {
            val o = rec(item) ?: continue
            val id = text(o, "id", MAX_ID) ?: continue
            if (!claim(ids, id, "shot")) continue
            out.add(SceneShot(id, num(o, "start", 0.0, 0.0, MAX_DURATION), readCameraAt(o)))
        }
        return out.sortedBy { it.start } // stable, like the web tool's sort
    }

    private fun readLayers(input: Any?, duration: Double, ids: MutableMap<String, String>): List<SceneLayer> {
        val out = ArrayList<SceneLayer>()
        for (item in list(input, MAX_LAYERS, "layers")) {
            val o = rec(item) ?: continue
            val id = text(o, "id", MAX_ID) ?: continue
            val type = o["type"] as? String
            if (type == null || type !in LAYER_TYPES) continue
            if (!claim(ids, id, "layer")) continue
            val scale: DoubleArray = if (o.containsKey("scale")) uniform(o["scale"], 2) ?: doubleArrayOf(1.0, 1.0) else doubleArrayOf(1.0, 1.0)
            out.add(
                SceneLayer(
                    id = id,
                    type = type,
                    plane = choice(o, "plane", LAYER_PLANES, "front"),
                    position = vec(o, "position", 2, doubleArrayOf(0.0, 0.0)),
                    size = vec(o, "size", 2, if (type == "text") doubleArrayOf(0.0, 0.0) else doubleArrayOf(100.0, 100.0)),
                    anchor = vec(o, "anchor", 2, doubleArrayOf(0.5, 0.5)),
                    scale = scale,
                    rotation = num(o, "rotation", 0.0, -36000.0, 36000.0),
                    opacity = num(o, "opacity", 1.0, 0.0, 1.0),
                    start = num(o, "start", 0.0, 0.0, MAX_DURATION),
                    end = num(o, "end", duration, 0.0, MAX_DURATION),
                    visible = bool(o, "visible", true),
                    color = colorOrNull(o, "color"),
                    text = text(o, "text", MAX_TEXT),
                    font = choice(o, "font", FONTS, "sans"),
                    fontSize = num(o, "fontSize", 64.0, 4.0, 1000.0),
                    strokeColor = colorOrNull(o, "strokeColor"),
                    strokeWidth = num(o, "strokeWidth", 0.0, 0.0, 100.0),
                    asset = text(o, "asset", 200)?.takeIf { safeAsset(it) },
                ),
            )
        }
        return out
    }

    private fun readAudio(input: Any?): List<AudioTrack> {
        val out = ArrayList<AudioTrack>()
        list(input, MAX_AUDIO, "audio tracks").forEachIndexed { i, item ->
            val o = rec(item) ?: return@forEachIndexed
            val asset = text(o, "asset", 200)?.takeIf { safeAsset(it) } ?: return@forEachIndexed
            out.add(AudioTrack(text(o, "id", MAX_ID) ?: "audio${i + 1}", asset, num(o, "start", 0.0, 0.0, MAX_DURATION), num(o, "volume", 1.0, 0.0, 1.0), bool(o, "loop", false)))
        }
        return out
    }

    private fun trackValue(kind: String, property: String, v: Any?): TrackValue? = when (property) {
        "position" -> (if (kind == "layer") vecOrNull(v, 2) else vecOrNull(v, 3))?.let { TrackValue.Vec(it) }
        "rotation" -> if (kind == "layer") (if (isNum(v)) TrackValue.Num(v as Double) else null) else vecOrNull(v, 3)?.let { TrackValue.Vec(it) }
        "lookAt" -> vecOrNull(v, 3)?.let { TrackValue.Vec(it) }
        "quaternion" -> quatOrNull(v)?.let { TrackValue.Vec(it) }
        "scale" -> (if (kind == "layer") uniform(v, 2) else uniform(v, 3))?.let { TrackValue.Vec(it) }
        "clip" -> if (v is String && v.isNotEmpty() && v.length <= 64) TrackValue.Text(v) else null
        "color" -> normalizeColor(v)?.let { TrackValue.Text(it) }
        "opacity" -> if (v is Double && v.isFinite() && v >= 0.0 && v <= 1.0) TrackValue.Num(v) else null
        "fov" -> if (v is Double && v.isFinite() && v >= 10.0 && v <= 120.0) TrackValue.Num(v) else null
        "visible" -> if (v is Boolean) TrackValue.Flag(v) else null
        else -> null
    }

    private fun readAnimations(input: Any?, ids: Map<String, String>): List<AnimationTrack> {
        val out = ArrayList<AnimationTrack>()
        for (item in list(input, MAX_ANIMATIONS, "animations")) {
            val o = rec(item) ?: continue
            val target = text(o, "target", MAX_ID) ?: continue
            val owner = if (target == "camera") "shot" else ids[target] ?: continue
            val kind = if (owner == "shot") "camera" else owner
            val allowed = when (kind) {
                "camera" -> CAMERA_PROPERTIES
                "layer" -> LAYER_PROPERTIES
                else -> OBJECT_PROPERTIES
            }
            val property = o["property"] as? String
            if (property == null || property !in allowed) continue
            val frames = list(o["keyframes"], MAX_KEYFRAMES, "keyframes")
            if (frames.isEmpty()) continue
            val keyframes = ArrayList<Keyframe>()
            var bad = false
            for (kf in frames) {
                val k = rec(kf)
                val time = k?.get("time")
                if (k == null || time !is Double || !time.isFinite() || time < 0) {
                    bad = true
                    break
                }
                if (keyframes.isNotEmpty() && time < keyframes.last().time) {
                    bad = true
                    break
                }
                val value = trackValue(kind, property, k["value"])
                if (value == null) {
                    bad = true
                    break
                }
                val easing = if (k.containsKey("easing")) choice(k, "easing", EASINGS, "linear") else null
                keyframes.add(Keyframe(time, value, easing))
            }
            if (bad) continue
            out.add(AnimationTrack(target, property, choice(o, "easing", EASINGS, "linear"), bool(o, "loop", false), keyframes))
        }
        return out
    }

    private fun readDialogue(input: Any?): List<DialogueLine> {
        val out = ArrayList<DialogueLine>()
        for (item in list(input, MAX_DIALOGUE, "dialogue lines")) {
            val o = rec(item) ?: continue
            val speaker = text(o, "speaker", MAX_ID)
            val line = text(o, "text", MAX_TEXT)
            if (speaker == null || speaker.isBlank() || line == null || line.isBlank()) continue
            out.add(DialogueLine(speaker, line, num(o, "start", 0.0, 0.0, MAX_DURATION)))
        }
        return out
    }

    private fun readVoices(input: Any?): Map<String, VoiceSetting> {
        val o = rec(input) ?: return emptyMap()
        val out = LinkedHashMap<String, VoiceSetting>()
        for ((speaker, v) in o) {
            if (speaker in UNSAFE_KEYS) continue
            val r = rec(v) ?: continue
            out[speaker] = VoiceSetting(text(r, "voice", 64) ?: "default", num(r, "speed", 1.0, 0.5, 2.0))
        }
        return out
    }

    private fun readCaptions(input: Any?): CaptionSettings {
        val o = rec(input) ?: emptyMap()
        val speakerColors = LinkedHashMap<String, String>()
        rec(o["speakerColors"])?.let {
            for ((k, v) in it) {
                if (k in UNSAFE_KEYS) continue
                normalizeColor(v)?.let { c -> speakerColors[k] = c }
            }
        }
        return CaptionSettings(
            enabled = bool(o, "enabled", true),
            style = choice(o, "style", CAPTION_STYLES, "pop"),
            placement = choice(o, "placement", CAPTION_PLACEMENTS, "belowSpeaker"),
            highlightColor = color(o, "highlightColor", "#ffd400"),
            wordsPerGroup = whole(o, "wordsPerGroup", 3, 1, 6),
            anchorY = num(o, "anchorY", 0.78, 0.1, 0.95),
            fontScale = num(o, "fontScale", 1.0, 0.5, 2.0),
            speakerColors = speakerColors,
        )
    }

    private fun readExport(input: Any?): ExportSettings {
        val o = rec(input) ?: emptyMap()
        return ExportSettings(choice(o, "format", EXPORT_FORMATS, "mp4"), choice(o, "quality", QUALITIES, "high"))
    }
}
