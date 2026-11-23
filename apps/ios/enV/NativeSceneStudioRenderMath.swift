// UNVERIFIED: never compiled (no Swift compiler on the machine that wrote it). Mirrors the Kotlin port in
// apps/android/.../scenestudio/SceneRenderMath.kt, which has been compiled and run against the shared vectors.
// Not yet listed in enV.xcodeproj: see apps/ios/NATIVE_SCENE_STUDIO.md.
import Foundation

/// Particles, water and the built-in character's poses as pure functions of (number, time), so a frame can be drawn
/// in any order and repeats exactly. Same rules as src/lib/scene-studio/{particles,water,character-poses}.ts, checked
/// against apps/shared/scene-studio/render-vectors.json. Hashing uses 32-bit wrapping UInt32 arithmetic.
public struct SceneStudioEmitterParams {
    /// 0..1
    public let intensity: Double
    /// Width of the emitting square in metres.
    public let area: Double
    /// Rise or fall distance in metres.
    public let height: Double

    public init(intensity: Double, area: Double, height: Double) {
        self.intensity = intensity
        self.area = area
        self.height = height
    }
}

public struct SceneStudioParticle {
    /// Metres, relative to the emitter's position (rain/snow: its top centre).
    public let x: Double
    public let y: Double
    public let z: Double
    /// Diameter (or width for streaks) in metres.
    public let size: Double
    /// Length of a streak along its motion, metres; 0 for round puffs.
    public let streak: Double
    public let alpha: Double
}

/// Angles in radians. Swings are about the character's X axis, positive = the limb moves FORWARD (+Z, the way the
/// character faces). `armOut*` raises an arm sideways (about Z), positive = away from the body.
public struct SceneStudioPose {
    public var hipL = 0.0
    public var hipR = 0.0
    public var kneeL = 0.0
    public var kneeR = 0.0
    public var shoulderL = 0.0
    public var shoulderR = 0.0
    public var armOutL = 0.08
    public var armOutR = 0.08
    public var elbowL = 0.1
    public var elbowR = 0.1
    public var spinePitch = 0.0
    public var bodyPitch = 0.0
    public var bodyY = 0.0
    public var headNod = 0.0
    public var headTurn = 0.0

    /// Every angle by its shared name (the names used in render-vectors.json).
    public func values() -> [String: Double] {
        return [
            "hipL": hipL, "hipR": hipR, "kneeL": kneeL, "kneeR": kneeR,
            "shoulderL": shoulderL, "shoulderR": shoulderR, "armOutL": armOutL, "armOutR": armOutR,
            "elbowL": elbowL, "elbowR": elbowR, "spinePitch": spinePitch, "bodyPitch": bodyPitch,
            "bodyY": bodyY, "headNod": headNod, "headTurn": headTurn,
        ]
    }
}

public enum SceneStudioRenderMath {
    // ---- particles -----------------------------------------------------------------------------

    public static let emitterTypes = ["rain", "snow", "smoke", "fire", "sparks", "dust", "splash"]

    /// The scene's seed (0 ... 4294967295) as the signed 32-bit value `hash01` and `particleAt` take. Use this, never
    /// `Int32(seed)`, which traps for seeds of 2^31 and above; the bits are what matter and they are kept.
    public static func seedBits(_ seed: UInt32) -> Int32 { return Int32(bitPattern: seed) }

    /// 32-bit integer hash -> [0, 1).
    public static func hash01(_ seed: Int32, _ i: Int32, _ salt: Int32) -> Double {
        var h: UInt32 = (UInt32(bitPattern: seed) &* 0x9e3779b1) ^ (UInt32(bitPattern: i) &* 0x85ebca6b) ^ (UInt32(bitPattern: salt) &* 0xc2b2ae35)
        h = (h ^ (h >> 16)) &* 0x7feb352d
        h = (h ^ (h >> 15)) &* 0x846ca68b
        h = h ^ (h >> 16)
        return Double(h) / 4294967296.0
    }

    private static let baseCount: [String: Int] = ["rain": 1500, "snow": 800, "smoke": 60, "fire": 80, "sparks": 120, "dust": 200, "splash": 150]
    private static let qualityScale: [String: Double] = ["low": 0.4, "medium": 0.7, "high": 1.0]

    public static func particleCount(type: String, intensity: Double, quality: String) -> Int {
        let i = min(1.0, max(0.0, intensity))
        if i == 0 { return 0 }
        guard let base = baseCount[type] else { return 0 }
        let scale = qualityScale[quality] ?? 1.0
        return max(1, Int((Double(base) * i * scale + 0.5).rounded(.down)))
    }

    /// Default colour of each kind when the object has no colour.
    public static let emitterColors: [String: String] = ["rain": "#b8c4d6", "snow": "#ffffff", "smoke": "#8a8f98", "fire": "#ff7a1a", "sparks": "#ffd27a", "dust": "#d8d2c4", "splash": "#cfe4ff"]

