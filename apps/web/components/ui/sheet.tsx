"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

/** Contextual side panel used for entity details across the product. */
export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: "end" | "start";
    width?: string;
  }
>(({ className, children, side = "end", width = "max-w-xl", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-fade" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-y-0 z-50 flex w-full flex-col border-border bg-surface shadow-2xl",
        side === "end" ? "end-0 border-s" : "start-0 border-e",
        width,
        "data-[state=open]:animate-in-up",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute end-4 top-4 z-10 rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-text">
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

export function SheetTitle({ children }: { children: React.ReactNode }) {
  return (
    <DialogPrimitive.Title className="text-[15px] font-semibold tracking-tight">
      {children}
    </DialogPrimitive.Title>
  );
}

export function SheetDescription({ children }: { children?: React.ReactNode }) {
  return (
    <DialogPrimitive.Description className={children ? "text-xs text-muted" : "sr-only"}>
      {children ?? "Details"}
    </DialogPrimitive.Description>
  );
}
