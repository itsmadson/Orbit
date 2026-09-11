"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-all duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:active:translate-y-0 select-none",
  {
    variants: {
      variant: {
        // Solid vermillion deep enough to carry white label text at 4.7:1.
        primary:
          "bg-accent-solid text-accent-fg shadow-[var(--shadow-accent)] hover:bg-accent active:bg-accent-solid",
        secondary:
          "bg-surface-2 text-text border border-border hover:bg-elevated hover:border-border-strong",
        ghost: "text-muted hover:text-text hover:bg-surface-2",
        outline: "border border-border text-text hover:bg-surface-2 hover:border-border-strong",
        danger: "bg-danger text-[#1a0308] hover:brightness-110",
        subtle:
          "bg-accent-soft text-accent border border-[color-mix(in_oklab,var(--accent)_22%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent)_24%,transparent)]",
      },
      size: {
        xs: "h-6 px-2 text-[11px] rounded-sm",
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-[13px]",
        lg: "h-10 px-4 text-sm",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7 rounded-sm",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
