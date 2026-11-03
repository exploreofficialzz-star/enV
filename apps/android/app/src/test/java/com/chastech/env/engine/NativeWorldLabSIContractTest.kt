package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test

class NativeWorldLabSIContractTest {
    @Test fun canonicalSIExchange() {
        val length=NativeWorldLabSI.declare(150.0,"cm")
        assertEquals(1.5,length.valueSI,1e-12)
        assertEquals(1500.0,NativeWorldLabSI.convert(length,"mm"),1e-9)
        assertEquals(0.25,NativeWorldLabSI.convert(
            NativeWorldLabSI.declare(250.0,"g"),"kg"),1e-12)
        assertEquals(2000.0,NativeWorldLabSI.convert(
            NativeWorldLabSI.declare(2.0,"kPa"),"Pa"),1e-12)
    }
    @Test fun rejectDimensionFraudAndUnknownValues() {
        val force=NativeWorldLabSI.declare(20.0,"N")
        assertFails{NativeWorldLabSI.convert(force,"Pa")}
        assertFails{NativeWorldLabSI.declare(-1.0,"K")}
        assertFails{NativeWorldLabSI.declare(Double.NaN,"m")}
        assertFails{NativeWorldLabSI.declare(4.0,"m","unknown-insufficient-evidence")}
        assertFails{NativeWorldLabSI.declare(4.0,"V","measured-observed")}
        assertEquals("lab:voltmeter",NativeWorldLabSI.declare(
            4.0,"V","measured-observed","lab:voltmeter").sourceId)
    }
    @Test fun nativeTypedPortCompatibility() {
        val source=NativeSciencePort("out","output","V","SCALAR","electrical")
        val motor=NativeSciencePort("in","input","V","SCALAR","electrical")
        NativeWorldLabSI.compatible(source,motor)
        assertFails{NativeWorldLabSI.compatible(source,motor.copy(unit="W"))}
        assertFails{NativeWorldLabSI.compatible(source,motor.copy(frame="LOCAL_ENU"))}
        assertFails{NativeWorldLabSI.compatible(motor,source)}
    }
    @Test fun nativeComponentGraphRejectsInstantaneousCycleAndWrongDimensions() {
        val source=NativeScienceComponent("source","ideal-source",listOf(
            NativeSciencePort("out","output","V","SCALAR","electrical"),
            NativeSciencePort("in","input","V","SCALAR","electrical")))
        val load=NativeScienceComponent("load","ohmic-load",listOf(
            NativeSciencePort("out","output","V","SCALAR","electrical"),
            NativeSciencePort("in","input","V","SCALAR","electrical")))
        val link=NativeScienceConnection("source","out","load","in")
        val reverse=NativeScienceConnection("load","out","source","in")
        val setup=NativeScientificGraph("native-lab",3,listOf(source,load),listOf(link))
        assertEquals(1,NativeWorldLabGraph.validate(setup).connections.size)
        assertFails{NativeWorldLabGraph.validate(setup.copy(
            connections=listOf(link,reverse)))}
        NativeWorldLabGraph.validate(setup.copy(
            connections=listOf(link,reverse.copy(delayed=true))))
        assertFails{NativeWorldLabGraph.validate(setup.copy(
            components=listOf(source,load.copy(ports=listOf(
                NativeSciencePort("out","output","V","SCALAR","electrical"),
                NativeSciencePort("in","input","W","SCALAR","electrical"))))))}
    }
    private fun assertFails(block:()->Unit) {
        try {block();fail("Expected dimensional or provenance rejection")}
        catch(_:IllegalArgumentException) { /* validated bad input */ }
        catch(_:IllegalStateException) { /* unknown unit */ }
    }


