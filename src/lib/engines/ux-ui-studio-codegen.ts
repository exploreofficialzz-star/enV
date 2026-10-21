export type UxCodegenLayer = {
  id: string; kind: string; name: string; x: number; y: number; width: number; height: number;
  text: string; iconName: string; iconSvg: string; iconViewBox: string; imageDataUrl: string;
  color: string; background: string; borderColor: string; borderWidth: number; radius: number;
  padding: number; marginTop: number; marginRight: number; marginBottom: number; marginLeft: number;
  fontFamily: string; fontSize: number; fontWeight: number; lineHeight: number; letterSpacing: number;
  textAlign: "left" | "center" | "right"; opacity: number; shadow: boolean;
  horizontalConstraint?: "left" | "center" | "right" | "stretch";
  verticalConstraint?: "top" | "center" | "bottom" | "stretch";
  minWidth?: number; maxWidth?: number; visibleOn?: string[];
  referenceWidth?: number; referenceHeight?: number; componentKey?: string;
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
const layerStyle = (l: UxCodegenLayer) => [
  "box-sizing:border-box","padding:" + l.padding + "px","color:" + l.color,
  "background:" + (l.background === "transparent" ? "transparent" : l.background),
  "border:" + l.borderWidth + "px solid " + (l.borderWidth > 0 ? l.borderColor : "transparent"),
  "border-radius:" + l.radius + "px","opacity:" + l.opacity,"font-family:" + safe(l.fontFamily),
  "font-size:" + l.fontSize + "px","font-weight:" + l.fontWeight,"line-height:" + l.lineHeight,
  "letter-spacing:" + l.letterSpacing + "px","text-align:" + l.textAlign,"white-space:pre-wrap","overflow:hidden",
  "display:flex","align-items:" + (l.textAlign === "center" ? "center" : "flex-start"),
  "justify-content:" + (l.textAlign === "center" ? "center" : l.textAlign === "right" ? "flex-end" : "flex-start"),
  l.shadow ? "box-shadow:0 3px 10px #0f172a24" : "",
].filter(Boolean).join(";");
const layerHtml = (l: UxCodegenLayer, p: UxCodegenProject) => {
  const common = 'class="env-layer env-layer-' + esc(l.id) + '" data-visible-on="' + visibility(l).join(" ") + '" style="' + esc("position:absolute;" + cssGeometry(l,p) + ";" + layerStyle(l)) + '"';
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
  const rules = [
    "@media (max-width:" + project.breakpoints.mobile + "px){.env-layer:not([data-visible-on~='mobile']){display:none!important}}",
    "@media (min-width:" + (project.breakpoints.mobile + 1) + "px) and (max-width:" + (project.breakpoints.desktop - 1) + "px){.env-layer:not([data-visible-on~='tablet']){display:none!important}}",
    "@media (min-width:" + project.breakpoints.desktop + "px){.env-layer:not([data-visible-on~='desktop']){display:none!important}}",
  ].join("\n");
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    esc(project.name) + '</title><style>:root{' + tokens + '}*{box-sizing:border-box}body{margin:0;padding:16px;background:#f1f5f9;font-family:Inter,system-ui,sans-serif}.env-artboard{position:relative;container-type:size;width:min(100%,' +
    project.viewport.width + 'px);aspect-ratio:' + project.viewport.width + '/' + project.viewport.height + ';margin:0 auto;background:' + project.background + ';overflow:hidden}.env-layer{min-width:0}' +
    rules + '</style></head><body><main class="env-artboard" role="img" aria-label="' + esc(project.name) + ' design">' +
    project.elements.map((layer) => layerHtml(layer, project)).join("\n") + '</main></body></html>';
}

export function generateReactProject(project: UxCodegenProject): string {
  const component = sourceName(project.name) + "Design";
  const json = JSON.stringify(project).replace(/</g, "\\u003c");
  return [
    'import React from "react";',
    "",
    "const project = " + json + " as const;",
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
    '    {project.elements.filter((item) => !item.visibleOn || item.visibleOn.includes(project.target)).map((item) => {',
    '      const style: React.CSSProperties = {position:"absolute",boxSizing:"border-box",...positionX(item),...positionY(item),padding:item.padding,color:item.color,background:item.background === "transparent" ? "transparent" : item.background,border:item.borderWidth + "px solid " + (item.borderWidth ? item.borderColor : "transparent"),borderRadius:item.radius,opacity:item.opacity,fontFamily:item.fontFamily,fontSize:item.fontSize,fontWeight:item.fontWeight,lineHeight:item.lineHeight,letterSpacing:item.letterSpacing,textAlign:item.textAlign,whiteSpace:"pre-wrap",overflow:"hidden",display:"flex",alignItems:item.textAlign==="center"?"center":"flex-start",justifyContent:item.textAlign==="center"?"center":item.textAlign==="right"?"flex-end":"flex-start",...(item.shadow?{boxShadow:"0 3px 10px #0f172a24"}:{})};',
    "      if (item.minWidth > 0) style.minWidth = item.minWidth; if (item.maxWidth > 0) style.maxWidth = item.maxWidth;",
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

export function generateKotlinProject(project: UxCodegenProject): string {
  const functionName = sourceName(project.name) + "Design";
  const layers = project.elements.map((layer) => {
    const h = layer.horizontalConstraint || "left", v = layer.verticalConstraint || "top";
    const x = h === "center" ? "(" + layer.x + "f + widthDelta / 2f)" : h === "right" ? "(maxWidth.value - " + Math.max(0, refW(layer, project) - layer.x - layer.width) + "f - " + layer.width + "f)" : layer.x + "f";
    const y = v === "center" ? "(" + layer.y + "f + heightDelta / 2f)" : v === "bottom" ? "(maxHeight.value - " + Math.max(0, refH(layer, project) - layer.y - layer.height) + "f - " + layer.height + "f)" : layer.y + "f";
    let width = h === "stretch" ? "(" + layer.width + "f + widthDelta).coerceAtLeast(" + Math.max(1, layer.minWidth || 1) + "f)" : layer.width + "f";
    if (h === "stretch" && layer.maxWidth && layer.maxWidth > 0) width = width + ".coerceAtMost(" + layer.maxWidth + "f)";
    const height = v === "stretch" ? "(" + layer.height + "f + heightDelta).coerceAtLeast(1f)" : layer.height + "f";
    let content: string;
    if (layer.kind === "icon" && layer.iconSvg) {
      const html = "<!doctype html><html><body style='margin:0'><svg viewBox='" + (layer.iconViewBox || "0 0 24 24") + "' width='100%' height='100%'>" + layer.iconSvg + "</svg></body></html>";
      content = "AndroidView(factory = { context -> WebView(context).apply { settings.javaScriptEnabled = false; setBackgroundColor(android.graphics.Color.TRANSPARENT); loadDataWithBaseURL(null, " + safe(html) + ', "text/html", "UTF-8", null) } }, modifier = Modifier.fillMaxSize())';
    } else if (layer.kind === "image" && layer.imageDataUrl) {
      const html = "<!doctype html><html><body style='margin:0'><img style='width:100%;height:100%;object-fit:cover' src='" + layer.imageDataUrl + "'></body></html>";
      content = "AndroidView(factory = { context -> WebView(context).apply { settings.javaScriptEnabled = false; setBackgroundColor(android.graphics.Color.TRANSPARENT); loadDataWithBaseURL(null, " + safe(html) + ', "text/html", "UTF-8", null) } }, modifier = Modifier.fillMaxSize())';
    } else content = "Text(" + safe(layer.text) + ", color = Color(android.graphics.Color.parseColor(" + safe(layer.color) + ")), fontSize = " + layer.fontSize + ".sp, fontWeight = FontWeight(" + layer.fontWeight + "), modifier = Modifier.fillMaxSize())";
    return [
      "        // " + layer.name.replace(/\n/g, " ") + " (" + layer.kind + "); anchors " + h + "/" + v + "; visibleOn=" + visibility(layer).join(","),
      "        if (listOf(" + visibility(layer).map(safe).join(", ") + ").contains(target)) Box(Modifier.offset(x = (" + x + ").dp, y = (" + y + ").dp).size(width = (" + width + ").dp, height = (" + height + ").dp).background(Color(android.graphics.Color.parseColor(" + safe(layer.background === "transparent" ? project.background : layer.background) + ")), RoundedCornerShape(" + layer.radius + ".dp)).padding(" + layer.padding + ".dp)) { " + content + " }",
    ].join("\n");
  }).join("\n");
  return [
    "// Generated by enV UX/UI Studio. Target artboard: " + project.viewport.width + " x " + project.viewport.height + " px.",
    "import android.webkit.WebView",
    "import androidx.compose.foundation.background",
    "import androidx.compose.foundation.layout.*",
    "import androidx.compose.foundation.shape.RoundedCornerShape",
    "import androidx.compose.material3.Text",
    "import androidx.compose.runtime.Composable",
    "import androidx.compose.ui.Modifier",
    "import androidx.compose.ui.graphics.Color",
    "import androidx.compose.ui.text.font.FontWeight",
    "import androidx.compose.ui.unit.dp",
    "import androidx.compose.ui.unit.sp",
    "import androidx.compose.ui.viewinterop.AndroidView",
    "",
    "@Composable fun " + functionName + "(target: String = " + safe(project.target) + ") {",
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

export function generateSwiftProject(project: UxCodegenProject): string {
  const viewName = sourceName(project.name) + "DesignView";
  const layers = project.elements.map((layer) => {
    const h = layer.horizontalConstraint || "left", v = layer.verticalConstraint || "top";
    const xShift = h === "center" ? "deltaWidth / 2" : h === "right" ? "deltaWidth" : "0";
    const yShift = v === "center" ? "deltaHeight / 2" : v === "bottom" ? "deltaHeight" : "0";
    let width = h === "stretch" ? "max(CGFloat(" + Math.max(1, layer.minWidth || 1) + "), CGFloat(" + layer.width + ") + deltaWidth)" : "CGFloat(" + layer.width + ")";
    if (h === "stretch" && layer.maxWidth && layer.maxWidth > 0) width = "min(" + width + ", CGFloat(" + layer.maxWidth + "))";
    const height = v === "stretch" ? "max(1, CGFloat(" + layer.height + ") + deltaHeight)" : "CGFloat(" + layer.height + ")";
    let child: string;
    if (layer.kind === "icon" && layer.iconSvg) {
      const markup = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='" + (layer.iconViewBox || "0 0 24 24") + "'>" + layer.iconSvg + "</svg>";
      child = "GeneratedHTMLAsset(markup: " + safe(markup) + ")";
    } else if (layer.kind === "image" && layer.imageDataUrl) {
      const markup = "<img src='" + layer.imageDataUrl + "' style='width:100%;height:100%;object-fit:cover' />";
      child = "GeneratedHTMLAsset(markup: " + safe(markup) + ")";
    } else {
      const weight = layer.fontWeight >= 700 ? ".bold" : layer.fontWeight >= 600 ? ".semibold" : ".regular";
      child = "Text(" + safe(layer.text) + ").font(.custom(" + safe(layer.fontFamily) + ", size: " + layer.fontSize + ")).fontWeight(" + weight + ").foregroundStyle(Color(hex: " + safe(layer.color) + "))";
    }
    return [
      "            if [" + visibility(layer).map(safe).join(", ") + "].contains(target) {",
      "                " + child,
      "                    .frame(width: " + width + ", height: " + height + ", alignment: .topLeading)",
      "                    .background(Color(hex: " + safe(layer.background === "transparent" ? project.background : layer.background) + "))",
      "                    .clipShape(RoundedRectangle(cornerRadius: " + layer.radius + "))",
      "                    .position(x: CGFloat(" + layer.x + ") + " + xShift + " + (" + width + ") / 2, y: CGFloat(" + layer.y + ") + " + yShift + " + (" + height + ") / 2)",
      "            }",
    ].join("\n");
  }).join("\n");
  return [
    "// Generated by enV UX/UI Studio. Artboard " + project.viewport.width + " x " + project.viewport.height + " px.",
    "import SwiftUI",
    "import WebKit",
    "",
    "struct GeneratedHTMLAsset: UIViewRepresentable {",
    "  let markup: String",
    "  func makeUIView(context: Context) -> WKWebView { let view = WKWebView(); view.isOpaque = false; view.backgroundColor = .clear; view.scrollView.isScrollEnabled = false; return view }",
    '  func updateUIView(_ view: WKWebView, context: Context) { view.loadHTMLString("<html><body style=\'margin:0\'>" + markup + "</body></html>", baseURL: nil) }',
    "}",
    "extension Color {",
    '  init(hex: String) { let value = UInt64(hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted), radix: 16) ?? 0; self.init(.sRGB, red: Double((value >> 16) & 255)/255, green: Double((value >> 8) & 255)/255, blue: Double(value & 255)/255, opacity: 1) }',
    "}",
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
