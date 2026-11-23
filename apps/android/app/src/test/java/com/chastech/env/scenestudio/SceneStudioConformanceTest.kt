package com.chastech.env.scenestudio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Runs the shared Scene Studio test numbers (the vectors files in apps/shared/scene-studio, written by the web tool's
 * tests) against this Kotlin implementation. If a rule changes on the web, the vectors change there first and this
 * test fails here until the Kotlin side matches: that is how the platforms are kept in step.
 */
class SceneStudioConformanceTest {
    private fun resource(path: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("scene-studio/$path") ?: error("Missing shared file scene-studio/$path")
        return stream.use { String(it.readBytes(), Charsets.UTF_8) }
    }

    @Suppress("UNCHECKED_CAST")
    private fun json(path: String): Map<String, Any?> = MiniJson.parse(resource(path)) as Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    private fun obj(v: Any?): Map<String, Any?> = v as Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    private fun arr(v: Any?): List<Any?> = v as List<Any?>

    private fun d(v: Any?): Double = v as Double

    private fun doubles(v: Any?): DoubleArray = arr(v).map { d(it) }.toDoubleArray()

    private fun near(expected: Double, actual: Double, eps: Double, what: String) {
        assertTrue("$what: expected $expected but was $actual (allowed difference $eps)", Math.abs(expected - actual) <= eps)
    }

    private fun nearAll(expected: DoubleArray, actual: DoubleArray, eps: Double, what: String) {
        assertEquals("$what: length", expected.size, actual.size)
        for (i in expected.indices) near(expected[i], actual[i], eps, "$what[$i]")
    }

    private fun trackValue(v: Any?): TrackValue = when (v) {
        is Double -> TrackValue.Num(v)
        is String -> TrackValue.Text(v)
        is Boolean -> TrackValue.Flag(v)
        is List<*> -> TrackValue.Vec(doubles(v))
        else -> error("Unexpected track value $v")
    }

    private fun sameValue(expected: Any?, actual: TrackValue, what: String) {
        when (expected) {
            is Double -> near(expected, (actual as TrackValue.Num).v, 1e-9, what)
            is String -> assertEquals(what, expected, (actual as TrackValue.Text).v)
            is Boolean -> assertEquals(what, expected, (actual as TrackValue.Flag).v)
            is List<*> -> nearAll(doubles(expected), (actual as TrackValue.Vec).v, 1e-9, what)
            else -> error("Unexpected expected value $expected")
        }
    }

    // ---- animation -----------------------------------------------------------------------------

    @Test
    fun trackSamplingMatchesTheSharedVectors() {
        val vectors = arr(json("animation-vectors.json")["vectors"])
        assertTrue(vectors.isNotEmpty())
        for (item in vectors) {
            val v = obj(item)
            val t = obj(v["track"])
            // Tracks without a property blend plainly (numbers, lists); the special properties are named in the file.
            val property = t["property"] as String? ?: "position"
            val keyframes = arr(t["keyframes"]).map {
                val k = obj(it)
                Keyframe(d(k["time"]), trackValue(k["value"]), k["easing"] as String?)
            }
            val track = AnimationTrack("t", property, t["easing"] as String, t["loop"] as Boolean, keyframes)
            for (s in arr(v["samples"])) {
                val sample = obj(s)
                sameValue(sample["value"], SceneAnimation.sampleTrack(track, d(sample["time"])), "${v["name"]} at ${sample["time"]}")
            }
        }
    }

    @Test
    fun seededRandomMatches() {
        val v = obj(json("animation-vectors.json")["seededRandom"])
        val next = SceneAnimation.seededRandom((d(v["seed"])).toLong())
        arr(v["firstFive"]).forEachIndexed { i, expected -> near(d(expected), next(), 1e-12, "seededRandom #$i") }
    }

    @Test
    fun valueNoiseAndCameraShakeMatch() {
        val noise = arr(obj(json("animation-vectors.json")["valueNoise"])["samples"])
        for (s in noise) {
            val n = obj(s)
            near(d(n["value"]), SceneAnimation.valueNoise(d(n["seed"]).toLong(), d(n["x"]), d(n["channel"]).toInt()), 1e-9, "valueNoise $n")
        }
        val shakes = arr(obj(json("animation-vectors.json")["cameraShake"])["samples"])
        for (s in shakes) {
            val n = obj(s)
            val shake = obj(n["shake"])
            nearAll(doubles(n["value"]), SceneAnimation.cameraShake(d(n["seed"]).toLong(), d(n["time"]), d(shake["amount"]), d(shake["speed"])), 1e-9, "cameraShake $n")
        }
    }

    // ---- frame state ---------------------------------------------------------------------------

    @Test
    fun eulerAnglesBecomeTheSameQuaternions() {
        val file = json("frame-vectors.json")
        val eps = d(file["tolerance"])
        for (item in arr(file["euler"])) {
            val e = obj(item)
            nearAll(doubles(e["quaternion"]), SceneFrameState.eulerToQuaternion(doubles(e["rotation"]), e["order"] as String), eps, "euler $e")
        }
    }

