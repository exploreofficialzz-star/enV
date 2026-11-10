package com.chastech.env

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.focusable
import android.view.KeyEvent as AndroidKeyEvent
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalDensity
import com.chastech.env.engine.NativeLabSolid
import com.chastech.env.engine.NativeGeodetic
import com.chastech.env.engine.NativeEnu
import com.chastech.env.engine.NativeWorldLabGeodesy
import com.chastech.env.engine.NativeLabVector
import com.chastech.env.engine.NativeWorldLabProject
import com.chastech.env.engine.NativeWorldLabCamera
import com.chastech.env.engine.NativeWorldLabSky
import com.chastech.env.engine.NativeWorldLabInspection
import com.chastech.env.engine.NativeInspectionSettings
import com.chastech.env.engine.NativeInspectionMode
import com.chastech.env.engine.NativeInspectionAxis
import kotlin.math.*

private data class LabScreenPoint(val x:Float,val y:Float,val scale:Float,val depth:Double,val visible:Boolean)
private fun labPerspectivePoint(
    point:NativeLabVector,focus:NativeLabVector,yaw:Float,cameraDistance:Double,
    focalLength:Float,pan:Offset,width:Float,height:Float,elevationDegrees:Float,
):LabScreenPoint{
    val projected=NativeWorldLabCamera.project(point,focus,yaw.toDouble(),elevationDegrees.toDouble(),
        cameraDistance,focalLength.toDouble(),pan.x.toDouble(),pan.y.toDouble(),
        width.toDouble(),height.toDouble())
    return LabScreenPoint(projected.xPixels.toFloat(),projected.yPixels.toFloat(),
        projected.pixelsPerMeter.toFloat(),projected.depthMeters,projected.visible)
}
private fun labRotatePoint(x:Double,y:Double,z:Double,rotation:NativeLabVector):NativeLabVector{
    val cx=cos(rotation.x);val sx=sin(rotation.x)
    val cy=cos(rotation.y);val sy=sin(rotation.y)
    val cz=cos(rotation.z);val sz=sin(rotation.z)
    val rx=cy*cz+sy*sx*sz;val ry=-cy*sz+sy*sx*cz;val rz=sy*cx
    val r2x=cx*sz;val r2y=cx*cz;val r2z=-sx
    val r3x=-sy*cz+cy*sx*sz;val r3y=sy*sz+cy*sx*cz;val r3z=cy*cx
    return NativeLabVector(rx*x+ry*y+rz*z,r2x*x+r2y*y+r2z*z,
        r3x*x+r3y*y+r3z*z)
}
private fun labProjectCenter(
    solid:NativeLabSolid,focus:NativeLabVector,yaw:Float,cameraDistance:Double,
    focalLength:Float,pan:Offset,width:Float,height:Float,elevation:Float,
)=labPerspectivePoint(solid.positionMeters,focus,yaw,cameraDistance,focalLength,pan,width,height,elevation)

/** Camera state shared by the full-bleed canvas and the controls that live in the tool panel. */
@Stable
class NativeWorldLabViewToggles {
    var showLabels by mutableStateOf(true)
    var showViewportOverlays by mutableStateOf(true)
}

@Stable
class NativeWorldLabViewState(
    initialZoom:Float,initialYaw:Float,initialElevation:Float,
    initialEye:NativeLabVector,
    val toggles:NativeWorldLabViewToggles,
) {
    /** First-person observer: the camera sits at the eye and yaw/elevation turn the head. */
    var eyeX by mutableDoubleStateOf(initialEye.x)
    var eyeY by mutableDoubleStateOf(initialEye.y)
    var eyeZ by mutableDoubleStateOf(initialEye.z)
    /** Move along the heading (forward) and across it (strafe) by one comfortable walking step. */
    fun walk(forward:Double,strafe:Double=0.0){
        val range=(45.0*8.0/zoom.toDouble()).coerceIn(0.5,100000.0)
        val step=(0.12*sqrt(range/8.0)).coerceIn(0.03,500.0)
        val s=sin(yaw.toDouble());val c=cos(yaw.toDouble())
        eyeX+=(s*forward+c*strafe)*step
        eyeZ+=(c*forward-s*strafe)*step
    }
    /** Move forward (or back, when negative) along the heading by an exact distance. */
    fun travel(meters:Double){
        eyeX+=sin(yaw.toDouble())*meters
        eyeZ+=cos(yaw.toDouble())*meters
    }
    var zoom by mutableFloatStateOf(initialZoom)
    var yaw by mutableFloatStateOf(initialYaw)
    var elevation by mutableFloatStateOf(initialElevation)
    var observerDepthMeters by mutableFloatStateOf(0f)
    var pan by mutableStateOf(Offset.Zero)
}

@Composable
fun rememberNativeWorldLabViewState(project:NativeWorldLabProject):NativeWorldLabViewState{
    val toggles=remember(project.id){NativeWorldLabViewToggles()}
    return remember(project.id,project.revision){
        val pose=NativeWorldLabCamera.poseFromPosition(project.cameraPositionMeters,project.cameraLookingAtMeters)
        val horizontal=(pose.distanceMeters*cos(Math.toRadians(pose.elevationDegrees))).coerceAtLeast(0.25)
        NativeWorldLabViewState(
            (45.0*8.0/horizontal).toFloat().coerceIn(0.1f,160f),
            pose.yawRadians.toFloat(),
            pose.elevationDegrees.toFloat().coerceIn(-85f,85f),
            project.cameraPositionMeters,
            toggles)
    }
}

/**
 * Full-bleed observer view: sky and horizon, ground grid, schematic subsurface bands and solids.
 * The ground, bands and sky are explicitly schematic; they are not terrain, geology or a surveyed site.
 */
