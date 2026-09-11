"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCheck, Inbox as InboxIcon } from "lucide-react";
import { api, type Page } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import type { Notification } from "@/lib/types";
import { PageHeader } from "@/components/shared/page";
import { ErrorState, Pagination, SearchInput } from "@/components/shared/data";
import { ENTITY_ICONS } from "@/components/shared/entity";
import { Avatar, EmptyState, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { cn, relativeTime } from "@/lib/utils";
import { useDebounced } from "@/lib/hooks";

const FILTERS = [
  { key: "all", labelKey: "common.all" },
  { key: "unread", labelKey: "inbox.unread" },
  { key: "mentions", labelKey: "inbox.mentions" },
  { key: "tasks", labelKey: "nav.tasks" },
  { key: "approvals", labelKey: "nav.approvals" },
  { key: "finance", labelKey: "nav.finance" },
  { key: "hr", labelKey: "nav.hr" },
  { key: "projects", labelKey: "nav.projects" },
  { key: "system", labelKey: "common.all" },
];

export function InboxView() {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const [filter, setFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const search = useDebounced(query);

  const counts = useQuery({
    queryKey: ["inbox-counts"],
    queryFn: () => api.get<Record<string, number>>("/notifications/counts"),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["notifications", filter, search, page],
    queryFn: () =>
      api.get<Page<Notification>>("/notifications", { filter, q: search, page, page_size: 25 }),
  });

  const invalidate = () => {
    client.invalidateQueries({ queryKey: ["notifications"] });
    client.invalidateQueries({ queryKey: ["inbox-counts"] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/archive`),
    onSuccess: invalidate,
  });

  return (
    <div>
      <PageHeader
        title={t("inbox.title")}
        subtitle={t("inbox.subtitle")}
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} className="w-56" />
            <Button variant="secondary" size="md" onClick={() => markAll.mutate()} loading={markAll.isPending}>
              <CheckCheck className="h-3.5 w-3.5" />
              {t("action.markAllRead")}
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1">
        {FILTERS.filter((item, index) => index !== 8).map((item) => {
          const count = counts.data?.[item.key] ?? 0;
          const active = filter === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setFilter(item.key);
                setPage(1);
              }}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[12px] transition-colors",
                active
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-border bg-surface-2 text-muted hover:text-text",
              )}
            >
              {t(item.labelKey)}
              {count ? <span className="ms-1.5 text-[10px] opacity-70">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="panel overflow-hidden">
        {error ? (
          <div className="p-4">
            <ErrorState error={error} onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <div className="p-4">
            <EmptyState icon={InboxIcon} title={t("inbox.empty")} />
          </div>
        ) : (
          <ul>
            {data.items.map((item) => {
              const Icon = ENTITY_ICONS[item.entity_type ?? ""] ?? InboxIcon;
              const unread = !item.read_at;
              return (
                <li
                  key={item.id}
                  className={cn(
                    "group relative border-b border-border/60 last:border-0",
                    unread && "bg-accent-soft/40",
                  )}
                >
                  <Link
                    href={item.url ?? "#"}
                    onClick={() => unread && markRead.mutate(item.id)}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="relative mt-0.5">
                      {item.actor ? (
                        <Avatar name={item.actor.full_name} color={item.actor.avatar_color} size={28} />
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-faint">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {unread ? (
                        <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[13px] leading-snug", unread ? "font-medium" : "text-muted")}>
                        {item.title}
                      </p>
                      {item.body ? (
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{item.body}</p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-faint">
                        {item.category} · {relativeTime(item.created_at, locale)}
                      </p>
                    </div>
                    {item.priority === "high" ? (
                      <span className="mt-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warning">
                        priority
                      </span>
                    ) : null}
                  </Link>
                  <button
                    type="button"
                    onClick={() => archive.mutate(item.id)}
                    className="absolute end-3 top-1/2 hidden -translate-y-1/2 rounded p-1.5 text-faint transition-colors hover:bg-surface hover:text-text group-hover:block"
                    title="Archive"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {data ? (
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        ) : null}
      </div>
    </div>
  );
}
