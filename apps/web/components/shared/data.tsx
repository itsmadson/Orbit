"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  width?: string;
  align?: "start" | "end" | "center";
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  onRowClick,
  rowHref,
  empty,
  compact,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  empty?: React.ReactNode;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-1.5 p-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (!rows.length) return <div className="p-4">{empty}</div>;

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-faint">
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "whitespace-nowrap px-3 py-2 font-medium",
                  column.align === "end" ? "text-end" : column.align === "center" ? "text-center" : "text-start",
                )}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const cells = columns.map((column) => (
              <td
                key={column.key}
                className={cn(
                  compact ? "px-3 py-1.5" : "px-3 py-2.5",
                  column.align === "end" ? "text-end" : column.align === "center" ? "text-center" : "text-start",
                  column.className,
                )}
              >
                {column.cell(row)}
              </td>
            ));
            const className = cn(
              "border-b border-border/60 transition-colors last:border-0",
              (onRowClick || rowHref) && "cursor-pointer hover:bg-surface-2",
            );
            if (rowHref) {
              return (
                <tr key={row.id} className={className}>
                  {columns.map((column, index) => (
                    <td
                      key={column.key}
                      className={cn(
                        "p-0",
                        column.align === "end" ? "text-end" : column.align === "center" ? "text-center" : "text-start",
                      )}
                    >
                      <Link
                        href={rowHref(row)}
                        className={cn(
                          "block h-full w-full",
                          compact ? "px-3 py-1.5" : "px-3 py-2.5",
                          column.className,
                        )}
                      >
                        {column.cell(row)}
                      </Link>
                    </td>
                  ))}
                </tr>
              );
            }
            return (
              <tr key={row.id} className={className} onClick={() => onRowClick?.(row)}>
                {cells}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t("action.search")}
        className="ps-8 pe-7"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute end-2 top-1/2 -translate-y-1/2 text-faint transition-colors hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-2", className)}>{children}</div>
  );
}

export function FilterChips({
  options,
  value,
  onChange,
  allowAll = true,
}: {
  options: { value: string; label: string; count?: number }[];
  value?: string;
  onChange: (value: string | undefined) => void;
  allowAll?: boolean;
}) {
  const t = useT();
  const items = allowAll ? [{ value: "", label: t("common.all") }, ...options] : options;
  return (
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
      {items.map((option) => {
        const active = (value ?? "") === option.value;
        return (
          <button
            key={option.value || "all"}
            type="button"
            onClick={() => onChange(option.value || undefined)}
            className={cn(
              "whitespace-nowrap rounded-md border px-2 py-1 text-[12px] transition-colors",
              active
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-border bg-surface-2 text-muted hover:text-text",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="ms-1 text-[10px] opacity-70">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useT();
  if (pages <= 1) {
    return (
      <div className="px-3 py-2 text-[11px] text-faint">
        {total} {t("common.results")}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[12px] text-muted">
      <span>
        {total} {t("common.results")}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <span className="px-1">
          {t("common.page")} {page} / {pages}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-[13px]">
      <p className="font-medium text-danger">{t("common.error")}</p>
      <p className="mt-1 text-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}
