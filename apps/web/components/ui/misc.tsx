"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { ArrowDownRight, ArrowUpRight, Check } from "lucide-react";
import { useI18n, useT } from "@/lib/i18n";
import { cn, formatDate, humanize, initials, relativeTime, STATUS_TONES } from "@/lib/utils";

/* ------------------------------------------------------------------ avatar */
export function Avatar({
  name,
  color,
  size = 24,
  className,
}: {
  name?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: color ?? "var(--accent-solid)",
        fontSize: Math.max(9, Math.round(size * 0.4)),
      }}
      title={name ?? undefined}
    >
      <AvatarPrimitive.Fallback>{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function AvatarGroup({
  people,
  max = 4,
  size = 22,
}: {
  people: { full_name: string; avatar_color?: string | null }[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5 rtl:space-x-reverse">
      {shown.map((person, index) => (
        <Avatar
          key={index}
          name={person.full_name}
          color={person.avatar_color}
          size={size}
          className="ring-2 ring-surface"
        />
      ))}
      {rest > 0 ? (
        <span
          className="inline-flex items-center justify-center rounded-full bg-surface-2 text-[10px] text-muted ring-2 ring-surface"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ badges */
export function Badge({
  children,
  className,
  tone,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        tone ? STATUS_TONES[tone] ?? "border-border bg-surface-2 text-muted" : "border-border bg-surface-2 text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  const t = useT();
  if (!status) return null;
  // Translated when the locale has a name for this state, humanised otherwise,
  // so a new status never renders as a missing key.
  const key = `status.${status}`;
  const label = t(key);
  return (
    <Badge tone={status} className={className}>
      {label === key ? humanize(status) : label}
    </Badge>
  );
}

/**
 * Movement against a previous period. The arrow carries the direction so the
 * pill never depends on colour alone; `invert` is for measures where down is
 * the good news (expenses, cycle time).
 */
export function DeltaPill({
  value,
  invert,
  suffix = "%",
  className,
}: {
  value: number;
  invert?: boolean;
  suffix?: string;
  className?: string;
}) {
  if (!Number.isFinite(value)) return null;
  const up = value >= 0;
  const good = invert ? !up : up;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-4 tnum",
        good
          ? "bg-[color-mix(in_oklab,var(--positive)_14%,transparent)] text-positive"
          : "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger",
        className,
      )}
    >
      <Arrow className="h-3 w-3" />
      {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

/** The recurring accent mark: a rounded-square tile holding one icon. */
export function Tile({
  icon: Icon,
  size = 32,
  soft,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  size?: number;
  soft?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(soft ? "tile-soft" : "tile", "shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <Icon className={size >= 30 ? "h-[15px] w-[15px]" : "h-3.5 w-3.5"} />
    </span>
  );
}

/* ---------------------------------------------------------------- progress */
export function Progress({
  value,
  className,
  tone,
}: {
  value: number;
  className?: string;
  tone?: string;
}) {
  // Callers pass raw ratios (an over-budget project, a negative metric delta),
  // so clamp here rather than at every call site.
  const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <ProgressPrimitive.Root
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
      value={clamped}
    >
      <ProgressPrimitive.Indicator
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${clamped}%`,
          background:
            tone ??
            "linear-gradient(90deg, var(--accent-solid), var(--accent-hot))",
        }}
      />
    </ProgressPrimitive.Root>
  );
}

/* -------------------------------------------------------------------- tabs */
export const Tabs = TabsPrimitive.Root;

export function TabsList({
  children,
  className,
  variant = "underline",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "underline" | "pill";
}) {
  return (
    <TabsPrimitive.List
      className={cn(
        variant === "pill"
          ? "no-scrollbar inline-flex items-center gap-1 overflow-x-auto rounded-full border border-border bg-surface-2 p-1"
          : "no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-border",
        className,
      )}
      data-variant={variant}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({
  value,
  children,
  count,
  variant = "underline",
}: {
  value: string;
  children: React.ReactNode;
  count?: number;
  variant?: "underline" | "pill";
}) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        variant === "pill"
          ? "whitespace-nowrap rounded-full px-3 py-1 text-[12px] text-muted transition-colors hover:text-text data-[state=active]:bg-elevated data-[state=active]:text-text data-[state=active]:shadow-[var(--shadow-panel)]"
          : "relative -mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-[13px] text-muted transition-colors hover:text-text data-[state=active]:border-accent data-[state=active]:text-text",
      )}
    >
      {children}
      {count !== undefined ? (
        <span className="ms-1.5 rounded bg-surface-2 px-1 text-[10px] text-muted">{count}</span>
      ) : null}
    </TabsPrimitive.Trigger>
  );
}

export const TabsContent = TabsPrimitive.Content;

/* ----------------------------------------------------------------- tooltip */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={250}>{children}</TooltipPrimitive.Provider>;
}

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-md border border-border bg-elevated px-2 py-1 text-[11px] text-text shadow-lg"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ------------------------------------------------------------ form widgets */
export function Switch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative h-[18px] w-8 rounded-full bg-border-strong transition-colors data-[state=checked]:bg-accent-solid"
    >
      <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-[2px] rounded-full bg-white transition-transform data-[state=checked]:translate-x-[16px] rtl:data-[state=checked]:-translate-x-[16px]" />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(Boolean(value))}
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded border border-border-strong bg-surface-2",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent-solid",
        className,
      )}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="h-3 w-3 text-accent-fg" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/**
 * "2 hours ago", without the hydration mismatch.
 *
 * Relative time depends on `Date.now()`, which differs between the server
 * render and the client's, so React discards the tree whenever the two land on
 * opposite sides of a minute boundary. This renders the absolute date until
 * after mount, then swaps in the relative phrasing.
 */
export function TimeAgo({
  value,
  className,
  title,
}: {
  value?: string | Date | null;
  className?: string;
  title?: string;
}) {
  const { locale } = useI18n();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!value) return <span className={className}>—</span>;

  // Everything that formats a date is timezone-dependent, and the server runs
  // UTC while the browser does not — so even the absolute form can disagree
  // across a midnight boundary. The first render is therefore a plain slice of
  // the ISO string, which both sides produce identically.
  const iso = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return (
    <span
      className={className}
      title={title ?? (mounted ? formatDate(value, locale) : iso)}
      suppressHydrationWarning
    >
      {mounted ? relativeTime(value, locale) : iso}
    </span>
  );
}

/* --------------------------------------------------------------- feedback */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-surface-2", className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-14 text-center">
      {Icon ? (
        <div className="mb-1 rounded-lg border border-border bg-surface-2 p-2.5 text-muted">
          <Icon className="h-4 w-4" />
        </div>
      ) : null}
      <p className="text-[13px] font-medium text-text">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-2 px-1 py-0.5 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}