@Composable
fun NativeWorldLabViewportCanvas(
    project:NativeWorldLabProject,selectedId:String?,
    view:NativeWorldLabViewState,
    onSelect:(String)->Unit,
    inspection:NativeInspectionSettings=NativeInspectionSettings(),
    skyEpochMillis:Long=System.currentTimeMillis(),
    modifier:Modifier=Modifier,
){
    val screenDensity=LocalDensity.current.density
    val selectedEntity=project.entities.firstOrNull{it.id==selectedId}
    val cutPlane=NativeWorldLabInspection.plane(project,selectedId,inspection)
    val cutOffset=cutPlane?.offset
    val cutTargets=NativeWorldLabInspection.targetIds(project,selectedId)
    fun clip(vertices:List<NativeLabVector>,entityId:String)=if(cutPlane==null||entityId !in cutTargets)vertices else NativeWorldLabInspection.clipPolygon(vertices,cutPlane)
    fun isInspectionTarget(entityId:String)=entityId in cutTargets
    fun alpha(entityId:String):Float{
        if(!isInspectionTarget(entityId))return 0.86f
        return when(inspection.mode){
            NativeInspectionMode.NORMAL,NativeInspectionMode.ISOLATE,NativeInspectionMode.EXPLODED->0.86f
            NativeInspectionMode.TRANSPARENT,NativeInspectionMode.CUTAWAY->inspection.opacity
            NativeInspectionMode.XRAY->minOf(0.22f,inspection.opacity)
        }
    }
    fun isXrayTarget(entityId:String)=inspection.mode==NativeInspectionMode.XRAY&&isInspectionTarget(entityId)
    val eye=NativeLabVector(view.eyeX,(view.eyeY+view.observerDepthMeters).coerceIn(-20000.0,100000.0),view.eyeZ)
    val viewRangeMeters=(45.0*8.0/view.zoom.toDouble()).coerceIn(0.5,100000.0)
    val elevationRadians=Math.toRadians(view.elevation.toDouble())
    val cameraDistance=(viewRangeMeters/cos(elevationRadians).coerceAtLeast(0.08)).coerceIn(0.5,100000.0)
    val focus=NativeLabVector(
        eye.x+sin(view.yaw.toDouble())*cos(elevationRadians)*cameraDistance,
        eye.y-sin(elevationRadians)*cameraDistance,
        eye.z+cos(view.yaw.toDouble())*cos(elevationRadians)*cameraDistance)
    fun projection(point:NativeLabVector,width:Float,height:Float,focalLength:Float)=
        labPerspectivePoint(point,focus,view.yaw,cameraDistance,focalLength,view.pan,width,height,view.elevation)
    val cameraAboveGround=eye.y>=0.0
    val skyPose=NativeWorldLabSky.solarPosition(skyEpochMillis,0.0,
        NativeWorldLabSky.representativeLongitude(java.util.TimeZone.getDefault().getOffset(skyEpochMillis)))
    val skyPalette=NativeWorldLabSky.palette(skyPose.altitudeDegrees)
    val skyLight=NativeWorldLabSky.lighting(skyPose.altitudeDegrees)
    Canvas(
        modifier.fillMaxSize()
            .pointerInput(project.id,project.revision){
                detectTransformGestures{_,panChange,zoomChange,rotationChange->
                    if(zoomChange==1f&&rotationChange==0f){
                        // One finger turns the head; dragging down looks down, dragging right looks right.
                        view.yaw=(view.yaw+panChange.x*0.0045f).let{((it+PI.toFloat())%(2*PI.toFloat())+2*PI.toFloat())%(2*PI.toFloat())-PI.toFloat()}
                        view.elevation=(view.elevation+panChange.y*0.12f).coerceIn(-60f,85f)
                    }else{
                        // Two fingers: spreading walks forward, pinching walks back.
                        view.travel((zoomChange-1.0)*viewRangeMeters*1.5)
                    }
                }
            }
            .pointerInput(project.id,project.revision,view.zoom,view.yaw,view.pan){
                detectTapGestures{touch->
                    val hit=project.entities.map{e->
                        val p=projection(e.positionMeters,size.width.toFloat(),size.height.toFloat(),360f*screenDensity)
                        e to if(p.visible)hypot(p.x-touch.x,p.y-touch.y) else Float.POSITIVE_INFINITY
                    }.filter{it.second<44f}.minByOrNull{it.second}
                    hit?.first?.let{onSelect(it.id)}
                }
            }
            .semantics{contentDescription="Interactive perspective 3D World Lab view with drag, pinch zoom, orbit, elevation, keyboard controls and part selection"}
            .focusable()
            .onPreviewKeyEvent{event->
                if(event.nativeKeyEvent.action!=AndroidKeyEvent.ACTION_DOWN)return@onPreviewKeyEvent false
                val step=(0.8*sqrt(viewRangeMeters/8.0)).coerceIn(0.08,2000.0).toFloat()
                when(event.nativeKeyEvent.keyCode){
                    AndroidKeyEvent.KEYCODE_DPAD_LEFT->{view.yaw-=0.12f;true}
                    AndroidKeyEvent.KEYCODE_DPAD_RIGHT->{view.yaw+=0.12f;true}
                    AndroidKeyEvent.KEYCODE_DPAD_UP->{view.elevation=(view.elevation-4f).coerceAtLeast(-60f);true}
                    AndroidKeyEvent.KEYCODE_DPAD_DOWN->{view.elevation=(view.elevation+4f).coerceAtMost(85f);true}
                    AndroidKeyEvent.KEYCODE_W->{view.walk(1.0);true}
                    AndroidKeyEvent.KEYCODE_S->{view.walk(-1.0);true}
                    AndroidKeyEvent.KEYCODE_A->{view.walk(0.0,-1.0);true}
                    AndroidKeyEvent.KEYCODE_D->{view.walk(0.0,1.0);true}
                    AndroidKeyEvent.KEYCODE_PAGE_DOWN->{view.observerDepthMeters=(view.observerDepthMeters-step).coerceAtLeast(-20000f);true}
                    AndroidKeyEvent.KEYCODE_PAGE_UP->{view.observerDepthMeters=(view.observerDepthMeters+step).coerceAtMost(20000f);true}
                    else->false
                }
            }
    ){
        val focalLength=360f*density
        // Sky above the horizon, hazy ground below it, and the sun where it really is. Only at
        // surface scale: below ground or zoomed far out the view hands over to the schematic layers.
        val surfaceView=eye.y>=0.0&&viewRangeMeters<=400.0
        if(surfaceView){
            val horizonY=(size.height/2f+view.pan.y-focalLength*tan(Math.toRadians(view.elevation.toDouble())).toFloat())
                .coerceIn(-size.height*6f,size.height*7f)
            val zenith=Color(skyPalette.zenith[0].toFloat(),skyPalette.zenith[1].toFloat(),skyPalette.zenith[2].toFloat())
            val haze=Color(skyPalette.horizon[0].toFloat(),skyPalette.horizon[1].toFloat(),skyPalette.horizon[2].toFloat())
            val skyEnd=horizonY.coerceIn(0f,size.height)
            if(skyEnd>0f)drawRect(
                brush=Brush.verticalGradient(listOf(zenith,haze),startY=horizonY-size.height*1.2f,endY=horizonY),
                size=Size(size.width,skyEnd))
            if(skyEnd<size.height){
                val shade=skyLight.ambient.toFloat().coerceIn(0.1f,1f)
                val near=Color(0.43f*shade,0.56f*shade,0.45f*shade)
                val far=Color(haze.red*0.7f+near.red*0.3f,haze.green*0.7f+near.green*0.3f,haze.blue*0.7f+near.blue*0.3f)
                drawRect(
                    brush=Brush.verticalGradient(listOf(far,near),startY=horizonY,endY=horizonY+size.height*0.55f),
                    topLeft=Offset(0f,skyEnd),size=Size(size.width,size.height-skyEnd))
            }
            if(skyPose.altitudeDegrees>-2.0){
                val dir=NativeWorldLabSky.sunDirection(skyPose)
                val cameraX=eye.x
                val cameraY=eye.y
                val cameraZ=eye.z
                val sun=projection(NativeLabVector(cameraX+dir.x*1e6,cameraY+dir.y*1e6,cameraZ+dir.z*1e6),size.width,size.height,focalLength)
                if(sun.visible){
                    val centre=Offset(sun.x,sun.y)
                    val glowRadius=size.minDimension*0.28f
                    val glowAlpha=(0.15f+0.5f*skyPalette.glowStrength.toFloat()).coerceIn(0f,0.7f)
                    drawCircle(brush=Brush.radialGradient(listOf(Color(1f,0.85f,0.55f,glowAlpha),Color.Transparent),center=centre,radius=glowRadius),
                        radius=glowRadius,center=centre)
                    drawCircle(Color(1f,0.96f,0.84f),size.minDimension*0.028f,centre)
                }
            }
        }else drawRect(Color(0xFF15232E))
        // Ground grid follows the saved target and adapts to the current visible range.
        val unit=when{
            view.zoom>80->0.25;view.zoom>35->0.5;view.zoom>12->2.0;view.zoom>6->10.0
            view.zoom>2->50.0;view.zoom>0.7->100.0;view.zoom>0.25->500.0;else->1000.0
        }
        val extent=24
        // Ground grid is centred on the observer (snapped to the grid) and drawn in short segments
        // so lines that pass behind the eye are clipped instead of dropped.
        val gridX=floor(eye.x/unit)*unit
        val gridZ=floor(eye.z/unit)*unit
        if(cameraAboveGround)for(i in -extent..extent){
            for(j in -extent until extent){
                val a=projection(NativeLabVector(gridX+i*unit,0.0,gridZ+j*unit),size.width,size.height,focalLength)
                val b=projection(NativeLabVector(gridX+i*unit,0.0,gridZ+(j+1)*unit),size.width,size.height,focalLength)
                if(a.visible&&b.visible)drawLine(Color(0x47FFFFFF),Offset(a.x,a.y),Offset(b.x,b.y),strokeWidth=1f)
                val c=projection(NativeLabVector(gridX+j*unit,0.0,gridZ+i*unit),size.width,size.height,focalLength)
                val d=projection(NativeLabVector(gridX+(j+1)*unit,0.0,gridZ+i*unit),size.width,size.height,focalLength)
                if(c.visible&&d.visible)drawLine(Color(0x47FFFFFF),Offset(c.x,c.y),Offset(d.x,d.y),strokeWidth=1f)
            }
        }
        // A local y=0 reference surface and horizontal subsurface bands are schematic only.
        if(eye.y < 0.0){
            val layerY=listOf(0.0,-5.0,-25.0,-100.0,-500.0,-2000.0,-10000.0,-50000.0)
            val layerColors=listOf(
                Color(0xFF9B8B6A),Color(0xFFB08B63),Color(0xFF8F7863),Color(0xFF777B79),
                Color(0xFF666C72),Color(0xFF535C66),Color(0xFF424D59),Color(0xFF343F4C)
            )
            val patchExtent=(viewRangeMeters*2.0).coerceIn(20.0,100000.0)
            val surfaces=layerY.mapIndexedNotNull{index,y->
                val centre=projection(NativeLabVector(focus.x,y,focus.z),size.width,size.height,focalLength)
                if(!centre.visible||abs(y-focus.y)>cameraDistance*2+patchExtent)null
                else{
                    val corners=listOf(
                        NativeLabVector(focus.x-patchExtent,y,focus.z-patchExtent),
                        NativeLabVector(focus.x+patchExtent,y,focus.z-patchExtent),
                        NativeLabVector(focus.x+patchExtent,y,focus.z+patchExtent),
                        NativeLabVector(focus.x-patchExtent,y,focus.z+patchExtent)
                    ).map{projection(it,size.width,size.height,focalLength)}
                    Triple(corners,layerColors[index],centre.depth)
                }
            }.sortedByDescending{it.third}
            surfaces.forEach{(corners,layerColor,_)->
                if(corners.all{it.visible}){
                    val path=Path().apply{
                        corners.forEachIndexed{i,p->if(i==0)moveTo(p.x,p.y) else lineTo(p.x,p.y)}
                        close()
                    }
                    drawPath(path,layerColor.copy(alpha=0.16f))
                    drawPath(path,layerColor.copy(alpha=0.32f),style=Stroke(0.8f))
                }
            }
        }
        val observerMarker=projection(focus,size.width,size.height,focalLength)
        if(false&&observerMarker.visible){
            drawCircle(Color(0xFFFFD166),5f,Offset(observerMarker.x,observerMarker.y))
            drawCircle(Color.White,8f,Offset(observerMarker.x,observerMarker.y),style=Stroke(1f))
        }
        val ordered=project.entities.filter{solid->NativeWorldLabInspection.visible(project,selectedId,inspection,solid.id)}
            .map{solid->val at=NativeWorldLabInspection.renderPosition(project,selectedId,inspection,solid.id)
                solid to (at to projection(at,size.width,size.height,focalLength))}
            .filter{it.second.second.visible}.sortedByDescending{it.second.second.depth}
        for((solid,rendered) in ordered){
            val center=rendered.first
            val centerProjection=rendered.second
            val dimensions=solid.dimensionsMeters
            val color=runCatching{Color(android.graphics.Color.parseColor(solid.color))}.getOrDefault(Color(0xFFA4C9C6))
            val selected=solid.id==selectedId
            if(solid.shape=="sphere"){
                val p=centerProjection
                if(p.visible){
                    val radius=(dimensions.x.toFloat()*p.scale*0.5f).coerceIn(1f,100f)
                    if(inspection.mode==NativeInspectionMode.CUTAWAY&&cutOffset!=null&&solid.id in cutTargets){
                        // Tessellated world-space sphere surface; clip the actual triangles,
                        // then triangulate the generated section cap in the cut plane.
                        val latitudeSegments=8
                        val longitudeSegments=16
                        val localRadius=dimensions.x/2.0
                        fun spherePoint(phi:Double,theta:Double):NativeLabVector{
                            val local=NativeLabVector(localRadius*sin(phi)*cos(theta),
                                localRadius*cos(phi),localRadius*sin(phi)*sin(theta))
                            val rotated=labRotatePoint(local.x,local.y,local.z,solid.rotationRadians)
                            return NativeLabVector(center.x+rotated.x,center.y+rotated.y,center.z+rotated.z)
                        }
                        val rings=(1 until latitudeSegments).map{ring->
                            (0 until longitudeSegments).map{segment->
                                spherePoint(PI*ring/latitudeSegments,
                                    2*PI*segment/longitudeSegments)
                            }
                        }
                        val north=spherePoint(0.0,0.0)
                        val south=spherePoint(PI,0.0)
                        val faces=mutableListOf<List<NativeLabVector>>()
                        for(segment in 0 until longitudeSegments){
                            val next=(segment+1)%longitudeSegments
                            faces.add(listOf(north,rings[0][segment],rings[0][next]))
                            faces.add(listOf(rings.last()[segment],south,rings.last()[next]))
                        }
                        for(ring in 0 until rings.lastIndex){
                            for(segment in 0 until longitudeSegments){
                                val next=(segment+1)%longitudeSegments
                                val a=rings[ring][segment]
                                val b=rings[ring][next]
                                val c=rings[ring+1][next]
                                val d=rings[ring+1][segment]
                                faces.add(listOf(a,b,c));faces.add(listOf(a,c,d))
                            }
                        }
                        val cap=linkedMapOf<String,NativeLabVector>()
                        val sectionNormal=cutPlane?.normal?:NativeLabVector(1.0,0.0,0.0)
                        fun planeCoordinate(point:NativeLabVector)=point.x*sectionNormal.x+
                            point.y*sectionNormal.y+point.z*sectionNormal.z
                        val reference=if(kotlin.math.abs(sectionNormal.x)<0.9)
                            NativeLabVector(1.0,0.0,0.0) else NativeLabVector(0.0,1.0,0.0)
                        var basisUX=sectionNormal.y*reference.z-sectionNormal.z*reference.y
                        var basisUY=sectionNormal.z*reference.x-sectionNormal.x*reference.z
                        var basisUZ=sectionNormal.x*reference.y-sectionNormal.y*reference.x
                        val basisNorm=sqrt(basisUX*basisUX+basisUY*basisUY+basisUZ*basisUZ).coerceAtLeast(1e-12)
                        basisUX/=basisNorm;basisUY/=basisNorm;basisUZ/=basisNorm
                        val basisVX=sectionNormal.y*basisUZ-sectionNormal.z*basisUY
                        val basisVY=sectionNormal.z*basisUX-sectionNormal.x*basisUZ
                        val basisVZ=sectionNormal.x*basisUY-sectionNormal.y*basisUX
                        for(face in faces){
                            val clipped=clip(face,solid.id)
                            clipped.forEach{point->
                                if(kotlin.math.abs(planeCoordinate(point)-cutOffset)<1e-6){
                                    val key=listOf(point.x,point.y,point.z).joinToString(":"){
                                        kotlin.math.round(it*1e6).toLong().toString()
                                    }
                                    if(!cap.containsKey(key))cap[key]=point
                                }
                            }
                            val projected=clipped.map{projection(it,size.width,size.height,focalLength)}
                            if(projected.size>=3&&projected.all{it.visible}){
                                val path=Path().apply{
                                    projected.forEachIndexed{i,point->
                                        if(i==0)moveTo(point.x,point.y) else lineTo(point.x,point.y)
                                    };close()
                                }
                                drawPath(path,color.copy(alpha=alpha(solid.id)))
                                if(isXrayTarget(solid.id)||selected)
                                    drawPath(path,Color.White.copy(alpha=0.8f),style=Stroke(1f))
                            }
                        }
                        if(cap.size>=3){
                            val section=cap.values.toList()
                            val centre=NativeLabVector(section.sumOf{it.x}/section.size,
                                section.sumOf{it.y}/section.size,section.sumOf{it.z}/section.size)
                            fun planeAngle(point:NativeLabVector):Double{
                                val rx=point.x-centre.x;val ry=point.y-centre.y;val rz=point.z-centre.z
                                val u=rx*basisUX+ry*basisUY+rz*basisUZ
                                val v=rx*basisVX+ry*basisVY+rz*basisVZ
                                return atan2(v,u)
                            }
                            val orderedCap=section.sortedBy(::planeAngle)
                            val projectedCap=orderedCap.map{projection(it,size.width,size.height,focalLength)}
                            if(projectedCap.all{it.visible}){
                                val path=Path().apply{
                                    projectedCap.forEachIndexed{i,point->
                                        if(i==0)moveTo(point.x,point.y) else lineTo(point.x,point.y)
                                    };close()
                                }
                                drawPath(path,color.copy(alpha=0.78f))
                                drawPath(path,Color.White.copy(alpha=0.9f),style=Stroke(1.5f))
                            }
                        }
                    }else{
                        drawCircle(color.copy(alpha=alpha(solid.id)),radius,Offset(p.x,p.y))
                        drawCircle(if(selected||isXrayTarget(solid.id))Color.White else color.copy(alpha=0.65f),
                            radius,Offset(p.x,p.y),style=Stroke(if(selected||isXrayTarget(solid.id))2.5f else 1.2f))
                        drawArc(Color.White.copy(alpha=0.25f),200f,135f,false,
                            topLeft=Offset(p.x-radius*0.72f,p.y-radius*0.72f),
                            size=androidx.compose.ui.geometry.Size(radius*1.44f,radius*1.44f),
                            style=Stroke(1f))
                    }
                }
            }else if(solid.shape=="cylinder"){
                val segments=24
                val topRing=(0 until segments).map{index->
                    val angle=2*PI*index/segments
                    val local=labRotatePoint(cos(angle)*dimensions.x/2,dimensions.y/2,
                        sin(angle)*dimensions.z/2,solid.rotationRadians)
                    NativeLabVector(center.x+local.x,center.y+local.y,center.z+local.z)
                }
                val bottomRing=(0 until segments).map{index->
                    val angle=2*PI*index/segments
                    val local=labRotatePoint(cos(angle)*dimensions.x/2,-dimensions.y/2,
                        sin(angle)*dimensions.z/2,solid.rotationRadians)
                    NativeLabVector(center.x+local.x,center.y+local.y,center.z+local.z)
                }
                fun drawCylinderPolygon(vertices:List<NativeLabVector>,fill:Color,outline:Boolean=false){
                    val projected=clip(vertices,solid.id).map{projection(it,size.width,size.height,focalLength)}
                    if(projected.size>=3&&projected.all{it.visible}){
                        val path=Path().apply{projected.forEachIndexed{i,point->if(i==0)moveTo(point.x,point.y) else lineTo(point.x,point.y)};close()}
                        drawPath(path,fill.copy(alpha=if(isXrayTarget(solid.id))minOf(0.2f,inspection.opacity) else fill.alpha*alpha(solid.id)))
                        if(selected&&outline||isXrayTarget(solid.id))drawPath(path,Color.White.copy(alpha=0.85f),style=Stroke(2f))
                    }
                }
                val sideFaces=(0 until segments).map{index->
                    val next=(index+1)%segments
                    listOf(bottomRing[index],bottomRing[next],topRing[next],topRing[index])
                }.sortedByDescending{face->face.map{projection(it,size.width,size.height,focalLength).depth}.average()}
                sideFaces.forEachIndexed{index,face->
                    drawCylinderPolygon(face,color.copy(alpha=0.66f+(index%3)*0.07f),true)
                }
                drawCylinderPolygon(bottomRing,color,selected)
                drawCylinderPolygon(topRing,color,selected)
            }else{
                val hx=dimensions.x/2;val hy=dimensions.y/2;val hz=dimensions.z/2
                val raw=listOf(
                    listOf(-hx,-hy,-hz),listOf(hx,-hy,-hz),listOf(hx,hy,-hz),listOf(-hx,hy,-hz),
                    listOf(-hx,-hy,hz),listOf(hx,-hy,hz),listOf(hx,hy,hz),listOf(-hx,hy,hz))
                val points=raw.map{local->
                    val rotated=labRotatePoint(local[0],local[1],local[2],solid.rotationRadians)
                    NativeLabVector(center.x+rotated.x,center.y+rotated.y,center.z+rotated.z)
                }
                val faces=listOf(
                    listOf(0,1,2,3),listOf(4,7,6,5),
                    listOf(0,4,5,1),listOf(3,2,6,7),
                    listOf(0,3,7,4),listOf(1,5,6,2)
                ).mapIndexed{index,ids->ids.map{points[it]}.let{it to index}}
                    .sortedByDescending{(vertices,_)->vertices.map{projection(it,size.width,size.height,focalLength).depth}.average()}
                faces.forEach{(vertices,face)->
                    val projected=clip(vertices,solid.id).map{projection(it,size.width,size.height,focalLength)}
                    if(projected.size>=3&&projected.all{it.visible}){
                        val path=Path().apply{projected.forEachIndexed{i,p->if(i==0)moveTo(p.x,p.y) else lineTo(p.x,p.y)};close()}
                        val faceAlpha=when(face%3){0->0.62f;1->0.82f;else->0.72f}
                        drawPath(path,color.copy(alpha=if(isXrayTarget(solid.id))minOf(0.2f,inspection.opacity) else faceAlpha*alpha(solid.id)))
                        if(selected||isXrayTarget(solid.id))drawPath(path,Color.White.copy(alpha=0.85f),style=Stroke(2f))
                    }
                }
            }
        }
    }
}

