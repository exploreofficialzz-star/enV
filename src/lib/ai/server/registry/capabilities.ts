/**
 * SERVER ONLY. The capability registry view: which models can do each capability, and which of
 * them could be used right now (configured provider, adapter present, not disabled).
 *
 * Capabilities themselves are the typed list in types.ts; this is the derived, per-deployment map.
 * It ignores cost, privacy and health, which the router applies per task.
 */
import type { Capability, ModelRecord, ProviderId, ProviderAdapterMap } from "../../types.ts";
import { CAPABILITIES, providerAdapters } from "../../types.ts";
import type { AiConfig } from "../config.ts";
import { isProviderConfigured } from "../config.ts";
import { modelKey } from "./models.ts";

export interface CapabilityRow {
  capability: Capability;
  /** Every registered model that declares the capability. */
  models: string[];
  /** Providers behind those models. */
  providers: ProviderId[];
  /** The subset usable on this deployment right now. */
  usableNow: string[];
}

export function capabilityMatrix(models: readonly ModelRecord[], config: AiConfig, adapters: ProviderAdapterMap): CapabilityRow[] {
  return CAPABILITIES.map((capability) => {
    const capable = models.filter((m) => m.provider !== "mock" && m.capabilities.includes(capability));
    const usable = models.filter((m) => {
      if (!m.capabilities.includes(capability) || !m.enabled || config.disabledModels.has(modelKey(m))) return false;
      if (!isProviderConfigured(config, m.provider)) return false;
      return providerAdapters(adapters[m.provider]).some((adapter) => adapter.isConfigured() && adapter.supports(capability, m.modelId));
    });
    return {
      capability,
      models: capable.map(modelKey),
      providers: [...new Set(capable.map((m) => m.provider))],
      usableNow: usable.map(modelKey),
    };
  });
}
