import { generateHtmlProject, generateKotlinProject, generateReactProject, generateSwiftProject, sourceName } from "@/lib/engines/ux-ui-studio-codegen";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CircleHelp, Copy, Download, FileJson, FileOutput, ImagePlus, Maximize2, Redo2, Undo2,
  Grid2X2, Layers, LayoutTemplate, Monitor, Palette, Plus, Search, Shapes, Smartphone, Tablet, Type,
  Trash2, X, ZoomIn, ZoomOut, RotateCw,
} from "lucide-react";

type DeviceTarget = "mobile" | "tablet" | "desktop";
type PanelTab = "toolkits" | "components" | "icons" | "fonts" | "presets" | "tokens";
type InspectorTab = "design" | "spec";
type LayerKind = "text" | "button" | "card" | "input" | "image" | "icon" | "rect" | "ellipse" | "divider" | "navbar" | "tabbar" | "row" | "checkbox" | "avatar" | "badge" | "switch" | "toggle" | "progress" | "slider" | "radio" | "dropdown" | "search" | "textarea" | "table" | "chart" | "modal" | "breadcrumb" | "tooltip" | "list" | "video" | "logo" | "tabs" | "menu" | "spacer" | "triangle" | "diamond" | "hexagon" | "star" | "line" | "pill";
type Align = "left" | "center" | "right";
type HorizontalConstraint = "left" | "center" | "right" | "stretch";
type VerticalConstraint = "top" | "center" | "bottom" | "stretch";
type DesignTokens = { colors: Array<{ name: string; value: string }>; typography: Array<{ name: string; fontFamily: string; fontSize: number; fontWeight: number; lineHeight: number }>; spacing: number[] };

type DesignLayer = {
  id: string; kind: LayerKind; name: string; x: number; y: number; width: number; height: number; rotation?: number;
  text: string; iconName: string; iconSvg: string; iconViewBox: string; imageDataUrl: string; fontDataUrl: string;
  iconLicense: string; iconAuthor: string;
  color: string; background: string; borderColor: string; borderWidth: number; radius: number;
  padding: number; marginTop: number; marginRight: number; marginBottom: number; marginLeft: number;
  fontFamily: string; fontSize: number; fontWeight: number; lineHeight: number; letterSpacing: number;
  textAlign: Align; opacity: number; shadow: boolean;
  horizontalConstraint: HorizontalConstraint; verticalConstraint: VerticalConstraint;
  minWidth: number; maxWidth: number; visibleOn: DeviceTarget[];
  referenceWidth: number; referenceHeight: number; componentKey: string;
  display?: string; cursor?: string; zIndex?: number; transitionDuration?: number;
  hoverColor?: string; activeColor?: string; focusColor?: string;
  hidden?: boolean; locked?: boolean; groupId?: string;
};

type SavedProject = {
  id?: string; schemaVersion: 2; name: string; target: DeviceTarget; background: string;
  viewport: { width: number; height: number };
  breakpoints: { mobile: number; tablet: number; desktop: number };
  tokens: DesignTokens; reusableComponents: DesignLayer[];
  elements: DesignLayer[]; updatedAt: string;
  screens?: DesignScreen[]; activeScreenId?: string;
};

type DesignScreen = {
  id: string; name: string; target: DeviceTarget; background: string;
  customArtboard: boolean; customWidth: number; customHeight: number;
  elements: DesignLayer[]; updatedAt: string;
};

const DEFAULT_TOKENS: DesignTokens = {
  colors: [
    { name: "primary", value: "#2563EB" }, { name: "surface", value: "#FFFFFF" },
    { name: "text", value: "#111827" }, { name: "muted", value: "#64748B" },
    { name: "border", value: "#E5E7EB" },
  ],
  typography: [
    { name: "heading", fontFamily: "Inter", fontSize: 24, fontWeight: 700, lineHeight: 1.2 },
    { name: "body", fontFamily: "Inter", fontSize: 16, fontWeight: 400, lineHeight: 1.5 },
    { name: "label", fontFamily: "Inter", fontSize: 12, fontWeight: 600, lineHeight: 1.35 },
  ],
  spacing: [4, 8, 12, 16, 24, 32, 48],
};
const DESIGN_BREAKPOINTS = { mobile: 480, tablet: 768, desktop: 1024 };

const STORAGE_KEY = "env-ux-ui-studio-project-v1";
const DRAFTS_STORAGE_KEY = "env-ux-ui-studio-drafts-v1";
type FontLibraryItem = { family: string; category: "Sans serif" | "Serif" | "Monospace" | "Display" | "Handwriting" | "System"; provider: "google" | "system"; id?: string; weights?: number[]; styles?: string[]; variable?: boolean };
type FontsourceFontRecord = { id?: string; family?: string; category?: string; weights?: number[]; styles?: string[]; variable?: boolean };
function fontsourceCategory(value: string | undefined): FontLibraryItem["category"] {
  const category = (value || "").toLowerCase();
  if (category.includes("serif") && !category.includes("sans")) return "Serif";
  if (category.includes("mono")) return "Monospace";
  if (category.includes("display")) return "Display";
  if (category.includes("hand") || category.includes("script")) return "Handwriting";
  return "Sans serif";
}
const FONT_LIBRARY: FontLibraryItem[] = [
  ...["Inter","Roboto","Open Sans","Lato","Montserrat","Poppins","Nunito","Source Sans 3","Work Sans","DM Sans","Manrope","Plus Jakarta Sans","Urbanist","Outfit","IBM Plex Sans","Noto Sans","Ubuntu","Rubik","Mulish","Quicksand","Barlow","Karla","Assistant","Fira Sans","Cabin","Raleway","Oxygen","PT Sans","Titillium Web"].map((family)=>({family,category:"Sans serif" as const,provider:"google" as const})),
  ...["Merriweather","Playfair Display","Lora","PT Serif","Libre Baskerville","Roboto Slab","Fraunces","Cormorant Garamond","Crimson Text","Bitter","DM Serif Display","Source Serif 4"].map((family)=>({family,category:"Serif" as const,provider:"google" as const})),
  ...["JetBrains Mono","Fira Code","IBM Plex Mono","Source Code Pro","Space Mono","Inconsolata","Roboto Mono","Noto Sans Mono"].map((family)=>({family,category:"Monospace" as const,provider:"google" as const})),
  ...["Oswald","Bebas Neue","Archivo Black","Anton","Space Grotesk","Syne","Bodoni Moda","Abril Fatface"].map((family)=>({family,category:"Display" as const,provider:"google" as const})),
  ...["Caveat","Pacifico","Dancing Script","Satisfy"].map((family)=>({family,category:"Handwriting" as const,provider:"google" as const})),
  ...["system-ui","Arial","Helvetica","Georgia","Times New Roman","Courier New","SF Pro Display","SF Pro Text","Avenir Next","Menlo"].map((family)=>({family,category:"System" as const,provider:"system" as const})),
];
const FONT_OPTIONS = FONT_LIBRARY.map((font)=>font.family);
const ICON_SET_OPTIONS = [
  {prefix:"all",label:"All styles"},
  {prefix:"lucide",label:"Lucide · clean line"},
  {prefix:"tabler",label:"Tabler · outline"},
  {prefix:"material-symbols",label:"Material Symbols"},
  {prefix:"mdi",label:"Material Design"},
  {prefix:"ph",label:"Phosphor"},
  {prefix:"solar",label:"Solar"},
  {prefix:"carbon",label:"Carbon"},
  {prefix:"fa6-solid",label:"Font Awesome Solid"},
  {prefix:"heroicons",label:"Heroicons"},
  {prefix:"fluent",label:"Fluent"},
  {prefix:"iconamoon",label:"Iconamoon"},
  {prefix:"mingcute",label:"MingCute"},
] as const;
const ICON_BROWSE_CATEGORIES: Array<{name:string;description:string;icons:string[]}> = [
  {name:"Navigation",description:"Headers, menus, routes and wayfinding",icons:["lucide:house","tabler:home","material-symbols:home-rounded","mdi:home","ph:house","solar:home-linear","carbon:home","fa6-solid:house","heroicons:home","fluent:home-24-regular","iconamoon:home-light","mingcute:home-4-line","lucide:menu","tabler:menu-2","mdi:menu","ph:list","lucide:arrow-left","tabler:arrow-left","material-symbols:arrow-back-rounded","solar:alt-arrow-right-linear","lucide:chevron-down","tabler:chevron-down","mdi:chevron-down","ph:caret-down","lucide:layout-grid","tabler:apps","material-symbols:dashboard-rounded","solar:widget-2-linear"]},
  {name:"Actions",description:"Primary actions, editing, status and utilities",icons:["lucide:plus","tabler:plus","material-symbols:add-rounded","mdi:plus","ph:plus-bold","solar:add-square-linear","lucide:check","tabler:check","material-symbols:check-rounded","mdi:check-bold","ph:check-bold","lucide:x","tabler:x","material-symbols:close-rounded","mdi:close","lucide:pencil","tabler:edit","material-symbols:edit-rounded","mdi:pencil","ph:pencil-simple","lucide:trash-2","tabler:trash","material-symbols:delete-rounded","mdi:delete","lucide:copy","tabler:copy","material-symbols:content-copy-rounded","lucide:download","tabler:download","material-symbols:download-rounded"]},
  {name:"Forms",description:"Inputs, validation, passwords and settings",icons:["lucide:mail","tabler:mail","material-symbols:mail-rounded","mdi:email-outline","ph:envelope","lucide:lock","tabler:lock","material-symbols:lock-rounded","mdi:lock-outline","ph:lock-key","lucide:eye","tabler:eye","material-symbols:visibility-rounded","mdi:eye-outline","lucide:eye-off","tabler:eye-off","material-symbols:visibility-off-rounded","mdi:eye-off-outline","lucide:calendar","tabler:calendar","material-symbols:calendar-month-rounded","mdi:calendar-month","lucide:clock","tabler:clock","material-symbols:schedule-rounded","mdi:clock-outline","lucide:sliders-horizontal","tabler:adjustments","material-symbols:tune-rounded","mdi:tune-variant"]},
  {name:"Communication",description:"Chat, notifications, contact and collaboration",icons:["lucide:message-circle","tabler:message-circle","material-symbols:chat-bubble-rounded","mdi:message-outline","ph:chat-circle","lucide:bell","tabler:bell","material-symbols:notifications-rounded","mdi:bell-outline","lucide:phone","tabler:phone","material-symbols:call-rounded","mdi:phone-outline","lucide:send","tabler:send","material-symbols:send-rounded","mdi:send","lucide:users","tabler:users","material-symbols:group-rounded","mdi:account-group-outline","lucide:at-sign","tabler:at","material-symbols:alternate-email-rounded","mdi:at"]},
  {name:"Media",description:"Photos, video, audio and visual creation",icons:["lucide:image","tabler:photo","material-symbols:image-rounded","mdi:image-outline","ph:image","lucide:camera","tabler:camera","material-symbols:photo-camera-rounded","mdi:camera-outline","lucide:video","tabler:video","material-symbols:videocam-rounded","mdi:video-outline","lucide:music","tabler:music","material-symbols:music-note-rounded","mdi:music-note","lucide:mic","tabler:microphone","material-symbols:mic-rounded","mdi:microphone-outline","lucide:play","tabler:player-play","material-symbols:play-arrow-rounded","mdi:play"]},
  {name:"Commerce",description:"Shopping, payment, delivery and inventory",icons:["lucide:shopping-cart","tabler:shopping-cart","material-symbols:shopping-cart-rounded","mdi:cart-outline","ph:shopping-cart","lucide:credit-card","tabler:credit-card","material-symbols:credit-card-rounded","mdi:credit-card-outline","lucide:wallet","tabler:wallet","material-symbols:wallet-rounded","mdi:wallet-outline","lucide:package","tabler:package","material-symbols:inventory-2-rounded","mdi:package-variant","lucide:tag","tabler:tag","material-symbols:sell-rounded","mdi:tag-outline","lucide:truck","tabler:truck","material-symbols:local-shipping-rounded","mdi:truck-outline"]},
  {name:"Data",description:"Charts, analytics, tables and metrics",icons:["lucide:chart-column","tabler:chart-bar","material-symbols:bar-chart-rounded","mdi:chart-bar","ph:chart-bar","lucide:chart-line","tabler:chart-line","material-symbols:show-chart-rounded","mdi:chart-line","lucide:pie-chart","tabler:chart-pie","material-symbols:pie-chart-rounded","mdi:chart-pie","lucide:database","tabler:database","material-symbols:database-rounded","mdi:database-outline","lucide:table","tabler:table","material-symbols:table-chart-rounded","mdi:table","lucide:activity","tabler:activity","material-symbols:monitoring-rounded","mdi:chart-areaspline"]},
  {name:"Devices",description:"Phones, computers, connectivity and hardware",icons:["lucide:smartphone","tabler:device-mobile","material-symbols:smartphone-rounded","mdi:cellphone","lucide:tablet","tabler:device-tablet","material-symbols:tablet-rounded","mdi:tablet","lucide:laptop","tabler:device-laptop","material-symbols:laptop-rounded","mdi:laptop","lucide:monitor","tabler:device-desktop","material-symbols:desktop-windows-rounded","mdi:monitor","lucide:wifi","tabler:wifi","material-symbols:wifi-rounded","mdi:wifi","lucide:bluetooth","tabler:bluetooth","material-symbols:bluetooth-rounded","mdi:bluetooth","lucide:battery","tabler:battery","material-symbols:battery-full-rounded","mdi:battery"]},
  {name:"Files",description:"Documents, folders, cloud and development",icons:["lucide:file-text","tabler:file-text","material-symbols:description-rounded","mdi:file-document-outline","ph:file-text","lucide:folder","tabler:folder","material-symbols:folder-rounded","mdi:folder-outline","lucide:cloud","tabler:cloud","material-symbols:cloud-rounded","mdi:cloud-outline","lucide:code","tabler:code","material-symbols:code-rounded","mdi:code-tags","lucide:terminal","tabler:terminal-2","material-symbols:terminal-rounded","mdi:console","lucide:database","tabler:database","mdi:database-outline"]},
  {name:"Shapes",description:"Geometric marks and decorative symbols",icons:["lucide:circle","tabler:circle","material-symbols:circle-rounded","mdi:circle-outline","lucide:square","tabler:square","material-symbols:square-rounded","mdi:square-outline","lucide:triangle","tabler:triangle","material-symbols:change-history-rounded","mdi:triangle-outline","lucide:star","tabler:star","material-symbols:star-rounded","mdi:star-outline","lucide:heart","tabler:heart","material-symbols:favorite-rounded","mdi:heart-outline","lucide:hexagon","tabler:hexagon","mdi:hexagon-outline","lucide:diamond","tabler:diamond","mdi:diamond-outline"]}
];
const SWATCHES = ["#111827", "#374151", "#6B7280", "#F9FAFB", "#FFFFFF", "#2563EB", "#7C3AED", "#DB2777", "#059669", "#D97706", "#DC2626", "#0F766E"];
type StudioToolkit = { id: string; name: string; description: string; tab: PanelTab; icon: string; outcome: string };
const STUDIO_TOOLKITS: StudioToolkit[] = [
  {
    "id": "icons",
    "name": "Icon Studio",
    "description": "Discover, customize, import and reuse vector icons.",
    "tab": "icons",
    "icon": "Shapes",
    "outcome": "Search icon collections, select an icon, then customise its size, fill, padding, border, radius and shadow."
  },
  {
    "id": "typography",
    "name": "Typography Studio",
    "description": "Build readable type systems and manage font assets.",
    "tab": "fonts",
    "icon": "Type",
    "outcome": "Browse curated and remote fonts, preview families, import local files and embed supported font assets."
  },
  {
    "id": "color",
    "name": "Color Studio",
    "description": "Manage accessible colors, palettes and interactive states.",
    "tab": "tokens",
    "icon": "Palette",
    "outcome": "Edit named color tokens, use the palette, apply foreground/fill values and inspect contrast in Design QA."
  },
  {
    "id": "background",
    "name": "Gradient & Background Studio",
    "description": "Build backgrounds, gradient surfaces and decorative canvas treatments.",
    "tab": "tokens",
    "icon": "PanelsTopLeft",
    "outcome": "Choose the canvas background, toggle the alignment grid, import image backgrounds and retain values in the project."
  },
  {
    "id": "effects",
    "name": "Effects Studio",
    "description": "Tune elevation, borders, transparency and visual depth.",
    "tab": "toolkits",
    "icon": "Sparkles",
    "outcome": "Select an object to adjust opacity, border, radius and shadow in visual controls; detailed values remain in Fine-tune design."
  },
  {
    "id": "illustrations",
    "name": "Illustration Studio",
    "description": "Import, place and manage illustration assets.",
    "tab": "components",
    "icon": "Image",
    "outcome": "Import SVGs or images to the artboard, then position, resize, rotate and style them as editable layers."
  },
  {
    "id": "media",
    "name": "Image & Media Studio",
    "description": "Bring screenshots, photos, thumbnails and media assets into the mockup.",
    "tab": "components",
    "icon": "ImagePlus",
    "outcome": "Import supported image assets, replace them on selected layers and export designs with embedded image data."
  },
  {
    "id": "brand",
    "name": "Brand Studio",
    "description": "Keep brand colors, typography and reusable visual assets consistent.",
    "tab": "tokens",
    "icon": "Palette",
    "outcome": "Maintain named color/type tokens and reusable component templates; apply brand values to selected layers."
  },
  {
    "id": "motion",
    "name": "Motion Studio",
    "description": "Control rotations, transitions and interaction-state appearance.",
    "tab": "toolkits",
    "icon": "RotateCw",
    "outcome": "Adjust rotation and set CSS transition duration and hover/active/focus-visible fill values in Technical styling."
  },
  {
    "id": "components",
    "name": "UI Components, Kits & Patterns",
    "description": "Create interface controls, cards, forms and navigation patterns.",
    "tab": "components",
    "icon": "LayoutTemplate",
    "outcome": "Insert editable controls from the component library and save selected layers as reusable component templates."
  },
  {
    "id": "device",
    "name": "Device Mockup Studio",
    "description": "Preview the screen inside mobile, tablet and desktop device frames.",
    "tab": "toolkits",
    "icon": "Smartphone",
    "outcome": "Switch the preview target in the top bar; the device frame changes independently from screen elements."
  },
  {
    "id": "responsive",
    "name": "Responsive Design, Layout & Canvas",
    "description": "Position, size and adapt designs across viewport sizes.",
    "tab": "toolkits",
    "icon": "Monitor",
    "outcome": "Change target, zoom and grid; set custom canvas dimensions, anchors, min/max width and per-target visibility."
  },
  {
    "id": "projects",
    "name": "Screen & Project Manager",
    "description": "Create projects, reopen drafts and export editable design files.",
    "tab": "presets",
    "icon": "Layers",
    "outcome": "Use Projects to reopen drafts, import project JSON or start from responsive starter layouts."
  },
  {
    "id": "layers",
    "name": "Layers & Object Manager",
    "description": "Select, reorder, duplicate and remove individual elements.",
    "tab": "toolkits",
    "icon": "Layers",
    "outcome": "Select a layer, move it in the stack, duplicate or delete it, and inspect its saved object properties."
  },
  {
    "id": "prototype",
    "name": "Prototype Studio",
    "description": "Prepare screen states and review interactive design behavior.",
    "tab": "toolkits",
    "icon": "ArrowRight",
    "outcome": "Connected multi-screen prototype playback requires its own interaction graph; this editor will not present it as complete before navigation is wired."
  },
  {
    "id": "design-system",
    "name": "Design System Studio",
    "description": "Manage reusable color, typography and spacing tokens.",
    "tab": "tokens",
    "icon": "Palette",
    "outcome": "Edit named color tokens, type scales and spacing values saved with exported project specifications."
  },
  {
    "id": "accessibility",
    "name": "Accessibility Studio",
    "description": "Review likely contrast, text-size, labeling and touch-target issues.",
    "tab": "toolkits",
    "icon": "CircleHelp",
    "outcome": "Run the project check to surface potential issues; this report is advisory and does not claim full WCAG conformance."
  },
  {
    "id": "content",
    "name": "Content & Placeholder Studio",
    "description": "Insert realistic headings, sample text, button labels and data.",
    "tab": "toolkits",
    "icon": "Type",
    "outcome": "Add starter headings, body copy, CTA labels and sample elements to the artboard."
  },
  {
    "id": "data-viz",
    "name": "Data Visualization Studio",
    "description": "Insert chart components and edit chart labels for dashboard mockups.",
    "tab": "components",
    "icon": "ChartNoAxesColumn",
    "outcome": "Insert a chart layer and edit its label, geometry and styling like any other layer."
  },
  {
    "id": "patterns",
    "name": "Patterns & Textures Studio",
    "description": "Use grids, geometric shapes and decorative layers.",
    "tab": "toolkits",
    "icon": "Grid2X2",
    "outcome": "Toggle the canvas grid or insert vector shapes and style their fills, opacity, radius and layering."
  },
  {
    "id": "3d",
    "name": "3D Studio",
    "description": "Manage 3D asset references and design placeholders.",
    "tab": "toolkits",
    "icon": "Box",
    "outcome": "Live GLB/GLTF rendering, lighting and camera manipulation are not yet available in this editor; imported rendered previews can be used instead."
  },
  {
    "id": "platform",
    "name": "Platform Design Kits",
    "description": "Use mobile, tablet and desktop viewport conventions.",
    "tab": "toolkits",
    "icon": "Smartphone",
    "outcome": "Select the viewport target and use responsive visibility and layout anchors for each design layer."
  },
  {
    "id": "assets",
    "name": "Asset Manager",
    "description": "Import, replace and retain image and SVG assets.",
    "tab": "components",
    "icon": "ImagePlus",
    "outcome": "Import and replace supported assets. Check source and licence metadata for third-party resources."
  },
  {
    "id": "handoff",
    "name": "Export & Design Handoff Studio",
    "description": "Export a visual brief, exact project specification and source code.",
    "tab": "toolkits",
    "icon": "FileOutput",
    "outcome": "Export PDF, JSON, HTML/CSS, React TSX, Kotlin or SwiftUI; generated source still requires target-app integration and build verification."
  },
  {
    "id": "inspiration",
    "name": "Inspiration & Reference Studio",
    "description": "Collect reference assets for visual comparison.",
    "tab": "toolkits",
    "icon": "Search",
    "outcome": "Import screenshots or references into the project and retain source notes before redistributing them."
  },
  {
    "id": "qa",
    "name": "Design QA Studio",
    "description": "Check geometry, overlaps, missing assets and basic interaction readiness.",
    "tab": "toolkits",
    "icon": "Check",
    "outcome": "Run the structural audit and review potential issues before handoff."
  }
];

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
  { kind: "triangle", label: "Triangle", description: "Three-sided geometric shape" },
  { kind: "diamond", label: "Diamond", description: "Four-point geometric shape" },
  { kind: "hexagon", label: "Hexagon", description: "Six-sided geometric shape" },
  { kind: "star", label: "Star", description: "Five-point decorative shape" },
  { kind: "line", label: "Line", description: "Straight connector or rule" },
  { kind: "pill", label: "Pill", description: "Capsule or lozenge shape" },
];

