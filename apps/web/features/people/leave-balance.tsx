"use client";

import * as React from "react";
import { CalendarCheck } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { Section } from "@/components/shared/page";
import { Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type Balance = {
  leave_type: string;
  annual_days: number;
  entitled: number;
  taken: number;
  pending: number;
  remaining: number;
};

/**
 * What a leave request actually costs you.
 *
 * Submitting leave without a balance is a form with no arithmetic behind it.
 * Pending days are held against the total, because a day you have asked for is
 * a day you cannot also spend elsewhere.
 */
export function LeaveBalance({ userId }: { userId?: string }) {
  const t = useT();
  const balance = useItem<{ balances: Balance[]; total_remaining: number; year: number }>(
    "/hr/leave/balance",
    userId ? { user_id: userId } : undefined,
  );

  const rows = (balance.data?.balances ?? []).filter((row) => row.annual_days > 0);
  if (!rows.length) return null;

  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <CalendarCheck className="h-3.5 w-3.5 text-accent" />
          {t("hr.balance")}
          <span className="text-[11px] text-faint tnum">{balance.data?.year}</span>
        </span>
      }
    >
      <div className="space-y-3">
        {rows.map((row) => {
          const used = row.taken + row.pending;
          const ratio = row.entitled ? (used / row.entitled) * 100 : 0;
          return (
            <div key={row.leave_type}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-text">
                  {t(`leave.${row.leave_type}`) === `leave.${row.leave_type}`
                    ? row.leave_type
                    : t(`leave.${row.leave_type}`)}
                </span>
                <span
                  className={cn(
                    "text-[15px] font-semibold tnum",
                    row.remaining <= 0 ? "text-danger" : "text-text",
                  )}
                >
                  {row.remaining}
                  <span className="ms-1 text-[11px] font-normal text-faint">
                    / {row.entitled}
                  </span>
                </span>
              </div>
              <Progress
                value={ratio}
                className="mt-1.5"
                tone={ratio >= 100 ? "var(--danger)" : undefined}
              />
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                <span>
                  {t("hr.taken")} <span className="tnum text-text">{row.taken}</span>
                </span>
                {row.pending ? (
                  <span className="text-warning">
                    {t("hr.pending")} <span className="tnum">{row.pending}</span>
                  </span>
                ) : null}
                <span className="ms-auto">
                  {t("hr.remaining")} <span className="tnum text-text">{row.remaining}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
