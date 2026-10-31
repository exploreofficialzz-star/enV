package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test

class NativeWorldLabProjectTest {
    @Test fun nativeDigitalTruthTableCanBeEditedWithoutExecutingUntrustedCode(){
        val blank=NativeWorldLabEditor.startDigitalInvention(NativeWorldLabEditor.blank())
        val initial=NativeWorldLabProjectCodec.decode(blank).digitalNetworks.first()
        assertEquals(1,NativeWorldLabDigitalLogic.evaluate(initial)["output_q"])
        val switched=NativeWorldLabEditor.digitalSwitch(
            NativeWorldLabEditor.digitalSwitch(blank,initial.id,"input_a",true),
            initial.id,"input_b",true)
        val parsed=NativeWorldLabProjectCodec.decode(switched).digitalNetworks.first()
        assertEquals(0,NativeWorldLabDigitalLogic.evaluate(parsed)["output_q"])
        val invented=NativeWorldLabEditor.digitalTruthBit(switched,initial.id,"invented_gate",3,1)
        assertEquals(1,NativeWorldLabDigitalLogic.evaluate(
            NativeWorldLabProjectCodec.decode(invented).digitalNetworks.first())["output_q"])
        val corrupt=org.json.JSONObject(switched)
        corrupt.getJSONArray("digitalNetworks").getJSONObject(0)
            .getJSONArray("gates").getJSONObject(0)
            .put("inputNodeIds",org.json.JSONArray(listOf("invented_gate","input_b")))
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabProjectCodec.decode(corrupt.toString())
        }
    }

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
    @Test fun nativeDcGraphSolverRespectsPowerAndRejectsUnknownParts() {
        val root=NativeWorldLabEditor.addStarterCircuit(NativeWorldLabEditor.blank())
        val parsed=NativeWorldLabProjectCodec.decode(root)
        val circuit=parsed.networks.first()
        val run=NativeWorldLabDc.solve(circuit,parsed)
        assertEquals(9.0,run.nodeVoltagesV["supply"]!!,1e-12)
        assertEquals(0.09,run.branchCurrentsA["load"]!!,1e-12)
        assertEquals(-0.09,run.branchCurrentsA["source"]!!,1e-12)
        assertEquals(0.0,run.powerResidualW,1e-10)
        val extended=NativeWorldLabProjectCodec.decode(
            NativeWorldLabEditor.addParallelCircuitResistor(root))
        val next=NativeWorldLabDc.solve(extended.networks.first(),extended)
        assertEquals(0.135,next.resistorHeatW/9.0,1e-12)
    }
    @Test fun nativeHydrostaticsRespectsArchimedesAndUnknownInventions(){
        val project=NativeWorldLabEditor.addHypotheticalMaterial(
            NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),"box",id="float"),
            name="Assumed foam",densityKgM3=500.0,id="foam")
        val linked=NativeWorldLabEditor.assignMaterial(project,"float","foam")
        val parsed=NativeWorldLabProjectCodec.decode(linked)
        val result=NativeWorldLabHydrostatics.evaluate(parsed,"float",1000.0,0.5)
        assertEquals(0.5,result.displacedVolumeM3,1e-12)
        assertEquals(0.5,result.equilibriumDraftM!!,1e-10)
        assertEquals(0.0,result.netUpwardForceN!!,1e-9)
        assertEquals("floating",result.status)
        val unknown=NativeWorldLabProjectCodec.decode(
            NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),"sphere",id="unknown"))
        val r=NativeWorldLabHydrostatics.evaluate(unknown,"unknown",1000.0,0.5)
        assertEquals("unknown-mass",r.status)
        assertNull(r.netUpwardForceN)
        assertNull(r.equilibriumDraftM)
    }
    @Test fun inventedElectricalDeviceRequiresExplicitFiniteOhmicAssumption(){
        val blank=NativeWorldLabEditor.addStarterCircuit(NativeWorldLabEditor.blank())
        val unknown=NativeWorldLabEditor.inventOhmicDevice(blank,
            "Imagined conductor","Behavior undetermined")
        val p1=NativeWorldLabProjectCodec.decode(unknown)
        assertThrows(IllegalStateException::class.java){
            NativeWorldLabDc.solve(p1.networks.first(),p1)
        }
        val source=NativeWorldLabEditor.inventOhmicDevice(blank,
            "Invented filament","Assume Ohmic behavior at 20 Ω",20.0)
        val p2=NativeWorldLabProjectCodec.decode(source)
        val result=NativeWorldLabDc.solve(p2.networks.first(),p2)
        val invented=p2.networks.first().components.first{it.kind=="hypothetical-device"}
        assertEquals(20.0,invented.assumedResistanceOhm!!,0.0)
        assertEquals(0.45,result.branchCurrentsA[invented.id]!!,1e-10)
        assertEquals(0.0,result.powerResidualW,1e-8)
    }
    @Test fun nativeBuoyantDynamicsChangesSubmergenceOverTime(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="float")
        json=NativeWorldLabEditor.addHypotheticalMaterial(
            json,"Assumed buoyant matter",500.0,id="foam")
        json=NativeWorldLabEditor.assignMaterial(json,"float","foam")
        val project=NativeWorldLabProjectCodec.decode(json)
        val input=NativeLabFluidMotionInput(
            1000.0,1.0,0.0,200.0,durationSeconds=3.0)
        val run=NativeWorldLabFluidMotion.evaluate(project,"float",input)
        assertTrue(run.samples.size>500)
        assertEquals(1.0,run.samples.first().displacedVolumeM3,1e-12)
        assertTrue(run.samples[150].bottomHeightM>0)
        assertTrue(run.samples[150].immersionDepthM<1)
        assertTrue(run.samples.all{it.energyResidualJ.isFinite()})
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabFluidMotion.evaluate(project,"float",
                input.copy(linearDragNsPerM=Double.NaN))
        }
    }
    @Test fun portableVisualAssembliesStayValidAndCannotLoseMembers(){
        val root=org.json.JSONObject(NativeWorldLabEditor.addSolid(
            NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),"box",id="a"),"box",id="b"))
        root.put("assemblies",org.json.JSONArray().put(org.json.JSONObject()
            .put("id","group").put("name","Visual machine")
            .put("entityIds",org.json.JSONArray().put("a").put("b"))))
        assertEquals(1,NativeWorldLabProjectCodec.decode(root.toString()).assemblies.size)
        root.getJSONArray("assemblies").getJSONObject(0)
            .getJSONArray("entityIds").put("missing")
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabProjectCodec.decode(root.toString())
        }
    }
    @Test fun nativeHypotheticalReactionCouplesTemperatureAndConservesHeat(){
        val input=NativeChemicalThermalInput(
            preExponentialPerS=0.5,activationEnergyJPerMol=0.0,
            reactionHeatReleasedJPerMol=50000.0,
            coolingConductanceWPerK=0.0,durationSeconds=4.0)
        val run=NativeWorldLabChemicalThermal.evaluate(input)
        assertTrue(run.samples.last().productFormedMol>0.5)
        assertTrue(run.samples.last().temperatureK>input.initialTemperatureK)
        assertTrue(kotlin.math.abs(run.samples.last().energyResidualJ)<1e-4)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabChemicalThermal.evaluate(input.copy(
                heatCapacityJPerK=0.0))
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
