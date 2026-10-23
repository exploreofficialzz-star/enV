import { parseUxUiStudioChartData } from "./ux-ui-studio-chart.ts";

export type UxCodegenLayer = {
  id: string; kind: string; name: string; x: number; y: number; width: number; height: number;
  text: string; iconName: string; iconSvg: string; iconViewBox: string; imageDataUrl: string; fontDataUrl?: string;
  color: string; background: string; borderColor: string; borderWidth: number; radius: number;
  padding: number; marginTop: number; marginRight: number; marginBottom: number; marginLeft: number;
  fontFamily: string; fontSize: number; fontWeight: number; lineHeight: number; letterSpacing: number;
  textAlign: "left" | "center" | "right"; opacity: number; shadow: boolean;
  horizontalConstraint?: "left" | "center" | "right" | "stretch";
  verticalConstraint?: "top" | "center" | "bottom" | "stretch";
  minWidth?: number; maxWidth?: number; visibleOn?: string[];
  referenceWidth?: number; referenceHeight?: number; componentKey?: string;
  display?: string; cursor?: string; zIndex?: number; transitionDuration?: number;
  hoverColor?: string; activeColor?: string; focusColor?: string;
};
export type UxCodegenProject = {
  name: string; target: string; background: string; viewport: { width: number; height: number };
  breakpoints: { mobile: number; tablet: number; desktop: number };
  tokens: { colors: Array<{name:string;value:string}>; typography: Array<{name:string;fontFamily:string;fontSize:number;fontWeight:number;lineHeight:number}>; spacing: number[] };
  elements: UxCodegenLayer[];
};
const safe = (value: unknown) => JSON.stringify(value);
export const sourceName = (name: string) => name.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("") || "EnVDesign";
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const visibility = (layer: UxCodegenLayer) => layer.visibleOn?.length ? layer.visibleOn : ["mobile", "tablet", "desktop"];
const refW = (layer: UxCodegenLayer, project: UxCodegenProject) => Math.max(1, layer.referenceWidth || project.viewport.width);
const refH = (layer: UxCodegenLayer, project: UxCodegenProject) => Math.max(1, layer.referenceHeight || project.viewport.height);
const cssGeometry = (layer: UxCodegenLayer, project: UxCodegenProject) => {
  const rw = refW(layer, project), rh = refH(layer, project);
  const h = layer.horizontalConstraint || "left", v = layer.verticalConstraint || "top";
  const declarations = ["position:absolute"];
  if (h === "right") declarations.push("right:" + Math.max(0, rw - layer.x - layer.width) + "px");
  else if (h === "center") declarations.push("left:calc(" + layer.x + "px + (100cqw - " + rw + "px)/2)");
  else declarations.push("left:" + layer.x + "px");
  declarations.push("width:" + (h === "stretch" ? "calc(" + layer.width + "px + (100cqw - " + rw + "px))" : layer.width + "px"));
  if (v === "bottom") declarations.push("bottom:" + Math.max(0, rh - layer.y - layer.height) + "px");
  else if (v === "center") declarations.push("top:calc(" + layer.y + "px + (100cqh - " + rh + "px)/2)");
  else declarations.push("top:" + layer.y + "px");
  declarations.push("height:" + (v === "stretch" ? "calc(" + layer.height + "px + (100cqh - " + rh + "px))" : layer.height + "px"));
  if (layer.minWidth && layer.minWidth > 0) declarations.push("min-width:" + layer.minWidth + "px");
  if (layer.maxWidth && layer.maxWidth > 0) declarations.push("max-width:" + layer.maxWidth + "px");
  return declarations.join(";");
};

const systemFonts = new Set(["System","system-ui","sans-serif","serif","monospace","Arial","Helvetica","Georgia","Times New Roman","Courier New","SF Pro Display","SF Pro Text","Avenir Next","Menlo"]);
const shapeCss = (layer: UxCodegenLayer): string => {
  if (layer.kind === "triangle") return "clip-path:polygon(50% 0%,100% 100%,0% 100%);border-radius:0";
  if (layer.kind === "diamond") return "clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);border-radius:0";
  if (layer.kind === "hexagon") return "clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%);border-radius:0";
  if (layer.kind === "star") return "clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);border-radius:0";
  if (layer.kind === "line") return "border-radius:999px;padding:0";
  if (layer.kind === "pill") return "border-radius:999px";
  if (layer.kind === "ellipse" || layer.kind === "avatar") return "border-radius:50%";
  return "";
};
const embeddedFontCss = (project: UxCodegenProject): string => {
  const seen = new Set<string>();
  return project.elements.filter((layer) => layer.fontDataUrl && layer.fontFamily).filter((layer) => {
    if (seen.has(layer.fontFamily)) return false;
    seen.add(layer.fontFamily); return true;
  }).map((layer) => "@font-face{font-family:" + safe(layer.fontFamily) + ";src:url(" + safe(layer.fontDataUrl!) + ") format('" + (layer.fontDataUrl!.startsWith("data:font/otf") ? "opentype" : "truetype") + "');font-style:normal;font-weight:100 900;font-display:swap}").join("\\n");
};
const remoteFontFamilies = (project: UxCodegenProject): string[] => Array.from(new Set(project.elements
  .filter((layer) => !layer.fontDataUrl && layer.fontFamily && !systemFonts.has(layer.fontFamily))
  .map((layer) => layer.fontFamily)));
const googleFontLink = (family: string): string => "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(family).replace(/%20/g, "+") + "&display=swap";

