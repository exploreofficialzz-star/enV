package com.chastech.env.scenestudio

/**
 * Particles, water and the built-in character's poses as pure functions of (number, time), so a frame can be drawn
 * in any order and repeats exactly. Same rules as src/lib/scene-studio/{particles,water,character-poses}.ts, checked
 * against apps/shared/scene-studio/render-vectors.json. Hashing uses 32-bit wrapping Int arithmetic.
 */
object SceneRenderMath {
    // ---- particles -----------------------------------------------------------------------------

    val EMITTER_TYPES = listOf("rain", "snow", "smoke", "fire", "sparks", "dust", "splash")

    class EmitterParams(
        /** 0..1 */
        val intensity: Double,
        /** Width of the emitting square in metres. */
        val area: Double,
        /** Rise or fall distance in metres. */
        val height: Double,
    )

    class Particle(
        /** Metres, relative to the emitter's position (rain/snow: its top centre). */
        val x: Double,
        val y: Double,
        val z: Double,
        /** Diameter (or width for streaks) in metres. */
        val size: Double,
        /** Length of a streak along its motion, metres; 0 for round puffs. */
        val streak: Double,
        val alpha: Double,
    )

    /** 32-bit integer hash → [0, 1). */
    fun hash01(seed: Int, i: Int, salt: Int): Double {
        var h = (seed * 0x9e3779b1L.toInt()) xor (i * 0x85ebca6bL.toInt()) xor (salt * 0xc2b2ae35L.toInt())
        h = (h xor (h ushr 16)) * 0x7feb352d
        h = (h xor (h ushr 15)) * 0x846ca68bL.toInt()
        h = h xor (h ushr 16)
        return SceneAnimation.unsigned(h) / 4294967296.0
    }

    private val BASE_COUNT = mapOf("rain" to 1500, "snow" to 800, "smoke" to 60, "fire" to 80, "sparks" to 120, "dust" to 200, "splash" to 150)
    private val QUALITY_SCALE = mapOf("low" to 0.4, "medium" to 0.7, "high" to 1.0)

    fun particleCount(type: String, intensity: Double, quality: String): Int {
        val i = Math.min(1.0, Math.max(0.0, intensity))
        if (i == 0.0) return 0
        val base = BASE_COUNT[type] ?: return 0
        val scale = QUALITY_SCALE[quality] ?: 1.0
        return Math.max(1, Math.floor(base * i * scale + 0.5).toInt())
    }

    /** Default colour of each kind when the object has no colour. */
    val EMITTER_COLORS = mapOf("rain" to "#b8c4d6", "snow" to "#ffffff", "smoke" to "#8a8f98", "fire" to "#ff7a1a", "sparks" to "#ffd27a", "dust" to "#d8d2c4", "splash" to "#cfe4ff")

    /** Fire and sparks glow (added to the picture); the rest are normal translucent. */
    val EMITTER_ADDITIVE = mapOf("rain" to false, "snow" to false, "smoke" to false, "fire" to true, "sparks" to true, "dust" to false, "splash" to false)

    private fun fract(v: Double) = v - Math.floor(v)
    private fun smooth(u: Double) = u * u * (3 - 2 * u)

    /** 0 → 1 over the first `inn` of life, back to 0 over the last `out`. */
    private fun envelope(u: Double, inn: Double, out: Double) = Math.min(smooth(Math.min(1.0, u / inn)), smooth(Math.min(1.0, (1 - u) / out)))

