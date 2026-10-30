package com.chastech.env.engine
import org.junit.Test
import org.junit.Assert.*

class NativeWorldLabEditorTest {
    private fun fixture():String =
        requireNotNull(javaClass.classLoader?.getResourceAsStream("world-lab-project-v1.json"))
            .bufferedReader().use{it.readText()}

    @Test fun createsAndEditsInteroperableStrictV1Project(){
        var json=NativeWorldLabEditor.blank()
        val initial=NativeWorldLabProjectCodec.decode(json)
        assertEquals(0,initial.entities.size)
        assertEquals("env-world-lab",org.json.JSONObject(json).getString("format"))
        json=NativeWorldLabEditor.addSolid(json,"sphere",id="sphere-created")
        assertEquals("sphere",NativeWorldLabProjectCodec.decode(json).entities.single().shape)
        json=NativeWorldLabEditor.addHypotheticalMaterial(json,"New hypothetical alloy",440.0,id="my-material")
        json=NativeWorldLabEditor.assignMaterial(json,"sphere-created","my-material")
        json=NativeWorldLabEditor.renameSolid(json,"sphere-created","My sphere")
        json=NativeWorldLabEditor.resizeSolid(json,"sphere-created",listOf(2.0,2.0,2.0))
        val result=NativeWorldLabProjectCodec.decode(json)
        assertEquals("My sphere",result.entities[0].name)
        assertEquals("my-material",result.entities[0].materialId)
        assertEquals(5,result.revision)
        assertEquals(440.0,result.materials[0].densityKgM3!!,0.0)
        assertTrue(result.entities[0].volumeMetersCubed()>4.0)
    }
    @Test fun rejectsWrongShapeBadDimensionsDanglingMaterialsAndUntrustedNames(){
        val initial=fixture()
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.addSolid(initial,"mesh",id="x")
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.resizeSolid(initial,"sphere-1",listOf(2.0,1.0,2.0))
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.assignMaterial(initial,"cube-1","missing")
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.addHypotheticalMaterial(initial,"Other",Double.NaN)
        }
    }
}
