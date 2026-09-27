export const CATEGORY_IDS = [
  "calculators",
  "converters",
  "developer",
  "text",
  "image",
  "design",
  "pdf",
  "files",
  "security",
  "fitness",
  "datetime",
  "creators",
  "business",
  "random",
  "seo",
  "qr",
  "network",
  "ai",
  "education",
  "productivity",
  "generators",
  "testdata",
  "social",
  "video",
  "audio",
  "mockups",
  "screenshots",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export type ToolStatus = "active" | "beta" | "planned";

export type DisclaimerKind =
  | "health"
  | "finance"
  | "earnings"
  | "mockup"
  | "estimate";

export type EngineRef =
  | { type: "calculator"; formula: string }
  | { type: "converter"; system: string }
  | { type: "text"; op: string }
  | { type: "generator"; op: string }
  | { type: "codec"; op: string }
  | { type: "color"; op: string }
  | { type: "qr"; preset: string }
  | { type: "barcode"; format: string }
  | { type: "image"; op: string }
  | { type: "cssgen"; op: string }
  | { type: "mockup"; variant: string }
  | { type: "post"; variant: string }
  | { type: "device"; variant: string }
  | { type: "datetime"; op: string }
  | { type: "seo"; op: string }
  | { type: "document"; op: string }
  | { type: "pdf"; op: string }
  | { type: "ai"; op: string }
  | { type: "custom"; id: string };

export interface ToolMeta {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: CategoryId;
  subcategory?: string;
  keywords: string[];
  tags: string[];
  icon: string;
  popularity: number;
  featured: boolean;
  clientSide: boolean;
  requiresBackend: boolean;
  requiresAuth: boolean;
  status: ToolStatus;
  related: string[];
  engine: EngineRef;
  formulaNote?: string;
  disclaimer?: DisclaimerKind;
  isNew?: boolean;
}

export interface CategoryMeta {
  id: CategoryId;
  name: string;
  description: string;
  blurb: string;
  icon: string;
}
