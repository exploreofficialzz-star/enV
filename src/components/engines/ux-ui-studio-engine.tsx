import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Copy, Download, FileJson, Redo2, Undo2,
  Grid2X2, Layers, Laptop, LayoutTemplate, Monitor, Palette, Plus, Search, Smartphone,
  Trash2, WandSparkles, X, ZoomIn, ZoomOut,
} from "lucide-react";

type DeviceTarget = "mobile" | "desktop";
type PanelTab = "components" | "icons" | "presets" | "tokens";
type InspectorTab = "design" | "spec";
type LayerKind = "text" | "button" | "card" | "input" | "image" | "icon" | "rect" | "ellipse" | "divider" | "navbar" | "tabbar" | "row" | "checkbox" | "avatar" | "badge" | "switch" | "toggle" | "progress" | "slider" | "radio" | "dropdown" | "search" | "textarea" | "table" | "chart" | "modal" | "breadcrumb" | "tooltip" | "list" | "video" | "logo" | "tabs" | "menu" | "spacer";
type Align = "left" | "center" | "right";

type DesignLayer = {
  id: string; kind: LayerKind; name: string; x: number; y: number; width: number; height: number;
  text: string; iconName: string; iconSvg: string; iconViewBox: string; imageDataUrl: string;
  iconLicense: string; iconAuthor: string;
  color: string; background: string; borderColor: string; borderWidth: number; radius: number;
  padding: number; marginTop: number; marginRight: number; marginBottom: number; marginLeft: number;
  fontFamily: string; fontSize: number; fontWeight: number; lineHeight: number; letterSpacing: number;
  textAlign: Align; opacity: number; shadow: boolean;
};

type SavedProject = {
  schemaVersion: 1; name: string; target: DeviceTarget; background: string;
  viewport: { width: number; height: number }; elements: DesignLayer[]; updatedAt: string;
};

const STORAGE_KEY = "env-ux-ui-studio-project-v1";
const FONT_OPTIONS = ["Inter", "Roboto", "SF Pro Display", "Arial", "system-ui", "Georgia", "Times New Roman", "Courier New"];
const SWATCHES = ["#111827", "#374151", "#6B7280", "#F9FAFB", "#FFFFFF", "#2563EB", "#7C3AED", "#DB2777", "#059669", "#D97706", "#DC2626", "#0F766E"];
const COMPONENTS: Array<{ kind: LayerKind; label: string; description: string }> = [
  { kind: "text", label: "Text", description: "Heading or paragraph" },
  { kind: "button", label: "Button", description: "Primary action" },
  { kind: "card", label: "Card", description: "Content container" },
  { kind: "input", label: "Input", description: "Text field" },
  { kind: "image", label: "Image", description: "Image or placeholder" },
  { kind: "icon", label: "Icon", description: "Searchable vector icon" },
  { kind: "navbar", label: "Navigation", description: "Header bar" },
  { kind: "tabbar", label: "Tab bar", description: "Bottom navigation" },
  { kind: "row", label: "List row", description: "Label and detail" },
  { kind: "checkbox", label: "Checkbox", description: "Selection control" },
  { kind: "avatar", label: "Avatar", description: "Profile or user image" },
  { kind: "badge", label: "Badge", description: "Status or tag" },
  { kind: "switch", label: "Switch", description: "On/off control" },
  { kind: "progress", label: "Progress bar", description: "Completion indicator" },
  { kind: "slider", label: "Slider", description: "Range control" },
  { kind: "radio", label: "Radio button", description: "Single-choice control" },
  { kind: "dropdown", label: "Dropdown", description: "Select menu field" },
  { kind: "search", label: "Search field", description: "Search input" },
  { kind: "textarea", label: "Text area", description: "Multiline input" },
  { kind: "table", label: "Table", description: "Tabular information" },
  { kind: "chart", label: "Bar chart", description: "Data visualisation" },
  { kind: "modal", label: "Dialog / modal", description: "Overlay dialog panel" },
  { kind: "breadcrumb", label: "Breadcrumb", description: "Navigation trail" },
  { kind: "tooltip", label: "Tooltip", description: "Contextual help" },
  { kind: "list", label: "List item", description: "Structured row" },
  { kind: "video", label: "Video", description: "Media placeholder" },
  { kind: "logo", label: "Wordmark", description: "Brand text mark" },
  { kind: "tabs", label: "Tabs", description: "Tab navigation" },
  { kind: "menu", label: "Menu bar", description: "Desktop navigation" },
  { kind: "spacer", label: "Spacer", description: "Layout spacing" },
  { kind: "divider", label: "Divider", description: "Hairline separator" },
  { kind: "rect", label: "Rectangle", description: "Basic shape" },
  { kind: "ellipse", label: "Circle", description: "Round shape" },
];

const PRESETS: Array<{ id: string; label: string; target: DeviceTarget; description: string }> = [
  { id: "mobile-dashboard", label: "Mobile dashboard", target: "mobile", description: "Cards, greeting, actions and navigation" },
  { id: "mobile-login", label: "Mobile sign-in", target: "mobile", description: "Brand, form fields and primary action" },
  { id: "mobile-commerce", label: "Mobile shop", target: "mobile", description: "Product details and purchase action" },
  { id: "desktop-landing", label: "Website landing", target: "desktop", description: "Hero, call to action and feature cards" },
  { id: "desktop-dashboard", label: "Desktop dashboard", target: "desktop", description: "Sidebar, metrics and data panels" },
  { id: "desktop-settings", label: "Desktop settings", target: "desktop", description: "Settings layout and preference rows" },
];

function layerId(): string {
  return "layer-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function boardSize(target: DeviceTarget) {
  return target === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
}

