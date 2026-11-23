// UNVERIFIED: never compiled (no Swift compiler on the machine that wrote it). Mirrors the Kotlin reader in
// apps/android/.../scenestudio/SceneReader.kt, which has been compiled and run. Not yet listed in enV.xcodeproj:
// see apps/ios/NATIVE_SCENE_STUDIO.md.
import Foundation

/// A scene that cannot be read at all (not JSON, not an object, a different major version, far too large).
public struct SceneStudioReadError: Error, Equatable {
    public let message: String
    public init(_ message: String) { self.message = message }
}

/// Reads a scene document into `SceneStudioScene`, filling every default exactly as the web tool's validator does
/// (src/lib/scene-studio/validate.ts).
///
/// The web tool is where scenes are checked and explained to the person; this reader assumes the scene was checked
/// there. It is still safe on anything: a value of the wrong type or outside its range falls back to the default
/// (what the validator also substitutes), an unusable item is skipped, and only a document that cannot be read at
/// all, or that breaks a size limit, throws `SceneStudioReadError`.
public enum SceneStudioReader {
    public static let formatVersion = "1.0"
    public static let maxJSONBytes = 1_048_576

    private static let maxObjects = 200
    private static let maxLights = 8
    private static let maxLayers = 100
    private static let maxShots = 50
    private static let maxAudio = 16
    private static let maxAnimations = 400
    private static let maxKeyframes = 500
    private static let maxDialogue = 200
    private static let maxText = 500
    private static let maxParams = 32
    private static let maxDuration = 120.0
    private static let maxFps = 60
    private static let maxFrames = 7200
    private static let maxCoordinate = 10_000.0
    private static let maxID = 64

    private static let easings: Set<String> = ["linear", "easeIn", "easeOut", "easeInOut", "step"]
    private static let objectProperties: Set<String> = ["position", "rotation", "quaternion", "scale", "color", "opacity", "visible", "clip"]
    private static let cameraProperties: Set<String> = ["position", "lookAt", "fov"]
    private static let layerProperties: Set<String> = ["position", "scale", "rotation", "opacity", "color", "visible"]
    private static let rotationOrders: Set<String> = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"]
    private static let environmentPresets: Set<String> = ["studio", "day", "sunset", "night", "overcast", "none"]
    private static let toneMappings: Set<String> = ["aces", "neutral", "none"]
    private static let layerTypes: Set<String> = ["solid", "rect", "ellipse", "text", "image"]
    private static let layerPlanes: Set<String> = ["front", "back"]
    private static let fonts: Set<String> = ["sans", "serif", "display", "mono"]
    private static let lightTypes: Set<String> = ["sun", "ambient", "point"]
    private static let cameraTypes: Set<String> = ["perspective", "orthographic"]
    private static let captionStyles: Set<String> = ["pop", "classic"]
    private static let captionPlacements: Set<String> = ["belowSpeaker", "bottomCenter"]
    private static let exportFormats: Set<String> = ["mp4", "webm"]
    private static let qualities: Set<String> = ["low", "medium", "high"]
    private static let unsafeKeys: Set<String> = ["__proto__", "constructor", "prototype"]

