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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.chastech.env.engine.NativeLabSolid
import com.chastech.env.engine.NativeGeodetic
import com.chastech.env.engine.NativeEnu
import com.chastech.env.engine.NativeWorldLabGeodesy
import com.chastech.env.engine.NativeLabVector
import com.chastech.env.engine.NativeWorldLabProject
import kotlin.math.*

private data class LabScreenPoint(val x:Float,val y:Float)
private fun labIsoPoint(
    point:NativeLabVector,focus:NativeLabVector,yaw:Float,zoom:Float,
    pan:Offset,width:Float,height:Float,elevationDegrees:Float=30f,
):LabScreenPoint{
    val dx=point.x-focus.x;val dy=point.y-focus.y;val dz=point.z-focus.z
    val angle=yaw.toDouble()
    val rightX=cos(angle);val rightZ=sin(angle)
    val forwardX=sin(angle);val forwardZ=-cos(angle)
    val horizontal=dx*rightX+dz*rightZ
    val depth=dx*forwardX+dz*forwardZ
    val elevation=Math.toRadians(elevationDegrees.toDouble().coerceIn(5.0,80.0))
    val vertical=dy*cos(elevation)-depth*sin(elevation)
    return LabScreenPoint(width/2f+pan.x+(horizontal*zoom).toFloat(),
        height/2f+pan.y-(vertical*zoom).toFloat())
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
    solid:NativeLabSolid,focus:NativeLabVector,yaw:Float,zoom:Float,
    pan:Offset,width:Float,height:Float,
)=labIsoPoint(solid.positionMeters,focus,yaw,zoom,pan,width,height)