    /// Fire and sparks glow (added to the picture); the rest are normal translucent.
    public static let emitterAdditive: [String: Bool] = ["rain": false, "snow": false, "smoke": false, "fire": true, "sparks": true, "dust": false, "splash": false]

    private static func fract(_ v: Double) -> Double { return v - v.rounded(.down) }
    private static func smooth(_ u: Double) -> Double { return u * u * (3 - 2 * u) }

    /// 0 -> 1 over the first `inn` of life, back to 0 over the last `out`.
    private static func envelope(_ u: Double, _ inn: Double, _ out: Double) -> Double {
        return min(smooth(min(1.0, u / inn)), smooth(min(1.0, (1 - u) / out)))
    }

    /// Particle number `i` of an emitter at `time` seconds. An unknown type gives a particle that cannot be seen.
    public static func particleAt(type: String, i: Int32, time: Double, params p: SceneStudioEmitterParams, seed: Int32) -> SceneStudioParticle {
        let rx = hash01(seed, i, 1)
        let rz = hash01(seed, i, 2)
        let phase = hash01(seed, i, 3)
        let r4 = hash01(seed, i, 4)
        let half = p.area / 2
        let x0 = (rx - 0.5) * p.area
        let z0 = (rz - 0.5) * p.area
        switch type {
        case "rain":
            let speed = 9.0
            let fall = fract(phase + (time * speed) / p.height) * p.height
            return SceneStudioParticle(x: x0 + fall * 0.06, y: -fall, z: z0, size: 0.012 + 0.01 * r4, streak: 0.4 + 0.3 * r4, alpha: 0.25 + 0.25 * r4)
        case "snow":
            let speed = 0.9 + 0.5 * r4
            let fall = fract(phase + (time * speed) / p.height) * p.height
            return SceneStudioParticle(x: x0 + 0.3 * sin(time * 0.8 + phase * 20), y: -fall, z: z0 + 0.3 * cos(time * 0.7 + phase * 17), size: 0.025 + 0.03 * r4, streak: 0, alpha: 0.8)
        case "smoke":
            let life = 4.0
            let u = fract(phase + time / life)
            return SceneStudioParticle(x: x0 * 0.1 + 0.4 * sin(u * 5 + r4 * 6) * u, y: u * p.height, z: z0 * 0.1 + 0.4 * cos(u * 4 + r4 * 6) * u, size: 0.4 + 1.2 * u, streak: 0, alpha: 0.35 * envelope(u, 0.1, 0.6))
        case "fire":
            let life = 0.8
            let u = fract(phase + time / life)
            let spread = min(0.35, half * 0.1)
            return SceneStudioParticle(x: (rx - 0.5) * spread * (1 - u) * 2, y: u * p.height, z: (rz - 0.5) * spread * (1 - u) * 2, size: (0.3 + 0.25 * r4) * (1 - 0.8 * u), streak: 0, alpha: 0.9 * envelope(u, 0.08, 0.5))
        case "sparks":
            let life = 1.2
            let u = fract(phase + time / life)
            let age = u * life
            let vx = (rx - 0.5) * 3
            let vz = (rz - 0.5) * 3
            let vy = 2 + 3 * r4
            return SceneStudioParticle(x: vx * age, y: vy * age - 4.9 * age * age, z: vz * age, size: 0.035, streak: 0.08, alpha: envelope(u, 0.02, 0.4))
        case "dust":
            let u = fract(phase + time / 12)
            return SceneStudioParticle(x: x0 + 0.4 * sin(time * 0.3 + phase * 40), y: u * p.height, z: z0 + 0.4 * cos(time * 0.25 + phase * 33), size: 0.02 + 0.02 * r4, streak: 0, alpha: 0.45 * envelope(u, 0.1, 0.1))
        case "splash":
            let life = 0.6
            let u = fract(phase + time / life)
            let age = u * life
            let angle = rx * Double.pi * 2
            let out = (0.4 + 1.2 * r4) * age
            let vy = (2 * 9.8 * p.height).squareRoot() * (0.5 + 0.5 * rz)
            return SceneStudioParticle(x: cos(angle) * out * half * 0.3, y: max(0, vy * age - 4.9 * age * age), z: sin(angle) * out * half * 0.3, size: 0.06 + 0.06 * r4, streak: 0, alpha: 0.8 * envelope(u, 0.05, 0.4))
        default:
            return SceneStudioParticle(x: 0, y: 0, z: 0, size: 0, streak: 0, alpha: 0)
        }
    }

    // ---- water ---------------------------------------------------------------------------------

    /// Water surface height: three crossing sine waves; `flow` drifts the pattern sideways (+X).
    public static func waveHeightAt(x: Double, z: Double, time: Double, waveHeight: Double, waveSpeed: Double, flow: Double) -> Double {
        let xs = x - flow * time
        let t = time * waveSpeed
        let a = sin(xs * 0.9 + z * 0.35 + t * 1.3)
        let b = sin(xs * 0.4 - z * 0.8 + t * 0.9 + 1.7)
        let c = sin(xs * 1.7 + z * 1.3 + t * 2.1 + 4.1)
        return waveHeight * (0.5 * a + 0.3 * b + 0.2 * c)
    }

