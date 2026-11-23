// UNVERIFIED: never compiled (no Swift compiler on the machine that wrote it). Mirrors the Kotlin port in
// apps/android/.../scenestudio/SceneLook.kt, which has been compiled and run against the shared vectors.
// Not yet listed in enV.xcodeproj: see apps/ios/NATIVE_SCENE_STUDIO.md.
import Foundation

/// The "look" of a scene as plain numbers: sky and lighting presets, how the scene's lights become renderer lights,
/// how post-processing settings map to renderer controls, and what each quality level costs. Same numbers as
/// src/lib/scene-studio/render-look.ts, so every platform's renderer starts from the same picture.
public struct SceneStudioSkyPreset {
    /// Sky colours, top -> horizon, and the ground colour for light bounced from below.
    public let top: String
    public let horizon: String
    public let ground: String
    /// Ambient (sky) light strength before the scene's own environment intensity is applied.
    public let ambient: Double
    /// The key light this preset adds when the scene lists no lights of its own.
    public let sunColor: String
    public let sunIntensity: Double
    public let sunDirection: [Double]
}

public struct SceneStudioLightPlan {
    /// "sun", "ambient" or "point".
    public let kind: String
    public let color: String
    public let intensity: Double
    public let direction: [Double]?
    public let position: [Double]?
    /// Point lights only: the distance in metres over which the light fades to nothing.
    public let range: Double?
    /// At most one light (the first sun) casts shadows.
    public let castsShadow: Bool
}

public struct SceneStudioAmbientFill {
    public let skyColor: String
    public let groundColor: String
    public let intensity: Double
}

public struct SceneStudioPostPlan {
    public let bloom: Bool
    public let bloomWeight: Double
    public let bloomThreshold: Double
    public let vignette: Bool
    public let vignetteWeight: Double
    public let grain: Bool
    public let grainIntensity: Double
    public let depthOfField: Bool
    /// Distance kept sharp, in millimetres (the renderer's unit for lens settings).
    public let focusDistanceMm: Double
    public let fStop: Double
    public let toneMapping: String
    public let exposure: Double
    public let contrast: Double
    public let saturation: Double
}

public struct SceneStudioQualityPlan {
    public let shadowMapSize: Int
    public let msaaSamples: Int
    public let particleScale: Double
    public let waterGrid: Int
}

public enum SceneStudioLook {
    public static let skyPresets: [String: SceneStudioSkyPreset] = [
        "studio": SceneStudioSkyPreset(top: "#d9dde3", horizon: "#eef0f3", ground: "#8d9097", ambient: 0.55, sunColor: "#ffffff", sunIntensity: 2.5, sunDirection: [-0.4, -1.0, -0.6]),
        "day": SceneStudioSkyPreset(top: "#5b9bd5", horizon: "#cfe6f7", ground: "#7a8a6a", ambient: 0.6, sunColor: "#fff4e0", sunIntensity: 3.0, sunDirection: [-0.5, -0.8, -0.3]),
        "sunset": SceneStudioSkyPreset(top: "#3b3f7a", horizon: "#f2a65a", ground: "#3a2f35", ambient: 0.35, sunColor: "#ff9a4d", sunIntensity: 2.2, sunDirection: [-0.9, -0.25, -0.2]),
        "night": SceneStudioSkyPreset(top: "#04060f", horizon: "#101a33", ground: "#07090f", ambient: 0.18, sunColor: "#9fb4ff", sunIntensity: 0.8, sunDirection: [0.3, -0.8, -0.5]),
        "overcast": SceneStudioSkyPreset(top: "#9aa3ad", horizon: "#c3c9cf", ground: "#6d7279", ambient: 0.8, sunColor: "#ffffff", sunIntensity: 0.6, sunDirection: [0.0, -1.0, -0.1]),
        "none": SceneStudioSkyPreset(top: "#808080", horizon: "#808080", ground: "#808080", ambient: 0.3, sunColor: "#ffffff", sunIntensity: 0.0, sunDirection: [0.0, -1.0, 0.0]),
    ]

    public static let qualityPlans: [String: SceneStudioQualityPlan] = [
        "low": SceneStudioQualityPlan(shadowMapSize: 1024, msaaSamples: 1, particleScale: 0.4, waterGrid: 32),
        "medium": SceneStudioQualityPlan(shadowMapSize: 2048, msaaSamples: 4, particleScale: 0.7, waterGrid: 64),
        "high": SceneStudioQualityPlan(shadowMapSize: 4096, msaaSamples: 8, particleScale: 1.0, waterGrid: 96),
    ]

    private static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { return min(hi, max(lo, v)) }