const layerStyle = (l: UxCodegenLayer) => [
  "box-sizing:border-box","padding:" + l.padding + "px","color:" + l.color,
  "display:" + (l.display || "flex"),"cursor:" + (l.cursor || "default"),"z-index:" + (l.zIndex ?? 1),"transition:background-color " + (l.transitionDuration ?? 180) + "ms ease,opacity " + (l.transitionDuration ?? 180) + "ms ease",
  "background:" + (l.background === "transparent" ? "transparent" : l.background),
  "border:" + l.borderWidth + "px solid " + (l.borderWidth > 0 ? l.borderColor : "transparent"),
  "border-radius:" + l.radius + "px","opacity:" + l.opacity,"font-family:" + safe(l.fontFamily),
  "font-size:" + l.fontSize + "px","font-weight:" + l.fontWeight,"line-height:" + l.lineHeight,
  "letter-spacing:" + l.letterSpacing + "px","text-align:" + l.textAlign,"white-space:pre-wrap","overflow:hidden",
  "align-items:" + (l.textAlign === "center" ? "center" : "flex-start"),
  "justify-content:" + (l.textAlign === "center" ? "center" : l.textAlign === "right" ? "flex-end" : "flex-start"),
  l.shadow ? "box-shadow:0 3px 10px #0f172a24" : "",
  shapeCss(l),
].filter(Boolean).join(";");
const layerHtml = (l: UxCodegenLayer, p: UxCodegenProject) => {
  const common = 'class="env-layer env-layer-' + esc(l.id) + '" data-visible-on="' + visibility(l).join(" ") + '" style="' + esc("position:absolute;" + cssGeometry(l,p) + ";" + layerStyle(l)) + '"';
  if (l.kind === "chart") {
    const chart = parseUxUiStudioChartData(l.text);
    const pad = Math.max(4, l.padding);
    const plotLeft = pad + 4, plotRight = l.width - pad - 4;
    const plotTop = pad + Math.min(22, l.fontSize + 6), plotBottom = l.height - pad - 17;
    const plotHeight = Math.max(4, plotBottom - plotTop), plotWidth = Math.max(1, plotRight - plotLeft);
    const maximum = Math.max(1, ...chart.points.map((point) => point.value));
    const slot = plotWidth / Math.max(1, chart.points.length);
    const bars = chart.points.map((point, index) => {
      const barHeight = plotHeight * point.value / maximum, barWidth = Math.max(2, Math.min(26, slot * 0.58));
      const x = plotLeft + index * slot + (slot - barWidth) / 2, y = plotBottom - barHeight;
      return '<rect x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + barHeight + '" rx="3" fill="' + esc(l.color) + '" />' +
        '<text x="' + (plotLeft + index * slot + slot / 2) + '" y="' + Math.max(plotTop + 7, y - 3) + '" font-size="' + Math.max(5, Math.min(9, l.fontSize * 0.64)) + '" text-anchor="middle" fill="' + esc(l.color) + '">' + esc(String(point.value)) + '</text>' +
        '<text x="' + (plotLeft + index * slot + slot / 2) + '" y="' + (plotBottom + 12) + '" font-size="' + Math.max(5, Math.min(9, l.fontSize * 0.64)) + '" text-anchor="middle" fill="' + esc(l.color) + '">' + esc(point.label.slice(0, 8)) + '</text>';
    }).join("");
    const grid = [0,1,2,3].map((index) => '<line x1="' + plotLeft + '" y1="' + (plotTop + plotHeight * index / 3) + '" x2="' + plotRight + '" y2="' + (plotTop + plotHeight * index / 3) + '" stroke="#E5E7EB" />').join("");
    return '<div ' + common + ' role="img" aria-label="' + esc("Chart: " + chart.title + (chart.points.length ? ". " + chart.points.map((point) => point.label + " " + point.value).join(", ") : ". No valid data rows.")) + '">' +
      '<div style="position:absolute;left:' + pad + 'px;top:' + pad + 'px;font-size:' + Math.min(13, l.fontSize) + 'px;font-weight:700">' + esc(chart.title) + '</div>' +
      '<svg aria-hidden="true" viewBox="0 0 ' + l.width + ' ' + l.height + '" style="position:absolute;inset:0;width:100%;height:100%">' + (chart.points.length ? grid + bars : '<text x="' + (l.width/2) + '" y="' + (plotTop + plotHeight/2) + '" text-anchor="middle" fill="' + esc(l.color) + '" font-size="10">Enter data as Label: value</text>') + '</svg>' +
      (chart.invalidRows ? '<span style="position:absolute;right:' + pad + 'px;bottom:2px;font-size:8px;color:#B45309">' + chart.invalidRows + ' invalid row(s)</span>' : '') + '</div>';
  }
  if (l.kind === "icon") return '<div ' + common + ' aria-label="' + esc(l.name) + '"><svg viewBox="' + esc(l.iconViewBox || "0 0 24 24") + '" width="100%" height="100%" aria-hidden="true" style="fill:currentColor">' + (l.iconSvg || "") + '</svg></div>';
  if (l.kind === "image") return '<div ' + common + '>' + (l.imageDataUrl ? '<img alt="' + esc(l.name) + '" src="' + esc(l.imageDataUrl) + '" style="width:100%;height:100%;object-fit:cover" />' : esc(l.text || "Image asset not selected")) + '</div>';
  if (l.kind === "input" || l.kind === "search" || l.kind === "textarea") {
    const tag = l.kind === "textarea" ? "textarea" : "input";
    return '<div ' + common + '><' + tag + ' aria-label="' + esc(l.name) + '" placeholder="' + esc(l.text) + '" style="width:100%;height:100%;font:inherit;color:inherit;background:transparent;border:0;outline:none;resize:none" /></div>';
  }
  const tag = l.kind === "button" ? "button" : "div";
  return '<' + tag + ' ' + common + (tag === "button" ? ' type="button"' : "") + '>' + esc(l.text) + '</' + tag + '>';
};

export function generateHtmlProject(project: UxCodegenProject): string {
  const tokens = [
    ...project.tokens.colors.map((token) => "--env-color-" + token.name.replace(/[^a-z0-9-]/gi, "-") + ":" + token.value),
    ...project.tokens.spacing.map((spacing) => "--env-space-" + spacing + ":" + spacing + "px"),
    ...project.tokens.typography.map((token) => "--env-type-" + token.name.replace(/[^a-z0-9-]/gi, "-") + ":" + token.fontSize + "px/" + token.lineHeight + " " + safe(token.fontFamily)),
  ].join(";\n");
  const mobileHidden = ".env-layer:not([data-visible-on~='mobile']){}";
  const fontFaces = embeddedFontCss(project);
  const fontLinks = remoteFontFamilies(project).map((family) => '<link rel="stylesheet" href="' + esc(googleFontLink(family)) + '">').join("");
  const interactionRules = project.elements.map((layer) => {
    const selector = ".env-layer-" + layer.id.replace(/[^a-zA-Z0-9_-]/g, "");
    const rules: string[] = [];
    if (layer.hoverColor) rules.push(selector + ":hover{background:" + layer.hoverColor + "!important}");
    if (layer.activeColor) rules.push(selector + ":active{background:" + layer.activeColor + "!important}");
    if (layer.focusColor) rules.push(selector + ":focus-visible{background:" + layer.focusColor + "!important;outline:3px solid " + layer.focusColor + ";outline-offset:2px}");
    return rules.join("\\n");
  }).filter(Boolean).join("\\n");
  const rules = [
    interactionRules,
    "@media (max-width:" + project.breakpoints.mobile + "px){.env-layer:not([data-visible-on~='mobile']){display:none!important}}",
    "@media (min-width:" + (project.breakpoints.mobile + 1) + "px) and (max-width:" + (project.breakpoints.desktop - 1) + "px){.env-layer:not([data-visible-on~='tablet']){display:none!important}}",
    "@media (min-width:" + project.breakpoints.desktop + "px){.env-layer:not([data-visible-on~='desktop']){display:none!important}}",
  ].join("\n");
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    esc(project.name) + '</title>' + fontLinks + '<style>' + fontFaces + ':root{' + tokens + '}*{box-sizing:border-box}body{margin:0;padding:16px;background:#f1f5f9;font-family:Inter,system-ui,sans-serif}.env-artboard{position:relative;container-type:size;width:min(100%,' +
    project.viewport.width + 'px);aspect-ratio:' + project.viewport.width + '/' + project.viewport.height + ';margin:0 auto;background:' + project.background + ';overflow:hidden}.env-layer{min-width:0}' +
    rules + '</style></head><body><main class="env-artboard" role="img" aria-label="' + esc(project.name) + ' design">' +
    project.elements.map((layer) => layerHtml(layer, project)).join("\n") + '</main></body></html>';
}

