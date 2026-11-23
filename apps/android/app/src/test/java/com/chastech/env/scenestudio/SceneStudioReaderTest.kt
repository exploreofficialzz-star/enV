package com.chastech.env.scenestudio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** The JSON reader and the scene reader: defaults, normalising, and "never crash on a bad file". */
class SceneStudioReaderTest {
    private fun resource(path: String): String {
        val stream = javaClass.classLoader!!.getResourceAsStream("scene-studio/$path") ?: error("Missing shared file scene-studio/$path")
        return stream.use { String(it.readBytes(), Charsets.UTF_8) }
    }

    private fun read(json: String): Scene = SceneReader.parse(json)

    private fun assertArrayNear(expected: DoubleArray, actual: DoubleArray) {
        assertEquals(expected.size, actual.size)
        for (i in expected.indices) assertEquals(expected[i], actual[i], 1e-12)
    }

    // ---- MiniJson ------------------------------------------------------------------------------

    @Test
    fun jsonReaderReadsEveryKindOfValue() {
        val v = MiniJson.parse("""{"a": [1, -2.5, 3e2, 0, -0.0], "b": "x\n\"y\" \u00e9 \ud83d\ude00", "c": true, "d": false, "e": null, "f": {}}""") as Map<*, *>
        assertEquals(listOf(1.0, -2.5, 300.0, 0.0, -0.0), v["a"])
        assertEquals("x\n\"y\" é \uD83D\uDE00", v["b"])
        assertEquals(true, v["c"])
        assertEquals(false, v["d"])
        assertTrue(v.containsKey("e"))
        assertNull(v["e"])
        assertEquals(emptyMap<String, Any?>(), v["f"])
        assertEquals(listOf("a", "b", "c", "d", "e", "f"), v.keys.toList()) // file order is kept
    }

    @Test
    fun jsonReaderIsStrictLikeJson() {
        val bad = listOf(
            "", "{", "[1,]", "{\"a\":1,}", "{'a':1}", "[01]", "[1.]", "[.5]", "[+1]", "{\"a\" 1}", "\"abc", "\"a\nb\"", "[1] 2", "nul", "[\"\\x\"]", "[\"\\u12\"]", "// c\n{}", "[NaN]",
        )
        for (text in bad) {
            try {
                MiniJson.parse(text)
                fail("Should not have read: $text")
            } catch (e: JsonException) {
                // expected
            }
        }
    }

    @Test
    fun jsonReaderStopsOnAbsurdNesting() {
        val deep = "[".repeat(5000) + "]".repeat(5000)
        try {
            MiniJson.parse(deep)
            fail("Nesting this deep must be refused")
        } catch (e: JsonException) {
            assertTrue(e.message!!.contains("deep"))
        }
    }

    @Test
    fun aLeadingByteOrderMarkAndSpacesAreSkipped() {
        assertEquals(listOf(1.0), MiniJson.parse("\uFEFF  [1]  \n"))
    }

    // ---- SceneReader: defaults and normalising --------------------------------------------------

    @Test
    fun anEmptySceneGetsEveryDefault() {
        val s = read("{}")
        assertEquals("1.0", s.version)
        assertEquals(1080, s.settings.width)
        assertEquals(1920, s.settings.height)
        assertEquals(30, s.settings.fps)
        assertEquals(8.0, s.settings.duration, 0.0)
        assertEquals("#101826", s.settings.background)
        assertEquals(1L, s.settings.seed)
        assertEquals("perspective", s.camera.type)
        assertArrayNear(doubleArrayOf(0.0, 2.0, 8.0), s.camera.position)
        assertArrayNear(doubleArrayOf(0.0, 1.0, 0.0), s.camera.lookAt)
        assertEquals(45.0, s.camera.fov, 0.0)
        assertEquals(0.0, s.camera.shakeAmount, 0.0)
        assertEquals(4.0, s.camera.shakeSpeed, 0.0)
        assertEquals(1, s.lights.size) // a scene that leaves "lights" out gets one sun
        assertEquals("sun", s.lights[0].type)
        assertEquals("studio", s.environment.preset)
        assertEquals("aces", s.post.toneMapping)
        assertEquals(true, s.captions.enabled)
        assertEquals("belowSpeaker", s.captions.placement)
        assertEquals(3, s.captions.wordsPerGroup)
        assertEquals("mp4", s.export.format)
        assertEquals("high", s.export.quality)
        assertTrue(s.objects.isEmpty() && s.layers.isEmpty() && s.animations.isEmpty() && s.shots.isEmpty())
    }

    @Test
    fun anExplicitEmptyLightListMeansNoLights() {
        assertTrue(read("""{"lights": []}""").lights.isEmpty())
    }

