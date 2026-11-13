import { TOKEN_SUBUNITS_PER_TOKEN } from "../billing/catalog";
import { getToolBillingProfile } from "../billing/tool-profiles.server";
import { getToolById } from "../registry";
import { isAdsterraQualifiedTool } from "./policy";
import { resolveAdFallbackUnitSubunits } from "./fallback";

export function getAdFallbackQuote(toolId: string) {
  if (!toolId || toolId.length > 160 || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(toolId)) return null;
  const tool = getToolById(toolId);
  if (!tool || !isAdsterraQualifiedTool(tool)) return null;
  const profile = getToolBillingProfile(toolId);
  const unitSubunits = resolveAdFallbackUnitSubunits(tool, profile);
  if (unitSubunits === null || !profile) return null;
  return {
    toolId,
    billingKey: profile.billingKey,
    unitSubunits,
    unitTokens: unitSubunits / TOKEN_SUBUNITS_PER_TOKEN,
    unitLabel: profile.unitLabel,
  };
}