export function generateReactProject(project: UxCodegenProject): string {
  const component = sourceName(project.name) + "Design";
  const json = JSON.stringify(project).replace(/</g, "\\u003c");
  const fontCss = JSON.stringify(embeddedFontCss(project));
  const googleLinks = remoteFontFamilies(project).map((family) => googleFontLink(family));
  const chartData = Object.fromEntries(project.elements.filter((layer) => layer.kind === "chart").map((layer) => [layer.id, parseUxUiStudioChartData(layer.text)]));
  return [
    'import React from "react";',
    "",
    "const project = " + json + " as const;",
    "const chartData: Record<string, { title: string; points: Array<{ label: string; value: number }>; invalidRows: number }> = " + JSON.stringify(chartData) + ";",
    "const embeddedFontCss = " + fontCss + ";",
    "const googleFontLinks = " + JSON.stringify(googleLinks) + ";",
    "",
    "function positionX(layer: (typeof project.elements)[number]): React.CSSProperties {",
    "  const rw = layer.referenceWidth || project.viewport.width;",
    '  if (layer.horizontalConstraint === "right") return { right: Math.max(0, rw - layer.x - layer.width) };',
    '  if (layer.horizontalConstraint === "center") return { left: "calc(" + layer.x + "px + (100cqw - " + rw + "px)/2)" };',
    '  return { left: layer.x, width: layer.horizontalConstraint === "stretch" ? "calc(" + layer.width + "px + (100cqw - " + rw + "px))" : layer.width };',
    "}",
    "function positionY(layer: (typeof project.elements)[number]): React.CSSProperties {",
    "  const rh = layer.referenceHeight || project.viewport.height;",
    '  if (layer.verticalConstraint === "bottom") return { bottom: Math.max(0, rh - layer.y - layer.height) };',
    '  if (layer.verticalConstraint === "center") return { top: "calc(" + layer.y + "px + (100cqh - " + rh + "px)/2)" };',
    '  return { top: layer.y, height: layer.verticalConstraint === "stretch" ? "calc(" + layer.height + "px + (100cqh - " + rh + "px))" : layer.height };',
    "}",
    "export default function " + component + "() {",
    '  return <div style={{position:"relative",containerType:"size",width:"min(100%, ' + project.viewport.width + 'px)",aspectRatio:"' + project.viewport.width + '/' + project.viewport.height + '",overflow:"hidden",background:project.background}}>',
    "    {googleFontLinks.map((href) => <link key={href} rel=\"stylesheet\" href={href} />)}",
    "    <style>{embeddedFontCss}</style>",
    '    {project.elements.filter((item) => !item.visibleOn || item.visibleOn.includes(project.target)).map((item) => {',
    '      const style: React.CSSProperties = {position:"absolute",boxSizing:"border-box",...positionX(item),...positionY(item),padding:item.padding,color:item.color,background:item.background === "transparent" ? "transparent" : item.background,border:item.borderWidth + "px solid " + (item.borderWidth ? item.borderColor : "transparent"),borderRadius:item.radius,opacity:item.opacity,fontFamily:item.fontFamily,fontSize:item.fontSize,fontWeight:item.fontWeight,lineHeight:item.lineHeight,letterSpacing:item.letterSpacing,textAlign:item.textAlign,whiteSpace:"pre-wrap",overflow:"hidden",display:"flex",alignItems:item.textAlign==="center"?"center":"flex-start",justifyContent:item.textAlign==="center"?"center":item.textAlign==="right"?"flex-end":"flex-start",...(item.shadow?{boxShadow:"0 3px 10px #0f172a24"}:{})};',
    "      if (item.minWidth > 0) style.minWidth = item.minWidth; if (item.maxWidth > 0) style.maxWidth = item.maxWidth;",
    '      if (item.kind === "chart") {',
    '        const chart = chartData[item.id] || { title: item.name, points: [], invalidRows: 0 };',
    '        style.display = "block"; style.padding = 0;',
    '        const plotTop = item.padding + Math.min(22, item.fontSize + 6);',
    '        const plotBottom = item.height - item.padding - 17;',
    '        const plotHeight = Math.max(4, plotBottom - plotTop);',
    '        const plotLeft = item.padding + 4, plotRight = item.width - item.padding - 4;',
    '        const plotWidth = Math.max(1, plotRight - plotLeft);',
    '        const slotWidth = plotWidth / Math.max(1, chart.points.length);',
    '        const maxValue = Math.max(1, ...chart.points.map((point) => point.value));',
    '        const labelSize = Math.max(5, Math.min(9, item.fontSize * 0.64));',
    '        return <div key={item.id} style={style} role="img" aria-label={"Chart: " + chart.title + (chart.points.length ? ". " + chart.points.map((point) => point.label + " " + point.value).join(", ") : ". No valid data rows.")}>',
    '          <div style={{position:"absolute",left:item.padding,top:item.padding,fontSize:Math.min(13,item.fontSize),fontWeight:700}}>{chart.title}</div>',
    '          <svg aria-hidden="true" viewBox={"0 0 " + item.width + " " + item.height} style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>',
    '            {chart.points.length ? <>{[0,1,2,3].map((grid) => <line key={"grid-"+grid} x1={plotLeft} y1={plotTop + plotHeight * grid / 3} x2={plotRight} y2={plotTop + plotHeight * grid / 3} stroke="#E5E7EB" />)}{chart.points.map((point,index) => { const barHeight=plotHeight*point.value/maxValue; const barWidth=Math.max(2,Math.min(26,slotWidth*0.58)); const x=plotLeft+index*slotWidth+(slotWidth-barWidth)/2; const y=plotBottom-barHeight; return <g key={point.label+"-"+index}><rect x={x} y={y} width={barWidth} height={barHeight} rx="3" fill={item.color} opacity={index===chart.points.length-1?1:0.78}/><text x={plotLeft+index*slotWidth+slotWidth/2} y={Math.max(plotTop+7,y-3)} fontSize={labelSize} fill={item.color} textAnchor="middle">{point.value}</text><text x={plotLeft+index*slotWidth+slotWidth/2} y={plotBottom+12} fontSize={labelSize} fill={item.color} textAnchor="middle">{point.label.slice(0,8)}</text></g>;})}</> : <text x={item.width/2} y={plotTop+plotHeight/2} textAnchor="middle" fontSize={labelSize} fill={item.color}>Enter data as Label: value</text>}',
    '          </svg>',
    '          {chart.invalidRows > 0 && <span style={{position:"absolute",right:item.padding,bottom:2,fontSize:8,color:"#B45309"}}>{chart.invalidRows} invalid row(s)</span>}',
    '        </div>;',
    '      }',
    '      const children = item.kind === "icon" ? <svg viewBox={item.iconViewBox || "0 0 24 24"} width="100%" height="100%" aria-hidden="true" style={{fill:"currentColor"}} dangerouslySetInnerHTML={{__html:item.iconSvg}} /> : item.kind === "image" ? item.imageDataUrl ? <img alt={item.name} src={item.imageDataUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : item.text : item.text;',
    '      if (item.kind === "input" || item.kind === "search") return <div key={item.id} style={style}><input aria-label={item.name} placeholder={item.text} style={{width:"100%",height:"100%",font:"inherit",color:"inherit",background:"transparent",border:0}} /></div>;',
    '      if (item.kind === "textarea") return <div key={item.id} style={style}><textarea aria-label={item.name} placeholder={item.text} style={{width:"100%",height:"100%",font:"inherit",color:"inherit",background:"transparent",border:0,resize:"none"}} /></div>;',
    '      return <div key={item.id} role={item.kind==="button"?"button":undefined} style={style}>{children}</div>;',
    "    })}",
    "  </div>;",
    "}",
    "",
  ].join("\n");
}

type UxSvgSegment = { op: "move" | "line" | "cubic" | "quad" | "close"; values: number[] };
type UxSvgDrawable = { tag: string; attrs: Record<string, string> };

