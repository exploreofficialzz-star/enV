import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg shadow-sm hover:opacity-90",
        outline:
          "bg-surface text-fg shadow-[var(--shadow-border)] hover:bg-surface-2",
        secondary: "bg-surface-2 text-fg hover:bg-border",
        ghost: "text-fg hover:bg-surface-2",
        danger: "bg-danger text-white hover:opacity-90",
      },
      size: {
        default: "h-11 rounded-md px-4",
        sm: "h-9 rounded-sm px-3 text-[13px]",
        lg: "h-12 rounded-lg px-5",
        icon: "size-11 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