    @Test
    fun framesOfTheSharedScenesMatch() {
        val file = json("frame-vectors.json")
        val eps = d(file["tolerance"])
        val samplers = HashMap<String, SceneFrameState.FrameSampler>()
        val frames = arr(file["frames"])
        assertTrue(frames.size >= 20)
        for (item in frames) {
            val f = obj(item)
            val sceneFile = f["scene"] as String
            val sampler = samplers.getOrPut(sceneFile) { SceneFrameState.sampler(SceneReader.parse(resource(sceneFile))) }
            val frame = d(f["frame"]).toInt()
            val state = sampler.at(frame)
            val where = "$sceneFile frame $frame"

            val c = obj(f["camera"])
            assertEquals("$where camera type", c["type"], state.camera.type)
            nearAll(doubles(c["position"]), state.camera.position, eps, "$where camera position")
            nearAll(doubles(c["lookAt"]), state.camera.lookAt, eps, "$where camera lookAt")
            near(d(c["fov"]), state.camera.fov, eps, "$where fov")
            near(d(c["roll"]), state.camera.roll, eps, "$where roll")
            near(d(c["orthoHeight"]), state.camera.orthoHeight, eps, "$where orthoHeight")
            assertEquals("$where shotIndex", (c["shotIndex"] as Double?)?.toInt(), state.camera.shotIndex)

            val objects = obj(f["objects"])
            assertEquals("$where object ids", objects.keys.toList(), state.objects.map { it.id })
            for (o in state.objects) {
                val e = obj(objects[o.id])
                val w = "$where object ${o.id}"
                nearAll(doubles(e["position"]), o.position, eps, "$w position")
                nearAll(doubles(e["quaternion"]), o.quaternion, eps, "$w quaternion")
                nearAll(doubles(e["scale"]), o.scale, eps, "$w scale")
                assertEquals("$w color", e["color"], o.color)
                near(d(e["opacity"]), o.opacity, eps, "$w opacity")
                assertEquals("$w visible", e["visible"], o.visible)
                assertEquals("$w clip", e["clip"], o.clip)
                near(d(e["clipTime"]), o.clipTime, eps, "$w clipTime")
            }

            val layers = arr(f["layers"])
            assertEquals("$where layer ids", layers.map { obj(it)["id"] }, state.layers.map { it.id })
            layers.forEachIndexed { i, item2 ->
                val e = obj(item2)
                val l = state.layers[i]
                val w = "$where layer ${l.id}"
                nearAll(doubles(e["position"]), l.position, eps, "$w position")
                nearAll(doubles(e["scale"]), l.scale, eps, "$w scale")
                near(d(e["rotation"]), l.rotation, eps, "$w rotation")
                near(d(e["opacity"]), l.opacity, eps, "$w opacity")
                assertEquals("$w color", e["color"], l.color)
            }
        }
    }

    // ---- render maths --------------------------------------------------------------------------

    @Test
    fun renderMathMatchesTheSharedVectors() {
        val file = json("render-vectors.json")
        val eps = d(file["tolerance"])

        for (item in arr(file["hash"])) {
            val h = obj(item)
            near(d(h["value"]), SceneRenderMath.hash01(d(h["seed"]).toInt(), d(h["i"]).toInt(), d(h["salt"]).toInt()), eps, "hash $h")
        }

        val particles = arr(file["particles"])
        assertTrue(particles.size >= 28)
        for (item in particles) {
            val p = obj(item)
            val params = obj(p["params"])
            val got = SceneRenderMath.particleAt(p["type"] as String, d(p["i"]).toInt(), d(p["time"]), SceneRenderMath.EmitterParams(d(params["intensity"]), d(params["area"]), d(params["height"])), d(p["seed"]).toInt())
            val e = obj(p["particle"])
            val w = "particle ${p["type"]} #${p["i"]} at ${p["time"]}"
            near(d(e["x"]), got.x, eps, "$w x")
            near(d(e["y"]), got.y, eps, "$w y")
            near(d(e["z"]), got.z, eps, "$w z")
            near(d(e["size"]), got.size, eps, "$w size")
            near(d(e["streak"]), got.streak, eps, "$w streak")
            near(d(e["alpha"]), got.alpha, eps, "$w alpha")
        }

        val poses = arr(file["poses"])
        assertEquals(SceneRenderMath.CLIP_NAMES.size * 4, poses.size)
        for (item in poses) {
            val p = obj(item)
            val got = SceneRenderMath.poseFor(p["clip"] as String, d(p["time"])).values()
            val expected = obj(p["pose"])
            assertEquals(expected.keys, got.keys)
            for ((k, v) in expected) near(d(v), got.getValue(k), eps, "pose ${p["clip"]} at ${p["time"]} $k")
        }

        for (item in arr(file["waves"])) {
            val w = obj(item)
            val params = obj(w["params"])
            near(d(w["height"]), SceneRenderMath.waveHeightAt(d(w["x"]), d(w["z"]), d(w["time"]), d(params["waveHeight"]), d(params["waveSpeed"]), d(params["flow"])), eps, "wave $w")
        }

        for (item in arr(file["counts"])) {
            val c = obj(item)
            assertEquals("count $c", d(c["count"]).toInt(), SceneRenderMath.particleCount(c["type"] as String, d(c["intensity"]), c["quality"] as String))
        }
    }