function parseSvgPathData(data: string): UxSvgSegment[] {
  const tokens = data.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const result: UxSvgSegment[] = [];
  let index = 0, command = "", x = 0, y = 0, startX = 0, startY = 0;
  let lastCubic: { x: number; y: number } | null = null;
  let lastQuad: { x: number; y: number } | null = null;
  let previousCommand = "";
  const isLetter = (value: string | undefined) => !!value && /^[a-zA-Z]$/.test(value);
  const hasNumbers = (count: number) => index + count <= tokens.length && tokens.slice(index, index + count).every((token) => !isLetter(token));
  const read = () => Number(tokens[index++]);
  const emit = (op: UxSvgSegment["op"], values: number[]) => result.push({ op, values });
  while (index < tokens.length) {
    if (isLetter(tokens[index])) command = tokens[index++];
    if (!command) { index++; continue; }
    const upper = command.toUpperCase(), relative = command !== upper;
    if (upper === "Z") {
      emit("close", []); x = startX; y = startY; lastCubic = null; lastQuad = null; previousCommand = "Z"; command = "";
      continue;
    }
    if (!hasNumbers(1)) {
      if (index < tokens.length && !isLetter(tokens[index])) index = tokens.length;
      continue;
    }
    if (upper === "M") {
      let first = true;
      while (index < tokens.length && !isLetter(tokens[index])) {
        if (!hasNumbers(2)) { index = tokens.length; break; }
        const x0 = read(), y0 = read(), nx = relative ? x + x0 : x0, ny = relative ? y + y0 : y0;
        if (first) {
          emit("move", [nx, ny]); startX = nx; startY = ny; command = relative ? "l" : "L"; previousCommand = "M";
        } else { emit("line", [nx, ny]); previousCommand = "L"; }
        x = nx; y = ny; first = false; lastCubic = null; lastQuad = null;
      }
    } else if (upper === "L") {
      while (index < tokens.length && !isLetter(tokens[index])) {
        if (!hasNumbers(2)) { index = tokens.length; break; }
        const x0 = read(), y0 = read(), nx = relative ? x + x0 : x0, ny = relative ? y + y0 : y0;
        emit("line", [nx, ny]); x = nx; y = ny; lastCubic = null; lastQuad = null; previousCommand = "L";
      }
    } else if (upper === "H") {
      while (index < tokens.length && !isLetter(tokens[index])) {
        if (!hasNumbers(1)) { index = tokens.length; break; }
        const n = read(), nx = relative ? x + n : n; emit("line", [nx, y]); x = nx; lastCubic = null; lastQuad = null; previousCommand = "H";
      }
    } else if (upper === "V") {
      while (index < tokens.length && !isLetter(tokens[index])) {
        if (!hasNumbers(1)) { index = tokens.length; break; }
        const n = read(), ny = relative ? y + n : n; emit("line", [x, ny]); y = ny; lastCubic = null; lastQuad = null; previousCommand = "V";
      }
    } else if (upper === "C") {
      while (index < tokens.length && !isLetter(tokens[index])) {
        if (!hasNumbers(6)) { index = tokens.length; break; }
        const bx=x, by=y, a=read(), b=read(), c=read(), d=read(), e=read(), f=read();
        const x1=relative?bx+a:a, y1=relative?by+b:b, x2=relative?bx+c:c, y2=relative?by+d:d, nx=relative?bx+e:e, ny=relative?by+f:f;
        emit("cubic", [x1,y1,x2,y2,nx,ny]); x=nx; y=ny; lastCubic={x:x2,y:y2}; lastQuad=null; previousCommand="C";
      }
    } else if (upper === "S") {
      while (index < tokens.length && !isLetter(tokens[index])) {
        if (!hasNumbers(4)) { index = tokens.length; break; }
        const bx=x, by=y, c=read(), d=read(), e=read(), f=read();
        const x1=(previousCommand==="C"||previousCommand==="S")&&lastCubic?2*bx-lastCubic.x:bx;
        const y1=(previousCommand==="C"||previousCommand==="S")&&lastCubic?2*by-lastCubic.y:by;
        const x2=relative?bx+c:c, y2=relative?by+d:d, nx=relative?bx+e:e, ny=relative?by+f:f;
        emit("cubic", [x1,y1,x2,y2,nx,ny]); x=nx; y=ny; lastCubic={x:x2,y:y2}; lastQuad=null; previousCommand="S";
      }
    } else if (upper === "Q") {
      while (index < tokens.length && !isLetter(tokens[index])) {
        if (!hasNumbers(4)) { index = tokens.length; break; }
        const bx=x, by=y, a=read(), b=read(), c=read(), d=read(), x1=relative?bx+a:a, y1=relative?by+b:b, nx=relative?bx+c:c, ny=relative?by+d:d;
        emit("quad", [x1,y1,nx,ny]); x=nx; y=ny; lastQuad={x:x1,y:y1}; lastCubic=null; previousCommand="Q";
      }
    } else if (upper === "T") {
      while (index < tokens.length && !isLetter(tokens[index])) {
        if (!hasNumbers(2)) { index = tokens.length; break; }
        const bx=x, by=y, a=read(), b=read();
        const x1: number = (previousCommand==="Q"||previousCommand==="T")&&lastQuad ? 2*bx-lastQuad.x : bx;
        const y1: number = (previousCommand==="Q"||previousCommand==="T")&&lastQuad ? 2*by-lastQuad.y : by;
        const nx=relative?bx+a:a, ny=relative?by+b:b;
        emit("quad", [x1,y1,nx,ny]); x=nx; y=ny; lastQuad={x:x1,y:y1}; lastCubic=null; previousCommand="T";
      }
    } else if (upper === "A") {
      while (index < tokens.length && !isLetter(tokens[index])) {
        if (!hasNumbers(7)) { index = tokens.length; break; }
        read(); read(); read(); read(); read();
        const x0=read(), y0=read(), nx=relative?x+x0:x0, ny=relative?y+y0:y0;
        emit("line", [nx,ny]); x=nx; y=ny; lastCubic=null; lastQuad=null; previousCommand="A";
      }
    } else command = "";
  }
  return result;
}

function parseSvgAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const expression = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(expression)) attrs[match[1]] = match[2] ?? match[3] ?? "";
  return attrs;
}

function extractSvgDrawables(svg: string): UxSvgDrawable[] {
  const tags: UxSvgDrawable[] = [];
  const expression = /<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/gi;
  for (const match of svg.matchAll(expression)) tags.push({ tag: match[1].toLowerCase(), attrs: parseSvgAttributes(match[2]) });
  return tags;
}

function svgViewBox(value: string | undefined): [number, number, number, number] {
  const parts = (value || "0 0 24 24").trim().split(/[,\s]+/).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite) || parts[2] <= 0 || parts[3] <= 0) return [0, 0, 24, 24];
  return [parts[0], parts[1], parts[2], parts[3]];
}

function normalizeSvgColor(value: string | undefined, fallback: string): string | null {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "none" || normalized === "transparent") return null;
  if (normalized === "currentcolor") return fallback;
  if (normalized === "black") return "#000000";
  if (normalized === "white") return "#FFFFFF";
  if (/^#[0-9a-f]{3}$/i.test(value)) return "#" + value.slice(1).split("").map((part) => part + part).join("");
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return value;
  return fallback;
}

function svgStyle(drawable: UxSvgDrawable, layer: UxCodegenLayer): { fill: string | null; stroke: string | null; strokeWidth: number } {
  const attrs = drawable.attrs;
  const lineShape = drawable.tag === "line" || drawable.tag === "polyline";
  const defaultFill = lineShape ? "none" : layer.color;
  const defaultStroke = lineShape ? layer.color : "none";
  const fill = normalizeSvgColor(attrs.fill ?? defaultFill, layer.color);
  const stroke = normalizeSvgColor(attrs.stroke ?? defaultStroke, layer.color);
  return { fill, stroke, strokeWidth: Math.max(0.1, Number(attrs["stroke-width"] || "1.5") || 1.5) };
}

function svgNumber(attrs: Record<string, string>, key: string, fallback = 0): number {
  const value = Number(attrs[key]);
  return Number.isFinite(value) ? value : fallback;
}

function svgPointPairs(source: string | undefined): number[][] {
  const nums = (source || "").match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)?.map(Number) || [];
  const points: number[][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
  return points;
}