    @Test
    fun valuesAreNormalisedLikeTheWebValidator() {
        val s = read(
            """{
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
            }""",
        )
        assertEquals("#aabbcc", s.settings.background)
        val a = s.objects[0]
        assertArrayNear(doubleArrayOf(2.0, 2.0, 2.0), a.scale)
        assertArrayNear(doubleArrayOf(3.0, 3.0, 3.0), a.size!!)
        assertArrayNear(doubleArrayOf(0.0, 0.0, 0.0, 1.0), a.quaternion!!) // normalised to a unit rotation
        assertArrayNear(doubleArrayOf(0.0, 0.0, 0.0), a.rotation) // ignored when a quaternion is present
        val b = s.objects[1]
        assertNull(b.quaternion)
        assertArrayNear(doubleArrayOf(10.0, 20.0, 30.0), b.rotation)
        assertEquals("#ffaa00", b.color)
        assertEquals("XYZ", b.rotationOrder)
        assertArrayNear(doubleArrayOf(0.0, 0.0), s.layers[0].size) // text layers size themselves
        assertArrayNear(doubleArrayOf(100.0, 100.0), s.layers[1].size)
        assertArrayNear(doubleArrayOf(2.0, 2.0), s.layers[0].scale)
        assertEquals(8.0, s.layers[0].end, 0.0) // ends with the scene
        assertEquals(listOf("early", "mid", "late"), s.shots.map { it.id }) // sorted by start, equal starts keep their order
    }

    @Test
    fun badValuesFallBackToTheDefaultAndBadItemsAreSkipped() {
        val s = read(
            """{
              "settings": {"fps": 29.5, "width": "wide", "duration": 9999},
              "camera": {"fov": 500, "position": [1, 2]},
              "objects": [
                {"id": "ok", "type": "box", "opacity": 7},
                {"id": "ok", "type": "box"},
                {"id": "bad id!", "type": "box"},
                {"id": "camera", "type": "box"},
                {"type": "box"},
                {"id": "notype"},
                "nonsense"
              ],
              "layers": [{"id": "x", "type": "hologram"}],
              "animations": [
                {"target": "ghost", "property": "position", "keyframes": [{"time": 0, "value": [0, 0, 0]}]},
                {"target": "ok", "property": "opacity", "keyframes": [{"time": 0, "value": 3}]},
                {"target": "ok", "property": "opacity", "keyframes": [{"time": 2, "value": 1}, {"time": 1, "value": 0}]},
                {"target": "ok", "property": "opacity", "keyframes": []},
                {"target": "ok", "property": "opacity", "keyframes": [{"time": 0, "value": 0.5}]}
              ]
            }""",
        )
        assertEquals(30, s.settings.fps)
        assertEquals(1080, s.settings.width)
        assertEquals(8.0, s.settings.duration, 0.0)
        assertEquals(45.0, s.camera.fov, 0.0)
        assertArrayNear(doubleArrayOf(0.0, 2.0, 8.0), s.camera.position)
        assertEquals(listOf("ok"), s.objects.map { it.id })
        assertEquals(1.0, s.objects[0].opacity, 0.0)
        assertTrue(s.layers.isEmpty())
        assertEquals(1, s.animations.size) // only the last, valid track survives
        assertEquals(0.5, ((s.animations[0].keyframes[0].value) as TrackValue.Num).v, 0.0)
    }

    @Test
    fun parentsMustExistAndNeverLoop() {
        val s = read(
            """{"objects": [
              {"id": "root", "type": "group"},
              {"id": "kid", "type": "box", "parent": "root"},
              {"id": "orphan", "type": "box", "parent": "nobody"},
              {"id": "self", "type": "box", "parent": "self"},
              {"id": "a", "type": "box", "parent": "b"},
              {"id": "b", "type": "box", "parent": "a"}
            ]}""",
        )
        val parents = s.objects.associate { it.id to it.parent }
        assertEquals("root", parents["kid"])
        assertNull(parents["orphan"])
        assertNull(parents["self"])
        assertNull(parents["a"])
        assertNull(parents["b"])
    }

    @Test
    fun assetNamesThatReachOutsideTheSceneAreDropped() {
        val s = read(
            """{"objects": [
              {"id": "a", "type": "model", "asset": "https://example.com/x.glb"},
              {"id": "b", "type": "model", "asset": "../secret.glb"},
              {"id": "c", "type": "model", "asset": "/etc/passwd"},
              {"id": "d", "type": "model", "asset": "library\\tree.glb"},
              {"id": "e", "type": "model", "asset": "library/tree_oak"},
              {"id": "f", "type": "model", "asset": "my-model.glb"}
            ]}""",
        )
        assertEquals(listOf(null, null, null, null, "library/tree_oak", "my-model.glb"), s.objects.map { it.asset })
    }

    @Test
    fun textInAFenceIsAccepted() {
        val s = read("```json\n{\"settings\": {\"fps\": 24}}\n```")
        assertEquals(24, s.settings.fps)
    }

