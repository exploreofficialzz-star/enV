package com.chastech.env.engine

import kotlin.math.*

/** WGS84 reference transforms. No terrain/imagery/observation data is implied. */
data class NativeGeodetic(val latitudeDegrees:Double,val longitudeDegrees:Double,val heightMeters:Double)
data class NativeEcef(val xMeters:Double,val yMeters:Double,val zMeters:Double)
data class NativeEnu(val eastMeters:Double,val northMeters:Double,val upMeters:Double)
object NativeWorldLabGeodesy {
    const val SEMI_MAJOR_METERS=6378137.0
    const val FLATTENING=1.0/298.257223563
    private val b=SEMI_MAJOR_METERS*(1-FLATTENING)
    private val e2=FLATTENING*(2-FLATTENING)
    private val ep2=(SEMI_MAJOR_METERS*SEMI_MAJOR_METERS-b*b)/(b*b)
    fun validate(c:NativeGeodetic):NativeGeodetic {
        require(c.latitudeDegrees.isFinite()&&c.latitudeDegrees in -90.0..90.0&&
            c.longitudeDegrees.isFinite()&&c.longitudeDegrees in -180.0..180.0&&
            c.heightMeters.isFinite()&&c.heightMeters in -12000.0..1e9){
            "Geodetic latitude, longitude or ellipsoidal height is outside WGS84 input bounds"
        }
        return c
    }
    fun toEcef(input:NativeGeodetic):NativeEcef {
        val c=validate(input);val lat=Math.toRadians(c.latitudeDegrees)
        val lon=Math.toRadians(c.longitudeDegrees)
        val s=sin(lat);val n=SEMI_MAJOR_METERS/sqrt(1-e2*s*s)
        return NativeEcef((n+c.heightMeters)*cos(lat)*cos(lon),
            (n+c.heightMeters)*cos(lat)*sin(lon),
            (n*(1-e2)+c.heightMeters)*s)
    }
    fun fromEcef(c:NativeEcef):NativeGeodetic {
        require(c.xMeters.isFinite()&&c.yMeters.isFinite()&&c.zMeters.isFinite()){
            "ECEF coordinates must be finite"
        }
        val p=hypot(c.xMeters,c.yMeters)
        require(hypot(p,c.zMeters)>=1.0){"Earth-centre has no unique geodetic coordinate"}
        if(p<1e-9)return NativeGeodetic(if(c.zMeters>=0)90.0 else -90.0,0.0,abs(c.zMeters)-b)
        val lon=atan2(c.yMeters,c.xMeters)
        val theta=atan2(c.zMeters*SEMI_MAJOR_METERS,p*b)
        var lat=atan2(c.zMeters+ep2*b*sin(theta).pow(3),
            p-e2*SEMI_MAJOR_METERS*cos(theta).pow(3))
        var height=0.0
        repeat(12){
            val s=sin(lat);val n=SEMI_MAJOR_METERS/sqrt(1-e2*s*s)
            height=p/max(1e-15,cos(lat))-n
            val next=atan2(c.zMeters,p*(1-e2*n/(n+height)))
            val delta=abs(next-lat);lat=next
            if(delta<1e-14)return@repeat
        }
        val s=sin(lat);val n=SEMI_MAJOR_METERS/sqrt(1-e2*s*s)
        height=if(abs(cos(lat))>1e-8)p/cos(lat)-n else abs(c.zMeters)/sin(lat)-n*(1-e2)
        return NativeGeodetic(Math.toDegrees(lat),Math.toDegrees(lon),height)
    }
    fun toEnu(point:NativeEcef,origin:NativeGeodetic):NativeEnu {
        val o=validate(origin);val base=toEcef(o)
        val dx=point.xMeters-base.xMeters;val dy=point.yMeters-base.yMeters;val dz=point.zMeters-base.zMeters
        require(listOf(dx,dy,dz).all{it.isFinite()}){"ECEF offset must be finite"}
        val lat=Math.toRadians(o.latitudeDegrees);val lon=Math.toRadians(o.longitudeDegrees)
        val sl=sin(lat);val cl=cos(lat);val so=sin(lon);val co=cos(lon)
        return NativeEnu(-so*dx+co*dy,-sl*co*dx-sl*so*dy+cl*dz,
            cl*co*dx+cl*so*dy+sl*dz)
    }
    fun fromEnu(local:NativeEnu,origin:NativeGeodetic):NativeEcef {
        require(listOf(local.eastMeters,local.northMeters,local.upMeters).all{it.isFinite()}){
            "ENU values must be finite"
        }
        val o=validate(origin);val base=toEcef(o)
        val lat=Math.toRadians(o.latitudeDegrees);val lon=Math.toRadians(o.longitudeDegrees)
        val sl=sin(lat);val cl=cos(lat);val so=sin(lon);val co=cos(lon)
        val dx=-so*local.eastMeters-sl*co*local.northMeters+cl*co*local.upMeters
        val dy=co*local.eastMeters-sl*so*local.northMeters+cl*so*local.upMeters
        val dz=cl*local.northMeters+sl*local.upMeters
        return NativeEcef(base.xMeters+dx,base.yMeters+dy,base.zMeters+dz)
    }
}
