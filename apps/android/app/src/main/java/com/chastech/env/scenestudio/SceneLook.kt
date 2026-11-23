package com.chastech.env.scenestudio

/**
 * The "look" of a scene as plain numbers: sky and lighting presets, how the scene's lights become renderer lights,
 * how post-processing settings map to renderer controls, and what each quality level costs. Same numbers as
 * src/lib/scene-studio/render-look.ts, so every platform's renderer starts from the same picture.
 */
class SkyPreset(
    /** Sky colours, top → horizon, and the ground colour for light bounced from below. */
    val top: String,
    val horizon: String,
    val ground: String,
    /** Ambient (sky) light strength before the scene's own environment intensity is applied. */
    val ambient: Double,
    /** The key light this preset adds when the scene lists no lights of its own. */
    val sunColor: String,
    val sunIntensity: Double,
    val sunDirection: DoubleArray,
)

class LightPlan(
    /** "sun", "ambient" or "point". */
    val kind: String,
    val color: String,
    val intensity: Double,
    val direction: DoubleArray?,
    val position: DoubleArray?,
    /** Point lights only: the distance in metres over which the light fades to nothing. */
    val range: Double?,
    /** At most one light (the first sun) casts shadows. */
    val castsShadow: Boolean,
)

class AmbientFill(val skyColor: String, val groundColor: String, val intensity: Double)

class PostPlan(
    val bloom: Boolean,
    val bloomWeight: Double,
    val bloomThreshold: Double,
    val vignette: Boolean,
    val vignetteWeight: Double,
    val grain: Boolean,
    val grainIntensity: Double,
    val depthOfField: Boolean,
    /** Distance kept sharp, in millimetres (the renderer's unit for lens settings). */
    val focusDistanceMm: Double,
    val fStop: Double,
    val toneMapping: String,
    val exposure: Double,
    val contrast: Double,
    val saturation: Double,
)

class QualityPlan(val shadowMapSize: Int, val msaaSamples: Int, val particleScale: Double, val waterGrid: Int)

object SceneLook {
    val SKY_PRESETS: Map<String, SkyPreset> = mapOf(
        "studio" to SkyPreset("#d9dde3", "#eef0f3", "#8d9097", 0.55, "#ffffff", 2.5, doubleArrayOf(-0.4, -1.0, -0.6)),
        "day" to SkyPreset("#5b9bd5", "#cfe6f7", "#7a8a6a", 0.6, "#fff4e0", 3.0, doubleArrayOf(-0.5, -0.8, -0.3)),
        "sunset" to SkyPreset("#3b3f7a", "#f2a65a", "#3a2f35", 0.35, "#ff9a4d", 2.2, doubleArrayOf(-0.9, -0.25, -0.2)),
        "night" to SkyPreset("#04060f", "#101a33", "#07090f", 0.18, "#9fb4ff", 0.8, doubleArrayOf(0.3, -0.8, -0.5)),
        "overcast" to SkyPreset("#9aa3ad", "#c3c9cf", "#6d7279", 0.8, "#ffffff", 0.6, doubleArrayOf(0.0, -1.0, -0.1)),
        "none" to SkyPreset("#808080", "#808080", "#808080", 0.3, "#ffffff", 0.0, doubleArrayOf(0.0, -1.0, 0.0)),
    )

    val QUALITY_PLANS: Map<String, QualityPlan> = mapOf(
        "low" to QualityPlan(1024, 1, 0.4, 32),
        "medium" to QualityPlan(2048, 4, 0.7, 64),
        "high" to QualityPlan(4096, 8, 1.0, 96),
    )

    private fun clamp(v: Double, lo: Double, hi: Double) = Math.min(hi, Math.max(lo, v))

    private fun preset(name: String): SkyPreset = SKY_PRESETS[name] ?: SKY_PRESETS.getValue("studio")