    // ---- character poses -----------------------------------------------------------------------

    private static let tau = Double.pi * 2

    /// An angle brought into -pi..pi (the same rotation), so angles that keep turning stay small.
    private static func wrap(_ a: Double) -> Double { return a - tau * ((a + Double.pi) / tau).rounded(.down) }

    /// Seconds after which a clip repeats exactly (0 = the pose never changes).
    public static let clipNames = ["Idle", "Walk", "Run", "Wave", "Talk", "Swim", "Fall", "Sit"]
    public static let clipPeriod: [String: Double] = ["Idle": 3, "Walk": 1, "Run": 0.625, "Wave": 1, "Talk": 2, "Swim": 1.25, "Fall": 2, "Sit": 0]

    /// Finds the built-in clip a name means (any capitals); unknown or missing names play Idle.
    public static func resolveClip(_ name: String?) -> String {
        guard let name = name, !name.isEmpty else { return "Idle" }
        let lower = name.lowercased()
        return clipNames.first(where: { $0.lowercased() == lower }) ?? "Idle"
    }

    public static func poseFor(clip: String?, time: Double) -> SceneStudioPose {
        let t = time.isFinite ? max(0, time) : 0
        var p = SceneStudioPose()
        switch resolveClip(clip) {
        case "Idle":
            let breath = sin(tau * t / 3)
            p.spinePitch = 0.02 * breath
            p.shoulderL = 0.05 * breath
            p.shoulderR = -0.05 * breath
            p.headTurn = 0.08 * sin(tau * t / 3 + 1)
        case "Walk":
            let ph = tau * t
            p.hipL = 0.55 * sin(ph)
            p.hipR = -0.55 * sin(ph)
            p.kneeL = 0.7 * max(0, sin(ph + Double.pi / 2))
            p.kneeR = 0.7 * max(0, -sin(ph + Double.pi / 2))
            p.shoulderL = -0.5 * sin(ph)
            p.shoulderR = 0.5 * sin(ph)
            p.elbowL = 0.2 + 0.15 * max(0, sin(ph))
            p.elbowR = 0.2 + 0.15 * max(0, -sin(ph))
            p.spinePitch = 0.05
            p.bodyY = 0.015 * abs(sin(ph))
        case "Run":
            let ph = tau * (t / 0.625)
            p.hipL = 0.95 * sin(ph)
            p.hipR = -0.95 * sin(ph)
            p.kneeL = 1.3 * max(0, sin(ph + Double.pi / 2))
            p.kneeR = 1.3 * max(0, -sin(ph + Double.pi / 2))
            p.shoulderL = -0.9 * sin(ph)
            p.shoulderR = 0.9 * sin(ph)
            p.elbowL = 1.2
            p.elbowR = 1.2
            p.spinePitch = 0.22
            p.bodyY = 0.03 * abs(sin(ph))
        case "Wave":
            p.armOutR = 2.6
            p.shoulderR = 0
            p.elbowR = 0.5 + 0.45 * sin(tau * 2 * t)
            p.headTurn = 0.1
            p.spinePitch = 0.02
        case "Talk":
            p.headNod = 0.08 * sin(tau * 1 * t)
            p.headTurn = 0.12 * sin(tau * 0.5 * t)
            p.shoulderL = 0.45 + 0.3 * sin(tau * 0.5 * t)
            p.shoulderR = 0.35 + 0.3 * sin(tau * 0.5 * t + 1.6)
            p.elbowL = 1.0
            p.elbowR = 1.0
        case "Swim":
            let stroke = tau * 0.8 * t
            p.bodyPitch = Double.pi / 2
            p.bodyY = -0.1
            p.shoulderL = wrap(stroke)
            p.shoulderR = wrap(stroke + Double.pi)
            p.elbowL = 0.4
            p.elbowR = 0.4
            p.hipL = 0.3 * sin(tau * 4 * t)
            p.hipR = -0.3 * sin(tau * 4 * t)
            p.headNod = -0.5
        case "Fall":
            p.bodyPitch = 0.35 * sin(tau * 0.5 * t)
            p.shoulderL = 2.4 + 0.5 * sin(tau * 2 * t)
            p.shoulderR = 2.4 + 0.5 * sin(tau * 2 * t + 1.7)
            p.armOutL = 0.6
            p.armOutR = 0.6
            p.hipL = 0.4 * sin(tau * 2 * t + 0.5)
            p.hipR = 0.4 * sin(tau * 2 * t + 2.5)
            p.kneeL = 0.5
            p.kneeR = 0.5
        case "Sit":
            p.hipL = 1.5
            p.hipR = 1.5
            p.kneeL = 1.5
            p.kneeR = 1.5
            p.bodyY = -0.27
            p.shoulderL = 0.4
            p.shoulderR = 0.4
            p.elbowL = 1.1
            p.elbowR = 1.1
        default:
            break
        }
        return p
    }
}
