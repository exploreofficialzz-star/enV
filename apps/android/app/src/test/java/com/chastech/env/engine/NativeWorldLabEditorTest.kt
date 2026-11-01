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
    @Test fun groupingMovesOnlyMemberSolidsAndUngroupsWithoutDeleting(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="a")
        json=NativeWorldLabEditor.addSolid(json,"box",id="b")
        json=NativeWorldLabEditor.addSolid(json,"sphere",id="c")
        json=NativeWorldLabEditor.createVisualAssembly(
            json,"Assembly",listOf("a","b"),id="pair")
        val start=NativeWorldLabProjectCodec.decode(json)
        json=NativeWorldLabEditor.moveVisualAssembly(json,"pair",listOf(1.0,0.0,-2.0))
        val moved=NativeWorldLabProjectCodec.decode(json)
        assertEquals(start.entities[0].positionMeters.x+1.0,moved.entities[0].positionMeters.x,1e-12)
        assertEquals(start.entities[1].positionMeters.z-2.0,moved.entities[1].positionMeters.z,1e-12)
        assertEquals(start.entities[2],moved.entities[2])
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.createVisualAssembly(json,"Overlapping",listOf("a","c"))
        }
        json=NativeWorldLabEditor.ungroupVisualAssembly(json,"pair")
        assertEquals(3,NativeWorldLabProjectCodec.decode(json).entities.size)
        assertTrue(NativeWorldLabProjectCodec.decode(json).assemblies.isEmpty())
    }
    @Test fun digitalOutputsRewireToActualCombinationalNodesOnly(){
        var json=NativeWorldLabEditor.startDigitalInvention(
            NativeWorldLabEditor.blank(),id="invented")
        json=NativeWorldLabEditor.digitalOutputSource(
            json,"invented","output_q","input_a")
        json=NativeWorldLabEditor.digitalSwitch(json,"invented","input_a",true)
        val project=NativeWorldLabProjectCodec.decode(json)
        assertEquals("input_a",project.digitalNetworks[0].outputs[0].sourceNodeId)
        assertEquals(1,NativeWorldLabDigitalLogic.evaluate(
            project.digitalNetworks[0])["output_q"])
        json=NativeWorldLabEditor.addDigitalGate(
            json,"invented","My next device","Assumed one-input inverter",
            listOf("invented_gate"),id="next-gate")
        json=NativeWorldLabEditor.digitalTruthBit(json,"invented","next-gate",1,1)
        json=NativeWorldLabEditor.digitalOutputSource(
            json,"invented","output_q","next-gate")
        assertEquals(2,NativeWorldLabProjectCodec.decode(json).digitalNetworks[0].gates.size)
        assertEquals(1,NativeWorldLabDigitalLogic.evaluate(
            NativeWorldLabProjectCodec.decode(json).digitalNetworks[0])["output_q"])
        json=NativeWorldLabEditor.addDigitalGate(
            json,"invented","Invented two-input part","Assumed OR",
            listOf("input_a","input_b"),id="two-input")
        json=NativeWorldLabEditor.digitalTruthBit(json,"invented","two-input",1,1)
        json=NativeWorldLabEditor.digitalTruthBit(json,"invented","two-input",2,1)
        json=NativeWorldLabEditor.digitalTruthBit(json,"invented","two-input",3,1)
        json=NativeWorldLabEditor.digitalOutputSource(
            json,"invented","output_q","two-input")
        assertEquals(1,NativeWorldLabDigitalLogic.evaluate(
            NativeWorldLabProjectCodec.decode(json).digitalNetworks[0])["output_q"])
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.addDigitalGate(
                json,"invented","Broken","Assumed",listOf("missing"))
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.digitalOutputSource(
                json,"invented","output_q","does-not-exist")
        }
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
    @Test fun revisedInventedMaterialChangesAssumptionsWithoutChangingSolidReference(){
        var json=NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),"box",id="solid")
        json=NativeWorldLabEditor.addHypotheticalMaterial(
            json,"Invented material",null,null,id="invented")
        json=NativeWorldLabEditor.assignMaterial(json,"solid","invented")
        val old=NativeWorldLabProjectCodec.decode(json)
        val next=NativeWorldLabEditor.reviseHypotheticalMaterial(
            json,"invented","Revised hypothesis",45.0,2e11)
        val new=NativeWorldLabProjectCodec.decode(next)
        assertEquals(old.revision+1,new.revision)
        assertEquals(old.entities.first().materialId,new.entities.first().materialId)
        assertEquals("invented",new.materials.first().id)
        assertEquals("hypothetical-user-assumed",new.materials.first().evidence)
        assertEquals(2e11,new.materials.first().youngModulusPa!!,0.0)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.reviseHypotheticalMaterial(
                next,"invented","Invalid",Double.NaN,2e11)
        }
        assertThrows(IllegalStateException::class.java){
            NativeWorldLabEditor.reviseHypotheticalMaterial(
                next,"not-real","Unknown",1.0,2e11)
        }
    }


    @Test fun rotationScaleDuplicatePatternAndSavedCameraStayInPortableProject(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="cad-box")
        json=NativeWorldLabEditor.rotateSolid(json,"cad-box",2,45.0)
        var p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(kotlin.math.PI/4,p.entities.single().rotationRadians.z,1e-12)
        json=NativeWorldLabEditor.scaleSolid(json,"cad-box",listOf(2.0,1.0,1.0))
        assertEquals(2.0,NativeWorldLabProjectCodec.decode(json).entities.single().dimensionsMeters.x,1e-12)
        json=NativeWorldLabEditor.duplicateSolid(json,"cad-box",listOf(2.0,0.0,0.0),newId="copy")
        assertEquals(2,NativeWorldLabProjectCodec.decode(json).entities.size)
        json=NativeWorldLabEditor.linearPattern(json,"copy",0,3.0,2)
        p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(4,p.entities.size)
        assertEquals(8.0,p.entities.last().positionMeters.x,1e-12)
        json=NativeWorldLabEditor.saveCameraViewpoint(json,listOf(10.0,8.0,-10.0),listOf(1.0,2.0,3.0))
        p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(10.0,p.cameraPositionMeters.x,0.0)
        assertEquals(3.0,p.cameraLookingAtMeters.z,0.0)
    }
    @Test fun nativeSketchExtrusionsCreatePortableBoxAndCylinderProfiles(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.extrudeRectangle(json,2.0,3.0,4.0,id="rect")
        json=NativeWorldLabEditor.extrudeCircle(json,0.5,2.0,id="circle")
        val p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(listOf("box","cylinder"),p.entities.map{it.shape})
        assertEquals(4.0,p.entities[0].dimensionsMeters.y,0.0)
        assertEquals(1.0,p.entities[1].dimensionsMeters.x,0.0)
        assertEquals(1.0,p.entities[1].dimensionsMeters.z,0.0)
        assertEquals(2.0,p.entities[0].positionMeters.y,0.0)
    }
    @Test fun invalidSketchProfilesAreRejected(){
        val json=NativeWorldLabEditor.blank()
        assertThrows(IllegalArgumentException::class.java){NativeWorldLabEditor.extrudeRectangle(json,0.0,1.0,1.0)}
        assertThrows(IllegalArgumentException::class.java){NativeWorldLabEditor.extrudeCircle(json,0.0,1.0)}
    }
    @Test fun nativeCadOperationsRejectInvalidRotationPatternAndScale(){
        val json=NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),"sphere",id="s")
        assertThrows(IllegalArgumentException::class.java){NativeWorldLabEditor.rotateSolid(json,"s",5,15.0)}
        assertThrows(IllegalArgumentException::class.java){NativeWorldLabEditor.rotateSolid(json,"s",0,Double.NaN)}
        assertThrows(IllegalArgumentException::class.java){NativeWorldLabEditor.scaleSolid(json,"s",listOf(-1.0,1.0,1.0))}
        assertThrows(IllegalArgumentException::class.java){NativeWorldLabEditor.linearPattern(json,"s",0,0.0,2)}
    }

    @Test fun savesAndClearsWgs84ReferenceWithoutBreakingOldWorldProjects(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.setGeodeticOrigin(json,NativeGeodetic(51.5074,-0.1278,35.0))
        val p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(51.5074,p.geodeticOrigin!!.latitudeDegrees,0.0)
        assertEquals(-0.1278,p.geodeticOrigin!!.longitudeDegrees,0.0)
        json=NativeWorldLabEditor.setGeodeticOrigin(json,null)
        assertNull(NativeWorldLabProjectCodec.decode(json).geodeticOrigin)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.setGeodeticOrigin(json,NativeGeodetic(91.0,0.0,0.0))
        }
    }

    @Test fun mirrorAndCircularPatternPreserveGeometryAndPortableIdentity(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="base")
        json=NativeWorldLabEditor.mirrorSolid(json,"base",0,1.0)
        var p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(2.0,p.entities.single().positionMeters.x,0.0)
        json=NativeWorldLabEditor.circularPattern(json,"base",2,listOf(0.0,0.5,0.0),4)
        p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(4,p.entities.size)
        p.entities.drop(1).forEach{e->
            assertEquals(2.0,kotlin.math.hypot(e.positionMeters.x,e.positionMeters.y-0.5),1e-9)
        }
    }


    @Test fun multiSelectionCadTransformsAreAtomicAndPreservePrimitiveConstraints(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="a")
        json=NativeWorldLabEditor.addSolid(json,"sphere",id="b")
        json=NativeWorldLabEditor.addSolid(json,"cylinder",id="c")
        val before=NativeWorldLabProjectCodec.decode(json).revision
        json=NativeWorldLabEditor.rotateSolids(json,listOf("a","b"),2,45.0)
        var p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(before+1,p.revision)
        assertEquals(kotlin.math.PI/4,p.entities[0].rotationRadians.z,1e-12)
        assertEquals(kotlin.math.PI/4,p.entities[1].rotationRadians.z,1e-12)
        json=NativeWorldLabEditor.scaleSolids(json,listOf("a","b","c"),listOf(2.0,3.0,4.0))
        p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(2.0,p.entities[0].dimensionsMeters.x,1e-12)
        assertEquals(3.0,p.entities[0].dimensionsMeters.y,1e-12)
        assertEquals(p.entities[1].dimensionsMeters.x,p.entities[1].dimensionsMeters.z,0.0)
        assertEquals(p.entities[2].dimensionsMeters.x,p.entities[2].dimensionsMeters.z,0.0)
        json=NativeWorldLabEditor.alignSolids(json,listOf("a","b","c"),0,"min")
        p=NativeWorldLabProjectCodec.decode(json)
        fun halfExtentX(s:NativeLabSolid):Double{
            val angle=s.rotationRadians.z
            return (kotlin.math.abs(kotlin.math.cos(angle))*s.dimensionsMeters.x+
                kotlin.math.abs(kotlin.math.sin(angle))*s.dimensionsMeters.y)/2
        }
        val left=p.entities.map{it.positionMeters.x-halfExtentX(it)}
        assertTrue(left.max()-left.min()<1e-8)
        json=NativeWorldLabEditor.distributeSolids(json,listOf("a","b","c"),0,0.5)
        p=NativeWorldLabProjectCodec.decode(json)
        val sorted=p.entities.sortedBy{it.positionMeters.x}
        for(i in 0..1){
            val gap=sorted[i+1].positionMeters.x-halfExtentX(sorted[i+1])-
                (sorted[i].positionMeters.x+halfExtentX(sorted[i]))
            assertEquals(0.5,gap,1e-8)
        }
        json=NativeWorldLabEditor.duplicateSolids(json,listOf("a","b"),listOf(10.0,0.0,0.0))
        assertEquals(5,NativeWorldLabProjectCodec.decode(json).entities.size)
    }
    @Test fun multiSelectionCadRejectsMissingDuplicateAndOutOfBoundsSelection(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="a")
        json=NativeWorldLabEditor.addSolid(json,"box",id="b")
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.rotateSolids(json,listOf("a","missing"),0,10.0)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.scaleSolids(json,listOf("a","a"),listOf(1.0,1.0,1.0))
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.duplicateSolids(json,listOf("a","b"),listOf(Double.NaN,0.0,0.0))
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.distributeSolids(json,listOf("a","b"),0,1.0)
        }
    }


    @Test fun multiSelectionCadTranslateMirrorAndPatternsPreserveBounds(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="a")
        json=NativeWorldLabEditor.addSolid(json,"sphere",id="b")
        json=NativeWorldLabEditor.addSolid(json,"cylinder",id="c")
        val before=NativeWorldLabProjectCodec.decode(json)
        json=NativeWorldLabEditor.translateSolids(json,listOf("a","b","c"),listOf(1.0,2.0,3.0))
        var p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(before.entities[0].positionMeters.x+1,p.entities[0].positionMeters.x,1e-12)
        assertEquals(before.entities[1].positionMeters.y+2,p.entities[1].positionMeters.y,1e-12)
        json=NativeWorldLabEditor.mirrorSolids(json,listOf("a","b","c"),0,0.0)
        p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(-(before.entities[0].positionMeters.x+1),p.entities[0].positionMeters.x,1e-12)
        json=NativeWorldLabEditor.linearPatternSolids(json,listOf("a","b"),2,2.0,2)
        p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(7,p.entities.size)
        json=NativeWorldLabEditor.circularPatternSolids(json,listOf("a","b"),1,listOf(0.0,0.0,0.0),4)
        p=NativeWorldLabProjectCodec.decode(json)
        assertEquals(13,p.entities.size)
        assertTrue(p.entities.all{it.positionMeters.x.isFinite()&&it.positionMeters.z.isFinite()})
    }
    @Test fun multiSelectionPatternsRejectBoundsAndInvalidInputs(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="a")
        json=NativeWorldLabEditor.addSolid(json,"box",id="b")
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.translateSolids(json,listOf("a","b"),listOf(Double.NaN,0.0,0.0))
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.mirrorSolids(json,listOf("a","missing"),0,0.0)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.linearPatternSolids(json,listOf("a","b"),0,0.0,2)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.circularPatternSolids(json,listOf("a","b"),0,listOf(0.0,0.0,0.0),1)
        }
    }


    @Test fun groupRotationAndScaleMoveSelectedPartsAroundSharedCentroid(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="a")
        json=NativeWorldLabEditor.addSolid(json,"box",id="b")
        json=NativeWorldLabEditor.addSolid(json,"sphere",id="outside")
        json=NativeWorldLabEditor.positionSolid(json,"a",listOf(-2.0,0.5,0.0))
        json=NativeWorldLabEditor.positionSolid(json,"b",listOf(2.0,0.5,0.0))
        json=NativeWorldLabEditor.positionSolid(json,"outside",listOf(20.0,0.5,0.0))
        val initial=NativeWorldLabProjectCodec.decode(json).revision

        json=NativeWorldLabEditor.rotateGroupAroundCentroid(json,listOf("a","b"),1,90.0)
        var project=NativeWorldLabProjectCodec.decode(json)
        assertEquals(initial+1,project.revision)
        assertEquals(0.0,project.entities[0].positionMeters.x,1e-8)
        assertEquals(2.0,project.entities[0].positionMeters.z,1e-8)
        assertEquals(0.0,project.entities[1].positionMeters.x,1e-8)
        assertEquals(-2.0,project.entities[1].positionMeters.z,1e-8)
        assertEquals(kotlin.math.PI/2,project.entities[0].rotationRadians.y,1e-8)
        assertEquals(20.0,project.entities[2].positionMeters.x,1e-8)

        json=NativeWorldLabEditor.scaleGroupAroundCentroid(json,listOf("a","b"),2.0)
        project=NativeWorldLabProjectCodec.decode(json)
        assertEquals(initial+2,project.revision)
        assertEquals(4.0,project.entities[0].positionMeters.z,1e-8)
        assertEquals(-4.0,project.entities[1].positionMeters.z,1e-8)
        assertEquals(2.0,project.entities[0].dimensionsMeters.x,1e-8)
        assertEquals(2.0,project.entities[1].dimensionsMeters.y,1e-8)
        assertEquals(20.0,project.entities[2].positionMeters.x,1e-8)
        assertEquals(listOf(1.0,1.0,1.0),listOf(
            project.entities[2].dimensionsMeters.x,
            project.entities[2].dimensionsMeters.y,
            project.entities[2].dimensionsMeters.z))
    }

    @Test fun groupCadRejectsMissingMembersAndUnsafeParameters(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="a")
        json=NativeWorldLabEditor.addSolid(json,"box",id="b")
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.rotateGroupAroundCentroid(json,listOf("a","missing"),1,90.0)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.rotateGroupAroundCentroid(json,listOf("a","a"),1,90.0)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.rotateGroupAroundCentroid(json,listOf("a","b"),1,Double.NaN)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabEditor.scaleGroupAroundCentroid(json,listOf("a","b"),0.0)
        }
    }

}
