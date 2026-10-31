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

    @Test fun inventedDigitalLogicCanSwitchRealCalculatedMotorMotion(){
        var json=NativeWorldLabEditor.blank()
        json=NativeWorldLabEditor.addSolid(json,"box",id="solid")
        json=NativeWorldLabEditor.startDigitalInvention(json,id="logic")
        val original=NativeWorldLabProjectCodec.decode(json)
        val powered=NativeWorldLabDigitalMotor.evaluate(
            original,"logic","output_q","solid",1.0)
        assertEquals(1,powered.logicBit)
        assertEquals(24.0,powered.input.supplyVoltageV,0.0)
        assertTrue(powered.motor.samples.any{it.heightM>0.0 && it.currentA>0.0})
        json=NativeWorldLabEditor.digitalSwitch(json,"logic","input_a",true)
        json=NativeWorldLabEditor.digitalSwitch(json,"logic","input_b",true)
        val changed=NativeWorldLabProjectCodec.decode(json)
        val off=NativeWorldLabDigitalMotor.evaluate(
            changed,"logic","output_q","solid",1.0)
        assertEquals(0,off.logicBit)
        assertEquals(0.0,off.input.supplyVoltageV,0.0)
        assertTrue(off.motor.samples.all{it.currentA==0.0&&it.heightM==0.0})
        assertEquals(changed.revision,off.projectRevision)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabDigitalMotor.evaluate(
                changed,"logic","output_q","solid",1.0,Double.NaN)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabDigitalMotor.evaluate(
                changed,"logic","missing","solid",1.0)
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
    @Test fun nativeActuatorAuditChecksConservationAndRefinement() {
        val zero=NativeActuatorInput(massKg=1.0,supplyVoltageV=0.0)
        val run=NativeWorldLabActuator.evaluate(zero)
        val audit=NativeWorldLabActuator.numericalAudit(zero,run)
        assertEquals("within-internal-tolerance",audit.status)
        assertEquals(0.0,audit.maximumEnergyResidualFraction,0.0)
        assertEquals(0.0,audit.maximumRelativeStateDifference!!,0.0)

        val powered=NativeActuatorInput(massKg=1.0)
        val first=NativeWorldLabActuator.numericalAudit(powered,
            NativeWorldLabActuator.evaluate(powered))
        val second=NativeWorldLabActuator.numericalAudit(powered,
            NativeWorldLabActuator.evaluate(powered))
        assertEquals(first,second)
        assertTrue(first.maximumEnergyResidualFraction.isFinite())
        assertNotEquals("unavailable",first.status)
    }
    @Test fun thermalCoilFeedsBackAndRecordsHeatAsStoredEnergy() {
        val original=NativeActuatorInput(massKg=1.0)
        val hot=original.copy(thermal=NativeActuatorThermal())
        val base=NativeWorldLabActuator.evaluate(original)
        val result=NativeWorldLabActuator.evaluate(hot)
        assertEquals("1.1.0",result.modelVersion)
        assertTrue(result.samples.last().coilTemperatureK!!>293.15)
        assertTrue(result.samples.last().coilResistanceOhm!!>2.0)
        assertTrue(result.samples.last().thermalEnergyJ>0)
        assertNotEquals(base.samples.last().currentA,result.samples.last().currentA)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabActuator.evaluate(hot.copy(thermal=NativeActuatorThermal(heatCapacityJPerK=0.0)))
        }
    }
    @Test fun idealGraphSourceCurrentIncludesTheLiveMotorBranch() {
        val json=NativeWorldLabEditor.addSolid(
            NativeWorldLabEditor.addStarterCircuit(NativeWorldLabEditor.blank()),
            "box",id="lift")
        val project=NativeWorldLabProjectCodec.decode(json)
        val coupled=NativeWorldLabNetworkMotor.evaluate(
            project,project.networks.first(),"lift",1.0,true)
        val point=coupled.samples[240]
        assertTrue(point.totalSourceCurrentA<
            coupled.dc.branchCurrentsA["source"]!!)
        assertEquals(point.totalSourcePowerW,
            9.0*coupled.motor.samples[240].currentA+point.passiveResistorHeatW,1e-8)
        assertTrue(coupled.samples.all{it.combinedEnergyResidualJ.isFinite()})
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
    @Test fun uncoupledActuatorMatchesAnalyticRlCircuit() {
        val input=NativeActuatorInput(massKg=1.0,gravityMps2=0.0,forceConstantNPerA=0.0)
        val run=NativeWorldLabActuator.evaluate(input)
        val atOne=run.samples.first{it.timeSeconds>=1.0-1e-10}
        val reference=input.supplyVoltageV/input.resistanceOhm*
            (1-exp(-input.resistanceOhm/input.inductanceH))
        assertEquals(reference,atOne.currentA,1e-7)
        assertEquals(0.0,atOne.heightM,0.0)
    }
}