    @Test
    fun lookAndCameraMathMatchTheSharedVectors() {
        val file = json("render-vectors.json")
        val eps = d(file["tolerance"])

        for (item in arr(file["sky"])) {
            val s = obj(item)
            val preset = SceneLook.SKY_PRESETS.getValue(s["preset"] as String)
            nearAll(doubles(s["color"]), SceneLook.skyColorAt(preset, d(s["y"])), eps, "sky $s")
        }

        for (item in arr(file["lightRange"])) {
            val r = obj(item)
            near(d(r["range"]), SceneLook.pointLightRange(d(r["intensity"])), eps, "light range $r")
        }

        for (item in arr(file["post"])) {
            val c = obj(item)
            val p = obj(c["post"])
            val plan = SceneLook.planPost(
                ScenePost(d(p["bloom"]), d(p["bloomThreshold"]), d(p["vignette"]), d(p["grain"]), d(p["depthOfField"]), d(p["focusDistance"]), p["toneMapping"] as String, d(p["exposure"]), d(p["contrast"]), d(p["saturation"])),
            )
            val e = obj(c["plan"])
            assertEquals(e["bloom"], plan.bloom)
            near(d(e["bloomWeight"]), plan.bloomWeight, eps, "bloomWeight")
            near(d(e["bloomThreshold"]), plan.bloomThreshold, eps, "bloomThreshold")
            assertEquals(e["vignette"], plan.vignette)
            near(d(e["vignetteWeight"]), plan.vignetteWeight, eps, "vignetteWeight")
            assertEquals(e["grain"], plan.grain)
            near(d(e["grainIntensity"]), plan.grainIntensity, eps, "grainIntensity")
            assertEquals(e["depthOfField"], plan.depthOfField)
            near(d(e["focusDistanceMm"]), plan.focusDistanceMm, eps, "focusDistanceMm")
            near(d(e["fStop"]), plan.fStop, eps, "fStop")
            assertEquals(e["toneMapping"], plan.toneMapping)
            near(d(e["exposure"]), plan.exposure, eps, "exposure")
            near(d(e["contrast"]), plan.contrast, eps, "contrast")
            near(d(e["saturation"]), plan.saturation, eps, "saturation")
        }

        val cameras = arr(file["camera"])
        assertTrue(cameras.size >= 5)
        for (item in cameras) {
            val c = obj(item)
            val k = obj(c["camera"])
            val camera = CameraState(k["type"] as String, doubles(k["position"]), doubles(k["lookAt"]), d(k["fov"]), d(k["roll"]), d(k["orthoHeight"]), null)
            val basis = SceneCameraMath.cameraBasis(camera)
            val expected = obj(c["basis"])
            nearAll(doubles(expected["forward"]), basis.forward, eps, "basis forward $k")
            nearAll(doubles(expected["right"]), basis.right, eps, "basis right $k")
            nearAll(doubles(expected["up"]), basis.up, eps, "basis up $k")
            for (pt in arr(c["points"])) {
                val point = obj(pt)
                val got = SceneCameraMath.projectToScreen(doubles(point["point"]), camera, 1920.0, 1080.0)
                val want = point["screen"]
                if (want == null) {
                    assertNull("screen for ${point["point"]} with $k", got)
                } else {
                    val w = obj(want)
                    assertNotNull("screen for ${point["point"]} with $k", got)
                    near(d(w["x"]), got!!.x, eps * 10, "screen x")
                    near(d(w["y"]), got.y, eps * 10, "screen y")
                    near(d(w["depth"]), got.depth, eps, "screen depth")
                }
            }
        }
    }

    @Test
    fun unknownClipNamesPlayIdleAndPoseTimesAreSafe() {
        assertEquals("Idle", SceneRenderMath.resolveClip(null))
        assertEquals("Idle", SceneRenderMath.resolveClip("Moonwalk"))
        assertEquals("Run", SceneRenderMath.resolveClip("rUn"))
        val before = SceneRenderMath.poseFor("Walk", 0.0).values()
        assertEquals(before, SceneRenderMath.poseFor("Walk", Double.NaN).values())
        assertEquals(before, SceneRenderMath.poseFor("Walk", -3.0).values())
    }

    @Test
    fun theSharedFilesAreActuallyThere() {
        assertNotNull(json("animation-vectors.json"))
        assertNull(javaClass.classLoader!!.getResourceAsStream("scene-studio/does-not-exist.json"))
    }
}
