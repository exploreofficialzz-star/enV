package com.chastech.env

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.foundation.focusable
import android.view.KeyEvent as AndroidKeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.geometry.Offset
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

/**
 * Native perspective observer viewport. The local ground and subsurface bands are
 * explicitly schematic; they are not terrain, geology, or a surveyed Earth dataset.
 */
@Composable
fun NativeWorldLabViewport(
    project:NativeWorldLabProject,selectedId:String?,
    onSelect:(String)->Unit,
    onSaveView:(List<Double>,List<Double>)->Unit,
    onResetView:()->Unit,
    onSaveGeodeticOrigin:(NativeGeodetic)->Unit,
    onClearGeodeticOrigin:()->Unit,
){
    val screenDensity=LocalDensity.current.density
    val cameraDeltaX=project.cameraPositionMeters.x-project.cameraLookingAtMeters.x
    val cameraDeltaY=project.cameraPositionMeters.y-project.cameraLookingAtMeters.y
    val cameraDeltaZ=project.cameraPositionMeters.z-project.cameraLookingAtMeters.z
    val horizontal=hypot(cameraDeltaX,cameraDeltaZ).coerceAtLeast(0.25)
    var zoom by remember(project.id,project.revision){
        mutableFloatStateOf((45.0*8.0/horizontal).toFloat().coerceIn(0.1f,160f))
    }
    var yaw by remember(project.id,project.revision){
        mutableFloatStateOf(atan2(cameraDeltaX,-cameraDeltaZ).toFloat())
    }
    var elevation by remember(project.id,project.revision){
        mutableFloatStateOf(Math.toDegrees(atan2(cameraDeltaY,horizontal)).toFloat().coerceIn(-85f,85f))
    }
    var observerDepthMeters by remember(project.id,project.revision){mutableFloatStateOf(0f)}
    var pan by remember(project.id,project.revision){mutableStateOf(Offset.Zero)}
    val focus=NativeLabVector(project.cameraLookingAtMeters.x,
        (project.cameraLookingAtMeters.y+observerDepthMeters).coerceIn(-20000.0,100000.0),
        project.cameraLookingAtMeters.z)
    val viewRangeMeters=(45.0*8.0/zoom.toDouble()).coerceIn(0.5,100000.0)
    val elevationRadians=Math.toRadians(elevation.toDouble())
    val cameraDistance=(viewRangeMeters/cos(elevationRadians).coerceAtLeast(0.08)).coerceIn(0.5,100000.0)
    var latitude by remember(project.id,project.revision){mutableStateOf(project.geodeticOrigin?.latitudeDegrees?.toString() ?: "0")}
    var longitude by remember(project.id,project.revision){mutableStateOf(project.geodeticOrigin?.longitudeDegrees?.toString() ?: "0")}
    var height by remember(project.id,project.revision){mutableStateOf(project.geodeticOrigin?.heightMeters?.toString() ?: "0")}
    fun projection(point:NativeLabVector,width:Float,height:Float,focalLength:Float)=
        labPerspectivePoint(point,focus,yaw,cameraDistance,focalLength,pan,width,height,elevation)
    Text("Explore your invention",style=MaterialTheme.typography.titleSmall)
    Text("Drag to move · pinch to zoom · twist to orbit · tap a part to select. "+
        "The local world uses perspective depth; y=0 is the authored surface reference and underground bands are schematic, not surveyed geology.",
        style=MaterialTheme.typography.bodySmall)
    Canvas(
        Modifier.fillMaxWidth().height(250.dp)
            .background(Color(0xFF15232E),RoundedCornerShape(12.dp))
            .pointerInput(project.id,project.revision){
                detectTransformGestures{_,panChange,zoomChange,rotationChange->
                    pan+=panChange
                    zoom=(zoom*zoomChange).coerceIn(0.1f,160f)
                    yaw=(yaw+rotationChange*(PI.toFloat()/180f)).let{((it+PI.toFloat())%(2*PI.toFloat())+2*PI.toFloat())%(2*PI.toFloat())-PI.toFloat()}
                }
            }
            .pointerInput(project.id,project.revision,zoom,yaw,pan){
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
                if(event.type!=KeyEventType.KeyDown)return@onPreviewKeyEvent false
                val step=(0.8*sqrt(viewRangeMeters/8.0)).coerceIn(0.08,2000.0).toFloat()
                when(event.nativeKeyEvent.keyCode){
                    AndroidKeyEvent.KEYCODE_DPAD_LEFT->{yaw+=0.12f;true}
                    AndroidKeyEvent.KEYCODE_DPAD_RIGHT->{yaw-=0.12f;true}
                    AndroidKeyEvent.KEYCODE_DPAD_UP->{elevation=(elevation+4f).coerceAtMost(85f);true}
                    AndroidKeyEvent.KEYCODE_DPAD_DOWN->{elevation=(elevation-4f).coerceAtLeast(-85f);true}
                    AndroidKeyEvent.KEYCODE_PAGE_DOWN->{observerDepthMeters=(observerDepthMeters-step).coerceAtLeast(-20000f);true}
                    AndroidKeyEvent.KEYCODE_PAGE_UP->{observerDepthMeters=(observerDepthMeters+step).coerceAtMost(20000f);true}
                    else->false
                }
            }
    ){
        val focalLength=360f*density
        // Ground grid follows the saved target and adapts to the current visible range.
        val unit=when{
            zoom>80->0.25;zoom>35->0.5;zoom>12->2.0;zoom>6->10.0
            zoom>2->50.0;zoom>0.7->100.0;zoom>0.25->500.0;else->1000.0
        }
        val extent=12
        for(i in -extent..extent){
            val a=NativeLabVector(focus.x+i*unit,0.0,focus.z-extent*unit)
            val b=NativeLabVector(focus.x+i*unit,0.0,focus.z+extent*unit)
            val pa=projection(a,size.width,size.height,focalLength);val pb=projection(b,size.width,size.height,focalLength)
            if(pa.visible&&pb.visible)drawLine(Color(0xFF3E5968),Offset(pa.x,pa.y),Offset(pb.x,pb.y),strokeWidth=1f)
            val c=NativeLabVector(focus.x-extent*unit,0.0,focus.z+i*unit)
            val d=NativeLabVector(focus.x+extent*unit,0.0,focus.z+i*unit)
            val pc=projection(c,size.width,size.height,focalLength);val pd=projection(d,size.width,size.height,focalLength)
            if(pc.visible&&pd.visible)drawLine(Color(0xFF3E5968),Offset(pc.x,pc.y),Offset(pd.x,pd.y),strokeWidth=1f)
        }
        // A local y=0 reference surface and horizontal subsurface bands are schematic only.
        if(focus.y < 0.0){
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
        if(observerMarker.visible){
            drawCircle(Color(0xFFFFD166),5f,Offset(observerMarker.x,observerMarker.y))
            drawCircle(Color.White,8f,Offset(observerMarker.x,observerMarker.y),style=Stroke(1f))
        }
        val ordered=project.entities.map{solid->solid to projection(solid.positionMeters,size.width,size.height,focalLength)}
            .filter{it.second.visible}.sortedByDescending{it.second.depth}
        for((solid,centerProjection) in ordered){
            val dimensions=solid.dimensionsMeters
            val center=solid.positionMeters
            val color=runCatching{Color(android.graphics.Color.parseColor(solid.color))}.getOrDefault(Color(0xFFA4C9C6))
            val selected=solid.id==selectedId
            if(solid.shape=="sphere"){
                val p=centerProjection
                if(p.visible){
                    val radius=(dimensions.x.toFloat()*p.scale*0.5f).coerceIn(1f,100f)
                    drawCircle(color.copy(alpha=0.88f),radius,Offset(p.x,p.y))
                    drawCircle(if(selected)Color.White else color.copy(alpha=0.65f),
                        radius,Offset(p.x,p.y),style=Stroke(if(selected)3f else 1.2f))
                    drawArc(Color.White.copy(alpha=0.25f),200f,135f,false,
                        topLeft=Offset(p.x-radius*0.72f,p.y-radius*0.72f),
                        size=androidx.compose.ui.geometry.Size(radius*1.44f,radius*1.44f),
                        style=Stroke(1f))
                }
            }else if(solid.shape=="cylinder"){
                val segments=24
                val topRing=(0 until segments).map{index->
                    val angle=2*PI*index/segments
                    val local=labRotatePoint(cos(angle)*dimensions.x/2,dimensions.y/2,
                        sin(angle)*dimensions.z/2,solid.rotationRadians)
                    projection(NativeLabVector(center.x+local.x,center.y+local.y,center.z+local.z),
                        size.width,size.height,focalLength)
                }
                val bottomRing=(0 until segments).map{index->
                    val angle=2*PI*index/segments
                    val local=labRotatePoint(cos(angle)*dimensions.x/2,-dimensions.y/2,
                        sin(angle)*dimensions.z/2,solid.rotationRadians)
                    projection(NativeLabVector(center.x+local.x,center.y+local.y,center.z+local.z),
                        size.width,size.height,focalLength)
                }
                fun drawCylinderPolygon(vertices:List<LabScreenPoint>,fill:Color,outline:Boolean=false){
                    if(vertices.all{it.visible}){
                        val path=Path().apply{
                            vertices.forEachIndexed{i,point->if(i==0)moveTo(point.x,point.y) else lineTo(point.x,point.y)}
                            close()
                        }
                        drawPath(path,fill)
                        if(selected&&outline)drawPath(path,Color.White,style=Stroke(2.5f))
                    }
                }
                val sideFaces=(0 until segments).map{index->
                    val next=(index+1)%segments
                    listOf(bottomRing[index],bottomRing[next],topRing[next],topRing[index])
                }.sortedByDescending{face->face.map{it.depth}.average()}
                sideFaces.forEachIndexed{index,face->
                    drawCylinderPolygon(face,color.copy(alpha=0.66f+(index%3)*0.07f),true)
                }
                drawCylinderPolygon(bottomRing,color.copy(alpha=0.78f),selected)
                drawCylinderPolygon(topRing,color.copy(alpha=0.92f),selected)
            }else{
                val hx=dimensions.x/2;val hy=dimensions.y/2;val hz=dimensions.z/2
                val raw=listOf(
                    listOf(-hx,-hy,-hz),listOf(hx,-hy,-hz),listOf(hx,hy,-hz),listOf(-hx,hy,-hz),
                    listOf(-hx,-hy,hz),listOf(hx,-hy,hz),listOf(hx,hy,hz),listOf(-hx,hy,hz))
                val points=raw.map{local->
                    val rotated=labRotatePoint(local[0],local[1],local[2],solid.rotationRadians)
                    projection(NativeLabVector(center.x+rotated.x,center.y+rotated.y,center.z+rotated.z),size.width,size.height,focalLength)
                }
                val faces=listOf(
                    listOf(0,1,2,3),listOf(4,7,6,5),
                    listOf(0,4,5,1),listOf(3,2,6,7),
                    listOf(0,3,7,4),listOf(1,5,6,2)
                ).mapIndexed{index,ids->ids.map{points[it]}.let{it to index}}
                    .sortedByDescending{(vertices,_)->vertices.map{it.depth}.average()}
                faces.forEach{(vertices,face)->
                    if(vertices.all{it.visible}){
                        val path=Path().apply{
                            vertices.forEachIndexed{i,p->if(i==0)moveTo(p.x,p.y) else lineTo(p.x,p.y)}
                            close()
                        }
                        val alpha=when(face%3){0->0.62f;1->0.82f;else->0.72f}
                        drawPath(path,color.copy(alpha=alpha))
                        if(selected)drawPath(path,Color.White,style=Stroke(2.5f))
                    }
                }
            }
        }
    }
    Text("Earth reference (WGS84)",style=MaterialTheme.typography.titleSmall)
    Text("A mathematical geodetic origin for the local ENU model. This does not fetch terrain, imagery or device location.",
        style=MaterialTheme.typography.bodySmall)
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
        (if(observerDepthMeters<0)"below" else if(observerDepthMeters>0)"above" else "at")+
        " saved target by "+String.format(java.util.Locale.US,"%.1f",abs(observerDepthMeters))+" m",
        style=MaterialTheme.typography.bodySmall)
    Text("Perspective observer · "+String.format(java.util.Locale.US,"%.2f",cameraDistance)+" m from focus · "+
        "visible far range is clipped at 50,000 km",style=MaterialTheme.typography.bodySmall)
    Text("Accessible camera controls · arrow keys orbit and tilt · Page Up/Down move vertically")
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={yaw+=0.18f}){Text("Look left")}
        OutlinedButton(onClick={yaw-=0.18f}){Text("Look right")}
    }
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={pan+=Offset(48f,0f)}){Text("Pan right")}
        OutlinedButton(onClick={pan-=Offset(48f,0f)}){Text("Pan left")}
    }
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={elevation=(elevation+5f).coerceAtMost(80f)}){Text("Look up")}
        OutlinedButton(onClick={elevation=(elevation-5f).coerceAtLeast(5f)}){Text("Look down")}
    }
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={
            val step=(0.8*sqrt(viewRangeMeters/8.0)).coerceIn(0.08,2000.0).toFloat()
            observerDepthMeters=(observerDepthMeters-step).coerceAtLeast(-20000f)
        }){Text("Move down")}
        OutlinedButton(onClick={
            val step=(0.8*sqrt(viewRangeMeters/8.0)).coerceIn(0.08,2000.0).toFloat()
            observerDepthMeters=(observerDepthMeters+step).coerceAtMost(20000f)
        }){Text("Move up")}
    }
    Text("Observer elevation: "+elevation.toInt()+"°")
    Slider(value=elevation,onValueChange={elevation=it},valueRange=-85f..85f,
        modifier=Modifier.semantics{contentDescription="Observer camera elevation angle"})
    Text("Vertical observer offset: "+String.format(java.util.Locale.US,"%.1f",observerDepthMeters)+
        " m below the local y=0 surface · schematic layers only")
    Slider(value=observerDepthMeters,onValueChange={observerDepthMeters=it},
        valueRange=-20000f..20000f,
        modifier=Modifier.semantics{contentDescription="Observer vertical offset from saved target"})
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={zoom=(zoom*1.25f).coerceAtMost(160f)}){Text("Zoom in")}
        OutlinedButton(onClick={zoom=(zoom/1.25f).coerceAtLeast(0.1f)}){Text("Zoom out")}
        OutlinedButton(onClick={
            val distance=cameraDistance
            val angle=Math.toRadians(elevation.toDouble())
            val scale=(360.0*screenDensity/distance).coerceAtLeast(1e-6)
            val panRight=pan.x/scale
            val panUp=pan.y/scale
            val cy=cos(yaw.toDouble());val sy=sin(yaw.toDouble())
            val se=sin(angle);val ce=cos(angle)
            val targetX=focus.x-panRight*cy+panUp*sy*se
            val targetY=focus.y+panUp*ce
            val targetZ=focus.z+panRight*sy+panUp*cy*se
            val horizontalDistance=distance*ce
            val target=listOf(targetX,targetY,targetZ)
            val position=listOf(targetX-sy*horizontalDistance,
                targetY+distance*se,targetZ-cy*horizontalDistance)
            onSaveView(position,target)
            observerDepthMeters=0f
        }){Text("Save viewpoint")}
        OutlinedButton(onClick={
            val saved=project.cameraPositionMeters
            val target=project.cameraLookingAtMeters
            val dx=saved.x-target.x;val dz=saved.z-target.z
            val h=hypot(dx,dz).coerceAtLeast(0.25)
            zoom=(45.0*8.0/h).toFloat().coerceIn(0.1f,160f)
            yaw=atan2(-dx,-dz).toFloat()
            elevation=Math.toDegrees(atan2(saved.y-target.y,h)).toFloat().coerceIn(5f,80f)
            observerDepthMeters=0f;pan=Offset.Zero
        }){Text("Restore saved view")}
        OutlinedButton(onClick={
            observerDepthMeters=0f;elevation=30f;pan=Offset.Zero
            onResetView()
        }){Text("Surface view")}
    }
}