function swiftPathExpression(drawable: UxSvgDrawable): string {
  const a = drawable.attrs;
  const commands: string[] = [];
  const point = (x: number, y: number) => "CGPoint(x: " + x + ", y: " + y + ")";
  if (drawable.tag === "path") {
    for (const segment of parseSvgPathData(a.d || "")) {
      const v = segment.values;
      if (segment.op === "move") commands.push("path.move(to: " + point(v[0],v[1]) + ")");
      else if (segment.op === "line") commands.push("path.addLine(to: " + point(v[0],v[1]) + ")");
      else if (segment.op === "cubic") commands.push("path.addCurve(to: " + point(v[4],v[5]) + ", control1: " + point(v[0],v[1]) + ", control2: " + point(v[2],v[3]) + ")");
      else if (segment.op === "quad") commands.push("path.addQuadCurve(to: " + point(v[2],v[3]) + ", control: " + point(v[0],v[1]) + ")");
      else commands.push("path.closeSubpath()");
    }
    return "Path { path in " + commands.join("; ") + " }";
  }
  if (drawable.tag === "circle") {
    const r = svgNumber(a, "r");
    return "Path(ellipseIn: CGRect(x: " + (svgNumber(a,"cx")-r) + ", y: " + (svgNumber(a,"cy")-r) + ", width: " + 2*r + ", height: " + 2*r + "))";
  }
  if (drawable.tag === "ellipse") {
    const rx=svgNumber(a,"rx"), ry=svgNumber(a,"ry");
    return "Path(ellipseIn: CGRect(x: " + (svgNumber(a,"cx")-rx) + ", y: " + (svgNumber(a,"cy")-ry) + ", width: " + 2*rx + ", height: " + 2*ry + "))";
  }
  if (drawable.tag === "rect") {
    const x=svgNumber(a,"x"), y=svgNumber(a,"y"), w=svgNumber(a,"width"), h=svgNumber(a,"height"), rx=svgNumber(a,"rx"), ry=svgNumber(a,"ry",rx);
    return rx>0 || ry>0
      ? "Path(roundedRect: CGRect(x: " + x + ", y: " + y + ", width: " + w + ", height: " + h + "), cornerSize: CGSize(width: " + rx + ", height: " + ry + "))"
      : "Path(CGRect(x: " + x + ", y: " + y + ", width: " + w + ", height: " + h + "))";
  }
  if (drawable.tag === "line") {
    return "Path { path in path.move(to: " + point(svgNumber(a,"x1"),svgNumber(a,"y1")) + "); path.addLine(to: " + point(svgNumber(a,"x2"),svgNumber(a,"y2")) + ") }";
  }
  if (drawable.tag === "polyline" || drawable.tag === "polygon") {
    const points=svgPointPairs(a.points);
    const parts=points.map((pt,index)=>(index===0?"path.move(to: ":"path.addLine(to: ")+point(pt[0],pt[1])+")");
    if(drawable.tag==="polygon")parts.push("path.closeSubpath()");
    return "Path { path in " + parts.join("; ") + " }";
  }
  return "Path()";
}

function kotlinDrawableStatements(drawable: UxSvgDrawable, layer: UxCodegenLayer, index: number): string[] {
  const a=drawable.attrs, name="generatedSvgPath"+index, paint="generatedSvgPaint"+index;
  let pathInit: string;
  if(drawable.tag==="path") pathInit="val "+name+" = androidx.core.graphics.PathParser.createPathFromPathData("+safe(a.d || "")+")";
  else if(drawable.tag==="circle") pathInit="val "+name+" = android.graphics.Path().apply { addCircle("+svgNumber(a,"cx")+"f, "+svgNumber(a,"cy")+"f, "+svgNumber(a,"r")+"f, android.graphics.Path.Direction.CW) }";
  else if(drawable.tag==="ellipse") {
    const cx=svgNumber(a,"cx"),cy=svgNumber(a,"cy"),rx=svgNumber(a,"rx"),ry=svgNumber(a,"ry");
    pathInit="val "+name+" = android.graphics.Path().apply { addOval(android.graphics.RectF("+(cx-rx)+"f, "+(cy-ry)+"f, "+(cx+rx)+"f, "+(cy+ry)+"f), android.graphics.Path.Direction.CW) }";
  } else if(drawable.tag==="rect") {
    const x=svgNumber(a,"x"),y=svgNumber(a,"y"),w=svgNumber(a,"width"),h=svgNumber(a,"height"),rx=svgNumber(a,"rx"),ry=svgNumber(a,"ry",rx);
    pathInit="val "+name+" = android.graphics.Path().apply { "+(rx>0||ry>0?"addRoundRect(android.graphics.RectF("+x+"f, "+y+"f, "+(x+w)+"f, "+(y+h)+"f), "+rx+"f, "+ry+"f, android.graphics.Path.Direction.CW)":"addRect(android.graphics.RectF("+x+"f, "+y+"f, "+(x+w)+"f, "+(y+h)+"f), android.graphics.Path.Direction.CW)")+" }";
  } else if(drawable.tag==="line") pathInit="val "+name+" = android.graphics.Path().apply { moveTo("+svgNumber(a,"x1")+"f, "+svgNumber(a,"y1")+"f); lineTo("+svgNumber(a,"x2")+"f, "+svgNumber(a,"y2")+"f) }";
  else {
    const points=svgPointPairs(a.points);
    const pointLines=points.map((pt,j)=>(j===0?"moveTo(":"lineTo(")+pt[0]+"f, "+pt[1]+"f)");
    if(drawable.tag==="polygon")pointLines.push("close()");
    pathInit="val "+name+" = android.graphics.Path().apply { "+pointLines.join("; ")+" }";
  }
  const style=svgStyle(drawable,layer), lines=[pathInit];
  if(style.fill) lines.push(name+"?.let { "+name+"Value -> val "+paint+" = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { style = android.graphics.Paint.Style.FILL; color = android.graphics.Color.parseColor("+safe(style.fill)+") }; nativeCanvas.drawPath("+name+"Value, "+paint+") }");
  if(style.stroke) lines.push(name+"?.let { "+name+"Value -> val "+paint+" = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { style = android.graphics.Paint.Style.STROKE; strokeWidth = "+style.strokeWidth+"f; color = android.graphics.Color.parseColor("+safe(style.stroke)+"); strokeCap = "+(a["stroke-linecap"]==="round"?"android.graphics.Paint.Cap.ROUND":a["stroke-linecap"]==="square"?"android.graphics.Paint.Cap.SQUARE":"android.graphics.Paint.Cap.BUTT")+"; strokeJoin = "+(a["stroke-linejoin"]==="round"?"android.graphics.Paint.Join.ROUND":a["stroke-linejoin"]==="bevel"?"android.graphics.Paint.Join.BEVEL":"android.graphics.Paint.Join.MITER")+" }; nativeCanvas.drawPath("+name+"Value, "+paint+") }");
  return lines;
}

