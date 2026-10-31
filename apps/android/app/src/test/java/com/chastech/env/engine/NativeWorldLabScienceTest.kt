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
    @Test fun inventedMaterialModulusProducesAnalyticalBeamDeflectionWithoutInventingStrength() {
        var json=NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),
            "box",id="beam")
        json=NativeWorldLabEditor.resizeSolid(json,"beam",listOf(2.0,0.1,0.05))
        json=NativeWorldLabEditor.addHypotheticalMaterial(
            json,"Invented elastic material",null,2e11,id="invented-matter")
        json=NativeWorldLabEditor.assignMaterial(json,"beam","invented-matter")
        val project=NativeWorldLabProjectCodec.decode(json)
        val r=NativeWorldLabStructural.bending(project,"beam",1000.0)
        assertEquals(0.0032,r.tipDeflectionM,1e-12)
        assertEquals(24e6,r.maximumStressPa,1e-4)
        assertEquals(0.00012,r.surfaceStrain,1e-12)
        assertEquals("hypothetical-user-assumed",r.materialEvidence)
        assertEquals(project.revision,r.projectRevision)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabStructural.bending(project,"beam",1e8)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabStructural.bending(project,"beam",Double.NaN)
        }
        val unknown=NativeWorldLabEditor.addHypotheticalMaterial(json,
            "Unproven matter",null,null,id="unknown-matter")
        val changed=NativeWorldLabEditor.assignMaterial(
            unknown,"beam","unknown-matter")
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabStructural.bending(
                NativeWorldLabProjectCodec.decode(changed),"beam",1000.0)
        }
    }

    @Test fun twoInventedSolidsCollideConservingMomentumAndLosingOnlyAssumedEnergy(){
        var p=NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),"box",id="left")
        p=NativeWorldLabEditor.addSolid(p,"box",id="right")
        p=NativeWorldLabEditor.positionSolid(p,"left",listOf(0.0,0.5,2.0))
        p=NativeWorldLabEditor.positionSolid(p,"right",listOf(3.0,0.5,2.0))
        p=NativeWorldLabEditor.addHypotheticalMaterial(p,"Invented dense foam",2.0,id="matter")
        p=NativeWorldLabEditor.assignMaterial(p,"left","matter")
        p=NativeWorldLabEditor.assignMaterial(p,"right","matter")
        val project=NativeWorldLabProjectCodec.decode(p)
        val elastic=NativeWorldLabCollision.evaluate(project,"right","left",2.0,0.0,1.0)
        assertEquals(1.0,elastic.impactTimeSeconds,1e-12)
        assertEquals(0.0,elastic.leftFinalVelocityMps,1e-12)
        assertEquals(2.0,elastic.rightFinalVelocityMps,1e-12)
        assertEquals(4.0,elastic.impulseNs,1e-12)
        val nativeEvidence=org.json.JSONObject(elastic.toEvidenceJson())
        assertEquals("env-world-lab-object-collision",nativeEvidence.getString("format"))
        assertEquals("hypothetical-user-assumed",nativeEvidence.getString("inputEvidence"))
        assertEquals(project.revision,nativeEvidence.getInt("projectRevision"))
        assertEquals(4.0,nativeEvidence.getDouble("impulseNs"),1e-12)
        assertEquals(0.0,elastic.dissipatedEnergyJ,1e-12)
        assertEquals(1.0,elastic.sample(1.0).rightCenterXM-
            elastic.sample(1.0).leftCenterXM,1e-12)
        val plastic=NativeWorldLabCollision.evaluate(project,"left","right",2.0,0.0,0.0)
        assertEquals(1.0,plastic.leftFinalVelocityMps,1e-12)
        assertEquals(1.0,plastic.rightFinalVelocityMps,1e-12)
        assertEquals(2.0,plastic.dissipatedEnergyJ,1e-12)
        assertEquals(plastic.momentumBeforeKgMps,plastic.momentumAfterKgMps,1e-12)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabCollision.evaluate(project,"left","right",0.0,2.0,0.5)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabCollision.evaluate(project,"left","right",2.0,0.0,2.0)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabCollision.evaluate(project,"left","right",2.0,0.0,0.5,0.2)
        }
        val unknown=NativeWorldLabProjectCodec.decode(
            NativeWorldLabEditor.assignMaterial(p,"right",null))
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabCollision.evaluate(unknown,"left","right",2.0,0.0,0.5)
        }
    }

    @Test fun spatialSphereContactTransfersImpulseAndConservesAngularMomentum(){
        var json=NativeWorldLabEditor.addSolid(NativeWorldLabEditor.blank(),"sphere",id="a")
        json=NativeWorldLabEditor.addSolid(json,"sphere",id="b")
        json=NativeWorldLabEditor.positionSolid(json,"a",listOf(0.0,0.5,0.0))
        json=NativeWorldLabEditor.positionSolid(json,"b",listOf(3.0,1.0,0.0))
        json=NativeWorldLabEditor.addHypotheticalMaterial(
            json,"Hypothetical matter",6.0/Math.PI,id="invented")
        json=NativeWorldLabEditor.assignMaterial(json,"a","invented")
        json=NativeWorldLabEditor.assignMaterial(json,"b","invented")
        val p=NativeWorldLabProjectCodec.decode(json)
        val first=NativeLabVector(2.0,0.0,0.0)
        val zero=NativeLabVector(0.0,0.0,0.0)
        val run=NativeWorldLabSphereImpact.evaluate(p,"a","b",first,zero,0.65)
        assertEquals((3.0-Math.sqrt(0.75))/2.0,run.impactTimeSeconds,1e-10)
        assertEquals(1.0,run.firstMassKg,1e-10)
        assertEquals(1.0,run.secondMassKg,1e-10)
        assertEquals(run.momentumBeforeKgMps.x,run.momentumAfterKgMps.x,1e-10)
        assertEquals(run.momentumBeforeKgMps.y,run.momentumAfterKgMps.y,1e-10)
        assertEquals(run.angularMomentumBeforeKgM2PerS.z,
            run.angularMomentumAfterKgM2PerS.z,1e-10)
        assertEquals(run.energyBeforeJ,run.energyAfterJ+run.dissipatedEnergyJ,1e-10)
        val at=run.sample(run.impactTimeSeconds)
        val dx=at.firstCentreM.x-at.secondCentreM.x
        val dy=at.firstCentreM.y-at.secondCentreM.y
        assertEquals(1.0,Math.hypot(dx,dy),1e-10)
        val evidence=org.json.JSONObject(run.toEvidenceJson())
        assertEquals("env-world-lab-sphere-impact-3d",evidence.getString("format"))
        assertEquals("hypothetical-user-assumed",evidence.getString("assumptionEvidence"))
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabSphereImpact.evaluate(p,"a","b",zero,zero,0.5)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabSphereImpact.evaluate(p,"a","b",first,zero,1.5)
        }
        val unknown=NativeWorldLabProjectCodec.decode(
            NativeWorldLabEditor.assignMaterial(json,"b",null))
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabSphereImpact.evaluate(unknown,"a","b",first,zero,0.5)
        }
    }

    @Test fun multiSphereCradleTransfersMomentumAcrossConsecutiveThreeDimensionalContacts(){
        var json=NativeWorldLabEditor.blank()
        for(i in 0..2)json=NativeWorldLabEditor.addSolid(json,"sphere",id="s-$i")
        json=NativeWorldLabEditor.addHypotheticalMaterial(json,"Invented gel",12/Math.PI,id="gel")
        for(i in 0..2){
            json=NativeWorldLabEditor.positionSolid(json,"s-$i",
                listOf(-4.0+3*i,0.5,0.0))
            json=NativeWorldLabEditor.assignMaterial(json,"s-$i","gel")
        }
        val project=NativeWorldLabProjectCodec.decode(json)
        val initial=mapOf("s-0" to NativeLabVector(2.0,0.0,0.0))
        val run=NativeWorldLabMultiSphere.evaluate(project,initial,1.0,4.0)
        assertEquals(2,run.events.size)
        assertEquals(1.0,run.events[0].atSeconds,1e-10)
        assertEquals(2.0,run.events[1].atSeconds,1e-10)
        assertEquals(run.initialEnergyJ,run.finalEnergyJ,1e-9)
        assertEquals(0.0,run.dissipationJ,1e-9)
        assertEquals(run.initialMomentum.x,run.finalMomentum.x,1e-9)
        assertEquals(run.initialAngular.z,run.finalAngular.z,1e-9)
        val final=run.sample(3.0)
        assertEquals(2,final.completedEvents)
        assertEquals(2.0,final.objects[2].velocityMps.x,1e-9)
        assertEquals(0.0,final.objects[0].velocityMps.x,1e-9)
        val evidence=org.json.JSONObject(run.toEvidenceJson())
        assertEquals("env-world-lab-multi-sphere-impact",evidence.getString("format"))
        assertEquals("hypothetical-user-assumed",evidence.getString("materialEvidence"))
        assertEquals(2,evidence.getJSONArray("events").length())
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabMultiSphere.evaluate(project,initial,-1.0)
        }
        val unknown=NativeWorldLabProjectCodec.decode(
            NativeWorldLabEditor.assignMaterial(json,"s-1",null))
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabMultiSphere.evaluate(unknown,initial,1.0)
        }
    }

    @Test fun disjointSimultaneousSphereImpactsConserveEnergyAndReplayTogether(){
        var json=NativeWorldLabEditor.blank()
        for(i in 0..3)json=NativeWorldLabEditor.addSolid(json,"sphere",id="s-$i")
        json=NativeWorldLabEditor.addHypotheticalMaterial(json,"Invented gel",12/Math.PI,id="gel")
        val positions=listOf(-4.0,-1.0,4.0,10.0)
        for(i in 0..3){
            json=NativeWorldLabEditor.positionSolid(json,"s-$i",listOf(positions[i],0.5,0.0))
            json=NativeWorldLabEditor.assignMaterial(json,"s-$i","gel")
        }
        val project=NativeWorldLabProjectCodec.decode(json)
        val speeds=mapOf(
            "s-0" to NativeLabVector(2.0,0.0,0.0),
            "s-2" to NativeLabVector(5.0,0.0,0.0))
        for(coefficient in listOf(1.0,0.5)){
            val run=NativeWorldLabMultiSphere.evaluate(project,speeds,coefficient,1.5)
            assertEquals(2,run.events.size)
            assertEquals(1.0,run.events[0].atSeconds,1e-10)
            assertEquals(1.0,run.events[1].atSeconds,1e-10)
            assertEquals(0,run.sample(0.99).completedEvents)
            val atContact=run.sample(1.0)
            assertEquals(2,atContact.completedEvents)
            assertEquals(1.0+coefficient,atContact.objects[1].velocityMps.x,1e-9)
            assertEquals((1.0+coefficient)*2.5,atContact.objects[3].velocityMps.x,1e-9)
            assertEquals(run.initialEnergyJ-run.finalEnergyJ,run.dissipationJ,1e-9)
            assertEquals(run.initialMomentum.x,run.finalMomentum.x,1e-9)
        }
    }

    @Test fun sharedSphereSimultaneousImpactIsExplicitlyRejected(){
        var json=NativeWorldLabEditor.blank()
        for(i in 0..2)json=NativeWorldLabEditor.addSolid(json,"sphere",id="s-$i")
        json=NativeWorldLabEditor.addHypotheticalMaterial(json,"Invented gel",12/Math.PI,id="gel")
        for(i in 0..2){
            json=NativeWorldLabEditor.positionSolid(json,"s-$i",
                listOf(-4.0+3*i,0.5,0.0))
            json=NativeWorldLabEditor.assignMaterial(json,"s-$i","gel")
        }
        val project=NativeWorldLabProjectCodec.decode(json)
        val speeds=mapOf(
            "s-0" to NativeLabVector(2.0,0.0,0.0),
            "s-2" to NativeLabVector(-2.0,0.0,0.0))
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabMultiSphere.evaluate(project,speeds,1.0,2.0)
        }
    }

}
