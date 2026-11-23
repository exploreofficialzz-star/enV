package com.chastech.env.scenestudio

/**
 * Deterministic time and animation sampling: the same rules as src/lib/scene-studio/animation.ts, checked against
 * apps/shared/scene-studio/animation-vectors.json. Nothing here reads the clock.
 */
object SceneAnimation {
    /** Scene time is frame / fps. */
    fun timeAtFrame(frame: Int, fps: Int): Double = frame.toDouble() / fps

    /** Frames in an export: fps × duration, rounded to the nearest frame (halves round up, like the web tool). */
    fun frameCount(fps: Int, duration: Double): Int = Math.floor(fps * duration + 0.5).toInt()

    /** JavaScript's `value | 0` for the numbers a scene can hold. */
    fun toInt32(v: Double): Int = if (v.isNaN() || v.isInfinite()) 0 else v.toLong().toInt()

    /** An unsigned 32-bit value as a Double, so it can be divided by 2^32. */
    fun unsigned(v: Int): Double = (v.toLong() and 0xFFFFFFFFL).toDouble()

    /** Seeded generator (mulberry32). Same seed, same sequence, on every platform. */
    fun seededRandom(seed: Long): () -> Double {
        var a = seed.toInt()
        return {
            a += 0x6d2b79f5
            var t = a
            t = (t xor (t ushr 15)) * (t or 1)
            t = t xor (t + (t xor (t ushr 7)) * (t or 61))
            unsigned(t xor (t ushr 14)) / 4294967296.0
        }
    }

    /** Quadratic easings; "step" holds the start value until the next keyframe. */
    fun ease(name: String, t: Double): Double = when (name) {
        "easeIn" -> t * t
        "easeOut" -> 1 - (1 - t) * (1 - t)
        "easeInOut" -> if (t < 0.5) 2 * t * t else 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2
        "step" -> 0.0
        else -> t
    }

    /** Spherical blend of two unit quaternions: shortest path, a normalised lerp when nearly parallel. */
    fun slerp(a: DoubleArray, b: DoubleArray, u: Double): DoubleArray {
        var dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
        val bb = if (dot < 0) doubleArrayOf(-b[0], -b[1], -b[2], -b[3]) else b.copyOf()
        dot = Math.abs(dot)
        val wa: Double
        val wb: Double
        if (dot > 0.9995) {
            wa = 1 - u
            wb = u
        } else {
            val theta = Math.acos(dot)
            val sin = Math.sin(theta)
            wa = Math.sin((1 - u) * theta) / sin
            wb = Math.sin(u * theta) / sin
        }
        val r = DoubleArray(4) { wa * a[it] + wb * bb[it] }
        val len = Math.hypot(Math.hypot(r[0], r[1]), Math.hypot(r[2], r[3]))
        return doubleArrayOf(r[0] / len, r[1] / len, r[2] / len, r[3] / len)
    }

    private fun hexChannels(h: String): IntArray? {
        if (h.length != 7 || h[0] != '#') return null
        return try {
            intArrayOf(h.substring(1, 3).toInt(16), h.substring(3, 5).toInt(16), h.substring(5, 7).toInt(16))
        } catch (e: NumberFormatException) {
            null
        }
    }

    private fun rgbToHex(c: DoubleArray): String {
        val sb = StringBuilder("#")
        for (n in c) {
            val v = Math.floor(Math.min(255.0, Math.max(0.0, n)) + 0.5).toInt() // JavaScript's Math.round: halves go up
            sb.append("0123456789abcdef"[v shr 4]).append("0123456789abcdef"[v and 15])
        }
        return sb.toString()
    }

    private fun mix(property: String, a: TrackValue, b: TrackValue, u: Double): TrackValue {
        if (property == "clip" || property == "visible") return a // names and booleans hold their value
        if (property == "quaternion" && a is TrackValue.Vec && b is TrackValue.Vec) return TrackValue.Vec(slerp(a.v, b.v, u))
        if (property == "color" && a is TrackValue.Text && b is TrackValue.Text) {
            val ca = hexChannels(a.v)
            val cb = hexChannels(b.v)
            if (ca != null && cb != null) return TrackValue.Text(rgbToHex(DoubleArray(3) { ca[it] + (cb[it] - ca[it]) * u }))
            return a
        }
        if (a is TrackValue.Num && b is TrackValue.Num) return TrackValue.Num(a.v + (b.v - a.v) * u)
        if (a is TrackValue.Vec && b is TrackValue.Vec && a.v.size == b.v.size) return TrackValue.Vec(DoubleArray(a.v.size) { a.v[it] + (b.v[it] - a.v[it]) * u })
        return a
    }

    /**
     * Value of a track at a time in seconds: before the first keyframe the first value, after the last the last
     * value; `loop` wraps time around the last keyframe's time; between keyframes the segment's easing (the
     * keyframe's own, else the track's) shapes the blend. Quaternions blend by slerp, colours per sRGB channel,
     * and booleans and clip names hold the earlier value.
     */
    fun sampleTrack(track: AnimationTrack, time: Double): TrackValue {
        val k = track.keyframes
        val last = k[k.size - 1]
        var t = time
        if (track.loop && last.time > 0) t = ((t % last.time) + last.time) % last.time
        if (t <= k[0].time) return k[0].value
        if (t >= last.time) return last.value
        var i = 0
        while (i < k.size - 2 && t >= k[i + 1].time) i++
        val a = k[i]
        val b = k[i + 1]
        if (b.time == a.time) return b.value
        val u = ease(a.easing ?: track.easing, (t - a.time) / (b.time - a.time))
        return mix(track.property, a.value, b.value, u)
    }

    /** Integer hash to [-1, 1] using only 32-bit wrapping arithmetic. */
    private fun hashNoise(seed: Int, ix: Int, channel: Int): Double {
        var h = seed xor (ix * 0x27d4eb2d) xor ((channel + 1) * 0x165667b1)
        h = (h xor (h ushr 15)) * 0x85ebca6bL.toInt()
        h = h xor (h ushr 13)
        h *= 0xc2b2ae35L.toInt()
        h = h xor (h ushr 16)
        return (unsigned(h) / 4294967296.0) * 2 - 1
    }

    /** Smooth 1D value noise in [-1, 1] (smoothstep between lattice hashes). */
    fun valueNoise(seed: Long, x: Double, channel: Int): Double {
        val i = Math.floor(x)
        val f = x - i
        val u = f * f * (3 - 2 * f)
        val s = seed.toInt()
        val a = hashNoise(s, toInt32(i), channel)
        val b = hashNoise(s, toInt32(i + 1), channel)
        return a + (b - a) * u
    }

    /** Deterministic handheld shake: three values in [-amount, amount]. */
    fun cameraShake(seed: Long, time: Double, amount: Double, speed: Double): DoubleArray {
        if (amount == 0.0) return doubleArrayOf(0.0, 0.0, 0.0)
        val x = time * speed
        return doubleArrayOf(valueNoise(seed, x, 0) * amount, valueNoise(seed, x, 1) * amount, valueNoise(seed, x, 2) * amount)
    }

    /** The shot in effect at a time (the latest that has started), or null for the base camera. Shots are sorted by start. */
    fun activeShotAt(shots: List<SceneShot>, time: Double): Int? {
        var found: Int? = null
        for (i in shots.indices) if (shots[i].start <= time) found = i
        return found
    }

    /** A layer is on screen from start (inclusive) to end (exclusive) while visible. */
    fun layerOnScreen(start: Double, end: Double, visible: Boolean, time: Double): Boolean = visible && time >= start && time < end
}