    /** A point light fades out over 10 m plus 4 m per point of intensity (at most 90 m). */
    fun pointLightRange(intensity: Double): Double = clamp(10 + 4 * intensity, 10.0, 90.0)

    /** Lights to create: the scene's own, plus the preset's key light when the scene lists none. */
    fun planLights(scene: Scene): List<LightPlan> {
        val out = ArrayList<LightPlan>()
        var shadowGiven = false
        for (l in scene.lights) {
            var castsShadow = false
            var direction: DoubleArray? = null
            var position: DoubleArray? = null
            var range: Double? = null
            if (l.type == "sun") {
                direction = l.direction
                if (!shadowGiven) {
                    castsShadow = true
                    shadowGiven = true
                }
            } else if (l.type == "point") {
                position = l.position
                range = pointLightRange(l.intensity)
            }
            out.add(LightPlan(l.type, l.color, l.intensity, direction, position, range, castsShadow))
        }
        if (scene.lights.isEmpty()) {
            val p = preset(scene.environment.preset)
            if (p.sunIntensity > 0) out.add(LightPlan("sun", p.sunColor, p.sunIntensity, p.sunDirection, null, null, true))
        }
        return out
    }

    /** Soft fill light from the sky and ground, scaled by the environment intensity; a scene ambient light adds on top. */
    fun ambientFill(scene: Scene): AmbientFill {
        val p = preset(scene.environment.preset)
        val own = scene.lights.filter { it.type == "ambient" }.sumOf { it.intensity }
        return AmbientFill(p.horizon, p.ground, Math.max(0.0, p.ambient * scene.environment.intensity + own))
    }

    fun planPost(post: ScenePost): PostPlan = PostPlan(
        bloom = post.bloom > 0,
        bloomWeight = clamp(post.bloom, 0.0, 1.0) * 0.8,
        bloomThreshold = clamp(post.bloomThreshold, 0.0, 2.0),
        vignette = post.vignette > 0,
        vignetteWeight = clamp(post.vignette, 0.0, 1.0) * 5,
        grain = post.grain > 0,
        grainIntensity = clamp(post.grain, 0.0, 1.0) * 30,
        depthOfField = post.depthOfField > 0,
        focusDistanceMm = Math.max(0.1, post.focusDistance) * 1000,
        fStop = 8 - 6.8 * clamp(post.depthOfField, 0.0, 1.0),
        toneMapping = post.toneMapping,
        exposure = post.exposure,
        contrast = post.contrast,
        saturation = post.saturation,
    )

    /** `#rrggbb` to [r, g, b] in 0..1 (sRGB). Anything else gives mid grey. */
    fun hexToRgb(hex: String): DoubleArray {
        if (hex.length != 7 || hex[0] != '#') return doubleArrayOf(0.5, 0.5, 0.5)
        val n = hex.substring(1).toIntOrNull(16) ?: return doubleArrayOf(0.5, 0.5, 0.5)
        if (hex.substring(1).any { Character.digit(it, 16) < 0 }) return doubleArrayOf(0.5, 0.5, 0.5)
        return doubleArrayOf(((n shr 16) and 255) / 255.0, ((n shr 8) and 255) / 255.0, (n and 255) / 255.0)
    }

    /**
     * Colour (sRGB, 0..1) of the sky in the direction whose height is [y] (-1 straight down … 0 the horizon … 1
     * straight up): the horizon colour blends up to the top colour (quickly at first) and down to the ground colour.
     */
    fun skyColorAt(preset: SkyPreset, y: Double): DoubleArray {
        val h = clamp(if (y.isNaN() || y.isInfinite()) 0.0 else y, -1.0, 1.0)
        val from = hexToRgb(preset.horizon)
        val to = hexToRgb(if (h >= 0) preset.top else preset.ground)
        val k = if (h >= 0) Math.pow(h, 0.6) else Math.min(1.0, -h * 3)
        return doubleArrayOf(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k)
    }
}
