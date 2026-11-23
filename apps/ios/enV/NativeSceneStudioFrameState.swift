// UNVERIFIED: never compiled (no Swift compiler on the machine that wrote it). Mirrors the Kotlin port in
// apps/android/.../scenestudio/SceneFrameState.kt, which has been compiled and run against the shared vectors.
// Not yet listed in enV.xcodeproj: see apps/ios/NATIVE_SCENE_STUDIO.md.
import Foundation

/// "What is on screen at frame N": turns a scene plus a frame number into concrete values (camera, every object's
/// transform, every visible 2D layer). Same rules as src/lib/scene-studio/frame-state.ts, checked against
/// apps/shared/scene-studio/frame-vectors.json.
///
///  - time = frame / fps; nothing reads a clock.
///  - Rotation: animated quaternion > animated Euler rotation > the object's quaternion > its Euler rotation.
///    Euler angles are degrees; order "XYZ" means q = qx * qy * qz (three.js and Blender).
///  - Camera: the active shot (latest started) replaces the base camera completely, including shake. Tracks aimed
///    at "camera" apply to the base camera only; tracks aimed at a shot id apply to that shot. Shake moves the
///    camera by 5 cm x the noise value in x and y and rolls it by 0.5 degrees x the third value. An orthographic
///    camera shows the height a perspective one would at the look-at distance: 2 x distance x tan(fov / 2).
///  - Clips: playback time is seconds since the clip was switched on x clipSpeed. Renderers loop it by the clip's length.
public struct SceneStudioCameraState {
    public let type: String
    public let position: [Double]
    public let lookAt: [Double]
    /// Vertical field of view in degrees.
    public let fov: Double
    /// Roll in degrees from handheld shake.
    public let roll: Double
    /// Visible height in metres for an orthographic camera (0 for perspective).
    public let orthoHeight: Double
    /// Index into the scene's shots, or nil when the base camera is used.
    public let shotIndex: Int?
}

public struct SceneStudioObjectState {
    public let id: String
    public let type: String
    /// Local to the parent, or to the world when there is no parent.
    public let position: [Double]
    public let quaternion: [Double]
    public let scale: [Double]
    public let color: String?
    public let opacity: Double
    public let visible: Bool
    public let parent: String?
    public let clip: String?
    /// Seconds into the clip, before looping.
    public let clipTime: Double
}

public struct SceneStudioLayerState {
    public let id: String
    public let type: String
    public let plane: String
    public let position: [Double]
    public let size: [Double]
    public let anchor: [Double]
    public let scale: [Double]
    public let rotation: Double
    public let opacity: Double
    public let color: String?
    public let text: String?
    public let font: String
    public let fontSize: Double
    public let strokeColor: String?
    public let strokeWidth: Double
    public let asset: String?
}

public struct SceneStudioFrameState {
    public let frame: Int
    public let time: Double
    public let camera: SceneStudioCameraState
    /// Every object in scene order, including hidden ones (renderers decide what to skip).
    public let objects: [SceneStudioObjectState]
    /// Layers on screen at this time, in scene order.
    public let layers: [SceneStudioLayerState]
}

public enum SceneStudioFrame {
    private static let deg = Double.pi / 180
    private static let shakeMetres = 0.05
    private static let shakeRollDegrees = 0.5

    public static func quatMultiply(_ a: [Double], _ b: [Double]) -> [Double] {
        return [
            a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
            a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
            a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
            a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
        ]
    }

    private static func axisRotation(_ axis: Int, _ degrees: Double) -> [Double] {
        let half = degrees * deg * 0.5
        var q: [Double] = [0, 0, 0, cos(half)]
        q[axis] = sin(half)
        return q
    }

    /// Euler angles in degrees ([x, y, z]) to a unit quaternion [x, y, z, w], multiplied in the order's letters.
    public static func eulerToQuaternion(_ rotation: [Double], _ order: String) -> [Double] {
        var q: [Double] = [0, 0, 0, 1]
        for letter in order {
            let axis: Int
            if letter == "X" { axis = 0 } else if letter == "Y" { axis = 1 } else if letter == "Z" { axis = 2 } else { continue }
            q = quatMultiply(q, axisRotation(axis, rotation[axis]))
        }
        return q
    }

    private static func vec(_ v: SceneStudioTrackValue?, _ n: Int) -> [Double]? {
        if case .vector(let x)? = v, x.count == n { return x }
        return nil
    }

    private static func scale3(_ v: SceneStudioTrackValue?) -> [Double]? {
        if case .number(let n)? = v { return [n, n, n] }
        return vec(v, 3)
    }

    private static func vec2(_ v: SceneStudioTrackValue?) -> [Double]? {
        if case .number(let n)? = v { return [n, n] }
        return vec(v, 2)
    }

    private static func number(_ v: SceneStudioTrackValue?) -> Double? {
        if case .number(let n)? = v { return n }
        return nil
    }

    private static func string(_ v: SceneStudioTrackValue?) -> String? {
        if case .text(let s)? = v { return s }
        return nil
    }

    private static func flag(_ v: SceneStudioTrackValue?) -> Bool? {
        if case .flag(let b)? = v { return b }
        return nil
    }

    /// Prepares a scene once; `at(frame:)` then answers for any frame, in any order.
    public final class Sampler {
        private let scene: SceneStudioScene
        private var tracks: [String: [String: SceneStudioAnimationTrack]] = [:]

