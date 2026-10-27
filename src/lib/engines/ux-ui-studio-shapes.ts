/** Insertable geometry and UI controls. Existing layer kinds keep exports editable. */
export type StudioShapePreset = {
  id: string; label: string; description: string; kind: string;
  category: "Geometry" | "Controls" | "Navigation" | "Surfaces";
  patch?: {
    name?: string; width?: number; height?: number; text?: string;
    color?: string; background?: string; borderColor?: string; borderWidth?: number;
    radius?: number; padding?: number; fontSize?: number; fontWeight?: number;
    textAlign?: "left" | "center" | "right"; shadow?: boolean;
    iconSvg?: string; iconViewBox?: string; iconName?: string;
  };
};

const vector = (id: string, label: string, description: string, body: string): StudioShapePreset => ({
  id, label, description, kind: "icon", category: "Geometry",
  patch: {name: label, width: 80, height: 80, iconName: label, iconSvg: body, iconViewBox: "0 0 100 100", color: "#111827", padding: 0, radius: 0},
});

export const STUDIO_SHAPE_PRESETS: readonly StudioShapePreset[] = [
  {id:"rectangle", label:"Rectangle", description:"Rectangle with editable fill, border and corners", kind:"rect", category:"Geometry"},
  {id:"square", label:"Square", description:"Square with sharp edges", kind:"rect", category:"Geometry", patch:{width:96,height:96,radius:0}},
  {id:"rounded-rectangle", label:"Rounded rectangle", description:"Soft rectangular surface", kind:"rect", category:"Geometry", patch:{radius:24}},
  {id:"circle", label:"Circle", description:"Circular geometric shape", kind:"ellipse", category:"Geometry"},
  {id:"oval", label:"Oval", description:"Wide elliptical shape", kind:"ellipse", category:"Geometry", patch:{width:148,height:80}},
  {id:"triangle", label:"Triangle", description:"Three-sided shape", kind:"triangle", category:"Geometry"},
  {id:"diamond", label:"Diamond", description:"Diamond or decision marker", kind:"diamond", category:"Geometry"},
  {id:"hexagon", label:"Hexagon", description:"Six-sided shape", kind:"hexagon", category:"Geometry"},
  {id:"star", label:"Star", description:"Five-point star", kind:"star", category:"Geometry"},
  {id:"pill", label:"Pill", description:"Capsule with rounded ends", kind:"pill", category:"Geometry"},
  {id:"line", label:"Line", description:"Straight connector with rounded ends", kind:"line", category:"Geometry"},
  {id:"divider", label:"Divider", description:"Thin horizontal separator", kind:"divider", category:"Geometry"},
  {id:"vertical-divider", label:"Vertical divider", description:"Thin vertical separator", kind:"rect", category:"Geometry", patch:{width:1,height:120,radius:0,padding:0,background:"#CBD5E1"}},
  vector("arrow-right", "Arrow right", "Solid right-pointing arrow", '<path d="M8 35h45V12l39 38-39 38V65H8z"/>'),
  vector("arrow-left", "Arrow left", "Solid left-pointing arrow", '<path d="M92 35H47V12L8 50l39 38V65h45z"/>'),
  vector("chevron-right", "Chevron right", "Navigation chevron", '<path d="M35 15l35 35-35 35" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>'),
  vector("chevron-down", "Chevron down", "Disclosure chevron", '<path d="M15 35l35 35 35-35" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>'),
  vector("speech-bubble", "Speech bubble", "Rounded callout with a speech tail", '<path d="M20 10h60a12 12 0 0 1 12 12v42a12 12 0 0 1-12 12H42L20 94V76a12 12 0 0 1-12-12V22a12 12 0 0 1 12-12z"/>'),
  vector("heart", "Heart", "Heart shape for favorites", '<path d="M50 90 12 54C-8 33 4 8 25 10c11 0 19 5 25 14 6-9 14-14 25-14 21-2 33 23 13 44z"/>'),
  vector("ring", "Ring", "Outlined circular ring", '<circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" stroke-width="12"/>'),
  vector("check-mark", "Check mark", "Confirmation check", '<path d="M15 52 39 76 85 24" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>'),
  vector("close-mark", "Close mark", "Cross or close symbol", '<path d="M22 22l56 56M78 22 22 78" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round"/>'),
  {id:"search-bar", label:"Search bar", description:"Search field with editable placeholder and corner radius", kind:"search", category:"Controls", patch:{name:"Search bar",text:"Search…",radius:12}},
  {id:"search-pill", label:"Rounded search bar", description:"Capsule search field", kind:"search", category:"Controls", patch:{name:"Rounded search bar",text:"Search…",radius:999}},
  {id:"text-input", label:"Text input", description:"Single-line form field", kind:"input", category:"Controls"},
  {id:"text-area", label:"Text area", description:"Multiline message field", kind:"textarea", category:"Controls"},
  {id:"dropdown", label:"Dropdown", description:"Select-menu field", kind:"dropdown", category:"Controls"},
  {id:"button", label:"Button", description:"Primary call-to-action button", kind:"button", category:"Controls"},
  {id:"outlined-button", label:"Outlined button", description:"Secondary action with a visible border", kind:"button", category:"Controls", patch:{name:"Outlined button",background:"transparent",color:"#111827",borderColor:"#111827",borderWidth:1,text:"Secondary action"}},
  {id:"round-button", label:"Round button", description:"Capsule call-to-action button", kind:"button", category:"Controls", patch:{name:"Round button",radius:999}},
  {id:"checkbox", label:"Checkbox", description:"Square selection control", kind:"checkbox", category:"Controls"},
  {id:"radio", label:"Radio button", description:"Circular single-choice control", kind:"radio", category:"Controls"},
  {id:"switch", label:"Switch", description:"On/off toggle control", kind:"switch", category:"Controls"},
  {id:"slider", label:"Slider", description:"Range or value-control track", kind:"slider", category:"Controls"},
  {id:"progress", label:"Progress bar", description:"Progress-indicator track", kind:"progress", category:"Controls"},
  {id:"chip", label:"Chip", description:"Compact filter or choice capsule", kind:"badge", category:"Controls", patch:{name:"Filter chip",text:"Filter",width:88,height:32,radius:999}},
  {id:"badge", label:"Badge", description:"Small status label", kind:"badge", category:"Controls"},
  {id:"avatar", label:"Avatar", description:"Round profile placeholder", kind:"avatar", category:"Controls"},
  {id:"navigation-bar", label:"Navigation bar", description:"Top navigation surface", kind:"navbar", category:"Navigation"},
  {id:"bottom-bar", label:"Bottom navigation", description:"Bottom navigation surface", kind:"tabbar", category:"Navigation"},
  {id:"tabs", label:"Tabs", description:"Tabbed navigation surface", kind:"tabs", category:"Navigation"},
  {id:"breadcrumb", label:"Breadcrumb", description:"Navigation trail", kind:"breadcrumb", category:"Navigation"},
  {id:"menu", label:"Menu bar", description:"Menu or command bar", kind:"menu", category:"Navigation"},
  {id:"card", label:"Card", description:"Content surface with editable corners, fill and outline", kind:"card", category:"Surfaces"},
  {id:"flat-card", label:"Flat card", description:"Simple outlined surface without a shadow", kind:"card", category:"Surfaces", patch:{name:"Flat card",shadow:false,radius:12}},
  {id:"dialog", label:"Dialog", description:"Modal dialog surface", kind:"modal", category:"Surfaces"},
  {id:"tooltip", label:"Tooltip", description:"Small contextual help surface", kind:"tooltip", category:"Surfaces"},
  {id:"list-row", label:"List row", description:"Structured list-item surface", kind:"list", category:"Surfaces"},
];

export function searchStudioShapes(query: string): readonly StudioShapePreset[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return STUDIO_SHAPE_PRESETS.filter(preset => words.every(word => (preset.label + " " + preset.description + " " + preset.category + " " + preset.kind).toLowerCase().includes(word)));
}