export function generateKotlinProject(project: UxCodegenProject): string {
  const functionName = sourceName(project.name) + "Design";
  const layers = project.elements.map((layer) => {
    const h = layer.horizontalConstraint || "left", v = layer.verticalConstraint || "top";
    const x = h === "center" ? "(" + layer.x + "f + widthDelta / 2f)" : h === "right" ? "(maxWidth.value - " + Math.max(0, refW(layer, project) - layer.x - layer.width) + "f - " + layer.width + "f)" : layer.x + "f";
    const y = v === "center" ? "(" + layer.y + "f + heightDelta / 2f)" : v === "bottom" ? "(maxHeight.value - " + Math.max(0, refH(layer, project) - layer.y - layer.height) + "f - " + layer.height + "f)" : layer.y + "f";
    let width = h === "stretch" ? "(" + layer.width + "f + widthDelta).coerceAtLeast(" + Math.max(1, layer.minWidth || 1) + "f)" : layer.width + "f";
    if (h === "stretch" && layer.maxWidth && layer.maxWidth > 0) width = width + ".coerceAtMost(" + layer.maxWidth + "f)";
    const height = v === "stretch" ? "(" + layer.height + "f + heightDelta).coerceAtLeast(1f)" : layer.height + "f";
    const shape = "generatedUxShape(" + safe(layer.kind) + ", " + layer.radius + ".dp)";
    const fill = layer.background === "transparent" ? "Color.Transparent" : "Color(android.graphics.Color.parseColor(" + safe(layer.background) + "))";
    const modifiers = [
      "Modifier.offset(x = ((" + x + ") + " + layer.marginLeft + "f).dp, y = ((" + y + ") + " + layer.marginTop + "f).dp)",
      ".size(width = (" + width + ").dp, height = (" + height + ").dp)",
      ".background(" + fill + ", " + shape + ")",
      layer.borderWidth > 0 ? ".border(" + layer.borderWidth + ".dp, Color(android.graphics.Color.parseColor(" + safe(layer.borderColor) + ")), " + shape + ")" : "",
      layer.shadow ? ".shadow(10.dp, " + shape + ")" : "",
      ".graphicsLayer(alpha = " + layer.opacity + "f)",
      ".padding(" + layer.padding + ".dp)"
    ].filter(Boolean).join("");
    let content: string;
    } else if (layer.kind === "chart") {
      const chart = parseUxUiStudioChartData(layer.text);
      const points = chart.points.map((point) => "(" + safe(point.label) + " to " + (Number.isInteger(point.value) ? point.value.toFixed(1) : String(point.value)) + ")").join(", ");
      const chartColor = "Color(android.graphics.Color.parseColor(" + safe(layer.color) + "))";
      const barAreaHeight = Math.max(16, layer.height - layer.padding * 2 - layer.fontSize - 30);
      const chartBody = chart.points.length
        ? [
            "val generatedChartPoints = listOf(" + points + ")",
            "val generatedChartMaximum = generatedChartPoints.maxOfOrNull { it.second }?.coerceAtLeast(1.0) ?: 1.0",
            "Row(Modifier.fillMaxWidth().weight(1f), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {",
            "  generatedChartPoints.forEach { (label, value) ->",
            "    Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {",
            "      Text(if (value % 1.0 == 0.0) value.toLong().toString() else String.format(java.util.Locale.US, \"%.1f\", value), fontSize = 7.sp, maxLines = 1)",
            "      Spacer(Modifier.height(1.dp))",
            "      Box(Modifier.fillMaxWidth(0.62f).height(if (value <= 0.0) 0.dp else maxOf(2f, " + barAreaHeight + "f * (value / generatedChartMaximum).toFloat()).dp).background(" + chartColor + "))",
            "      Text(label, fontSize = 6.sp, maxLines = 1)",
            "    }",
            "  }",
            "}"
          ].join("\n")
        : 'Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) { Text("Enter data as Label: value", fontSize = 8.sp) }';
      content = [
        "Column(Modifier.fillMaxSize().padding(2.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {",
        "  Text(" + safe(chart.title) + ", color = " + chartColor + ", fontSize = " + Math.min(16, layer.fontSize) + ".sp, fontWeight = FontWeight.SemiBold, maxLines = 1)",
        chartBody,
        chart.invalidRows ? 'Text("' + chart.invalidRows + ' invalid row(s) ignored", fontSize = 6.sp, color = Color(0xFFB45309), maxLines = 1)' : "",
        "}"
      ].filter(Boolean).join("\n");
    if (layer.kind === "line") {
      const lineColor = layer.background === "transparent" ? layer.color : layer.background;
      content = "Canvas(Modifier.fillMaxSize()) { drawLine(color = Color(android.graphics.Color.parseColor(" + safe(lineColor) + ")), start = androidx.compose.ui.geometry.Offset(0f, size.height / 2f), end = androidx.compose.ui.geometry.Offset(size.width, size.height / 2f), strokeWidth = size.height) }";
    } else if (layer.kind === "icon" && layer.iconSvg) {
      const [viewX,viewY,viewWidth,viewHeight] = svgViewBox(layer.iconViewBox);
      const drawables = extractSvgDrawables(layer.iconSvg);
      const drawings = drawables.flatMap((drawable,index) => kotlinDrawableStatements(drawable,layer,index)).map((line) => "              " + line).join("\n");
      content = drawables.length
        ? "Canvas(Modifier.fillMaxSize()) {\n  drawIntoCanvas { drawCanvas ->\n    val nativeCanvas = drawCanvas.nativeCanvas\n    nativeCanvas.save()\n    nativeCanvas.scale(size.width / " + viewWidth + "f, size.height / " + viewHeight + "f)\n    nativeCanvas.translate(-" + viewX + "f, -" + viewY + "f)\n" + drawings + "\n    nativeCanvas.restore()\n  }\n}"
        : "Text(" + safe(layer.iconName || layer.name) + ", color = Color(android.graphics.Color.parseColor(" + safe(layer.color) + ")))";
    } else if (layer.kind === "image" && layer.imageDataUrl) {
      content = "val generatedImageDataUrl = " + safe(layer.imageDataUrl) + "\nval generatedImageBitmap = remember(generatedImageDataUrl) { runCatching { val bytes = Base64.decode(generatedImageDataUrl.substringAfter(\",\", \"\"), Base64.DEFAULT); BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }.getOrNull() }\nif (generatedImageBitmap != null) Image(bitmap = generatedImageBitmap.asImageBitmap(), contentDescription = " + safe(layer.name) + ", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) else Text(" + safe(layer.name) + ")";
    } else {
      const fontFamily = layer.fontDataUrl
        ? "generatedUxFontFamily(context, " + safe(layer.fontFamily) + ", " + safe(layer.fontDataUrl) + ", " + layer.fontWeight + ")"
        : "FontFamily(Typeface.create(" + safe(layer.fontFamily) + ", " + (layer.fontWeight >= 600 ? "Typeface.BOLD" : "Typeface.NORMAL") + "))";
      const align = layer.textAlign === "center" ? "TextAlign.Center" : layer.textAlign === "right" ? "TextAlign.End" : "TextAlign.Start";
      content = "Text(" + safe(layer.text) + ", color = Color(android.graphics.Color.parseColor(" + safe(layer.color) + ")), fontSize = " + layer.fontSize + ".sp, fontWeight = FontWeight(" + layer.fontWeight + "), fontFamily = " + fontFamily + ", lineHeight = " + layer.lineHeight + ".sp, letterSpacing = " + layer.letterSpacing + ".sp, textAlign = " + align + ", modifier = Modifier.fillMaxSize())";
    }
    return [
      "      // " + layer.name.replace(/\n/g, " ") + " (" + layer.kind + "); responsive anchors " + h + "/" + v,
      "      if (listOf(" + visibility(layer).map(safe).join(", ") + ").contains(target)) Box(" + modifiers + ") {",
      "        " + content.replace(/\n/g, "\n        "),
      "      }"
    ].join("\n");
  }).join("\n");
  const generatedKotlinHelpers = [
    "private fun generatedUxShape(kind: String, radius: Dp): Shape = when (kind) {",
    "  \"ellipse\", \"avatar\" -> CircleShape",
    "  \"pill\" -> RoundedCornerShape(percent = 50)",
    "  \"triangle\" -> GenericShape { size, _ -> moveTo(size.width/2,0f); lineTo(size.width,size.height); lineTo(0f,size.height); close() }",
    "  \"diamond\" -> GenericShape { size, _ -> moveTo(size.width/2,0f); lineTo(size.width,size.height/2); lineTo(size.width/2,size.height); lineTo(0f,size.height/2); close() }",
    "  \"hexagon\" -> GenericShape { size, _ -> moveTo(size.width*.25f,0f); lineTo(size.width*.75f,0f); lineTo(size.width,size.height/2); lineTo(size.width*.75f,size.height); lineTo(size.width*.25f,size.height); lineTo(0f,size.height/2); close() }",
    "  \"star\" -> GenericShape { size, _ -> for (index in 0 until 10) { val r=if(index%2==0).5f else .21f; val angle=-Math.PI.toFloat()/2+index*Math.PI.toFloat()/5; val px=size.width/2+kotlin.math.cos(angle)*size.width*r; val py=size.height/2+kotlin.math.sin(angle)*size.height*r; if(index==0)moveTo(px,py)else lineTo(px,py) }; close() }",
    "  \"line\" -> GenericShape { size, _ -> moveTo(0f,size.height/2); lineTo(size.width,size.height/2) }",
    "  else -> RoundedCornerShape(radius)",
    "}",
    "",
    "private fun generatedUxFontFamily(context: Context, family: String, dataUrl: String, weight: Int): FontFamily {",
    "  val style = if (weight >= 600) Typeface.BOLD else Typeface.NORMAL",
    "  var typeface = Typeface.create(family, style)",
    "  if (dataUrl.startsWith(\"data:font/\") && dataUrl.contains(\",\")) runCatching { val mime=dataUrl.substringAfter(\"data:\").substringBefore(\";\"); val ext=if(mime.contains(\"otf\"))\"otf\" else \"ttf\"; val bytes=Base64.decode(dataUrl.substringAfter(\",\"),Base64.DEFAULT); require(bytes.size<=4*1024*1024); val file=File(context.cacheDir,\"env-export-font-\"+family.hashCode()+\".\"+ext); if(!file.exists()||file.length()!=bytes.size.toLong())file.writeBytes(bytes); typeface=Typeface.createFromFile(file) }",
    "  return FontFamily(typeface)",
    "}"
  ].join("\n");
  return [
    "// Generated by enV UX/UI Studio. Target artboard: " + project.viewport.width + " x " + project.viewport.height + " px.",
    "import android.content.Context",
    "import android.graphics.BitmapFactory",
    "import android.graphics.Paint",
    "import android.graphics.RectF",
    "import android.graphics.Typeface",
    "import android.util.Base64",
    "import java.io.File",
    "import androidx.compose.foundation.Canvas",
    "import androidx.compose.foundation.Image",
    "import androidx.compose.foundation.background",
    "import androidx.compose.foundation.border",
    "import androidx.compose.foundation.layout.*",
    "import androidx.compose.foundation.shape.RoundedCornerShape",
    "import androidx.compose.foundation.shape.CircleShape",
    "import androidx.compose.foundation.shape.GenericShape",
    "import androidx.compose.ui.graphics.Shape",
    "import androidx.compose.ui.graphics.asImageBitmap",
    "import androidx.compose.ui.graphics.drawscope.drawIntoCanvas",
    "import androidx.compose.ui.graphics.nativeCanvas",
    "import androidx.compose.ui.graphics.graphicsLayer",
    "import androidx.compose.ui.draw.shadow",
    "import androidx.compose.ui.geometry.Offset",
    "import androidx.compose.ui.layout.ContentScale",
    "import androidx.compose.ui.platform.LocalContext",
    "import androidx.compose.material3.Text",
    "import androidx.compose.runtime.Composable",
    "import androidx.compose.runtime.remember",
    "import androidx.compose.ui.Modifier",
    "import androidx.compose.ui.graphics.Color",
    "import androidx.compose.ui.text.font.FontWeight",
    "import androidx.compose.ui.text.font.FontFamily",
    "import androidx.compose.ui.text.style.TextAlign",
    "import androidx.compose.ui.unit.Dp",
    "import androidx.compose.ui.unit.dp",
    "import androidx.compose.ui.unit.sp",
    "",
    generatedKotlinHelpers,
    "@Composable fun " + functionName + "(target: String = " + safe(project.target) + ") {",
    "    val context = LocalContext.current",
    "    BoxWithConstraints(Modifier.fillMaxWidth().height(" + project.viewport.height + ".dp)) {",
    "        val widthDelta = maxWidth.value - " + project.viewport.width + ".f",
    "        val heightDelta = maxHeight.value - " + project.viewport.height + ".f",
    "        Box(Modifier.fillMaxSize().background(Color(android.graphics.Color.parseColor(" + safe(project.background) + ")))) {",
    layers,
    "        }",
    "    }",
    "}",
    "",
  ].join("\n");
}

