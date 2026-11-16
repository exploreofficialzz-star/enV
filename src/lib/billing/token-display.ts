/** Exact enV balance display: preserve the ledger's 0.001-token precision,
 * while making an empty balance explicit as 0.00 enV.
 */
export function formatEnVTokenBalance(tokens: number, locale?: string): string {
  if (!Number.isFinite(tokens) || tokens < 0) return "0.00";
  return new Intl.NumberFormat(locale ?? "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
    useGrouping: true,
  }).format(tokens);
}
