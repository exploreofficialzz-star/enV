package com.chastech.env.engine

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs
import kotlin.math.hypot

class NativeWorldLabGeodesyTest {
    @Test fun wgs84EquatorialPolarAndRoundTrip(){
        val equator=NativeWorldLabGeodesy.toEcef(NativeGeodetic(0.0,0.0,0.0))
        assertEquals(6378137.0,equator.xMeters,1e-8)
        val north=NativeWorldLabGeodesy.toEcef(NativeGeodetic(90.0,0.0,0.0))
        assertEquals(6356752.314245,north.zMeters,1e-5)
        val fixtures=listOf(NativeGeodetic(51.5074,-0.1278,35.0),
            NativeGeodetic(-33.8688,151.2093,58.0),
            NativeGeodetic(89.999,179.999,-400.0),
            NativeGeodetic(0.001,-179.999,35786000.0),
            NativeGeodetic(-90.0,0.0,1200.0))
        fixtures.forEach{p->
            val back=NativeWorldLabGeodesy.fromEcef(NativeWorldLabGeodesy.toEcef(p))
            assertEquals(p.latitudeDegrees,back.latitudeDegrees,1e-8)
            assertEquals(p.heightMeters,back.heightMeters,1e-3)
        }
    }
    @Test fun enuOriginRoundtripAndValidation(){
        val origin=NativeGeodetic(40.7,-74.0,12.0)
        val zero=NativeWorldLabGeodesy.toEnu(NativeWorldLabGeodesy.toEcef(origin),origin)
        assertEquals(0.0,zero.eastMeters,1e-8)
        val local=NativeEnu(1250.0,-850.0,230.0)
        val ecef=NativeWorldLabGeodesy.fromEnu(local,origin)
        val restored=NativeWorldLabGeodesy.toEnu(ecef,origin)
        assertEquals(local.eastMeters,restored.eastMeters,1e-8)
        assertEquals(local.northMeters,restored.northMeters,1e-8)
        assertEquals(local.upMeters,restored.upMeters,1e-8)
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabGeodesy.toEcef(NativeGeodetic(91.0,0.0,0.0))
        }
        assertThrows(IllegalArgumentException::class.java){
            NativeWorldLabGeodesy.fromEcef(NativeEcef(0.0,0.0,0.0))
        }
    }
}
