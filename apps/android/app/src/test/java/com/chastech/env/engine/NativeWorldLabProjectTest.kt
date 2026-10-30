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
    @Test fun circuitNetworkRoundTripRejectsUnknownFieldsAndDanglingPorts(){
        val p=org.json.JSONObject(NativeWorldLabEditor.blank())
        val c=org.json.JSONObject()
            .put("id","circuit-1").put("name","First circuit")
            .put("groundNodeId","ground")
            .put("nodes",org.json.JSONArray().put(org.json.JSONObject()
                .put("id","ground").put("label","Ground"))
                .put(org.json.JSONObject().put("id","supply").put("label","Supply")))
            .put("components",org.json.JSONArray()
                .put(org.json.JSONObject().put("id","battery").put("kind","dc-source")
                    .put("positiveNodeId","supply").put("negativeNodeId","ground").put("voltageV",9))
                .put(org.json.JSONObject().put("id","resistor").put("kind","resistor")
                    .put("positiveNodeId","supply").put("negativeNodeId","ground").put("resistanceOhm",100)))
        p.put("networks",org.json.JSONArray().put(c))
        val decoded=NativeWorldLabProjectCodec.decode(p.toString())
        assertEquals(1,decoded.networks.size)
        assertEquals(2,decoded.networks[0].components.size)
        val corrupted=org.json.JSONObject(p.toString())
        corrupted.getJSONArray("networks").getJSONObject(0)
            .getJSONArray("components").getJSONObject(1)
            .put("positiveNodeId","missing")
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabProjectCodec.decode(corrupted.toString())
        }
    }
    @Test fun rejectsUntrustedAttributesAndInvalidGeometry() {
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabProjectCodec.decode(fixture().replace(
                "\"schemaVersion\": 1","\"schemaVersion\": 2"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            val json=org.json.JSONObject(fixture())
            json.getJSONArray("entities").getJSONObject(1)
                .put("dimensionsMeters",org.json.JSONArray(listOf(2,1,1)))
            NativeWorldLabProjectCodec.decode(json.toString())
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabProjectCodec.decode(fixture().replace(
                "\"materialId\": \"mat-1\"", "\"materialId\": \"missing\""))
        }
    }
}
