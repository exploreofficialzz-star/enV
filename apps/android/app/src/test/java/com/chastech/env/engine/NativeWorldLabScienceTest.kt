package com.chastech.env.engine
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.*

class NativeWorldLabScienceTest {
    @Test fun undampedSpringAgreesWithIndependentAnalyticSolution() {
        val input=NativeLabInput.Spring(massKg=1.0,springNPerM=4.0,
            dampingNsPerM=0.0,x0=1.0)
        val observed=NativeWorldLabScience.evaluate(input,1.0)
        assertEquals(cos(2.0),observed.xMeters!!,1e-9)
        assertEquals(2.0,observed.mechanicalEnergyJ!!,1e-8)
        assertEquals("1.0.0",observed.modelVersion)
    }
    @Test fun idealRcAgreesWithClosedForm() {
        val one=NativeWorldLabScience.evaluate(NativeLabInput.RC(),1.0)
        assertEquals(10.0*(1-exp(-1.0)),one.voltageV!!,1e-12)
    }
    @Test fun isolatedHeatConservesMeanAndReducesMaximum() {
        val zero=NativeWorldLabScience.evaluate(NativeLabInput.Heat(),0.0)
        val two=NativeWorldLabScience.evaluate(NativeLabInput.Heat(),2.0)
        assertEquals((373.15+20*293.15)/21.0,zero.meanTemperatureK!!,1e-10)
        assertEquals(zero.meanTemperatureK!!,two.meanTemperatureK!!,1e-8)
        assertTrue(two.peakTemperatureK!!<zero.peakTemperatureK!!)
        assertEquals(21,two.temperatureK!!.size)
    }
    @Test fun refusesPhysicallyInvalidAndStiffModels() {
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabScience.evaluate(NativeLabInput.RC(resistanceOhm=0.0),1.0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabScience.evaluate(NativeLabInput.Heat(
                diffusivityM2S=100.0,lengthM=0.1),12.0)
        }
    }
}