    @Test
    fun scenesTheAppCannotReadThrowOneKindOfError() {
        val bad = listOf(
            "", "   ", "not json", "[1, 2]", "\"text\"", "{\"version\": \"2.0\"}", "{\"version\": 1}", "{\"version\": \"one\"}",
            "{\"objects\": [" + (1..201).joinToString(",") { "{\"id\": \"o$it\", \"type\": \"box\"}" } + "]}",
        )
        for (text in bad) {
            try {
                read(text)
                fail("Should not have been read: ${text.take(60)}")
            } catch (e: SceneReadException) {
                assertFalse(e.message.isNullOrBlank())
            }
        }
    }

    @Test
    fun theLongestAllowedSceneIsStillFine() {
        val s = read("""{"settings": {"fps": 60, "duration": 120}}""")
        assertEquals(7200, SceneAnimation.frameCount(s.settings.fps, s.settings.duration))
    }

    @Test
    fun aSceneOverOneMegabyteIsRefused() {
        val padding = "x".repeat(SceneReader.MAX_JSON_BYTES)
        try {
            read("""{"objects": [{"id": "a", "type": "text", "text": "$padding"}]}""")
            fail("Too large")
        } catch (e: SceneReadException) {
            assertTrue(e.message!!.contains("1 MB"))
        }
    }

    // ---- the shared scenes and cases -------------------------------------------------------------

    @Test
    fun everySharedValidSceneReadsAndKeepsAllItsItems() {
        for (name in listOf("01-minimal", "02-walk-and-talk", "03-two-speakers-camera", "04-night-flood-cinematic", "05-2d-motion-title")) {
            val text = resource("scenes/valid/$name.json")
            val s = SceneReader.parse(text)
            @Suppress("UNCHECKED_CAST")
            val raw = MiniJson.parse(text) as Map<String, Any?>
            fun count(key: String) = (raw[key] as List<*>?)?.size ?: 0
            assertEquals("$name objects", count("objects"), s.objects.size)
            assertEquals("$name layers", count("layers"), s.layers.size)
            assertEquals("$name shots", count("shots"), s.shots.size)
            assertEquals("$name audio", count("audio"), s.audio.size)
            assertEquals("$name animations", count("animations"), s.animations.size)
            assertEquals("$name dialogue", count("dialogue"), s.dialogue.size)
            assertNotNull(s.settings)
        }
    }

    @Test
    fun noSharedInvalidCaseCanCrashTheReader() {
        @Suppress("UNCHECKED_CAST")
        val file = MiniJson.parse(resource("invalid-cases.json")) as Map<String, Any?>
        val cases = file["cases"] as List<*>
        assertTrue(cases.size >= 40)
        for (item in cases) {
            @Suppress("UNCHECKED_CAST")
            val case = item as Map<String, Any?>
            try {
                SceneReader.fromJson(case["input"])
            } catch (e: SceneReadException) {
                // a refusal with a reason is fine
            } catch (e: Throwable) {
                fail("Case \"${case["name"]}\" crashed the reader: $e")
            }
        }
    }

    // ---- looks (hand-worked values) ---------------------------------------------------------------

    @Test
    fun lightsFollowTheSameRulesAsTheWebTool() {
        val own = read("""{"lights": [{"type": "sun", "intensity": 2, "direction": [0, -1, -1]}, {"type": "point", "intensity": 5, "position": [1, 2, 3]}, {"type": "sun"}, {"type": "ambient", "intensity": 0.2}]}""")
        val plans = SceneLook.planLights(own)
        assertEquals(listOf("sun" to true, "point" to false, "sun" to false, "ambient" to false), plans.map { it.kind to it.castsShadow })
        assertEquals(30.0, plans[1].range!!, 1e-12) // 10 + 4 × 5
        assertNull(plans[0].range)

        val day = SceneLook.planLights(read("""{"environment": {"preset": "day"}, "lights": []}"""))
        assertEquals(1, day.size)
        assertEquals("#fff4e0", day[0].color)
        assertEquals(3.0, day[0].intensity, 0.0)
        assertTrue(day[0].castsShadow)
        assertTrue(SceneLook.planLights(read("""{"environment": {"preset": "none"}, "lights": []}""")).isEmpty())
    }

    @Test
    fun ambientFillAddsTheScenesOwnAmbientLights() {
        val fill = SceneLook.ambientFill(read("""{"environment": {"preset": "day", "intensity": 2}, "lights": [{"type": "ambient", "intensity": 0.2}, {"type": "sun"}]}"""))
        assertEquals(0.6 * 2 + 0.2, fill.intensity, 1e-12)
        assertEquals("#cfe6f7", fill.skyColor)
        assertEquals("#7a8a6a", fill.groundColor)
    }
}
