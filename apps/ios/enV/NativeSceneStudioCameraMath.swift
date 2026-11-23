// UNVERIFIED: never compiled (no Swift compiler on the machine that wrote it). Mirrors the Kotlin port in
// apps/android/.../scenestudio/SceneCameraMath.kt, which has been compiled and run against the shared vectors.
// Not yet listed in enV.xcodeproj: see apps/ios/NATIVE_SCENE_STUDIO.md.
import Foundation

/// Camera orientation and "where is this 3D point on the screen", as pure arithmetic. Same rules as
/// src/lib/scene-studio/camera-math.ts (the caption placement under the speaker uses it).
///
/// Right-handed, +Y up, the camera looks along `forward`, the picture's right is `forward x up`. `roll` tilts the
/// camera's up direction toward its right by that many degrees. Pixels: origin top-left, +y down.
public struct SceneStudioCameraBasis {
    public let position: [Double]
    public let forward: [Double]
    /// The picture's right-hand direction.
    public let right: [Double]
    /// The picture's up direction (already rolled).
    public let up: [Double]
}

/// Pixels from the left and top edge, and the distance in front of the camera in metres.
public struct SceneStudioScreenPoint {
    public let x: Double
    public let y: Double
    public let depth: Double
}

public enum SceneStudioCameraMath {
    private static let deg = Double.pi / 180

    private static func sub(_ a: [Double], _ b: [Double]) -> [Double] { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
    private static func dot(_ a: [Double], _ b: [Double]) -> Double { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
    private static func cross(_ a: [Double], _ b: [Double]) -> [Double] {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    }
    private static func length(_ a: [Double]) -> Double { return (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).squareRoot() }
    private static func normalize(_ a: [Double]) -> [Double] {
        let l = length(a)
        return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]
    }

    /// Orthonormal camera axes. Looking straight down (or up) there is no "up" to keep level, so the top of the
    /// picture points toward -Z when looking down and +Z when looking up. A camera exactly on its target looks down -Z.
    public static func cameraBasis(position: [Double], lookAt: [Double], rollDegrees: Double) -> SceneStudioCameraBasis {
        var forward = normalize(sub(lookAt, position))
        if length(forward) == 0 { forward = [0, 0, -1] }
        var right = cross(forward, [0, 1, 0])
        if length(right) < 1e-6 { right = cross(forward, forward[1] < 0 ? [0, 0, -1] : [0, 0, 1]) }
        right = normalize(right)
        let up = normalize(cross(right, forward))
        let roll = rollDegrees * deg
        let c = cos(roll)
        let s = sin(roll)
        return SceneStudioCameraBasis(
            position: position,
            forward: forward,
            right: normalize([right[0] * c - up[0] * s, right[1] * c - up[1] * s, right[2] * c - up[2] * s]),
            up: normalize([up[0] * c + right[0] * s, up[1] * c + right[1] * s, up[2] * c + right[2] * s])
        )
    }

    public static func cameraBasis(_ camera: SceneStudioCameraState) -> SceneStudioCameraBasis {
        return cameraBasis(position: camera.position, lookAt: camera.lookAt, rollDegrees: camera.roll)
    }

    /// Where a world point lands in a picture of `width` x `height` pixels, or nil when it cannot be drawn (behind a
    /// perspective camera, or an orthographic camera with no height). Points outside the picture still give numbers.
    public static func projectToScreen(_ point: [Double], _ camera: SceneStudioCameraState, width: Double, height: Double) -> SceneStudioScreenPoint? {
        let b = cameraBasis(camera)
        let d = sub(point, b.position)
        let depth = dot(d, b.forward)
        let aspect = width / height
        let ndcX: Double
        let ndcY: Double
        if camera.type == "orthographic" {
            let half = camera.orthoHeight / 2
            if !(half > 0) { return nil }
            ndcX = dot(d, b.right) / (half * aspect)
            ndcY = dot(d, b.up) / half
        } else {
            if !(depth > 1e-6) { return nil }
            let t = tan(camera.fov * deg * 0.5)
            if !(t > 0) { return nil }
            ndcX = dot(d, b.right) / (depth * t * aspect)
            ndcY = dot(d, b.up) / (depth * t)
        }
        return SceneStudioScreenPoint(x: (ndcX * 0.5 + 0.5) * width, y: (0.5 - ndcY * 0.5) * height, depth: depth)
    }

    /// Matches each dialogue speaker to an object (same id, then the same id ignoring capitals) and returns where its
    /// base is on screen. `worldPosition` gives an object's world position (the renderer knows about parents).
    public static func speakerAnchors(
        speakers: [String],
        objectIDs: [String],
        worldPosition: (String) -> [Double]?,
        camera: SceneStudioCameraState,
        width: Double,
        height: Double
    ) -> [String: [Double]] {
        var out: [String: [Double]] = [:]
        for speaker in speakers {
            if out[speaker] != nil { continue }
            let lower = speaker.lowercased()
            guard let id = objectIDs.first(where: { $0 == speaker }) ?? objectIDs.first(where: { $0.lowercased() == lower }) else { continue }
            guard let at = worldPosition(id) else { continue }
            guard let p = projectToScreen(at, camera, width: width, height: height) else { continue }
            out[speaker] = [p.x, p.y]
        }
        return out
    }
}