    @Test fun trustedSchedulerRunsRealRcAndBalancesPower() {
        val graph=NativeScientificGraph("rc-contract",2,listOf(
            NativeScienceComponent("source","ideal-dc-source",listOf(NativeSciencePort("V","output","V","SCALAR","electrical"))),
            NativeScienceComponent("load","series-rc-load",listOf(
                NativeSciencePort("Vin","input","V","SCALAR","electrical"),
                NativeSciencePort("Vc","output","V","SCALAR","electrical"),
                NativeSciencePort("I","output","A","SCALAR","electrical")))
        ),listOf(NativeScienceConnection("source","V","load","Vin")))
        val run=NativeWorldLabExecution.execute(graph,
            NativeWorldLabExecution.idealRcAdapters(12.0,6.0,0.5),0.3,0.1)
        val last=run.samples.last()
        assertEquals(12.0*(1.0-kotlin.math.exp(-0.3/3.0)),last.values.getValue("load:Vc").valueSI,1e-12)
        assertTrue(last.values.getValue("load:I").valueSI>0.0)
        assertTrue(run.samples.all{kotlin.math.abs(it.residualW)<1e-10&&it.dissipatedW>=0.0})
        val adapters=NativeWorldLabExecution.idealRcAdapters(12.0,6.0,0.5)
        val changedSource=adapters.first().copy(advance={_,_,_->
            NativeScientificStepOutput(mapOf("V" to NativeWorldLabSI.declare(6.0,"V")),
                0.0,0.0,0.0)
        })
        val connected=NativeWorldLabExecution.execute(graph,listOf(changedSource,adapters.last()),0.3,0.1)
        assertEquals(6.0*(1.0-kotlin.math.exp(-0.3/3.0)),
            connected.samples.last().values.getValue("load:Vc").valueSI,1e-12)
    }
    @Test fun schedulerHonoursFutureEventsAndRejectsFalsePower() {
        val graph=NativeScientificGraph("rc-events",1,listOf(
            NativeScienceComponent("source","ideal-dc-source",listOf(NativeSciencePort("V","output","V","SCALAR","electrical"))),
            NativeScienceComponent("load","series-rc-load",listOf(
                NativeSciencePort("Vin","input","V","SCALAR","electrical"),
                NativeSciencePort("Vc","output","V","SCALAR","electrical"),
                NativeSciencePort("I","output","A","SCALAR","electrical")))
        ),listOf(NativeScienceConnection("source","V","load","Vin")))
        val base=NativeWorldLabExecution.idealRcAdapters(12.0,6.0,0.5)
        val eventSource=base.first().copy(advance={time,_,_->
            NativeScientificStepOutput(mapOf("V" to NativeWorldLabSI.declare(12.0,"V")),
                0.0,0.0,0.0,if(time<0.11)0.15 else null)
        })
        val run=NativeWorldLabExecution.execute(graph,listOf(eventSource,base.last()),0.3,0.1)
        assertTrue(run.samples.any{it.eventBoundary&&kotlin.math.abs(it.timeSeconds-0.15)<1e-10})
        val faulty=base.last().copy(advance={time,delta,inputs->
            val value=base.last().advance(time,delta,inputs)
            value.copy(suppliedW=value.suppliedW-1.0)
        })
        assertFails{NativeWorldLabExecution.execute(graph,listOf(base.first(),faulty),0.3,0.1)}
    }

    @Test fun connectedScientificInputFailsClosedWhenSourceOmitsItsOutput() {
        val graph=NativeScientificGraph("rc-missing-output",1,listOf(
            NativeScienceComponent("source","ideal-dc-source",listOf(
                NativeSciencePort("V","output","V","SCALAR","electrical"))),
            NativeScienceComponent("load","series-rc-load",listOf(
                NativeSciencePort("Vin","input","V","SCALAR","electrical"),
                NativeSciencePort("Vc","output","V","SCALAR","electrical"),
                NativeSciencePort("I","output","A","SCALAR","electrical")))
        ),listOf(NativeScienceConnection("source","V","load","Vin")))
        val base=NativeWorldLabExecution.idealRcAdapters(12.0,6.0,0.5)
        val missingSource=base.first().copy(advance={_,_,_->
            NativeScientificStepOutput(emptyMap(),0.0,0.0,0.0)
        })
        assertFails{
            NativeWorldLabExecution.execute(graph,listOf(missingSource,base.last()),0.3,0.1)
        }
    }
}