/**
 * Native isometric observer viewport. The projection is an interaction/placement
 * aid, not a substitute for a physically rendered terrain or photogrammetric 3D map.
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
    val cameraDeltaX=project.cameraPositionMeters.x-project.cameraLookingAtMeters.x
    val cameraDeltaY=project.cameraPositionMeters.y-project.cameraLookingAtMeters.y
    val cameraDeltaZ=project.cameraPositionMeters.z-project.cameraLookingAtMeters.z
    val horizontal=hypot(cameraDeltaX,cameraDeltaZ).coerceAtLeast(0.25)
    var zoom by remember(project.id,project.revision){
        mutableFloatStateOf((45.0*8.0/horizontal).toFloat().coerceIn(0.1f,160f))
    }
    var yaw by remember(project.id,project.revision){
        mutableFloatStateOf(atan2(cameraDeltaX,-cameraDeltaZ))
    }
    var elevation by remember(project.id,project.revision){
        mutableFloatStateOf(Math.toDegrees(atan2(cameraDeltaY,horizontal)).toFloat().coerceIn(5f,80f))
    }
    var observerDepthMeters by remember(project.id,project.revision){mutableFloatStateOf(0f)}
    var pan by remember(project.id,project.revision){mutableStateOf(Offset.Zero)}
    val focus=NativeLabVector(project.cameraLookingAtMeters.x,
        (project.cameraLookingAtMeters.y+observerDepthMeters).coerceIn(-20000.0,100000.0),
        project.cameraLookingAtMeters.z)
    val viewRangeMeters=(45.0*8.0/zoom.toDouble()).coerceIn(0.5,100000.0)
    var latitude by remember(project.id,project.revision){mutableStateOf(project.geodeticOrigin?.latitudeDegrees?.toString() ?: "0")}
    var longitude by remember(project.id,project.revision){mutableStateOf(project.geodeticOrigin?.longitudeDegrees?.toString() ?: "0")}
    var height by remember(project.id,project.revision){mutableStateOf(project.geodeticOrigin?.heightMeters?.toString() ?: "0")}
    fun projection(point:NativeLabVector,width:Float,height:Float)=
        labIsoPoint(point,focus,yaw,zoom,pan,width,height,elevation)
    Text("Explore your invention",style=MaterialTheme.typography.titleSmall)
    Text("Drag to pan · pinch to zoom · twist to orbit · tap a part to select. "+
        "Use the observer controls below to change vertical view and elevation. The environment remains illustrative.",
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
                        val p=projection(e.positionMeters,size.width.toFloat(),size.height.toFloat())
                        e to hypot(p.x-touch.x,p.y-touch.y)
                    }.filter{it.second<44f}.minByOrNull{it.second}
                    hit?.first?.let{onSelect(it.id)}
                }
            }
            .semantics{contentDescription="Interactive isometric World Lab view with drag, pinch, orbit and part selection"}
    ){
        // Ground grid follows the saved observer target and adapts to zoom.
        val unit=when{
            zoom>80->0.25;zoom>35->0.5;zoom>12->2.0;zoom>6->10.0
            zoom>2->50.0;zoom>0.7->100.0;zoom>0.25->500.0;else->1000.0
        }
        val extent=12
        for(i in -extent..extent){
            val a=NativeLabVector(focus.x+i*unit,focus.y,focus.z-extent*unit)
            val b=NativeLabVector(focus.x+i*unit,focus.y,focus.z+extent*unit)
            val pa=projection(a,size.width,size.height);val pb=projection(b,size.width,size.height)
            drawLine(Color(0xFF3E5968),Offset(pa.x,pa.y),Offset(pb.x,pb.y),strokeWidth=1f)
            val c=NativeLabVector(focus.x-extent*unit,focus.y,focus.z+i*unit)
            val d=NativeLabVector(focus.x+extent*unit,focus.y,focus.z+i*unit)
            val pc=projection(c,size.width,size.height);val pd=projection(d,size.width,size.height)
            drawLine(Color(0xFF3E5968),Offset(pc.x,pc.y),Offset(pd.x,pd.y),strokeWidth=1f)
        }
        val ordered=project.entities.sortedBy{it.positionMeters.y+it.positionMeters.x+it.positionMeters.z}
        for(solid in ordered){
            val dimensions=solid.dimensionsMeters
            val center=solid.positionMeters
            val color=runCatching{Color(android.graphics.Color.parseColor(solid.color))}.getOrDefault(Color(0xFFA4C9C6))
            val selected=solid.id==selectedId
            if(solid.shape=="sphere"){
                val p=projection(center,size.width,size.height)
                val radius=(dimensions.x*zoom*0.5f).coerceIn(2f,100f)
                drawCircle(color.copy(alpha=0.88f),radius,Offset(p.x,p.y))
                drawCircle(if(selected)Color.White else color.copy(alpha=0.65f),
                    radius,Offset(p.x,p.y),style=Stroke(if(selected)3f else 1.2f))
                drawArc(Color.White.copy(alpha=0.25f),200f,135f,false,
                    topLeft=Offset(p.x-radius*0.72f,p.y-radius*0.72f),
                    size=androidx.compose.ui.geometry.Size(radius*1.44f,radius*1.44f),
                    style=Stroke(1f))
            }else if(solid.shape=="cylinder"){
                val p=projection(center,size.width,size.height)
                val radius=(dimensions.x*zoom*0.5f).coerceIn(2f,80f)
                val heightPx=(dimensions.y*zoom*cos(Math.toRadians(elevation.toDouble()))).toFloat().coerceIn(3f,160f)
                val left=p.x-radius;val top=p.y-heightPx/2
                drawRect(color.copy(alpha=0.72f),Offset(left,top),androidx.compose.ui.geometry.Size(radius*2,heightPx))
                drawOval(color,topLeft=Offset(left,top-radius*0.22f),
                    size=androidx.compose.ui.geometry.Size(radius*2,radius*0.44f))
                drawOval(if(selected)Color.White else color.copy(alpha=0.8f),
                    topLeft=Offset(left,p.y+heightPx/2-radius*0.22f),
                    size=androidx.compose.ui.geometry.Size(radius*2,radius*0.44f),
                    style=Stroke(if(selected)3f else 1f))
            }else{
                val hx=dimensions.x/2;val hy=dimensions.y/2;val hz=dimensions.z/2
                val raw=listOf(
                    listOf(-hx,-hy,-hz),listOf(hx,-hy,-hz),listOf(hx,hy,-hz),listOf(-hx,hy,-hz),
                    listOf(-hx,-hy,hz),listOf(hx,-hy,hz),listOf(hx,hy,hz),listOf(-hx,hy,hz))
                val points=raw.map{local->
                    val rotated=labRotatePoint(local[0],local[1],local[2],solid.rotationRadians)
                    projection(NativeLabVector(center.x+rotated.x,center.y+rotated.y,center.z+rotated.z),size.width,size.height)
                }
                val faces=listOf(listOf(0,1,2,3),listOf(1,5,6,2),listOf(3,2,6,7))
                faces.forEachIndexed{face,indices->
                    val path=Path().apply{
                        indices.forEachIndexed{i,index->
                            val p=points[index];if(i==0)moveTo(p.x,p.y) else lineTo(p.x,p.y)
                        };close()
                    }
                    drawPath(path,if(face==2)color else color.copy(alpha=if(face==0)0.6f else 0.78f))
                    if(selected)drawPath(path,Color.White,style=Stroke(2.5f))
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
    Text("Observer elevation: "+elevation.toInt()+"°")
    Slider(value=elevation,onValueChange={elevation=it},valueRange=5f..80f,
        modifier=Modifier.semantics{contentDescription="Observer camera elevation angle"})
    Text("Vertical observer offset: "+String.format(java.util.Locale.US,"%.1f",observerDepthMeters)+
        " m · illustrative volume, not mapped geology")
    Slider(value=observerDepthMeters,onValueChange={observerDepthMeters=it},
        valueRange=-20000f..20000f,
        modifier=Modifier.semantics{contentDescription="Observer vertical offset from saved target"})
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
        OutlinedButton(onClick={zoom=(zoom*1.25f).coerceAtMost(160f)}){Text("Zoom in")}
        OutlinedButton(onClick={zoom=(zoom/1.25f).coerceAtLeast(0.1f)}){Text("Zoom out")}
        OutlinedButton(onClick={
            val distance=(8.0*45.0/zoom).coerceIn(0.5,100000.0)
            val targetX=focus.x-pan.x/zoom*cos(yaw)
            val targetZ=focus.z-pan.x/zoom*sin(yaw)
            val targetY=focus.y+pan.y/zoom
            val angle=Math.toRadians(elevation.toDouble())
            val horizontalDistance=distance*cos(angle)
            val target=listOf(targetX,targetY,targetZ)
            val position=listOf(targetX+sin(yaw)*horizontalDistance,
                targetY+distance*sin(angle),targetZ-cos(yaw)*horizontalDistance)
            onSaveView(position,target)
            observerDepthMeters=0f
        }){Text("Save viewpoint")}
        OutlinedButton(onClick={
            val saved=project.cameraPositionMeters
            val target=project.cameraLookingAtMeters
            val dx=saved.x-target.x;val dz=saved.z-target.z
            val h=hypot(dx,dz).coerceAtLeast(0.25)
            zoom=(45.0*8.0/h).toFloat().coerceIn(0.1f,160f)
            yaw=atan2(dx,-dz)
            elevation=Math.toDegrees(atan2(saved.y-target.y,h)).toFloat().coerceIn(5f,80f)
            observerDepthMeters=0f;pan=Offset.Zero
        }){Text("Restore saved view")}
        OutlinedButton(onClick={
            observerDepthMeters=0f;elevation=30f;pan=Offset.Zero
            onResetView()
        }){Text("Surface view")}
    }
}