        public init(scene: SceneStudioScene) {
            self.scene = scene
            for track in scene.animations {
                var byProperty = tracks[track.target] ?? [:]
                byProperty[track.property] = track // a later track wins
                tracks[track.target] = byProperty
            }
        }

        private func get(_ target: String, _ property: String, _ time: Double) -> SceneStudioTrackValue? {
            guard let track = tracks[target]?[property] else { return nil }
            return SceneStudioAnimation.sampleTrack(track, time)
        }

        public func at(frame: Int) -> SceneStudioFrameState {
            let time = SceneStudioAnimation.timeAtFrame(frame, scene.settings.fps)

            // camera
            let shotIndex = SceneStudioAnimation.activeShotAt(scene.shots, time)
            let base: SceneStudioCamera
            let targetID: String
            if let index = shotIndex {
                base = scene.shots[index].camera
                targetID = scene.shots[index].id
            } else {
                base = scene.camera
                targetID = "camera"
            }
            let position = SceneStudioFrame.vec(get(targetID, "position", time), 3) ?? base.position
            let lookAt = SceneStudioFrame.vec(get(targetID, "lookAt", time), 3) ?? base.lookAt
            let fov = SceneStudioFrame.number(get(targetID, "fov", time)) ?? base.fov
            let shake = SceneStudioAnimation.cameraShake(seed: scene.settings.seed, time: time, amount: base.shakeAmount, speed: base.shakeSpeed)
            let shaken: [Double] = [position[0] + shake[0] * SceneStudioFrame.shakeMetres, position[1] + shake[1] * SceneStudioFrame.shakeMetres, position[2]]
            let dx = lookAt[0] - position[0]
            let dy = lookAt[1] - position[1]
            let dz = lookAt[2] - position[2]
            let distance = (dx * dx + dy * dy + dz * dz).squareRoot()
            let camera = SceneStudioCameraState(
                type: base.type,
                position: shaken,
                lookAt: lookAt,
                fov: fov,
                roll: shake[2] * SceneStudioFrame.shakeRollDegrees,
                orthoHeight: base.type == "orthographic" ? 2 * distance * tan(fov * SceneStudioFrame.deg * 0.5) : 0,
                shotIndex: shotIndex
            )

            // objects
            var objects: [SceneStudioObjectState] = []
            for o in scene.objects {
                let animatedQuaternion = SceneStudioFrame.vec(get(o.id, "quaternion", time), 4)
                let animatedRotation = SceneStudioFrame.vec(get(o.id, "rotation", time), 3)
                let quaternion: [Double]
                if let q = animatedQuaternion {
                    quaternion = q
                } else if let r = animatedRotation {
                    quaternion = SceneStudioFrame.eulerToQuaternion(r, o.rotationOrder)
                } else if let q = o.quaternion {
                    quaternion = q
                } else {
                    quaternion = SceneStudioFrame.eulerToQuaternion(o.rotation, o.rotationOrder)
                }
                var clip = o.clip
                var since = 0.0
                if let clipTrack = tracks[o.id]?["clip"] {
                    clip = SceneStudioFrame.string(SceneStudioAnimation.sampleTrack(clipTrack, time)) ?? clip
                    for k in clipTrack.keyframes where k.time <= time && k.time > since { since = k.time }
                }
                objects.append(SceneStudioObjectState(
                    id: o.id,
                    type: o.type,
                    position: SceneStudioFrame.vec(get(o.id, "position", time), 3) ?? o.position,
                    quaternion: quaternion,
                    scale: SceneStudioFrame.scale3(get(o.id, "scale", time)) ?? o.scale,
                    color: SceneStudioFrame.string(get(o.id, "color", time)) ?? o.color,
                    opacity: SceneStudioFrame.number(get(o.id, "opacity", time)) ?? o.opacity,
                    visible: SceneStudioFrame.flag(get(o.id, "visible", time)) ?? o.visible,
                    parent: o.parent,
                    clip: clip,
                    clipTime: clip == nil ? 0 : max(0, time - since) * o.clipSpeed
                ))
            }

            // layers
            var layers: [SceneStudioLayerState] = []
            for l in scene.layers {
                let visible = SceneStudioFrame.flag(get(l.id, "visible", time)) ?? l.visible
                if !SceneStudioAnimation.layerOnScreen(start: l.start, end: l.end, visible: visible, time: time) { continue }
                layers.append(SceneStudioLayerState(
                    id: l.id,
                    type: l.type,
                    plane: l.plane,
                    position: SceneStudioFrame.vec2(get(l.id, "position", time)) ?? l.position,
                    size: l.size,
                    anchor: l.anchor,
                    scale: SceneStudioFrame.vec2(get(l.id, "scale", time)) ?? l.scale,
                    rotation: SceneStudioFrame.number(get(l.id, "rotation", time)) ?? l.rotation,
                    opacity: SceneStudioFrame.number(get(l.id, "opacity", time)) ?? l.opacity,
                    color: SceneStudioFrame.string(get(l.id, "color", time)) ?? l.color,
                    text: l.text,
                    font: l.font,
                    fontSize: l.fontSize,
                    strokeColor: l.strokeColor,
                    strokeWidth: l.strokeWidth,
                    asset: l.asset
                ))
            }
            return SceneStudioFrameState(frame: frame, time: time, camera: camera, objects: objects, layers: layers)
        }
    }
}
