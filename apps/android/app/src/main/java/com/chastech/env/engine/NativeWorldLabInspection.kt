package com.chastech.env.engine
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
enum class NativeInspectionMode { NORMAL, TRANSPARENT, XRAY, CUTAWAY, ISOLATE, EXPLODED }
enum class NativeInspectionAxis { X, Y, Z }
data class NativeInspectionSettings(val mode:NativeInspectionMode=NativeInspectionMode.NORMAL,val opacity:Float=0.45f,val axis:NativeInspectionAxis=NativeInspectionAxis.X,val normal:NativeLabVector=NativeLabVector(1.0,0.0,0.0),val cutawayFraction:Float=0f,val explosionDistanceMeters:Double=1.0){
 init{require(opacity.isFinite()&&opacity in 0f..1f&&cutawayFraction.isFinite()&&cutawayFraction in -1f..1f&&explosionDistanceMeters.isFinite()&&explosionDistanceMeters in 0.0..10.0&&normal.x.isFinite()&&normal.y.isFinite()&&normal.z.isFinite()&&kotlin.math.abs(normal.x)<=1.0&&kotlin.math.abs(normal.y)<=1.0&&kotlin.math.abs(normal.z)<=1.0&&sqrt(normal.x*normal.x+normal.y*normal.y+normal.z*normal.z)>1e-9)}
}
data class NativeInspectionPlane(val normal:NativeLabVector,val offset:Double)
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
 fun plane(project:NativeWorldLabProject,selectedId:String?,settings:NativeInspectionSettings):NativeInspectionPlane?{
  if(settings.mode!=NativeInspectionMode.CUTAWAY)return null
  val solid=project.entities.firstOrNull{it.id==selectedId}?:return null
  val source=settings.normal
  val length=sqrt(source.x*source.x+source.y*source.y+source.z*source.z)
  if(!length.isFinite()||length<1e-9)throw IllegalArgumentException("Cutaway normal must be a finite non-zero vector")
  val normal=NativeLabVector(source.x/length,source.y/length,source.z/length)
  val centre=solid.positionMeters
  val dimensions=solid.dimensionsMeters
  val centreProjection=normal.x*centre.x+normal.y*centre.y+normal.z*centre.z
  val projectedHalf= kotlin.math.abs(normal.x)*dimensions.x/2.0+
   kotlin.math.abs(normal.y)*dimensions.y/2.0+kotlin.math.abs(normal.z)*dimensions.z/2.0
  return NativeInspectionPlane(normal,centreProjection+projectedHalf*settings.cutawayFraction)
 }
 fun planeOffset(project:NativeWorldLabProject,selectedId:String?,settings:NativeInspectionSettings):Double?=
  plane(project,selectedId,settings)?.offset
 fun clipPolygon(vertices:List<NativeLabVector>,axis:NativeInspectionAxis,offset:Double):List<NativeLabVector>{
  val normal=when(axis){NativeInspectionAxis.X->NativeLabVector(1.0,0.0,0.0);NativeInspectionAxis.Y->NativeLabVector(0.0,1.0,0.0);NativeInspectionAxis.Z->NativeLabVector(0.0,0.0,1.0)}
  return clipPolygon(vertices,NativeInspectionPlane(normal,offset))
 }
 fun clipPolygon(vertices:List<NativeLabVector>,plane:NativeInspectionPlane):List<NativeLabVector>{
  if(vertices.size<3)return emptyList()
  val n=plane.normal
  fun distance(v:NativeLabVector)=v.x*n.x+v.y*n.y+v.z*n.z-plane.offset
  fun blend(a:NativeLabVector,b:NativeLabVector,t:Double)=NativeLabVector(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t)
  val result=mutableListOf<NativeLabVector>()
  for(i in vertices.indices){val current=vertices[i];val previous=vertices[(i+vertices.size-1)%vertices.size];val dc=distance(current);val dp=distance(previous);val ci=dc>=-1e-10;val pi=dp>=-1e-10
   if(ci!=pi){val den=dp-dc;if(kotlin.math.abs(den)>1e-14)result.add(blend(previous,current,(dp/den).coerceIn(0.0,1.0)))}
   if(ci)result.add(current)
  }
  return result
 }
}


/** View-only history; it never mutates the authored project or solver evidence. */
data class NativeWorldLabInspectionHistory(
 val past:List<NativeInspectionSettings> = emptyList(),
 val present:NativeInspectionSettings = NativeInspectionSettings(),
 val future:List<NativeInspectionSettings> = emptyList(),
) {
 companion object { const val LIMIT=50 }
 fun commit(next:NativeInspectionSettings):NativeWorldLabInspectionHistory {
  val validated=next.copy()
  if(validated==present)return this
  return copy(past=(past+present).takeLast(LIMIT),present=validated,future=emptyList())
 }
 fun undo():NativeWorldLabInspectionHistory {
  if(past.isEmpty())return this
  return copy(past=past.dropLast(1),present=past.last(),future=(listOf(present)+future).take(LIMIT))
 }
 fun redo():NativeWorldLabInspectionHistory {
  if(future.isEmpty())return this
  return copy(past=(past+present).takeLast(LIMIT),present=future.first(),future=future.drop(1))
 }
}