    private static func preset(_ name: String) -> SceneStudioSkyPreset {
        return skyPresets[name] ?? skyPresets["studio"]!
    }

    /// A point light fades out over 10 m plus 4 m per point of intensity (at most 90 m).
    public static func pointLightRange(_ intensity: Double) -> Double { return clamp(10 + 4 * intensity, 10, 90) }

    /// Lights to create: the scene's own, plus the preset's key light when the scene lists none.
    public static func planLights(_ scene: SceneStudioScene) -> [SceneStudioLightPlan] {
        var out: [SceneStudioLightPlan] = []
        var shadowGiven = false
        for l in scene.lights {
            var castsShadow = false
            var direction: [Double]? = nil
            var position: [Double]? = nil
            var range: Double? = nil
            if l.type == "sun" {
                direction = l.direction
                if !shadowGiven {
                    castsShadow = true
                    shadowGiven = true
                }
            } else if l.type == "point" {
                position = l.position
                range = pointLightRange(l.intensity)
            }
            out.append(SceneStudioLightPlan(kind: l.type, color: l.color, intensity: l.intensity, direction: direction, position: position, range: range, castsShadow: castsShadow))
        }
        if scene.lights.isEmpty {
            let p = preset(scene.environment.preset)
            if p.sunIntensity > 0 {
                out.append(SceneStudioLightPlan(kind: "sun", color: p.sunColor, intensity: p.sunIntensity, direction: p.sunDirection, position: nil, range: nil, castsShadow: true))
            }
        }
        return out
    }

    /// Soft fill light from the sky and ground, scaled by the environment intensity; a scene ambient light adds on top.
    public static func ambientFill(_ scene: SceneStudioScene) -> SceneStudioAmbientFill {
        let p = preset(scene.environment.preset)
        var own = 0.0
        for l in scene.lights where l.type == "ambient" { own += l.intensity }
        return SceneStudioAmbientFill(skyColor: p.horizon, groundColor: p.ground, intensity: max(0, p.ambient * scene.environment.intensity + own))
    }

    public static func planPost(_ post: SceneStudioPost) -> SceneStudioPostPlan {
        return SceneStudioPostPlan(
            bloom: post.bloom > 0,
            bloomWeight: clamp(post.bloom, 0, 1) * 0.8,
            bloomThreshold: clamp(post.bloomThreshold, 0, 2),
            vignette: post.vignette > 0,
            vignetteWeight: clamp(post.vignette, 0, 1) * 5,
            grain: post.grain > 0,
            grainIntensity: clamp(post.grain, 0, 1) * 30,
            depthOfField: post.depthOfField > 0,
            focusDistanceMm: max(0.1, post.focusDistance) * 1000,
            fStop: 8 - 6.8 * clamp(post.depthOfField, 0, 1),
            toneMapping: post.toneMapping,
            exposure: post.exposure,
            contrast: post.contrast,
            saturation: post.saturation
        )
    }

    private static func isHexDigit(_ c: Unicode.Scalar) -> Bool {
        let v = c.value
        return (v >= 48 && v <= 57) || (v >= 65 && v <= 70) || (v >= 97 && v <= 102)
    }

    /// `#rrggbb` to [r, g, b] in 0..1 (sRGB). Anything else gives mid grey.
    public static func hexToRgb(_ hex: String) -> [Double] {
        let grey: [Double] = [0.5, 0.5, 0.5]
        let u = Array(hex.unicodeScalars)
        if u.count != 7 || u[0] != "#" { return grey }
        var channels: [Double] = []
        for k in 0..<3 {
            var pair = ""
            pair.unicodeScalars.append(u[1 + 2 * k])
            pair.unicodeScalars.append(u[2 + 2 * k])
            guard isHexDigit(u[1 + 2 * k]), isHexDigit(u[2 + 2 * k]), let v = Int(pair, radix: 16) else { return grey }
            channels.append(Double(v) / 255.0)
        }
        return channels
    }

    /// Colour (sRGB, 0..1) of the sky in the direction whose height is `y` (-1 straight down ... 0 the horizon ... 1
    /// straight up): the horizon colour blends up to the top colour (quickly at first) and down to the ground colour.
    public static func skyColorAt(_ preset: SceneStudioSkyPreset, _ y: Double) -> [Double] {
        let h = clamp(y.isFinite ? y : 0, -1, 1)
        let from = hexToRgb(preset.horizon)
        let to = hexToRgb(h >= 0 ? preset.top : preset.ground)
        let k = h >= 0 ? pow(h, 0.6) : min(1.0, -h * 3)
        return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k]
    }
}
