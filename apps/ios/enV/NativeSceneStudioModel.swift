// UNVERIFIED: never compiled (no Swift compiler on the machine that wrote it). Mirrors the Kotlin model in
// apps/android/.../scenestudio/SceneModel.kt. Not yet listed in enV.xcodeproj: see apps/ios/NATIVE_SCENE_STUDIO.md.
import Foundation

/// The Scene Studio scene as plain Swift data. Mirrors src/lib/scene-studio/types.ts (the web tool): every optional
/// field already has its value. Names start with "SceneStudio" so they cannot clash with SwiftUI's own `Scene`.
///
/// Conventions (same on every platform): 3D is right-handed, +Y up, metres; a quaternion is [x, y, z, w]; Euler
/// angles are degrees; 2D layers are pixels with the origin top-left and +y down.

/// A value an animation track can hold.
public enum SceneStudioTrackValue {
    case number(Double)
    /// 2, 3 or 4 numbers (a 2D position, a 3D position/scale/rotation, a quaternion).
    case vector([Double])
    case text(String)
    case flag(Bool)
}

public struct SceneStudioSettings {
    public let width: Int
    public let height: Int
    public let fps: Int
    /// Seconds. Scene time is always frame / fps, never the wall clock.
    public let duration: Double
    public let background: String
    /// 0 ... 4294967295.
    public let seed: UInt32
}

public struct SceneStudioCamera {
    /// "perspective" or "orthographic".
    public let type: String
    public let position: [Double]
    public let lookAt: [Double]
    /// Vertical field of view in degrees.
    public let fov: Double
    public let shakeAmount: Double
    public let shakeSpeed: Double
}

/// A camera that takes over from `start` seconds until the next shot starts (a hard cut).
public struct SceneStudioShot {
    public let id: String
    public let start: Double
    public let camera: SceneStudioCamera
}

public struct SceneStudioMaterial {
    public let metallic: Double
    public let roughness: Double
    public let emissive: String?
    public let emissiveIntensity: Double
    public let texture: String?
    public let doubleSided: Bool
}

public struct SceneStudioEnvironment {
    /// studio, day, sunset, night, overcast or none.
    public let preset: String
    public let intensity: Double
    public let hdri: String?
    public let skybox: Bool
    public let fogColor: String
    public let fogDensity: Double
}

public struct SceneStudioPost {
    public let bloom: Double
    public let bloomThreshold: Double
    public let vignette: Double
    public let grain: Double
    public let depthOfField: Double
    public let focusDistance: Double
    /// aces, neutral or none.
    public let toneMapping: String
    public let exposure: Double
    public let contrast: Double
    public let saturation: Double
}

public struct SceneStudioLight {
    /// sun, ambient or point.
    public let type: String
    public let intensity: Double
    public let color: String
    public let position: [Double]
    public let direction: [Double]
}

public struct SceneStudioObject {
    public let id: String
    public let type: String
    /// XYZ, XZY, YXZ, YZX, ZXY or ZYX.
    public let rotationOrder: String
    /// When present it wins over `rotation`.
    public let quaternion: [Double]?
    public let material: SceneStudioMaterial?
    public let clip: String?
    public let clipSpeed: Double
    public let asset: String?
    public let style: String?
    public let color: String?
    public let text: String?
    public let size: [Double]?
    /// Numbers (Double), text (String) and true/false (Bool).
    public let params: [String: Any]
    public let position: [Double]
    public let rotation: [Double]
    public let scale: [Double]
    public let visible: Bool
    public let opacity: Double
    public let parent: String?

    func withoutParent() -> SceneStudioObject {
        return SceneStudioObject(
            id: id, type: type, rotationOrder: rotationOrder, quaternion: quaternion, material: material, clip: clip,
            clipSpeed: clipSpeed, asset: asset, style: style, color: color, text: text, size: size, params: params,
            position: position, rotation: rotation, scale: scale, visible: visible, opacity: opacity, parent: nil
        )
    }
}

public struct SceneStudioLayer {
    public let id: String
    /// solid, rect, ellipse, text or image.
    public let type: String
    /// front or back.
    public let plane: String
    public let position: [Double]
    public let size: [Double]
    public let anchor: [Double]
    public let scale: [Double]
    public let rotation: Double
    public let opacity: Double
    public let start: Double
    public let end: Double
    public let visible: Bool
    public let color: String?
    public let text: String?
    /// sans, serif, display or mono.
    public let font: String
    public let fontSize: Double
    public let strokeColor: String?
    public let strokeWidth: Double
    public let asset: String?
}

public struct SceneStudioAudioTrack {
    public let id: String
    public let asset: String
    public let start: Double
    public let volume: Double
    public let loop: Bool
}

public struct SceneStudioKeyframe {
    public let time: Double
    public let value: SceneStudioTrackValue
    public let easing: String?
}

public struct SceneStudioAnimationTrack {
    /// An object id, a layer id, a shot id, or "camera".
    public let target: String
    public let property: String
    public let easing: String
    public let loop: Bool
    public let keyframes: [SceneStudioKeyframe]
}

public struct SceneStudioDialogueLine {
    public let speaker: String
    public let text: String
    public let start: Double
}

public struct SceneStudioVoice {
    public let voice: String
    public let speed: Double
}

public struct SceneStudioCaptions {
    public let enabled: Bool
    /// pop or classic.
    public let style: String
    /// belowSpeaker or bottomCenter.
    public let placement: String
    public let highlightColor: String
    public let wordsPerGroup: Int
    public let anchorY: Double
    public let fontScale: Double
    public let speakerColors: [String: String]
}

public struct SceneStudioExport {
    public let format: String
    public let quality: String
}

public struct SceneStudioScene {
    public let version: String
    public let settings: SceneStudioSettings
    public let camera: SceneStudioCamera
    /// Sorted by start time.
    public let shots: [SceneStudioShot]
    public let lights: [SceneStudioLight]
    public let environment: SceneStudioEnvironment
    public let post: SceneStudioPost
    public let objects: [SceneStudioObject]
    public let layers: [SceneStudioLayer]
    public let audio: [SceneStudioAudioTrack]
    public let animations: [SceneStudioAnimationTrack]
    public let dialogue: [SceneStudioDialogueLine]
    public let voices: [String: SceneStudioVoice]
    public let captions: SceneStudioCaptions
    public let export: SceneStudioExport
}