    /// Reads pasted or saved text. Chatbots often wrap JSON in ``` fences; those are removed, as on the web.
    public static func parse(_ text: String) throws -> SceneStudioScene {
        if text.utf8.count > maxJSONBytes { throw SceneStudioReadError("The scene is larger than 1 MB.") }
        var body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let regex = try? NSRegularExpression(pattern: "^```[a-zA-Z]*\\s*\\n([\\s\\S]*?)\\n?```\\s*$") {
            let everything = NSRange(location: 0, length: (body as NSString).length)
            if let match = regex.firstMatch(in: body, options: [], range: everything), match.numberOfRanges > 1 {
                let inner = (body as NSString).substring(with: match.range(at: 1))
                body = inner.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        if body.isEmpty { throw SceneStudioReadError("Nothing was given to read.") }
        let root: SceneStudioJSON
        do {
            root = try SceneStudioJSONParser.parse(body)
        } catch let error as SceneStudioJSONError {
            throw SceneStudioReadError("The text is not valid JSON (\(error.message)).")
        }
        return try fromJSON(root)
    }

    /// Reads an already parsed document (what `SceneStudioJSONParser.parse` returns).
    public static func fromJSON(_ root: SceneStudioJSON?) throws -> SceneStudioScene {
        guard let input = obj(root) else { throw SceneStudioReadError("A scene must be a JSON object.") }
        var version = formatVersion
        if let given = input["version"], given != .null {
            guard case .string(let v) = given, let parts = versionParts(v) else {
                throw SceneStudioReadError("The scene's \"version\" must be text like \"\(formatVersion)\".")
            }
            if parts.0 != "1" { throw SceneStudioReadError("This scene is version \(v), but this app reads version 1.x.") }
            version = v
        }
        let settings = try readSettings(input["settings"])
        let camera = readCamera(input["camera"])
        let lights = try readLights(input["lights"])
        let environment = readEnvironment(input["environment"])
        let post = readPost(input["post"])
        var ids: [String: String] = [:] // id -> "object" | "layer" | "shot"
        let objects = try readObjects(input["objects"], &ids)
        let shots = try readShots(input["shots"], &ids)
        let layers = try readLayers(input["layers"], settings.duration, &ids)
        let audio = try readAudio(input["audio"])
        let animations = try readAnimations(input["animations"], ids)
        let dialogue = try readDialogue(input["dialogue"])
        let voices = readVoices(input["voices"])
        let captions = readCaptions(input["captions"])
        let export = readExport(input["export"])
        return SceneStudioScene(
            version: version, settings: settings, camera: camera, shots: shots, lights: lights, environment: environment,
            post: post, objects: objects, layers: layers, audio: audio, animations: animations, dialogue: dialogue,
            voices: voices, captions: captions, export: export
        )
    }

    // ---- small readers -------------------------------------------------------------------------

    private static func obj(_ v: SceneStudioJSON?) -> [String: SceneStudioJSON]? {
        if case .object(let o)? = v { return o }
        return nil
    }

    private static func list(_ v: SceneStudioJSON?, _ max: Int, _ what: String) throws -> [SceneStudioJSON] {
        guard case .array(let a)? = v else { return [] }
        if a.count > max { throw SceneStudioReadError("There are \(a.count) \(what); the limit is \(max).") }
        return a
    }

    private static func isNumber(_ v: SceneStudioJSON?) -> Bool {
        if case .number(let n)? = v { return n.isFinite }
        return false
    }

    private static func num(_ o: [String: SceneStudioJSON], _ key: String, _ def: Double, _ lo: Double, _ hi: Double) -> Double {
        if case .number(let v)? = o[key], v.isFinite, v >= lo, v <= hi { return v }
        return def
    }

    private static func whole(_ o: [String: SceneStudioJSON], _ key: String, _ def: Int, _ lo: Int, _ hi: Int) -> Int {
        if case .number(let v)? = o[key], v.isFinite, v == v.rounded(.down), v >= Double(lo), v <= Double(hi) { return Int(v) }
        return def
    }

    private static func bool(_ o: [String: SceneStudioJSON], _ key: String, _ def: Bool) -> Bool {
        if case .bool(let b)? = o[key] { return b }
        return def
    }

    /// Text no longer than `max` UTF-16 units (the same count JavaScript and Kotlin use).
    private static func text(_ o: [String: SceneStudioJSON], _ key: String, _ max: Int) -> String? {
        if case .string(let s)? = o[key], s.utf16.count <= max { return s }
        return nil
    }

    private static func choice(_ o: [String: SceneStudioJSON], _ key: String, _ allowed: Set<String>, _ def: String) -> String {
        if case .string(let s)? = o[key], allowed.contains(s) { return s }
        return def
    }

    private static func isHexDigit(_ c: Unicode.Scalar) -> Bool {
        let v = c.value
        return (v >= 48 && v <= 57) || (v >= 65 && v <= 70) || (v >= 97 && v <= 102)
    }

    /// "#abc" and "#aabbcc" are accepted and become lower-case 6-digit hex.
    public static func normalizeColor(_ s: String) -> String? {
        let u = Array(s.unicodeScalars)
        guard (u.count == 4 || u.count == 7), u[0] == "#" else { return nil }
        var digits = ""
        for c in u.dropFirst() {
            if !isHexDigit(c) { return nil }
            digits.unicodeScalars.append(c)
        }
        digits = digits.lowercased()
        if digits.count == 3 {
            var doubled = ""
            for ch in digits { doubled.append(ch); doubled.append(ch) }
            digits = doubled
        }
        return "#" + digits
    }

    private static func normalizeColor(_ v: SceneStudioJSON?) -> String? {
        if case .string(let s)? = v { return normalizeColor(s) }
        return nil
    }

    private static func color(_ o: [String: SceneStudioJSON], _ key: String, _ def: String) -> String {
        return normalizeColor(o[key]) ?? def
    }

    private static func colorOrNil(_ o: [String: SceneStudioJSON], _ key: String) -> String? {
        return normalizeColor(o[key])
    }

    /// A list of exactly `n` finite numbers within +-10000, or nil.
    private static func vecOrNil(_ v: SceneStudioJSON?, _ n: Int) -> [Double]? {
        guard case .array(let l)? = v, l.count == n else { return nil }
        var out: [Double] = []
        for item in l {
            guard case .number(let x) = item, x.isFinite, abs(x) <= maxCoordinate else { return nil }
            out.append(x)
        }
        return out
    }

    private static func vec(_ o: [String: SceneStudioJSON], _ key: String, _ n: Int, _ def: [Double]) -> [Double] {
        return vecOrNil(o[key], n) ?? def
    }

    /// A single number is shorthand for a uniform vector.
    private static func uniform(_ v: SceneStudioJSON?, _ n: Int) -> [Double]? {
        if case .number(let x)? = v, x.isFinite, abs(x) <= maxCoordinate { return [Double](repeating: x, count: n) }
        return vecOrNil(v, n)
    }

    private static func quatOrNil(_ v: SceneStudioJSON?) -> [Double]? {
        guard let q = vecOrNil(v, 4) else { return nil }
        let len = (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]).squareRoot()
        if len < 1e-9 { return nil }
        return [q[0] / len, q[1] / len, q[2] / len, q[3] / len]
    }

    private static func versionParts(_ v: String) -> (String, String)? {
        let parts = v.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        if parts.count != 2 { return nil }
        for part in parts {
            if part.isEmpty { return nil }
            for c in part.unicodeScalars where c.value < 48 || c.value > 57 { return nil }
        }
        return (parts[0], parts[1])
    }

    private static func isValidID(_ id: String) -> Bool {
        let u = Array(id.unicodeScalars)
        guard let first = u.first else { return false }
        let letter = (first.value >= 65 && first.value <= 90) || (first.value >= 97 && first.value <= 122)
        if !letter { return false }
        for c in u.dropFirst() {
            let v = c.value
            let ok = (v >= 65 && v <= 90) || (v >= 97 && v <= 122) || (v >= 48 && v <= 57) || v == 95 || v == 45
            if !ok { return false }
        }
        return true
    }

    /// Library names or uploaded file names only; never a web address, never a path that climbs out.
    private static func safeAsset(_ value: String) -> Bool {
        let u = Array(value.unicodeScalars)
        // a scheme such as "https:" or "file:"
        if let first = u.first, (first.value >= 65 && first.value <= 90) || (first.value >= 97 && first.value <= 122) {
            var k = 1
            while k < u.count {
                let v = u[k].value
                let ok = (v >= 65 && v <= 90) || (v >= 97 && v <= 122) || (v >= 48 && v <= 57) || v == 43 || v == 46 || v == 45
                if !ok { break }
                k += 1
            }
            if k < u.count && u[k] == ":" { return false }
        }
        // Checked on scalars, not Characters: a "/" or "\\" followed by a combining mark is one Character in Swift.
        if u.first?.value == 47 { return false } // a leading "/" (this also covers "//")
        if u.contains(where: { $0.value == 92 || $0.value == 0 }) { return false } // a backslash or a NUL
        var segment: [UInt32] = []
        for c in u {
            if c.value == 47 {
                if segment == [46, 46] { return false }
                segment = []
            } else {
                segment.append(c.value)
            }
        }
        if segment == [46, 46] { return false }
        return true
    }

    private static func safeAssetText(_ o: [String: SceneStudioJSON], _ key: String) -> String? {
        if let s = text(o, key, 200), safeAsset(s) { return s }
        return nil
    }

    // ---- sections ------------------------------------------------------------------------------

    private static func readSettings(_ input: SceneStudioJSON?) throws -> SceneStudioSettings {
        let o = obj(input) ?? [:]
        let width = whole(o, "width", 1080, 64, 4096)
        let height = whole(o, "height", 1920, 64, 4096)
        let fps = whole(o, "fps", 30, 1, maxFps)
        let duration = num(o, "duration", 8.0, 0.1, maxDuration)
        let frames = Int((Double(fps) * duration + 0.5).rounded(.down))
        if frames > maxFrames { throw SceneStudioReadError("\(duration) s at \(fps) fps is \(frames) frames; the limit is \(maxFrames).") }
        var seed: UInt32 = 1
        if case .number(let s)? = o["seed"], s.isFinite, s == s.rounded(.down), s >= 0, s <= 4_294_967_295.0 { seed = UInt32(s) }
        return SceneStudioSettings(width: width, height: height, fps: fps, duration: duration, background: color(o, "background", "#101826"), seed: seed)
    }

    private static func readCameraAt(_ input: SceneStudioJSON?) -> SceneStudioCamera {
        let o = obj(input) ?? [:]
        var amount = 0.0
        var speed = 4.0
        if let shake = obj(o["shake"]) {
            amount = num(shake, "amount", 0.0, 0.0, 1.0)
            speed = num(shake, "speed", 4.0, 0.1, 20.0)
        }
        return SceneStudioCamera(
            type: choice(o, "type", cameraTypes, "perspective"),
            position: vec(o, "position", 3, [0.0, 2.0, 8.0]),
            lookAt: vec(o, "lookAt", 3, [0.0, 1.0, 0.0]),
            fov: num(o, "fov", 45.0, 10.0, 120.0),
            shakeAmount: amount,
            shakeSpeed: speed
        )
    }

    private static func readCamera(_ input: SceneStudioJSON?) -> SceneStudioCamera {
        return readCameraAt(input)
    }

    private static func readEnvironment(_ input: SceneStudioJSON?) -> SceneStudioEnvironment {
        let o = obj(input) ?? [:]
        var fogColor = "#8a9bb0"
        var fogDensity = 0.0
        if let fog = obj(o["fog"]) {
            fogColor = color(fog, "color", "#8a9bb0")
            fogDensity = num(fog, "density", 0.0, 0.0, 1.0)
        }
        return SceneStudioEnvironment(
            preset: choice(o, "preset", environmentPresets, "studio"),
            intensity: num(o, "intensity", 1.0, 0.0, 5.0),
            hdri: safeAssetText(o, "hdri"),
            skybox: bool(o, "skybox", false),
            fogColor: fogColor,
            fogDensity: fogDensity
        )
    }

    private static func readPost(_ input: SceneStudioJSON?) -> SceneStudioPost {
        let o = obj(input) ?? [:]
        return SceneStudioPost(
            bloom: num(o, "bloom", 0.0, 0.0, 3.0),
            bloomThreshold: num(o, "bloomThreshold", 0.8, 0.0, 1.0),
            vignette: num(o, "vignette", 0.0, 0.0, 1.0),
            grain: num(o, "grain", 0.0, 0.0, 1.0),
            depthOfField: num(o, "depthOfField", 0.0, 0.0, 1.0),
            focusDistance: num(o, "focusDistance", 8.0, 0.1, 1000.0),
            toneMapping: choice(o, "toneMapping", toneMappings, "aces"),
            exposure: num(o, "exposure", 1.0, 0.1, 4.0),
            contrast: num(o, "contrast", 1.0, 0.5, 2.0),
            saturation: num(o, "saturation", 1.0, 0.0, 2.0)
        )
    }

    private static func readLights(_ input: SceneStudioJSON?) throws -> [SceneStudioLight] {
        guard let input = input, input != .null else {
            return [SceneStudioLight(type: "sun", intensity: 1.0, color: "#ffffff", position: [0.0, 5.0, 0.0], direction: [-0.4, -1.0, -0.3])]
        }
        var out: [SceneStudioLight] = []
        for item in try list(input, maxLights, "lights") {
            guard let o = obj(item) else { continue }
            out.append(SceneStudioLight(
                type: choice(o, "type", lightTypes, "sun"),
                intensity: num(o, "intensity", 1.0, 0.0, 20.0),
                color: color(o, "color", "#ffffff"),
                position: vec(o, "position", 3, [0.0, 5.0, 0.0]),
                direction: vec(o, "direction", 3, [-0.4, -1.0, -0.3])
            ))
        }
        return out
    }

    private static func readParams(_ input: SceneStudioJSON?) -> [String: Any] {
        guard let o = obj(input), o.count <= maxParams else { return [:] }
        var out: [String: Any] = [:]
        for (k, v) in o {
            if unsafeKeys.contains(k) { continue }
            switch v {
            case .string(let s): if s.utf16.count <= maxText { out[k] = s }
            case .bool(let b): out[k] = b
            case .number(let n): if n.isFinite { out[k] = n }
            default: break
            }
        }
        return out
    }

    private static func readMaterial(_ input: SceneStudioJSON?) -> SceneStudioMaterial? {
        guard let o = obj(input) else { return nil }
        return SceneStudioMaterial(
            metallic: num(o, "metallic", 0.0, 0.0, 1.0),
            roughness: num(o, "roughness", 0.6, 0.0, 1.0),
            emissive: colorOrNil(o, "emissive"),
            emissiveIntensity: num(o, "emissiveIntensity", 1.0, 0.0, 20.0),
            texture: safeAssetText(o, "texture"),
            doubleSided: bool(o, "doubleSided", false)
        )
    }

    private static func claim(_ ids: inout [String: String], _ id: String, _ kind: String) -> Bool {
        if !isValidID(id) || id == "camera" || ids[id] != nil { return false }
        ids[id] = kind
        return true
    }

    private static func readObjects(_ input: SceneStudioJSON?, _ ids: inout [String: String]) throws -> [SceneStudioObject] {
        var raw: [SceneStudioObject] = []
        for item in try list(input, maxObjects, "objects") {
            guard let o = obj(item) else { continue }
            guard let id = text(o, "id", maxID) else { continue }
            guard let type = text(o, "type", 64), !type.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            if !claim(&ids, id, "object") { continue }
            let quaternion: [Double]? = o["quaternion"] != nil ? quatOrNil(o["quaternion"]) : nil
            let scale: [Double] = o["scale"] != nil ? (uniform(o["scale"], 3) ?? [1.0, 1.0, 1.0]) : [1.0, 1.0, 1.0]
            let size: [Double]? = o["size"] != nil ? uniform(o["size"], 3) : nil
            // "ignored when a quaternion is present; zeroed" (same as the validator)
            let rotation: [Double] = quaternion != nil ? [0.0, 0.0, 0.0] : vec(o, "rotation", 3, [0.0, 0.0, 0.0])
            raw.append(SceneStudioObject(
                id: id,
                type: type,
                rotationOrder: choice(o, "rotationOrder", rotationOrders, "XYZ"),
                quaternion: quaternion,
                material: readMaterial(o["material"]),
                clip: text(o, "clip", 64),
                clipSpeed: num(o, "clipSpeed", 1.0, 0.0, 10.0),
                asset: safeAssetText(o, "asset"),
                style: text(o, "style", 32),
                color: colorOrNil(o, "color"),
                text: text(o, "text", maxText),
                size: size,
                params: readParams(o["params"]),
                position: vec(o, "position", 3, [0.0, 0.0, 0.0]),
                rotation: rotation,
                scale: scale,
                visible: bool(o, "visible", true),
                opacity: num(o, "opacity", 1.0, 0.0, 1.0),
                parent: text(o, "parent", maxID)
            ))
        }
        // A parent must be another object, and the chain must end: otherwise the link is dropped.
        var byID: [String: SceneStudioObject] = [:]
        for o in raw { byID[o.id] = o }
        var fixed: [SceneStudioObject] = []
        for o in raw {
            guard let p = o.parent else {
                fixed.append(o)
                continue
            }
            var keep = p != o.id && byID[p] != nil
            if keep {
                var current: SceneStudioObject? = byID[p]
                var steps = 0
                while let c = current {
                    if c.id == o.id || steps > raw.count {
                        keep = false
                        break
                    }
                    if let next = c.parent { current = byID[next] } else { current = nil }
                    steps += 1
                }
            }
            fixed.append(keep ? o : o.withoutParent())
        }
        return fixed
    }

    private static func readShots(_ input: SceneStudioJSON?, _ ids: inout [String: String]) throws -> [SceneStudioShot] {
        var out: [SceneStudioShot] = []
        for item in try list(input, maxShots, "shots") {
            guard let o = obj(item) else { continue }
            guard let id = text(o, "id", maxID) else { continue }
            if !claim(&ids, id, "shot") { continue }
            out.append(SceneStudioShot(id: id, start: num(o, "start", 0.0, 0.0, maxDuration), camera: readCameraAt(item)))
        }
        // Stable sort by start (Swift's sort is not guaranteed stable, so equal starts are ordered by position).
        let indexed = out.enumerated().sorted { a, b in
            if a.element.start != b.element.start { return a.element.start < b.element.start }
            return a.offset < b.offset
        }
        return indexed.map { $0.element }
    }

    private static func readLayers(_ input: SceneStudioJSON?, _ duration: Double, _ ids: inout [String: String]) throws -> [SceneStudioLayer] {
        var out: [SceneStudioLayer] = []
        for item in try list(input, maxLayers, "layers") {
            guard let o = obj(item) else { continue }
            guard let id = text(o, "id", maxID) else { continue }
            guard case .string(let type)? = o["type"], layerTypes.contains(type) else { continue }
            if !claim(&ids, id, "layer") { continue }
            let scale: [Double] = o["scale"] != nil ? (uniform(o["scale"], 2) ?? [1.0, 1.0]) : [1.0, 1.0]
            out.append(SceneStudioLayer(
                id: id,
                type: type,
                plane: choice(o, "plane", layerPlanes, "front"),
                position: vec(o, "position", 2, [0.0, 0.0]),
                size: vec(o, "size", 2, type == "text" ? [0.0, 0.0] : [100.0, 100.0]),
                anchor: vec(o, "anchor", 2, [0.5, 0.5]),
                scale: scale,
                rotation: num(o, "rotation", 0.0, -36000.0, 36000.0),
                opacity: num(o, "opacity", 1.0, 0.0, 1.0),
                start: num(o, "start", 0.0, 0.0, maxDuration),
                end: num(o, "end", duration, 0.0, maxDuration),
                visible: bool(o, "visible", true),
                color: colorOrNil(o, "color"),
                text: text(o, "text", maxText),
                font: choice(o, "font", fonts, "sans"),
                fontSize: num(o, "fontSize", 64.0, 4.0, 1000.0),
                strokeColor: colorOrNil(o, "strokeColor"),
                strokeWidth: num(o, "strokeWidth", 0.0, 0.0, 100.0),
                asset: safeAssetText(o, "asset")
            ))
        }
        return out
    }

    private static func readAudio(_ input: SceneStudioJSON?) throws -> [SceneStudioAudioTrack] {
        var out: [SceneStudioAudioTrack] = []
        for (i, item) in try list(input, maxAudio, "audio tracks").enumerated() {
            guard let o = obj(item), let asset = safeAssetText(o, "asset") else { continue }
            out.append(SceneStudioAudioTrack(
                id: text(o, "id", maxID) ?? "audio\(i + 1)",
                asset: asset,
                start: num(o, "start", 0.0, 0.0, maxDuration),
                volume: num(o, "volume", 1.0, 0.0, 1.0),
                loop: bool(o, "loop", false)
            ))
        }
        return out
    }

    private static func trackValue(_ kind: String, _ property: String, _ v: SceneStudioJSON?) -> SceneStudioTrackValue? {
        switch property {
        case "position":
            if let x = vecOrNil(v, kind == "layer" ? 2 : 3) { return .vector(x) }
            return nil
        case "rotation":
            if kind == "layer" {
                if case .number(let n)? = v, n.isFinite { return .number(n) }
                return nil
            }
            if let x = vecOrNil(v, 3) { return .vector(x) }
            return nil
        case "lookAt":
            if let x = vecOrNil(v, 3) { return .vector(x) }
            return nil
        case "quaternion":
            if let x = quatOrNil(v) { return .vector(x) }
            return nil
        case "scale":
            if let x = uniform(v, kind == "layer" ? 2 : 3) { return .vector(x) }
            return nil
        case "clip":
            if case .string(let s)? = v, !s.isEmpty, s.utf16.count <= 64 { return .text(s) }
            return nil
        case "color":
            if let c = normalizeColor(v) { return .text(c) }
            return nil
        case "opacity":
            if case .number(let n)? = v, n.isFinite, n >= 0.0, n <= 1.0 { return .number(n) }
            return nil
        case "fov":
            if case .number(let n)? = v, n.isFinite, n >= 10.0, n <= 120.0 { return .number(n) }
            return nil
        case "visible":
            if case .bool(let b)? = v { return .flag(b) }
            return nil
        default:
            return nil
        }
    }

    private static func readAnimations(_ input: SceneStudioJSON?, _ ids: [String: String]) throws -> [SceneStudioAnimationTrack] {
        var out: [SceneStudioAnimationTrack] = []
        for item in try list(input, maxAnimations, "animations") {
            guard let o = obj(item) else { continue }
            guard let target = text(o, "target", maxID) else { continue }
            let owner: String
            if target == "camera" {
                owner = "shot"
            } else if let known = ids[target] {
                owner = known
            } else {
                continue
            }
            let kind = owner == "shot" ? "camera" : owner
            let allowed = kind == "camera" ? cameraProperties : (kind == "layer" ? layerProperties : objectProperties)
            guard case .string(let property)? = o["property"], allowed.contains(property) else { continue }
            let frames = try list(o["keyframes"], maxKeyframes, "keyframes")
            if frames.isEmpty { continue }
            var keyframes: [SceneStudioKeyframe] = []
            var bad = false
            for kf in frames {
                guard let k = obj(kf), case .number(let time)? = k["time"], time.isFinite, time >= 0 else {
                    bad = true
                    break
                }
                if let last = keyframes.last, time < last.time {
                    bad = true
                    break
                }
                guard let value = trackValue(kind, property, k["value"]) else {
                    bad = true
                    break
                }
                let easing: String? = k["easing"] != nil ? choice(k, "easing", easings, "linear") : nil
                keyframes.append(SceneStudioKeyframe(time: time, value: value, easing: easing))
            }
            if bad { continue }
            out.append(SceneStudioAnimationTrack(target: target, property: property, easing: choice(o, "easing", easings, "linear"), loop: bool(o, "loop", false), keyframes: keyframes))
        }
        return out
    }

    private static func readDialogue(_ input: SceneStudioJSON?) throws -> [SceneStudioDialogueLine] {
        var out: [SceneStudioDialogueLine] = []
        for item in try list(input, maxDialogue, "dialogue lines") {
            guard let o = obj(item) else { continue }
            guard let speaker = text(o, "speaker", maxID), let line = text(o, "text", maxText) else { continue }
            if speaker.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
            out.append(SceneStudioDialogueLine(speaker: speaker, text: line, start: num(o, "start", 0.0, 0.0, maxDuration)))
        }
        return out
    }

    private static func readVoices(_ input: SceneStudioJSON?) -> [String: SceneStudioVoice] {
        guard let o = obj(input) else { return [:] }
        var out: [String: SceneStudioVoice] = [:]
        for (speaker, v) in o {
            if unsafeKeys.contains(speaker) { continue }
            guard let r = obj(v) else { continue }
            out[speaker] = SceneStudioVoice(voice: text(r, "voice", 64) ?? "default", speed: num(r, "speed", 1.0, 0.5, 2.0))
        }
        return out
    }

    private static func readCaptions(_ input: SceneStudioJSON?) -> SceneStudioCaptions {
        let o = obj(input) ?? [:]
        var speakerColors: [String: String] = [:]
        if let sc = obj(o["speakerColors"]) {
            for (k, v) in sc {
                if unsafeKeys.contains(k) { continue }
                if let c = normalizeColor(v) { speakerColors[k] = c }
            }
        }
        return SceneStudioCaptions(
            enabled: bool(o, "enabled", true),
            style: choice(o, "style", captionStyles, "pop"),
            placement: choice(o, "placement", captionPlacements, "belowSpeaker"),
            highlightColor: color(o, "highlightColor", "#ffd400"),
            wordsPerGroup: whole(o, "wordsPerGroup", 3, 1, 6),
            anchorY: num(o, "anchorY", 0.78, 0.1, 0.95),
            fontScale: num(o, "fontScale", 1.0, 0.5, 2.0),
            speakerColors: speakerColors
        )
    }

    private static func readExport(_ input: SceneStudioJSON?) -> SceneStudioExport {
        let o = obj(input) ?? [:]
        return SceneStudioExport(format: choice(o, "format", exportFormats, "mp4"), quality: choice(o, "quality", qualities, "high"))
    }
}