/** Inspection, Earth reference and accessible camera controls for the observer view. */
@Composable
fun NativeWorldLabViewportControls(
    project:NativeWorldLabProject,selectedId:String?,
    view:NativeWorldLabViewState,
    onSaveView:(List<Double>,List<Double>)->Unit,
    onResetView:()->Unit,
    onSaveGeodeticOrigin:(NativeGeodetic)->Unit,
    onClearGeodeticOrigin:()->Unit,
    inspection:NativeInspectionSettings=NativeInspectionSettings(),
    onInspectionChange:(NativeInspectionSettings)->Unit={},
    canUndoInspectionView:Boolean=false,canRedoInspectionView:Boolean=false,
    onUndoInspectionView:()->Unit={},onRedoInspectionView:()->Unit={},
){
    val screenDensity=LocalDensity.current.density
    val selectedEntity=project.entities.firstOrNull{it.id==selectedId}
    val cutPlane=NativeWorldLabInspection.plane(project,selectedId,inspection)
    val cutOffset=cutPlane?.offset
    val cutTargets=NativeWorldLabInspection.targetIds(project,selectedId)
    fun clip(vertices:List<NativeLabVector>,entityId:String)=if(cutPlane==null||entityId !in cutTargets)vertices else NativeWorldLabInspection.clipPolygon(vertices,cutPlane)
    fun isInspectionTarget(entityId:String)=entityId in cutTargets
    fun alpha(entityId:String):Float{
        if(!isInspectionTarget(entityId))return 0.86f
        return when(inspection.mode){
            NativeInspectionMode.NORMAL,NativeInspectionMode.ISOLATE,NativeInspectionMode.EXPLODED->0.86f
            NativeInspectionMode.TRANSPARENT,NativeInspectionMode.CUTAWAY->inspection.opacity
            NativeInspectionMode.XRAY->minOf(0.22f,inspection.opacity)
        }
    }
    fun isXrayTarget(entityId:String)=inspection.mode==NativeInspectionMode.XRAY&&isInspectionTarget(entityId)
    val eye=NativeLabVector(view.eyeX,(view.eyeY+view.observerDepthMeters).coerceIn(-20000.0,100000.0),view.eyeZ)
    val viewRangeMeters=(45.0*8.0/view.zoom.toDouble()).coerceIn(0.5,100000.0)
    val elevationRadians=Math.toRadians(view.elevation.toDouble())
    val cameraDistance=(viewRangeMeters/cos(elevationRadians).coerceAtLeast(0.08)).coerceIn(0.5,100000.0)
    val focus=NativeLabVector(
        eye.x+sin(view.yaw.toDouble())*cos(elevationRadians)*cameraDistance,
        eye.y-sin(elevationRadians)*cameraDistance,
        eye.z+cos(view.yaw.toDouble())*cos(elevationRadians)*cameraDistance)
    fun projection(point:NativeLabVector,width:Float,height:Float,focalLength:Float)=
        labPerspectivePoint(point,focus,view.yaw,cameraDistance,focalLength,view.pan,width,height,view.elevation)
    var latitude by remember(project.id,project.revision){mutableStateOf(project.geodeticOrigin?.latitudeDegrees?.toString() ?: "0")}
    var longitude by remember(project.id,project.revision){mutableStateOf(project.geodeticOrigin?.longitudeDegrees?.toString() ?: "0")}
    var height by remember(project.id,project.revision){mutableStateOf(project.geodeticOrigin?.heightMeters?.toString() ?: "0")}
    if(view.toggles.showViewportOverlays)LabNote("Drag to move · pinch to zoom · twist to orbit · tap a part to select. "+
        "The local world uses perspective depth; y=0 is the authored surface reference and underground bands are schematic, not surveyed geology.")
    Text("See Inside and inspect",style=MaterialTheme.typography.titleSmall)
    Row(horizontalArrangement=Arrangement.spacedBy(6.dp),verticalAlignment=Alignment.CenterVertically){
        OutlinedButton(onClick={
            selectedEntity?.let{solid->
                val target=solid.positionMeters
                val distance=(cameraDistance*0.45).coerceIn(0.5,100000.0)
                val angle=Math.toRadians(view.elevation.toDouble())
                val horizontalDistance=distance*cos(angle)
                val position=listOf(
                    target.x-sin(view.yaw.toDouble())*horizontalDistance,
                    target.y+distance*sin(angle),
                    target.z-cos(view.yaw.toDouble())*horizontalDistance
                )
                onSaveView(position,listOf(target.x,target.y,target.z))
                view.observerDepthMeters=0f;view.pan=Offset.Zero
                view.zoom=(45.0*8.0/distance).toFloat().coerceIn(0.1f,160f)
            }
        },enabled=selectedEntity!=null){Text("Zoom to selected")}
        OutlinedButton(onClick={view.toggles.showLabels=!view.toggles.showLabels}){Text(if(view.toggles.showLabels)"Hide labels" else "Show labels")}
        OutlinedButton(onClick={view.toggles.showViewportOverlays=!view.toggles.showViewportOverlays}){
            Text(if(view.toggles.showViewportOverlays)"Hide overlays" else "Show overlays")
        }
        OutlinedButton(onClick=onUndoInspectionView,enabled=canUndoInspectionView){Text("Undo view")}
        OutlinedButton(onClick=onRedoInspectionView,enabled=canRedoInspectionView){Text("Redo view")}
        OutlinedButton(onClick={
            onInspectionChange(NativeInspectionSettings())
            view.toggles.showLabels=true;view.toggles.showViewportOverlays=true
        }){Text("Reset")}
    }
    if(selectedEntity!=null&&view.toggles.showLabels&&view.toggles.showViewportOverlays){
        Text("Selected: "+selectedEntity.name+" · "+selectedEntity.shape,
            style=MaterialTheme.typography.bodySmall,
            modifier=Modifier.semantics{contentDescription="Selected object label"})
    }

    LabNote("Display-only views never alter material properties or scientific results.")
    Row(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        listOf(NativeInspectionMode.NORMAL,NativeInspectionMode.TRANSPARENT,NativeInspectionMode.XRAY).forEach{item->
            OutlinedButton(onClick={onInspectionChange(inspection.copy(mode=item))}){Text(when(item){NativeInspectionMode.NORMAL->"Normal";NativeInspectionMode.TRANSPARENT->"Inside";else->"X-ray"})}
        }
    }
    Row(horizontalArrangement=Arrangement.spacedBy(4.dp)){
        listOf(NativeInspectionMode.CUTAWAY,NativeInspectionMode.ISOLATE,NativeInspectionMode.EXPLODED).forEach{item->
            OutlinedButton(onClick={onInspectionChange(inspection.copy(mode=item))}){Text(when(item){NativeInspectionMode.CUTAWAY->"Cutaway";NativeInspectionMode.ISOLATE->"Isolate";else->"Explode"})}
        }
    }
    if(inspection.mode==NativeInspectionMode.TRANSPARENT||inspection.mode==NativeInspectionMode.XRAY){
        Text("Inspection opacity "+(inspection.opacity*100).toInt()+"%")
        Slider(value=inspection.opacity,onValueChange={onInspectionChange(inspection.copy(opacity=it))},valueRange=0.05f..1f)
    }
    if(inspection.mode==NativeInspectionMode.CUTAWAY){
        Row(horizontalArrangement=Arrangement.spacedBy(4.dp)){NativeInspectionAxis.values().forEach{axis->
            val normal=when(axis){NativeInspectionAxis.X->NativeLabVector(1.0,0.0,0.0);NativeInspectionAxis.Y->NativeLabVector(0.0,1.0,0.0);NativeInspectionAxis.Z->NativeLabVector(0.0,0.0,1.0)}
            OutlinedButton(onClick={onInspectionChange(inspection.copy(axis=axis,normal=normal))}){Text(axis.name)}
        }}
        Text("Cut plane normal X · Y · Z")
        listOf("X" to inspection.normal.x,"Y" to inspection.normal.y,"Z" to inspection.normal.z).forEach{(axis,value)->
            Text("$axis · "+String.format(java.util.Locale.US,"%.2f",value))
            Slider(value=value.toFloat(),onValueChange={next->
                val normal=when(axis){
                    "X"->inspection.normal.copy(x=next.toDouble())
                    "Y"->inspection.normal.copy(y=next.toDouble())
                    else->inspection.normal.copy(z=next.toDouble())
                }
                if(sqrt(normal.x*normal.x+normal.y*normal.y+normal.z*normal.z)>1e-9)
                    onInspectionChange(inspection.copy(normal=normal))
            },valueRange=-1f..1f)
        }
        Text("Cut plane position "+inspection.cutawayFraction)
        Slider(value=inspection.cutawayFraction,onValueChange={onInspectionChange(inspection.copy(cutawayFraction=it))},valueRange=-1f..1f)
        Text("Box, sphere and cylinder surfaces are clipped in world coordinates and receive a generated section face.")
    }
    if(inspection.mode==NativeInspectionMode.EXPLODED){
        Text("Assembly separation "+String.format(java.util.Locale.US,"%.1f",inspection.explosionDistanceMeters)+" m")
        Slider(value=inspection.explosionDistanceMeters.toFloat(),onValueChange={onInspectionChange(inspection.copy(explosionDistanceMeters=it.toDouble()))},valueRange=0f..10f)
    }
    if(inspection.mode==NativeInspectionMode.ISOLATE&&NativeWorldLabInspection.targetIds(project,selectedId).isEmpty())
        Text("Select a part first; no geometry is hidden without a valid selection.")
    Text("Earth reference (WGS84)",style=MaterialTheme.typography.titleSmall)
    LabNote("A mathematical geodetic origin for the local ENU model. This does not fetch terrain, imagery or device location.")
    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
        OutlinedTextField(value=latitude,onValueChange={latitude=it},label={Text("Latitude °")},singleLine=true,modifier=Modifier.weight(1f))
        OutlinedTextField(value=longitude,onValueChange={longitude=it},label={Text("Longitude °")},singleLine=true,modifier=Modifier.weight(1f))
        OutlinedTextField(value=height,onValueChange={height=it},label={Text("Height m")},singleLine=true,modifier=Modifier.weight(1f))
    }
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={
            runCatching{
                val g=NativeGeodetic(latitude.toDouble(),longitude.toDouble(),height.toDouble())
                NativeWorldLabGeodesy.toEcef(g);onSaveGeodeticOrigin(g)
            }
        }){Text("Save Earth reference")}
        OutlinedButton(onClick=onClearGeodeticOrigin){Text("Clear reference")}
    }
    project.geodeticOrigin?.let{origin->
        runCatching{
            val ecef=NativeWorldLabGeodesy.toEcef(origin)
            Text("WGS84 ECEF origin: "+listOf(ecef.xMeters,ecef.yMeters,ecef.zMeters)
                .joinToString(" / "){String.format(java.util.Locale.US,"%.3f",it)}+" m")
            project.entities.firstOrNull{it.id==selectedId}?.let{solid->
                val point=NativeWorldLabGeodesy.fromEnu(
                    NativeEnu(solid.positionMeters.x,solid.positionMeters.z,solid.positionMeters.y),origin)
                val geo=NativeWorldLabGeodesy.fromEcef(point)
                Text("Selected part: "+String.format(java.util.Locale.US,"%.7f° / %.7f° / %.2f m",
                    geo.latitudeDegrees,geo.longitudeDegrees,geo.heightMeters))
            }
        }.onFailure{}
    }
    Text("View scale: "+String.format(java.util.Locale.US,"%.2f",viewRangeMeters)+" m · "+
        (if(view.observerDepthMeters<0)"below" else if(view.observerDepthMeters>0)"above" else "at")+
        " saved target by "+String.format(java.util.Locale.US,"%.1f",abs(view.observerDepthMeters))+" m",
        style=MaterialTheme.typography.bodySmall)
    Text("Perspective observer · "+String.format(java.util.Locale.US,"%.2f",cameraDistance)+" m from focus · "+
        "visible far range is clipped at 50,000 km",style=MaterialTheme.typography.bodySmall)
    Text("Accessible camera controls · arrow keys orbit and tilt · Page Up/Down move vertically")
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={view.yaw+=0.18f}){Text("Look left")}
        OutlinedButton(onClick={view.yaw-=0.18f}){Text("Look right")}
    }
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={view.pan+=Offset(48f,0f)}){Text("Pan right")}
        OutlinedButton(onClick={view.pan-=Offset(48f,0f)}){Text("Pan left")}
    }
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={view.elevation=(view.elevation+5f).coerceAtMost(80f)}){Text("Look up")}
        OutlinedButton(onClick={view.elevation=(view.elevation-5f).coerceAtLeast(5f)}){Text("Look down")}
    }
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={
            val step=(0.8*sqrt(viewRangeMeters/8.0)).coerceIn(0.08,2000.0).toFloat()
            view.observerDepthMeters=(view.observerDepthMeters-step).coerceAtLeast(-20000f)
        }){Text("Move down")}
        OutlinedButton(onClick={
            val step=(0.8*sqrt(viewRangeMeters/8.0)).coerceIn(0.08,2000.0).toFloat()
            view.observerDepthMeters=(view.observerDepthMeters+step).coerceAtMost(20000f)
        }){Text("Move up")}
    }
    Text("Observer elevation: "+view.elevation.toInt()+"°")
    Slider(value=view.elevation,onValueChange={view.elevation=it},valueRange=-85f..85f,
        modifier=Modifier.semantics{contentDescription="Observer camera elevation angle"})
    Text("Vertical observer offset: "+String.format(java.util.Locale.US,"%.1f",view.observerDepthMeters)+
        " m below the local y=0 surface · schematic layers only")
    Slider(value=view.observerDepthMeters,onValueChange={view.observerDepthMeters=it},
        valueRange=-20000f..20000f,
        modifier=Modifier.semantics{contentDescription="Observer vertical offset from saved target"})
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={view.zoom=(view.zoom*1.25f).coerceAtMost(160f)}){Text("Zoom in")}
        OutlinedButton(onClick={view.zoom=(view.zoom/1.25f).coerceAtLeast(0.1f)}){Text("Zoom out")}
        OutlinedButton(onClick={
            onSaveView(listOf(eye.x,eye.y,eye.z),listOf(focus.x,focus.y,focus.z))
            view.eyeY=eye.y;view.observerDepthMeters=0f
        }){Text("Save viewpoint")}
        OutlinedButton(onClick={
            val saved=project.cameraPositionMeters
            val target=project.cameraLookingAtMeters
            val pose=NativeWorldLabCamera.poseFromPosition(saved,target)
            val h=(pose.distanceMeters*cos(Math.toRadians(pose.elevationDegrees))).coerceAtLeast(0.25)
            view.zoom=(45.0*8.0/h).toFloat().coerceIn(0.1f,160f)
            view.yaw=pose.yawRadians.toFloat()
            view.elevation=pose.elevationDegrees.toFloat().coerceIn(-85f,85f)
            view.eyeX=saved.x;view.eyeY=saved.y;view.eyeZ=saved.z
            view.observerDepthMeters=0f;view.pan=Offset.Zero
        }){Text("Restore saved view")}
        OutlinedButton(onClick={
            view.observerDepthMeters=0f;view.elevation=30f;view.pan=Offset.Zero
            onResetView()
        }){Text("Surface view")}
    }
}
