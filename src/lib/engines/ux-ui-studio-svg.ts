/** Minimal geometry-only SVG tree shared by editable vector handoffs. */
export type StudioSvgNode = {tag: string; attrs: Record<string,string>; children: StudioSvgNode[]};
export type StudioSvgMatrix = [number,number,number,number,number,number];
export const identitySvgMatrix = (): StudioSvgMatrix => [1,0,0,1,0,0];
const finite = (values: number[]) => values.every(Number.isFinite);
const tidy = (value: number) => Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(6));

export function multiplySvgMatrices(a: StudioSvgMatrix, b: StudioSvgMatrix): StudioSvgMatrix {
  return [
    a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5],
  ].map(tidy) as StudioSvgMatrix;
}

export function svgTransformMatrix(source = ""): StudioSvgMatrix {
  let matrix = identitySvgMatrix();
  for (const match of source.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const values = match[2].trim().split(/[,\s]+/).filter(Boolean).map(Number);
    if (!finite(values)) return identitySvgMatrix();
    const [a=0,b=0,c=0] = values;
    let local = identitySvgMatrix();
    if (match[1] === "matrix" && values.length === 6) local = values as StudioSvgMatrix;
    else if (match[1] === "translate" && values.length >= 1) local = [1,0,0,1,a,b];
    else if (match[1] === "scale" && values.length >= 1) local = [a,0,0,values.length > 1 ? b : a,0,0];
    else if (match[1] === "rotate" && (values.length === 1 || values.length === 3)) {
      const radians = a*Math.PI/180, cos = Math.cos(radians), sin = Math.sin(radians);
      local = [cos,sin,-sin,cos,b-b*cos+c*sin,c-b*sin-c*cos].map(tidy) as StudioSvgMatrix;
    } else if (match[1] === "skewX") local = [1,0,Math.tan(a*Math.PI/180),1,0,0];
    else if (match[1] === "skewY") local = [1,Math.tan(a*Math.PI/180),0,1,0,0];
    else return identitySvgMatrix();
    if (!finite(local)) return identitySvgMatrix();
    matrix = multiplySvgMatrices(matrix, local);
  }
  return matrix;
}

export function parseStudioSvgTree(source: string): StudioSvgNode[] {
  const root: StudioSvgNode = {tag:"g",attrs:{},children:[]};
  const stack = [root];
  for (const match of source.matchAll(/<(\/)?(svg|g|path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/gi)) {
    const tag=match[2].toLowerCase(), container=tag==="svg"||tag==="g";
    if (match[1]) { if (container && stack.length>1) stack.pop(); continue; }
    const attrs: Record<string,string> = {};
    for (const attribute of match[3].matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[attribute[1]]=attribute[2]??attribute[3]??"";
    for (const declaration of (attrs.style||"").split(";")) {
      const colon=declaration.indexOf(":");
      if(colon>0)attrs[declaration.slice(0,colon).trim()]=declaration.slice(colon+1).trim();
    }
    const node: StudioSvgNode = {tag,attrs,children:[]};
    stack[stack.length-1].children.push(node);
    if(container&&!match[3].trimEnd().endsWith("/"))stack.push(node);
  }
  return root.children;
}

export function svgViewportGeometry(attrs: Record<string,string>): {matrix: StudioSvgMatrix; clip?: {x:number;y:number;width:number;height:number}} {
  const n=(key:string,fallback=0)=>Number.isFinite(Number(attrs[key]))?Number(attrs[key]):fallback;
  const [vx=0,vy=0,vw=24,vh=24]=(attrs.viewBox||"0 0 24 24").trim().split(/[,\s]+/).map(Number);
  const x=n("x"),y=n("y"),width=n("width",vw),height=n("height",vh);
  if(!finite([vx,vy,vw,vh,x,y,width,height])||vw<=0||vh<=0||width<=0||height<=0)return {matrix:identitySvgMatrix()};
  const aspect=attrs.preserveAspectRatio||"xMidYMid meet";
  let sx=width/vw,sy=height/vh,offsetX=0,offsetY=0;
  if(aspect!=="none"){
    sx=sy=aspect.includes("slice")?Math.max(sx,sy):Math.min(sx,sy);
    offsetX=aspect.includes("xMin")?0:aspect.includes("xMax")?width-vw*sx:(width-vw*sx)/2;
    offsetY=aspect.includes("YMin")?0:aspect.includes("YMax")?height-vh*sy:(height-vh*sy)/2;
  }
  return {
    matrix:[sx,0,0,sy,x+offsetX-vx*sx,y+offsetY-vy*sy].map(tidy) as StudioSvgMatrix,
    ...(attrs.overflow!=="visible"?{clip:{x,y,width,height}}:{}),
  };
}

export const svgPresentationKeys = ["fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","stroke-miterlimit","fill-rule","fill-opacity","stroke-opacity","stroke-dasharray","stroke-dashoffset","vector-effect"];
export function inheritedSvgPresentation(parent: Record<string,string>, own: Record<string,string>): Record<string,string> {
  return {...Object.fromEntries(svgPresentationKeys.filter(key=>parent[key]!==undefined).map(key=>[key,parent[key]])),...own};
}
