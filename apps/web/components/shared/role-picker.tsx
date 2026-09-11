"use client";

import * as React from "react";
import { Check, ShieldAlert } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { cn, humanize } from "@/lib/utils";

export type RoleInfo = {
  key: string;
  label: string;
  summary: string;
  caution: string;
  permission_count: number;
  can_write_count: number;
  capabilities: { domain: string; level: "read" | "write" | "manage" }[];
};

const LEVEL_TONE: Record<string, string> = {
  manage: "border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-accent-soft text-accent",
  write: "border-border-strong bg-surface-2 text-text",
  read: "border-border bg-surface-2 text-muted",
};

/**
 * Choosing a role is choosing what somebody can see and change, so the choice
 * shows its own consequence: what the role grants, and where it can write.
 * The roles offered are the ones the signed-in account may actually hand out —
 * the server caps assignment at the assigner's own seniority.
 */
export function RolePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const roles = useItem<{ items: RoleInfo[]; assignable: string[] }>("/users/roles");
  const items = roles.data?.items ?? [];
  const assignable = new Set(roles.data?.assignable ?? []);

  return (
    <div className="space-y-2">
      <div className="grid gap-1.5 sm:grid-cols-2">
        {items.map((role) => {
          const allowed = assignable.has(role.key);
          const active = value === role.key;
          return (
            <button
              key={role.key}
              type="button"
              disabled={disabled || !allowed}
              onClick={() => onChange(role.key)}
              title={allowed ? undefined : t("people.roleNotAssignable")}
              className={cn(
                "rounded-xl border p-2.5 text-start transition-colors",
                active
                  ? "border-accent/45 bg-accent-soft"
                  : "border-border bg-surface-2 hover:border-border-strong",
                !allowed && "cursor-not-allowed opacity-45",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "text-[13px] font-medium",
                    active ? "text-accent" : "text-text",
                  )}
                >
                  {role.label}
                </span>
                {active ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
                {role.caution ? (
                  <ShieldAlert className="ms-auto h-3.5 w-3.5 text-warning" />
                ) : null}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">{role.summary}</p>
            </button>
          );
        })}
      </div>

      {/* What the selection actually grants, spelled out. */}
      <RoleSummary role={items.find((r) => r.key === value)} />
    </div>
  );
}

export function RoleSummary({ role }: { role?: RoleInfo }) {
  const t = useT();
  if (!role) return null;
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted">
          {t("people.roleGrants")}
        </span>
        <span className="text-[11px] text-faint tnum">
          {role.permission_count} permissions · {role.can_write_count} areas writable
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {role.capabilities.map((capability) => (
          <span
            key={capability.domain}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] leading-4",
              LEVEL_TONE[capability.level],
            )}
          >
            {humanize(capability.domain)}
            <span className="ms-1 opacity-60">{capability.level}</span>
          </span>
        ))}
        {!role.capabilities.length ? (
          <span className="text-[11px] text-faint">{t("common.empty")}</span>
        ) : null}
      </div>

      {role.caution ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-warning">
          <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          {role.caution}
        </p>
      ) : null}
    </div>
  );
}
