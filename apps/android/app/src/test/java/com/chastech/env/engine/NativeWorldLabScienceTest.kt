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

    @Test fun nativeDropMatchesAnalyticalVacuumFreeFall() {
        val input=NativeDropInput(massKg=2.0,supportingHalfHeightM=0.5,
            dropHeightM=50.0,airDensityKgM3=0.0,restitution=0.0,projectedAreaM2=1.0)
        val run=NativeWorldLabDropScience.evaluate(input)
        val atOne=run.samples[240]
        assertEquals(50.0-9.80665/2.0,atOne.heightAboveGroundM,0.03)
        assertEquals(-9.80665,atOne.velocityMps,1e-8)
        assertEquals("hypothetical-user-assumed",run.inputEvidence)
    }
    @Test fun nativeDropClampsContactAndSettlesWithoutPhantomImpacts() {
        val run=NativeWorldLabDropScience.evaluate(NativeDropInput(
            massKg=2.0,supportingHalfHeightM=0.5,dropHeightM=1.0,
            airDensityKgM3=0.0,restitution=0.0,projectedAreaM2=1.0))
        assertTrue(run.samples.all { it.heightAboveGroundM>=0.0 && it.kineticEnergyJ.isFinite() })
        assertEquals(1,run.impactCount)
        assertTrue(run.samples.last().grounded)
    }
    @Test fun nativeDropRejectsInvalidInputs() {
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabDropScience.evaluate(NativeDropInput(
                massKg=Double.NaN,supportingHalfHeightM=0.5,projectedAreaM2=1.0))
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabDropScience.evaluate(NativeDropInput(
                massKg=1.0,supportingHalfHeightM=0.5,projectedAreaM2=1.0,restitution=1.1))
        }
    }

    @Test fun nativeActuatorCouplesCurrentForceAndMotion() {
        val input=NativeActuatorInput(massKg=1.0)
        val run=NativeWorldLabActuator.evaluate(input)
        assertEquals("hypothetical-user-assumed",run.inputEvidence)
        assertTrue(run.samples[240].currentA>0)
        assertTrue(run.samples[480].heightM>0)
        assertTrue(run.samples[480].backEmfV>0)
        assertTrue(run.samples.any{it.resistiveHeatW>0 && it.motorForceN>0})
        assertTrue(run.samples.all{it.heightM>=0 && it.energyResidualJ.isFinite()})
    }
    @Test fun noVoltageDoesNotCreateFictitiousLift() {
        val run=NativeWorldLabActuator.evaluate(NativeActuatorInput(massKg=1.0,supplyVoltageV=0.0))
        assertTrue(run.samples.all{it.heightM==0.0 && it.currentA==0.0})
    }
    @Test fun invalidCoilAndMassAreRejected() {
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabActuator.evaluate(NativeActuatorInput(massKg=Double.NaN))
        }
        assertThrows(IllegalArgumentException::class.java) {
            NativeWorldLabActuator.evaluate(NativeActuatorInput(massKg=1.0,inductanceH=0.0))
        }
    }
}