function makeLayer(kind: LayerKind, x: number, y: number): DesignLayer {
  const shared: DesignLayer = {
    id: layerId(), kind, name: kind.charAt(0).toUpperCase() + kind.slice(1), x, y, width: 180, height: 64,
    text: "", iconName: "", iconSvg: "", iconViewBox: "0 0 24 24", imageDataUrl: "", iconLicense: "", iconAuthor: "",
    color: "#111827", background: "transparent", borderColor: "#E5E7EB", borderWidth: 0, radius: 12,
    padding: 12, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
    fontFamily: "Inter", fontSize: 16, fontWeight: 400, lineHeight: 1.35, letterSpacing: 0,
    textAlign: "left", opacity: 1, shadow: false,
  };
  switch (kind) {
    case "text": return { ...shared, name: "Text", width: 250, height: 48, text: "Your heading", fontSize: 24, fontWeight: 700 };
    case "button": return { ...shared, name: "Primary button", width: 150, height: 46, text: "Continue", background: "#2563EB", color: "#FFFFFF", radius: 12, fontWeight: 600, textAlign: "center" };
    case "card": return { ...shared, name: "Content card", width: 280, height: 134, text: "Card title\nSupporting text goes here", background: "#FFFFFF", color: "#111827", borderColor: "#E5E7EB", borderWidth: 1, radius: 18, padding: 18, shadow: true, fontWeight: 600 };
    case "input": return { ...shared, name: "Text input", width: 280, height: 48, text: "Enter your email", background: "#FFFFFF", color: "#6B7280", borderColor: "#D1D5DB", borderWidth: 1, radius: 10, fontSize: 14 };
    case "image": return { ...shared, name: "Image", width: 250, height: 144, text: "Add an image", background: "#E5E7EB", color: "#6B7280", borderColor: "#D1D5DB", borderWidth: 1, radius: 14, textAlign: "center" };
    case "icon": return { ...shared, name: "Home icon", width: 40, height: 40, iconName: "mdi:home", color: "#2563EB" };
    case "navbar": return { ...shared, name: "Navigation bar", width: 350, height: 58, text: "enV                            Menu", background: "#FFFFFF", color: "#111827", borderColor: "#E5E7EB", borderWidth: 1, radius: 0, padding: 16, fontWeight: 600 };
    case "tabbar": return { ...shared, name: "Bottom navigation", width: 350, height: 62, text: "Home       Explore       Saved       Profile", background: "#FFFFFF", color: "#4B5563", borderColor: "#E5E7EB", borderWidth: 1, radius: 0, padding: 14, fontSize: 12, textAlign: "center" };
    case "row": return { ...shared, name: "List row", width: 300, height: 64, text: "Account settings\nManage your profile", background: "#FFFFFF", color: "#111827", borderColor: "#E5E7EB", borderWidth: 1, radius: 10, padding: 14, fontSize: 14 };
    case "checkbox": return { ...shared, name: "Checkbox", width: 24, height: 24, text: "", background: "#2563EB", color: "#FFFFFF", radius: 5, borderColor: "#2563EB", borderWidth: 1 };
    case "avatar": return { ...shared, name: "Avatar", width: 44, height: 44, text: "A", background: "#DBEAFE", color: "#1D4ED8", radius: 22, textAlign: "center", fontWeight: 700 };
    case "badge": return { ...shared, name: "Status badge", width: 110, height: 30, text: "Active", background: "#DBEAFE", color: "#1D4ED8", radius: 99, padding: 7, fontSize: 12, fontWeight: 600 };
    case "switch": case "toggle": return { ...shared, name: "Toggle switch", width: 46, height: 26, text: "", background: "#2563EB", color: "#FFFFFF", radius: 13, padding: 3 };
    case "progress": return { ...shared, name: "Progress bar", width: 240, height: 10, text: "", background: "#E5E7EB", color: "#2563EB", radius: 5, padding: 0 };
    case "slider": return { ...shared, name: "Range slider", width: 240, height: 24, text: "", background: "#E5E7EB", color: "#2563EB", radius: 12, padding: 0 };
    case "radio": return { ...shared, name: "Radio button", width: 22, height: 22, text: "", background: "#FFFFFF", color: "#2563EB", borderColor: "#2563EB", borderWidth: 2, radius: 11, padding: 0 };
    case "dropdown": return { ...shared, name: "Select menu", width: 280, height: 48, text: "Select an option", background: "#FFFFFF", color: "#6B7280", borderColor: "#D1D5DB", borderWidth: 1, radius: 10, fontSize: 14 };
    case "search": return { ...shared, name: "Search field", width: 280, height: 48, text: "Search…", background: "#FFFFFF", color: "#6B7280", borderColor: "#D1D5DB", borderWidth: 1, radius: 10, fontSize: 14 };
    case "textarea": return { ...shared, name: "Text area", width: 280, height: 96, text: "Enter your message", background: "#FFFFFF", color: "#6B7280", borderColor: "#D1D5DB", borderWidth: 1, radius: 10, fontSize: 14 };
    case "table": return { ...shared, name: "Data table", width: 320, height: 180, text: "Name           Status         Updated\nProject A      Active         Today\nProject B      Draft          Yesterday", background: "#FFFFFF", color: "#111827", borderColor: "#E5E7EB", borderWidth: 1, radius: 12, padding: 14, fontSize: 12 };
    case "chart": return { ...shared, name: "Bar chart", width: 300, height: 180, text: "Activity overview\nJan       Feb       Mar       Apr", background: "#FFFFFF", color: "#111827", borderColor: "#E5E7EB", borderWidth: 1, radius: 14, padding: 14, fontSize: 13 };
    case "modal": return { ...shared, name: "Dialog panel", width: 310, height: 200, text: "Dialog title\n\nDescribe the action here.\n\nCancel          Confirm", background: "#FFFFFF", color: "#111827", borderColor: "#D1D5DB", borderWidth: 1, radius: 18, padding: 18, shadow: true, fontSize: 14 };
    case "breadcrumb": return { ...shared, name: "Breadcrumb trail", width: 300, height: 34, text: "Home / Workspace / Current", color: "#475569", fontSize: 12 };
    case "tooltip": return { ...shared, name: "Tooltip", width: 170, height: 38, text: "Helpful information", background: "#111827", color: "#FFFFFF", radius: 8, padding: 9, fontSize: 12 };
    case "list": return { ...shared, name: "List item", width: 300, height: 64, text: "List item\nSecondary description", background: "#FFFFFF", color: "#111827", borderColor: "#E5E7EB", borderWidth: 1, radius: 10, padding: 14, fontSize: 14 };
    case "video": return { ...shared, name: "Video preview", width: 280, height: 158, text: "Video preview", background: "#0F172A", color: "#FFFFFF", radius: 12, textAlign: "center" };
    case "logo": return { ...shared, name: "Brand wordmark", width: 180, height: 42, text: "Your brand", color: "#2563EB", fontSize: 26, fontWeight: 800 };
    case "tabs": return { ...shared, name: "Tab navigation", width: 320, height: 46, text: "Overview      Activity      Settings", background: "#FFFFFF", color: "#334155", borderColor: "#E5E7EB", borderWidth: 1, radius: 8, padding: 12, fontSize: 13, fontWeight: 600 };
    case "menu": return { ...shared, name: "Desktop menu bar", width: 480, height: 48, text: "File     Edit     View     Insert     Help", background: "#F8FAFC", color: "#334155", borderColor: "#E5E7EB", borderWidth: 1, radius: 6, padding: 12, fontSize: 13 };
    case "spacer": return { ...shared, name: "Layout spacer", width: 80, height: 24, text: "", background: "transparent", borderWidth: 0, radius: 0 };
    case "divider": return { ...shared, name: "Divider", width: 300, height: 1, text: "", background: "#E5E7EB", borderWidth: 0, radius: 0 };
    case "rect": return { ...shared, name: "Rectangle", width: 120, height: 90, text: "", background: "#DBEAFE", color: "#1D4ED8", radius: 12 };
    case "ellipse": return { ...shared, name: "Circle", width: 84, height: 84, text: "", background: "#DBEAFE", color: "#1D4ED8", radius: 42 };
    default: return shared;
  }
}

function createPreset(target: DeviceTarget, presetId?: string): { name: string; background: string; elements: DesignLayer[] } {
  const id = presetId || (target === "mobile" ? "mobile-dashboard" : "desktop-landing");
  const add = (kind: LayerKind, x: number, y: number, patch: Partial<DesignLayer> = {}) => ({ ...makeLayer(kind, x, y), ...patch });
  if (id === "mobile-login") return {
    name: "Mobile sign-in",
    background: "#F8FAFC",
    elements: [
      add("text", 28, 70, { name: "Brand", text: "enV", width: 334, height: 38, color: "#2563EB", fontSize: 28, fontWeight: 800, textAlign: "center" }),
      add("text", 28, 150, { name: "Welcome title", text: "Welcome back", width: 334, height: 38, fontSize: 26, fontWeight: 700 }),
      add("text", 28, 194, { name: "Welcome subtitle", text: "Sign in to continue to your workspace.", width: 334, height: 44, fontSize: 14, color: "#64748B" }),
      add("text", 28, 276, { name: "Email label", text: "Email address", width: 334, height: 24, fontSize: 13, fontWeight: 600 }),
      add("input", 28, 302, { name: "Email field", width: 334, text: "name@example.com" }),
      add("text", 28, 368, { name: "Password label", text: "Password", width: 334, height: 22, fontSize: 13, fontWeight: 600 }),
      add("input", 28, 394, { name: "Password field", width: 334, text: "Enter your password" }),
      add("button", 28, 476, { name: "Sign-in action", width: 334, height: 50, text: "Sign in" }),
      add("text", 28, 548, { name: "Sign-up link", text: "New here? Create an account", width: 334, height: 28, color: "#2563EB", fontSize: 14, textAlign: "center" }),
    ],
  };
  if (id === "mobile-commerce") return {
    name: "Mobile shop",
    background: "#F8FAFC",
    elements: [
      add("navbar", 20, 28, { width: 350, text: "Studio Store                         Bag (0)" }),
      add("image", 24, 112, { width: 342, height: 250, name: "Product image", text: "Product photograph" }),
      add("text", 24, 386, { width: 342, height: 36, name: "Product name", text: "Everyday essentials", fontSize: 24, fontWeight: 700 }),
      add("text", 24, 426, { width: 342, height: 28, name: "Product price", text: "$48.00", fontSize: 18, fontWeight: 700, color: "#2563EB" }),
      add("text", 24, 466, { width: 342, height: 72, name: "Product details", text: "Thoughtfully designed materials with a clean, timeless finish.", color: "#64748B", fontSize: 14 }),
      add("button", 24, 566, { width: 342, height: 52, name: "Purchase button", text: "Add to bag" }),
    ],
  };
  if (id === "desktop-dashboard") return {
    name: "Desktop dashboard",
    background: "#F8FAFC",
    elements: [
      add("navbar", 22, 20, { width: 1396, height: 66, text: "Workspace                                      Search projects                         Help   Profile" }),
      add("text", 60, 118, { width: 700, height: 42, name: "Page heading", text: "Overview", fontSize: 30, fontWeight: 750 }),
      add("text", 60, 164, { width: 700, height: 28, name: "Page subtitle", text: "A clear view of what is happening across your workspace.", fontSize: 14, color: "#64748B" }),
      add("card", 60, 220, { width: 310, height: 136, name: "Monthly usage", text: "Monthly usage\n12,840 events", fontSize: 16 }),
      add("card", 396, 220, { width: 310, height: 136, name: "Active projects", text: "Active projects\n24 in progress", fontSize: 16 }),
      add("card", 732, 220, { width: 310, height: 136, name: "Completion rate", text: "Completion rate\n86.4%", fontSize: 16 }),
      add("card", 60, 386, { width: 890, height: 340, name: "Activity panel", text: "Recent activity\n\nYour timeline and data visualisation can be built here.", fontSize: 16 }),
      add("button", 1090, 126, { width: 240, height: 46, name: "Create action", text: "＋  Create project" }),
    ],
  };
  if (id === "desktop-settings") return {
    name: "Desktop settings",
    background: "#F8FAFC",
    elements: [
      add("navbar", 20, 20, { width: 1400, text: "enV                                         Search settings                               Help   Profile" }),
      add("text", 60, 114, { width: 600, height: 42, text: "Settings", fontSize: 30, fontWeight: 750 }),
      add("text", 60, 162, { width: 700, height: 30, text: "Manage your workspace preferences.", color: "#64748B", fontSize: 14 }),
      add("row", 60, 224, { width: 850, text: "Profile and account\nName, email and profile details" }),
      add("row", 60, 302, { width: 850, text: "Appearance\nTheme and interface preferences" }),
      add("row", 60, 380, { width: 850, text: "Notifications\nEmail and product updates" }),
      add("row", 60, 458, { width: 850, text: "Security\nSign-in and device sessions" }),
      add("button", 60, 554, { width: 180, text: "Save changes" }),
    ],
  };
  if (id === "desktop-landing") return {
    name: "Website landing page",
    background: "#FFFFFF",
    elements: [
      add("navbar", 44, 26, { width: 1352, height: 68, text: "NOVA                                     Product   Solutions   Resources                         Sign in   Get started" }),
      add("text", 95, 160, { width: 780, height: 110, name: "Hero headline", text: "Design better experiences, faster.", fontSize: 48, fontWeight: 800, lineHeight: 1.1 }),
      add("text", 98, 288, { width: 690, height: 68, name: "Hero copy", text: "A flexible workspace for teams to shape, test and ship thoughtful digital products.", fontSize: 18, color: "#64748B", lineHeight: 1.5 }),
      add("button", 98, 386, { width: 180, height: 52, text: "Start designing" }),
      add("button", 292, 386, { width: 180, height: 52, text: "Explore features", background: "#FFFFFF", color: "#111827", borderColor: "#D1D5DB", borderWidth: 1 }),
      add("card", 875, 166, { width: 420, height: 290, name: "Preview panel", text: "Your next big idea\n\nBuild interfaces with a clear design system.", background: "#F8FAFC", fontSize: 22, radius: 24, padding: 28 }),
      add("card", 98, 528, { width: 350, height: 150, name: "Feature one", text: "01  Design\nCreate clear, consistent layouts.", fontSize: 16 }),
      add("card", 472, 528, { width: 350, height: 150, name: "Feature two", text: "02  Collaborate\nKeep product details aligned.", fontSize: 16 }),
      add("card", 846, 528, { width: 350, height: 150, name: "Feature three", text: "03  Ship\nHand off exact implementation specs.", fontSize: 16 }),
    ],
  };
  return {
    name: "Mobile dashboard",
    background: "#F8FAFC",
    elements: [
      add("navbar", 20, 22, { width: 350, name: "App header", text: "enV                                ◉", height: 56 }),
      add("text", 24, 100, { width: 340, height: 30, name: "Greeting", text: "Good morning", fontSize: 14, color: "#64748B" }),
      add("text", 24, 130, { width: 340, height: 44, name: "Dashboard title", text: "Your workspace", fontSize: 27, fontWeight: 750 }),
      add("card", 24, 202, { width: 342, height: 146, name: "Balance card", text: "TOTAL ACTIVITY\n\n12,840\n↑ 12.8% from last month", background: "#1D4ED8", color: "#FFFFFF", borderColor: "#1D4ED8", fontSize: 16, radius: 20, padding: 20 }),
      add("text", 24, 374, { width: 342, height: 28, name: "Section title", text: "Quick actions", fontSize: 18, fontWeight: 700 }),
      add("card", 24, 414, { width: 160, height: 110, name: "Quick action one", text: "＋\nCreate project", fontSize: 15, radius: 16, padding: 16 }),
      add("card", 202, 414, { width: 164, height: 110, name: "Quick action two", text: "▤\nView reports", fontSize: 15, radius: 16, padding: 16 }),
      add("text", 24, 560, { width: 342, height: 28, name: "Recent section", text: "Recent projects", fontSize: 18, fontWeight: 700 }),
      add("row", 24, 602, { width: 342, name: "Project item one", text: "Website refresh\nUpdated 12 minutes ago" }),
      add("row", 24, 676, { width: 342, name: "Project item two", text: "Mobile onboarding\nUpdated yesterday" }),
      add("tabbar", 20, 766, { width: 350, height: 54, text: "Home         Search         Activity         Profile" }),
    ],
  };
}

