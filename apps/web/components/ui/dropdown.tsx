"use client";

import * as React from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dropdown = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;

export const DropdownContent = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-elevated p-1 shadow-xl",
        "data-[state=open]:animate-fade",
        className,
      )}
      {...props}
    />
  </DropdownPrimitive.Portal>
));
DropdownContent.displayName = "DropdownContent";

export const DropdownItem = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(
      "flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-[13px] outline-none transition-colors",
      "focus:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      destructive ? "text-danger focus:bg-danger/10" : "text-text",
      className,
    )}
    {...props}
  />
));
DropdownItem.displayName = "DropdownItem";

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownPrimitive.Label className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
      {children}
    </DropdownPrimitive.Label>
  );
}

export function DropdownSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-border" />;
}

export function DropdownCheckItem({
  checked,
  children,
  onSelect,
}: {
  checked?: boolean;
  children: React.ReactNode;
  onSelect?: (event: Event) => void;
}) {
  return (
    <DropdownItem onSelect={onSelect}>
      <span className="flex h-3.5 w-3.5 items-center justify-center">
        {checked ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
      </span>
      {children}
    </DropdownItem>
  );
}
