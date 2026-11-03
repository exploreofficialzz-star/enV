package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs

class NativeWorldLabElasticWaveTest {
    private fun make()=NativeWorldLabElasticWave.evaluateParameters("project",3,"rod","matter",
        1.0,0.06,8000.0,200e9,1,1e-5,4)
    @Test fun exactSpeedFreeEndsAndConservation(){
        val run=make()
        assertEquals(5000.0,run.waveSpeedMps,1e-9)
        assertEquals(2500.0,run.frequencyHz,1e-9)
        val first=run.sample(0.0)
        assertEquals(1e-5,first.displacementsMeters.first(),1e-14)
        assertEquals(-1e-5,first.displacementsMeters.last(),1e-14)
        assertTrue(abs(first.stressesPa.first())<1e-6)
        assertTrue(abs(first.stressesPa.last())<1e-6)
        val quarter=run.sample(run.periodSeconds/4)
        assertEquals(run.totalEnergyJ,quarter.kineticEnergyJ,1e-7)
        assertEquals(0.0,quarter.strainEnergyJ,1e-16)
        assertEquals(first.totalEnergyJ,quarter.totalEnergyJ,1e-7)
        assertEquals("hypothetical-user-assumed",run.inputEvidence)
    }
    @Test fun rejectsInvalidPhysics(){
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabElasticWave.evaluateParameters("p",0,"r","m",
                1.0,0.06,8000.0,200e9,1,0.1,4)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabElasticWave.evaluateParameters("p",0,"r","m",
                1.0,0.06,0.001,1e15,1,1e-5,4)
        }
        assertThrows(IllegalArgumentException::class.java){make().sample(Double.NaN)}
    }
}
