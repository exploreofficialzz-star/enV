import type { ToolMeta } from "@/types/tool";

/**
 * Semantic icon identity and artwork colors for each catalog tool.
 * The ID-derived colors make sibling tools look like separate app icons while
 * keeping the same tool visually consistent on Web, Android and iOS.
 */
export type DesignedToolIcon = Pick<ToolMeta, "icon" | "iconBackground" | "iconAccent">;

type IconRule = readonly [RegExp, string];

const RULES: readonly IconRule[] = [
  [/\bqr\b|qrcode|qr-code/, "QrCode"],
  [/barcode|ean-?\d|upc-?a|code-?128|codabar/, "Barcode"],
  [/alt[- ]?text|image[- ]?description|screen[- ]?reader/, "ScanEye"],
  [/contrast|color[- ]?blind|colour[- ]?blind|wcag|apca/, "Contrast"],
  [/keyboard|key[- ]?navigation|hotkey|shortcut/, "Keyboard"],
  [/focus[- ]?(state|ring|order)|tab[- ]?order/, "Focus"],
  [/aria|accessib|a11y|disability|reflow|readability/, "Accessibility"],
  [/password|passphrase|secret[- ]?key|credential|auth(?:entication|orization)?|jwt|bearer[- ]?token/, "KeyRound"],
  [/encrypt|decrypt|cipher|cryptograph|secure[- ]?token|privacy|permission/, "ShieldCheck"],
  [/\bhash\b|checksum|digest|fingerprint/, "Fingerprint"],
  [/regex|regular[- ]?expression|pattern[- ]?match/, "Regex"],
  [/json|yaml|yml|toml|xml|schema|jsonl/, "Braces"],
  [/sql|database|query[- ]?builder|sqlite|postgres|mysql|mongodb|csv[- ]?database/, "Database"],
  [/git[- ]?(?:branch|merge|commit|diff)|version[- ]?control|repository|pull[- ]?request/, "GitBranch"],
  [/terminal|command[- ]?line|shell[- ]?command|bash|powershell|cli[- ]?tool/, "Terminal"],
  [/html|css|javascript|typescript|tsx|jsx|web[- ]?component|code[- ]?snippet|developer[- ]?tool/, "Code2"],
  [/api[- ]?|http[- ]?(?:header|status|request|response)|webhook|rest[- ]?client/, "Webhook"],
  [/dns|ip[- ]?address|cidr|subnet|port[- ]?scanner|network|router|wifi|latency|ping[- ]?test/, "Network"],
  [/url|uri|link[- ]?(?:check|short|preview)|redirect|canonical|hreflang|domain/, "Link2"],
  [/crop|trim[- ]?image|aspect[- ]?ratio|resize[- ]?image|split[- ]?image|slice[- ]?image/, "Crop"],
  [/\bimage\b|\bphoto\b|photograph|\bpicture\b|\bthumbnail\b|favicon|\bpixels?\b|watermark|background[- ]?remov|upscal|compress[- ]?image/, "Image"],
  [/scan|ocr|text[- ]?recognition|document[- ]?capture/, "Scan"],
  [/camera|photograph|exif|metadata[- ]?image|lens|aperture/, "Camera"],
  [/video|movie|clip|frame[- ]?rate|fps|subtitle|caption[- ]?video|stream[- ]?record/, "Video"],
  [/audio|music|song|waveform|wave[- ]?file|equalizer|loudness|bitrate[- ]?audio|metronome|bpm[- ]?audio/, "AudioWaveform"],
  [/microphone|voice|vocal|speech|transcri(?:be|ption)|dictation/, "Mic"],
  [/podcast|headphone|speaker|sound[- ]?check/, "Headphones"],
  [/color|colour|gradient|palette|hue|hex[- ]?color|rgb|hsl|paint|swatch/, "Palette"],
  [/font|typograph|letter[- ]?spacing|line[- ]?height|font[- ]?size|typeface/, "Type"],
  [/layout|wireframe|responsive[- ]?design|grid[- ]?system|css[- ]?layout|web[- ]?design/, "PanelsTopLeft"],
  [/mockup|device[- ]?frame|phone[- ]?frame|browser[- ]?frame|social[- ]?post[- ]?mockup/, "AppWindow"],
  [/pdf|document|word[- ]?file|docx|page[- ]?number|page[- ]?reorder|merge[- ]?document|split[- ]?document/, "FileText"],
  [/spreadsheet|excel|xlsx|csv[- ]?(?:export|convert|formatter)|table[- ]?data/, "FileSpreadsheet"],
  [/file[- ]?convert|file[- ]?format|archive|zip[- ]?file|folder|file[- ]?organ/, "FolderOpen"],
  [/email|e-mail|mail[- ]?(?:merge|draft|template|checker)|inbox/, "Mail"],
  [/phone[- ]?number|telephone|sms|call[- ]?log|dial/, "Phone"],
  [/chat|message|conversation|reply|dm[- ]?|direct[- ]?message|comment[- ]?box/, "MessagesSquare"],
  [/social[- ]?media|hashtag|instagram|tiktok|discord|facebook|linkedin|reddit|pinterest|tweet|twitter|youtube[- ]?(?:title|description|tag|caption)/, "Share2"],
  [/calendar|schedule|agenda|appointment|event[- ]?date|date[- ]?picker|timezone|time[- ]?zone/, "CalendarDays"],
  [/countdown|stopwatch|pomodoro|focus[- ]?timer|duration|elapsed[- ]?time|time[- ]?tracker/, "Timer"],
  [/clock|hour|minute|second|time[- ]?difference|time[- ]?addition|time[- ]?zone/, "Clock3"],
  [/\bfinance\b|\bapr\b|cash[- ]?flow|account[- ]?balance|balance[- ]?sheet|currency|exchange[- ]?rate|forex|money|budget|salary|payroll|tax[- ]?calculator|income|expense|profit|revenue|investment|interest[- ]?rate|mortgage|loan|debt|retirement|savings|401k|invoice|receipt|billing/, "Wallet"],
  [/percent|percentage|ratio|proportion|discount|markup|margin|tax[- ]?rate|tip[- ]?calculator/, "Percent"],
  [/stock|share[- ]?price|portfolio|growth[- ]?rate|return[- ]?on|cagr|trend|analytics|statistics|statistical|regression|correlation|standard[- ]?deviation|variance|median|average|mean|probability|odds|percentile|quartile/, "ChartNoAxesCombined"],
  [/\barea\b|perimeter|triangle|rectangle|\bcircle\b|sphere|cylinder|cone|polygon|geometry|diameter|radius|circumference|trapezoid|parallelogram|rhombus|prism|pyramid|surface[- ]?area|volume[- ]?of/, "Shapes"],
  [/matrix|vector|determinant|linear[- ]?algebra|eigenvalue|polynomial|quadratic|equation|inequality|algebra|factorization|factorial|logarithm|exponent|root[- ]?calculator|sequence|series|summation|\bsigma\b|derivative|integral|calculus|trigonometry|\bsine\b|\bcosine\b|\btangent\b|\bradian\b|degree[- ]?math/, "Sigma"],
  [/temperature|celsius|fahrenheit|kelvin|thermal|heat[- ]?transfer|dew[- ]?point|wind[- ]?chill|heat[- ]?index/, "Thermometer"],
  [/speed|velocity|acceleration|force|momentum|torque|gravity|gravitational|kinetic|potential[- ]?energy|power[- ]?output|energy|electric|voltage|current|resistance|watt|joule|newton|physics|frequency|wavelength|pressure|density|specific[- ]?heat/, "Gauge"],
  [/chemistry|chemical|molarity|mole[- ]?concept|ph[- ]?calculator|stoichiometry|atomic|molecular|isotope|periodic[- ]?table|gas[- ]?law|concentration/, "FlaskConical"],
  [/health|medical|bmi|body[- ]?mass|calorie|nutrition|heart[- ]?rate|pulse|sleep|hydration|water[- ]?intake|body[- ]?fat|fitness|workout|step[- ]?count/, "HeartPulse"],
  [/weight|mass[- ]?converter|kilogram|pound[- ]?converter|grams?[- ]?to|ounces?[- ]?to|weighing|body[- ]?weight/, "Weight"],
  [/length|distance|height|width|depth|ruler|measurement|meter[- ]?to|inch[- ]?to|feet[- ]?to|miles?[- ]?to|area[- ]?converter/, "Ruler"],
  [/volume[- ]?converter|litre|liter|gallon|fluid[- ]?ounce|millilitre|milliliter|cup[- ]?to|cubic[- ]?/, "Droplets"],
  [/unit[- ]?convert|converter|conversion|convert[- ]?between|measurement[- ]?convert/, "ArrowLeftRight"],
  [/travel|flight|airline|airport|boarding|passport|visa|trip[- ]?planner|itinerary|vacation|destination/, "Plane"],
  [/map|location|geocode|latitude|longitude|coordinates|navigation|route[- ]?planner|distance[- ]?between/, "MapPin"],
  [/food|recipe|cooking|kitchen|meal[- ]?planner|ingredient|nutrition[- ]?label|coffee|tea|pizza|baking|chef/, "ChefHat"],
  [/shopping|product[- ]?price|e-?commerce|cart|sku|inventory|stock[- ]?keeping|retail|store[- ]?locator|shipping|package|order[- ]?tracker/, "ShoppingCart"],
  [/resume|résumé|cv[- ]?|cover[- ]?letter|job[- ]?application|career|interview|professional[- ]?bio|linkedin[- ]?profile/, "BriefcaseBusiness"],
  [/school|education|learning|study[- ]?plan|grade|gpa|quiz|flashcard|lesson|course|student|teacher|homework|citation|bibliography/, "GraduationCap"],
  [/game|gaming|dice|random[- ]?picker|randomizer|spin[- ]?wheel|raffle|lottery|decision[- ]?wheel|tournament|bracket/, "Dices"],
  [/birthday|celebration|party|wedding|anniversary|invitation|greeting[- ]?card|gift|holiday|christmas|congratulation/, "PartyPopper"],
  [/relationship|love[- ]?letter|date[- ]?night|ask[- ]?out|appreciation|compliment|friendship|couple|romantic|wedding[- ]?vow/, "Heart"],
  [/qr|barcode|scan[- ]?code/, "QrCode"],
  [/seo|keyword|search[- ]?engine|meta[- ]?description|sitemap|robots\.txt|structured[- ]?data|schema\.org|ranking|serp|backlink|canonical[- ]?url/, "Search"],
  [/\bad(?:[- ]|$)|advertis|campaign|marketing|call[- ]?to[- ]?action|headline|lead[- ]?magnet|conversion[- ]?rate|funnel|brand[- ]?voice/, "Megaphone"],
  [/checklist|task[- ]?list|to-?do|project[- ]?plan|workflow|kanban|habit[- ]?tracker|productivity|pomodoro/, "ListChecks"],
  [/contact|business[- ]?card|vcard|profile[- ]?card|team[- ]?directory|people[- ]?list/, "Contact"],
  [/generator|generate|create|builder|maker|wizard|prompt[- ]?improv|idea[- ]?generator/, "Wand2"],
];

