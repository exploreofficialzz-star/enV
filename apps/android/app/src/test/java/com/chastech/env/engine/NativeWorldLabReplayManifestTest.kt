package com.chastech.env.engine

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeWorldLabReplayManifestTest {
    private val times=listOf(0.0,0.1,0.2,0.3,0.4)

    @Test fun springManifestRebuildsIdenticalSolverSamples(){
        val input=NativeLabInput.Spring(massKg=2.0,springNPerM=8.0,dampingNsPerM=0.5,x0=0.25,v0=-0.1)
        val manifest=NativeWorldLabReplayCodec.create(input,"2026-11-01T00:00:00Z","Africa/Lagos",times)
        val encoded=NativeWorldLabReplayCodec.encode(manifest)
        val replay=NativeWorldLabReplayCodec.decodeAndReplay(encoded)
        assertEquals(manifest,replay.manifest)
        assertEquals(input,replay.input)
        val expected=times.map{NativeWorldLabScience.evaluate(input,it)}
        assertEquals(expected.size,replay.samples.size)
        expected.zip(replay.samples).forEach{(a,b)->
            assertEquals(a.timeSeconds,b.timeSeconds,0.0)
            assertEquals(a.xMeters!!,b.xMeters!!,0.0)
            assertEquals(a.velocityMPerS!!,b.velocityMPerS!!,0.0)
            assertEquals(a.mechanicalEnergyJ!!,b.mechanicalEnergyJ!!,0.0)
        }
    }

    @Test fun rcAndHeatManifestsReplayTheirActualModelEvaluators(){
        val inputs=listOf<NativeLabInput>(
            NativeLabInput.RC(resistanceOhm=2200.0,capacitanceF=0.002,supplyV=5.0,initialV=0.4),
            NativeLabInput.Heat(diffusivityM2S=0.015,lengthM=1.5,backgroundK=290.0,centerK=360.0)
        )
        inputs.forEach{input->
            val manifest=NativeWorldLabReplayCodec.create(input,"2026-11-01T00:00:00Z","UTC",times)
            val replay=NativeWorldLabReplayCodec.decodeAndReplay(NativeWorldLabReplayCodec.encode(manifest))
            assertEquals(input,replay.input)
            assertEquals(times,replay.samples.map{it.timeSeconds})
        }
    }

    @Test fun deterministicFingerprintChangesWhenAnyInputOrSampleChanges(){
        val input=NativeLabInput.Spring()
        val first=NativeWorldLabReplayCodec.create(input,"2026-11-01T00:00:00Z","UTC",times)
        val changedInput=NativeWorldLabReplayCodec.create(input.copy(massKg=2.0),
            "2026-11-01T00:00:00Z","UTC",times)
        val changedSamples=NativeWorldLabReplayCodec.create(input,
            "2026-11-01T00:00:00Z","UTC",times+0.5)
        val changedZone=NativeWorldLabReplayCodec.create(input,
            "2026-11-01T00:00:00Z","Africa/Lagos",times)
        assertNotEquals(first.inputFingerprint,changedInput.inputFingerprint)
        assertNotEquals(first.inputFingerprint,changedSamples.inputFingerprint)
        assertNotEquals(first.inputFingerprint,changedZone.inputFingerprint)
    }

    @Test fun tamperingWithInputSamplesOrReplayPolicyIsRejected(){
        val manifest=NativeWorldLabReplayCodec.create(NativeLabInput.Spring(),
            "2026-11-01T00:00:00Z","UTC",times)
        val json=JSONObject(String(NativeWorldLabReplayCodec.encode(manifest),Charsets.UTF_8))
        json.getJSONObject("parameters").put("massKg",3.0)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabReplayCodec.decodeAndReplay(json.toString().toByteArray())
        }
        val unknown=JSONObject(String(NativeWorldLabReplayCodec.encode(manifest),Charsets.UTF_8))
            .put("arbitrarySolverState","must-not-be-trusted")
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabReplayCodec.decodeAndReplay(unknown.toString().toByteArray())
        }
        val fakeEvents=JSONObject(String(NativeWorldLabReplayCodec.encode(manifest),Charsets.UTF_8))
            .put("mandatoryEventTimesSeconds",org.json.JSONArray(listOf(0.2)))
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabReplayCodec.decodeAndReplay(fakeEvents.toString().toByteArray())
        }
    }

    @Test fun unsupportedModelsTimeAxesAndOversizedManifestsFailClosed(){
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabReplayCodec.create(NativeLabInput.Spring(),"not-utc","UTC",times)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabReplayCodec.create(NativeLabInput.Spring(),"2026-11-01T00:00:00Z","UTC",
                listOf(0.0,0.2,0.1))
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabReplayCodec.decodeAndReplay(ByteArray(NativeWorldLabReplayCodec.MAX_BYTES+1))
        }
    }
}

    @Test fun portableReplayFingerprintMatchesWebAndSwiftGoldenFixture(){
        val input=NativeLabInput.Spring(2.0,8.0,0.5,0.25,-0.1)
        val manifest=NativeWorldLabReplayCodec.create(input,"2026-11-01T00:00:00.000Z","UTC",
            listOf(0.0,0.1,0.2,0.3,0.4))
        assertEquals("627da37ad5c8bfe2",manifest.inputFingerprint)
    }
