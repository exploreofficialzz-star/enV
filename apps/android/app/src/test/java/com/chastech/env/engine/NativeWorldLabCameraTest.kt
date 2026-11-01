package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test

class NativeWorldLabCameraTest {
    @Test fun targetProjectsToViewportCentreAndScaleIsFocalOverDistance() {
        val p=NativeWorldLabCamera.project(NativeLabVector(0.0,0.0,0.0),
            NativeLabVector(0.0,0.0,0.0),0.0,0.0,8.0,400.0,0.0,0.0,800.0,600.0)
        assertTrue(p.visible);assertEquals(400.0,p.xPixels,1e-12);assertEquals(300.0,p.yPixels,1e-12)
        assertEquals(50.0,p.pixelsPerMeter,1e-12);assertEquals(8.0,p.depthMeters,1e-12)
    }
    @Test fun pointsFurtherForwardShrinkAndBehindCameraPointsAreClipped() {
        val near=NativeWorldLabCamera.project(NativeLabVector(0.0,0.0,2.0),NativeLabVector(0.0,0.0,0.0),0.0,0.0,8.0,400.0,0.0,0.0,800.0,600.0)
        val far=NativeWorldLabCamera.project(NativeLabVector(0.0,0.0,10.0),NativeLabVector(0.0,0.0,0.0),0.0,0.0,8.0,400.0,0.0,0.0,800.0,600.0)
        val behind=NativeWorldLabCamera.project(NativeLabVector(0.0,0.0,-9.0),NativeLabVector(0.0,0.0,0.0),0.0,0.0,8.0,400.0,0.0,0.0,800.0,600.0)
        assertTrue(near.visible&&far.visible);assertTrue(near.pixelsPerMeter>far.pixelsPerMeter)
        assertFalse(behind.visible)
    }
    @Test fun yawAndElevationRotateCameraBasisWithoutMovingTargetCentre() {
        val target=NativeLabVector(10.0,4.0,-2.0)
        val centre=NativeWorldLabCamera.project(target,target,Math.PI/2,35.0,12.0,480.0,0.0,0.0,1000.0,700.0)
        val right=NativeWorldLabCamera.project(NativeLabVector(11.0,4.0,-2.0),target,Math.PI/2,0.0,12.0,480.0,0.0,0.0,1000.0,700.0)
        val up=NativeWorldLabCamera.project(NativeLabVector(10.0,5.0,-2.0),target,0.0,35.0,12.0,480.0,0.0,0.0,1000.0,700.0)
        assertEquals(500.0,centre.xPixels,1e-12);assertEquals(350.0,centre.yPixels,1e-12)
        assertTrue(right.visible&&right.xPixels<500.0);assertTrue(up.visible&&up.yPixels<350.0)
    }
    @Test fun panAndClippingWorkAndInvalidSettingsAreRejected() {
        val moved=NativeWorldLabCamera.project(NativeLabVector(0.0,0.0,0.0),NativeLabVector(0.0,0.0,0.0),0.0,0.0,8.0,400.0,20.0,-10.0,800.0,600.0)
        assertEquals(420.0,moved.xPixels,1e-12);assertEquals(290.0,moved.yPixels,1e-12)
        val clipped=NativeWorldLabCamera.project(NativeLabVector(0.0,0.0,0.0),NativeLabVector(0.0,0.0,0.0),0.0,0.0,8.0,400.0,0.0,0.0,800.0,600.0,0.05,7.0)
        assertFalse(clipped.visible)
        assertThrows(IllegalArgumentException::class.java){NativeWorldLabCamera.project(
            NativeLabVector(0.0,0.0,0.0),NativeLabVector(0.0,0.0,0.0),0.0,0.0,0.0,400.0,0.0,0.0,800.0,600.0)}
    }
}