class NativeWorldLabStatefulGraphExecutionTest {
    @Test fun rcCapacitorStatePersistsAcrossConnectedSourceSwitch() {
        val graph=NativeWorldLabExecution.idealRcGraph("rc-switch",1)
        val base=NativeWorldLabExecution.idealRcAdapters(12.0,6.0,0.5)
        val switched=base.first().copy(advance={time,_,_->
            val voltage=if(time<0.15)12.0 else 0.0
            NativeScientificStepOutput(mapOf("V" to NativeWorldLabSI.declare(voltage,"V")),
                0.0,0.0,0.0)
        })
        val run=NativeWorldLabExecution.execute(graph,listOf(switched,base.last()),0.3,0.1)
        val charged=12.0*(1.0-kotlin.math.exp(-0.1/3.0))
        assertEquals(charged*kotlin.math.exp(-0.2/3.0),
            run.samples.last().values.getValue("load:Vc").valueSI,1e-12)
    }

    @Test fun delayedFeedbackRequiresExplicitInitialOutputState() {
        val ports=listOf(
            NativeSciencePort("out","output","1","SCALAR","signal"),
            NativeSciencePort("in","input","1","SCALAR","signal"))
        val graph=NativeScientificGraph("delay-loop",1,listOf(
            NativeScienceComponent("a","delay-step",ports),
            NativeScienceComponent("b","delay-step",ports)
        ),listOf(
            NativeScienceConnection("a","out","b","in",true),
            NativeScienceConnection("b","out","a","in",true)))
        fun adapter(id:String,initial:Double)=NativeScientificAdapter(
            componentId=id,modelId="delay-step",modelVersion="1.0.0",
            initialOutputs=mapOf("out" to NativeWorldLabSI.declare(initial,"1")),
            advance={_,_,inputs->
                NativeScientificStepOutput(mapOf("out" to NativeWorldLabSI.declare(
                    inputs.getValue("in").valueSI+1.0,"1","physics-model-computed")),
                    0.0,0.0,0.0)
            })
        val run=NativeWorldLabExecution.execute(graph,listOf(adapter("a",1.0),adapter("b",10.0)),0.2,0.1)
        assertEquals(11.0,run.samples[0].values.getValue("a:out").valueSI,1e-12)
        assertEquals(2.0,run.samples[0].values.getValue("b:out").valueSI,1e-12)
        assertEquals(3.0,run.samples[1].values.getValue("a:out").valueSI,1e-12)
        assertEquals(12.0,run.samples[1].values.getValue("b:out").valueSI,1e-12)

        val noInitial=adapter("a",1.0).copy(initialOutputs=emptyMap())
        var rejected=false
        try {
            NativeWorldLabExecution.execute(graph,listOf(noInitial,adapter("b",10.0)),0.1,0.1)
        } catch (_:IllegalArgumentException) { rejected=true }
          catch (_:IllegalStateException) { rejected=true }
        assertTrue("Delayed feedback without t=0 state must be rejected",rejected)
    }
}


class NativeWorldLabRepeatRunStateTests {
    @Test fun statefulAdaptersResetBeforeEveryIndependentRun() {
        val graph=NativeWorldLabExecution.idealRcGraph("rc-repeat-run",1)
        val adapters=NativeWorldLabExecution.idealRcAdapters(12.0,6.0,0.5)
        val first=NativeWorldLabExecution.execute(graph,adapters,0.3,0.1)
        val repeated=NativeWorldLabExecution.execute(graph,adapters,0.3,0.1)
        assertEquals(first.samples.map{it.values.getValue("load:Vc").valueSI},
            repeated.samples.map{it.values.getValue("load:Vc").valueSI})
    }
}
