package com.chastech.env.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.util.Base64

class NativeGameProjectTest {
    private fun fixture(): String = requireNotNull(javaClass.classLoader?.getResourceAsStream("game-studio-project-v1.json")).bufferedReader().use { it.readText() }

    @Test fun sharedProjectRoundTripsAssetsAndTransforms() {
        val project = NativeGameProjectCodec.decode(fixture())
        assertEquals(4, project.objects.size)
        assertEquals(2, project.assets.size)
        assertEquals(1.25, project.objects[1].position.x, 0.0)
        assertEquals("artboard-1", project.objects[2].assetId)
        assertEquals(project, NativeGameProjectCodec.decode(NativeGameProjectCodec.encode(project)))
    }

    @Test fun rejectsUnsupportedVersionMissingAssetsAndInvalidScale() {
        val project = NativeGameProjectCodec.decode(fixture())
        assertThrows(IllegalArgumentException::class.java) { NativeGameProjectCodec.validate(project.copy(version = 2)) }
        assertThrows(IllegalArgumentException::class.java) { NativeGameProjectCodec.validate(project.copy(assets = emptyList())) }
        val changed = project.objects.toMutableList(); changed[1] = changed[1].copy(scale = changed[1].scale.copy(x = -1.0))
        assertThrows(IllegalArgumentException::class.java) { NativeGameProjectCodec.validate(project.copy(objects = changed)) }
        val image = project.assets.first()
        val bytes = Base64.getDecoder().decode(image.dataUrl.substringAfter(',')); bytes[30] = (bytes[30].toInt() xor 1).toByte()
        val corrupt = image.copy(dataUrl = "data:image/png;base64," + Base64.getEncoder().encodeToString(bytes))
        assertThrows(IllegalArgumentException::class.java) { NativeGameProjectCodec.validate(project.copy(assets = listOf(corrupt) + project.assets.drop(1))) }
    }
}
