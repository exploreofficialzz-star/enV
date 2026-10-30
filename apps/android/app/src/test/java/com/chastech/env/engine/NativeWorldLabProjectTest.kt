package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test

class NativeWorldLabProjectTest {
    private fun fixture(): String =
        requireNotNull(javaClass.classLoader?.getResourceAsStream("world-lab-project-v1.json"))
            .bufferedReader().use { it.readText() }

    @Test fun parsesSharedFixtureWithPhysicalUnits() {
        val project=NativeWorldLabProjectCodec.decode(fixture())
        assertEquals(2,project.entities.size)
        assertEquals(1,project.materials.size)
        assertEquals(24.0,project.entities[0].volumeMetersCubed(),1e-10)
        assertEquals(7200.0,project.entities[0].volumeMetersCubed() *
            requireNotNull(project.materials[0].densityKgM3),1e-10)
        assertEquals(null,project.entities[1].materialId)
    }
    @Test fun rejectsUntrustedAttributesAndInvalidGeometry() {
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabProjectCodec.decode(fixture().replace(
                "\"schemaVersion\": 1","\"schemaVersion\": 2"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabProjectCodec.decode(fixture().replace(
                "\"dimensionsMeters\": [\\n        1,\\n        1,\\n        1\\n      ]",
                "\"dimensionsMeters\": [2,1,1]"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabProjectCodec.decode(fixture().replace(
                "\"materialId\": \"mat-1\"", "\"materialId\": \"missing\""))
        }
    }
}
