package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test

class NativeWorldLabBranchTest {
    @Test fun sameModelBranchRecordsDiffAndRecomputesWithoutReplacingSource() {
        val source=NativeLabInput.Spring(massKg=1.0,springNPerM=4.0,
            dampingNsPerM=0.2,x0=0.5,v0=0.0)
        val target=source.copy(massKg=2.0,springNPerM=9.0)
        val sourceAtTime=NativeWorldLabScience.evaluate(source,0.5)
        val record=NativeWorldLabBranch.create(source,target,0.5,
            sourceRunId="source-run",createdAtUTC="2026-11-01T12:00:00Z")
        val recomputed=NativeWorldLabBranch.recompute(target,record)
        assertEquals("source-run",record.sourceRunId)
        assertEquals("spring",record.sourceModelId)
        assertEquals("spring",record.targetModelId)
        assertEquals("recomputed-new-run",record.fidelity)
        assertEquals(0.5,record.sourceTimeSeconds,0.0)
        assertEquals(0.5,record.targetTimeSeconds,0.0)
        assertEquals(listOf("massKg","springNPerM"),record.inputDiff.map{it.field})
        assertEquals(1.0,record.inputDiff[0].previous!!,0.0)
        assertEquals(2.0,record.inputDiff[0].next!!,0.0)
        assertNotEquals(sourceAtTime.xMeters,recomputed.xMeters)
        assertEquals(1.0,record.sourceParameters["massKg"]!!,0.0)
        assertEquals(2.0,record.targetParameters["massKg"]!!,0.0)
    }
    @Test fun crossModelBranchCapturesChangedAndRemovedParameters() {
        val source=NativeLabInput.RC()
        val target=NativeLabInput.Heat()
        val record=NativeWorldLabBranch.create(source,target,0.2,
            sourceRunId="rc-source",createdAtUTC="2026-11-01T12:00:00Z")
        assertEquals("rc",record.sourceModelId)
        assertEquals("heat",record.targetModelId)
        assertTrue(record.inputDiff.any{it.field=="resistanceOhm"&&it.previous==1000.0&&it.next==null})
        assertTrue(record.inputDiff.any{it.field=="diffusivityM2S"&&it.previous==null&&it.next==0.02})
        assertEquals(21,NativeWorldLabBranch.recompute(target,record).temperatureK!!.size)
    }
    @Test fun branchRejectsInvalidSourceTargetTimeAndTamperedTarget() {
        val source=NativeLabInput.Spring()
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabBranch.create(source,NativeLabInput.RC(),-0.1)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabBranch.create(source,NativeLabInput.Spring(massKg=Double.NaN),0.1)
        }
        val target=NativeLabInput.RC()
        val record=NativeWorldLabBranch.create(source,target,0.1)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabBranch.recompute(target.copy(resistanceOhm=500.0),record)
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabBranch.recompute(source,record)
        }
    }
}