const PRESETS: Array<{ id: string; label: string; target: DeviceTarget; description: string }> = [
  { id: "mobile-dashboard", label: "Mobile dashboard", target: "mobile", description: "Cards, greeting, actions and navigation" },
  { id: "mobile-login", label: "Mobile sign-in", target: "mobile", description: "Brand, form fields and primary action" },
  { id: "mobile-commerce", label: "Mobile shop", target: "mobile", description: "Product details and purchase action" },
  { id: "desktop-landing", label: "Website landing", target: "desktop", description: "Hero, call to action and feature cards" },
  { id: "desktop-dashboard", label: "Desktop dashboard", target: "desktop", description: "Sidebar, metrics and data panels" },
  { id: "desktop-settings", label: "Desktop settings", target: "desktop", description: "Settings layout and preference rows" },
  { id: "tablet-dashboard", label: "Tablet dashboard", target: "tablet", description: "Tablet-first dashboard with balanced columns" },
  { id: "tablet-settings", label: "Tablet settings", target: "tablet", description: "Tablet settings and preference layout" },
];

function shapePoints(kind: string, x: number, y: number, width: number, height: number): string {
  if (kind === "triangle") return (x+width/2)+","+(y)+" "+(x+width)+","+(y+height)+" "+x+","+(y+height);
  if (kind === "diamond") return (x+width/2)+","+y+" "+(x+width)+","+(y+height/2)+" "+(x+width/2)+","+(y+height)+" "+x+","+(y+height/2);
  if (kind === "hexagon") return (x+width*0.25)+","+y+" "+(x+width*0.75)+","+y+" "+(x+width)+","+(y+height/2)+" "+(x+width*0.75)+","+(y+height)+" "+(x+width*0.25)+","+(y+height)+" "+x+","+(y+height/2);
  const points: string[] = [];
  for (let index=0; index<10; index++) {
    const radius = index % 2 === 0 ? 0.5 : 0.21;
    const angle = -Math.PI/2 + index*Math.PI/5;
    points.push((x+width/2+Math.cos(angle)*width*radius)+","+(y+height/2+Math.sin(angle)*height*radius));
  }
  return points.join(" ");
}

