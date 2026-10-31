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
    @Test fun positionGridAndDistancesStayPortable(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="a")
        json=NativeWorldLabEditor.addSolid(json,"box",id="b")
        json=NativeWorldLabEditor.positionSolid(json,"a",listOf(0.24,-0.26,2.49))
        json=NativeWorldLabEditor.snapSolid(json,"a",0.5)
        val snapped=NativeWorldLabProjectCodec.decode(json)
        val a=snapped.entities.first{it.id=="a"}
        assertEquals(0.0,a.positionMeters.x,0.0)
        assertEquals(-0.5,a.positionMeters.y,0.0)
        assertEquals(2.5,a.positionMeters.z,0.0)
        json=NativeWorldLabEditor.positionSolid(json,"b",listOf(3.0,3.5,14.5))
        val current=NativeWorldLabProjectCodec.decode(json)
        val distance=NativeWorldLabEditor.measureCenters(current,"a","b")
        assertEquals(13.0,distance.centerDistanceM,1e-12)
        assertEquals(kotlin.math.hypot(3.0,12.0),distance.horizontalDistanceM,1e-12)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.snapSolid(json,"a",0.0)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.positionSolid(json,"a",listOf(Double.NaN,0.0,0.0))
        }
    }
    @Test fun wiredSeriesNetworkUsesActualNativeJunctionsAndConservesPower(){
        var json=NativeWorldLabEditor.addStarterCircuit(NativeWorldLabEditor.blank())
        json=NativeWorldLabEditor.addCircuitNode(json,"Middle",id="middle")
        json=NativeWorldLabEditor.rewireCircuitPart(json,"load","supply","middle")
        json=NativeWorldLabEditor.addCircuitResistor(
            json,"middle","ground",200.0,id="series-load")
        val p=NativeWorldLabProjectCodec.decode(json)
        val run=NativeWorldLabDc.solve(p.networks.first(),p)
        assertEquals(6.0,run.nodeVoltagesV["middle"]!!,1e-10)
        assertEquals(0.03,run.branchCurrentsA["load"]!!,1e-10)
        assertEquals(0.03,run.branchCurrentsA["series-load"]!!,1e-10)
        assertEquals(0.0,run.powerResidualW,1e-10)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.removeUnusedCircuitNode(json,"middle")
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.rewireCircuitPart(json,"load","middle","middle")
        }
    }
    @Test fun nativeHistoryUndoRedoKeepsRevisionsMonotonic(){
        val history=NativeWorldLabEditHistory()
        val base=NativeWorldLabEditor.blank()
        val edit=NativeWorldLabEditor.addSolid(base,"box",id="object")
        history.record(base,edit)
        assertTrue(history.canUndo)
        val undone=history.undo(edit)!!
        val parsed=NativeWorldLabProjectCodec.decode(undone)
        assertEquals(0,parsed.entities.size)
        assertEquals(2,parsed.revision)
        val restored=history.redo(undone)!!
        assertEquals(1,NativeWorldLabProjectCodec.decode(restored).entities.size)
        assertEquals(3,NativeWorldLabProjectCodec.decode(restored).revision)
        history.clear()
        assertFalse(history.canUndo)
        assertFalse(history.canRedo)
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
