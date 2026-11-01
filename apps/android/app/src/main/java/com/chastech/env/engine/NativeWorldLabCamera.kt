package com.chastech.env.engine

import kotlin.math.*

data class NativeWorldLabScreenPoint(
    val xPixels:Double,val yPixels:Double,val pixelsPerMeter:Double,
    val depthMeters:Double,val visible:Boolean,
)

/** Deterministic pinhole-camera projection for the native World Lab observer. */
object NativeWorldLabCamera {
    fun project(
        point:NativeLabVector,target:NativeLabVector,yawRadians:Double,
        elevationDegrees:Double,cameraDistanceMeters:Double,focalLengthPixels:Double,
        panXPixels:Double,panYPixels:Double,viewportWidthPixels:Double,
        viewportHeightPixels:Double,nearMeters:Double=0.05,farMeters:Double=50_000_000.0,
    ):NativeWorldLabScreenPoint {
        val input=listOf(yawRadians,elevationDegrees,cameraDistanceMeters,
            focalLengthPixels,panXPixels,panYPixels,viewportWidthPixels,
            viewportHeightPixels,nearMeters,farMeters)
        require(input.all{it.isFinite()}){"Camera parameters must be finite"}
        require(cameraDistanceMeters>0&&focalLengthPixels>0&&viewportWidthPixels>0&&viewportHeightPixels>0){
            "Camera distance, focal length and viewport dimensions must be positive"
        }
        require(nearMeters>0&&farMeters>nearMeters){"Camera clipping range must be positive and ordered"}
        require(elevationDegrees in -89.0..89.0){"Camera elevation must be between -89° and 89°"}
        val dx=point.x-target.x;val dy=point.y-target.y;val dz=point.z-target.z
        val elevation=Math.toRadians(elevationDegrees)
        val c=cos(yawRadians);val s=sin(yawRadians);val ce=cos(elevation);val se=sin(elevation)
        val cameraX=dx*c-dz*s
        val cameraY=dx*s*se+dy*ce+dz*c*se
        val depth=cameraDistanceMeters+dx*s*ce-dy*se+dz*c*ce
        if(!depth.isFinite()||depth<=nearMeters||depth>=farMeters)
            return NativeWorldLabScreenPoint(Double.NaN,Double.NaN,0.0,depth,false)
        val scale=focalLengthPixels/depth
        val x=viewportWidthPixels/2+panXPixels+cameraX*scale
        val y=viewportHeightPixels/2+panYPixels-cameraY*scale
        return NativeWorldLabScreenPoint(x,y,scale,depth,x.isFinite()&&y.isFinite()&&scale.isFinite())
    }
}