const CATEGORY_POOLS: Record<string, readonly string[]> = {
  accessibility: ["Accessibility", "Contrast", "Eye", "Keyboard", "ScanEye", "Type"],
  ai: ["Sparkles", "Wand2", "Brain", "MessageSquare", "Lightbulb", "Workflow"],
  audio: ["AudioWaveform", "AudioLines", "Headphones", "Music", "Mic", "SlidersHorizontal"],
  business: ["BriefcaseBusiness", "Wallet", "ChartNoAxesCombined", "ReceiptText", "Presentation", "Users"],
  calculators: ["Sigma", "Calculator", "Shapes", "Percent", "Gauge", "ChartNoAxesCombined", "Ruler", "Atom"],
  career: ["BriefcaseBusiness", "Contact", "FileUser", "GraduationCap", "Trophy", "ClipboardList"],
  celebrations: ["PartyPopper", "Gift", "CakeSlice", "Heart", "Sparkles", "Ticket"],
  communication: ["MessagesSquare", "Mail", "Phone", "MessageCircle", "AtSign", "Contact"],
  creators: ["Clapperboard", "Music", "Video", "Mic", "Camera", "Wand2"],
  datetime: ["CalendarClock", "Timer", "Clock3", "CalendarDays", "AlarmClock"],
  design: ["Palette", "Paintbrush", "Pipette", "Layers", "Shapes", "SwatchBook"],
  developer: ["Code2", "Terminal", "Braces", "FileCode", "Database", "GitBranch", "Network"],
  ecommerce: ["ShoppingCart", "Package", "Store", "Tags", "ReceiptText", "CreditCard"],
  education: ["GraduationCap", "BookOpen", "BookText", "Sigma", "ClipboardList", "Lightbulb"],
  events: ["CalendarDays", "Ticket", "PartyPopper", "Users", "MapPin"],
  files: ["FolderOpen", "FileText", "Files", "FileCheck", "FileArchive", "FilePlus2"],
  fitness: ["Dumbbell", "HeartPulse", "Activity", "Footprints", "Timer"],
  food: ["Utensils", "ChefHat", "CookingPot", "Coffee", "Pizza"],
  gaming: ["Gamepad2", "Dices", "Puzzle", "Trophy", "Joystick"],
  generators: ["Wand2", "Sparkles", "PencilLine", "Lightbulb", "Workflow"],
  image: ["Image", "Images", "Camera", "Crop", "Scan", "Focus"],
  interactive: ["MousePointerClick", "Puzzle", "Shapes", "Sparkles", "Workflow"],
  marketing: ["Megaphone", "ChartNoAxesCombined", "Target", "MousePointerClick", "Mail"],
  mockups: ["AppWindow", "Smartphone", "MessageSquare", "PanelTop", "Monitor", "Layers"],
  pdf: ["FileText", "Files", "FileCheck", "FileArchive", "FilePlus2"],
  personal: ["UserRound", "CalendarDays", "Heart", "Wallet", "ListChecks", "NotebookPen"],
  photography: ["Camera", "Aperture", "Focus", "Crop", "Image"],
  productivity: ["Timer", "ListChecks", "CalendarClock", "ClipboardCheck"],
  qr: ["QrCode", "Barcode", "Scan"],
  random: ["Dices", "Shuffle", "Sparkles", "CircleHelp", "Dice5"],
  relationships: ["Heart", "HeartHandshake", "MessagesSquare", "Gift"],
  screenshots: ["Smartphone", "Monitor", "AppWindow", "Image", "Crop"],
  security: ["ShieldCheck", "Fingerprint", "KeyRound", "LockKeyhole"],
  seo: ["Search", "Globe", "ChartNoAxesCombined", "Link2", "FileText"],
  social: ["Share2", "MessageCircle", "Users", "AtSign", "Hash"],
  streaming: ["Radio", "Video", "Headphones", "Mic", "Clapperboard"],
  testdata: ["Database", "Braces", "Users", "FileSpreadsheet"],
  text: ["Type", "CaseSensitive", "SpellCheck", "Languages", "AlignLeft"],
  travel: ["Plane", "MapPin", "Compass", "Luggage", "Map", "Route"],
  converters: ["ArrowLeftRight", "Ruler", "Scale", "Gauge", "Thermometer", "Droplets"],
  video: ["Video", "Film", "Clapperboard", "Captions", "Subtitles", "Frame"],
  webdesign: ["PanelsTopLeft", "Monitor", "LayoutGrid", "Layers", "Code2", "Palette"],
  network: ["Globe", "Network", "Wifi", "Router", "Server", "Cable"],
};

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const h = ((hue % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const [r1, g1, b1] = h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] : h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma] : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = l - chroma / 2;
  return `#${[r1, g1, b1].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function semanticIcon(tool: ToolMeta): string {
  const main = [tool.id, tool.slug, tool.name, tool.subcategory ?? "", ...tool.keywords, ...tool.tags].join(" ").toLowerCase();
  const full = [main, tool.description, tool.engine.type, JSON.stringify(tool.engine)].join(" ").toLowerCase();
  for (const [pattern, icon] of RULES) {
    if (pattern.test(main)) return icon;
  }
  // The engine can disclose the math domain even when a generated title is terse.
  for (const [pattern, icon] of RULES) {
    if (pattern.test(full)) return icon;
  }
  const category = tool.category.toLowerCase();
  const pool = CATEGORY_POOLS[category] ?? ["Wrench", "Sparkles", "CircleHelp"];
  const hash = hash32(tool.id || tool.slug || tool.name);
  return pool[hash % pool.length];
}

export function designToolIcon(tool: ToolMeta): DesignedToolIcon {
  const hash = hash32(tool.id || tool.slug || tool.name);
  // ID-specific hue means tools keep their own recognizable identity even when
  // they belong to the same functional family and use the same semantic glyph.
  const accentHash = hash32(`${tool.id || tool.slug || tool.name}:accent`);
  const hue = (hash / 0xffffffff) * 360;
  const accentHue = (accentHash / 0xffffffff) * 360;
  return {
    icon: semanticIcon(tool),
    iconBackground: hslToHex(hue, 74, 34),
    iconAccent: hslToHex(accentHue, 76, 43),
  };
}