function wrapDesignText(value: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of String(value || "").split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? current + " " + word : word;
      if (candidate.length > maxChars && current) { lines.push(current); current = word; }
      else current = candidate;
    }
    lines.push(current);
  }
  return lines;
}

function layerTextSvg(layer: DesignLayer, x: number, y: number, maxWidth: number) {
  const inset = layer.kind === "text" ? 0 : layer.padding;
  const usableWidth = Math.max(8, maxWidth - inset * 2);
  const lines = wrapDesignText(layer.text, Math.max(5, Math.floor(usableWidth / Math.max(5, layer.fontSize * 0.56))));
  const anchor = layer.textAlign === "center" ? "middle" : layer.textAlign === "right" ? "end" : "start";
  const textX = layer.textAlign === "center" ? x + layer.width / 2 : layer.textAlign === "right" ? x + layer.width - inset : x + inset;
  const textY = layer.kind === "button" || layer.kind === "input" || layer.kind === "avatar" || layer.kind === "checkbox"
    ? y + layer.height / 2 + layer.fontSize * 0.34
    : y + inset + layer.fontSize;
  return <text x={textX} y={textY} fill={layer.color} fontFamily={layer.fontFamily} fontSize={layer.fontSize}
    fontWeight={layer.fontWeight} textAnchor={anchor} letterSpacing={layer.letterSpacing} style={{ pointerEvents: "none" }}>
    {lines.map((line, i) => <tspan key={i} x={textX} dy={i === 0 ? 0 : layer.fontSize * layer.lineHeight}>{line}</tspan>)}
  </text>;
}

function sanitizeIconMarkup(source: string): { body: string; viewBox: string } {
  if (typeof DOMParser === "undefined") return { body: "", viewBox: "0 0 24 24" };
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg" || parsed.querySelector("parsererror")) return { body: "", viewBox: "0 0 24 24" };
  const tags = new Set(["path", "circle", "rect", "ellipse", "line", "polyline", "polygon", "g"]);
  const attributes = new Set(["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "fill-rule", "clip-rule", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "transform", "opacity", "fill-opacity", "stroke-opacity", "vector-effect"]);
  const clean = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!tags.has(child.localName)) { child.remove(); continue; }
      for (const attribute of Array.from(child.attributes)) {
        if (!attributes.has(attribute.name) || attribute.name.toLowerCase().startsWith("on")) child.removeAttribute(attribute.name);
        else if (attribute.name === "fill" || attribute.name === "stroke") {
          if (!/^(currentColor|none|#[0-9a-fA-F]{3,8}|white|black|transparent)$/i.test(attribute.value)) child.setAttribute(attribute.name, "currentColor");
        }
      }
      clean(child);
    }
  };
  clean(root);
  const viewBox = root.getAttribute("viewBox") || "0 0 " + (root.getAttribute("width") || "24") + " " + (root.getAttribute("height") || "24");
  return { body: Array.from(root.children).map((node) => new XMLSerializer().serializeToString(node)).join(""), viewBox };
}

function buildProjectSpec(name: string, target: DeviceTarget, background: string, elements: DesignLayer[]): SavedProject {
  return { schemaVersion: 1, name, target, background, viewport: boardSize(target), elements, updatedAt: new Date().toISOString() };
}

function buildAiPrompt(project: SavedProject): string {
  const lines = [
    "Implement the following interface faithfully. Treat the numeric values and named assets below as the source of truth.",
    "Project: " + project.name,
    "Target: " + project.target + " interface",
    "Artboard: " + project.viewport.width + " x " + project.viewport.height + " CSS pixels",
    "Canvas background: " + project.background,
    "Positioning model: absolute artboard coordinates; x/y are measured from the artboard top-left. Preserve element order as z-order.",
    "Preserve exact colors, icon identifiers, typeface names, text sizes, font weights, line heights, letter spacing, radii, borders, padding and per-side margins. Do not substitute icons or rewrite copy.",
    "Use the exact text content from each layer. Reproduce spacing and dimensions before adding responsive behavior. For responsive layouts, keep the specified viewport as the reference.",
    "",
    "DESIGN TOKENS",
    "Colors: " + Array.from(new Set([project.background, ...project.elements.flatMap((item) => [item.color, item.background, item.borderColor])].filter((v) => v && v !== "transparent"))).join(", "),
    "Font families: " + Array.from(new Set(project.elements.map((item) => item.fontFamily))).join(", "),
    "Spacing values: " + Array.from(new Set(project.elements.flatMap((item) => [item.padding, item.marginTop, item.marginRight, item.marginBottom, item.marginLeft]))).sort((a, b) => a - b).join(", ") + " px",
    "",
    "ELEMENT SPECIFICATIONS",
  ];
  project.elements.forEach((item, index) => {
    lines.push(
      (index + 1) + ". " + item.name + " [" + item.kind + "]",
      "   id=" + item.id + "; x=" + item.x + "px; y=" + item.y + "px; width=" + item.width + "px; height=" + item.height + "px",
      "   text=" + JSON.stringify(item.text),
      "   color=" + item.color + "; background=" + item.background + "; border=" + item.borderColor + " " + item.borderWidth + "px",
      "   radius=" + item.radius + "px; padding=" + item.padding + "px; margins top/right/bottom/left=" + [item.marginTop, item.marginRight, item.marginBottom, item.marginLeft].join("/") + "px",
      "   font=" + item.fontFamily + "; size=" + item.fontSize + "px; weight=" + item.fontWeight + "; lineHeight=" + item.lineHeight + "; letterSpacing=" + item.letterSpacing + "px; align=" + item.textAlign,
      "   opacity=" + item.opacity + "; shadow=" + item.shadow,
      item.iconName ? "   icon=" + item.iconName + "; license=" + (item.iconLicense || "metadata unavailable") + "; author=" + (item.iconAuthor || "metadata unavailable") : "",
    );
  });
  lines.push("", "Acceptance check: compare the rendered result against the artboard at the exact target viewport. Avoid replacing exact values with approximate spacing or generic icons.");
  return lines.filter((line) => line !== "").join("\n");
}

function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function svgToPng(svg: SVGSVGElement, scale = 3): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = svg.viewBox.baseVal.width * scale;
        canvas.height = svg.viewBox.baseVal.height * scale;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("The browser could not create an export canvas.");
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.scale(scale, scale);
        context.drawImage(image, 0, 0);
        canvas.toBlob((png) => {
          URL.revokeObjectURL(url);
          if (!png) { reject(new Error("Could not render the design into a PNG for the PDF.")); return; }
          png.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))).catch(reject);
        }, "image/png");
      } catch (error) { URL.revokeObjectURL(url); reject(error); }
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The artboard could not be rendered. Try exporting again.")); };
    image.src = url;
  });
}