function newScreenId(): string { return "screen-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); }

function layerId(): string {
  return "layer-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function boardSize(target: DeviceTarget) {
  if (target === "mobile") return { width: 390, height: 844 };
  if (target === "tablet") return { width: 768, height: 1024 };
  return { width: 1440, height: 900 };
}

function makeLayer(kind: LayerKind, x: number, y: number, referenceWidth = 390, referenceHeight = 844): DesignLayer {
  const shared: DesignLayer = {
    id: layerId(), kind, name: kind.charAt(0).toUpperCase() + kind.slice(1), x, y, width: 180, height: 64,
    text: "", iconName: "", iconSvg: "", iconViewBox: "0 0 24 24", imageDataUrl: "", fontDataUrl: "", iconLicense: "", iconAuthor: "",
    color: "#111827", background: "transparent", borderColor: "#E5E7EB", borderWidth: 0, radius: 12,
    padding: 12, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
    fontFamily: "Inter", fontSize: 16, fontWeight: 400, lineHeight: 1.35, letterSpacing: 0,
    textAlign: "left", opacity: 1, shadow: false,
    horizontalConstraint: "left", verticalConstraint: "top", minWidth: 0, maxWidth: 0,
    visibleOn: ["mobile", "tablet", "desktop"], referenceWidth, referenceHeight, componentKey: "",
    display: "flex", cursor: "default", zIndex: 1, transitionDuration: 180,
    hoverColor: "", activeColor: "", focusColor: "", hidden: false, locked: false, groupId: "",
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
    case "triangle": return { ...shared, name: "Triangle", width: 96, height: 84, background: "#DBEAFE", color: "#1D4ED8", radius: 0, padding: 0 };
    case "diamond": return { ...shared, name: "Diamond", width: 92, height: 92, background: "#DBEAFE", color: "#1D4ED8", radius: 0, padding: 0 };
    case "hexagon": return { ...shared, name: "Hexagon", width: 112, height: 96, background: "#DBEAFE", color: "#1D4ED8", radius: 0, padding: 0 };
    case "star": return { ...shared, name: "Star", width: 100, height: 100, background: "#FDE68A", color: "#B45309", radius: 0, padding: 0 };
    case "line": return { ...shared, name: "Line", width: 180, height: 2, background: "#64748B", borderWidth: 0, radius: 0, padding: 0 };
    case "pill": return { ...shared, name: "Pill shape", width: 150, height: 52, background: "#DBEAFE", color: "#1D4ED8", radius: 99, padding: 0 };
    default: return shared;
  }
}

function createPreset(target: DeviceTarget, presetId?: string): { name: string; background: string; elements: DesignLayer[] } {
  const id = presetId || (target === "mobile" ? "mobile-dashboard" : target === "tablet" ? "tablet-dashboard" : "desktop-landing");
  const reference = boardSize(target);
  const add = (kind: LayerKind, x: number, y: number, patch: Partial<DesignLayer> = {}) => ({ ...makeLayer(kind, x, y, reference.width, reference.height), ...patch });
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
  if (id === "tablet-dashboard") return {
    name: "Tablet dashboard", background: "#F8FAFC",
    elements: [
      add("navbar", 24, 24, { width: 720, text: "enV                         Search                         Profile", height: 64 }),
      add("text", 32, 112, { width: 680, text: "Overview", fontSize: 28, fontWeight: 700 }),
      add("card", 32, 180, { width: 215, height: 130, text: "Monthly usage\\n12,840 events" }),
      add("card", 268, 180, { width: 215, height: 130, text: "Active projects\\n24 in progress" }),
      add("card", 504, 180, { width: 232, height: 130, text: "Completion rate\\n86.4%" }),
      add("card", 32, 334, { width: 450, height: 300, text: "Recent activity\\n\\nYour timeline and data visualization." }),
      add("card", 500, 334, { width: 236, height: 300, text: "Quick actions\\n\\nCreate project\\nReview activity" }),
    ],
  };
  if (id === "tablet-settings") return {
    name: "Tablet settings", background: "#F8FAFC",
    elements: [
      add("navbar", 24, 24, { width: 720, text: "enV                         Settings                         Profile", height: 64 }),
      add("text", 32, 112, { width: 680, text: "Settings", fontSize: 28, fontWeight: 700 }),
      add("card", 32, 176, { width: 215, height: 420, text: "Preferences\\n\\nProfile\\nNotifications\\nAppearance\\nSecurity" }),
      add("card", 268, 176, { width: 468, height: 420, text: "Account preferences\\n\\nManage your personal details and app settings." }),
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
  const inheritedPresentation = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "fill-rule", "clip-rule", "opacity", "fill-opacity", "stroke-opacity", "vector-effect"];
  if (!root.hasAttribute("fill") && !root.hasAttribute("stroke")) root.setAttribute("fill", "currentColor");
  const clean = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!tags.has(child.localName)) { child.remove(); continue; }
      for (const attribute of inheritedPresentation) {
        if (!child.hasAttribute(attribute) && node.hasAttribute(attribute)) child.setAttribute(attribute, node.getAttribute(attribute) || "");
      }
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

function buildProjectSpec(name: string, target: DeviceTarget, background: string, viewport: { width: number; height: number }, elements: DesignLayer[], tokens: DesignTokens, reusableComponents: DesignLayer[]): SavedProject {
  return { schemaVersion: 2, name, target, background, viewport, breakpoints: DESIGN_BREAKPOINTS, tokens, reusableComponents, elements, updatedAt: new Date().toISOString() };
}

function buildAiPrompt(project: SavedProject): string {
  const lines = [
    "Implement the following interface faithfully. Treat the numeric values and named assets below as the source of truth.",
    "Project: " + project.name,
    "Target: " + project.target + " interface",
    "Artboard: " + project.viewport.width + " x " + project.viewport.height + " CSS pixels",
    "Responsive breakpoints: mobile <= " + project.breakpoints.mobile + "px; tablet " + (project.breakpoints.mobile + 1) + "–" + (project.breakpoints.desktop - 1) + "px; desktop >= " + project.breakpoints.desktop + "px.",
    "Honor each layer's horizontal/vertical constraint, min/max width and visibleOn device list. Reusable templates retain componentKey.",
    "Canvas background: " + project.background,
    "Positioning model: absolute artboard coordinates; x/y are measured from the artboard top-left. Preserve element order as z-order.",
    "Preserve exact colors, icon identifiers, typeface names, text sizes, font weights, line heights, letter spacing, radii, borders, padding and per-side margins. Do not substitute icons or rewrite copy.",
    "Use the exact text content from each layer. Reproduce spacing and dimensions before adding responsive behavior. For responsive layouts, keep the specified viewport as the reference.",
    "",
    "DESIGN TOKENS",
    "Colors: " + Array.from(new Set([project.background, ...project.elements.flatMap((item) => [item.color, item.background, item.borderColor])].filter((v) => v && v !== "transparent"))).join(", "),
    "Font families: " + Array.from(new Set(project.elements.map((item) => item.fontFamily))).join(", "),
    "Named color tokens: " + project.tokens.colors.map((token) => token.name + "=" + token.value).join(", "),
    "Typography tokens: " + project.tokens.typography.map((token) => token.name + "=" + token.fontFamily + " " + token.fontSize + "px/" + token.lineHeight + " weight " + token.fontWeight).join("; "),
    "Spacing tokens: " + project.tokens.spacing.map((value) => value + "px").join(", "),
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
      "   responsive horizontal=" + item.horizontalConstraint + "; vertical=" + item.verticalConstraint + "; minWidth=" + item.minWidth + "; maxWidth=" + item.maxWidth + "; visibleOn=" + (item.visibleOn || []).join(","),
      "   referenceViewport=" + item.referenceWidth + "x" + item.referenceHeight + "; componentKey=" + item.componentKey,
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

function svgToPng(svg: SVGSVGElement, scale = 3, target: DeviceTarget = "mobile"): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const screenWidth = svg.viewBox.baseVal.width;
        const screenHeight = svg.viewBox.baseVal.height;
        const bezel = target === "mobile" ? 18 : target === "tablet" ? 22 : 12;
        const stand = target === "desktop" ? 64 : 0;
        const frameWidth = screenWidth + bezel * 2;
        const frameHeight = screenHeight + bezel * 2 + stand;
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(frameWidth * scale);
        canvas.height = Math.ceil(frameHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("The browser could not create an export canvas.");
        context.scale(scale, scale);
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, frameWidth, frameHeight);
        context.fillStyle = "#111315";
        context.shadowColor = "rgba(15, 23, 42, 0.22)";
        context.shadowBlur = target === "desktop" ? 18 : 24;
        context.shadowOffsetY = 8;
        const radius = target === "mobile" ? 52 : target === "tablet" ? 26 : 10;
        context.beginPath();
        context.roundRect(0, 0, frameWidth, screenHeight + bezel * 2, radius);
        context.fill();
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        context.shadowOffsetY = 0;
        context.save();
        context.beginPath();
        context.roundRect(bezel, bezel, screenWidth, screenHeight, target === "mobile" ? 40 : target === "tablet" ? 18 : 2);
        context.clip();
        context.drawImage(image, bezel, bezel, screenWidth, screenHeight);
        context.restore();
        if (target === "mobile") {
          context.fillStyle = "#050506";
          context.beginPath();
          context.roundRect(frameWidth / 2 - 54, 15, 108, 21, 12);
          context.fill();
        } else if (target === "tablet") {
          context.fillStyle = "#050506";
          context.beginPath();
          context.arc(frameWidth / 2, 10, 3, 0, Math.PI * 2);
          context.fill();
        } else {
          context.fillStyle = "#27292C";
          context.beginPath();
          context.roundRect(frameWidth * 0.4, screenHeight + bezel * 2 - 1, frameWidth * 0.2, 45, 5);
          context.fill();
          context.beginPath();
          context.roundRect(frameWidth * 0.25, screenHeight + bezel * 2 + 38, frameWidth * 0.5, 8, 4);
          context.fill();
        }
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

async function buildPdf(project: SavedProject, svg: SVGSVGElement, prompt: string, target: DeviceTarget) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(project.name + " - enV UX/UI Studio");
  pdf.setSubject("Visual interface and machine-readable design specification");
  pdf.setCreator("enV UX/UI Studio");
  const previewPng = await svgToPng(svg, 3, target);
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
  const initialDesign = useMemo(() => ({ name: "Untitled design", background: "#FFFFFF", elements: [] as DesignLayer[] }), []);
  const [target, setTarget] = useState<DeviceTarget>("mobile");
  const [onboarding, setOnboarding] = useState(true);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showMoreLayers, setShowMoreLayers] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [activeScreenId, setActiveScreenId] = useState("screen-home");
  const [screens, setScreens] = useState<DesignScreen[]>([{ id: "screen-home", name: "Screen 1", target: "mobile", background: "#FFFFFF", customArtboard: false, customWidth: 390, customHeight: 844, elements: [], updatedAt: new Date().toISOString() }]);
  const [paletteMode, setPaletteMode] = useState<"fill" | "text">("fill");
  const [helpOpen, setHelpOpen] = useState(false);
  const [savedProject, setSavedProject] = useState<SavedProject | null>(null);
  const [drafts, setDrafts] = useState<SavedProject[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [projectName, setProjectName] = useState(initialDesign.name);
  const [background, setBackground] = useState(initialDesign.background);
  const [customArtboard, setCustomArtboard] = useState(false);
  const [customWidth, setCustomWidth] = useState(390);
  const [customHeight, setCustomHeight] = useState(844);
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_TOKENS);
  const [reusableComponents, setReusableComponents] = useState<DesignLayer[]>([]);
  const [tokenNameDraft, setTokenNameDraft] = useState("brand");
  const [tokenValueDraft, setTokenValueDraft] = useState("#2563EB");
  const [elements, setElements] = useState<DesignLayer[]>(initialDesign.elements);
  const [undoStack, setUndoStack] = useState<DesignLayer[][]>([]);
  const [redoStack, setRedoStack] = useState<DesignLayer[][]>([]);
  const [selectedId, setSelectedId] = useState(initialDesign.elements[0]?.id || "");
  const [leftTab, setLeftTab] = useState<PanelTab>("toolkits");
  const [activeToolkitId, setActiveToolkitId] = useState("icons");
  const [qaReport, setQaReport] = useState<string[]>([]);
  const [showQaReport, setShowQaReport] = useState(false);
  const [toolkitSearch, setToolkitSearch] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [showContextColors, setShowContextColors] = useState(false);
  const [showAdvancedContext, setShowAdvancedContext] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboardLayers, setClipboardLayers] = useState<DesignLayer[]>([]);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("design");
  const [iconQuery, setIconQuery] = useState("");
  const [iconBrowseCategory, setIconBrowseCategory] = useState("Navigation");
  const [iconPrefix, setIconPrefix] = useState("all");
  const [fontQuery, setFontQuery] = useState("");
  const [fontCategory, setFontCategory] = useState("All");
  const [remoteFonts, setRemoteFonts] = useState<FontLibraryItem[]>([]);
  const [fontCatalogLoading, setFontCatalogLoading] = useState(false);
  const [fontCatalogError, setFontCatalogError] = useState("");
  const [fontCatalogReload, setFontCatalogReload] = useState(0);
  const fontCatalogRequested = useRef(false);
  const [fontDownloadId, setFontDownloadId] = useState("");
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
  const studioRootRef = useRef<HTMLElement | null>(null);
  const quickImageInputRef = useRef<HTMLInputElement | null>(null);
  const elementImportInputRef = useRef<HTMLInputElement | null>(null);
  const presetImportInputRef = useRef<HTMLInputElement | null>(null);
  const iconImportInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ id: string; pointerX: number; pointerY: number; startX: number; startY: number; groupStarts?: Array<{ id: string; x: number; y: number }> } | null>(null);

  const board = customArtboard ? { width: customWidth, height: customHeight } : boardSize(target);
  const selected = elements.find((item) => item.id === selectedId) || null;
  const selectedLayers = elements.filter((item) => selectedIds.includes(item.id));
  const selectedHasText = Boolean(selected && ["text", "button", "card", "input", "navbar", "tabbar", "row", "badge", "dropdown", "search", "textarea", "table", "chart", "modal", "breadcrumb", "tooltip", "list", "video", "logo", "tabs", "menu", "avatar"].includes(selected.kind));
  const fontChoices = useMemo(() => {
    const byFamily = new Map<string, FontLibraryItem>();
    for (const font of FONT_LIBRARY) {
      const id = font.provider === "google" ? font.family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : undefined;
      byFamily.set(font.family.toLowerCase(), { ...font, id });
    }
    for (const font of remoteFonts) byFamily.set(font.family.toLowerCase(), font);
    return Array.from(byFamily.values()).sort((a,b) => a.family.localeCompare(b.family));
  }, [remoteFonts]);
  const uniqueColors = useMemo(() => Array.from(new Set([background, ...elements.flatMap((item) => [item.color, item.background, item.borderColor]), ...tokens.colors.map((token) => token.value)].filter((color) => color && color !== "transparent"))), [background, elements, tokens]);
  const project = useMemo(() => ({ ...buildProjectSpec(projectName, target, background, board, elements, tokens, reusableComponents), screens, activeScreenId }), [projectName, target, background, board.width, board.height, elements, tokens, reusableComponents, screens, activeScreenId]);
  const activeScreen = screens.find((screen) => screen.id === activeScreenId) || screens[0];

  useEffect(() => {
    if (!activeScreenId) return;
    setScreens((previous) => {
      const current = previous.find((screen) => screen.id === activeScreenId);
      if (!current) return previous;
      if (current.elements === elements && current.name === (current.name || "Screen 1") && current.target === target && current.background === background && current.customArtboard === customArtboard && current.customWidth === customWidth && current.customHeight === customHeight) return previous;
      const updated: DesignScreen = { ...current, elements, target, background, customArtboard, customWidth, customHeight, updatedAt: new Date().toISOString() };
      return previous.map((screen) => screen.id === activeScreenId ? updated : screen);
    });
  }, [activeScreenId, elements, target, background, customArtboard, customWidth, customHeight]);
  const aiPrompt = useMemo(() => buildAiPrompt(project), [project]);
  const quickIconResults = (ICON_BROWSE_CATEGORIES.find((category)=>category.name===iconBrowseCategory)?.icons || ICON_BROWSE_CATEGORIES[0].icons)
    .filter((name)=>iconPrefix==="all" || name.startsWith(iconPrefix+":"))
    .filter((name)=>!iconQuery.trim() || name.toLowerCase().includes(iconQuery.trim().toLowerCase()));
  const visibleIconResults = iconQuery.trim().length >= 2 ? iconResults : quickIconResults;
  const fontsInUse = useMemo(()=>Array.from(new Set(elements.map((layer)=>layer.fontFamily).filter((family)=>FONT_LIBRARY.some((font)=>font.family===family&&font.provider==="google")))),[elements]);
  const customFontSignature = useMemo(()=>elements.filter((layer)=>layer.fontDataUrl).map((layer)=>layer.fontFamily+"|"+layer.fontDataUrl.length+"|"+layer.fontDataUrl.slice(0,48)).join("\n"),[elements]);

  useEffect(() => {
    try {
      const listRaw = localStorage.getItem(DRAFTS_STORAGE_KEY);
      const listParsed = listRaw ? JSON.parse(listRaw) as unknown : [];
      const storedDrafts = Array.isArray(listParsed) ? listParsed.filter((item): item is SavedProject =>
        Boolean(item && typeof item === "object" && (item as SavedProject).schemaVersion === 2 &&
          Array.isArray((item as SavedProject).elements) && (item as SavedProject).viewport?.width)) : [];
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Omit<SavedProject, "schemaVersion"> & { schemaVersion: number };
        if ((parsed.schemaVersion === 1 || parsed.schemaVersion === 2) && Array.isArray(parsed.elements) && parsed.viewport?.width) {
          const normalized = {
            ...parsed, id: parsed.id || "draft-" + Date.now().toString(36), schemaVersion: 2 as const,
            elements: parsed.elements.map((layer: Partial<DesignLayer>) => ({
              ...layer, horizontalConstraint: layer.horizontalConstraint || "left",
              verticalConstraint: layer.verticalConstraint || "top", minWidth: layer.minWidth ?? 0,
              maxWidth: layer.maxWidth ?? 0, visibleOn: layer.visibleOn || ["mobile", "tablet", "desktop"],
              referenceWidth: layer.referenceWidth || parsed.viewport.width,
              referenceHeight: layer.referenceHeight || parsed.viewport.height,
              componentKey: layer.componentKey || "", fontDataUrl: layer.fontDataUrl || "", rotation: layer.rotation || 0,
            } as DesignLayer)),
            tokens: parsed.tokens || DEFAULT_TOKENS, breakpoints: parsed.breakpoints || DESIGN_BREAKPOINTS,
            reusableComponents: parsed.reusableComponents || [],
          } as SavedProject;
          const restoredScreens: DesignScreen[] = Array.isArray(parsed.screens) && parsed.screens.length
            ? parsed.screens.filter((screen) => screen && typeof screen.id === "string" && Array.isArray(screen.elements)).map((screen) => ({
                ...screen,
                id: screen.id || newScreenId(),
                name: typeof screen.name === "string" && screen.name.trim() ? screen.name : "Screen",
                target: (["mobile", "tablet", "desktop"].includes(screen.target) ? screen.target : parsed.target) as DeviceTarget,
                background: typeof screen.background === "string" ? screen.background : parsed.background,
                customArtboard: Boolean(screen.customArtboard),
                customWidth: Number.isFinite(screen.customWidth) ? Math.max(160, Math.min(4096, screen.customWidth)) : parsed.viewport.width,
                customHeight: Number.isFinite(screen.customHeight) ? Math.max(240, Math.min(4096, screen.customHeight)) : parsed.viewport.height,
                elements: screen.elements.map((layer: Partial<DesignLayer>) => ({
                  ...layer, horizontalConstraint: layer.horizontalConstraint || "left",
                  verticalConstraint: layer.verticalConstraint || "top", minWidth: layer.minWidth ?? 0,
                  maxWidth: layer.maxWidth ?? 0, visibleOn: layer.visibleOn || ["mobile", "tablet", "desktop"],
                  referenceWidth: layer.referenceWidth || parsed.viewport.width,
                  referenceHeight: layer.referenceHeight || parsed.viewport.height,
                  componentKey: layer.componentKey || "", fontDataUrl: layer.fontDataUrl || "", rotation: layer.rotation || 0,
                } as DesignLayer)),
                updatedAt: screen.updatedAt || parsed.updatedAt || new Date().toISOString(),
              }))
            : [{
                id: "screen-home", name: "Screen 1", target: normalized.target, background: normalized.background,
                customArtboard: true, customWidth: normalized.viewport.width, customHeight: normalized.viewport.height,
                elements: normalized.elements, updatedAt: normalized.updatedAt || new Date().toISOString(),
              }];
          const initialScreen = restoredScreens.find((screen) => screen.id === parsed.activeScreenId) || restoredScreens[0];
          const hydrated: SavedProject = {
            ...normalized, screens: restoredScreens, activeScreenId: initialScreen.id,
            target: initialScreen.target, background: initialScreen.background,
            viewport: { width: initialScreen.customArtboard ? initialScreen.customWidth : boardSize(initialScreen.target).width,
              height: initialScreen.customArtboard ? initialScreen.customHeight : boardSize(initialScreen.target).height },
            elements: initialScreen.elements,
          };
          const merged = [hydrated, ...storedDrafts.filter((item) => item.id !== hydrated.id)]
            .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 50);
          localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(merged));
          setSavedProject(hydrated); setDrafts(merged); setProjectName(hydrated.name);
          setScreens(restoredScreens); setActiveScreenId(initialScreen.id);
          setTarget(initialScreen.target); setBackground(initialScreen.background); setCustomArtboard(initialScreen.customArtboard);
          setCustomWidth(initialScreen.customWidth); setCustomHeight(initialScreen.customHeight);
          setTokens(hydrated.tokens); setReusableComponents(hydrated.reusableComponents);
          setElements(initialScreen.elements); setSelectedId(initialScreen.elements[0]?.id || "");
        } else setDrafts(storedDrafts);
      } else setDrafts(storedDrafts);
    } catch { /* A corrupt local draft does not block the studio. */ }
    finally { setDraftLoaded(true); }
  }, []);

  useEffect(() => {
    if (!draftLoaded || onboarding || (!project.elements.length && project.name.trim() === "Untitled design" && screens.length <= 1)) return;
    try {
      const nextId = activeDraftId || "draft-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
      const saved = { ...project, id: nextId } as SavedProject;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) as unknown : [];
      const existing = Array.isArray(parsed) ? parsed.filter((item): item is SavedProject =>
        Boolean(item && typeof item === "object" && (item as SavedProject).schemaVersion === 2)) : [];
      const nextDrafts = [saved, ...existing.filter((item) => item.id !== nextId)]
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 50);
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(nextDrafts));
      setSavedProject(saved); setDrafts(nextDrafts);
      if (!activeDraftId) setActiveDraftId(nextId);
    } catch { setNotice("This browser could not save the draft locally. Export the project JSON for a backup."); }
  }, [project, onboarding, draftLoaded, activeDraftId]);

  useEffect(() => {
    if (leftTab !== "fonts" || fontCatalogRequested.current) return;
    fontCatalogRequested.current = true;
    const controller = new AbortController();
    setFontCatalogLoading(true);
    setFontCatalogError("");
    fetch("https://api.fontsource.org/v1/fonts?type=google", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The open font catalogue is temporarily unavailable.");
        const payload = await response.json() as unknown;
        if (!Array.isArray(payload)) throw new Error("The font catalogue returned an unexpected response.");
        const mapped = (payload as FontsourceFontRecord[])
          .filter((font) => typeof font.family === "string" && typeof font.id === "string")
          .map((font): FontLibraryItem => ({
            family: font.family!, id: font.id!, category: fontsourceCategory(font.category), provider: "google",
            weights: Array.isArray(font.weights) ? font.weights.filter((weight): weight is number => Number.isFinite(weight)) : [],
            styles: Array.isArray(font.styles) ? font.styles.filter((style): style is string => typeof style === "string") : [],
            variable: font.variable === true,
          }));
        setRemoteFonts(mapped);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setFontCatalogError(error instanceof Error ? error.message : "Could not load the font catalogue.");
      })
      .finally(() => { if (!controller.signal.aborted) setFontCatalogLoading(false); });
    return () => controller.abort();
  }, [leftTab, fontCatalogReload]);

  useEffect(() => {
    if (leftTab !== "icons" || iconQuery.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIconLoading(true);
      setIconError("");
      try {
        const url = "https://api.iconify.design/search?query=" + encodeURIComponent(iconQuery.trim()) + "&limit=32&start=" + iconStart + (iconPrefix !== "all" ? "&prefix=" + encodeURIComponent(iconPrefix) : "");
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
  }, [leftTab, iconQuery, iconStart, iconPrefix]);

  useEffect(() => {
    for (const family of fontsInUse) {
      const id = "env-ux-font-" + family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (document.getElementById(id)) continue;
      const link = document.createElement("link");
      link.id = id; link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(family).replace(/%20/g, "+") + ":wght@300;400;500;600;700;800;900&display=swap";
      document.head.appendChild(link);
    }
  }, [fontsInUse.join("|")]);

  useEffect(() => {
    const assets = elements.filter((layer)=>layer.fontDataUrl && layer.fontFamily);
    let cancelled = false;
    for (const layer of assets) {
      if (document.fonts.check('16px "' + layer.fontFamily.replace(/"/g,"") + '"')) continue;
      try {
        const face = new FontFace(layer.fontFamily, "url(" + JSON.stringify(layer.fontDataUrl) + ")");
        void face.load().then((loaded)=>{ if (!cancelled) document.fonts.add(loaded); }).catch(()=>{ if (!cancelled) setNotice("A custom font could not be loaded. Re-import a valid TTF, OTF, WOFF or WOFF2 file."); });
      } catch { setNotice("A custom font could not be loaded. Check the imported font file."); }
    }
    return () => { cancelled = true; };
  }, [customFontSignature]);

  function startDesign(nextTarget: DeviceTarget = "mobile", presetId?: string) {
    const created = presetId ? createPreset(nextTarget, presetId) : { name: "Untitled design", background: "#FFFFFF", elements: [] as DesignLayer[] };
    const size = boardSize(nextTarget);
    setCustomArtboard(false); setCustomWidth(size.width); setCustomHeight(size.height);
    setTarget(nextTarget); setProjectName(created.name); setBackground(created.background);
    setTokens(DEFAULT_TOKENS); setReusableComponents([]);
    const nextScreenId = newScreenId();
    setScreens([{ id: nextScreenId, name: "Screen 1", target: nextTarget, background: created.background, customArtboard: false, customWidth: size.width, customHeight: size.height, elements: created.elements, updatedAt: new Date().toISOString() }]);
    setActiveScreenId(nextScreenId);
    setElements(created.elements); setSelectedId(created.elements[0]?.id || "");
    setUndoStack([]); setRedoStack([]); setLeftTab("toolkits"); setToolkitSearch("");
    setShowToolsPanel(false); setShowExportPanel(false); setShowTextEditor(false); setShowContextColors(false);
    setZoom(100); setActiveDraftId(""); setOnboarding(false);
    setNotice(created.elements.length ? "Design ready. Tap an element to edit it." : "Your blank canvas is ready. Tap + to add your first element.");
  }

  function continueSaved(draft: SavedProject | null = savedProject) {
    if (!draft) return;
    const restoredScreens = draft.screens?.length ? draft.screens : [{
      id: newScreenId(), name: "Screen 1", target: draft.target, background: draft.background,
      customArtboard: true, customWidth: draft.viewport.width, customHeight: draft.viewport.height,
      elements: draft.elements, updatedAt: draft.updatedAt,
    }];
    const currentScreen = restoredScreens.find((screen) => screen.id === draft.activeScreenId) || restoredScreens[0];
    setScreens(restoredScreens);
    setActiveScreenId(currentScreen.id);
    setProjectName(draft.name); setTarget(currentScreen.target); setBackground(currentScreen.background);
    setCustomArtboard(currentScreen.customArtboard); setCustomWidth(currentScreen.customWidth); setCustomHeight(currentScreen.customHeight);
    setTokens(draft.tokens || DEFAULT_TOKENS); setReusableComponents(draft.reusableComponents || []);
    setElements(currentScreen.elements.map((layer) => ({
      ...layer, horizontalConstraint: layer.horizontalConstraint || "left", verticalConstraint: layer.verticalConstraint || "top",
      minWidth: layer.minWidth ?? 0, maxWidth: layer.maxWidth ?? 0,
      visibleOn: layer.visibleOn || ["mobile", "tablet", "desktop"],
      referenceWidth: layer.referenceWidth || draft.viewport.width,
      referenceHeight: layer.referenceHeight || draft.viewport.height,
      componentKey: layer.componentKey || "", rotation: layer.rotation || 0,
    })));
    setSelectedId(currentScreen.elements[0]?.id || ""); setActiveDraftId(draft.id || "");
    setLeftTab("toolkits"); setToolkitSearch(""); setShowToolsPanel(false); setShowExportPanel(false);
    setShowTextEditor(false); setShowContextColors(false); setOnboarding(false);
    setNotice("Draft opened. Tap an element to continue designing.");
  }

  function activeScreenSnapshot(): DesignScreen {
    const current = screens.find((screen) => screen.id === activeScreenId);
    return { id: activeScreenId || newScreenId(), name: current?.name || ("Screen " + (screens.length || 1)), target, background, customArtboard, customWidth, customHeight, elements, updatedAt: new Date().toISOString() };
  }

  function openScreen(screenId: string) {
    if (screenId === activeScreenId) return;
    const next = screens.find((screen) => screen.id === screenId);
    if (!next) return;
    const current = activeScreenSnapshot();
    checkpoint();
    setScreens((previous) => previous.map((screen) => screen.id === current.id ? current : screen));
    setActiveScreenId(next.id);
    setTarget(next.target); setBackground(next.background);
    setCustomArtboard(next.customArtboard); setCustomWidth(next.customWidth); setCustomHeight(next.customHeight);
    setElements(next.elements); setSelectedId(next.elements[0]?.id || "");
    setShowInspector(false); setNotice("Opened " + next.name + ".");
  }

  function addScreen() {
    const current = activeScreenSnapshot();
    const id = newScreenId();
    const next: DesignScreen = { ...current, id, name: "Screen " + (screens.length + 1), elements: [], updatedAt: new Date().toISOString() };
    setScreens((previous) => [...previous.map((screen) => screen.id === current.id ? current : screen), next]);
    setActiveScreenId(id); setElements([]); setSelectedId("");
    setUndoStack([]); setRedoStack([]); setShowInspector(true);
    setNotice(next.name + " added. Add elements to design this screen.");
  }

  function duplicateScreen(screenId: string) {
    const source = screens.find((screen) => screen.id === screenId);
    if (!source) return;
    const duplicate: DesignScreen = { ...source, id: newScreenId(), name: source.name + " copy", elements: source.elements.map((layer) => ({ ...layer, id: layerId(), name: layer.name + " copy" })), updatedAt: new Date().toISOString() };
    const current = activeScreenSnapshot();
    setScreens((previous) => [...previous.map((screen) => screen.id === current.id ? current : screen), duplicate]);
    setActiveScreenId(duplicate.id); setTarget(duplicate.target); setBackground(duplicate.background);
    setCustomArtboard(duplicate.customArtboard); setCustomWidth(duplicate.customWidth); setCustomHeight(duplicate.customHeight);
    setElements(duplicate.elements); setSelectedId(duplicate.elements[0]?.id || "");
    setShowInspector(true); setNotice(duplicate.name + " duplicated.");
  }

  function deleteScreen(screenId: string) {
    if (screens.length <= 1) { setNotice("A project must keep at least one screen."); return; }
    const index = screens.findIndex((screen) => screen.id === screenId);
    if (index < 0) return;
    const remaining = screens.filter((screen) => screen.id !== screenId);
    if (screenId === activeScreenId) {
      const next = remaining[Math.max(0, index - 1)];
      setScreens(remaining); setActiveScreenId(next.id);
      setTarget(next.target); setBackground(next.background); setCustomArtboard(next.customArtboard);
      setCustomWidth(next.customWidth); setCustomHeight(next.customHeight); setElements(next.elements); setSelectedId(next.elements[0]?.id || "");
    } else setScreens(remaining);
    setNotice("Screen deleted.");
  }

  function reorderScreen(screenId: string, offset: number) {
    const current = activeScreenSnapshot();
    const source = screens.map((screen) => screen.id === current.id ? current : screen);
    const index = source.findIndex((screen) => screen.id === screenId);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= source.length) return;
    const next = [...source];
    [next[index], next[destination]] = [next[destination], next[index]];
    setScreens(next);
  }

  function renameScreen(screenId: string, name: string) {
    setScreens((previous) => previous.map((screen) => screen.id === screenId ? { ...screen, name: name.slice(0, 70), updatedAt: new Date().toISOString() } : screen));
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

  function selectLayer(id: string, multi = false) {
    setSelectedId(id);
    setSelectedIds((previous) => multi ? (previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]) : [id]);
  }

  function copySelectedLayers() {
    const copied = selectedLayers.length ? selectedLayers : selected ? [selected] : [];
    if (!copied.length) { setNotice("Select one or more layers to copy."); return; }
    setClipboardLayers(copied.map((item) => ({ ...item })));
    setNotice(copied.length + " layer(s) copied within this project.");
  }

  function cutSelectedLayers() {
    const copied = selectedLayers.length ? selectedLayers : selected ? [selected] : [];
    if (!copied.length) { setNotice("Select one or more layers to cut."); return; }
    setClipboardLayers(copied.map((item) => ({ ...item })));
    checkpoint();
    setElements((previous) => previous.filter((item) => !copied.some((source) => source.id === item.id)));
    setSelectedId(""); setSelectedIds([]);
    setNotice(copied.length + " layer(s) cut. Paste to restore them on this screen.");
  }

  function pasteLayers() {
    if (!clipboardLayers.length) { setNotice("Your local layer clipboard is empty."); return; }
    const pasted = clipboardLayers.map((item) => ({
      ...item, id: layerId(), name: item.name + " copy",
      x: Math.min(Math.max(0, board.width - item.width), item.x + 16),
      y: Math.min(Math.max(0, board.height - item.height), item.y + 16),
      referenceWidth: board.width, referenceHeight: board.height,
    }));
    const ids = pasted.map((item) => item.id);
    checkpoint();
    setElements((previous) => [...previous, ...pasted]);
    setSelectedId(ids[ids.length - 1] || "");
    setSelectedIds(ids);
    setNotice(pasted.length + " layer(s) pasted.");
  }

  function groupSelectedLayers() {
    const ids = selectedLayers.map((item) => item.id);
    if (ids.length < 2) { setNotice("Select at least two layers (Shift+tap or Shift+click) before grouping."); return; }
    checkpoint();
    const groupId = "group-" + Date.now().toString(36);
    setElements((previous) => previous.map((item) => ids.includes(item.id) ? { ...item, groupId } : item));
    setNotice(ids.length + " layers grouped. Drag one grouped layer to move them together.");
  }

  function ungroupSelectedLayers() {
    const ids = selectedLayers.map((item) => item.id);
    if (!ids.length || !selectedLayers.some((item) => item.groupId)) { setNotice("Select one or more grouped layers first."); return; }
    checkpoint();
    setElements((previous) => previous.map((item) => ids.includes(item.id) ? { ...item, groupId: "" } : item));
    setNotice("Selected layers ungrouped.");
  }

  function alignSelectedLayers(edge: "left" | "center" | "right" | "top" | "middle" | "bottom") {
    if (selectedLayers.length < 2) { setNotice("Select at least two layers before aligning."); return; }
    const left = Math.min(...selectedLayers.map((item) => item.x));
    const top = Math.min(...selectedLayers.map((item) => item.y));
    const right = Math.max(...selectedLayers.map((item) => item.x + item.width));
    const bottom = Math.max(...selectedLayers.map((item) => item.y + item.height));
    checkpoint();
    const ids = selectedLayers.map((item) => item.id);
    setElements((previous) => previous.map((item) => {
      if (!ids.includes(item.id)) return item;
      const patch = edge === "left" ? { x: left } : edge === "center" ? { x: Math.round((left + right - item.width) / 2) } : edge === "right" ? { x: right - item.width } : edge === "top" ? { y: top } : edge === "middle" ? { y: Math.round((top + bottom - item.height) / 2) } : { y: bottom - item.height };
      return { ...item, ...patch };
    }));
    setNotice("Aligned " + ids.length + " selected layers.");
  }

  function distributeSelectedLayers(axis: "horizontal" | "vertical") {
    if (selectedLayers.length < 3) { setNotice("Select at least three layers before distributing."); return; }
    const ordered = [...selectedLayers].sort((a, b) => axis === "horizontal" ? a.x - b.x : a.y - b.y);
    const first = ordered[0], last = ordered[ordered.length - 1];
    const extent = axis === "horizontal" ? last.x + last.width - first.x : last.y + last.height - first.y;
    const total = ordered.reduce((sum, item) => sum + (axis === "horizontal" ? item.width : item.height), 0);
    const gap = (extent - total) / Math.max(1, ordered.length - 1);
    checkpoint();
    let cursor = axis === "horizontal" ? first.x : first.y;
    const positions = new Map<string, number>();
    ordered.forEach((item, index) => {
      positions.set(item.id, Math.round(cursor));
      cursor += (axis === "horizontal" ? item.width : item.height) + (index === ordered.length - 1 ? 0 : gap);
    });
    setElements((previous) => previous.map((item) => {
      const position = positions.get(item.id);
      if (position === undefined) return item;
      return axis === "horizontal" ? { ...item, x: position } : { ...item, y: position };
    }));
    setNotice("Distributed " + ordered.length + " layers " + axis + "ly.");
  }

  function openToolkit(id: string) {
    const toolkit = STUDIO_TOOLKITS.find((item) => item.id === id);
    if (!toolkit) return;
    setActiveToolkitId(id);
    setLeftTab(toolkit.tab);
    if (["media", "illustrations", "assets", "inspiration"].includes(id)) setNotice("Use the import actions to bring a supported image or SVG into the project.");
    if (id === "device" || id === "platform") setNotice("Choose Mobile, Tablet or Desktop using the viewport selector above the mockup.");
  }

  function runDesignAudit() {
    const findings: string[] = [];
    if (!elements.length) findings.push("No layers have been added yet.");
    for (const item of elements) {
      if (!item.name.trim()) findings.push("Unnamed layer: " + item.id);
      if (item.x < 0 || item.y < 0 || item.x + item.width > board.width || item.y + item.height > board.height) findings.push(item.name + ": extends beyond the current artboard.");
      if (item.width < 44 || item.height < 44) findings.push(item.name + ": may be smaller than a comfortable touch target.");
      if (item.kind === "icon" && !item.iconSvg.trim()) findings.push(item.name + ": icon SVG content is missing.");
      if (item.kind === "image" && !item.imageDataUrl.trim()) findings.push(item.name + ": image source is missing.");
      if (["text","button","input","search","textarea"].includes(item.kind) && item.fontSize < 14) findings.push(item.name + ": text is below 14 px; verify readability and scaling.");
      if (item.borderWidth > 0 && (!item.borderColor || item.borderColor === "transparent")) findings.push(item.name + ": border width is set but the border color is transparent.");
    }
    for (let i = 0; i < elements.length; i++) for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i], b = elements[j];
      const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapWidth > 0 && overlapHeight > 0) findings.push(a.name + " overlaps " + b.name + " by " + Math.round(overlapWidth) + "×" + Math.round(overlapHeight) + " px.");
    }
    setQaReport(findings);
    setShowQaReport(true);
    setNotice("Design QA completed: " + findings.length + " potential finding(s). This local structural scan is advisory, not a conformance certification.");
  }

  function addSample(kind: LayerKind, name: string, copy: string) {
    const layer = { ...makeLayer(kind, Math.max(8, Math.round(board.width * 0.08)), Math.max(24, Math.round(board.height * 0.16) + elements.length * 74), board.width, board.height), name, text: copy, width: Math.min(kind === "text" ? board.width - 24 : 240, board.width - 24) };
    checkpoint();
    setElements((previous) => [...previous, layer]);
    setSelectedId(layer.id);
    setInspectorTab("design");
    setNotice(name + " added to the artboard.");
  }
  function addLayer(kind: LayerKind) {
    const x = Math.max(8, Math.round((board.width - Math.min(kind === "text" ? 250 : 180, board.width - 24)) / 2));
    const layer = makeLayer(kind, x, Math.max(24, Math.round(board.height * 0.28)), board.width, board.height);
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
    const size = boardSize(preset.target);
    setCustomArtboard(false); setCustomWidth(size.width); setCustomHeight(size.height);
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
      referenceWidth: nextBoard.width, referenceHeight: nextBoard.height,
    })));
    setCustomArtboard(false); setCustomWidth(nextBoard.width); setCustomHeight(nextBoard.height);
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
    const starts = drag.groupStarts?.length ? drag.groupStarts : [{ id: drag.id, x: drag.startX, y: drag.startY }];
    setElements((previous) => previous.map((item) => {
      const origin = starts.find((start) => start.id === item.id);
      return origin ? { ...item, x: Math.max(0, Math.min(board.width - item.width, origin.x + nextX - drag.startX)), y: Math.max(0, Math.min(board.height - item.height, origin.y + nextY - drag.startY)) } : item;
    }));
  }

  function onArtboardPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    const node = (event.target as Element).closest("[data-layer-id]");
    const id = node?.getAttribute("data-layer-id");
    if (!id) { setSelectedId(""); return; }
    const found = elements.find((item) => item.id === id);
    if (!found) return;
    selectLayer(id, event.shiftKey);
    if (found.locked || found.hidden || found.display === "none") { dragRef.current = null; return; }
    checkpoint();
    const rect = event.currentTarget.getBoundingClientRect();
    const groupStarts = found.groupId ? elements.filter((item) => item.groupId === found.groupId).map((item) => ({ id: item.id, x: item.x, y: item.y })) : [{ id: found.id, x: found.x, y: found.y }];
    dragRef.current = {
      id, pointerX: (event.clientX - rect.left) * board.width / Math.max(1, rect.width),
      pointerY: (event.clientY - rect.top) * board.height / Math.max(1, rect.height),
      startX: found.x, startY: found.y, groupStarts,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function toggleExpandedPreview() {
    if (isExpanded) {
      setIsExpanded(false);
      if (document.fullscreenElement && document.exitFullscreen) void document.exitFullscreen().catch(() => undefined);
      return;
    }
    setIsExpanded(true);
    const root = studioRootRef.current;
    if (root?.requestFullscreen) void root.requestFullscreen().catch(() => undefined);
  }

  useEffect(() => {
    const syncFullscreen = () => { if (!document.fullscreenElement) setIsExpanded(false); };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  function normalizeImportedLayers(raw: unknown, referenceWidth = board.width, referenceHeight = board.height): DesignLayer[] {
    if (!Array.isArray(raw)) throw new Error("The file does not contain an element list.");
    const validKinds = new Set<string>([...COMPONENTS.map((item) => item.kind), "ellipse", "spacer", "toggle", "dropdown", "search", "textarea", "table", "chart", "modal", "breadcrumb", "tooltip", "list", "video", "logo", "tabs", "menu", "progress", "slider", "radio", "switch", "triangle", "diamond", "hexagon", "star", "line", "pill"]);
    return raw.slice(0, 100).flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const rawLayer = value as Partial<DesignLayer>;
      const kind = typeof rawLayer.kind === "string" && validKinds.has(rawLayer.kind) ? rawLayer.kind as LayerKind : "rect";
      const x = Number.isFinite(rawLayer.x) ? Number(rawLayer.x) : 24;
      const y = Number.isFinite(rawLayer.y) ? Number(rawLayer.y) : 24;
      const defaults = makeLayer(kind, Math.max(0, x), Math.max(0, y), referenceWidth, referenceHeight);
      let safeIcon = { body: "", viewBox: "0 0 24 24" };
      if (kind === "icon" && typeof rawLayer.iconSvg === "string" && rawLayer.iconSvg) {
        try { safeIcon = sanitizeIconMarkup('<svg viewBox="' + String(rawLayer.iconViewBox || "0 0 24 24").replace(/["<>]/g, "") + '">' + rawLayer.iconSvg + "</svg>"); } catch { /* Ignore unsafe imported SVG markup. */ }
      }
      return [{ ...defaults, ...rawLayer, id: layerId(), kind,
        name: typeof rawLayer.name === "string" ? rawLayer.name : defaults.name,
        x: Math.max(0, Math.min(referenceWidth - 1, x)), y: Math.max(0, Math.min(referenceHeight - 1, y)),
        width: Math.max(1, Math.min(referenceWidth, Number.isFinite(rawLayer.width) ? Number(rawLayer.width) : defaults.width)),
        height: Math.max(1, Math.min(referenceHeight, Number.isFinite(rawLayer.height) ? Number(rawLayer.height) : defaults.height)),
        text: typeof rawLayer.text === "string" ? rawLayer.text : defaults.text,
        iconSvg: safeIcon.body, iconViewBox: safeIcon.viewBox,
        rotation: Number.isFinite(rawLayer.rotation) ? Number(rawLayer.rotation) : 0 } as DesignLayer];
    });
  }

  function importElementsFile(file: File) {
    if (file.size > 8 * 1024 * 1024) { setNotice("Import files must be 8 MB or smaller."); return; }
    if (file.name.toLowerCase().endsWith(".svg")) { importIconFile(file); return; }
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        const layer = { ...makeLayer("image", Math.round(board.width / 2 - 125), Math.round(board.height * 0.28), board.width, board.height), name: file.name.split(".").slice(0, -1).join(".") || "Image", text: file.name, imageDataUrl: reader.result };
        checkpoint(); setElements((previous) => [...previous, layer]); setSelectedId(layer.id); setNotice("Image added to your mockup.");
      };
      reader.onerror = () => setNotice("Could not read that image.");
      reader.readAsDataURL(file); return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as unknown;
        const rawLayers = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" ? (parsed as { elements?: unknown }).elements : null);
        const imported = normalizeImportedLayers(rawLayers);
        if (!imported.length) throw new Error("No usable elements were found in that file.");
        checkpoint(); setElements((previous) => [...previous, ...imported]); setSelectedId(imported[imported.length - 1].id); setNotice(imported.length + " element(s) imported.");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Could not import those elements."); }
    };
    reader.onerror = () => setNotice("Could not read that file.");
    reader.readAsText(file);
  }

  function importPresetFile(file: File) {
    if (file.size > 8 * 1024 * 1024) { setNotice("Preset files must be 8 MB or smaller."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<SavedProject>;
        if (!Array.isArray(parsed.elements)) throw new Error("Choose an enV UX/UI Studio project or preset JSON file.");
        const nextTarget: DeviceTarget = parsed.target === "tablet" || parsed.target === "desktop" ? parsed.target : "mobile";
        const width = Number.isFinite(parsed.viewport?.width) ? Number(parsed.viewport?.width) : boardSize(nextTarget).width;
        const height = Number.isFinite(parsed.viewport?.height) ? Number(parsed.viewport?.height) : boardSize(nextTarget).height;
        const imported = normalizeImportedLayers(parsed.elements, width, height);
        checkpoint(); setTarget(nextTarget); setCustomArtboard(Boolean(parsed.viewport)); setCustomWidth(width); setCustomHeight(height);
        setProjectName(typeof parsed.name === "string" ? parsed.name : file.name.split(".").slice(0, -1).join("."));
        setBackground(typeof parsed.background === "string" ? parsed.background : "#FFFFFF");
        setTokens(parsed.tokens || DEFAULT_TOKENS); setReusableComponents(parsed.reusableComponents || []);
        setElements(imported); setSelectedId(imported[0]?.id || ""); setShowToolsPanel(false); setActiveDraftId(""); setOnboarding(false);
        setNotice("Preset imported. You can now customise every element.");
      } catch (error) { setNotice(error instanceof Error ? error.message : "Could not import that preset."); }
    };
    reader.onerror = () => setNotice("Could not read that preset file.");
    reader.readAsText(file);
  }

  function importIconFile(file: File) {
    if (file.size > 1024 * 1024) { setNotice("SVG icons must be 1 MB or smaller."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = sanitizeIconMarkup(String(reader.result));
        const name = file.name.toLowerCase().endsWith(".svg") ? file.name.slice(0, -4) : file.name;
        const details = { iconName: "custom:" + name, iconSvg: parsed.body, iconViewBox: parsed.viewBox, iconLicense: "User supplied", iconAuthor: "Imported by user", name };
        if (selected?.kind === "icon") updateLayer(selected.id, details);
        else { const icon = { ...makeLayer("icon", Math.round(board.width / 2 - 20), Math.round(board.height / 3), board.width, board.height), ...details }; checkpoint(); setElements((previous) => [...previous, icon]); setSelectedId(icon.id); }
        setNotice("SVG icon imported.");
      } catch (error) { setNotice(error instanceof Error ? error.message : "That SVG could not be imported."); }
    };
    reader.onerror = () => setNotice("Could not read that SVG.");
    reader.readAsText(file);
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
        const icon = { ...makeLayer("icon", Math.round(board.width / 2 - 20), Math.round(board.height / 3), board.width, board.height), ...metadata, name: iconName };
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

  async function downloadAndEmbedFont(font: FontLibraryItem) {
    if (!selected || font.provider !== "google") return;
    const fontId = font.id || font.family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setFontDownloadId(fontId);
    setNotice("Downloading " + font.family + " for this project…");
    try {
      const metaResponse = await fetch("https://api.fontsource.org/v1/fonts/" + encodeURIComponent(fontId));
      if (!metaResponse.ok) throw new Error("Font metadata could not be retrieved for " + font.family + ".");
      const metadata = await metaResponse.json() as { variants?: unknown };
      const candidates: Array<{url:string; score:number}> = [];
      const visit = (value: unknown, path: string[]) => {
        if (!value || typeof value !== "object") return;
        const object = value as Record<string, unknown>;
        const url = object.url;
        if (url && typeof url === "object") {
          const ttf = (url as Record<string, unknown>).ttf;
          if (typeof ttf === "string" && /^https:\/\//i.test(ttf)) {
            const context = path.join("/").toLowerCase();
            candidates.push({ url: ttf, score: (context.includes("latin") ? 8 : 0) + (context.includes("400") ? 4 : 0) + (context.includes("normal") ? 2 : 0) });
          }
        }
        for (const [key, child] of Object.entries(object)) visit(child, [...path, key]);
      };
      visit(metadata.variants, []);
      const assetUrl = candidates.sort((a,b)=>b.score-a.score)[0]?.url;
      if (!assetUrl) throw new Error("No TTF asset was listed for " + font.family + ".");
      const response = await fetch(assetUrl);
      if (!response.ok) throw new Error("The font file download failed.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 4 * 1024 * 1024) throw new Error("Font files must be between 1 byte and 4 MB.");
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
      updateLayer(selected.id, { fontFamily: font.family, fontDataUrl: "data:font/ttf;base64," + btoa(binary) });
      setNotice(font.family + " downloaded and embedded in this layer. Check the font licence before distributing the design.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Font download failed. You can import a licensed local font.");
    } finally { setFontDownloadId(""); }
  }

  function exportProject() {
    const content = JSON.stringify({ ...project, aiPrompt, generatedCode: {
      html: generateHtmlProject(project),
      react: generateReactProject(project),
      kotlin: generateKotlinProject(project),
      swift: generateSwiftProject(project),
    } }, null, 2);
    downloadText((projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "env-design") + ".json", content, "application/json;charset=utf-8");
    setNotice("Project JSON downloaded with the full design specification and AI prompt.");
  }

  async function exportPdf() {
    if (!artboardRef.current) return;
    setExporting(true);
    setNotice("");
    try {
      await document.fonts.ready;
      const bytes = await buildPdf(project, artboardRef.current, aiPrompt, project.target);
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
      <section className="uxui-home mx-auto w-full max-w-5xl space-y-7 rounded-2xl border border-border bg-surface p-4 sm:p-8">
        <header className="uxui-home-heading text-center">
          <h2 className="text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">UX/UI Studio</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">Bring your idea to life. Start with a clean mockup, then add and style anything by tapping it.</p>
        </header>
        <div className="uxui-home-create-wrap flex justify-center">
          <button type="button" onClick={() => startDesign("mobile")} aria-label="New project" className="uxui-new-project-card group flex w-full max-w-sm flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface-2 px-6 py-8 text-center transition hover:border-accent hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-accent">
            <span className="uxui-new-project-plus grid size-20 place-items-center rounded-full border-2 border-current transition group-hover:scale-105"><Plus size={38} strokeWidth={1.8} /></span>
            <strong className="text-lg font-extrabold text-fg">New project</strong>
            <span className="text-sm text-muted">Start with a blank design</span>
          </button>
        </div>
        <section className="uxui-drafts space-y-3" aria-labelledby="uxui-drafts-title">
          <div className="flex items-center justify-between gap-3"><h3 id="uxui-drafts-title" className="text-lg font-bold text-fg">Drafts</h3><span className="text-xs text-muted">{drafts.length ? drafts.length + (drafts.length === 1 ? " draft" : " drafts") : ""}</span></div>
          {drafts.length ? <div className="grid gap-2 sm:grid-cols-2">
            {drafts.map((draft, index) => <button key={draft.id || draft.name + index} type="button" onClick={() => continueSaved(draft)} className="uxui-draft-card flex min-w-0 items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-accent hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg"><LayoutTemplate size={22} /></span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-fg">{draft.name || "Untitled design"}</strong><span className="mt-1 block text-xs text-muted">{draft.elements.length ? draft.elements.length + " design elements" : "Blank canvas"} · {draft.target}</span></span>
              <ArrowRight size={17} className="shrink-0 text-muted" />
            </button>)}
          </div> : <div className="uxui-empty-drafts rounded-xl border border-border px-5 py-8 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-surface-2 text-muted"><Layers size={22} /></span>
            <p className="mt-3 text-sm font-semibold text-fg">No drafts yet</p>
            <p className="mt-1 text-sm text-muted">Your designs will appear here as you work.</p>
          </div>}
        </section>
      </section>
    );
  }

  return (
    <section ref={studioRootRef} className={"ux-ui-studio min-w-0 space-y-3 " + (isExpanded ? "is-expanded" : "")}>
      <header className="uxui-topbar">
        <div className="uxui-topbar-left">
          <div className="uxui-target-switch" role="group" aria-label="Preview device">
            <button type="button" aria-label="Mobile" onClick={() => changeTarget("mobile")} aria-pressed={target === "mobile"} className={target === "mobile" ? "is-active" : ""}><Smartphone size={17} /><span>Mobile</span></button>
            <button type="button" aria-label="Tablet" onClick={() => changeTarget("tablet")} aria-pressed={target === "tablet"} className={target === "tablet" ? "is-active" : ""}><Tablet size={17} /><span>Tablet</span></button>
            <button type="button" aria-label="Desktop" onClick={() => changeTarget("desktop")} aria-pressed={target === "desktop"} className={target === "desktop" ? "is-active" : ""}><Monitor size={17} /><span>Desktop</span></button>
          </div>
        </div>
        <div className="uxui-topbar-actions">
          <button type="button" onClick={undoLayout} disabled={!undoStack.length} aria-label="Undo" title="Undo" className="uxui-icon-button"><Undo2 size={18} /></button>
          <button type="button" onClick={redoLayout} disabled={!redoStack.length} aria-label="Redo" title="Redo" className="uxui-icon-button"><Redo2 size={18} /></button>
          <button type="button" onClick={() => setHelpOpen((value) => !value)} aria-label="Studio help" title="How to use the studio" className="uxui-icon-button"><CircleHelp size={20} /></button>
          <button type="button" onClick={() => setShowExportPanel((value) => !value)} aria-expanded={showExportPanel} className="uxui-export-trigger"><FileOutput size={17} /><span>Export</span></button>
          <button type="button" onClick={() => { setOnboarding(true); setIsExpanded(false); setShowToolsPanel(false); }} className="uxui-projects-trigger" aria-label="Back to projects" title="Back to projects"><ArrowLeft size={16} /><span>Projects</span></button>
        </div>
        {showExportPanel && <div className="uxui-export-menu" role="dialog" aria-label="Export design handoff">
          <div className="uxui-export-menu-title">Export your design</div>
          <button type="button" onClick={() => { void exportPdf(); setShowExportPanel(false); }} disabled={exporting || elements.length === 0}><Download size={15} /><span><strong>PDF handoff</strong><small>Mockup preview, design brief and exact specs</small></span></button>
          <button type="button" onClick={() => { exportProject(); setShowExportPanel(false); }}><FileJson size={15} /><span><strong>Project JSON</strong><small>Layers, spacing, fonts, colors and generated code</small></span></button>
          <button type="button" aria-label="React TSX" onClick={() => { downloadText(sourceName(projectName) + "Design.tsx", generateReactProject(project), "text/typescript;charset=utf-8"); setShowExportPanel(false); }}><Type size={15} /><span><strong>React TSX</strong><small>Web implementation</small></span></button>
          <button type="button" onClick={() => { downloadText(sourceName(projectName) + "Design.kt", generateKotlinProject(project), "text/plain;charset=utf-8"); setShowExportPanel(false); }}><Smartphone size={15} /><span><strong>Kotlin</strong><small>Android implementation</small></span></button>
          <button type="button" onClick={() => { downloadText(sourceName(projectName) + "DesignView.swift", generateSwiftProject(project), "text/plain;charset=utf-8"); setShowExportPanel(false); }}><Tablet size={15} /><span><strong>SwiftUI</strong><small>iOS implementation</small></span></button>
          <button type="button" onClick={() => { downloadText(sourceName(projectName) + ".html", generateHtmlProject(project), "text/html;charset=utf-8"); setShowExportPanel(false); }}><FileOutput size={15} /><span><strong>HTML + CSS</strong><small>Portable browser preview</small></span></button>
        </div>}
      </header>

      <div className="uxui-workspace grid min-w-0 gap-3">
        {showToolsPanel && <aside className="uxui-tools-drawer min-w-0 rounded-xl border border-border bg-surface p-3">
          <div className="uxui-drawer-heading"><span>Studio toolkit</span><button type="button" onClick={() => setShowToolsPanel(false)} aria-label="Close studio toolkit"><X size={17} /></button></div>
          <div className="uxui-toolkit-search"><Search size={16} /><input aria-label="Search studio toolkit" value={toolkitSearch} onChange={(event) => setToolkitSearch(event.target.value)} placeholder="Search tools, fonts, icons…" /></div>
          <div className="uxui-toolkit-tabs" role="tablist" aria-label="Studio toolkit categories">
            {([{ id: "toolkits", label: "All 26" }, { id: "icons", label: "Icons" }, { id: "components", label: "Elements" }, { id: "presets", label: "Presets" }, { id: "fonts", label: "Fonts" }, { id: "tokens", label: "Tokens" }] as Array<{id:PanelTab;label:string}>).map((tab) => <button key={tab.id} role="tab" aria-selected={leftTab === tab.id} type="button" onClick={() => setLeftTab(tab.id)} className={leftTab === tab.id ? "is-active" : ""}>{tab.label}</button>)}
          </div>

          {leftTab === "toolkits" && <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <strong className="text-sm text-fg">All 26 Studio toolkits</strong>
              <p className="mt-1 text-xs leading-5 text-muted">Open a toolkit to reach existing controls or use its direct actions. Features that need a separate engine are explicitly identified instead of being displayed as working placeholders.</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STUDIO_TOOLKITS.filter((toolkit) => !toolkitSearch.trim() || (toolkit.name + " " + toolkit.description).toLowerCase().includes(toolkitSearch.trim().toLowerCase())).map((toolkit) => <button key={toolkit.id} type="button" onClick={() => openToolkit(toolkit.id)} className={"uxui-toolkit-card rounded-lg border p-3 text-left transition " + (activeToolkitId === toolkit.id ? "border-accent bg-accent/10" : "border-border hover:border-accent hover:bg-surface-2")} aria-pressed={activeToolkitId === toolkit.id}><span className="block text-xs font-bold text-fg">{toolkit.name}</span><span className="mt-1 block text-[10px] leading-4 text-muted">{toolkit.description}</span><span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-accent">{toolkit.tab === "toolkits" ? "Open toolkit actions" : "Open connected controls"} <ArrowRight size={11} /></span></button>) }
              </div>
            </div>
            {(() => { const toolkit = STUDIO_TOOLKITS.find((item) => item.id === activeToolkitId) || STUDIO_TOOLKITS[0]; return <section className="rounded-xl border border-border p-3" aria-label={toolkit.name + " controls"}>
              <h3 className="text-sm font-extrabold text-fg">{toolkit.name}</h3><p className="mt-1 text-xs leading-5 text-muted">{toolkit.outcome}</p>
              {toolkit.tab !== "toolkits" && <button type="button" onClick={() => setLeftTab(toolkit.tab)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-white">Open connected controls <ArrowRight size={14} /></button>}
              {["effects","motion"].includes(toolkit.id) && <div className="mt-3 space-y-2">{selected ? <><label className="block text-[11px] font-semibold text-muted">Opacity · {Math.round(selected.opacity*100)}%<input type="range" min="0" max="1" step=".05" value={selected.opacity} onChange={(event)=>updateLayer(selected.id,{opacity:Number(event.target.value)})} className="mt-1 w-full"/></label><label className="block text-[11px] font-semibold text-muted">Rotation · {selected.rotation || 0}°<input type="range" min="-180" max="180" step="5" value={selected.rotation || 0} onChange={(event)=>updateLayer(selected.id,{rotation:Number(event.target.value)})} className="mt-1 w-full"/></label><label className="flex items-center justify-between gap-2 text-xs text-fg">Shadow <input type="checkbox" checked={selected.shadow} onChange={(event)=>updateLayer(selected.id,{shadow:event.target.checked})}/></label><label className="block text-[11px] font-semibold text-muted">Transition · {selected.transitionDuration ?? 180} ms<input type="range" min="0" max="2000" step="25" value={selected.transitionDuration ?? 180} onChange={(event)=>updateLayer(selected.id,{transitionDuration:Number(event.target.value)})} className="mt-1 w-full"/></label></> : <p className="text-xs text-muted">Select an element on the mockup first.</p>}</div>}
              {toolkit.id === "content" && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={()=>addSample("text","Welcome heading","Welcome back")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add heading</button><button type="button" onClick={()=>addSample("text","Sample paragraph","Your projects, all in one place.")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add paragraph</button><button type="button" onClick={()=>addSample("button","Primary action","Get started")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add button</button><button type="button" onClick={()=>addSample("avatar","Sample avatar","AB")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add avatar</button></div>}
              {["accessibility","qa"].includes(toolkit.id) && <div className="mt-3"><button type="button" onClick={runDesignAudit} className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white">{toolkit.id === "qa" ? "Run design QA" : "Run accessibility & structure review"}</button></div>}
              {toolkit.id === "patterns" && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setShowGrid(true)} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Show canvas grid</button><button type="button" onClick={()=>addSample("star","Decorative star","")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add star shape</button><button type="button" onClick={()=>addSample("hexagon","Geometric shape","")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add hexagon</button><button type="button" onClick={()=>addSample("line","Decorative line","")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add line</button></div>}
              {toolkit.id === "layers" && <div className="mt-3"><button type="button" onClick={()=>setShowMoreLayers(true)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Show all layers</button>{selected && <button type="button" onClick={duplicateSelected} className="ml-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Duplicate selected</button>}</div>}
              {["device","platform"].includes(toolkit.id) && <div className="mt-3 flex flex-wrap gap-2">{(["mobile","tablet","desktop"] as DeviceTarget[]).map((device)=><button key={device} type="button" onClick={()=>changeTarget(device)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold capitalize text-fg">{device}</button>)}</div>}
              {toolkit.id === "responsive" && <div className="mt-3 space-y-2"><button type="button" onClick={()=>setCustomArtboard(true)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Set custom viewport</button><button type="button" onClick={()=>setShowGrid((value)=>!value)} className="ml-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">{showGrid ? "Hide grid" : "Show grid"}</button></div>}
              {toolkit.id === "handoff" && <div className="mt-3"><button type="button" onClick={()=>setShowExportPanel(true)} className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white">Open export menu</button></div>}
              {toolkit.id === "3d" && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs leading-5 text-amber-950">Live GLB/GLTF rendering, lighting and camera manipulation are not available in this editor yet. Use imported rendered previews instead of treating a placeholder as a live 3D viewer.</p>}
              {toolkit.id === "prototype" && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs leading-5 text-amber-950">Connected multi-screen playback is a separate implementation task; screen connections and overlays are not reported as working until navigation is wired.</p>}
              {toolkit.id === "inspiration" && <div className="mt-3"><button type="button" onClick={()=>quickImageInputRef.current?.click()} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import reference image</button><p className="mt-1 text-[10px] text-muted">Keep reference source and licensing notes with the project before redistribution.</p></div>}
              {toolkit.id === "background" && <div className="mt-3"><label className="block text-xs font-semibold text-fg">Canvas background<input type="color" aria-label="Toolkit canvas background" value={background.startsWith("#") ? background : "#FFFFFF"} onChange={(event)=>setBackground(event.target.value)} className="mt-2 block h-10 w-full"/></label><button type="button" onClick={()=>quickImageInputRef.current?.click()} className="mt-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import background image as layer</button></div>}
              {toolkit.id === "projects" && <div className="mt-3"><button type="button" onClick={()=>{setOnboarding(true);setShowToolsPanel(false);}} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Open projects</button><button type="button" onClick={()=>presetImportInputRef.current?.click()} className="ml-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import project JSON</button></div>}
              {toolkit.id === "assets" && <div className="mt-3"><button type="button" onClick={()=>elementImportInputRef.current?.click()} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import assets</button></div>}
              {toolkit.id === "data-viz" && <div className="mt-3"><button type="button" onClick={()=>addSample("chart","Sample chart","Monthly activity")} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Add sample chart</button></div>}
              {toolkit.id === "illustrations" && <div className="mt-3"><button type="button" onClick={()=>elementImportInputRef.current?.click()} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import illustration (SVG/image)</button></div>}
              {toolkit.id === "media" && <div className="mt-3"><button type="button" onClick={()=>quickImageInputRef.current?.click()} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import image</button></div>}
            </section>; })()}
          </div>}
          {leftTab === "toolkits" && <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <strong className="text-sm text-fg">All 26 Studio toolkits</strong>
              <p className="mt-1 text-xs leading-5 text-muted">Open a toolkit to reach connected controls or direct actions. Systems that need a separate engine are clearly identified instead of being presented as finished.</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STUDIO_TOOLKITS.filter((toolkit) => !toolkitSearch.trim() || (toolkit.name + " " + toolkit.description).toLowerCase().includes(toolkitSearch.trim().toLowerCase())).map((toolkit) => <button key={toolkit.id} type="button" onClick={() => openToolkit(toolkit.id)} className={"uxui-toolkit-card rounded-lg border p-3 text-left transition " + (activeToolkitId === toolkit.id ? "border-accent bg-accent/10" : "border-border hover:border-accent hover:bg-surface-2")} aria-pressed={activeToolkitId === toolkit.id}><span className="block text-xs font-bold text-fg">{toolkit.name}</span><span className="mt-1 block text-[10px] leading-4 text-muted">{toolkit.description}</span><span className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-accent">{toolkit.tab === "toolkits" ? "Open toolkit actions" : "Open connected controls"} <ArrowRight size={11} /></span></button>) }
              </div>
            </div>
            {(() => { const toolkit = STUDIO_TOOLKITS.find((item) => item.id === activeToolkitId) || STUDIO_TOOLKITS[0]; return <section className="rounded-xl border border-border p-3" aria-label={toolkit.name + " controls"}>
              <h3 className="text-sm font-extrabold text-fg">{toolkit.name}</h3><p className="mt-1 text-xs leading-5 text-muted">{toolkit.outcome}</p>
              {toolkit.tab !== "toolkits" && <button type="button" onClick={() => setLeftTab(toolkit.tab)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-white">Open connected controls <ArrowRight size={14} /></button>}
              {["effects","motion"].includes(toolkit.id) && <div className="mt-3 space-y-2">{selected ? <><label className="block text-[11px] font-semibold text-muted">Opacity · {Math.round(selected.opacity*100)}%<input type="range" min="0" max="1" step=".05" value={selected.opacity} onChange={(event)=>updateLayer(selected.id,{opacity:Number(event.target.value)})} className="mt-1 w-full"/></label><label className="block text-[11px] font-semibold text-muted">Rotation · {selected.rotation || 0}°<input type="range" min="-180" max="180" step="5" value={selected.rotation || 0} onChange={(event)=>updateLayer(selected.id,{rotation:Number(event.target.value)})} className="mt-1 w-full"/></label><label className="flex items-center justify-between gap-2 text-xs text-fg">Shadow <input type="checkbox" checked={selected.shadow} onChange={(event)=>updateLayer(selected.id,{shadow:event.target.checked})}/></label><label className="block text-[11px] font-semibold text-muted">Transition · {selected.transitionDuration ?? 180} ms<input type="range" min="0" max="2000" step="25" value={selected.transitionDuration ?? 180} onChange={(event)=>updateLayer(selected.id,{transitionDuration:Number(event.target.value)})} className="mt-1 w-full"/></label></> : <p className="text-xs text-muted">Select an element on the mockup first.</p>}</div>}
              {toolkit.id === "content" && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={()=>addSample("text","Welcome heading","Welcome back")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add heading</button><button type="button" onClick={()=>addSample("text","Sample paragraph","Your projects, all in one place.")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add paragraph</button><button type="button" onClick={()=>addSample("button","Primary action","Get started")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add button</button><button type="button" onClick={()=>addSample("avatar","Sample avatar","AB")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add avatar</button></div>}
              {["accessibility","qa"].includes(toolkit.id) && <div className="mt-3"><button type="button" onClick={runDesignAudit} className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white">{toolkit.id === "qa" ? "Run design QA" : "Run accessibility & structure review"}</button></div>}
              {toolkit.id === "patterns" && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setShowGrid(true)} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Show canvas grid</button><button type="button" onClick={()=>addSample("star","Decorative star","")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add star shape</button><button type="button" onClick={()=>addSample("hexagon","Geometric shape","")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add hexagon</button><button type="button" onClick={()=>addSample("line","Decorative line","")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add line</button></div>}
              {toolkit.id === "layers" && <div className="mt-3"><button type="button" onClick={()=>setShowMoreLayers(true)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Show all layers</button>{selected && <button type="button" onClick={duplicateSelected} className="ml-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Duplicate selected</button>}</div>}
              {["device","platform"].includes(toolkit.id) && <div className="mt-3 flex flex-wrap gap-2">{(["mobile","tablet","desktop"] as DeviceTarget[]).map((device)=><button key={device} type="button" onClick={()=>changeTarget(device)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold capitalize text-fg">{device}</button>)}</div>}
              {toolkit.id === "responsive" && <div className="mt-3 space-y-2"><button type="button" onClick={()=>setCustomArtboard(true)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Set custom viewport</button><button type="button" onClick={()=>setShowGrid((value)=>!value)} className="ml-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">{showGrid ? "Hide grid" : "Show grid"}</button></div>}
              {toolkit.id === "handoff" && <div className="mt-3"><button type="button" onClick={()=>setShowExportPanel(true)} className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white">Open export menu</button></div>}
              {toolkit.id === "3d" && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs leading-5 text-amber-950">Live GLB/GLTF rendering, lighting and camera manipulation are not available in this editor yet. Use imported rendered previews instead of treating a placeholder as a live 3D viewer.</p>}
              {toolkit.id === "prototype" && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs leading-5 text-amber-950">Connected multi-screen playback is a separate implementation task; screen connections and overlays are not reported as working until navigation is wired.</p>}
              {toolkit.id === "inspiration" && <div className="mt-3"><button type="button" onClick={()=>quickImageInputRef.current?.click()} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import reference image</button><p className="mt-1 text-[10px] text-muted">Keep reference source and licensing notes with the project before redistribution.</p></div>}
              {toolkit.id === "background" && <div className="mt-3"><label className="block text-xs font-semibold text-fg">Canvas background<input type="color" aria-label="Toolkit canvas background" value={background.startsWith("#") ? background : "#FFFFFF"} onChange={(event)=>setBackground(event.target.value)} className="mt-2 block h-10 w-full"/></label><button type="button" onClick={()=>quickImageInputRef.current?.click()} className="mt-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import background image as layer</button></div>}
              {toolkit.id === "projects" && <div className="mt-3"><button type="button" onClick={()=>{setOnboarding(true);setShowToolsPanel(false);}} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Open projects</button><button type="button" onClick={()=>presetImportInputRef.current?.click()} className="ml-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import project JSON</button></div>}
              {toolkit.id === "assets" && <div className="mt-3"><button type="button" onClick={()=>elementImportInputRef.current?.click()} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import assets</button></div>}
              {toolkit.id === "data-viz" && <div className="mt-3"><button type="button" onClick={()=>addSample("chart","Sample chart","Monthly activity")} className="rounded-lg border border-border p-2 text-xs font-semibold text-fg">Add sample chart</button></div>}
              {toolkit.id === "illustrations" && <div className="mt-3"><button type="button" onClick={()=>elementImportInputRef.current?.click()} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import illustration (SVG/image)</button></div>}
              {toolkit.id === "media" && <div className="mt-3"><button type="button" onClick={()=>quickImageInputRef.current?.click()} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-fg">Import image</button></div>}
              {showQaReport && <div className="mt-3 rounded-lg border border-border p-3" aria-live="polite"><div className="flex items-center justify-between gap-2"><strong className="text-xs text-fg">Design QA report</strong><button type="button" onClick={()=>setShowQaReport(false)} className="text-xs text-accent">Close</button></div><p className="mt-1 text-[10px] text-muted">{qaReport.length} potential finding(s). This local check is advisory and does not certify accessibility conformance.</p>{qaReport.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] text-fg">{qaReport.map((finding,index)=><li key={index}>{finding}</li>)}</ul> : <p className="mt-2 text-xs text-emerald-700">No issues found within the checks run.</p>}</div>}
            </section>; })()}
          </div>}
          {leftTab === "components" && <div className="mt-3">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Elements</h3><span className="text-[10px] text-muted">{COMPONENTS.length} types</span></div>
            <button type="button" onClick={() => elementImportInputRef.current?.click()} className="uxui-import-button mb-3 w-full justify-center"><FileJson size={14} /> Import elements</button>
            <div className="grid grid-cols-2 gap-2">
              {COMPONENTS.filter((component) => !toolkitSearch.trim() || (component.label + " " + component.description).toLowerCase().includes(toolkitSearch.trim().toLowerCase())).map((component) => <button key={component.kind} type="button" onClick={() => addLayer(component.kind)} title={component.description} className="flex min-h-[66px] flex-col items-start justify-center rounded-lg border border-border p-2 text-left transition hover:border-accent hover:bg-surface-2"><span className="text-xs font-semibold text-fg">{component.label}</span><span className="mt-1 text-[10px] leading-4 text-muted">{component.description}</span></button>)}
            </div>
            <div className="mt-5 border-t border-border pt-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-fg"><Layers size={14} /> Layers {elements.length > 0 && <span className="ml-auto font-normal text-muted">{elements.length}</span>}</div>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {[...elements].reverse().map((item) => <div key={item.id} className={"flex items-center gap-1 rounded-md border px-1.5 py-1 " + (selectedIds.includes(item.id) ? "border-accent bg-accent/10" : "border-transparent hover:bg-surface-2")}>
                  <button type="button" onClick={(event) => { selectLayer(item.id, event.shiftKey); setInspectorTab("design"); }} aria-pressed={selectedIds.includes(item.id)} className="min-w-0 flex-1 truncate py-1 text-left text-xs text-fg">{item.name}{item.groupId ? " · Group" : ""}{item.locked ? " · Locked" : ""}{item.hidden ? " · Hidden" : ""}</button>
                  <button type="button" aria-label={(item.hidden ? "Show " : "Hide ") + item.name} onClick={() => { checkpoint(); updateLayer(item.id, { hidden: !item.hidden }, false); }} className="rounded p-1 text-muted hover:text-fg">{item.hidden ? "Show" : "Hide"}</button>
                  <button type="button" aria-label={(item.locked ? "Unlock " : "Lock ") + item.name} onClick={() => { checkpoint(); updateLayer(item.id, { locked: !item.locked }, false); }} className="rounded p-1 text-muted hover:text-fg">{item.locked ? "Unlock" : "Lock"}</button>
                  <button type="button" aria-label={"Move " + item.name + " up in layer stack"} onClick={() => moveLayer(item.id, 1)} disabled={elements.findIndex((layer) => layer.id === item.id) === elements.length - 1} className="rounded p-1 text-muted hover:text-fg disabled:opacity-30"><ArrowUp size={12} /></button>
                  <button type="button" aria-label={"Move " + item.name + " down in layer stack"} onClick={() => moveLayer(item.id, -1)} disabled={elements.findIndex((layer) => layer.id === item.id) === 0} className="rounded p-1 text-muted hover:text-fg disabled:opacity-30"><ArrowDown size={12} /></button>
                  <button type="button" aria-label={"Duplicate " + item.name} onClick={() => { checkpoint(); const dup = { ...item, id: layerId(), name: item.name + " copy", x: item.x + 12, y: item.y + 12 }; setElements((old) => [...old, dup]); selectLayer(dup.id); }} className="rounded p-1 text-muted hover:text-fg"><Copy size={12} /></button>
                </div>)}
                {elements.length === 0 && <p className="uxui-empty-layers compact">No elements yet. Tap + to add one.</p>}
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-2 flex items-center justify-between gap-2"><strong className="text-xs text-fg">Selection tools</strong><span className="text-[10px] text-muted">{selectedIds.length} selected · Shift+tap to add</span></div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={copySelectedLayers} className="rounded-md border border-border px-2 py-2 text-xs font-semibold text-fg">Copy</button>
                  <button type="button" onClick={cutSelectedLayers} className="rounded-md border border-border px-2 py-2 text-xs font-semibold text-fg">Cut</button>
                  <button type="button" onClick={pasteLayers} disabled={!clipboardLayers.length} className="rounded-md border border-border px-2 py-2 text-xs font-semibold text-fg disabled:opacity-40">Paste</button>
                  <button type="button" onClick={groupSelectedLayers} className="rounded-md border border-border px-2 py-2 text-xs font-semibold text-fg">Group selection</button>
                  <button type="button" onClick={ungroupSelectedLayers} className="rounded-md border border-border px-2 py-2 text-xs font-semibold text-fg">Ungroup selection</button>
                  {(["left","center","right","top","middle","bottom"] as const).map((edge)=><button key={edge} type="button" onClick={()=>alignSelectedLayers(edge)} disabled={selectedIds.length<2} className="rounded-md border border-border px-2 py-2 text-xs capitalize text-fg disabled:opacity-40">Align {edge}</button>)}
                  <button type="button" onClick={()=>distributeSelectedLayers("horizontal")} disabled={selectedIds.length<3} className="rounded-md border border-border px-2 py-2 text-xs text-fg disabled:opacity-40">Distribute horizontally</button>
                  <button type="button" onClick={()=>distributeSelectedLayers("vertical")} disabled={selectedIds.length<3} className="rounded-md border border-border px-2 py-2 text-xs text-fg disabled:opacity-40">Distribute vertically</button>
                </div>
              </div>
              {selected && <><button type="button" onClick={() => {const saved={...selected,id:"component-"+layerId(),componentKey:selected.componentKey || selected.id,name:selected.name};setReusableComponents((old)=>[...old.filter((item)=>item.componentKey!==saved.componentKey),saved]);setNotice("Saved "+saved.name+" as a reusable component template.");}} className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-fg"><Copy size={13} /> Save as component</button><button type="button" onClick={deleteSelected} className="mt-2 ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-red-600 hover:bg-red-500/10"><Trash2 size={13} /> Delete selected</button></>}
              {reusableComponents.length > 0 && <div className="mt-3 border-t border-border pt-3"><h4 className="mb-2 text-xs font-semibold text-fg">Reusable components</h4>{reusableComponents.map((component)=> <button key={component.id} type="button" onClick={()=>{const copy={...component,id:layerId(),name:component.name+" instance",x:Math.min(board.width-component.width,component.x+16),y:Math.min(board.height-component.height,component.y+16),referenceWidth:board.width,referenceHeight:board.height};checkpoint();setElements((old)=>[...old,copy]);setSelectedId(copy.id);setNotice("Added reusable component: "+component.name);}} className="mb-1 block w-full truncate rounded-md border border-border p-2 text-left text-xs text-fg hover:bg-surface-2">{component.name} · Add instance</button>)}</div>}
            </div>
          </div>}

          {leftTab === "icons" && <div className="mt-3">
            <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-fg">Icon library</h3><button type="button" onClick={() => iconImportInputRef.current?.click()} className="uxui-import-button">Import SVG</button></div>
            <p className="mt-1 text-[11px] leading-4 text-muted">Browse immediate examples by interface category and visual style, or search the online Iconify catalogue. Selected SVGs and collection identifiers are stored in the project.</p>
            <div className="mt-3 relative"><Search size={15} className="absolute left-2.5 top-2.5 text-muted" /><input value={iconQuery} aria-label="Search icons" onChange={(event)=>{setIconQuery(event.target.value);setIconStart(0);setIconResults([]);}} placeholder="Search icons: home, charts, payment…" className="w-full rounded-lg border border-border bg-surface pl-8 pr-2 py-2 text-sm text-fg outline-none focus:border-accent" /></div>
            <label className="mt-2 block text-[10px] font-medium text-muted">Visual style / icon family
              <select value={iconPrefix} onChange={(event)=>{setIconPrefix(event.target.value);setIconStart(0);setIconResults([]);}} className={fieldClass()}>{ICON_SET_OPTIONS.map((set)=><option key={set.prefix} value={set.prefix}>{set.label}</option>)}</select>
            </label>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ICON_BROWSE_CATEGORIES.map((category)=><button key={category.name} type="button" onClick={()=>{setIconBrowseCategory(category.name);setIconQuery("");setIconStart(0);setIconResults([]);}} aria-pressed={iconBrowseCategory===category.name} className={"rounded-full border px-2.5 py-1.5 text-[10px] font-semibold "+(iconBrowseCategory===category.name?"border-accent bg-accent text-white":"border-border text-fg hover:bg-surface-2")}>{category.name}</button>)}
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted"><span>{iconQuery.trim().length>=2?(iconLoading?"Searching…":iconTotal.toLocaleString()+" matching online icons"):iconBrowseCategory+" · curated examples by style"}</span><span>Iconify · SVG</span></div>
            {iconError && <p role="status" className="mt-2 rounded-md bg-red-500/10 p-2 text-xs text-red-600">{iconError}</p>}
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {visibleIconResults.filter((name) => !toolkitSearch.trim() || name.toLowerCase().includes(toolkitSearch.trim().toLowerCase())).map((name)=><button key={name} type="button" onClick={()=>void chooseIcon(name)} title={"Add icon "+name} className={"min-w-0 rounded-lg border border-border p-1.5 text-left hover:border-accent hover:bg-surface-2 "+(selected?.iconName===name?"border-accent bg-accent/10":"")}>
                <img loading="lazy" alt="" src={"https://api.iconify.design/"+name.replace(":","/")+".svg"} className="mx-auto size-7" />
                <span className="mt-1 block truncate text-[9px] text-muted">{name}</span>
              </button>)}
            </div>
            {iconQuery.trim().length>=2 && iconResults.length<iconTotal && <button type="button" disabled={iconLoading} onClick={()=>setIconStart((current)=>current+32)} className="mt-3 w-full rounded-lg border border-border px-2 py-2 text-xs font-semibold text-fg disabled:opacity-50">{iconLoading?"Searching…":"Load more results"}</button>}
            {!visibleIconResults.length && !iconLoading && <p className="mt-3 text-xs text-muted">No icons match this filter. Choose All styles, another category, or search a broader term.</p>}
            <p className="mt-3 text-[10px] leading-4 text-muted">The quick picker covers common UI categories and outline, filled, rounded and platform icon sets. The full online catalogue remains searchable. Check each collection’s licence; <a className="underline underline-offset-2" href="https://iconify.design/docs/api/search.html" target="_blank" rel="noreferrer">Iconify supports set filters and paging</a>.</p>
          </div>}

          {leftTab === "fonts" && <div className="mt-3">
            <h3 className="text-xs font-semibold text-fg">Font library · full catalogue</h3>
            <p className="mt-1 text-[11px] leading-4 text-muted">Browse the online Fontsource catalogue, preview families, and download a selected TTF into the layer for portable native code and JSON exports.</p>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted">
              <span>{fontCatalogLoading ? "Loading catalogue…" : remoteFonts.length ? remoteFonts.length.toLocaleString() + " online font families" : "Curated fonts available"}</span>
              {fontCatalogError && <button type="button" onClick={() => { fontCatalogRequested.current = false; setFontCatalogReload((value) => value + 1); }} className="font-semibold text-accent">Retry</button>}
            </div>
            {fontCatalogError && <p role="status" className="mt-2 rounded-md bg-red-500/10 p-2 text-[10px] text-red-600">{fontCatalogError} The curated list remains available.</p>}
            <input aria-label="Search fonts" value={fontQuery} onChange={(event)=>setFontQuery(event.target.value)} placeholder="Search font families…" className={fieldClass()} />
            <div className="mt-2 flex flex-wrap gap-1">
              {["All","Sans serif","Serif","Monospace","Display","Handwriting","System"].map((category)=><button key={category} type="button" onClick={()=>setFontCategory(category)} aria-pressed={fontCategory===category} className={"rounded-full border px-2 py-1 text-[10px] font-medium "+(fontCategory===category?"border-accent bg-accent text-white":"border-border text-fg")}>{category}</button>)}
            </div>
            {selected && <div className="mt-3 rounded-lg border border-border p-2">
              <div className="text-[10px] text-muted">Selected layer</div>
              <div className="mt-1 truncate text-sm font-semibold text-fg" style={{fontFamily:selected.fontFamily}}>{selected.fontFamily}</div>
              <div className="mt-1 text-xs text-muted" style={{fontFamily:selected.fontFamily}}>Aa Bb Cc 123 — The quick brown fox.</div>
              {selected.fontDataUrl && <p className="mt-2 text-[10px] font-medium text-emerald-600">Font asset embedded in this project.</p>}
              <label className="mt-3 block text-[10px] font-medium text-muted">Import local font (TTF, OTF, WOFF, WOFF2 · up to 4 MB)
                <input type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" className="mt-1 block w-full text-[10px] text-muted" onChange={(event)=>{const file=event.target.files?.[0];if(!file)return;if(file.size>4*1024*1024){setNotice("Font files must be 4 MB or smaller.");event.target.value="";return;}const reader=new FileReader();reader.onload=()=>{if(typeof reader.result!=="string")return;const family=(file.name.replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9 -]/g,"").trim()||"Imported Font")+" (local)";updateLayer(selected.id,{fontFamily:family,fontDataUrl:reader.result});setNotice("Imported "+file.name+" into this design. The font bytes are preserved in project JSON.");};reader.onerror=()=>setNotice("Could not read the font file.");reader.readAsDataURL(file);event.target.value="";}} />
              </label>
            </div>}
            <div className="mt-3 space-y-1.5">
              {fontChoices.filter((font)=>font.family.toLowerCase().includes(fontQuery.toLowerCase())&&(fontCategory==="All"||font.category===fontCategory)&&(!toolkitSearch.trim()||font.family.toLowerCase().includes(toolkitSearch.trim().toLowerCase()))).map((font)=>{
                const fontId=font.id || font.family.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
                const weights=font.weights?.length ? font.weights.join(" · ") : "300–900 where supplied";
                return <div key={font.family} className={"rounded-lg border p-2.5 "+(selected?.fontFamily===font.family?"border-accent bg-accent/10":"border-border")}>
                  <button type="button" disabled={!selected} onClick={()=>{if(selected)updateLayer(selected.id,{fontFamily:font.family,fontDataUrl:""});setNotice("Applied "+font.family+". Use Download & embed for offline native asset portability.");}} className="block w-full text-left disabled:opacity-40">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-fg">{font.family}</span><span className="text-[9px] text-muted">{font.provider==="google"?"Google Fonts":"System"}</span></div>
                    <div className="mt-1 truncate text-lg text-fg" style={{fontFamily:font.family}}>Design systems that scale 012345</div>
                    <div className="mt-1 text-[9px] text-muted">{font.category} · weights {weights}{font.variable?" · variable":""}</div>
                  </button>
                  {font.provider==="google" && <button type="button" disabled={!selected||fontDownloadId===fontId} onClick={()=>void downloadAndEmbedFont(font)} className="mt-2 rounded-md border border-border px-2 py-1.5 text-[10px] font-semibold text-fg hover:bg-surface-2 disabled:opacity-40">{fontDownloadId===fontId?"Downloading…":"Download & embed TTF"}</button>}
                </div>;
              })}
              {!fontChoices.some((font)=>font.family.toLowerCase().includes(fontQuery.toLowerCase())&&(fontCategory==="All"||font.category===fontCategory)) && <p className="mt-3 text-xs text-muted">No font matched this filter.</p>}
            </div>
            <p className="mt-3 text-[10px] leading-4 text-muted">Font binaries are fetched when selected instead of shipping the entire multi-gigabyte font archive inside enV. Check each font licence before redistribution.</p>
          </div>}

          {leftTab === "presets" && <div className="mt-3">
            <h3 className="text-xs font-semibold text-fg">Starter layouts</h3><p className="mt-1 text-[11px] leading-4 text-muted">Curated responsive starting points, then customise every layer.</p>
            <button type="button" onClick={() => presetImportInputRef.current?.click()} className="uxui-import-button mb-3 w-full justify-center"><FileJson size={14} /> Import preset / project JSON</button>
            <div className="mt-3 space-y-2">{PRESETS.filter((preset) => !toolkitSearch.trim() || (preset.label + " " + preset.description).toLowerCase().includes(toolkitSearch.trim().toLowerCase())).map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} className="w-full rounded-lg border border-border p-2.5 text-left hover:border-accent hover:bg-surface-2"><span className="block text-xs font-semibold text-fg">{preset.label}</span><span className="mt-1 block text-[10px] leading-4 text-muted">{preset.description}</span><span className="mt-2 inline-flex items-center gap-1 text-[10px] text-accent">{preset.target === "mobile" ? <Smartphone size={11} /> : preset.target === "tablet" ? <Tablet size={11} /> : <Monitor size={11} />}{preset.target} canvas</span></button>)}</div>
          </div>}

          {leftTab === "tokens" && <div className="mt-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-fg"><Palette size={14} /> Design tokens</div>
            <p className="mt-1 text-[11px] leading-4 text-muted">Extracted from the current layers and included in the PDF, JSON and AI prompt.</p>
            <Field label="Artboard background"><input type="color" value={background} onChange={(event) => setBackground(event.target.value)} className="mt-2 h-9 w-full rounded border border-border bg-surface p-1" /></Field>
            <h4 className="mt-4 text-[11px] font-semibold text-muted">Named color tokens</h4>
            <div className="mt-2 space-y-2">
              {tokens.colors.map((token, index) => <div key={token.name} className="flex items-center gap-2"><input aria-label={token.name + " token color"} type="color" value={token.value} onChange={(event) => setTokens((old) => ({...old, colors: old.colors.map((item, i) => i === index ? {...item, value:event.target.value} : item)}))} className="size-8 rounded border border-border bg-surface p-0.5" /><span className="min-w-0 flex-1 truncate text-[11px] text-fg">{token.name}</span><button type="button" onClick={() => selected && updateLayer(selected.id, { color: token.value })} disabled={!selected} className="rounded border border-border px-2 py-1 text-[10px] text-fg disabled:opacity-40">Apply text</button><button type="button" onClick={() => selected && updateLayer(selected.id, { background: token.value })} disabled={!selected} className="rounded border border-border px-2 py-1 text-[10px] text-fg disabled:opacity-40">Apply fill</button></div>)}
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_64px_auto] gap-1">
              <input aria-label="New token name" value={tokenNameDraft} onChange={(event) => setTokenNameDraft(event.target.value)} className={fieldClass()} placeholder="Token name" />
              <input aria-label="New token color" type="color" value={tokenValueDraft} onChange={(event) => setTokenValueDraft(event.target.value)} className="h-9 w-full rounded border border-border bg-surface p-1" />
              <button type="button" onClick={() => { const name=tokenNameDraft.trim().toLowerCase().replace(/[^a-z0-9-]+/g,"-"); if(name && !tokens.colors.some((item)=>item.name===name)) {setTokens((old)=>({...old,colors:[...old.colors,{name,value:tokenValueDraft}]}));setTokenNameDraft("brand");} }} className="rounded-lg bg-accent px-2 text-[11px] font-semibold text-white">Add</button>
            </div>
            <h4 className="mt-4 text-[11px] font-semibold text-muted">Typography tokens</h4>
            <div className="mt-2 space-y-1">{tokens.typography.map((token) => <button key={token.name} type="button" onClick={() => selected && updateLayer(selected.id, {fontFamily:token.fontFamily,fontSize:token.fontSize,fontWeight:token.fontWeight,lineHeight:token.lineHeight})} className="flex w-full items-center justify-between rounded-md border border-border px-2 py-2 text-left text-xs text-fg"><span>{token.name}</span><span>{token.fontSize}px / {token.fontWeight}</span></button>)}</div>
            <h4 className="mt-4 text-[11px] font-semibold text-muted">Spacing tokens</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">{tokens.spacing.map((spacing) => <button key={spacing} type="button" onClick={() => selected && updateLayer(selected.id, {padding:spacing})} className="rounded-md border border-border px-2 py-1.5 text-[10px] text-fg">{spacing}px</button>)}</div>
            <Field label="Add spacing token (px)"><div className="mt-1 flex gap-2"><input aria-label="New spacing token" id="ux-spacing-token" type="number" min="1" max="256" defaultValue={20} className={fieldClass()} /><button type="button" onClick={() => { const input=document.getElementById("ux-spacing-token") as HTMLInputElement | null; const value=Number(input?.value); if(Number.isFinite(value)&&value>0&&value<=256) setTokens((old)=>({...old,spacing:Array.from(new Set([...old.spacing,Math.round(value)])).sort((a,b)=>a-b)})); }} className="rounded-lg border border-border px-3 text-xs text-fg">Add</button></div></Field>
            <h4 className="mt-4 text-[11px] font-semibold text-muted">Detected colors ({uniqueColors.length})</h4>
            <div className="mt-2 grid grid-cols-3 gap-2">{uniqueColors.map((color) => <div key={color} className="min-w-0"><div className="h-8 rounded-md border border-border" style={{ background: color }} /><span className="mt-1 block truncate text-[9px] text-muted">{color.toUpperCase()}</span></div>)}</div>
            <h4 className="mt-4 text-[11px] font-semibold text-muted">Typography</h4>
            <div className="mt-2 space-y-1">{Array.from(new Set(elements.map((item) => item.fontFamily))).map((font) => <div key={font} className="rounded-md border border-border px-2 py-1.5 text-xs text-fg">{font}</div>)}</div>
            <h4 className="mt-4 text-[11px] font-semibold text-muted">Spacing scale</h4>
            <p className="mt-1 text-xs leading-5 text-fg">{Array.from(new Set(elements.flatMap((item) => [item.padding, item.marginTop, item.marginRight, item.marginBottom, item.marginLeft]))).sort((a,b)=>a-b).join(" · ") || "No spacing values yet"} px</p>
          </div>}
        </aside>}

        <main className="uxui-canvas-panel min-w-0 overflow-hidden">
          <div className="uxui-canvas-heading">
            {isExpanded && <button type="button" onClick={toggleExpandedPreview} className="uxui-preview-back"><ArrowLeft size={18} /><span>Back to editor</span></button>}
            <div><strong>{target === "mobile" ? "Phone mockup" : target === "tablet" ? "Tablet mockup" : "Desktop mockup"}</strong><span>Preview</span></div>
            <div className="uxui-canvas-zoom">
              <button type="button" onClick={() => setZoom((value) => Math.max(50, value - 10))} aria-label="Zoom out" title="Zoom out"><ZoomOut size={16} /></button>
              <span>{zoom}%</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(150, value + 10))} aria-label="Zoom in" title="Zoom in"><ZoomIn size={16} /></button>
              <button type="button" onClick={() => setShowGrid((value) => !value)} aria-pressed={showGrid} aria-label="Toggle alignment grid" title="Alignment grid" className={showGrid ? "is-active" : ""}><Grid2X2 size={16} /></button>
            </div>
          </div>
          <div className="uxui-canvas-stage">
            <div className={"uxui-device-shell uxui-device-" + target} data-target={target}>
              <div className="uxui-device-cutout" aria-hidden="true" />
              <svg ref={artboardRef} xmlns="http://www.w3.org/2000/svg" width={board.width} height={board.height} viewBox={"0 0 " + board.width + " " + board.height}
                style={{ width: Math.min(board.width * zoom / 100, target === "mobile" ? 430 : target === "tablet" ? 700 : 940) + "px", maxWidth: "100%", height: "auto", display: "block", touchAction: "none", background }} role="img" aria-label={projectName + " design artboard"} onPointerDown={onArtboardPointerDown} onPointerMove={movePointer} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
                <rect width={board.width} height={board.height} fill={background} />
                {showGrid && <defs><pattern id="ux-grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M 8 0 L 0 0 0 8" fill="none" stroke="#94A3B8" strokeWidth="0.55" opacity="0.35" /></pattern></defs>}
                {showGrid && <rect width={board.width} height={board.height} fill="url(#ux-grid)" pointerEvents="none" />}
                {[...elements].filter((layer) => !layer.hidden && layer.display !== "none" && (!layer.visibleOn || layer.visibleOn.includes(target))).sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1)).map((layer) => {
                  const boxFill = layer.background === "transparent" ? "none" : layer.background;
                  const stroke = layer.borderWidth > 0 ? layer.borderColor : "none";
                  const baseBox = (round = layer.radius) => <rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={round} fill={boxFill} stroke={stroke} strokeWidth={layer.borderWidth} />;
                  const shadow = layer.shadow ? "0 3px 10px #0F172A24" : undefined;
                  const style: CSSProperties = { filter: shadow ? "drop-shadow(0px 3px 6px #0F172A22)" : undefined, opacity: layer.opacity, cursor: layer.cursor || "default", display: layer.display === "none" ? "none" : undefined };
                  return <g key={layer.id} data-layer-id={layer.id} style={style} transform={layer.rotation ? "rotate(" + layer.rotation + " " + (layer.x + layer.width / 2) + " " + (layer.y + layer.height / 2) + ")" : undefined}>
                    <rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} fill="transparent" pointerEvents="all" />
                    {layer.kind === "divider" ? <line x1={layer.x} y1={layer.y} x2={layer.x + layer.width} y2={layer.y + layer.height} stroke={layer.background === "transparent" ? "#CBD5E1" : layer.background} strokeWidth={Math.max(1, layer.borderWidth || layer.height)} /> : null}
                    {["triangle","diamond","hexagon","star"].includes(layer.kind) ? <polygon
                      points={shapePoints(layer.kind,layer.x,layer.y,layer.width,layer.height)}
                      fill={boxFill==="none"?"#DBEAFE":boxFill} stroke={stroke} strokeWidth={layer.borderWidth}
                      strokeLinejoin="round" /> : null}
                    {layer.kind === "line" ? <line x1={layer.x} y1={layer.y+layer.height/2} x2={layer.x+layer.width} y2={layer.y+layer.height/2} stroke={layer.background==="transparent"?"#64748B":layer.background} strokeWidth={Math.max(1,layer.borderWidth||layer.height)} strokeLinecap="round" /> : null}
                    {layer.kind === "ellipse" || layer.kind === "avatar" ? <ellipse cx={layer.x + layer.width / 2} cy={layer.y + layer.height / 2} rx={layer.width / 2} ry={layer.height / 2} fill={boxFill === "none" ? "#DBEAFE" : boxFill} stroke={stroke} strokeWidth={layer.borderWidth} /> : null}
                    {layer.kind === "checkbox" ? <><rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.radius} fill={boxFill === "none" ? "#FFFFFF" : boxFill} stroke={layer.borderColor} strokeWidth={Math.max(1, layer.borderWidth)} /><path d={"M " + (layer.x + 5) + " " + (layer.y + 12) + " l 4 4 l 9 -10"} fill="none" stroke={layer.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></> : null}
                    {layer.kind === "radio" ? <><circle cx={layer.x + layer.width / 2} cy={layer.y + layer.height / 2} r={Math.min(layer.width, layer.height) / 2 - 1} fill="#FFFFFF" stroke={layer.borderColor} strokeWidth={Math.max(1, layer.borderWidth)} /><circle cx={layer.x + layer.width / 2} cy={layer.y + layer.height / 2} r={Math.min(layer.width, layer.height) / 4} fill={layer.color} /></> : null}
                    {layer.kind === "switch" || layer.kind === "toggle" ? <><rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.height / 2} fill={boxFill === "none" ? "#2563EB" : boxFill} /><circle cx={layer.x + layer.width - layer.height / 2} cy={layer.y + layer.height / 2} r={layer.height / 2 - 3} fill="#FFFFFF" /></> : null}
                    {layer.kind === "progress" ? <><rect x={layer.x} y={layer.y} width={layer.width} height={layer.height} rx={layer.radius} fill={boxFill === "none" ? "#E5E7EB" : boxFill} /><rect x={layer.x} y={layer.y} width={layer.width * 0.72} height={layer.height} rx={layer.radius} fill={layer.color} /></> : null}
                    {layer.kind === "slider" ? <><rect x={layer.x} y={layer.y + layer.height / 2 - 2} width={layer.width} height={4} rx={2} fill={boxFill === "none" ? "#E5E7EB" : boxFill} /><rect x={layer.x} y={layer.y + layer.height / 2 - 2} width={layer.width * 0.62} height={4} rx={2} fill={layer.color} /><circle cx={layer.x + layer.width * 0.62} cy={layer.y + layer.height / 2} r={7} fill={layer.color} /></> : null}
                    {["text", "icon", "divider", "ellipse", "avatar", "checkbox", "radio", "switch", "toggle", "progress", "slider", "triangle", "diamond", "hexagon", "star", "line"].includes(layer.kind) ? null : baseBox()}
                    {layer.kind === "chart" ? <g>{[0,1,2,3].map((grid) => <line key={"grid-"+grid} x1={layer.x+layer.padding} y1={layer.y+layer.height-layer.padding-22-grid*22} x2={layer.x+layer.width-layer.padding} y2={layer.y+layer.height-layer.padding-22-grid*22} stroke="#E5E7EB" strokeWidth="1" />)}{[0.36,0.62,0.46,0.82,0.67].map((ratio,index)=><rect key={"bar-"+index} x={layer.x+layer.padding+18+index*30} y={layer.y+layer.height-layer.padding-24-ratio*76} width="16" height={ratio*76} rx="3" fill={layer.color} opacity={index===4?1:0.72} />)}</g> : null}
                    {layer.kind === "image" ? layer.imageDataUrl ? <image href={layer.imageDataUrl} x={layer.x} y={layer.y} width={layer.width} height={layer.height} preserveAspectRatio="xMidYMid slice" /> : <><path d={"M " + (layer.x + layer.width * 0.18) + " " + (layer.y + layer.height * 0.76) + " l " + (layer.width * 0.2 * -1) + " 0 l " + (layer.width * 0.2) + " -" + (layer.height * 0.27) + " l " + (layer.width * 0.16) + " " + (layer.height * 0.16) + " l " + (layer.width * 0.16 * -1) + " " + (layer.height * 0.11) + " l " + (layer.width * 0.22) + " -" + (layer.height * 0.33) + " l " + (layer.width * 0.18) + " " + (layer.height * 0.33)} fill="none" stroke="#94A3B8" strokeWidth="2" /><text x={layer.x + layer.width / 2} y={layer.y + layer.height - 10} fontSize="11" fill="#64748B" textAnchor="middle">{layer.text}</text></> : null}
                    {layer.kind === "icon" ? <svg x={layer.x + 2} y={layer.y + 2} width={layer.width - 4} height={layer.height - 4} viewBox={layer.iconViewBox || "0 0 24 24"} color={layer.color} fill="currentColor" aria-label={layer.iconName || "icon"}><g dangerouslySetInnerHTML={{ __html: layer.iconSvg || '<path d="M12 3l9 8h-3v9h-5v-6h-3v6H5v-9H3z" fill="currentColor"/>' }} /></svg> : null}
                    {["text", "button", "card", "input", "navbar", "tabbar", "row", "avatar", "badge", "dropdown", "search", "textarea", "table", "chart", "modal", "breadcrumb", "tooltip", "list", "video", "logo", "tabs", "menu"].includes(layer.kind) ? layerTextSvg(layer, layer.x, layer.y, layer.width) : null}
                    {selectedId === layer.id && <rect x={layer.x - 1.5} y={layer.y - 1.5} width={Math.max(1, layer.width + 3)} height={Math.max(1, layer.height + 3)} fill="none" stroke="#2563EB" strokeWidth="1.5" strokeDasharray="5 3" pointerEvents="none" />}
                  </g>;
                })}
              </svg>
              <div className="uxui-device-neck" aria-hidden="true" /><div className="uxui-device-base" aria-hidden="true" />
              {!elements.length && <p className="uxui-canvas-hint">Your canvas is ready. Tap + to add your first element.</p>}
            </div>
          </div>
          <div className="uxui-bottom-toolbar">
            <div className="uxui-bottom-group">
              <button type="button" onClick={undoLayout} disabled={!undoStack.length} aria-label="Undo" title="Undo"><Undo2 size={22} /></button>
              <button type="button" onClick={redoLayout} disabled={!redoStack.length} aria-label="Redo" title="Redo"><Redo2 size={22} /></button>
            </div>
            <button type="button" className="uxui-add-button" onClick={() => setShowToolsPanel((value) => !value)} aria-expanded={showToolsPanel} aria-label="Add elements"><Plus size={42} strokeWidth={1.6} /></button>
            <div className="uxui-bottom-group">
              <button type="button" onClick={() => { setShowInspector((value) => !value); setShowMoreLayers(true); }} aria-label="App screens and layers" aria-expanded={showInspector} title="App screens" className={showInspector ? "is-active" : ""}><LayoutTemplate size={20} /></button>
              <button type="button" onClick={toggleExpandedPreview} aria-label="Expand mockup to full screen" title="Expand mockup"><Maximize2 size={20} /></button>
            </div>
          </div>
          {selected && target === "mobile" && !isExpanded && <div className="uxui-mobile-controls" aria-label="Selected element movement and transform controls">
            <div className="uxui-gamepad" role="group" aria-label="Move selected element">
              <span className="uxui-gamepad-label">Move</span>
              <button type="button" className="uxui-pad-up" aria-label="Move element up 8 pixels" onClick={() => updateLayer(selected.id, { y: Math.max(0, selected.y - 8) })}><ArrowUp size={19} /></button>
              <button type="button" className="uxui-pad-left" aria-label="Move element left 8 pixels" onClick={() => updateLayer(selected.id, { x: Math.max(0, selected.x - 8) })}><ArrowLeft size={19} /></button>
              <button type="button" className="uxui-pad-center" aria-label="Center selected element" onClick={() => updateLayer(selected.id, { x: Math.max(0, Math.round((board.width - selected.width) / 2)), y: Math.max(0, Math.round((board.height - selected.height) / 2)) })}>•</button>
              <button type="button" className="uxui-pad-right" aria-label="Move element right 8 pixels" onClick={() => updateLayer(selected.id, { x: Math.min(Math.max(0, board.width - selected.width), selected.x + 8) })}><ArrowRight size={19} /></button>
              <button type="button" className="uxui-pad-down" aria-label="Move element down 8 pixels" onClick={() => updateLayer(selected.id, { y: Math.min(Math.max(0, board.height - selected.height), selected.y + 8) })}><ArrowDown size={19} /></button>
            </div>
            <div className="uxui-gamepad uxui-gamepad-transform" role="group" aria-label={selected.kind === "icon" ? "Icon transform controls" : "Selected element transform controls"}>
              <span className="uxui-gamepad-label">{selected.kind === "icon" ? "Icon" : "Adjust"}</span>
              <button type="button" className="uxui-pad-up" aria-label="Increase element size 10 percent" onClick={() => updateLayer(selected.id, { width: Math.max(12, Math.min(board.width - selected.x, Math.round(selected.width * 1.1))), height: Math.max(12, Math.min(board.height - selected.y, Math.round(selected.height * 1.1))) })}><ZoomIn size={18} /></button>
              <button type="button" className="uxui-pad-left" aria-label="Rotate element left 15 degrees" onClick={() => updateLayer(selected.id, { rotation: (((selected.rotation || 0) - 15 + 360) % 360) })}><RotateCw size={17} className="uxui-rotate-back" /></button>
              <button type="button" className="uxui-pad-center" aria-label="Reset element rotation" onClick={() => updateLayer(selected.id, { rotation: 0 })}>0°</button>
              <button type="button" className="uxui-pad-right" aria-label="Rotate element right 15 degrees" onClick={() => updateLayer(selected.id, { rotation: (((selected.rotation || 0) + 15) % 360) })}><RotateCw size={17} /></button>
              <button type="button" className="uxui-pad-down" aria-label="Decrease element size 10 percent" onClick={() => updateLayer(selected.id, { width: Math.max(12, Math.round(selected.width * 0.9)), height: Math.max(12, Math.round(selected.height * 0.9)) })}><ZoomOut size={18} /></button>
            </div>
          </div>}
          {selected && !isExpanded && <div className="uxui-context-controls">
            <div className="uxui-context-toolbar" role="toolbar" aria-label="Selected element tools">
              <span className="uxui-context-selection">{selected.name || "Selected element"}</span>
              {selectedHasText && <button type="button" onClick={() => setShowTextEditor((value) => !value)} aria-expanded={showTextEditor}><Type size={15} /><span>Edit text</span></button>}
              {selectedHasText && <button type="button" onClick={() => { setLeftTab("fonts"); setToolkitSearch(""); setShowToolsPanel(true); }}><Type size={15} /><span>Fonts</span></button>}
              <button type="button" onClick={() => updateLayer(selected.id, { width: Math.max(12, Math.min(board.width - selected.x, Math.round(selected.width * 1.1))), height: Math.max(12, Math.min(board.height - selected.y, Math.round(selected.height * 1.1))) })} aria-label="Make selected element larger" title="Make larger"><ZoomIn size={15} /><span>Size +</span></button>
              <button type="button" onClick={() => updateLayer(selected.id, { width: Math.max(12, Math.round(selected.width * 0.9)), height: Math.max(12, Math.round(selected.height * 0.9)) })} aria-label="Make selected element smaller" title="Make smaller"><ZoomOut size={15} /><span>Size −</span></button>
              <button type="button" onClick={() => updateLayer(selected.id, { rotation: (((selected.rotation || 0) + 15) % 360) })} aria-label="Rotate selected element" title="Rotate 15 degrees"><RotateCw size={15} /><span>Rotate</span></button>
              <button type="button" onClick={() => setShowContextColors((value) => !value)} aria-expanded={showContextColors}><Palette size={15} /><span>Color</span></button>
              <button type="button" onClick={() => { setSelectedId(""); setShowTextEditor(false); setShowContextColors(false); }}><X size={15} /><span>Cancel</span></button>
              <button type="button" onClick={deleteSelected} className="is-danger"><Trash2 size={15} /><span>Delete</span></button>
            </div>
            {showTextEditor && selectedHasText && <div className="uxui-context-editor"><label htmlFor="uxui-selected-text">Edit text</label><textarea id="uxui-selected-text" value={selected.text} onFocus={() => checkpoint()} onChange={(event) => updateLayer(selected.id, { text: event.target.value }, false)} rows={2} /></div>}
            {showContextColors && <div className="uxui-context-color-picker">
              <div className="uxui-context-color-header"><strong>Color</strong><div role="group" aria-label="Color target"><button type="button" aria-pressed={paletteMode === "fill"} onClick={() => setPaletteMode("fill")}>Fill</button><button type="button" aria-pressed={paletteMode === "text"} onClick={() => setPaletteMode("text")}>Text</button></div><input type="color" aria-label="Choose element color" value={(paletteMode === "text" ? selected.color : selected.background) === "transparent" ? "#FFFFFF" : (paletteMode === "text" ? selected.color : selected.background)} onChange={(event) => updateLayer(selected.id, paletteMode === "text" ? { color: event.target.value } : { background: event.target.value })} /></div>
              <div className="uxui-context-swatches">{["#111827", "#FFFFFF", "#2563EB", "#7C3AED", "#DB2775", "#DC2626", "#D97706", "#059669", "#0F766E", "#64748B", "#E5E7EB", "#DBEAFE"].map((color) => <button key={color} type="button" style={{ background: color }} onClick={() => updateLayer(selected.id, paletteMode === "text" ? { color } : { background: color })} aria-label={"Apply " + color} title={color} />)}</div>
            </div>}
          </div>}
          {selected && !isExpanded && <section className="uxui-visual-property-dock" aria-label="Selected element visual properties">
            <div className="uxui-property-dock-header"><strong>Adjust visually</strong><span>{selected.kind} · {selected.width} × {selected.height}px</span><button type="button" onClick={() => setShowAdvancedContext((value) => !value)} aria-expanded={showAdvancedContext}>{showAdvancedContext ? "Hide technical settings" : "More settings"}</button></div>
            <div className="uxui-property-cards">
              <label className="uxui-property-card"><span>Width · {selected.width}px</span><input aria-label="Visual width" type="range" min="12" max={Math.max(12, board.width - selected.x)} value={Math.min(selected.width, Math.max(12, board.width - selected.x))} onPointerDown={() => checkpoint()} onFocus={() => checkpoint()} onChange={(event) => updateLayer(selected.id, { width: Number(event.target.value) }, false)} /></label>
              <label className="uxui-property-card"><span>Height · {selected.height}px</span><input aria-label="Visual height" type="range" min="12" max={Math.max(12, board.height - selected.y)} value={Math.min(selected.height, Math.max(12, board.height - selected.y))} onPointerDown={() => checkpoint()} onFocus={() => checkpoint()} onChange={(event) => updateLayer(selected.id, { height: Number(event.target.value) }, false)} /></label>
              <label className="uxui-property-card"><span>Horizontal position · {selected.x}px</span><input aria-label="Visual X position" type="range" min="0" max={Math.max(0, board.width - selected.width)} value={Math.min(selected.x, Math.max(0, board.width - selected.width))} onPointerDown={() => checkpoint()} onFocus={() => checkpoint()} onChange={(event) => updateLayer(selected.id, { x: Number(event.target.value) }, false)} /></label>
              <label className="uxui-property-card"><span>Vertical position · {selected.y}px</span><input aria-label="Visual Y position" type="range" min="0" max={Math.max(0, board.height - selected.height)} value={Math.min(selected.y, Math.max(0, board.height - selected.height))} onPointerDown={() => checkpoint()} onFocus={() => checkpoint()} onChange={(event) => updateLayer(selected.id, { y: Number(event.target.value) }, false)} /></label>
              <label className="uxui-property-card"><span>Corner radius · {selected.radius}px</span><input aria-label="Visual corner radius" type="range" min="0" max={Math.max(0, Math.floor(Math.min(selected.width, selected.height) / 2))} value={Math.min(selected.radius, Math.max(0, Math.floor(Math.min(selected.width, selected.height) / 2)))} onPointerDown={() => checkpoint()} onFocus={() => checkpoint()} onChange={(event) => updateLayer(selected.id, { radius: Number(event.target.value) }, false)} /></label>
              <label className="uxui-property-card"><span>Padding · {selected.padding}px</span><input aria-label="Visual padding" type="range" min="0" max="64" value={selected.padding} onPointerDown={() => checkpoint()} onFocus={() => checkpoint()} onChange={(event) => updateLayer(selected.id, { padding: Number(event.target.value) }, false)} /></label>
              <label className="uxui-property-card"><span>Opacity · {Math.round(selected.opacity * 100)}%</span><input aria-label="Visual opacity" type="range" min="0" max="1" step=".05" value={selected.opacity} onPointerDown={() => checkpoint()} onFocus={() => checkpoint()} onChange={(event) => updateLayer(selected.id, { opacity: Number(event.target.value) }, false)} /></label>
              <label className="uxui-property-card"><span>Border width · {selected.borderWidth}px</span><input aria-label="Visual border width" type="range" min="0" max="12" value={selected.borderWidth} onPointerDown={() => checkpoint()} onFocus={() => checkpoint()} onChange={(event) => updateLayer(selected.id, { borderWidth: Number(event.target.value) }, false)} /></label>
              {(["Top","Right","Bottom","Left"] as const).map((side) => { const key = ("margin" + side) as "marginTop" | "marginRight" | "marginBottom" | "marginLeft"; return <label key={key} className="uxui-property-card"><span>Margin {side.toLowerCase()} · {selected[key]}px</span><input aria-label={"Visual margin " + side.toLowerCase()} type="range" min="0" max="80" value={selected[key]} onPointerDown={() => checkpoint()} onFocus={() => checkpoint()} onChange={(event) => updateLayer(selected.id, { [key]: Number(event.target.value) } as Partial<DesignLayer>, false)} /></label>; })}
              <label className="uxui-property-card"><span>Text size · {selected.fontSize}px</span><input aria-label="Visual font size" type="range" min="8" max="96" value={Math.max(8, Math.min(96, selected.fontSize))} onPointerDown={() => checkpoint()} onFocus={() => checkpoint()} onChange={(event) => updateLayer(selected.id, { fontSize: Number(event.target.value) }, false)} /></label>
              <label className="uxui-property-card uxui-property-color"><span>Fill / background</span><input aria-label="Visual background color" type="color" value={/^#[0-9a-f]{6}$/i.test(selected.background) ? selected.background : "#FFFFFF"} onChange={(event) => updateLayer(selected.id, { background: event.target.value })} /></label>
              <label className="uxui-property-card uxui-property-color"><span>Text / icon color</span><input aria-label="Visual foreground color" type="color" value={/^#[0-9a-f]{6}$/i.test(selected.color) ? selected.color : "#111827"} onChange={(event) => updateLayer(selected.id, { color: event.target.value })} /></label>
              <label className="uxui-property-card uxui-property-color"><span>Border color</span><input aria-label="Visual border color" type="color" value={/^#[0-9a-f]{6}$/i.test(selected.borderColor) ? selected.borderColor : "#E5E7EB"} onChange={(event) => updateLayer(selected.id, { borderColor: event.target.value })} /></label>
              <label className="uxui-property-card uxui-property-toggle"><span>Soft shadow</span><input aria-label="Visual soft shadow" type="checkbox" checked={selected.shadow} onChange={(event) => updateLayer(selected.id, { shadow: event.target.checked })} /></label>
            </div>
            {showAdvancedContext && <div className="uxui-context-technical">
              <h3>Technical properties · CSS handoff</h3>
              <div className="uxui-technical-grid">
                <Field label="display"><select className={fieldClass()} value={selected.display || "flex"} onChange={(event) => updateLayer(selected.id, { display: event.target.value })}><option value="block">block</option><option value="inline-flex">inline-flex</option><option value="flex">flex</option><option value="grid">grid</option><option value="none">none</option></select></Field>
                <Field label="cursor"><select className={fieldClass()} value={selected.cursor || "default"} onChange={(event) => updateLayer(selected.id, { cursor: event.target.value })}><option value="default">default</option><option value="pointer">pointer</option><option value="grab">grab</option><option value="text">text</option><option value="move">move</option><option value="not-allowed">not-allowed</option></select></Field>
                <Field label="z-index"><input className={fieldClass()} type="number" value={selected.zIndex ?? 1} onChange={(event) => updateLayer(selected.id, { zIndex: Math.max(-999, Math.min(9999, Number(event.target.value) || 0)) })} /></Field>
                <Field label="transition (ms)"><input className={fieldClass()} type="number" min="0" max="5000" step="25" value={selected.transitionDuration ?? 180} onChange={(event) => updateLayer(selected.id, { transitionDuration: Math.max(0, Math.min(5000, Number(event.target.value) || 0)) })} /></Field>
                <Field label=":hover fill"><input className={fieldClass()} type="color" value={/^#[0-9a-f]{6}$/i.test(selected.hoverColor || "") ? selected.hoverColor : "#2563EB"} onChange={(event) => updateLayer(selected.id, { hoverColor: event.target.value })} /></Field>
                <Field label=":active fill"><input className={fieldClass()} type="color" value={/^#[0-9a-f]{6}$/i.test(selected.activeColor || "") ? selected.activeColor : "#1D4ED8"} onChange={(event) => updateLayer(selected.id, { activeColor: event.target.value })} /></Field>
                <Field label=":focus-visible fill"><input className={fieldClass()} type="color" value={/^#[0-9a-f]{6}$/i.test(selected.focusColor || "") ? selected.focusColor : "#7C3AED"} onChange={(event) => updateLayer(selected.id, { focusColor: event.target.value })} /></Field>
                <Field label="Minimum width"><input className={fieldClass()} type="number" min="0" value={selected.minWidth || 0} onChange={(event) => updateLayer(selected.id, { minWidth: Math.max(0, Number(event.target.value) || 0) })} /></Field>
                <Field label="Maximum width (0 = none)"><input className={fieldClass()} type="number" min="0" value={selected.maxWidth || 0} onChange={(event) => updateLayer(selected.id, { maxWidth: Math.max(0, Number(event.target.value) || 0) })} /></Field>
              </div>
              <fieldset className="uxui-device-visibility"><legend>Responsive visibility · generated @media rules</legend>{(["mobile","tablet","desktop"] as DeviceTarget[]).map((device) => <label key={device}><input type="checkbox" checked={(selected.visibleOn || ["mobile","tablet","desktop"]).includes(device)} onChange={(event) => updateLayer(selected.id, { visibleOn: event.target.checked ? [...(selected.visibleOn || ["mobile","tablet","desktop"]), device] : (selected.visibleOn || ["mobile","tablet","desktop"]).filter((value) => value !== device) })} />{device}</label>)}</fieldset>
              <p className="text-xs text-muted">Media breakpoint defaults: mobile ≤ {DESIGN_BREAKPOINTS.mobile}px; tablet through {DESIGN_BREAKPOINTS.desktop - 1}px; desktop ≥ {DESIGN_BREAKPOINTS.desktop}px. Use per-device visibility to generate the corresponding @media rules.</p>
            </div>}
          </section>}
          <input ref={elementImportInputRef} type="file" accept=".json,application/json,image/png,image/jpeg,image/webp,image/gif,.svg,image/svg+xml" className="sr-only" aria-label="Import elements" onChange={(event) => { const file = event.target.files?.[0]; if (file) importElementsFile(file); event.target.value = ""; }} />
          <input ref={presetImportInputRef} type="file" accept=".json,application/json" className="sr-only" aria-label="Import preset" onChange={(event) => { const file = event.target.files?.[0]; if (file) importPresetFile(file); event.target.value = ""; }} />
          <input ref={iconImportInputRef} type="file" accept=".svg,image/svg+xml" className="sr-only" aria-label="Import SVG icon" onChange={(event) => { const file = event.target.files?.[0]; if (file) importIconFile(file); event.target.value = ""; }} />
          <input ref={quickImageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label="Choose an image" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (!file.type.startsWith("image/") || file.size > 4 * 1024 * 1024) { setNotice("Choose a supported image up to 4 MB."); event.target.value = ""; return; }
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result !== "string") return;
              const layer = { ...makeLayer("image", Math.round(board.width / 2 - 125), Math.round(board.height * 0.28), board.width, board.height), name: file.name.replace(/\\.[^.]+$/, "") || "Image", text: file.name, imageDataUrl: reader.result };
              checkpoint();
              setElements((previous) => [...previous, layer]);
              setSelectedId(layer.id);
              setNotice("Image added to your mockup.");
            };
            reader.onerror = () => setNotice("Could not read the selected image.");
            reader.readAsDataURL(file);
            event.target.value = "";
          }} />
        </main>

        {showInspector && <aside className="uxui-inspector min-w-0 rounded-xl border border-border bg-surface p-3">
          <section className="uxui-screen-manager" aria-labelledby="uxui-screens-heading">
            <div className="uxui-screen-manager-heading">
              <div><h2 id="uxui-screens-heading">App screens</h2><p>{screens.length} {screens.length === 1 ? "screen" : "screens"} · {screens.find((screen) => screen.id === activeScreenId)?.name || "Screen 1"}</p></div>
              <button type="button" onClick={addScreen} aria-label="Add app screen" title="Add app screen" className="uxui-screen-add"><Plus size={20}/><span>New screen</span></button>
            </div>
            <div className="uxui-screen-grid">
              {screens.map((screen,index) => {
                const viewportWidth = screen.customArtboard ? screen.customWidth : boardSize(screen.target).width;
                const viewportHeight = screen.customArtboard ? screen.customHeight : boardSize(screen.target).height;
                return <article key={screen.id} className={"uxui-screen-card " + (screen.id === activeScreenId ? "is-active" : "")}>
                  <button type="button" className="uxui-screen-thumb-button" onClick={() => openScreen(screen.id)} aria-label={"Open " + screen.name} aria-pressed={screen.id === activeScreenId}>
                    <div className={"uxui-screen-thumb uxui-screen-thumb-" + screen.target} style={{background:screen.background}}>
                      {screen.elements.slice(0,6).map((layer) => <span key={layer.id} style={{left:Math.max(1,Math.min(94,layer.x/Math.max(1,viewportWidth)*100))+"%",top:Math.max(1,Math.min(94,layer.y/Math.max(1,viewportHeight)*100))+"%",width:Math.max(3,Math.min(84,layer.width/Math.max(1,viewportWidth)*100))+"%",height:Math.max(2,Math.min(48,layer.height/Math.max(1,viewportHeight)*100))+"%",background:layer.background==="transparent"?(layer.kind==="text"?"#cbd5e1":layer.color):layer.background,opacity:layer.opacity}} />)}
                    </div>
                  </button>
                  <div className="uxui-screen-card-meta">
                    <input aria-label={"Screen name " + (index+1)} value={screen.name} maxLength={70} onChange={(event)=>renameScreen(screen.id,event.target.value)} />
                    <small>{screen.target} · {screen.elements.length} layers</small>
                  </div>
                  <div className="uxui-screen-card-actions">
                    <button type="button" onClick={()=>reorderScreen(screen.id,-1)} disabled={index===0} aria-label={"Move "+screen.name+" earlier"} title="Move earlier"><ArrowLeft size={13}/></button>
                    <button type="button" onClick={()=>reorderScreen(screen.id,1)} disabled={index===screens.length-1} aria-label={"Move "+screen.name+" later"} title="Move later"><ArrowRight size={13}/></button>
                    <button type="button" onClick={()=>duplicateScreen(screen.id)} aria-label={"Duplicate "+screen.name} title="Duplicate screen"><Copy size={13}/></button>
                    <button type="button" onClick={()=>deleteScreen(screen.id)} disabled={screens.length===1} aria-label={"Delete "+screen.name} title="Delete screen"><Trash2 size={13}/></button>
                  </div>
                </article>;
              })}
            </div>
          </section>
          <div className="uxui-project-heading">
            <div className="flex items-start justify-between gap-2"><h2>Project title</h2><button type="button" onClick={() => setHelpOpen((value) => !value)} aria-label="Project help" title="Project help"><CircleHelp size={19} /></button></div>
            <input aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} className="uxui-project-title-input" maxLength={90} />
            <p>{elements.length ? elements.length + (elements.length === 1 ? " element" : " elements") : "Add your first element using +"}</p>
          </div>
          {helpOpen && <div className="uxui-help-note" role="status"><strong>Make it by eye.</strong><span>Drag and style your layers on the mockup. enV quietly records exact measurements, type, spacing, colours and icon identity for developer or AI handoff.</span></div>}
          <div className="uxui-layer-heading"><strong>Layers</strong>{elements.length > 0 && <span>{elements.length}</span>}</div>
          <div className="uxui-layer-list">
            {elements.length ? [...elements].reverse().slice(0, showMoreLayers ? elements.length : 6).map((item, index) => {
              const outlines = ["#8EC8E7", "#D48D91", "#A8CE79", "#D8C87D", "#C8C8C8", "#8FC6B3"];
              return <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setInspectorTab("design"); }} aria-pressed={selectedId === item.id} className={"uxui-layer-chip " + (selectedId === item.id ? "is-selected" : "")} style={{ "--layer-tint": outlines[index % outlines.length] } as CSSProperties}>
                <span className="uxui-layer-number">{index + 1}.</span><span className="uxui-layer-name">{item.name || item.kind}</span><span className="uxui-layer-kind">{item.kind}</span>
              </button>;
            }) : <div className="uxui-empty-layers"><Layers size={18} /><span>No layers yet</span><small>Add an element to see it here.</small></div>}
            {elements.length > 6 && <button type="button" className="uxui-see-more" onClick={() => setShowMoreLayers((value) => !value)}>{showMoreLayers ? "see less" : "see more"}</button>}
          </div>
          <div className="uxui-palette-panel">
            <div className="uxui-palette-heading"><strong>Colours</strong><div role="group" aria-label="Apply colour to"><button type="button" onClick={() => setPaletteMode("fill")} aria-pressed={paletteMode === "fill"} className={paletteMode === "fill" ? "is-active" : ""}>Fill</button><button type="button" onClick={() => setPaletteMode("text")} aria-pressed={paletteMode === "text"} className={paletteMode === "text" ? "is-active" : ""}>Text</button></div></div>
            <div className="uxui-color-grid">
              {Array.from({ length: 96 }, (_, index) => {
                const row = Math.floor(index / 12);
                const column = index % 12;
                const gray = Math.round(column / 11 * 255).toString(16).padStart(2, "0");
                const color = row === 0 ? "#" + gray.repeat(3) : "hsl(" + (column * 30) + " 76% " + (88 - (row - 1) * 10) + "%)";
                return <button key={index} type="button" style={{ backgroundColor: color }} onClick={() => { if (selected) updateLayer(selected.id, paletteMode === "fill" ? { background: color } : { color }); else setBackground(color); }} title={color.toUpperCase()} aria-label={"Apply " + color + " to " + paletteMode} />;
              })}
            </div>
            <div className="uxui-active-color"><span style={{ backgroundColor: selected ? (paletteMode === "fill" ? selected.background : selected.color) : background }} /><small>{paletteMode === "fill" ? "Fill colour" : "Text colour"}</small><code>{selected ? (paletteMode === "fill" ? selected.background : selected.color) : background}</code></div>
          </div>
          {selected && <div className="uxui-quick-style">
            <div className="uxui-quick-style-heading"><strong>Corner style</strong><span>Round the edges</span></div>
            <div className="uxui-radius-buttons" role="group" aria-label="Corner style">
              <button type="button" aria-pressed={selected.radius === 0} onClick={() => updateLayer(selected.id, { radius: 0 })}>Sharp</button>
              <button type="button" aria-pressed={selected.radius === Math.min(14, Math.floor(Math.min(selected.width, selected.height) / 4))} onClick={() => updateLayer(selected.id, { radius: Math.min(14, Math.floor(Math.min(selected.width, selected.height) / 4)) })}>Soft</button>
              <button type="button" aria-pressed={selected.radius >= Math.floor(Math.min(selected.width, selected.height) / 2)} onClick={() => updateLayer(selected.id, { radius: Math.floor(Math.min(selected.width, selected.height) / 2) })}>Round</button>
            </div>
            <label className="uxui-quick-style-shadow"><span>Soft shadow</span><input type="checkbox" checked={selected.shadow} onChange={(event) => updateLayer(selected.id, { shadow: event.target.checked })} /></label>
          </div>}
          <details className="uxui-advanced-controls">
            <summary>Fine-tune design</summary>
            <div className="uxui-advanced-body">
              <div className="uxui-artboard-settings">
                <label>Custom canvas<input type="checkbox" checked={customArtboard} onChange={(event) => setCustomArtboard(event.target.checked)} /></label>
                <label>Width<input aria-label="Custom canvas width" type="number" min="160" max="4096" disabled={!customArtboard} value={customWidth} onChange={(event) => setCustomWidth(Math.min(4096, Math.max(160, Number(event.target.value) || 160)))} /></label>
                <label>Height<input aria-label="Custom canvas height" type="number" min="240" max="4096" disabled={!customArtboard} value={customHeight} onChange={(event) => setCustomHeight(Math.min(4096, Math.max(240, Number(event.target.value) || 240)))} /></label>
              </div>
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
            {selected.kind === "image" && <Field label="Replace image"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="mt-2 block w-full text-[11px] text-muted file:mr-2 file:rounded-md file:border-0 file:bg-surface-2 file:px-2 file:py-1.5 file:text-xs file:font-semibold" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 4 * 1024 * 1024) { setNotice("Image assets must be 4 MB or smaller for a portable design project."); event.target.value = ""; return; } if (!file.type.startsWith("image/")) { setNotice("Choose a supported image file."); event.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === "string") updateLayer(selected.id, { imageDataUrl: reader.result }); }; reader.onerror = () => setNotice("Could not read the selected image."); reader.readAsDataURL(file); }} /></Field>}
            {selected.kind === "icon" && <div className="rounded-lg border border-border p-2"><p className="break-all text-xs font-semibold text-fg">{selected.iconName || "Built-in home icon"}</p><p className="mt-1 text-[10px] leading-4 text-muted">{selected.iconAuthor || "Built-in icon"} · {selected.iconLicense || "No external license metadata"}</p><button type="button" onClick={() => setLeftTab("icons")} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent"><Search size={12} /> Replace icon</button></div>}
            <div className="grid grid-cols-2 gap-2">
              <Field label="X position (px)"><input type="number" className={fieldClass()} value={selected.x} onChange={(event) => updateLayer(selected.id, { x: Number(event.target.value) || 0 })} /></Field>
              <Field label="Y position (px)"><input type="number" className={fieldClass()} value={selected.y} onChange={(event) => updateLayer(selected.id, { y: Number(event.target.value) || 0 })} /></Field>
              <Field label="Width (px)"><input type="number" min="1" className={fieldClass()} value={selected.width} onChange={(event) => updateLayer(selected.id, { width: Math.max(1, Number(event.target.value) || 1) })} /></Field>
              <Field label="Height (px)"><input type="number" min="1" className={fieldClass()} value={selected.height} onChange={(event) => updateLayer(selected.id, { height: Math.max(1, Number(event.target.value) || 1) })} /></Field>
            </div>
            <details className="uxui-css-controls rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-xs font-semibold text-fg">Technical styling · CSS</summary>
              <p className="mt-2 text-[10px] leading-4 text-muted">Visual controls handle everyday edits. These implementation values are included in the project specification and web handoff.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field label="Display"><select className={fieldClass()} value={selected.display || "flex"} onChange={(event) => updateLayer(selected.id, { display: event.target.value })}><option value="block">Block</option><option value="inline-flex">Inline flex</option><option value="flex">Flex</option><option value="grid">Grid</option><option value="none">Hidden</option></select></Field>
                <Field label="Cursor"><select className={fieldClass()} value={selected.cursor || "default"} onChange={(event) => updateLayer(selected.id, { cursor: event.target.value })}><option value="default">Default</option><option value="pointer">Pointer</option><option value="grab">Grab</option><option value="text">Text</option><option value="move">Move</option><option value="not-allowed">Not allowed</option></select></Field>
                <Field label="Z-index"><input type="number" className={fieldClass()} value={selected.zIndex ?? 1} onChange={(event) => updateLayer(selected.id, { zIndex: Math.max(-999, Math.min(9999, Number(event.target.value) || 0)) })} /></Field>
                <Field label="Transition (ms)"><input type="number" min="0" max="5000" step="25" className={fieldClass()} value={selected.transitionDuration ?? 180} onChange={(event) => updateLayer(selected.id, { transitionDuration: Math.max(0, Math.min(5000, Number(event.target.value) || 0)) })} /></Field>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Field label=":hover fill"><input type="color" className={fieldClass()} value={/^#[0-9a-f]{6}$/i.test(selected.hoverColor || "") ? selected.hoverColor : "#2563EB"} onChange={(event) => updateLayer(selected.id, { hoverColor: event.target.value })} /></Field>
                <Field label=":active fill"><input type="color" className={fieldClass()} value={/^#[0-9a-f]{6}$/i.test(selected.activeColor || "") ? selected.activeColor : "#1D4ED8"} onChange={(event) => updateLayer(selected.id, { activeColor: event.target.value })} /></Field>
                <Field label=":focus-visible fill"><input type="color" className={fieldClass()} value={/^#[0-9a-f]{6}$/i.test(selected.focusColor || "") ? selected.focusColor : "#7C3AED"} onChange={(event) => updateLayer(selected.id, { focusColor: event.target.value })} /></Field>
              </div>
              <p className="mt-2 text-[10px] text-muted">Empty interaction colours mean inherit the base style. Values are retained in the design specification.</p>
            </details>
            <div className="mt-3 rounded-lg border border-border p-3">
              <h4 className="mb-2 text-xs font-semibold text-fg">Responsive constraints</h4>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Horizontal anchor"><select className={fieldClass()} value={selected.horizontalConstraint || "left"} onChange={(event)=>updateLayer(selected.id,{horizontalConstraint:event.target.value as HorizontalConstraint})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="stretch">Stretch</option></select></Field>
                <Field label="Vertical anchor"><select className={fieldClass()} value={selected.verticalConstraint || "top"} onChange={(event)=>updateLayer(selected.id,{verticalConstraint:event.target.value as VerticalConstraint})}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option><option value="stretch">Stretch</option></select></Field>
                <Field label="Minimum width (px)"><input type="number" min="0" className={fieldClass()} value={selected.minWidth || 0} onChange={(event)=>updateLayer(selected.id,{minWidth:Math.max(0,Number(event.target.value)||0)})}/></Field>
                <Field label="Maximum width (px, 0 = none)"><input type="number" min="0" className={fieldClass()} value={selected.maxWidth || 0} onChange={(event)=>updateLayer(selected.id,{maxWidth:Math.max(0,Number(event.target.value)||0)})}/></Field>
              </div>
              <p className="mt-2 text-[10px] text-muted">Reference viewport: {selected.referenceWidth || board.width} × {selected.referenceHeight || board.height}px.</p>
              <fieldset className="mt-2"><legend className="mb-1 text-[11px] font-medium text-muted">Visible on devices</legend><div className="flex flex-wrap gap-3">{(["mobile","tablet","desktop"] as DeviceTarget[]).map((device)=> <label key={device} className="inline-flex items-center gap-1 text-xs text-fg"><input type="checkbox" checked={(selected.visibleOn || ["mobile","tablet","desktop"]).includes(device)} onChange={(event)=>updateLayer(selected.id,{visibleOn:event.target.checked?[...(selected.visibleOn||["mobile","tablet","desktop"]),device]:(selected.visibleOn||["mobile","tablet","desktop"]).filter((item)=>item!==device)})}/>{device}</label>)}</div></fieldset>
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
            </div>
          </details>
        </aside>}
      </div>
      {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-5 text-muted"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" /> <span className="min-w-0 flex-1">{notice}</span><button aria-label="Dismiss notice" type="button" onClick={() => setNotice("")} className="rounded p-0.5 text-muted hover:text-fg"><X size={13} /></button></div>}
      <footer className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-3 text-[11px] leading-5 text-muted"><span>Local-first editor · Exact pixel dimensions · Layer-level specification records</span><button type="button" onClick={() => setShowToolsPanel(true)} className="inline-flex items-center gap-1 font-semibold text-accent"><Plus size={13} /> Add elements</button></footer>
    </section>
  );
}
