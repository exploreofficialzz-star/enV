package com.chastech.env.scenestudio

/**
 * "What is on screen at frame N": turns a scene plus a frame number into concrete values (camera, every object's
 * transform, every visible 2D layer). Same rules as src/lib/scene-studio/frame-state.ts, checked against
 * apps/shared/scene-studio/frame-vectors.json.
 *
 *  - time = frame / fps; nothing reads a clock.
 *  - Rotation: animated quaternion > animated Euler rotation > the object's quaternion > its Euler rotation.
 *    Euler angles are degrees; order "XYZ" means q = qx ⊗ qy ⊗ qz (three.js and Blender).
 *  - Camera: the active shot (latest started) replaces the base camera completely, including shake. Tracks aimed
 *    at "camera" apply to the base camera only; tracks aimed at a shot id apply to that shot. Shake moves the
 *    camera by 5 cm × the noise value in x and y and rolls it by 0.5° × the third value. An orthographic camera
 *    shows the height a perspective one would at the look-at distance: 2 × distance × tan(fov / 2).
 *  - Clips: playback time is seconds since the clip was switched on × clipSpeed. Renderers loop it by the clip's length.
 */
class CameraState(
    val type: String,
    val position: DoubleArray,
    val lookAt: DoubleArray,
    /** Vertical field of view in degrees. */
    val fov: Double,
    /** Roll in degrees from handheld shake. */
    val roll: Double,
    /** Visible height in metres for an orthographic camera (0 for perspective). */
    val orthoHeight: Double,
    /** Index into the scene's shots, or null when the base camera is used. */
    val shotIndex: Int?,
)

class ObjectState(
    val id: String,
    val type: String,
    /** Local to the parent, or to the world when there is no parent. */
    val position: DoubleArray,
    val quaternion: DoubleArray,
    val scale: DoubleArray,
    val color: String?,
    val opacity: Double,
    val visible: Boolean,
    val parent: String?,
    val clip: String?,
    /** Seconds into the clip, before looping. */
    val clipTime: Double,
)

class LayerState(
    val id: String,
    val type: String,
    val plane: String,
    val position: DoubleArray,
    val size: DoubleArray,
    val anchor: DoubleArray,
    val scale: DoubleArray,
    val rotation: Double,
    val opacity: Double,
    val color: String?,
    val text: String?,
    val font: String,
    val fontSize: Double,
    val strokeColor: String?,
    val strokeWidth: Double,
    val asset: String?,
)

class FrameState(
    val frame: Int,
    val time: Double,
    val camera: CameraState,
    /** Every object in scene order, including hidden ones (renderers decide what to skip). */
    val objects: List<ObjectState>,
    /** Layers on screen at this time, in scene order. */
    val layers: List<LayerState>,
)

object SceneFrameState {
    private const val DEG = Math.PI / 180
    private const val SHAKE_METRES = 0.05
    private const val SHAKE_ROLL_DEGREES = 0.5

    fun quatMultiply(a: DoubleArray, b: DoubleArray): DoubleArray = doubleArrayOf(
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    )

    private fun axisRotation(axis: Int, degrees: Double): DoubleArray {
        val half = degrees * DEG * 0.5
        val q = doubleArrayOf(0.0, 0.0, 0.0, Math.cos(half))
        q[axis] = Math.sin(half)
        return q
    }

    /** Euler angles in degrees ([x, y, z]) to a unit quaternion [x, y, z, w], multiplied in the order's letters. */
    fun eulerToQuaternion(rotation: DoubleArray, order: String): DoubleArray {
        var q = doubleArrayOf(0.0, 0.0, 0.0, 1.0)
        for (letter in order) {
            val axis = when (letter) {
                'X' -> 0
                'Y' -> 1
                'Z' -> 2
                else -> continue
            }
            q = quatMultiply(q, axisRotation(axis, rotation[axis]))
        }
        return q
    }

    private fun vec(v: TrackValue?, n: Int): DoubleArray? = (v as? TrackValue.Vec)?.v?.takeIf { it.size == n }
    private fun scale3(v: TrackValue?): DoubleArray? = if (v is TrackValue.Num) doubleArrayOf(v.v, v.v, v.v) else vec(v, 3)
    private fun vec2(v: TrackValue?): DoubleArray? = if (v is TrackValue.Num) doubleArrayOf(v.v, v.v) else vec(v, 2)
    private fun number(v: TrackValue?): Double? = (v as? TrackValue.Num)?.v
    private fun string(v: TrackValue?): String? = (v as? TrackValue.Text)?.v
    private fun flag(v: TrackValue?): Boolean? = (v as? TrackValue.Flag)?.v

