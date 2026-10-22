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
  "background:" + (l.background === "transparent" ? "transparent" : l.background),
  "border:" + l.borderWidth + "px solid " + (l.borderWidth > 0 ? l.borderColor : "transparent"),
  "border-radius:" + l.radius + "px","opacity:" + l.opacity,"font-family:" + safe(l.fontFamily),
  "font-size:" + l.fontSize + "px","font-weight:" + l.fontWeight,"line-height:" + l.lineHeight,
  "letter-spacing:" + l.letterSpacing + "px","text-align:" + l.textAlign,"white-space:pre-wrap","overflow:hidden",
  "display:flex","align-items:" + (l.textAlign === "center" ? "center" : "flex-start"),
  "justify-content:" + (l.textAlign === "center" ? "center" : l.textAlign === "right" ? "flex-end" : "flex-start"),
  l.shadow ? "box-shadow:0 3px 10px #0f172a24" : "",
  shapeCss(l),
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
  const fontFaces = embeddedFontCss(project);
  const fontLinks = remoteFontFamilies(project).map((family) => '<link rel="stylesheet" href="' + esc(googleFontLink(family)) + '">').join("");
  const rules = [
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
  return [
    'import React from "react";',
    "",
    "const project = " + json + " as const;",
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
    } else {
      const fontFamilyCode = layer.fontDataUrl
        ? "generatedUxFontFamily(context, " + safe(layer.fontFamily) + ", " + safe(layer.fontDataUrl) + ", " + layer.fontWeight + ")"
        : "FontFamily(Typeface.create(" + safe(layer.fontFamily) + ", " + (layer.fontWeight >= 600 ? "Typeface.BOLD" : "Typeface.NORMAL") + "))";
      content = "Text(" + safe(layer.text) + ", color = Color(android.graphics.Color.parseColor(" + safe(layer.color) + ")), fontSize = " + layer.fontSize + ".sp, fontWeight = FontWeight(" + layer.fontWeight + "), fontFamily = " + fontFamilyCode + ", modifier = Modifier.fillMaxSize())";
    }
    const radius = "generatedUxShape(" + safe(layer.kind) + ", " + layer.radius + ".dp)";
    return [
      "        // " + layer.name.replace(/\n/g, " ") + " (" + layer.kind + "); anchors " + h + "/" + v + "; visibleOn=" + visibility(layer).join(","),
      "        if (listOf(" + visibility(layer).map(safe).join(", ") + ").contains(target)) Box(Modifier.offset(x = (" + x + ").dp, y = (" + y + ").dp).size(width = (" + width + ").dp, height = (" + height + ").dp).background(Color(android.graphics.Color.parseColor(" + safe(layer.background === "transparent" ? project.background : layer.background) + ")), " + radius + ").padding(" + layer.padding + ".dp)) { " + content + " }",
    ].join("\n");
  }).join("\n");
  return [
    "// Generated by enV UX/UI Studio. Target artboard: " + project.viewport.width + " x " + project.viewport.height + " px.",
    "import android.webkit.WebView",
    "import android.content.Context",
    "import android.graphics.Typeface",
    "import android.util.Base64",
    "import java.io.File",
    "import androidx.compose.foundation.background",
    "import androidx.compose.foundation.layout.*",
    "import androidx.compose.foundation.shape.RoundedCornerShape",
    "import androidx.compose.foundation.shape.CircleShape",
    "import androidx.compose.foundation.shape.GenericShape",
    "import androidx.compose.ui.graphics.Shape",
    "import androidx.compose.ui.unit.Dp",
    "import androidx.compose.material3.Text",
    "import androidx.compose.runtime.Composable",
    "import androidx.compose.ui.Modifier",
    "import androidx.compose.ui.graphics.Color",
    "import androidx.compose.ui.text.font.FontWeight",
    "import androidx.compose.ui.text.font.FontFamily",
    "import androidx.compose.ui.unit.dp",
    "import androidx.compose.ui.unit.sp",
    "import androidx.compose.ui.viewinterop.AndroidView",
    "import androidx.compose.ui.platform.LocalContext",
    "",
    String.raw`private fun generatedUxShape(kind: String, radius: Dp): Shape = when (kind) {
    "ellipse", "avatar" -> CircleShape
    "pill" -> RoundedCornerShape(percent = 50)
    "triangle" -> GenericShape { size, _ -> moveTo(size.width / 2, 0f); lineTo(size.width, size.height); lineTo(0f, size.height); close() }
    "diamond" -> GenericShape { size, _ -> moveTo(size.width / 2, 0f); lineTo(size.width, size.height / 2); lineTo(size.width / 2, size.height); lineTo(0f, size.height / 2); close() }
    "hexagon" -> GenericShape { size, _ -> moveTo(size.width * .25f, 0f); lineTo(size.width * .75f, 0f); lineTo(size.width, size.height / 2); lineTo(size.width * .75f, size.height); lineTo(size.width * .25f, size.height); lineTo(0f, size.height / 2); close() }
    "star" -> GenericShape { size, _ ->
        for (index in 0 until 10) {
            val r = if (index % 2 == 0) .5f else .21f
            val angle = -Math.PI.toFloat() / 2 + index * Math.PI.toFloat() / 5
            val px = size.width / 2 + kotlin.math.cos(angle) * size.width * r
            val py = size.height / 2 + kotlin.math.sin(angle) * size.height * r
            if (index == 0) moveTo(px, py) else lineTo(px, py)
        }
        close()
    }
    else -> RoundedCornerShape(radius)
}

private fun generatedUxFontFamily(context: Context, family: String, dataUrl: String, weight: Int): FontFamily {
    val style = if (weight >= 600) Typeface.BOLD else Typeface.NORMAL
    var typeface = Typeface.create(family, style)
    if (dataUrl.startsWith("data:font/") && dataUrl.contains(",")) {
        runCatching {
            val mime = dataUrl.substringAfter("data:").substringBefore(";")
            val extension = if (mime.contains("otf")) "otf" else "ttf"
            val bytes = Base64.decode(dataUrl.substringAfter(","), Base64.DEFAULT)
            require(bytes.size <= 4 * 1024 * 1024)
            val file = File(context.cacheDir, "env-export-font-" + family.hashCode().toString() + "." + extension)
            if (!file.exists() || file.length() != bytes.size.toLong()) file.writeBytes(bytes)
            typeface = Typeface.createFromFile(file)
        }
    }
    return FontFamily(typeface)
}`,
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
    let child: string;
    if (layer.kind === "icon" && layer.iconSvg) {
      const markup = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='" + (layer.iconViewBox || "0 0 24 24") + "'>" + layer.iconSvg + "</svg>";
      child = "GeneratedHTMLAsset(markup: " + safe(markup) + ")";
    } else if (layer.kind === "image" && layer.imageDataUrl) {
      const markup = "<img src='" + layer.imageDataUrl + "' style='width:100%;height:100%;object-fit:cover' />";
      child = "GeneratedHTMLAsset(markup: " + safe(markup) + ")";
    } else if (layer.kind === "line") {
      child = "Rectangle().fill(Color(hex: " + safe(layer.background === "transparent" ? project.background : layer.background) + "))";
    } else {
      const weight = layer.fontWeight >= 700 ? ".bold" : layer.fontWeight >= 600 ? ".semibold" : ".regular";
      const fontFamily = layer.fontDataUrl
        ? "generatedUxRegisterFont(dataURL: " + safe(layer.fontDataUrl) + ", fallback: " + safe(layer.fontFamily) + ")"
        : safe(layer.fontFamily);
      child = "Text(" + safe(layer.text) + ").font(.custom(" + fontFamily + ", size: " + layer.fontSize + ")).fontWeight(" + weight + ").foregroundStyle(Color(hex: " + safe(layer.color) + "))";
    }
    return [
      "            if [" + visibility(layer).map(safe).join(", ") + "].contains(target) {",
      "                " + child,
      "                    .frame(width: " + width + ", height: " + height + ", alignment: .topLeading)",
      "                    .background(Color(hex: " + safe(layer.background === "transparent" ? project.background : layer.background) + "))",
      "                    .clipShape(GeneratedUxShape(kind: " + safe(layer.kind) + ", radius: CGFloat(" + (layer.kind === "line" ? Math.max(1, layer.height) : layer.radius) + ")))",
      "                    .position(x: CGFloat(" + layer.x + ") + " + xShift + " + (" + width + ") / 2, y: CGFloat(" + layer.y + ") + " + yShift + " + (" + height + ") / 2)",
      "            }",
    ].join("\n");
  }).join("\n");
  return [
    "// Generated by enV UX/UI Studio. Artboard " + project.viewport.width + " x " + project.viewport.height + " px.",
    "import SwiftUI",
    "import WebKit",
    "import CoreText",
    "",
    "struct GeneratedHTMLAsset: UIViewRepresentable {",
    "  let markup: String",
    "  func makeUIView(context: Context) -> WKWebView { let view = WKWebView(); view.isOpaque = false; view.backgroundColor = .clear; view.scrollView.isScrollEnabled = false; return view }",
    '  func updateUIView(_ view: WKWebView, context: Context) { view.loadHTMLString("<html><body style=\'margin:0\'>" + markup + "</body></html>", baseURL: nil) }',
    "}",
    "extension Color {",
    '  init(hex: String) { let value = UInt64(hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted), radix: 16) ?? 0; self.init(.sRGB, red: Double((value >> 16) & 255)/255, green: Double((value >> 8) & 255)/255, blue: Double(value & 255)/255, opacity: 1) }',
    "}",
    generatedSwiftHelpers,
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
