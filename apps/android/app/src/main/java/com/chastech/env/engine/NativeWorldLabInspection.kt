package com.chastech.env.engine
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
enum class NativeInspectionMode { NORMAL, TRANSPARENT, XRAY, CUTAWAY, ISOLATE, EXPLODED }
enum class NativeInspectionAxis { X, Y, Z }
data class NativeInspectionSettings(val mode:NativeInspectionMode=NativeInspectionMode.NORMAL,val opacity:Float=0.45f,val axis:NativeInspectionAxis=NativeInspectionAxis.X,val cutawayFraction:Float=0f,val explosionDistanceMeters:Double=1.0){
 init{require(opacity.isFinite()&&opacity in 0f..1f&&cutawayFraction.isFinite()&&cutawayFraction in -1f..1f&&explosionDistanceMeters.isFinite()&&explosionDistanceMeters in 0.0..10.0)}
}
object NativeWorldLabInspection{
 fun targetIds(project:NativeWorldLabProject,selectedId:String?):Set<String>{
  if(selectedId.isNullOrBlank()||project.entities.none{it.id==selectedId})return emptySet()
  return project.assemblies.firstOrNull{selectedId in it.entityIds}?.entityIds?.toSet()?:setOf(selectedId)
 }
 fun visible(project:NativeWorldLabProject,selectedId:String?,settings:NativeInspectionSettings,id:String):Boolean {val ids=targetIds(project,selectedId);return settings.mode!=NativeInspectionMode.ISOLATE||ids.isEmpty()||id in ids}
 fun renderPosition(project:NativeWorldLabProject,selectedId:String?,settings:NativeInspectionSettings,id:String):NativeLabVector{
  val solid=project.entities.firstOrNull{it.id==id}?:throw IllegalArgumentException("Inspection target is missing")
  val ids=targetIds(project,selectedId)
  if(settings.mode!=NativeInspectionMode.EXPLODED||id !in ids||settings.explosionDistanceMeters==0.0)return solid.positionMeters
  val parts=project.entities.filter{it.id in ids};if(parts.size<2)return solid.positionMeters
  val centre=NativeLabVector(parts.sumOf{it.positionMeters.x}/parts.size,parts.sumOf{it.positionMeters.y}/parts.size,parts.sumOf{it.positionMeters.z}/parts.size)
  var x=solid.positionMeters.x-centre.x;var y=solid.positionMeters.y-centre.y;var z=solid.positionMeters.z-centre.z
  var norm=sqrt(x*x+y*y+z*z)
  if(norm<1e-9){val index=ids.sorted().indexOf(id);val angle=2*PI*index/parts.size;x=cos(angle);y=0.0;z=sin(angle);norm=1.0}
  val d=settings.explosionDistanceMeters/norm
  return NativeLabVector(solid.positionMeters.x+x*d,solid.positionMeters.y+y*d,solid.positionMeters.z+z*d)
 }
 fun planeOffset(project:NativeWorldLabProject,selectedId:String?,settings:NativeInspectionSettings):Double?{
  if(settings.mode!=NativeInspectionMode.CUTAWAY)return null
  val solid=project.entities.firstOrNull{it.id==selectedId}?:return null
  val centre=when(settings.axis){NativeInspectionAxis.X->solid.positionMeters.x;NativeInspectionAxis.Y->solid.positionMeters.y;NativeInspectionAxis.Z->solid.positionMeters.z}
  val half=when(settings.axis){NativeInspectionAxis.X->solid.dimensionsMeters.x;NativeInspectionAxis.Y->solid.dimensionsMeters.y;NativeInspectionAxis.Z->solid.dimensionsMeters.z}/2.0
  return centre+half*settings.cutawayFraction
 }
 fun clipPolygon(vertices:List<NativeLabVector>,axis:NativeInspectionAxis,offset:Double):List<NativeLabVector>{
  if(vertices.size<3)return emptyList()
  fun coordinate(v:NativeLabVector)=when(axis){NativeInspectionAxis.X->v.x;NativeInspectionAxis.Y->v.y;NativeInspectionAxis.Z->v.z}
  fun blend(a:NativeLabVector,b:NativeLabVector,t:Double)=NativeLabVector(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t)
  val result=mutableListOf<NativeLabVector>()
  for(i in vertices.indices){val current=vertices[i];val previous=vertices[(i+vertices.size-1)%vertices.size];val dc=coordinate(current)-offset;val dp=coordinate(previous)-offset;val ci=dc>=-1e-10;val pi=dp>=-1e-10
   if(ci!=pi){val den=dp-dc;if(kotlin.math.abs(den)>1e-14)result.add(blend(previous,current,(dp/den).coerceIn(0.0,1.0)))}
   if(ci)result.add(current)
  }
  return result
 }
}