    /** Particle number [i] of an emitter at [time] seconds. An unknown type gives a particle that cannot be seen. */
    fun particleAt(type: String, i: Int, time: Double, p: EmitterParams, seed: Int): Particle {
        val rx = hash01(seed, i, 1)
        val rz = hash01(seed, i, 2)
        val phase = hash01(seed, i, 3)
        val r4 = hash01(seed, i, 4)
        val half = p.area / 2
        val x0 = (rx - 0.5) * p.area
        val z0 = (rz - 0.5) * p.area
        when (type) {
            "rain" -> {
                val speed = 9.0
                val fall = fract(phase + (time * speed) / p.height) * p.height
                return Particle(x0 + fall * 0.06, -fall, z0, 0.012 + 0.01 * r4, 0.4 + 0.3 * r4, 0.25 + 0.25 * r4)
            }
            "snow" -> {
                val speed = 0.9 + 0.5 * r4
                val fall = fract(phase + (time * speed) / p.height) * p.height
                return Particle(x0 + 0.3 * Math.sin(time * 0.8 + phase * 20), -fall, z0 + 0.3 * Math.cos(time * 0.7 + phase * 17), 0.025 + 0.03 * r4, 0.0, 0.8)
            }
            "smoke" -> {
                val life = 4.0
                val u = fract(phase + time / life)
                return Particle(x0 * 0.1 + 0.4 * Math.sin(u * 5 + r4 * 6) * u, u * p.height, z0 * 0.1 + 0.4 * Math.cos(u * 4 + r4 * 6) * u, 0.4 + 1.2 * u, 0.0, 0.35 * envelope(u, 0.1, 0.6))
            }
            "fire" -> {
                val life = 0.8
                val u = fract(phase + time / life)
                val spread = Math.min(0.35, half * 0.1)
                return Particle((rx - 0.5) * spread * (1 - u) * 2, u * p.height, (rz - 0.5) * spread * (1 - u) * 2, (0.3 + 0.25 * r4) * (1 - 0.8 * u), 0.0, 0.9 * envelope(u, 0.08, 0.5))
            }
            "sparks" -> {
                val life = 1.2
                val u = fract(phase + time / life)
                val age = u * life
                val vx = (rx - 0.5) * 3
                val vz = (rz - 0.5) * 3
                val vy = 2 + 3 * r4
                return Particle(vx * age, vy * age - 4.9 * age * age, vz * age, 0.035, 0.08, envelope(u, 0.02, 0.4))
            }
            "dust" -> {
                val u = fract(phase + time / 12)
                return Particle(x0 + 0.4 * Math.sin(time * 0.3 + phase * 40), u * p.height, z0 + 0.4 * Math.cos(time * 0.25 + phase * 33), 0.02 + 0.02 * r4, 0.0, 0.45 * envelope(u, 0.1, 0.1))
            }
            "splash" -> {
                val life = 0.6
                val u = fract(phase + time / life)
                val age = u * life
                val angle = rx * Math.PI * 2
                val out = (0.4 + 1.2 * r4) * age
                val vy = Math.sqrt(2 * 9.8 * p.height) * (0.5 + 0.5 * rz)
                return Particle(Math.cos(angle) * out * half * 0.3, Math.max(0.0, vy * age - 4.9 * age * age), Math.sin(angle) * out * half * 0.3, 0.06 + 0.06 * r4, 0.0, 0.8 * envelope(u, 0.05, 0.4))
            }
        }
        return Particle(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    }

    // ---- water ---------------------------------------------------------------------------------

    /** Water surface height: three crossing sine waves; `flow` drifts the pattern sideways (+X). */
    fun waveHeightAt(x: Double, z: Double, time: Double, waveHeight: Double, waveSpeed: Double, flow: Double): Double {
        val xs = x - flow * time
        val t = time * waveSpeed
        val a = Math.sin(xs * 0.9 + z * 0.35 + t * 1.3)
        val b = Math.sin(xs * 0.4 - z * 0.8 + t * 0.9 + 1.7)
        val c = Math.sin(xs * 1.7 + z * 1.3 + t * 2.1 + 4.1)
        return waveHeight * (0.5 * a + 0.3 * b + 0.2 * c)
    }

    // ---- character poses -----------------------------------------------------------------------

    /**
     * Angles in radians. Swings are about the character's X axis, positive = the limb moves FORWARD (+Z, the way the
     * character faces). `armOut*` raises an arm sideways (about Z), positive = away from the body.
     */
    class Pose {
        var hipL = 0.0
        var hipR = 0.0
        var kneeL = 0.0
        var kneeR = 0.0
        var shoulderL = 0.0
        var shoulderR = 0.0
        var armOutL = 0.08
        var armOutR = 0.08
        var elbowL = 0.1
        var elbowR = 0.1
        var spinePitch = 0.0
        var bodyPitch = 0.0
        var bodyY = 0.0
        var headNod = 0.0
        var headTurn = 0.0

        /** Every angle by its shared name (the names used in render-vectors.json). */
        fun values(): Map<String, Double> = linkedMapOf(
            "hipL" to hipL, "hipR" to hipR, "kneeL" to kneeL, "kneeR" to kneeR,
            "shoulderL" to shoulderL, "shoulderR" to shoulderR, "armOutL" to armOutL, "armOutR" to armOutR,
            "elbowL" to elbowL, "elbowR" to elbowR, "spinePitch" to spinePitch, "bodyPitch" to bodyPitch,
            "bodyY" to bodyY, "headNod" to headNod, "headTurn" to headTurn,
        )
    }

    private const val TAU = Math.PI * 2

    /** An angle brought into -π..π (the same rotation), so angles that keep turning stay small. */
    private fun wrap(a: Double) = a - TAU * Math.floor((a + Math.PI) / TAU)

    /** Seconds after which a clip repeats exactly (0 = the pose never changes). */
    val CLIP_PERIOD = linkedMapOf("Idle" to 3.0, "Walk" to 1.0, "Run" to 0.625, "Wave" to 1.0, "Talk" to 2.0, "Swim" to 1.25, "Fall" to 2.0, "Sit" to 0.0)
    val CLIP_NAMES: List<String> = CLIP_PERIOD.keys.toList()

    /** Finds the built-in clip a name means (any capitals); unknown or missing names play Idle. */
    fun resolveClip(name: String?): String {
        if (name.isNullOrEmpty()) return "Idle"
        return CLIP_NAMES.firstOrNull { it.equals(name, ignoreCase = true) } ?: "Idle"
    }

    fun poseFor(clip: String?, time: Double): Pose {
        val t = if (time.isNaN() || time.isInfinite()) 0.0 else Math.max(0.0, time)
        val p = Pose()
        when (resolveClip(clip)) {
            "Idle" -> {
                val breath = Math.sin(TAU * t / 3)
                p.spinePitch = 0.02 * breath
                p.shoulderL = 0.05 * breath
                p.shoulderR = -0.05 * breath
                p.headTurn = 0.08 * Math.sin(TAU * t / 3 + 1)
            }
            "Walk" -> {
                val ph = TAU * t
                p.hipL = 0.55 * Math.sin(ph)
                p.hipR = -0.55 * Math.sin(ph)
                p.kneeL = 0.7 * Math.max(0.0, Math.sin(ph + Math.PI / 2))
                p.kneeR = 0.7 * Math.max(0.0, -Math.sin(ph + Math.PI / 2))
                p.shoulderL = -0.5 * Math.sin(ph)
                p.shoulderR = 0.5 * Math.sin(ph)
                p.elbowL = 0.2 + 0.15 * Math.max(0.0, Math.sin(ph))
                p.elbowR = 0.2 + 0.15 * Math.max(0.0, -Math.sin(ph))
                p.spinePitch = 0.05
                p.bodyY = 0.015 * Math.abs(Math.sin(ph))
            }
            "Run" -> {
                val ph = TAU * (t / 0.625)
                p.hipL = 0.95 * Math.sin(ph)
                p.hipR = -0.95 * Math.sin(ph)
                p.kneeL = 1.3 * Math.max(0.0, Math.sin(ph + Math.PI / 2))
                p.kneeR = 1.3 * Math.max(0.0, -Math.sin(ph + Math.PI / 2))
                p.shoulderL = -0.9 * Math.sin(ph)
                p.shoulderR = 0.9 * Math.sin(ph)
                p.elbowL = 1.2
                p.elbowR = 1.2
                p.spinePitch = 0.22
                p.bodyY = 0.03 * Math.abs(Math.sin(ph))
            }
            "Wave" -> {
                p.armOutR = 2.6
                p.shoulderR = 0.0
                p.elbowR = 0.5 + 0.45 * Math.sin(TAU * 2 * t)
                p.headTurn = 0.1
                p.spinePitch = 0.02
            }
            "Talk" -> {
                p.headNod = 0.08 * Math.sin(TAU * 1 * t)
                p.headTurn = 0.12 * Math.sin(TAU * 0.5 * t)
                p.shoulderL = 0.45 + 0.3 * Math.sin(TAU * 0.5 * t)
                p.shoulderR = 0.35 + 0.3 * Math.sin(TAU * 0.5 * t + 1.6)
                p.elbowL = 1.0
                p.elbowR = 1.0
            }
            "Swim" -> {
                val stroke = TAU * 0.8 * t
                p.bodyPitch = Math.PI / 2
                p.bodyY = -0.1
                p.shoulderL = wrap(stroke)
                p.shoulderR = wrap(stroke + Math.PI)
                p.elbowL = 0.4
                p.elbowR = 0.4
                p.hipL = 0.3 * Math.sin(TAU * 4 * t)
                p.hipR = -0.3 * Math.sin(TAU * 4 * t)
                p.headNod = -0.5
            }
            "Fall" -> {
                p.bodyPitch = 0.35 * Math.sin(TAU * 0.5 * t)
                p.shoulderL = 2.4 + 0.5 * Math.sin(TAU * 2 * t)
                p.shoulderR = 2.4 + 0.5 * Math.sin(TAU * 2 * t + 1.7)
                p.armOutL = 0.6
                p.armOutR = 0.6
                p.hipL = 0.4 * Math.sin(TAU * 2 * t + 0.5)
                p.hipR = 0.4 * Math.sin(TAU * 2 * t + 2.5)
                p.kneeL = 0.5
                p.kneeR = 0.5
            }
            "Sit" -> {
                p.hipL = 1.5
                p.hipR = 1.5
                p.kneeL = 1.5
                p.kneeR = 1.5
                p.bodyY = -0.27
                p.shoulderL = 0.4
                p.shoulderR = 0.4
                p.elbowL = 1.1
                p.elbowR = 1.1
            }
        }
        return p
    }
}