const generatedSwiftHelpers = "private struct GeneratedUxShape: Shape {\n    let kind: String\n    let radius: CGFloat\n    func path(in rect: CGRect) -> Path {\n        var path = Path()\n        let w = rect.width, h = rect.height, x = rect.minX, y = rect.minY\n        switch kind {\n        case \"ellipse\", \"avatar\": path.addEllipse(in: rect)\n        case \"triangle\":\n            path.move(to: CGPoint(x: x+w/2, y: y)); path.addLine(to: CGPoint(x: x+w, y: y+h)); path.addLine(to: CGPoint(x: x, y: y+h)); path.closeSubpath()\n        case \"diamond\":\n            path.move(to: CGPoint(x: x+w/2, y: y)); path.addLine(to: CGPoint(x: x+w, y: y+h/2)); path.addLine(to: CGPoint(x: x+w/2, y: y+h)); path.addLine(to: CGPoint(x: x, y: y+h/2)); path.closeSubpath()\n        case \"hexagon\":\n            path.move(to: CGPoint(x: x+w*0.25, y: y)); path.addLine(to: CGPoint(x: x+w*0.75, y: y)); path.addLine(to: CGPoint(x: x+w, y: y+h/2)); path.addLine(to: CGPoint(x: x+w*0.75, y: y+h)); path.addLine(to: CGPoint(x: x+w*0.25, y: y+h)); path.addLine(to: CGPoint(x: x, y: y+h/2)); path.closeSubpath()\n        case \"star\":\n            for index in 0..<10 {\n                let r: CGFloat = index % 2 == 0 ? 0.5 : 0.21\n                let angle = -Double.pi/2 + Double(index)*Double.pi/5\n                let point = CGPoint(x: x+w/2+CGFloat(cos(angle))*w*r, y: y+h/2+CGFloat(sin(angle))*h*r)\n                if index == 0 { path.move(to: point) } else { path.addLine(to: point) }\n            }\n            path.closeSubpath()\n        case \"line\":\n            let thickness = max(1, min(h, radius))\n            path.addRoundedRect(in: CGRect(x: x, y: rect.midY-thickness/2, width: w, height: thickness), cornerSize: CGSize(width: thickness/2, height: thickness/2))\n        case \"pill\":\n            let side = min(rect.width, rect.height)/2\n            path.addRoundedRect(in: rect, cornerSize: CGSize(width: side, height: side))\n        default:\n            path.addRoundedRect(in: rect, cornerSize: CGSize(width: radius, height: radius))\n        }\n        return path\n    }\n}\n\nprivate func generatedUxRegisterFont(dataURL: String, fallback: String) -> String {\n    guard let comma = dataURL.firstIndex(of: \",\") else { return fallback }\n    let header = String(dataURL[..<comma]).lowercased()\n    guard header == \"data:font/ttf;base64\" || header == \"data:font/otf;base64\",\n          let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),\n          data.count <= 4 * 1024 * 1024 else { return fallback }\n    let ext = header.contains(\"otf\") ? \"otf\" : \"ttf\"\n    let safeName = fallback.replacingOccurrences(of: \"[^a-zA-Z0-9-]+\", with: \"-\", options: .regularExpression)\n    let url = FileManager.default.temporaryDirectory.appendingPathComponent(\"env-ux-export-font-\" + safeName + \".\" + ext)\n    do {\n        try data.write(to: url, options: .atomic)\n        var error: Unmanaged<CFError>?\n        let ok = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)\n        guard ok || CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) != nil else { return fallback }\n        return CTFontCopyFamilyName(CTFontCreateWithURL(url as CFURL, 0, nil)) as String\n    } catch { return fallback }\n}";

