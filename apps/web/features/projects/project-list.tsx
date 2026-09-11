"use client";

import * as React from "react";
import Link from "next/link";
import { FolderKanban, LayoutGrid, List, Plus } from "lucide-react";
import { useI18n, useT } from "@/lib/i18n";
import { useCreateParam, useDebounced, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { ProjectSummary } from "@/lib/types";
import { PageHeader } from "@/components/shared/page";
import { Column, DataTable, ErrorState, FilterChips, Pagination, SearchInput, Toolbar } from "@/components/shared/data";
import { Avatar, EmptyState, Progress, Skeleton, StatusBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ProjectDialog } from "@/features/projects/project-form";
import { cn, formatCurrency, formatDate, humanize } from "@/lib/utils";

export function ProjectListView() {
  const t = useT();
  const { locale } = useI18n();
  const { can, company } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string | undefined>();
  const [mine, setMine] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const search = useDebounced(query);

  const { data, isLoading, error, refetch } = useList<ProjectSummary>("/projects", {
    q: search,
    status,
    mine: mine || undefined,
    page,
    page_size: view === "grid" ? 24 : 50,
  });

  const columns: Column<ProjectSummary>[] = [
    {
      key: "name",
      header: t("common.name"),
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span>{row.icon}</span>
          <span className="font-medium">{row.name}</span>
          <span className="font-mono text-[11px] text-faint">{row.key}</span>
        </div>
      ),
    },
    { key: "status", header: t("common.status"), cell: (row) => <StatusBadge status={row.status} /> },
    { key: "health", header: t("projects.health"), cell: (row) => <StatusBadge status={row.health} /> },
    {
      key: "lead",
      header: t("projects.lead"),
      cell: (row) =>
        row.lead ? (
          <span className="flex items-center gap-1.5">
            <Avatar name={row.lead.full_name} color={row.lead.avatar_color} size={18} />
            <span className="truncate">{row.lead.full_name}</span>
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "progress",
      header: t("common.progress"),
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Progress value={row.progress} className="w-20" />
          <span className="text-[11px] text-muted">{row.progress}%</span>
        </div>
      ),
    },
    {
      key: "tasks",
      header: t("nav.tasks"),
      align: "end",
      cell: (row) => (
        <span className="text-[12px] text-muted">
          {row.total_tasks - row.open_tasks}/{row.total_tasks}
          {row.overdue_tasks ? <span className="ms-1 text-danger">·{row.overdue_tasks}</span> : null}
        </span>
      ),
    },
    {
      key: "end",
      header: t("common.dueDate"),
      align: "end",
      cell: (row) => <span className="text-[12px] text-muted">{formatDate(row.end_date, locale)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("projects.title")}
        subtitle={data ? `${data.total} ${t("common.results")}` : undefined}
        actions={
          can("projects.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("projects.new")}
            </Button>
          ) : null
        }
      />

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} className="w-64" />
        <FilterChips
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={["active", "planning", "on_hold", "completed"].map((value) => ({
            value,
            label: humanize(value),
          }))}
        />
        <button
          type="button"
          onClick={() => setMine(!mine)}
          className={cn(
            "rounded-md border px-2 py-1 text-[12px] transition-colors",
            mine ? "border-accent/40 bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted",
          )}
        >
          {t("common.mine")}
        </button>
        <div className="ms-auto flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={cn("rounded p-1.5", view === "grid" ? "bg-elevated text-text" : "text-muted")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn("rounded p-1.5", view === "list" ? "bg-elevated text-text" : "text-muted")}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </Toolbar>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : view === "list" ? (
        <div className="panel overflow-hidden">
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            loading={isLoading}
            rowHref={(row) => `/projects/${row.id}`}
            empty={<EmptyState icon={FolderKanban} title={t("common.empty")} />}
          />
          {data ? (
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          ) : null}
        </div>
      ) : isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={FolderKanban}
          title={t("common.empty")}
          description="Create your first project to connect tasks, documents, meetings and spend."
          action={
            can("projects.write") ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                {t("projects.new")}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="panel group relative overflow-hidden p-4 transition-all hover:-translate-y-px hover:border-border-strong"
            >
              <span
                className="absolute inset-x-0 top-0 h-0.5 opacity-70"
                style={{ background: project.color }}
              />
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-[18px]">{project.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium tracking-tight">{project.name}</p>
                    <p className="font-mono text-[11px] text-faint">{project.key}</p>
                  </div>
                </div>
                <StatusBadge status={project.status} />
              </div>
              {project.description ? (
                <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-muted">
                  {project.description}
                </p>
              ) : null}
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                  <span>{t("common.progress")}</span>
                  <span>{project.progress}%</span>
                </div>
                <Progress value={project.progress} tone={project.color} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted">
                <span className="flex items-center gap-2">
                  {project.lead ? (
                    <Avatar name={project.lead.full_name} color={project.lead.avatar_color} size={18} />
                  ) : null}
                  <span>
                    {project.total_tasks - project.open_tasks}/{project.total_tasks} {t("nav.tasks").toLowerCase()}
                  </span>
                  {project.overdue_tasks ? (
                    <span className="text-danger">{project.overdue_tasks} {t("common.overdue").toLowerCase()}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={project.health} />
                </span>
              </div>
              {project.budget ? (
                <p className="mt-2 text-[11px] text-faint">
                  {formatCurrency(project.spent, company.currency, locale, true)} /{" "}
                  {formatCurrency(project.budget, company.currency, locale, true)}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}

      <ProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
