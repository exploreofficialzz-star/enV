package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs
import kotlin.math.pow

class NativeWorldLabRadiationTest {
    private fun make(start:Double=400.0,ambient:Double=300.0,epsilon:Double=0.8)=
        NativeWorldLabRadiation.evaluateParameters("world",2,"object","matter",
            1000.0,6.0,1000.0,500.0,start,ambient,epsilon,1000.0)
    @Test fun coolingHasExpectedInitialPowerAndConservesEnergy(){
        val result=make()
        val expected=0.8*NativeWorldLabRadiation.SIGMA*6*(400.0.pow(4)-300.0.pow(4))
        assertEquals(expected,result.samples.first().netRadiatedPowerW,1e-8)
        assertTrue(result.samples.last().temperatureK<400)
        assertTrue(result.samples.last().temperatureK>300)
        result.samples.forEach{assertTrue(abs(it.energyResidualJ)<1e-5)}
        assertEquals("hypothetical-user-assumed",result.inputEvidence)
    }
    @Test fun insulationAndHotSurroundings(){
        assertEquals(400.0,make(epsilon=0.0).samples.last().temperatureK,0.0)
        val warmed=make(start=300.0,ambient=700.0)
        assertTrue(warmed.samples.last().temperatureK>300)
        assertTrue(warmed.samples.last().transferredEnergyJ<0)
    }
    @Test fun rejectsUnstableAndNonphysicalInputs(){
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabRadiation.evaluateParameters("p",0,"r","m",
                1e-5,6.0,0.001,0.01,400.0,300.0,0.8,1000.0)
        }
        assertThrows(IllegalArgumentException::class.java){make().sample(Double.NaN)}
        assertThrows(IllegalArgumentException::class.java){make(epsilon=2.0)}
    }
}
