export function clsx(...a: any[]) { return a.flat(Infinity).filter(Boolean).map((x: any) => (typeof x === "object" ? Object.entries(x).filter(([, v]) => v).map(([k]) => k).join(" ") : x)).join(" "); }
export function twMerge(...a: any[]) { return a.filter(Boolean).join(" "); }
export function cva(base: string, cfg?: any) { return (o: any = {}) => [base, o.className].filter(Boolean).join(" "); }
export const Slot = (p: any) => p.children;
