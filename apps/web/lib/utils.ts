import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { currencyOf } from "@/lib/currency";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(value: string | number) {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function localizeNumber(value: string | number, locale: string) {
  return locale === "fa" ? toPersianDigits(value) : String(value);
}

export function formatNumber(value: number | null | undefined, locale = "en") {
  if (value === null || value === undefined) return "—";
  const formatted = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(value);
  return formatted;
}

export function formatCurrency(
  value: number | null | undefined,
  currency = "USD",
  locale = "en",
  compact = false,
) {
  if (value === null || value === undefined) return "—";
  const spec = currencyOf(currency);
  const intlLocale = locale === "fa" ? "fa-IR" : "en-US";
  const useCompact = compact && Math.abs(value) >= 100_000;
  const maximumFractionDigits = useCompact
    ? 1
    : compact || Math.abs(value) >= 1000
      ? 0
      : spec.decimals;

  // Intl only knows ISO codes, and Toman is not one — so anything non-ISO gets
  // the number formatted on its own and the symbol placed by hand.
  if (!spec.iso) {
    const amount = new Intl.NumberFormat(intlLocale, {
      maximumFractionDigits,
      notation: useCompact ? "compact" : "standard",
    }).format(value);
    const symbol = locale === "fa" ? spec.symbol_fa : spec.symbol_en;
    return spec.symbol_position === "after" ? `${amount} ${symbol}` : `${symbol}${amount}`;
  }

  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: spec.code,
    // Compact keeps one decimal so 1.2M and 1.0M do not both render as "1M".
    maximumFractionDigits,
    notation: useCompact ? "compact" : "standard",
  }).format(value);
}

export function formatDate(value?: string | Date | null, locale = "en", withTime = false) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function formatTime(value?: string | Date | null, locale = "en") {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(value?: string | Date | null, locale = "en") {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = date.getTime() - Date.now();
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000000],
    ["month", 2592000000],
    ["week", 604800000],
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
  ];
  const formatter = new Intl.RelativeTimeFormat(locale === "fa" ? "fa-IR" : "en", {
    numeric: "auto",
  });
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return formatter.format(Math.round(diff / ms), unit);
  }
  return formatter.format(Math.round(diff / 1000), "second");
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function isOverdue(date?: string | null) {
  if (!date) return false;
  const due = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/** Mirrors TASK_STATUSES in app/models/work.py. */
export const TASK_STATUSES = [
  "backlog", "todo", "in_progress", "in_review", "done", "cancelled",
] as const;

export const TASK_PRIORITIES = ["urgent", "high", "medium", "low"] as const;

export const STATUS_TONES: Record<string, string> = {
  // task / generic
  backlog: "text-muted bg-surface-2 border-border",
  todo: "text-info bg-[color-mix(in_oklab,var(--info)_14%,transparent)] border-[color-mix(in_oklab,var(--info)_30%,transparent)]",
  in_progress:
    "text-accent bg-accent-soft border-[color-mix(in_oklab,var(--accent)_35%,transparent)]",
  in_review:
    "text-warning bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] border-[color-mix(in_oklab,var(--warning)_30%,transparent)]",
  done: "text-positive bg-[color-mix(in_oklab,var(--positive)_14%,transparent)] border-[color-mix(in_oklab,var(--positive)_30%,transparent)]",
  cancelled: "text-faint bg-surface-2 border-border line-through",
  // project
  planning: "text-info bg-[color-mix(in_oklab,var(--info)_14%,transparent)] border-[color-mix(in_oklab,var(--info)_30%,transparent)]",
  active: "text-accent bg-accent-soft border-[color-mix(in_oklab,var(--accent)_35%,transparent)]",
  on_hold: "text-warning bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] border-[color-mix(in_oklab,var(--warning)_30%,transparent)]",
  completed: "text-positive bg-[color-mix(in_oklab,var(--positive)_14%,transparent)] border-[color-mix(in_oklab,var(--positive)_30%,transparent)]",
  // health
  on_track: "text-positive bg-[color-mix(in_oklab,var(--positive)_14%,transparent)] border-[color-mix(in_oklab,var(--positive)_30%,transparent)]",
  at_risk: "text-warning bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] border-[color-mix(in_oklab,var(--warning)_30%,transparent)]",
  off_track: "text-danger bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] border-[color-mix(in_oklab,var(--danger)_30%,transparent)]",
  // approvals / requests
  open: "text-info bg-[color-mix(in_oklab,var(--info)_14%,transparent)] border-[color-mix(in_oklab,var(--info)_30%,transparent)]",
  pending: "text-warning bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] border-[color-mix(in_oklab,var(--warning)_30%,transparent)]",
  approved: "text-positive bg-[color-mix(in_oklab,var(--positive)_14%,transparent)] border-[color-mix(in_oklab,var(--positive)_30%,transparent)]",
  rejected: "text-danger bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] border-[color-mix(in_oklab,var(--danger)_30%,transparent)]",
  paid: "text-positive bg-[color-mix(in_oklab,var(--positive)_14%,transparent)] border-[color-mix(in_oklab,var(--positive)_30%,transparent)]",
  overdue: "text-danger bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] border-[color-mix(in_oklab,var(--danger)_30%,transparent)]",
  sent: "text-info bg-[color-mix(in_oklab,var(--info)_14%,transparent)] border-[color-mix(in_oklab,var(--info)_30%,transparent)]",
  draft: "text-muted bg-surface-2 border-border",
  // experiments
  planned: "text-muted bg-surface-2 border-border",
  running: "text-accent bg-accent-soft border-[color-mix(in_oklab,var(--accent)_35%,transparent)]",
  failed: "text-danger bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] border-[color-mix(in_oklab,var(--danger)_30%,transparent)]",
  validated: "text-positive bg-[color-mix(in_oklab,var(--positive)_14%,transparent)] border-[color-mix(in_oklab,var(--positive)_30%,transparent)]",
  archived: "text-faint bg-surface-2 border-border",
};

export const PRIORITY_TONES: Record<string, string> = {
  low: "text-muted",
  medium: "text-info",
  high: "text-warning",
  urgent: "text-danger",
};

export function humanize(value?: string | null) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const CHART_DARK = [
  "#f5501b", "#2d88e2", "#61a746", "#b2468b",
  "#00a7b5", "#8b6000", "#946ad5", "#007f60",
];
const CHART_LIGHT = [
  "#d44212", "#0071cb", "#3e831f", "#a02286",
  "#009aad", "#8b6000", "#7a4aba", "#007759",
];

/**
 * Categorical series colours, assigned in fixed order and never cycled past 8.
 *
 * Both steppings are validated for the lightness band, chroma floor, adjacent
 * colour-vision separation and contrast against their own surface; the order
 * interleaves warm and cool and alternates lightness so neighbouring series
 * stay apart under deuteranopia as well as normal vision.
 */
export function chartPalette(theme?: string) {
  const light =
    theme === "light" ||
    (typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") === "light");
  return light ? CHART_LIGHT : CHART_DARK;
}
