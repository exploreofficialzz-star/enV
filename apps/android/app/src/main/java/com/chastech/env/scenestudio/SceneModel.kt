package com.chastech.env.scenestudio

/**
 * The Scene Studio scene as plain Kotlin data. This mirrors src/lib/scene-studio/types.ts (the web tool): every
 * optional field already has its value, so nothing downstream has to guess a default.
 *
 * Conventions (same on every platform): 3D is right-handed, +Y up, metres; a quaternion is [x, y, z, w];
 * Euler angles are degrees; 2D layers are pixels with the origin top-left and +y down.
 */

/** A value an animation track can hold. */
sealed class TrackValue {
    class Num(val v: Double) : TrackValue()
    /** 2, 3 or 4 numbers (a 2D position, a 3D position/scale/rotation, a quaternion). */
    class Vec(val v: DoubleArray) : TrackValue()
    class Text(val v: String) : TrackValue()
    class Flag(val v: Boolean) : TrackValue()
}

class SceneSettings(
    val width: Int,
    val height: Int,
    val fps: Int,
    /** Seconds. Scene time is always frame / fps, never the wall clock. */
    val duration: Double,
    val background: String,
    /** 0 .. 4294967295. */
    val seed: Long,
)

class SceneCamera(
    /** "perspective" or "orthographic". */
    val type: String,
    val position: DoubleArray,
    val lookAt: DoubleArray,
    /** Vertical field of view in degrees. */
    val fov: Double,
    val shakeAmount: Double,
    val shakeSpeed: Double,
)

/** A camera that takes over from `start` seconds until the next shot starts (a hard cut). */
class SceneShot(val id: String, val start: Double, val camera: SceneCamera)

class MaterialSettings(
    val metallic: Double,
    val roughness: Double,
    val emissive: String?,
    val emissiveIntensity: Double,
    val texture: String?,
    val doubleSided: Boolean,
)

class SceneEnvironment(
    /** studio, day, sunset, night, overcast or none. */
    val preset: String,
    val intensity: Double,
    val hdri: String?,
    val skybox: Boolean,
    val fogColor: String,
    val fogDensity: Double,
)

class ScenePost(
    val bloom: Double,
    val bloomThreshold: Double,
    val vignette: Double,
    val grain: Double,
    val depthOfField: Double,
    val focusDistance: Double,
    /** aces, neutral or none. */
    val toneMapping: String,
    val exposure: Double,
    val contrast: Double,
    val saturation: Double,
)

class SceneLight(
    /** sun, ambient or point. */
    val type: String,
    val intensity: Double,
    val color: String,
    val position: DoubleArray,
    val direction: DoubleArray,
)

class SceneObject(
    val id: String,
    val type: String,
    /** XYZ, XZY, YXZ, YZX, ZXY or ZYX. */
    val rotationOrder: String,
    /** When present it wins over `rotation`. */
    val quaternion: DoubleArray?,
    val material: MaterialSettings?,
    val clip: String?,
    val clipSpeed: Double,
    val asset: String?,
    val style: String?,
    val color: String?,
    val text: String?,
    val size: DoubleArray?,
    /** Numbers (Double), text (String) and true/false (Boolean). */
    val params: Map<String, Any>,
    val position: DoubleArray,
    val rotation: DoubleArray,
    val scale: DoubleArray,
    val visible: Boolean,
    val opacity: Double,
    val parent: String?,
)

class SceneLayer(
    val id: String,
    /** solid, rect, ellipse, text or image. */
    val type: String,
    /** front or back. */
    val plane: String,
    val position: DoubleArray,
    val size: DoubleArray,
    val anchor: DoubleArray,
    val scale: DoubleArray,
    val rotation: Double,
    val opacity: Double,
    val start: Double,
    val end: Double,
    val visible: Boolean,
    val color: String?,
    val text: String?,
    /** sans, serif, display or mono. */
    val font: String,
    val fontSize: Double,
    val strokeColor: String?,
    val strokeWidth: Double,
    val asset: String?,
)

class AudioTrack(val id: String, val asset: String, val start: Double, val volume: Double, val loop: Boolean)

class Keyframe(val time: Double, val value: TrackValue, val easing: String?)

class AnimationTrack(
    /** An object id, a layer id, a shot id, or "camera". */
    val target: String,
    val property: String,
    val easing: String,
    val loop: Boolean,
    val keyframes: List<Keyframe>,
)

class DialogueLine(val speaker: String, val text: String, val start: Double)

class VoiceSetting(val voice: String, val speed: Double)

class CaptionSettings(
    val enabled: Boolean,
    /** pop or classic. */
    val style: String,
    /** belowSpeaker or bottomCenter. */
    val placement: String,
    val highlightColor: String,
    val wordsPerGroup: Int,
    val anchorY: Double,
    val fontScale: Double,
    val speakerColors: Map<String, String>,
)

class ExportSettings(val format: String, val quality: String)

class Scene(
    val version: String,
    val settings: SceneSettings,
    val camera: SceneCamera,
    /** Sorted by start time. */
    val shots: List<SceneShot>,
    val lights: List<SceneLight>,
    val environment: SceneEnvironment,
    val post: ScenePost,
    val objects: List<SceneObject>,
    val layers: List<SceneLayer>,
    val audio: List<AudioTrack>,
    val animations: List<AnimationTrack>,
    val dialogue: List<DialogueLine>,
    val voices: Map<String, VoiceSetting>,
    val captions: CaptionSettings,
    val export: ExportSettings,
)