function pdfSafe(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, (character) => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")).replace(/[\t\r]/g, " ");
}

function wrapPdfLine(value: string, width: number): string[] {
  const safe = pdfSafe(value);
  const indent = safe.match(/^\s*/)?.[0] || "";
  const body = safe.trimStart();
  const result: string[] = [];
  let current = "";
  for (const word of body.split(/\s+/)) {
    const candidate = current ? current + " " + word : word;
    if (candidate.length > width - indent.length && current) { result.push(indent + current); current = word; }
    else current = candidate;
  }
  result.push(indent + current);
  return result;
}

async function buildPdf(project: SavedProject, svg: SVGSVGElement, prompt: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(project.name + " - enV UX/UI Studio");
  pdf.setSubject("Visual interface and machine-readable design specification");
  pdf.setCreator("enV UX/UI Studio");
  const previewPng = await svgToPng(svg, 3);
  const image = await pdf.embedPng(previewPng);
  const first = pdf.addPage(project.target === "desktop" ? [842, 595] : [595, 842]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  first.drawText("enV UX/UI STUDIO", { x: 28, y: first.getHeight() - 32, size: 10, font: bold, color: rgb(0.15, 0.32, 0.75) });
  first.drawText(pdfSafe(project.name), { x: 28, y: first.getHeight() - 56, size: 19, font: bold, color: rgb(0.07, 0.1, 0.16), maxWidth: first.getWidth() - 56 });
  first.drawText(project.target.toUpperCase() + "  |  " + project.viewport.width + " x " + project.viewport.height + " px  |  " + project.elements.length + " layers", { x: 28, y: first.getHeight() - 75, size: 9, font: regular, color: rgb(0.35, 0.39, 0.46) });
  const maxWidth = first.getWidth() - 56;
  const maxHeight = first.getHeight() - 120;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  first.drawImage(image, { x: (first.getWidth() - width) / 2, y: Math.max(26, (first.getHeight() - height) / 2 - 24), width, height });
  first.drawText("Visual preview is rendered directly from the editable artboard.", { x: 28, y: 14, size: 7, font: regular, color: rgb(0.42, 0.45, 0.5) });

  const spec = JSON.stringify(project, null, 2);
  const pages: Array<{ heading: string; lines: string[] }> = [
    { heading: "AI IMPLEMENTATION PROMPT", lines: prompt.split("\n").flatMap((line) => wrapPdfLine(line, 100)) },
    { heading: "MACHINE-READABLE DESIGN SPECIFICATION (JSON)", lines: spec.split("\n").flatMap((line) => wrapPdfLine(line, 100)) },
  ];
  for (const section of pages) {
    let page = pdf.addPage([595, 842]);
    let y = page.getHeight() - 40;
    page.drawText(section.heading, { x: 36, y, size: 12, font: bold, color: rgb(0.07, 0.1, 0.16) });
    y -= 26;
    for (const line of section.lines) {
      if (y < 38) {
        page = pdf.addPage([595, 842]);
        y = page.getHeight() - 40;
      }
      if (line) page.drawText(pdfSafe(line), { x: 36, y, size: 7.2, font: regular, color: rgb(0.16, 0.19, 0.24), maxWidth: 520 });
      y -= 10;
    }
  }
  return pdf.save();
}

function fieldClass() {
  return "mt-1 w-full min-w-0 rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 text-xs font-medium text-muted"><span>{label}</span>{children}</label>;
}

export function UxUiStudioEngine() {
  const [target, setTarget] = useState<DeviceTarget>("mobile");
  const [onboarding, setOnboarding] = useState(true);
  const [startupPreset, setStartupPreset] = useState("mobile-dashboard");
  const [savedProject, setSavedProject] = useState<SavedProject | null>(null);
  const [projectName, setProjectName] = useState("Untitled interface");
  const [background, setBackground] = useState("#F8FAFC");
  const [elements, setElements] = useState<DesignLayer[]>([]);
  const [undoStack, setUndoStack] = useState<DesignLayer[][]>([]);
  const [redoStack, setRedoStack] = useState<DesignLayer[][]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [leftTab, setLeftTab] = useState<PanelTab>("components");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("design");
  const [iconQuery, setIconQuery] = useState("home");
  const [iconResults, setIconResults] = useState<string[]>([]);
  const [iconTotal, setIconTotal] = useState(0);
  const [iconStart, setIconStart] = useState(0);
  const [iconCollections, setIconCollections] = useState<Record<string, { name?: string; author?: { name?: string }; license?: { title?: string } }>>({});
  const [iconLoading, setIconLoading] = useState(false);
  const [iconError, setIconError] = useState("");
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const artboardRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);

  const board = boardSize(target);
  const selected = elements.find((item) => item.id === selectedId) || null;
  const uniqueColors = useMemo(() => Array.from(new Set([background, ...elements.flatMap((item) => [item.color, item.background, item.borderColor])].filter((color) => color && color !== "transparent"))), [background, elements]);
  const project = useMemo(() => buildProjectSpec(projectName, target, background, elements), [projectName, target, background, elements]);
  const aiPrompt = useMemo(() => buildAiPrompt(project), [project]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SavedProject;
        if (parsed.schemaVersion === 1 && Array.isArray(parsed.elements) && parsed.viewport?.width) setSavedProject(parsed);
      }
    } catch { /* A corrupt local draft does not block the studio. */ }
  }, []);

  useEffect(() => {
    if (onboarding || elements.length === 0) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); } catch { setNotice("This browser could not save the draft locally. Export the project JSON for a backup."); }
  }, [project, onboarding, elements.length]);

  useEffect(() => {
    if (leftTab !== "icons" || iconQuery.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIconLoading(true);
      setIconError("");
      try {
        const url = "https://api.iconify.design/search?query=" + encodeURIComponent(iconQuery.trim()) + "&limit=32&start=" + iconStart;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("The icon catalogue is temporarily unavailable.");
        const payload = await response.json() as { icons?: string[]; total?: number; collections?: typeof iconCollections };
        const found = payload.icons || [];
        setIconResults((old) => iconStart === 0 ? found : [...old, ...found]);
        setIconTotal(payload.total || 0);
        setIconCollections(payload.collections || {});
      } catch (error) {
        if (!controller.signal.aborted) setIconError(error instanceof Error ? error.message : "Could not search the icon catalogue.");
      } finally {
        if (!controller.signal.aborted) setIconLoading(false);
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [leftTab, iconQuery, iconStart]);

  function startDesign(nextTarget: DeviceTarget, presetId?: string) {
    const id = presetId || (nextTarget === "mobile" ? "mobile-dashboard" : "desktop-landing");
    const created = createPreset(nextTarget, id);
    if (elements.length) checkpoint();
    setTarget(nextTarget);
    setProjectName(created.name);
    setBackground(created.background);
    setElements(created.elements);
    setSelectedId(created.elements[0]?.id || "");
    setZoom(100);
    setOnboarding(false);
    setNotice("Design ready. Select an element to edit its exact specifications.");
  }

  function continueSaved() {
    if (!savedProject) return;
    setProjectName(savedProject.name);
    setTarget(savedProject.target);
    setBackground(savedProject.background);
    setElements(savedProject.elements);
    setSelectedId(savedProject.elements[0]?.id || "");
    setOnboarding(false);
    setNotice("Your locally saved design has been restored.");
  }

  function checkpoint() {
    setUndoStack((previous) => [...previous.slice(-39), elements]);
    setRedoStack([]);
  }

  function undoLayout() {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((stack) => [...stack.slice(-39), elements]);
    setUndoStack((stack) => stack.slice(0, -1));
    setElements(previous);
    if (!previous.some((item) => item.id === selectedId)) setSelectedId(previous[0]?.id || "");
    setNotice("Undo complete.");
  }

  function redoLayout() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((stack) => [...stack.slice(-39), elements]);
    setRedoStack((stack) => stack.slice(0, -1));
    setElements(next);
    if (!next.some((item) => item.id === selectedId)) setSelectedId(next[0]?.id || "");
    setNotice("Redo complete.");
  }

  function moveLayer(id: string, offset: number) {
    const index = elements.findIndex((item) => item.id === id);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= elements.length) return;
    checkpoint();
    setElements((previous) => {
      const next = [...previous];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  function updateLayer(id: string, patch: Partial<DesignLayer>, recordHistory = true) {
    if (recordHistory) checkpoint();
    setElements((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addLayer(kind: LayerKind) {
    const x = Math.max(8, Math.round((board.width - Math.min(kind === "text" ? 250 : 180, board.width - 24)) / 2));
    const layer = makeLayer(kind, x, Math.max(24, Math.round(board.height * 0.28)));
    checkpoint();
    setElements((previous) => [...previous, layer]);
    setSelectedId(layer.id);
    setInspectorTab("design");
    setNotice(layer.name + " added to the artboard.");
  }

  function applyPreset(presetId: string) {
    const preset = PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const created = createPreset(preset.target, preset.id);
    checkpoint();
    setTarget(preset.target);
    setProjectName(created.name);
    setBackground(created.background);
    setElements(created.elements);
    setSelectedId(created.elements[0]?.id || "");
    setZoom(100);
    setNotice(preset.label + " loaded. Your previous canvas was replaced.");
  }

  function changeTarget(next: DeviceTarget) {
    if (next === target) return;
    const nextBoard = boardSize(next);
    const scaleX = nextBoard.width / board.width;
    const scaleY = nextBoard.height / board.height;
    checkpoint();
    setElements((previous) => previous.map((item) => ({
      ...item,
      x: Math.round(item.x * scaleX), y: Math.round(item.y * scaleY),
      width: Math.max(1, Math.round(item.width * scaleX)), height: Math.max(1, Math.round(item.height * scaleY)),
    })));
    setTarget(next);
    setZoom(100);
    setNotice("The artboard was resized proportionally. Review spacing at the new viewport.");
  }

  function movePointer(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || !artboardRef.current) return;
    const rect = artboardRef.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) * board.width / Math.max(1, rect.width);
    const py = (event.clientY - rect.top) * board.height / Math.max(1, rect.height);
    const dx = px - drag.pointerX;
    const dy = py - drag.pointerY;
    const step = event.shiftKey ? 1 : 4;
    const nextX = Math.max(0, Math.min(board.width - 1, Math.round((drag.startX + dx) / step) * step));
    const nextY = Math.max(0, Math.min(board.height - 1, Math.round((drag.startY + dy) / step) * step));
    updateLayer(drag.id, { x: nextX, y: nextY }, false);
  }

  function onArtboardPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const node = (event.target as Element).closest("[data-layer-id]");
    const id = node?.getAttribute("data-layer-id");
    if (!id) { setSelectedId(""); return; }
    const found = elements.find((item) => item.id === id);
    if (!found) return;
    setSelectedId(id);
    checkpoint();
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      id, pointerX: (event.clientX - rect.left) * board.width / Math.max(1, rect.width),
      pointerY: (event.clientY - rect.top) * board.height / Math.max(1, rect.height),
      startX: found.x, startY: found.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  async function chooseIcon(iconName: string) {
    const split = iconName.split(":");
    if (split.length !== 2) return;
    setIconLoading(true);
    try {
      const url = "https://api.iconify.design/" + split[0] + "/" + split[1] + ".svg";
      const response = await fetch(url);
      if (!response.ok) throw new Error("This icon could not be loaded.");
      const parsed = sanitizeIconMarkup(await response.text());
      const collection = iconCollections[split[0]];
      const metadata = {
        iconName, iconSvg: parsed.body, iconViewBox: parsed.viewBox,
        iconLicense: collection?.license?.title || "See the source icon set for its current license",
        iconAuthor: collection?.author?.name || "Iconify collection",
      };
      if (selected?.kind === "icon") {
        updateLayer(selected.id, metadata);
        setNotice("Updated icon: " + iconName);
      } else {
        const icon = { ...makeLayer("icon", Math.round(board.width / 2 - 20), Math.round(board.height / 3)), ...metadata, name: iconName };
        checkpoint();
        setElements((previous) => [...previous, icon]);
        setSelectedId(icon.id);
        setInspectorTab("design");
        setNotice("Added " + iconName + " with source details recorded.");
      }
    } catch (error) {
      setIconError(error instanceof Error ? error.message : "Could not load this icon.");
    } finally { setIconLoading(false); }
  }

  function exportProject() {
    const content = JSON.stringify({ ...project, aiPrompt }, null, 2);
    downloadText((projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "env-design") + ".json", content, "application/json;charset=utf-8");
    setNotice("Project JSON downloaded with the full design specification and AI prompt.");
  }

  async function exportPdf() {
    if (!artboardRef.current) return;
    setExporting(true);
    setNotice("");
    try {
      const bytes = await buildPdf(project, artboardRef.current, aiPrompt);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = (projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "env-design") + "-design-spec.pdf";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("PDF exported: rendered artboard, AI implementation prompt and complete JSON specification.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PDF export failed. Download the JSON spec as a backup.");
    } finally { setExporting(false); }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(aiPrompt);
      setNotice("Full AI implementation prompt copied.");
    } catch {
      setNotice("Clipboard permission was blocked. Export the project JSON to get the full prompt.");
    }
  }

  function duplicateSelected() {
    if (!selected) return;
    const duplicate = { ...selected, id: layerId(), name: selected.name + " copy", x: Math.min(board.width - selected.width, selected.x + 16), y: Math.min(board.height - selected.height, selected.y + 16) };
    checkpoint();
    setElements((previous) => [...previous, duplicate]);
    setSelectedId(duplicate.id);
  }

  function deleteSelected() {
    if (!selected) return;
    checkpoint();
    setElements((previous) => previous.filter((item) => item.id !== selected.id));
    setSelectedId("");
  }

  if (onboarding) {
    return (
      <section className="mx-auto max-w-5xl rounded-2xl border border-border bg-surface p-4 sm:p-8">
        <div className="flex items-center gap-2 text-sm font-semibold text-accent"><WandSparkles size={18} /> enV Developer Studio</div>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl">UX/UI Studio</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Design mobile interfaces and desktop websites with precise layout controls. Every layer keeps its measurements, icon identity, typography, spacing and color values for developer handoff and AI prompting.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => { setStartupPreset("mobile-dashboard"); startDesign("mobile", "mobile-dashboard"); }} className="group rounded-2xl border border-border p-5 text-left transition hover:border-accent hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
            <div className="flex size-12 items-center justify-center rounded-xl bg-accent/10 text-accent"><Smartphone size={24} /></div>
            <h3 className="mt-4 text-lg font-semibold text-fg">Mobile interface</h3>
            <p className="mt-1 text-sm leading-5 text-muted">Start with a 390 × 844 px mobile artboard. Build app screens, forms, cards, navigation and components.</p>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent">Open mobile editor <ArrowRight size={16} /></span>
          </button>
          <button type="button" onClick={() => { setStartupPreset("desktop-landing"); startDesign("desktop", "desktop-landing"); }} className="group rounded-2xl border border-border p-5 text-left transition hover:border-accent hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
            <div className="flex size-12 items-center justify-center rounded-xl bg-accent/10 text-accent"><Monitor size={24} /></div>
            <h3 className="mt-4 text-lg font-semibold text-fg">Desktop website</h3>
            <p className="mt-1 text-sm leading-5 text-muted">Start with a 1440 × 900 px artboard. Design responsive website sections, dashboards, navigation and page layouts.</p>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent">Open desktop editor <ArrowRight size={16} /></span>
          </button>
        </div>
        <div className="mt-6 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-fg"><LayoutTemplate size={17} /> Choose a starting layout</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => setStartupPreset(preset.id)} aria-pressed={startupPreset === preset.id} className={"rounded-lg border px-3 py-2 text-xs font-medium " + (startupPreset === preset.id ? "border-accent bg-accent text-white" : "border-border text-fg hover:bg-surface-2")}>{preset.label}</button>)}
          </div>
          <p className="mt-2 text-xs text-muted">{PRESETS.find((preset) => preset.id === startupPreset)?.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90" onClick={() => startDesign(PRESETS.find((preset) => preset.id === startupPreset)?.target || "mobile", startupPreset)}>Create from selected layout</button>
            {savedProject && <button type="button" className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-fg hover:bg-surface-2" onClick={continueSaved}>Continue saved design: {savedProject.name}</button>}
          </div>
        </div>
        <p className="mt-5 text-xs leading-5 text-muted">The editor runs locally. Icon search uses the open Iconify catalogue when online; downloaded project JSON and PDF contain your selected icon names, license details when provided, and exact layout specifications.</p>
      </section>
    );
  }

  return (
    <section className="ux-ui-studio min-w-0 space-y-3">
      <header className="rounded-xl border border-border bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[180px] flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-fg"><WandSparkles size={17} className="text-accent" /> UX/UI Studio</div>
            <input aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} className="mt-2 w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-fg outline-none focus:border-accent" />
            <p className="mt-1 text-[11px] text-muted">Draft saved locally when supported · {elements.length} layers · {board.width} × {board.height} px</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={undoLayout} disabled={!undoStack.length} aria-label="Undo last design change" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-fg disabled:opacity-40"><Undo2 size={16} /> Undo</button>
            <button type="button" onClick={redoLayout} disabled={!redoStack.length} aria-label="Redo design change" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-fg disabled:opacity-40"><Redo2 size={16} /> Redo</button>
            <button type="button" onClick={() => changeTarget("mobile")} aria-pressed={target === "mobile"} className={"inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium " + (target === "mobile" ? "border-accent bg-accent text-white" : "border-border text-fg hover:bg-surface-2")}><Smartphone size={16} /> Mobile</button>
            <button type="button" onClick={() => changeTarget("desktop")} aria-pressed={target === "desktop"} className={"inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium " + (target === "desktop" ? "border-accent bg-accent text-white" : "border-border text-fg hover:bg-surface-2")}><Laptop size={16} /> Desktop</button>
            <button type="button" onClick={exportProject} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-fg hover:bg-surface-2"><FileJson size={16} /> JSON</button>
            <button type="button" disabled={exporting || elements.length === 0} onClick={() => void exportPdf()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"><Download size={16} /> {exporting ? "Exporting…" : "Export PDF"}</button>
          </div>
        </div>
      </header>

      <div className="grid min-w-0 gap-3 lg:grid-cols-[205px_minmax(0,1fr)_245px]">
        <aside className="min-w-0 rounded-xl border border-border bg-surface p-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
            {([{ id: "components", label: "Elements" }, { id: "icons", label: "Icons" }, { id: "presets", label: "Presets" }, { id: "tokens", label: "Tokens" }] as Array<{id:PanelTab;label:string}>).map((tab) => <button key={tab.id} type="button" onClick={() => setLeftTab(tab.id)} className={"rounded-md px-2 py-2 text-xs font-semibold " + (leftTab === tab.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}>{tab.label}</button>)}
          </div>

          {leftTab === "components" && <div className="mt-3">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Add to canvas</h3><span className="text-[10px] text-muted">{COMPONENTS.length} types</span></div>
            <div className="grid grid-cols-2 gap-2">
              {COMPONENTS.map((component) => <button key={component.kind} type="button" onClick={() => addLayer(component.kind)} title={component.description} className="flex min-h-[66px] flex-col items-start justify-center rounded-lg border border-border p-2 text-left transition hover:border-accent hover:bg-surface-2"><span className="text-xs font-semibold text-fg">{component.label}</span><span className="mt-1 text-[10px] leading-4 text-muted">{component.description}</span></button>)}
            </div>
            <div className="mt-5 border-t border-border pt-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-fg"><Layers size={14} /> Layers <span className="ml-auto font-normal text-muted">{elements.length}</span></div>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {[...elements].reverse().map((item) => <div key={item.id} className={"flex items-center gap-1 rounded-md border px-1.5 py-1 " + (selectedId === item.id ? "border-accent bg-accent/10" : "border-transparent hover:bg-surface-2")}><button type="button" onClick={() => { setSelectedId(item.id); setInspectorTab("design"); }} className="min-w-0 flex-1 truncate py-1 text-left text-xs text-fg">{item.name}</button><button type="button" aria-label={"Move " + item.name + " up in layer stack"} onClick={() => moveLayer(item.id, 1)} disabled={elements.findIndex((layer) => layer.id === item.id) === elements.length - 1} className="rounded p-1 text-muted hover:text-fg disabled:opacity-30"><ArrowUp size={12} /></button><button type="button" aria-label={"Move " + item.name + " down in layer stack"} onClick={() => moveLayer(item.id, -1)} disabled={elements.findIndex((layer) => layer.id === item.id) === 0} className="rounded p-1 text-muted hover:text-fg disabled:opacity-30"><ArrowDown size={12} /></button><button type="button" aria-label={"Duplicate " + item.name} onClick={() => { checkpoint(); const dup = { ...item, id: layerId(), name: item.name + " copy", x: item.x + 12, y: item.y + 12 }; setElements((old) => [...old, dup]); setSelectedId(dup.id); }} className="rounded p-1 text-muted hover:text-fg"><Copy size={12} /></button></div>)}
              </div>
              {selected && <button type="button" onClick={deleteSelected} className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-red-600 hover:bg-red-500/10"><Trash2 size={13} /> Delete selected</button>}
            </div>
          </div>}

          {leftTab === "icons" && <div className="mt-3">
            <h3 className="text-xs font-semibold text-fg">Icon catalogue</h3>
            <p className="mt-1 text-[11px] leading-4 text-muted">Search open-source icon sets. The full icon name and license metadata are attached to the layer.</p>
            <div className="relative mt-3"><Search size={15} className="absolute left-2.5 top-2.5 text-muted" /><input value={iconQuery} aria-label="Search icons" onChange={(event) => { setIconQuery(event.target.value); setIconStart(0); setIconResults([]); }} placeholder="Search home, menu, chart…" className={"w-full rounded-lg border border-border bg-surface pl-8 pr-2 py-2 text-sm text-fg outline-none focus:border-accent"} /></div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted"><span>{iconLoading ? "Searching…" : iconTotal.toLocaleString() + " matches"}</span><span>Iconify</span></div>
            {iconError && <p role="status" className="mt-2 rounded-md bg-red-500/10 p-2 text-xs text-red-600">{iconError}</p>}
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {iconResults.map((name) => <button key={name} type="button" onClick={() => void chooseIcon(name)} title={"Add icon " + name} className={"min-w-0 rounded-lg border border-border p-1.5 text-left hover:border-accent hover:bg-surface-2 " + (selected?.iconName === name ? "border-accent bg-accent/10" : "")}><img loading="lazy" alt="" src={"https://api.iconify.design/" + name.replace(":", "/") + ".svg"} className="mx-auto size-6" /><span className="mt-1 block truncate text-[9px] text-muted">{name}</span></button>)}
            </div>
            {iconResults.length < iconTotal && <button type="button" disabled={iconLoading} onClick={() => setIconStart((current) => current + 32)} className="mt-3 w-full rounded-lg border border-border px-2 py-2 text-xs font-semibold text-fg disabled:opacity-50">Load more icons</button>}
            {!iconResults.length && !iconLoading && !iconError && <p className="mt-3 text-xs text-muted">Enter a search term to browse matching icons.</p>}
            <p className="mt-3 text-[10px] leading-4 text-muted">Source: <a className="underline underline-offset-2" href="https://iconify.design/docs/api/search.html" target="_blank" rel="noreferrer">Iconify search API</a>. Check the selected collection’s license for the project’s usage.</p>
          </div>}

          {leftTab === "presets" && <div className="mt-3">
            <h3 className="text-xs font-semibold text-fg">Starter layouts</h3><p className="mt-1 text-[11px] leading-4 text-muted">Curated responsive starting points, then customise every layer.</p>
            <div className="mt-3 space-y-2">{PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} className="w-full rounded-lg border border-border p-2.5 text-left hover:border-accent hover:bg-surface-2"><span className="block text-xs font-semibold text-fg">{preset.label}</span><span className="mt-1 block text-[10px] leading-4 text-muted">{preset.description}</span><span className="mt-2 inline-flex items-center gap-1 text-[10px] text-accent">{preset.target === "mobile" ? <Smartphone size={11} /> : <Monitor size={11} />}{preset.target} canvas</span></button>)}</div>
          </div>}

          {leftTab === "tokens" && <div className="mt-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-fg"><Palette size={14} /> Design tokens</div>
            <p className="mt-1 text-[11px] leading-4 text-muted">Extracted from the current layers and included in the PDF, JSON and AI prompt.</p>
            <Field label="Artboard background"><input type="color" value={background} onChange={(event) => setBackground(event.target.value)} className="mt-2 h-9 w-full rounded border border-border bg-surface p-1" /></Field>
            <h4 className="mt-4 text-[11px] font-semibold text-muted">Detected colors ({uniqueColors.length})</h4>
            <div className="mt-2 grid grid-cols-3 gap-2">{uniqueColors.map((color) => <div key={color} className="min-w-0"><div className="h-8 rounded-md border border-border" style={{ background: color }} /><span className="mt-1 block truncate text-[9px] text-muted">{color.toUpperCase()}</span></div>)}</div>
            <h4 className="mt-4 text-[11px] font-semibold text-muted">Typography</h4>
            <div className="mt-2 space-y-1">{Array.from(new Set(elements.map((item) => item.fontFamily))).map((font) => <div key={font} className="rounded-md border border-border px-2 py-1.5 text-xs text-fg">{font}</div>)}</div>
            <h4 className="mt-4 text-[11px] font-semibold text-muted">Spacing scale</h4>
            <p className="mt-1 text-xs leading-5 text-fg">{Array.from(new Set(elements.flatMap((item) => [item.padding, item.marginTop, item.marginRight, item.marginBottom, item.marginLeft]))).sort((a,b)=>a-b).join(" · ") || "No spacing values yet"} px</p>
          </div>}
        </aside>

        <main className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted"><Grid2X2 size={14} /><span>{target === "mobile" ? "Mobile artboard" : "Desktop artboard"}</span><span className="rounded bg-surface-2 px-2 py-1 font-mono">{board.width} × {board.height}</span></div>
            <div className="flex items-center gap-1">
              <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(50, value - 10))} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg"><ZoomOut size={15} /></button><span className="w-10 text-center text-[11px] text-muted">{zoom}%</span><button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(150, value + 10))} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg"><ZoomIn size={15} /></button>
              <button type="button" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)} title="Toggle 8 px layout grid" className={"ml-1 rounded-md border p-2 " + (showGrid ? "border-accent text-accent" : "border-border text-muted")}><Grid2X2 size={15} /></button>
            </div>
          </div>
          <div className="flex min-h-[520px] min-w-0 items-start justify-center overflow-auto p-3 sm:p-6">
            <div className="max-w-full shrink-0">
              <svg ref={artboardRef} xmlns="http://www.w3.org/2000/svg" width={board.width} height={board.height} viewBox={"0 0 " + board.width + " " + board.height}
                style={{ width: Math.min(board.width * zoom / 100, target === "mobile" ? 520 : 1000) + "px", maxWidth: "100%", height: "auto", display: "block", touchAction: "none", background }} role="img" aria-label={projectName + " design artboard"} onPointerDown={onArtboardPointerDown} onPointerMove={movePointer} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
                <rect width={board.width} height={board.height} fill={background} />
                {showGrid && <defs><pattern id="ux-grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M 8 0 L 0 0 0 8" fill="none" stroke="#94A3B8" strokeWidth="0.55" opacity="0.35" /></pattern></defs>}
                {showGrid && <rect width={board.width} height={board.height} fill="url(#ux-grid)" pointerEvents="none" />}
                {elements.map((layer) => {
                  const boxFill = layer.background === "transparent" ? "none" : layer.background;
                  const stroke = layer.borderWidth > 0 ? layer.borderColor : "none";
                  const baseBox = (round = layer.radius) => <rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={round} fill={boxFill} stroke={stroke} strokeWidth={layer.borderWidth} />;
                  const shadow = layer.shadow ? "0 3px 10px #0F172A24" : undefined;
                  const style: CSSProperties = { filter: shadow ? "drop-shadow(0px 3px 6px #0F172A22)" : undefined, opacity: layer.opacity };
                  return <g key={layer.id} data-layer-id={layer.id} style={style}>
                    <rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} fill="transparent" pointerEvents="all" />
                    {layer.kind === "divider" ? <line x1={layer.x} y1={layer.y} x2={layer.x + layer.width} y2={layer.y + layer.height} stroke={layer.background === "transparent" ? "#CBD5E1" : layer.background} strokeWidth={Math.max(1, layer.borderWidth || layer.height)} /> : null}
                    {layer.kind === "ellipse" || layer.kind === "avatar" ? <ellipse cx={layer.x + layer.width / 2} cy={layer.y + layer.height / 2} rx={layer.width / 2} ry={layer.height / 2} fill={boxFill === "none" ? "#DBEAFE" : boxFill} stroke={stroke} strokeWidth={layer.borderWidth} /> : null}
                    {layer.kind === "checkbox" ? <><rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.radius} fill={boxFill === "none" ? "#FFFFFF" : boxFill} stroke={layer.borderColor} strokeWidth={Math.max(1, layer.borderWidth)} /><path d={"M " + (layer.x + 5) + " " + (layer.y + 12) + " l 4 4 l 9 -10"} fill="none" stroke={layer.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></> : null}
                    {layer.kind === "radio" ? <><circle cx={layer.x + layer.width / 2} cy={layer.y + layer.height / 2} r={Math.min(layer.width, layer.height) / 2 - 1} fill="#FFFFFF" stroke={layer.borderColor} strokeWidth={Math.max(1, layer.borderWidth)} /><circle cx={layer.x + layer.width / 2} cy={layer.y + layer.height / 2} r={Math.min(layer.width, layer.height) / 4} fill={layer.color} /></> : null}
                    {layer.kind === "switch" || layer.kind === "toggle" ? <><rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.height / 2} fill={boxFill === "none" ? "#2563EB" : boxFill} /><circle cx={layer.x + layer.width - layer.height / 2} cy={layer.y + layer.height / 2} r={layer.height / 2 - 3} fill="#FFFFFF" /></> : null}
                    {layer.kind === "progress" ? <><rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.radius} fill={boxFill === "none" ? "#E5E7EB" : boxFill} /><rect x={layer.x} y={layer.y} width={layer.width * 0.72} height={layer.height} rx={layer.radius} fill={layer.color} /></> : null}
                    {layer.kind === "slider" ? <><rect x={layer.x} y={layer.y + layer.height / 2 - 2} width={layer.width} height={4} rx={2} fill={boxFill === "none" ? "#E5E7EB" : boxFill} /><rect x={layer.x} y={layer.y + layer.height / 2 - 2} width={layer.width * 0.62} height={4} rx={2} fill={layer.color} /><circle cx={layer.x + layer.width * 0.62} cy={layer.y + layer.height / 2} r={7} fill={layer.color} /></> : null}
                    {["text", "icon", "divider", "ellipse", "avatar", "checkbox", "radio", "switch", "toggle", "progress", "slider"].includes(layer.kind) ? null : baseBox()}
                    {layer.kind === "chart" ? <g>{[0,1,2,3].map((grid) => <line key={"grid-"+grid} x1={layer.x+layer.padding} y1={layer.y+layer.height-layer.padding-22-grid*22} x2={layer.x+layer.width-layer.padding} y2={layer.y+layer.height-layer.padding-22-grid*22} stroke="#E5E7EB" strokeWidth="1" />)}{[0.36,0.62,0.46,0.82,0.67].map((ratio,index)=><rect key={"bar-"+index} x={layer.x+layer.padding+18+index*30} y={layer.y+layer.height-layer.padding-24-ratio*76} width="16" height={ratio*76} rx="3" fill={layer.color} opacity={index===4?1:0.72} />)}</g> : null}
                    {layer.kind === "image" ? layer.imageDataUrl ? <image href={layer.imageDataUrl} x={layer.x} y={layer.y} width={layer.width} height={layer.height} preserveAspectRatio="xMidYMid slice" /> : <><path d={"M " + (layer.x + layer.width * 0.18) + " " + (layer.y + layer.height * 0.76) + " l " + (layer.width * 0.2 * -1) + " 0 l " + (layer.width * 0.2) + " -" + (layer.height * 0.27) + " l " + (layer.width * 0.16) + " " + (layer.height * 0.16) + " l " + (layer.width * 0.16 * -1) + " " + (layer.height * 0.11) + " l " + (layer.width * 0.22) + " -" + (layer.height * 0.33) + " l " + (layer.width * 0.18) + " " + (layer.height * 0.33)} fill="none" stroke="#94A3B8" strokeWidth="2" /><text x={layer.x + layer.width / 2} y={layer.y + layer.height - 10} fontSize="11" fill="#64748B" textAnchor="middle">{layer.text}</text></> : null}
                    {layer.kind === "icon" ? <svg x={layer.x + 2} y={layer.y + 2} width={layer.width - 4} height={layer.height - 4} viewBox={layer.iconViewBox || "0 0 24 24"} color={layer.color} fill="currentColor" aria-label={layer.iconName || "icon"}><g dangerouslySetInnerHTML={{ __html: layer.iconSvg || '<path d="M12 3l9 8h-3v9h-5v-6h-3v6H5v-9H3z" fill="currentColor"/>' }} /></svg> : null}
                    {["text", "button", "card", "input", "navbar", "tabbar", "row", "avatar", "badge", "dropdown", "search", "textarea", "table", "chart", "modal", "breadcrumb", "tooltip", "list", "video", "logo", "tabs", "menu"].includes(layer.kind) ? layerTextSvg(layer, layer.x, layer.y, layer.width) : null}
                    {selectedId === layer.id && <rect x={layer.x - 1.5} y={layer.y - 1.5} width={Math.max(1, layer.width + 3)} height={Math.max(1, layer.height + 3)} fill="none" stroke="#2563EB" strokeWidth="1.5" strokeDasharray="5 3" pointerEvents="none" />}
                  </g>;
                })}
              </svg>
              <p className="mt-2 text-center text-[10px] leading-4 text-muted">Click or drag a layer to position it. Hold Shift while dragging for 1 px movement; default snapping is 4 px.</p>
            </div>
          </div>
        </main>

        <aside className="min-w-0 rounded-xl border border-border bg-surface p-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
            <button type="button" onClick={() => setInspectorTab("design")} className={"rounded-md px-2 py-2 text-xs font-semibold " + (inspectorTab === "design" ? "bg-surface text-fg shadow-sm" : "text-muted")}>Properties</button>
            <button type="button" onClick={() => setInspectorTab("spec")} className={"rounded-md px-2 py-2 text-xs font-semibold " + (inspectorTab === "spec" ? "bg-surface text-fg shadow-sm" : "text-muted")}>Specs</button>
          </div>
          {!selected && <div className="py-8 text-center"><Layers size={24} className="mx-auto text-muted" /><p className="mt-3 text-sm font-semibold text-fg">Nothing selected</p><p className="mt-1 text-xs leading-5 text-muted">Select a layer on the artboard or in the layer list to edit its details.</p><button type="button" onClick={() => addLayer("text")} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white"><Plus size={14} /> Add text</button></div>}
          {selected && inspectorTab === "spec" && <div className="mt-3">
            <p className="text-xs font-semibold text-fg">{selected.name}</p><p className="mt-1 text-[10px] text-muted">Exact selected-layer handoff record</p>
            <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg bg-surface-2 p-2 text-[10px] leading-4 text-fg">{JSON.stringify(selected, null, 2)}</pre>
            <button type="button" onClick={() => { if (!navigator.clipboard) { setNotice("Clipboard access is unavailable in this browser."); return; } void navigator.clipboard.writeText(JSON.stringify(selected, null, 2)).then(() => setNotice("Layer specification copied."), () => setNotice("Clipboard access was blocked.")); }} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-fg"><Copy size={13} /> Copy layer spec</button>
          </div>}
          {selected && inspectorTab === "design" && <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-fg">{selected.kind.charAt(0).toUpperCase() + selected.kind.slice(1)} properties</p><button type="button" title="Duplicate selected layer" onClick={duplicateSelected} className="rounded-md border border-border p-2 text-muted hover:text-fg"><Copy size={13} /></button></div>
            <Field label="Layer name"><input className={fieldClass()} value={selected.name} onChange={(event) => updateLayer(selected.id, { name: event.target.value })} /></Field>
            {["text", "button", "card", "input", "image", "navbar", "tabbar", "row", "avatar", "badge", "dropdown", "search", "textarea", "table", "chart", "modal", "breadcrumb", "tooltip", "list", "video", "logo", "tabs", "menu"].includes(selected.kind) && <Field label="Text content"><textarea rows={selected.kind === "card" || selected.kind === "row" ? 3 : 2} className={fieldClass()} value={selected.text} onChange={(event) => updateLayer(selected.id, { text: event.target.value })} /></Field>}
            {selected.kind === "image" && <Field label="Replace image"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="mt-2 block w-full text-[11px] text-muted file:mr-2 file:rounded-md file:border-0 file:bg-surface-2 file:px-2 file:py-1.5 file:text-xs file:font-semibold" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === "string") updateLayer(selected.id, { imageDataUrl: reader.result }); }; reader.readAsDataURL(file); }} /></Field>}
            {selected.kind === "icon" && <div className="rounded-lg border border-border p-2"><p className="break-all text-xs font-semibold text-fg">{selected.iconName || "Built-in home icon"}</p><p className="mt-1 text-[10px] leading-4 text-muted">{selected.iconAuthor || "Built-in icon"} · {selected.iconLicense || "No external license metadata"}</p><button type="button" onClick={() => setLeftTab("icons")} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent"><Search size={12} /> Replace icon</button></div>}
            <div className="grid grid-cols-2 gap-2">
              <Field label="X position (px)"><input type="number" className={fieldClass()} value={selected.x} onChange={(event) => updateLayer(selected.id, { x: Number(event.target.value) || 0 })} /></Field>
              <Field label="Y position (px)"><input type="number" className={fieldClass()} value={selected.y} onChange={(event) => updateLayer(selected.id, { y: Number(event.target.value) || 0 })} /></Field>
              <Field label="Width (px)"><input type="number" min="1" className={fieldClass()} value={selected.width} onChange={(event) => updateLayer(selected.id, { width: Math.max(1, Number(event.target.value) || 1) })} /></Field>
              <Field label="Height (px)"><input type="number" min="1" className={fieldClass()} value={selected.height} onChange={(event) => updateLayer(selected.id, { height: Math.max(1, Number(event.target.value) || 1) })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Font family"><select className={fieldClass()} value={selected.fontFamily} onChange={(event) => updateLayer(selected.id, { fontFamily: event.target.value })}>{FONT_OPTIONS.map((font) => <option key={font}>{font}</option>)}</select></Field>
              <Field label="Font size (px)"><input type="number" min="1" max="240" className={fieldClass()} value={selected.fontSize} onChange={(event) => updateLayer(selected.id, { fontSize: Math.max(1, Number(event.target.value) || 1) })} /></Field>
              <Field label="Font weight"><select className={fieldClass()} value={selected.fontWeight} onChange={(event) => updateLayer(selected.id, { fontWeight: Number(event.target.value) })}>{[300,400,500,600,700,800,900].map((weight) => <option key={weight} value={weight}>{weight}</option>)}</select></Field>
              <Field label="Line height"><input type="number" min="0.7" max="3" step="0.05" className={fieldClass()} value={selected.lineHeight} onChange={(event) => updateLayer(selected.id, { lineHeight: Math.max(0.7, Number(event.target.value) || 1) })} /></Field>
              <Field label="Text alignment"><select className={fieldClass()} value={selected.textAlign} onChange={(event) => updateLayer(selected.id, { textAlign: event.target.value as Align })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></Field>
              <Field label="Letter spacing (px)"><input type="number" step="0.1" className={fieldClass()} value={selected.letterSpacing} onChange={(event) => updateLayer(selected.id, { letterSpacing: Number(event.target.value) || 0 })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Text / icon color"><input type="color" value={selected.color.startsWith("#") ? selected.color : "#111827"} onChange={(event) => updateLayer(selected.id, { color: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface p-1" /></Field>
              <Field label="Fill color"><div className="mt-1 flex items-center gap-1"><input type="color" value={selected.background.startsWith("#") ? selected.background : "#FFFFFF"} onChange={(event) => updateLayer(selected.id, { background: event.target.value })} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface p-1" /><button type="button" onClick={() => updateLayer(selected.id, { background: "transparent" })} className="h-10 rounded-lg border border-border px-2 text-[10px] text-fg">None</button></div></Field>
              <Field label="Border color"><input type="color" value={selected.borderColor} onChange={(event) => updateLayer(selected.id, { borderColor: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface p-1" /></Field>
              <Field label="Border width (px)"><input type="number" min="0" max="30" className={fieldClass()} value={selected.borderWidth} onChange={(event) => updateLayer(selected.id, { borderWidth: Math.max(0, Number(event.target.value) || 0) })} /></Field>
              <Field label="Corner radius (px)"><input type="number" min="0" max="300" className={fieldClass()} value={selected.radius} onChange={(event) => updateLayer(selected.id, { radius: Math.max(0, Number(event.target.value) || 0) })} /></Field>
              <Field label="Padding (px)"><input type="number" min="0" className={fieldClass()} value={selected.padding} onChange={(event) => updateLayer(selected.id, { padding: Math.max(0, Number(event.target.value) || 0) })} /></Field>
            </div>
            <div className="rounded-lg border border-border p-2.5">
              <p className="text-[11px] font-semibold text-fg">Margins (px)</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Top"><input type="number" className={fieldClass()} value={selected.marginTop} onChange={(event) => updateLayer(selected.id, { marginTop: Number(event.target.value) || 0 })} /></Field>
                <Field label="Right"><input type="number" className={fieldClass()} value={selected.marginRight} onChange={(event) => updateLayer(selected.id, { marginRight: Number(event.target.value) || 0 })} /></Field>
                <Field label="Bottom"><input type="number" className={fieldClass()} value={selected.marginBottom} onChange={(event) => updateLayer(selected.id, { marginBottom: Number(event.target.value) || 0 })} /></Field>
                <Field label="Left"><input type="number" className={fieldClass()} value={selected.marginLeft} onChange={(event) => updateLayer(selected.id, { marginLeft: Number(event.target.value) || 0 })} /></Field>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Opacity"><input type="number" min="0" max="1" step="0.05" className={fieldClass()} value={selected.opacity} onChange={(event) => updateLayer(selected.id, { opacity: Math.max(0, Math.min(1, Number(event.target.value) || 0)) })} /></Field>
              <label className="flex items-end gap-2 rounded-lg border border-border p-2 text-xs text-fg"><input type="checkbox" checked={selected.shadow} onChange={(event) => updateLayer(selected.id, { shadow: event.target.checked })} /> Drop shadow</label>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
              <button type="button" onClick={duplicateSelected} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-border text-xs font-semibold text-fg hover:bg-surface-2"><Copy size={13} /> Duplicate</button>
              <button type="button" onClick={deleteSelected} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-red-500/30 text-xs font-semibold text-red-600 hover:bg-red-500/10"><Trash2 size={13} /> Delete</button>
            </div>
          </div>}
          <div className="mt-4 border-t border-border pt-3">
            <button type="button" onClick={() => void copyPrompt()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs font-semibold text-fg hover:bg-surface-2"><Copy size={14} /> Copy full AI prompt</button>
            <p className="mt-2 text-[10px] leading-4 text-muted">PDF export includes the visual artboard, a written implementation prompt and the complete JSON specification.</p>
          </div>
        </aside>
      </div>
      {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-5 text-muted"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" /> <span className="min-w-0 flex-1">{notice}</span><button aria-label="Dismiss notice" type="button" onClick={() => setNotice("")} className="rounded p-0.5 text-muted hover:text-fg"><X size={13} /></button></div>}
      <footer className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-3 text-[11px] leading-5 text-muted"><span>Local-first editor · Exact pixel dimensions · Layer-level specification records</span><button type="button" onClick={() => setOnboarding(true)} className="inline-flex items-center gap-1 font-semibold text-accent"><ArrowLeft size={13} /> Switch workflow</button></footer>
    </section>
  );
}
