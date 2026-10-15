import type { ToolMeta } from "@/types/tool";

export type BusinessStudioId = "document" | "finance" | "naming" | "ops";
export type BusinessStudioRoute = { studio: BusinessStudioId; studioTitle: string; mode: string; href: string };

export const BUSINESS_STUDIO_ENTRY_ANCHORS: Record<BusinessStudioId, string> = {
  document: "invoice-generator",
  finance: "break-even-estimator",
  naming: "business-name-generator",
  ops: "meeting-agenda-generator",
};

export const BUSINESS_STUDIO_DEFAULT_MODES: Record<BusinessStudioId, string> = {
  document: "invoice",
  finance: "break-even",
  naming: "business-name",
  ops: "meeting-agenda",
};

const TITLES: Record<BusinessStudioId, string> = {
  document: "Document Studio",
  finance: "Finance Metrics Studio",
  naming: "Naming Studio",
  ops: "Ops Studio",
};

const OPERATIONS: Record<BusinessStudioId, ReadonlySet<string>> = {
  document: new Set(["invoice", "receipt", "quotation", "estimate", "purchase-order"]),
  finance: new Set(["roi", "break-even", "commission", "pricing", "markup", "cash-flow", "salary", "customer-lifetime-value", "customer-acquisition-cost", "recurring-revenue", "expense", "inventory", "discount", "margin", "profit"]),
  naming: new Set(["business-name", "company-name", "brand-name", "product-name", "slogan", "sku"]),
  ops: new Set(["agenda", "minutes", "meeting-agenda", "meeting-minutes", "email-signature", "payslip"]),
};

function operationFor(tool: ToolMeta): string {
  const engine = tool.engine as { type?: string; op?: string; id?: string };
  return engine.op ?? engine.id ?? tool.id.replace(/-(calculator|generator|template|estimator|planner)$/, "");
}

export function businessStudioForOperation(operation: string): BusinessStudioId | undefined {
  return (Object.keys(OPERATIONS) as BusinessStudioId[]).find((studio) => OPERATIONS[studio].has(operation));
}

/** Map every legacy Business URL to one Studio and its exact engine mode. */
export function businessStudioRouteForTool(tool: ToolMeta): BusinessStudioRoute | undefined {
  if (tool.category !== "business") return undefined;
  const mode = operationFor(tool);
  const studio = businessStudioForOperation(mode);
  if (!studio) return undefined;
  return {
    studio,
    studioTitle: TITLES[studio],
    mode,
    href: `/tools/business/${studio}-studio?mode=${encodeURIComponent(mode)}`,
  };
}

export function businessStudioAnchorSlug(studioSlug: string): string | undefined {
  const studio = ({ "document-studio": "document", "finance-studio": "finance", "naming-studio": "naming", "ops-studio": "ops" } as Record<string, BusinessStudioId>)[studioSlug];
  return studio ? BUSINESS_STUDIO_ENTRY_ANCHORS[studio] : undefined;
}

export function businessStudioDefaultMode(studioSlug: string): string | undefined {
  const studio = ({ "document-studio": "document", "finance-studio": "finance", "naming-studio": "naming", "ops-studio": "ops" } as Record<string, BusinessStudioId>)[studioSlug];
  return studio ? BUSINESS_STUDIO_DEFAULT_MODES[studio] : undefined;
}

export function businessStudioModeAllowed(studioSlug: string, mode: string): boolean {
  const studio = ({ "document-studio": "document", "finance-studio": "finance", "naming-studio": "naming", "ops-studio": "ops" } as Record<string, BusinessStudioId>)[studioSlug];
  return !!studio && OPERATIONS[studio].has(mode);
}
