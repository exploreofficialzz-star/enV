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
 @Test fun cutawayPolygonClipsAtWorldPlane(){val poly=listOf(NativeLabVector(-2.0,0.0,0.0),NativeLabVector(0.0,0.0,0.0),NativeLabVector(0.0,1.0,0.0),NativeLabVector(-2.0,1.0,0.0));val clipped=NativeWorldLabInspection.clipPolygon(poly,NativeInspectionAxis.X,-1.0);assertEquals(4,clipped.size);assertTrue(clipped.all{it.x>=-1.0-1e-9});assertTrue(NativeWorldLabInspection.clipPolygon(poly,NativeInspectionAxis.X,3.0).isEmpty())}
}
