import assert from "node:assert/strict";
import test from "node:test";
import { mergeStudioVectorLayers, type StudioVectorLayer } from "./ux-ui-studio-merge.ts";
import { STUDIO_SHAPE_PRESETS, searchStudioShapes } from "./ux-ui-studio-shapes.ts";
import { svgTransformMatrix, multiplySvgMatrices, svgViewportGeometry, parseStudioSvgTree } from "./ux-ui-studio-svg.ts";
import { generateKotlinProject, generateSwiftProject, type UxCodegenLayer, type UxCodegenProject } from "./ux-ui-studio-codegen.ts";

function icon(id: string, patch: Partial<StudioVectorLayer> = {}): StudioVectorLayer {
  return {id,kind:"icon",name:id,x:10,y:20,width:24,height:24,color:"#2563EB",background:"transparent",borderColor:"#111827",borderWidth:0,radius:0,opacity:1,iconSvg:'<g fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h20"/></g>',iconViewBox:"0 0 24 24",...patch};
}

test("compound vector preserves relative positions, source viewports and paint order",()=>{
  const first=icon("first",{x:10,y:20,width:20,height:20,opacity:.5,zIndex:10});
  const second=icon("second",{x:60,y:40,width:30,height:40,color:"#DC2626",zIndex:0});
  const merged=mergeStudioVectorLayers([first,second]);
  assert.deepEqual({x:merged.x,y:merged.y,width:merged.width,height:merged.height},{x:10,y:20,width:80,height:60});
  assert.equal(merged.iconViewBox,"0 0 80 60");
  assert.deepEqual(merged.sourceIds,["second","first"]);
  assert.match(merged.iconSvg,/<g transform="translate\(50 20\)" opacity="1"><svg x="2" y="2" width="26" height="36"/);
  assert.match(merged.iconSvg,/stroke="#DC2626"/);
  assert.match(merged.iconSvg,/stroke="#2563EB"/);
  assert.match(merged.iconSvg,/<g transform="translate\(0 0\)" opacity="0.5">/);
  assert.equal(first.iconSvg.includes("currentColor"),true,"merging does not mutate source artwork");
});

test("rotated vector bounds contain every rotated corner without losing the layer transform",()=>{
  const merged=mergeStudioVectorLayers([icon("wide",{width:100,height:20,rotation:90}),icon("other",{x:100,y:100,width:20,height:20})]);
  assert.deepEqual({x:merged.x,y:merged.y,width:merged.width,height:merged.height},{x:50,y:-20,width:70,height:140});
  assert.match(merged.iconSvg,/translate\(-40 40\) rotate\(90 50 10\)/);
});

