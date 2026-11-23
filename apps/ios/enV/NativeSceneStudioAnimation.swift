// UNVERIFIED: never compiled (no Swift compiler on the machine that wrote it). Mirrors the Kotlin port in
// apps/android/.../scenestudio/SceneAnimation.kt, which has been compiled and run against the shared vectors.
// Not yet listed in enV.xcodeproj: see apps/ios/NATIVE_SCENE_STUDIO.md.
import Foundation

/// Deterministic time and animation sampling: the same rules as src/lib/scene-studio/animation.ts, checked against
/// apps/shared/scene-studio/animation-vectors.json. Nothing here reads the clock.
public enum SceneStudioAnimation {
    /// Scene time is frame / fps.
    public static func timeAtFrame(_ frame: Int, _ fps: Int) -> Double {
        return Double(frame) / Double(fps)
    }

    /// Frames in an export: fps x duration, rounded to the nearest frame (halves round up, like the web tool).
    public static func frameCount(fps: Int, duration: Double) -> Int {
        return Int((Double(fps) * duration + 0.5).rounded(.down))
    }

    /// JavaScript's `value | 0` for the numbers a scene can hold.
    public static func toInt32(_ v: Double) -> Int32 {
        if !v.isFinite || abs(v) >= 9.0e18 { return 0 }
        return Int32(truncatingIfNeeded: Int64(v))
    }

    /// Seeded generator (mulberry32). Same seed, same sequence, on every platform.
    public static func seededRandom(seed: UInt32) -> () -> Double {
        var a: UInt32 = seed
        return {
            a = a &+ 0x6d2b79f5
            var t: UInt32 = a
            t = (t ^ (t >> 15)) &* (t | 1)
            t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
            return Double(t ^ (t >> 14)) / 4294967296.0
        }
    }

    /// Quadratic easings; "step" holds the start value until the next keyframe.
    public static func ease(_ name: String, _ t: Double) -> Double {
        switch name {
        case "easeIn": return t * t
        case "easeOut": return 1 - (1 - t) * (1 - t)
        case "easeInOut": return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2
        case "step": return 0
        default: return t
        }
    }

    /// Spherical blend of two unit quaternions: shortest path, a normalised lerp when nearly parallel.
    public static func slerp(_ a: [Double], _ b: [Double], _ u: Double) -> [Double] {
        var dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
        let bb: [Double] = dot < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b
        dot = abs(dot)
        let wa: Double
        let wb: Double
        if dot > 0.9995 {
            wa = 1 - u
            wb = u
        } else {
            let theta = acos(dot)
            let s = sin(theta)
            wa = sin((1 - u) * theta) / s
            wb = sin(u * theta) / s
        }
        var r: [Double] = []
        for i in 0..<4 { r.append(wa * a[i] + wb * bb[i]) }
        let len = (r[0] * r[0] + r[1] * r[1] + r[2] * r[2] + r[3] * r[3]).squareRoot()
        return [r[0] / len, r[1] / len, r[2] / len, r[3] / len]
    }

    private static func hexChannels(_ h: String) -> [Int]? {
        let u = Array(h.unicodeScalars)
        if u.count != 7 || u[0] != "#" { return nil }
        var out: [Int] = []
        for k in 0..<3 {
            var pair = ""
            pair.unicodeScalars.append(u[1 + 2 * k])
            pair.unicodeScalars.append(u[2 + 2 * k])
            guard let v = Int(pair, radix: 16) else { return nil }
            out.append(v)
        }
        return out
    }

    private static func rgbToHex(_ c: [Double]) -> String {
        let digits = Array("0123456789abcdef")
        var out = "#"
        for n in c {
            let v = Int((min(255.0, max(0.0, n)) + 0.5).rounded(.down)) // JavaScript's Math.round: halves go up
            out.append(digits[v >> 4])
            out.append(digits[v & 15])
        }
        return out
    }

