package com.chastech.env.scenestudio

/**
 * Camera orientation and "where is this 3D point on the screen", as pure arithmetic. Same rules as
 * src/lib/scene-studio/camera-math.ts (the caption placement under the speaker uses it).
 *
 * Right-handed, +Y up, the camera looks along `forward`, the picture's right is `forward × up`. `roll` tilts the
 * camera's up direction toward its right by that many degrees. Pixels: origin top-left, +y down.
 */
class CameraBasis(val position: DoubleArray, val forward: DoubleArray, val right: DoubleArray, val up: DoubleArray)

/** Pixels from the left and top edge, and the distance in front of the camera in metres. */
class ScreenPoint(val x: Double, val y: Double, val depth: Double)

object SceneCameraMath {
    private const val DEG = Math.PI / 180

    private fun sub(a: DoubleArray, b: DoubleArray) = doubleArrayOf(a[0] - b[0], a[1] - b[1], a[2] - b[2])
    private fun dot(a: DoubleArray, b: DoubleArray) = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    private fun cross(a: DoubleArray, b: DoubleArray) = doubleArrayOf(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
    private fun length(a: DoubleArray) = Math.hypot(Math.hypot(a[0], a[1]), a[2])
    private fun normalize(a: DoubleArray): DoubleArray {
        val l = length(a)
        return if (l > 0) doubleArrayOf(a[0] / l, a[1] / l, a[2] / l) else doubleArrayOf(0.0, 0.0, 0.0)
    }

    /**
     * Orthonormal camera axes. Looking straight down (or up) there is no "up" to keep level, so the top of the
     * picture points toward -Z when looking down and +Z when looking up. A camera exactly on its target looks down -Z.
     */
    fun cameraBasis(position: DoubleArray, lookAt: DoubleArray, rollDegrees: Double): CameraBasis {
        var forward = normalize(sub(lookAt, position))
        if (length(forward) == 0.0) forward = doubleArrayOf(0.0, 0.0, -1.0)
        var right = cross(forward, doubleArrayOf(0.0, 1.0, 0.0))
        if (length(right) < 1e-6) right = cross(forward, if (forward[1] < 0) doubleArrayOf(0.0, 0.0, -1.0) else doubleArrayOf(0.0, 0.0, 1.0))
        right = normalize(right)
        val up = normalize(cross(right, forward))
        val roll = rollDegrees * DEG
        val c = Math.cos(roll)
        val s = Math.sin(roll)
        return CameraBasis(
            position,
            forward,
            normalize(doubleArrayOf(right[0] * c - up[0] * s, right[1] * c - up[1] * s, right[2] * c - up[2] * s)),
            normalize(doubleArrayOf(up[0] * c + right[0] * s, up[1] * c + right[1] * s, up[2] * c + right[2] * s)),
        )
    }

    fun cameraBasis(camera: CameraState): CameraBasis = cameraBasis(camera.position, camera.lookAt, camera.roll)

    /**
     * Where a world point lands in a picture of `width` × `height` pixels, or null when it cannot be drawn (behind a
     * perspective camera, or an orthographic camera with no height). Points outside the picture still give numbers.
     */
    fun projectToScreen(point: DoubleArray, camera: CameraState, width: Double, height: Double): ScreenPoint? {
        val b = cameraBasis(camera)
        val d = sub(point, b.position)
        val depth = dot(d, b.forward)
        val aspect = width / height
        val ndcX: Double
        val ndcY: Double
        if (camera.type == "orthographic") {
            val half = camera.orthoHeight / 2
            if (!(half > 0)) return null
            ndcX = dot(d, b.right) / (half * aspect)
            ndcY = dot(d, b.up) / half
        } else {
            if (!(depth > 1e-6)) return null
            val t = Math.tan(camera.fov * DEG * 0.5)
            if (!(t > 0)) return null
            ndcX = dot(d, b.right) / (depth * t * aspect)
            ndcY = dot(d, b.up) / (depth * t)
        }
        return ScreenPoint((ndcX * 0.5 + 0.5) * width, (0.5 - ndcY * 0.5) * height, depth)
    }

    /**
     * Matches each dialogue speaker to an object (same id, then the same id ignoring capitals) and returns where its
     * base is on screen. [worldPosition] gives an object's world position (the renderer knows about parents).
     */
    fun speakerAnchors(
        speakers: List<String>,
        objectIds: List<String>,
        worldPosition: (String) -> DoubleArray?,
        camera: CameraState,
        width: Double,
        height: Double,
    ): Map<String, DoubleArray> {
        val out = LinkedHashMap<String, DoubleArray>()
        for (speaker in speakers) {
            if (out.containsKey(speaker)) continue
            val id = objectIds.firstOrNull { it == speaker } ?: objectIds.firstOrNull { it.equals(speaker, ignoreCase = true) } ?: continue
            val at = worldPosition(id) ?: continue
            val p = projectToScreen(at, camera, width, height) ?: continue
            out[speaker] = doubleArrayOf(p.x, p.y)
        }
        return out
    }
}