test("shape merges preserve independent corners, outlines, stroke extents and dash styles",()=>{
  const shape=icon("shape",{kind:"rect",x:0,y:0,width:20,height:10,borderWidth:4,borderStyle:"dotted",background:"#FFFFFF",cornerRadii:{topLeft:4,topRight:0,bottomRight:2,bottomLeft:0}});
  const merged=mergeStudioVectorLayers([shape,icon("other",{kind:"rect",x:40,y:0,width:10,height:10,background:"#DC2626"})]);
  assert.deepEqual({x:merged.x,y:merged.y,width:merged.width,height:merged.height},{x:-2,y:-2,width:52,height:14});
  assert.match(merged.iconSvg,/<path d="M4 0 H20 L20 0 V8 A2 2/);
  assert.match(merged.iconSvg,/stroke-dasharray="0 8" stroke-linecap="round"/);
  assert.equal(merged.sourceLayers[0].cornerRadii?.topLeft,4);
});

test("merging a merged vector adds no new viewport inset and keeps clipping",()=>{
  const merged=mergeStudioVectorLayers([icon("a"),icon("b",{x:60})]);
  const combined=mergeStudioVectorLayers([icon("merged",{...merged,id:"merged"}),icon("c",{x:120})]);
  assert.match(combined.iconSvg,/<svg x="0" y="0" width="74" height="24"/);
  assert.match(combined.iconSvg,/overflow="hidden"/);
  assert.equal((combined.iconSvg.match(/stroke="#2563EB"/g)||[]).length,3);
});

test("the built-in home fallback can merge just as it appears on the artboard",()=>{
  const merged = mergeStudioVectorLayers([icon("home", {iconSvg:""}), icon("other")]);
  assert.match(merged.iconSvg, /M12 3l9 8h-3v9/);
  assert.equal(merged.sourceIds.length, 2);
});

test("merge refuses unsupported effects and invalid sources instead of deleting their appearance",()=>{
  assert.throws(()=>mergeStudioVectorLayers([icon("one")]),/at least two/);
  for(const patch of [{kind:"text"},{kind:"image"},{shadow:true},{hidden:true},{rotation:NaN},{iconViewBox:"0 0 0 10"},{iconSvg:'<script>alert(1)</script>'},{iconSvg:'<path d="M0 0" onclick="alert(1)"/>'},{iconSvg:'<path fill="url(https://example.test/a)" d="M0 0h1v1z"/>'}]){
    assert.throws(()=>mergeStudioVectorLayers([icon("one",patch),icon("two")]));
  }
});

test("SVG matrix composition retains order, pivot rotation and nested viewBox letterboxing",()=>{
  assert.deepEqual(svgTransformMatrix("translate(20 30) rotate(90 10 10)"),[0,1,-1,0,40,30]);
  const viewport=svgViewportGeometry({x:"2",y:"2",width:"96",height:"46",viewBox:"10 20 100 100",overflow:"hidden"});
  assert.deepEqual(viewport.matrix,[.46,0,0,.46,22.4,-7.2]);
  assert.deepEqual(viewport.clip,{x:2,y:2,width:96,height:46});
  assert.deepEqual(multiplySvgMatrices(svgTransformMatrix("translate(10 20)"),viewport.matrix),[.46,0,0,.46,32.4,12.8]);
  const nodes=parseStudioSvgTree('<g opacity=".5"><svg x="2" width="20" viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg></g>');
  assert.equal(nodes[0].attrs.opacity,".5");
  assert.equal(nodes[0].children[0].children[0].attrs.opacity,undefined,"group opacity is composited once, not inherited per child");
});

test("Kotlin and Swift handoffs preserve merged groups, transforms, viewport clipping and composited opacity",()=>{
  const merged=mergeStudioVectorLayers([icon("a",{opacity:.5,rotation:90}),icon("b",{x:60,iconSvg:'<path d="M0 0h24v24z" fill="#DC2626" fill-opacity=".75"/>'})]);
  const layer={...icon("merged"),...merged,text:"",iconName:"Merged icons",imageDataUrl:"",padding:0,marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,fontFamily:"Inter",fontSize:16,fontWeight:400,lineHeight:1.3,letterSpacing:0,textAlign:"left",shadow:false} as UxCodegenLayer;
  const project:UxCodegenProject={name:"Compound",target:"mobile",background:"#FFFFFF",viewport:{width:390,height:844},breakpoints:{mobile:480,tablet:768,desktop:1024},tokens:{colors:[],typography:[],spacing:[]},elements:[layer]};
  const kotlin=generateKotlinProject(project),swift=generateSwiftProject(project);
  assert.match(kotlin,/nativeCanvas\.saveLayerAlpha\(null, 128\)/);
  assert.match(kotlin,/nativeCanvas\.clipRect\(2f, 2f, 22f, 22f\)/);
  assert.match(kotlin,/setValues\(floatArrayOf\(0f, -1f, 24f, 1f, 0f, 0f, 0f, 0f, 1f\)\)/);
  assert.match(kotlin,/alpha = \(alpha \* 0.75f\)\.toInt\(\)/);
  assert.match(swift,/\.compositingGroup\(\)\.opacity\(0.5\)/);
  assert.match(swift,/\.clipShape\(Path\(CGRect\(x: 2, y: 2, width: 20, height: 20\)\)\)/);
  assert.match(swift,/CGAffineTransform\(a: 0, b: 1, c: -1, d: 0, tx: 24, ty: 0\)/);
  assert.match(swift,/\.fill\(Color\(hex: "#DC2626"\)\)\.opacity\(0.75\)/);
  assert.doesNotMatch(kotlin+swift,/\b(?:NaN|Infinity)\b/);
});

test("the expanded shape catalog includes searchable form bars, navigation, surfaces and actual vector geometry",()=>{
  assert.equal(STUDIO_SHAPE_PRESETS.length,48);
  assert.equal(new Set(STUDIO_SHAPE_PRESETS.map(shape=>shape.id)).size,48);
  assert.ok(searchStudioShapes("search bar").some(shape=>shape.kind==="search"));
  assert.ok(searchStudioShapes("navigation").some(shape=>shape.kind==="tabbar"));
  assert.ok(searchStudioShapes("speech").some(shape=>shape.patch?.iconSvg?.includes("<path")));
  assert.equal(searchStudioShapes("no such shape").length,0);
});

test("SVG hex-alpha paints are normalized to RGB plus alpha in native handoffs",()=>{
  const layer={...icon("alpha",{iconSvg:'<path fill="#DC262680" d="M0 0h24v24z"/><path fill="none" stroke="#12F8" d="M0 0L24 24"/>'}),text:"",iconName:"Alpha",imageDataUrl:"",padding:0,marginTop:0,marginRight:0,marginBottom:0,marginLeft:0,fontFamily:"Inter",fontSize:16,fontWeight:400,lineHeight:1.3,letterSpacing:0,textAlign:"left",shadow:false} as UxCodegenLayer;
  const project:UxCodegenProject={name:"Alpha",target:"mobile",background:"#FFFFFF",viewport:{width:390,height:844},breakpoints:{mobile:480,tablet:768,desktop:1024},tokens:{colors:[],typography:[],spacing:[]},elements:[layer]};
  const kotlin=generateKotlinProject(project),swift=generateSwiftProject(project);
  assert.match(kotlin,/Color\.parseColor\("#DC2626"\); alpha = \(alpha \* 0.5019607843137255f\)/);
  assert.match(kotlin,/Color\.parseColor\("#1122FF"\); alpha = \(alpha \* 0.5333333333333333f\)/);
  assert.match(swift,/Color\(hex: "#DC2626"\)\)\.opacity\(0.5019607843137255\)/);
});