export function generateSwiftProject(project: UxCodegenProject): string {
  const viewName = sourceName(project.name) + "DesignView";
  const layers = project.elements.map((layer) => {
    const h = layer.horizontalConstraint || "left", v = layer.verticalConstraint || "top";
    const xShift = h === "center" ? "deltaWidth / 2" : h === "right" ? "deltaWidth" : "0";
    const yShift = v === "center" ? "deltaHeight / 2" : v === "bottom" ? "deltaHeight" : "0";
    let width = h === "stretch" ? "max(CGFloat(" + Math.max(1, layer.minWidth || 1) + "), CGFloat(" + layer.width + ") + deltaWidth)" : "CGFloat(" + layer.width + ")";
    if (h === "stretch" && layer.maxWidth && layer.maxWidth > 0) width = "min(" + width + ", CGFloat(" + layer.maxWidth + "))";
    const height = v === "stretch" ? "max(1, CGFloat(" + layer.height + ") + deltaHeight)" : "CGFloat(" + layer.height + ")";
    const fill = layer.background === "transparent" ? "Color.clear" : "Color(hex: " + safe(layer.background) + ")";
    let child: string;
    if (layer.kind === "icon" && layer.iconSvg) {
      const [vbX,vbY,vbW,vbH] = svgViewBox(layer.iconViewBox);
      const drawables = extractSvgDrawables(layer.iconSvg);
      const views = drawables.flatMap((drawable) => {
        const style = svgStyle(drawable, layer);
        const shiftedPath = "(" + swiftPathExpression(drawable) + ").applying(CGAffineTransform(translationX: -" + vbX + ", y: -" + vbY + "))";
        const result: string[] = [];
        if (style.fill) result.push(shiftedPath + ".fill(Color(hex: " + safe(style.fill) + "))");
        if (style.stroke) result.push(shiftedPath + ".stroke(Color(hex: " + safe(style.stroke) + "), lineWidth: " + style.strokeWidth + ")");
        return result;
      });
      child = views.length
        ? "GeometryReader { geometry in ZStack(alignment: .topLeading) { " + views.join(" ") + " }.frame(width: " + vbW + ", height: " + vbH + ", alignment: .topLeading).scaleEffect(x: geometry.size.width / " + vbW + ", y: geometry.size.height / " + vbH + ", anchor: .topLeading) }"
        : "Text(" + safe(layer.iconName || layer.name) + ").foregroundStyle(Color(hex: " + safe(layer.color) + "))";
    } else if (layer.kind === "chart") {
      const chart = parseUxUiStudioChartData(layer.text);
      const points = chart.points.map((point) => "(" + safe(point.label) + ", " + (Number.isInteger(point.value) ? point.value.toFixed(1) : String(point.value)) + ")").join(", ");
      const chartColor = "Color(hex: " + safe(layer.color) + ")";
      const chartView = chart.points.length
        ? "GeometryReader { geometry in let chartPoints: [(label: String, value: Double)] = [" + points + "]; let maximum = max(chartPoints.map { $0.value }.max() ?? 1, 1); HStack(alignment: .bottom, spacing: 2) { ForEach(Array(chartPoints.enumerated()), id: \\.offset) { entry in let point = entry.element; VStack(spacing: 1) { Text(point.value.rounded() == point.value ? String(format: \\\"%.0f\\\", point.value) : String(format: \\\"%.1f\\\", point.value)).font(.system(size: max(5, CGFloat(" + Math.round(layer.fontSize * 0.52) + " * scale))); Spacer(minLength: 0); RoundedRectangle(cornerRadius: 2).fill(" + chartColor + ").frame(height: max(1, (geometry.size.height - 24) * CGFloat(point.value / maximum))); Text(point.label).font(.system(size: max(5, CGFloat(" + Math.round(layer.fontSize * 0.52) + " * scale))).lineLimit(1).minimumScaleFactor(0.55) }.frame(maxWidth: .infinity, maxHeight: .infinity) } } }"
        : "Text(\\\"Enter data as Label: value\\\").font(.system(size: max(5, CGFloat(" + Math.round(layer.fontSize * 0.62) + " * scale))).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)";
      content = "VStack(alignment: .leading, spacing: 2) { Text(" + safe(chart.title) + ").font(.system(size: max(6, CGFloat(" + Math.round(layer.fontSize * 0.82) + " * scale), weight: .semibold)).lineLimit(1); " + chartView + (chart.invalidRows > 0 ? "; Text(" + safe(chart.invalidRows + " invalid row(s) ignored") + ").font(.system(size: max(5, CGFloat(" + Math.round(layer.fontSize * 0.45) + " * scale))).foregroundStyle(.orange).lineLimit(1)" : "") + " }";
    } else if (layer.kind === "line") {
      const lineColor = layer.background === "transparent" ? layer.color : layer.background;
      child = "Rectangle().fill(Color(hex: " + safe(lineColor) + "))";
    } else if (layer.kind === "image" && layer.imageDataUrl) {
      child = "Group { if let image = generatedUxImage(dataURL: " + safe(layer.imageDataUrl) + ") { Image(uiImage: image).resizable().scaledToFill() } else { Text(" + safe(layer.name) + ") } }";
    } else {
      const weight = layer.fontWeight >= 700 ? ".bold" : layer.fontWeight >= 600 ? ".semibold" : ".regular";
      const fontFamily = layer.fontDataUrl
        ? "generatedUxRegisterFont(dataURL: " + safe(layer.fontDataUrl) + ", fallback: " + safe(layer.fontFamily) + ")"
        : safe(layer.fontFamily);
      child = "Text(" + safe(layer.text) + ").font(.custom(" + fontFamily + ", size: " + layer.fontSize + ")).fontWeight(" + weight + ").foregroundStyle(Color(hex: " + safe(layer.color) + "))";
    }
    const shape = layer.kind === "line" ? "RoundedRectangle(cornerRadius: CGFloat(" + Math.max(1, layer.height) + ") / 2)" : "GeneratedUxShape(kind: " + safe(layer.kind) + ", radius: CGFloat(" + layer.radius + "))";
    const overlay = layer.borderWidth > 0 ? ".overlay(" + shape + ".stroke(Color(hex: " + safe(layer.borderColor) + "), lineWidth: CGFloat(" + layer.borderWidth + ")))" : "";
    const shadow = layer.shadow ? ".shadow(color: Color.black.opacity(0.14), radius: 10, x: 0, y: 3)" : "";
    return [
      "            if " + safe(visibility(layer)) + ".contains(target) {",
      "                " + child,
      "                    .frame(width: " + width + ", height: " + height + ", alignment: .topLeading)",
      "                    .background(" + fill + ")",
      "                    .clipShape(" + shape + ")",
      overlay ? "                    " + overlay : "",
      shadow ? "                    " + shadow : "",
      "                    .opacity(" + layer.opacity + ")",
      "                    .position(x: CGFloat(" + (layer.x + layer.marginLeft) + ") + " + xShift + " + (" + width + ") / 2, y: CGFloat(" + (layer.y + layer.marginTop) + ") + " + yShift + " + (" + height + ") / 2)",
      "            }",
    ].filter(Boolean).join("\n");
  }).join("\n");
  return [
    "// Generated by enV UX/UI Studio. Artboard " + project.viewport.width + " x " + project.viewport.height + " px.",
    "import SwiftUI",
    "import UIKit",
    "import CoreText",
    "",
    "extension Color {",
    '  init(hex: String) { let value = UInt64(hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted), radix: 16) ?? 0; self.init(.sRGB, red: Double((value >> 16) & 255)/255, green: Double((value >> 8) & 255)/255, blue: Double(value & 255)/255, opacity: 1) }',
    "}",
    generatedSwiftHelpers,
    "private func generatedUxImage(dataURL: String) -> UIImage? { guard let comma = dataURL.firstIndex(of: \",\"), dataURL[..<comma].lowercased().hasPrefix(\"data:image/\") else { return nil }; let payload = String(dataURL[dataURL.index(after: comma)...]); guard let data = Data(base64Encoded: payload), data.count <= 4 * 1024 * 1024 else { return nil }; return UIImage(data: data) }",
    "struct " + viewName + ": View {",
    "  let target: String = " + safe(project.target),
    "  var body: some View {",
    "    GeometryReader { proxy in",
    "      let deltaWidth = proxy.size.width - CGFloat(" + project.viewport.width + ")",
    "      let deltaHeight = proxy.size.height - CGFloat(" + project.viewport.height + ")",
    "      ZStack(alignment: .topLeading) {",
    '        Color(hex: ' + safe(project.background) + ")",
    layers,
    "      }",
    "    }",
    "    .frame(maxWidth: .infinity, minHeight: " + project.viewport.height + ")",
    "  }",
    "}",
    "",
  ].join("\n");
}