    private static func mix(_ property: String, _ a: SceneStudioTrackValue, _ b: SceneStudioTrackValue, _ u: Double) -> SceneStudioTrackValue {
        if property == "clip" || property == "visible" { return a } // names and booleans hold their value
        if property == "quaternion", case .vector(let x) = a, case .vector(let y) = b { return .vector(slerp(x, y, u)) }
        if property == "color", case .text(let x) = a, case .text(let y) = b {
            if let ca = hexChannels(x), let cb = hexChannels(y) {
                var blended: [Double] = []
                for i in 0..<3 { blended.append(Double(ca[i]) + (Double(cb[i]) - Double(ca[i])) * u) }
                return .text(rgbToHex(blended))
            }
            return a
        }
        if case .number(let x) = a, case .number(let y) = b { return .number(x + (y - x) * u) }
        if case .vector(let x) = a, case .vector(let y) = b, x.count == y.count {
            var out: [Double] = []
            for i in 0..<x.count { out.append(x[i] + (y[i] - x[i]) * u) }
            return .vector(out)
        }
        return a
    }

    /// Value of a track at a time in seconds: before the first keyframe the first value, after the last the last
    /// value; `loop` wraps time around the last keyframe's time; between keyframes the segment's easing (the
    /// keyframe's own, else the track's) shapes the blend. Quaternions blend by slerp, colours per sRGB channel,
    /// and booleans and clip names hold the earlier value.
    public static func sampleTrack(_ track: SceneStudioAnimationTrack, _ time: Double) -> SceneStudioTrackValue {
        let k = track.keyframes
        let last = k[k.count - 1]
        var t = time
        if track.loop && last.time > 0 {
            t = (t.truncatingRemainder(dividingBy: last.time) + last.time).truncatingRemainder(dividingBy: last.time)
        }
        if t <= k[0].time { return k[0].value }
        if t >= last.time { return last.value }
        var i = 0
        while i < k.count - 2 && t >= k[i + 1].time { i += 1 }
        let a = k[i]
        let b = k[i + 1]
        if b.time == a.time { return b.value }
        let u = ease(a.easing ?? track.easing, (t - a.time) / (b.time - a.time))
        return mix(track.property, a.value, b.value, u)
    }

    /// Integer hash to [-1, 1] using only 32-bit wrapping arithmetic.
    private static func hashNoise(_ seed: UInt32, _ ix: Int32, _ channel: Int32) -> Double {
        var h: UInt32 = seed ^ (UInt32(bitPattern: ix) &* 0x27d4eb2d) ^ (UInt32(bitPattern: channel &+ 1) &* 0x165667b1)
        h = (h ^ (h >> 15)) &* 0x85ebca6b
        h = h ^ (h >> 13)
        h = h &* 0xc2b2ae35
        h = h ^ (h >> 16)
        return (Double(h) / 4294967296.0) * 2 - 1
    }

    /// Smooth 1D value noise in [-1, 1] (smoothstep between lattice hashes).
    public static func valueNoise(seed: UInt32, x: Double, channel: Int) -> Double {
        let i = x.rounded(.down)
        let f = x - i
        let u = f * f * (3 - 2 * f)
        let a = hashNoise(seed, toInt32(i), Int32(channel))
        let b = hashNoise(seed, toInt32(i + 1), Int32(channel))
        return a + (b - a) * u
    }

    /// Deterministic handheld shake: three values in [-amount, amount].
    public static func cameraShake(seed: UInt32, time: Double, amount: Double, speed: Double) -> [Double] {
        if amount == 0 { return [0, 0, 0] }
        let x = time * speed
        return [valueNoise(seed: seed, x: x, channel: 0) * amount, valueNoise(seed: seed, x: x, channel: 1) * amount, valueNoise(seed: seed, x: x, channel: 2) * amount]
    }

    /// The shot in effect at a time (the latest that has started), or nil for the base camera. Shots are sorted by start.
    public static func activeShotAt(_ shots: [SceneStudioShot], _ time: Double) -> Int? {
        var found: Int? = nil
        for i in 0..<shots.count where shots[i].start <= time { found = i }
        return found
    }

    /// A layer is on screen from start (inclusive) to end (exclusive) while visible.
    public static func layerOnScreen(start: Double, end: Double, visible: Bool, time: Double) -> Bool {
        return visible && time >= start && time < end
    }
}
