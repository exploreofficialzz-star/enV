package com.chastech.env.engine
import org.junit.Assert.*
import org.junit.Test
class NativeWorldLabInspectionTest{
 private fun fixture():NativeWorldLabProject{
  val a=NativeLabSolid("a","First","box",NativeLabVector(-1.0,0.0,0.0),NativeLabVector(1.0,1.0,1.0),"#336699",null,"visual-only",1.0)
  val b=NativeLabSolid("b","Second","box",NativeLabVector(1.0,0.0,0.0),NativeLabVector(1.0,1.0,1.0),"#669933",null,"visual-only",1.0)
  val c=NativeLabSolid("c","Other","sphere",NativeLabVector(5.0,0.0,0.0),NativeLabVector(1.0,1.0,1.0),"#996633",null,"visual-only",1.0)
  return NativeWorldLabProject("p","Inspection",0,"2026-11-01T00:00:00Z","2026-11-01T00:00:00Z",NativeLabVector(0.0,1.65,-8.0),NativeLabVector(0.0,1.2,0.0),listOf(a,b,c),emptyList(),assemblies=listOf(NativeLabAssembly("g","Pair",listOf("a","b"))))
 }
 @Test fun isolationFollowsAssemblyMembership(){val p=fixture();val s=NativeInspectionSettings(mode=NativeInspectionMode.ISOLATE);assertTrue(NativeWorldLabInspection.visible(p,"a",s,"b"));assertFalse(NativeWorldLabInspection.visible(p,"a",s,"c"));assertTrue(NativeWorldLabInspection.visible(p,null,s,"c"))}
 @Test fun explosionIsViewOnly(){val p=fixture();val before=p.entities.map{it.positionMeters};val s=NativeInspectionSettings(mode=NativeInspectionMode.EXPLODED,explosionDistanceMeters=2.0);val a=NativeWorldLabInspection.renderPosition(p,"a",s,"a");val b=NativeWorldLabInspection.renderPosition(p,"a",s,"b");assertTrue(kotlin.math.abs(a.x-b.x)>3.9);assertEquals(5.0,NativeWorldLabInspection.renderPosition(p,"a",s,"c").x,0.0);assertEquals(before,p.entities.map{it.positionMeters})}
 @Test fun cutawayPolygonClipsAtWorldPlaneForAllAxes(){
  val poly=listOf(NativeLabVector(-2.0,0.0,0.0),NativeLabVector(0.0,0.0,0.0),
   NativeLabVector(0.0,1.0,0.0),NativeLabVector(-2.0,1.0,0.0))
  val x=NativeWorldLabInspection.clipPolygon(poly,NativeInspectionAxis.X,-1.0)
  assertEquals(4,x.size);assertTrue(x.all{it.x>=-1.0-1e-9})
  val y=NativeWorldLabInspection.clipPolygon(poly,NativeInspectionAxis.Y,0.5)
  assertEquals(4,y.size);assertTrue(y.all{it.y>=0.5-1e-9})
  val zPoly=listOf(NativeLabVector(0.0,0.0,-2.0),NativeLabVector(1.0,0.0,0.0),
   NativeLabVector(1.0,1.0,0.0),NativeLabVector(0.0,1.0,-2.0))
  val z=NativeWorldLabInspection.clipPolygon(zPoly,NativeInspectionAxis.Z,-1.0)
  assertEquals(4,z.size);assertTrue(z.all{it.z>=-1.0-1e-9})
  assertTrue(NativeWorldLabInspection.clipPolygon(poly,NativeInspectionAxis.X,3.0).isEmpty())
 }
 @Test fun obliqueCutawayUsesNormalizedPlaneAndProjectedObjectBounds(){
  val project=fixture()
  val settings=NativeInspectionSettings(mode=NativeInspectionMode.CUTAWAY,
   normal=NativeLabVector(1.0,1.0,0.0),cutawayFraction=0.5f)
  val plane=NativeWorldLabInspection.plane(project,"a",settings)!!
  assertEquals(1.0/kotlin.math.sqrt(2.0),plane.normal.x,1e-9)
  assertEquals(1.0/kotlin.math.sqrt(2.0),plane.normal.y,1e-9)
  assertEquals(-1.0/kotlin.math.sqrt(2.0)+0.5/kotlin.math.sqrt(2.0),plane.offset,1e-9)
  val polygon=listOf(NativeLabVector(-2.0,0.0,0.0),NativeLabVector(0.0,0.0,0.0),
   NativeLabVector(0.0,1.0,0.0),NativeLabVector(-2.0,1.0,0.0))
  val clipped=NativeWorldLabInspection.clipPolygon(polygon,plane)
  assertTrue(clipped.size>=3)
  assertTrue(clipped.all{it.x*plane.normal.x+it.y*plane.normal.y+it.z*plane.normal.z>=plane.offset-1e-9})
 }
 @Test fun zeroCutawayNormalIsRejected(){
  assertThrows(IllegalArgumentException::class.java){
   NativeInspectionSettings(mode=NativeInspectionMode.CUTAWAY,normal=NativeLabVector(0.0,0.0,0.0))
  }
 }
}


class NativeWorldLabInspectionHistoryTest{
 @Test fun inspectionViewHistoryRestoresCutawayAndXrayWithoutChangingProject(){
  val initial=NativeInspectionSettings()
  val original=NativeWorldLabInspectionHistory(present=initial)
  val cutaway=original.commit(initial.copy(mode=NativeInspectionMode.CUTAWAY,
   axis=NativeInspectionAxis.Z,cutawayFraction=0.4f))
  val xray=cutaway.commit(cutaway.present.copy(mode=NativeInspectionMode.XRAY,opacity=0.25f))
  assertEquals(NativeInspectionMode.XRAY,xray.present.mode)
  val undoXray=xray.undo()
  assertEquals(NativeInspectionMode.CUTAWAY,undoXray.present.mode)
  assertEquals(NativeInspectionAxis.Z,undoXray.present.axis)
  assertEquals(0.4f,undoXray.present.cutawayFraction,0f)
  val undoCutaway=undoXray.undo()
  assertEquals(initial,undoCutaway.present)
  assertEquals(NativeInspectionMode.CUTAWAY,undoCutaway.redo().present.mode)
  assertSame(original,original.undo())
 }
 @Test fun inspectionViewHistoryIsBoundedAndNewEditClearsRedo(){
  var history=NativeWorldLabInspectionHistory()
  repeat(65){index->history=history.commit(history.present.copy(
   opacity=if(index%2==0)0.3f else 0.6f,cutawayFraction=(index%20)/20f))}
  assertEquals(NativeWorldLabInspectionHistory.LIMIT,history.past.size)
  val undone=history.undo()
  val edited=undone.commit(undone.present.copy(mode=NativeInspectionMode.TRANSPARENT))
  assertTrue(edited.future.isEmpty())
 }

}