    /** Prepares a scene once; [FrameSampler.at] then answers for any frame, in any order. */
    class FrameSampler(private val scene: Scene) {
        private val tracks = HashMap<String, HashMap<String, AnimationTrack>>()

        init {
            for (track in scene.animations) tracks.getOrPut(track.target) { HashMap() }[track.property] = track // a later track wins
        }

        private fun get(target: String, property: String, time: Double): TrackValue? =
            tracks[target]?.get(property)?.let { SceneAnimation.sampleTrack(it, time) }

        fun at(frame: Int): FrameState {
            val time = SceneAnimation.timeAtFrame(frame, scene.settings.fps)

            // camera
            val shotIndex = SceneAnimation.activeShotAt(scene.shots, time)
            val base = if (shotIndex == null) scene.camera else scene.shots[shotIndex].camera
            val targetId = if (shotIndex == null) "camera" else scene.shots[shotIndex].id
            val position = vec(get(targetId, "position", time), 3) ?: base.position
            val lookAt = vec(get(targetId, "lookAt", time), 3) ?: base.lookAt
            val fov = number(get(targetId, "fov", time)) ?: base.fov
            val shake = SceneAnimation.cameraShake(scene.settings.seed, time, base.shakeAmount, base.shakeSpeed)
            val shaken = doubleArrayOf(position[0] + shake[0] * SHAKE_METRES, position[1] + shake[1] * SHAKE_METRES, position[2])
            val distance = Math.hypot(Math.hypot(lookAt[0] - position[0], lookAt[1] - position[1]), lookAt[2] - position[2])
            val camera = CameraState(
                type = base.type,
                position = shaken,
                lookAt = lookAt.copyOf(),
                fov = fov,
                roll = shake[2] * SHAKE_ROLL_DEGREES,
                orthoHeight = if (base.type == "orthographic") 2 * distance * Math.tan(fov * DEG * 0.5) else 0.0,
                shotIndex = shotIndex,
            )

            // objects
            val objects = scene.objects.map { o ->
                val animatedQuaternion = vec(get(o.id, "quaternion", time), 4)
                val animatedRotation = vec(get(o.id, "rotation", time), 3)
                val quaternion = when {
                    animatedQuaternion != null -> animatedQuaternion
                    animatedRotation != null -> eulerToQuaternion(animatedRotation, o.rotationOrder)
                    o.quaternion != null -> o.quaternion
                    else -> eulerToQuaternion(o.rotation, o.rotationOrder)
                }
                var clip = o.clip
                var since = 0.0
                val clipTrack = tracks[o.id]?.get("clip")
                if (clipTrack != null) {
                    clip = string(SceneAnimation.sampleTrack(clipTrack, time)) ?: clip
                    for (k in clipTrack.keyframes) if (k.time <= time && k.time > since) since = k.time
                }
                ObjectState(
                    id = o.id,
                    type = o.type,
                    position = vec(get(o.id, "position", time), 3) ?: o.position,
                    quaternion = quaternion,
                    scale = scale3(get(o.id, "scale", time)) ?: o.scale,
                    color = string(get(o.id, "color", time)) ?: o.color,
                    opacity = number(get(o.id, "opacity", time)) ?: o.opacity,
                    visible = flag(get(o.id, "visible", time)) ?: o.visible,
                    parent = o.parent,
                    clip = clip,
                    clipTime = if (clip == null) 0.0 else Math.max(0.0, time - since) * o.clipSpeed,
                )
            }

            // layers
            val layers = ArrayList<LayerState>()
            for (l in scene.layers) {
                val visible = flag(get(l.id, "visible", time)) ?: l.visible
                if (!SceneAnimation.layerOnScreen(l.start, l.end, visible, time)) continue
                layers.add(
                    LayerState(
                        id = l.id,
                        type = l.type,
                        plane = l.plane,
                        position = vec2(get(l.id, "position", time)) ?: l.position,
                        size = l.size,
                        anchor = l.anchor,
                        scale = vec2(get(l.id, "scale", time)) ?: l.scale,
                        rotation = number(get(l.id, "rotation", time)) ?: l.rotation,
                        opacity = number(get(l.id, "opacity", time)) ?: l.opacity,
                        color = string(get(l.id, "color", time)) ?: l.color,
                        text = l.text,
                        font = l.font,
                        fontSize = l.fontSize,
                        strokeColor = l.strokeColor,
                        strokeWidth = l.strokeWidth,
                        asset = l.asset,
                    ),
                )
            }
            return FrameState(frame, time, camera, objects, layers)
        }
    }

    fun sampler(scene: Scene): FrameSampler = FrameSampler(scene)
}
