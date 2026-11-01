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
    private fun assertFails(block:()->Unit) {
        try {block();fail("Expected dimensional or provenance rejection")}
        catch(_:IllegalArgumentException) { /* validated bad input */ }
        catch(_:IllegalStateException) { /* unknown unit */ }
    }
}
