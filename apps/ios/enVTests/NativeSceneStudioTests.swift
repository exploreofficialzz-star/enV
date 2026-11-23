// UNVERIFIED: never compiled or run (no Swift compiler on the machine that wrote it). It mirrors the Kotlin tests in
// apps/android/app/src/test/java/com/chastech/env/scenestudio/, which have been run (27 passing). Not yet listed in
// enV.xcodeproj: see apps/ios/NATIVE_SCENE_STUDIO.md.
import XCTest
@testable import enV

/// Runs the shared Scene Studio test numbers (the *-vectors.json files in apps/shared/scene-studio, written by the web
/// tool's tests) against the Swift implementation, and checks the scene reader. The shared files are found from this
/// source file's location, so they do not have to be added to the test bundle.
final class NativeSceneStudioTests: XCTestCase {
    // ---- helpers -------------------------------------------------------------------------------

    private func sharedURL(_ path: String) -> URL {
        var url = URL(fileURLWithPath: #filePath)
        url.deleteLastPathComponent() // enVTests
        url.deleteLastPathComponent() // ios
        url.deleteLastPathComponent() // apps
        return url.appendingPathComponent("shared").appendingPathComponent("scene-studio").appendingPathComponent(path)
    }

    private func sharedText(_ path: String) throws -> String {
        return try String(contentsOf: sharedURL(path), encoding: .utf8)
    }

    private func sharedJSON(_ path: String) throws -> SceneStudioJSON {
        return try SceneStudioJSONParser.parse(try sharedText(path))
    }

    private func d(_ v: SceneStudioJSON?) -> Double { return v?.numberValue ?? Double.nan }
    private func ds(_ v: SceneStudioJSON?) -> [Double] { return (v?.arrayValue ?? []).map { $0.numberValue ?? Double.nan } }
    private func arr(_ v: SceneStudioJSON?) -> [SceneStudioJSON] { return v?.arrayValue ?? [] }
    private func str(_ v: SceneStudioJSON?) -> String { return v?.stringValue ?? "" }

    private func assertNear(_ expected: [Double], _ actual: [Double], _ eps: Double, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(expected.count, actual.count, "\(what): length", file: file, line: line)
        if expected.count != actual.count { return }
        for i in 0..<expected.count { XCTAssertEqual(expected[i], actual[i], accuracy: eps, "\(what)[\(i)]", file: file, line: line) }
    }

    private func trackValue(_ v: SceneStudioJSON?) -> SceneStudioTrackValue {
        switch v {
        case .number(let n)?: return .number(n)
        case .string(let s)?: return .text(s)
        case .bool(let b)?: return .flag(b)
        case .array(let a)?: return .vector(a.map { $0.numberValue ?? Double.nan })
        default: return .number(Double.nan)
        }
    }

    private func assertSameValue(_ expected: SceneStudioJSON?, _ actual: SceneStudioTrackValue, _ what: String) {
        switch (expected, actual) {
        case (.number(let e)?, .number(let a)): XCTAssertEqual(e, a, accuracy: 1e-9, what)
        case (.string(let e)?, .text(let a)): XCTAssertEqual(e, a, what)
        case (.bool(let e)?, .flag(let a)): XCTAssertEqual(e, a, what)
        case (.array(let e)?, .vector(let a)): assertNear(e.map { $0.numberValue ?? Double.nan }, a, 1e-9, what)
        default: XCTFail("\(what): the value kinds differ")
        }
    }

    // ---- animation -----------------------------------------------------------------------------

    func testTrackSamplingMatchesTheSharedVectors() throws {
        let vectors = arr(try sharedJSON("animation-vectors.json")["vectors"])
        XCTAssertFalse(vectors.isEmpty)
        for v in vectors {
            let t = v["track"]
            // Tracks without a property blend plainly (numbers, lists); the special properties are named in the file.
            let property = t?["property"]?.stringValue ?? "position"
            var keyframes: [SceneStudioKeyframe] = []
            for k in arr(t?["keyframes"]) {
                keyframes.append(SceneStudioKeyframe(time: d(k["time"]), value: trackValue(k["value"]), easing: k["easing"]?.stringValue))
            }
            let track = SceneStudioAnimationTrack(target: "t", property: property, easing: str(t?["easing"]), loop: t?["loop"]?.boolValue ?? false, keyframes: keyframes)
            for s in arr(v["samples"]) {
                assertSameValue(s["value"], SceneStudioAnimation.sampleTrack(track, d(s["time"])), "\(str(v["name"])) at \(d(s["time"]))")
            }
        }
    }

    func testSeededRandomMatches() throws {
        let v = try sharedJSON("animation-vectors.json")["seededRandom"]
        let next = SceneStudioAnimation.seededRandom(seed: UInt32(d(v?["seed"])))
        for (i, expected) in arr(v?["firstFive"]).enumerated() {
            XCTAssertEqual(d(expected), next(), accuracy: 1e-12, "seededRandom #\(i)")
        }
    }

    func testValueNoiseAndCameraShakeMatch() throws {
        let file = try sharedJSON("animation-vectors.json")
        for n in arr(file["valueNoise"]?["samples"]) {
            let got = SceneStudioAnimation.valueNoise(seed: UInt32(d(n["seed"])), x: d(n["x"]), channel: Int(d(n["channel"])))
            XCTAssertEqual(d(n["value"]), got, accuracy: 1e-9, "valueNoise")
        }
        for n in arr(file["cameraShake"]?["samples"]) {
            let got = SceneStudioAnimation.cameraShake(seed: UInt32(d(n["seed"])), time: d(n["time"]), amount: d(n["shake"]?["amount"]), speed: d(n["shake"]?["speed"]))
            assertNear(ds(n["value"]), got, 1e-9, "cameraShake")
        }
    }

    // ---- frame state ---------------------------------------------------------------------------

    func testEulerAnglesBecomeTheSameQuaternions() throws {
        let file = try sharedJSON("frame-vectors.json")
        let eps = d(file["tolerance"])
        for e in arr(file["euler"]) {
            assertNear(ds(e["quaternion"]), SceneStudioFrame.eulerToQuaternion(ds(e["rotation"]), str(e["order"])), eps, "euler")
        }
    }

    func testFramesOfTheSharedScenesMatch() throws {
        let file = try sharedJSON("frame-vectors.json")
        let eps = d(file["tolerance"])
        var samplers: [String: SceneStudioFrame.Sampler] = [:]
        let frames = arr(file["frames"])
        XCTAssertGreaterThanOrEqual(frames.count, 20)
        for f in frames {
            let sceneFile = str(f["scene"])
            if samplers[sceneFile] == nil {
                samplers[sceneFile] = SceneStudioFrame.Sampler(scene: try SceneStudioReader.parse(try sharedText(sceneFile)))
            }
            let frame = Int(d(f["frame"]))
            let state = samplers[sceneFile]!.at(frame: frame)
            let where_ = "\(sceneFile) frame \(frame)"

            let c = f["camera"]
            XCTAssertEqual(str(c?["type"]), state.camera.type, "\(where_) camera type")
            assertNear(ds(c?["position"]), state.camera.position, eps, "\(where_) camera position")
            assertNear(ds(c?["lookAt"]), state.camera.lookAt, eps, "\(where_) camera lookAt")
            XCTAssertEqual(d(c?["fov"]), state.camera.fov, accuracy: eps, "\(where_) fov")
            XCTAssertEqual(d(c?["roll"]), state.camera.roll, accuracy: eps, "\(where_) roll")
            XCTAssertEqual(d(c?["orthoHeight"]), state.camera.orthoHeight, accuracy: eps, "\(where_) orthoHeight")
            if let index = c?["shotIndex"]?.numberValue {
                XCTAssertEqual(Int(index), state.camera.shotIndex, "\(where_) shotIndex")
            } else {
                XCTAssertNil(state.camera.shotIndex, "\(where_) shotIndex")
            }

            let objects = f["objects"]?.objectValue ?? [:]
            XCTAssertEqual(Set(objects.keys), Set(state.objects.map { $0.id }), "\(where_) object ids")
            for o in state.objects {
                let e = objects[o.id]
                let w = "\(where_) object \(o.id)"
                assertNear(ds(e?["position"]), o.position, eps, "\(w) position")
                assertNear(ds(e?["quaternion"]), o.quaternion, eps, "\(w) quaternion")
                assertNear(ds(e?["scale"]), o.scale, eps, "\(w) scale")
                if let color = e?["color"]?.stringValue { XCTAssertEqual(color, o.color, "\(w) color") } else { XCTAssertNil(o.color, "\(w) color") }
                XCTAssertEqual(d(e?["opacity"]), o.opacity, accuracy: eps, "\(w) opacity")
                XCTAssertEqual(e?["visible"]?.boolValue, o.visible, "\(w) visible")
                if let clip = e?["clip"]?.stringValue { XCTAssertEqual(clip, o.clip, "\(w) clip") } else { XCTAssertNil(o.clip, "\(w) clip") }
                XCTAssertEqual(d(e?["clipTime"]), o.clipTime, accuracy: eps, "\(w) clipTime")
            }

            let layers = arr(f["layers"])
            XCTAssertEqual(layers.map { str($0["id"]) }, state.layers.map { $0.id }, "\(where_) layer ids")
            for (i, e) in layers.enumerated() where i < state.layers.count {
                let l = state.layers[i]
                let w = "\(where_) layer \(l.id)"
                assertNear(ds(e["position"]), l.position, eps, "\(w) position")
                assertNear(ds(e["scale"]), l.scale, eps, "\(w) scale")
                XCTAssertEqual(d(e["rotation"]), l.rotation, accuracy: eps, "\(w) rotation")
                XCTAssertEqual(d(e["opacity"]), l.opacity, accuracy: eps, "\(w) opacity")
                if let color = e["color"]?.stringValue { XCTAssertEqual(color, l.color, "\(w) color") } else { XCTAssertNil(l.color, "\(w) color") }
            }
        }
    }

    // ---- render maths --------------------------------------------------------------------------

    func testRenderMathMatchesTheSharedVectors() throws {
        let file = try sharedJSON("render-vectors.json")
        let eps = d(file["tolerance"])

        for h in arr(file["hash"]) {
            XCTAssertEqual(d(h["value"]), SceneStudioRenderMath.hash01(Int32(d(h["seed"])), Int32(d(h["i"])), Int32(d(h["salt"]))), accuracy: eps, "hash")
        }

        let particles = arr(file["particles"])
        XCTAssertGreaterThanOrEqual(particles.count, 28)
        for p in particles {
            let params = SceneStudioEmitterParams(intensity: d(p["params"]?["intensity"]), area: d(p["params"]?["area"]), height: d(p["params"]?["height"]))
            let got = SceneStudioRenderMath.particleAt(type: str(p["type"]), i: Int32(d(p["i"])), time: d(p["time"]), params: params, seed: Int32(d(p["seed"])))
            let e = p["particle"]
            let w = "particle \(str(p["type"])) #\(d(p["i"])) at \(d(p["time"]))"
            XCTAssertEqual(d(e?["x"]), got.x, accuracy: eps, "\(w) x")
            XCTAssertEqual(d(e?["y"]), got.y, accuracy: eps, "\(w) y")
            XCTAssertEqual(d(e?["z"]), got.z, accuracy: eps, "\(w) z")
            XCTAssertEqual(d(e?["size"]), got.size, accuracy: eps, "\(w) size")
            XCTAssertEqual(d(e?["streak"]), got.streak, accuracy: eps, "\(w) streak")
            XCTAssertEqual(d(e?["alpha"]), got.alpha, accuracy: eps, "\(w) alpha")
        }

        let poses = arr(file["poses"])
        XCTAssertEqual(poses.count, SceneStudioRenderMath.clipNames.count * 4)
        for p in poses {
            let got = SceneStudioRenderMath.poseFor(clip: str(p["clip"]), time: d(p["time"])).values()
            let expected = p["pose"]?.objectValue ?? [:]
            XCTAssertEqual(Set(expected.keys), Set(got.keys))
            for (k, v) in expected { XCTAssertEqual(d(v), got[k] ?? Double.nan, accuracy: eps, "pose \(str(p["clip"])) at \(d(p["time"])) \(k)") }
        }

        for w in arr(file["waves"]) {
            let params = w["params"]
            let got = SceneStudioRenderMath.waveHeightAt(x: d(w["x"]), z: d(w["z"]), time: d(w["time"]), waveHeight: d(params?["waveHeight"]), waveSpeed: d(params?["waveSpeed"]), flow: d(params?["flow"]))
            XCTAssertEqual(d(w["height"]), got, accuracy: eps, "wave")
        }

        for c in arr(file["counts"]) {
            XCTAssertEqual(Int(d(c["count"])), SceneStudioRenderMath.particleCount(type: str(c["type"]), intensity: d(c["intensity"]), quality: str(c["quality"])), "count")
        }
    }

    func testLookAndCameraMathMatchTheSharedVectors() throws {
        let file = try sharedJSON("render-vectors.json")
        let eps = d(file["tolerance"])

        for s in arr(file["sky"]) {
            guard let preset = SceneStudioLook.skyPresets[str(s["preset"])] else { return XCTFail("unknown sky preset") }
            assertNear(ds(s["color"]), SceneStudioLook.skyColorAt(preset, d(s["y"])), eps, "sky")
        }
        for r in arr(file["lightRange"]) {
            XCTAssertEqual(d(r["range"]), SceneStudioLook.pointLightRange(d(r["intensity"])), accuracy: eps, "light range")
        }
        for c in arr(file["post"]) {
            let p = c["post"]
            let plan = SceneStudioLook.planPost(SceneStudioPost(
                bloom: d(p?["bloom"]), bloomThreshold: d(p?["bloomThreshold"]), vignette: d(p?["vignette"]), grain: d(p?["grain"]),
                depthOfField: d(p?["depthOfField"]), focusDistance: d(p?["focusDistance"]), toneMapping: str(p?["toneMapping"]),
                exposure: d(p?["exposure"]), contrast: d(p?["contrast"]), saturation: d(p?["saturation"])
            ))
            let e = c["plan"]
            XCTAssertEqual(e?["bloom"]?.boolValue, plan.bloom)
            XCTAssertEqual(d(e?["bloomWeight"]), plan.bloomWeight, accuracy: eps)
            XCTAssertEqual(d(e?["bloomThreshold"]), plan.bloomThreshold, accuracy: eps)
            XCTAssertEqual(e?["vignette"]?.boolValue, plan.vignette)
            XCTAssertEqual(d(e?["vignetteWeight"]), plan.vignetteWeight, accuracy: eps)
            XCTAssertEqual(e?["grain"]?.boolValue, plan.grain)
            XCTAssertEqual(d(e?["grainIntensity"]), plan.grainIntensity, accuracy: eps)
            XCTAssertEqual(e?["depthOfField"]?.boolValue, plan.depthOfField)
            XCTAssertEqual(d(e?["focusDistanceMm"]), plan.focusDistanceMm, accuracy: eps)
            XCTAssertEqual(d(e?["fStop"]), plan.fStop, accuracy: eps)
            XCTAssertEqual(str(e?["toneMapping"]), plan.toneMapping)
            XCTAssertEqual(d(e?["exposure"]), plan.exposure, accuracy: eps)
            XCTAssertEqual(d(e?["contrast"]), plan.contrast, accuracy: eps)
            XCTAssertEqual(d(e?["saturation"]), plan.saturation, accuracy: eps)
        }

        let cameras = arr(file["camera"])
        XCTAssertGreaterThanOrEqual(cameras.count, 5)
        for c in cameras {
            let k = c["camera"]
            let camera = SceneStudioCameraState(
                type: str(k?["type"]), position: ds(k?["position"]), lookAt: ds(k?["lookAt"]), fov: d(k?["fov"]),
                roll: d(k?["roll"]), orthoHeight: d(k?["orthoHeight"]), shotIndex: nil
            )
            let basis = SceneStudioCameraMath.cameraBasis(camera)
            assertNear(ds(c["basis"]?["forward"]), basis.forward, eps, "basis forward")
            assertNear(ds(c["basis"]?["right"]), basis.right, eps, "basis right")
            assertNear(ds(c["basis"]?["up"]), basis.up, eps, "basis up")
            for pt in arr(c["points"]) {
                let got = SceneStudioCameraMath.projectToScreen(ds(pt["point"]), camera, width: 1920, height: 1080)
                if let want = pt["screen"], want != .null {
                    guard let got = got else { XCTFail("a point should be on screen: \(ds(pt["point"]))"); continue }
                    XCTAssertEqual(d(want["x"]), got.x, accuracy: eps * 10, "screen x")
                    XCTAssertEqual(d(want["y"]), got.y, accuracy: eps * 10, "screen y")
                    XCTAssertEqual(d(want["depth"]), got.depth, accuracy: eps, "screen depth")
                } else {
                    XCTAssertNil(got, "a point that cannot be drawn: \(ds(pt["point"]))")
                }
            }
        }
    }

    func testUnknownClipNamesPlayIdleAndPoseTimesAreSafe() {
        XCTAssertEqual(SceneStudioRenderMath.resolveClip(nil), "Idle")
        XCTAssertEqual(SceneStudioRenderMath.resolveClip("Moonwalk"), "Idle")
        XCTAssertEqual(SceneStudioRenderMath.resolveClip("rUn"), "Run")
        let before = SceneStudioRenderMath.poseFor(clip: "Walk", time: 0).values()
        XCTAssertEqual(before, SceneStudioRenderMath.poseFor(clip: "Walk", time: Double.nan).values())
        XCTAssertEqual(before, SceneStudioRenderMath.poseFor(clip: "Walk", time: -3).values())
    }

    // ---- JSON reader ---------------------------------------------------------------------------

    func testJSONReaderReadsEveryKindOfValue() throws {
        let v = try SceneStudioJSONParser.parse("{\"a\": [1, -2.5, 3e2, 0], \"b\": \"x\\n\\\"y\\\" \\u00e9 \\ud83d\\ude00\", \"c\": true, \"d\": false, \"e\": null, \"f\": {}}")
        XCTAssertEqual(v["a"], .array([.number(1), .number(-2.5), .number(300), .number(0)]))
        XCTAssertEqual(v["b"], .string("x\n\"y\" é 😀"))
        XCTAssertEqual(v["c"], .bool(true))
        XCTAssertEqual(v["d"], .bool(false))
        XCTAssertEqual(v["e"], .null)
        XCTAssertEqual(v["f"], .object([:]))
    }

    func testJSONReaderIsStrictLikeJSON() {
        let bad = ["", "{", "[1,]", "{\"a\":1,}", "{'a':1}", "[01]", "[1.]", "[.5]", "[+1]", "{\"a\" 1}", "\"abc", "\"a\nb\"", "[1] 2", "nul", "[\"\\x\"]", "[\"\\u12\"]", "// c\n{}", "[NaN]"]
        for text in bad {
            XCTAssertThrowsError(try SceneStudioJSONParser.parse(text), "Should not have read: \(text)")
        }
    }

    func testJSONReaderStopsOnAbsurdNesting() {
        let deep = String(repeating: "[", count: 5000) + String(repeating: "]", count: 5000)
        XCTAssertThrowsError(try SceneStudioJSONParser.parse(deep))
    }

    // ---- scene reader --------------------------------------------------------------------------

    func testAnEmptySceneGetsEveryDefault() throws {
        let s = try SceneStudioReader.parse("{}")
        XCTAssertEqual(s.version, "1.0")
        XCTAssertEqual(s.settings.width, 1080)
        XCTAssertEqual(s.settings.height, 1920)
        XCTAssertEqual(s.settings.fps, 30)
        XCTAssertEqual(s.settings.duration, 8.0)
        XCTAssertEqual(s.settings.background, "#101826")
        XCTAssertEqual(s.settings.seed, 1)
        XCTAssertEqual(s.camera.type, "perspective")
        XCTAssertEqual(s.camera.position, [0, 2, 8])
        XCTAssertEqual(s.camera.lookAt, [0, 1, 0])
        XCTAssertEqual(s.camera.fov, 45)
        XCTAssertEqual(s.lights.count, 1) // a scene that leaves "lights" out gets one sun
        XCTAssertEqual(s.lights[0].type, "sun")
        XCTAssertEqual(s.environment.preset, "studio")
        XCTAssertEqual(s.post.toneMapping, "aces")
        XCTAssertTrue(s.captions.enabled)
        XCTAssertEqual(s.captions.placement, "belowSpeaker")
        XCTAssertEqual(s.captions.wordsPerGroup, 3)
        XCTAssertEqual(s.export.format, "mp4")
        XCTAssertEqual(s.export.quality, "high")
        XCTAssertTrue(s.objects.isEmpty && s.layers.isEmpty && s.animations.isEmpty && s.shots.isEmpty)
        XCTAssertTrue(try SceneStudioReader.parse("{\"lights\": []}").lights.isEmpty)
    }

    func testValuesAreNormalisedLikeTheWebValidator() throws {
        let s = try SceneStudioReader.parse("""
        {
          "settings": {"background": "#ABC"},
          "objects": [
            {"id": "a", "type": "box", "scale": 2, "size": 3, "quaternion": [0, 0, 0, 2], "rotation": [10, 20, 30]},
            {"id": "b", "type": "box", "rotation": [10, 20, 30], "color": "#FFAA00"}
          ],
          "layers": [
            {"id": "t", "type": "text", "text": "Hi", "scale": 2},
            {"id": "r", "type": "rect"}
          ],
          "shots": [{"id": "late", "start": 5}, {"id": "early", "start": 1}, {"id": "mid", "start": 1}]
        }
        """)
        XCTAssertEqual(s.settings.background, "#aabbcc")
        XCTAssertEqual(s.objects[0].scale, [2, 2, 2])
        XCTAssertEqual(s.objects[0].size ?? [], [3, 3, 3])
        XCTAssertEqual(s.objects[0].quaternion ?? [], [0, 0, 0, 1]) // normalised to a unit rotation
        XCTAssertEqual(s.objects[0].rotation, [0, 0, 0]) // ignored when a quaternion is present
        XCTAssertNil(s.objects[1].quaternion)
        XCTAssertEqual(s.objects[1].rotation, [10, 20, 30])
        XCTAssertEqual(s.objects[1].color, "#ffaa00")
        XCTAssertEqual(s.layers[0].size, [0, 0]) // text layers size themselves
        XCTAssertEqual(s.layers[1].size, [100, 100])
        XCTAssertEqual(s.layers[0].scale, [2, 2])
        XCTAssertEqual(s.layers[0].end, 8.0) // ends with the scene
        XCTAssertEqual(s.shots.map { $0.id }, ["early", "mid", "late"]) // sorted by start, equal starts keep their order
    }

    func testParentsMustExistAndNeverLoop() throws {
        let s = try SceneStudioReader.parse("""
        {"objects": [
          {"id": "root", "type": "group"},
          {"id": "kid", "type": "box", "parent": "root"},
          {"id": "orphan", "type": "box", "parent": "nobody"},
          {"id": "self", "type": "box", "parent": "self"},
          {"id": "a", "type": "box", "parent": "b"},
          {"id": "b", "type": "box", "parent": "a"}
        ]}
        """)
        var parents: [String: String?] = [:]
        for o in s.objects { parents[o.id] = o.parent }
        XCTAssertEqual(parents["kid"] ?? nil, "root")
        XCTAssertNil(parents["orphan"] ?? nil)
        XCTAssertNil(parents["self"] ?? nil)
        XCTAssertNil(parents["a"] ?? nil)
        XCTAssertNil(parents["b"] ?? nil)
    }

    func testAssetNamesThatReachOutsideTheSceneAreDropped() throws {
        let s = try SceneStudioReader.parse("""
        {"objects": [
          {"id": "a", "type": "model", "asset": "https://example.com/x.glb"},
          {"id": "b", "type": "model", "asset": "../secret.glb"},
          {"id": "c", "type": "model", "asset": "/etc/passwd"},
          {"id": "d", "type": "model", "asset": "library\\\\tree.glb"},
          {"id": "e", "type": "model", "asset": "library/tree_oak"},
          {"id": "f", "type": "model", "asset": "my-model.glb"}
        ]}
        """)
        XCTAssertEqual(s.objects.map { $0.asset ?? "-" }, ["-", "-", "-", "-", "library/tree_oak", "my-model.glb"])
    }

    func testTextInAFenceIsAccepted() throws {
        let s = try SceneStudioReader.parse("```json\n{\"settings\": {\"fps\": 24}}\n```")
        XCTAssertEqual(s.settings.fps, 24)
    }

    func testScenesTheAppCannotReadThrowOneKindOfError() {
        var objects: [String] = []
        for i in 1...201 { objects.append("{\"id\": \"o\(i)\", \"type\": \"box\"}") }
        let bad = ["", "   ", "not json", "[1, 2]", "\"text\"", "{\"version\": \"2.0\"}", "{\"version\": 1}", "{\"version\": \"one\"}", "{\"objects\": [" + objects.joined(separator: ",") + "]}"]
        for text in bad {
            XCTAssertThrowsError(try SceneStudioReader.parse(text), "Should not have been read: \(text.prefix(60))") { error in
                XCTAssertTrue(error is SceneStudioReadError)
            }
        }
    }

    func testEverySharedValidSceneReadsAndKeepsAllItsItems() throws {
        for name in ["01-minimal", "02-walk-and-talk", "03-two-speakers-camera", "04-night-flood-cinematic", "05-2d-motion-title"] {
            let text = try sharedText("scenes/valid/\(name).json")
            let s = try SceneStudioReader.parse(text)
            let raw = try SceneStudioJSONParser.parse(text)
            func count(_ key: String) -> Int { return raw[key]?.arrayValue?.count ?? 0 }
            XCTAssertEqual(count("objects"), s.objects.count, "\(name) objects")
            XCTAssertEqual(count("layers"), s.layers.count, "\(name) layers")
            XCTAssertEqual(count("shots"), s.shots.count, "\(name) shots")
            XCTAssertEqual(count("audio"), s.audio.count, "\(name) audio")
            XCTAssertEqual(count("animations"), s.animations.count, "\(name) animations")
            XCTAssertEqual(count("dialogue"), s.dialogue.count, "\(name) dialogue")
        }
    }

    func testNoSharedInvalidCaseCanCrashTheReader() throws {
        let file = try sharedJSON("invalid-cases.json")
        let cases = arr(file["cases"])
        XCTAssertGreaterThanOrEqual(cases.count, 40)
        for c in cases {
            do {
                _ = try SceneStudioReader.fromJSON(c["input"])
            } catch is SceneStudioReadError {
                // a refusal with a reason is fine
            } catch {
                XCTFail("Case \"\(str(c["name"]))\" crashed the reader: \(error)")
            }
        }
    }

    func testLightsFollowTheSameRulesAsTheWebTool() throws {
        let own = try SceneStudioReader.parse("{\"lights\": [{\"type\": \"sun\", \"intensity\": 2, \"direction\": [0, -1, -1]}, {\"type\": \"point\", \"intensity\": 5, \"position\": [1, 2, 3]}, {\"type\": \"sun\"}, {\"type\": \"ambient\", \"intensity\": 0.2}]}")
        let plans = SceneStudioLook.planLights(own)
        XCTAssertEqual(plans.map { $0.kind }, ["sun", "point", "sun", "ambient"])
        XCTAssertEqual(plans.map { $0.castsShadow }, [true, false, false, false])
        XCTAssertEqual(plans[1].range ?? -1, 30.0, accuracy: 1e-12) // 10 + 4 x 5
        XCTAssertNil(plans[0].range)

        let day = SceneStudioLook.planLights(try SceneStudioReader.parse("{\"environment\": {\"preset\": \"day\"}, \"lights\": []}"))
        XCTAssertEqual(day.count, 1)
        XCTAssertEqual(day[0].color, "#fff4e0")
        XCTAssertEqual(day[0].intensity, 3.0)
        XCTAssertTrue(day[0].castsShadow)
        XCTAssertTrue(SceneStudioLook.planLights(try SceneStudioReader.parse("{\"environment\": {\"preset\": \"none\"}, \"lights\": []}")).isEmpty)

        let fill = SceneStudioLook.ambientFill(try SceneStudioReader.parse("{\"environment\": {\"preset\": \"day\", \"intensity\": 2}, \"lights\": [{\"type\": \"ambient\", \"intensity\": 0.2}, {\"type\": \"sun\"}]}"))
        XCTAssertEqual(fill.intensity, 0.6 * 2 + 0.2, accuracy: 1e-12)
        XCTAssertEqual(fill.skyColor, "#cfe6f7")
        XCTAssertEqual(fill.groundColor, "#7a8a6a")
    }
}
