import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-11 w-full appearance-none rounded-md bg-surface bg-[length:12px] bg-[right_12px_center] bg-no-repeat px-3 pr-9 text-sm text-fg shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50",
      className,
    )}
    style={{
      backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%235c636c' stroke-width='1.6' stroke-linecap='round'><path d='M2.5 4.5 6 8l3.5-3.5'/></svg>")`,
    }}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
