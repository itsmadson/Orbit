"use client";

import * as React from "react";
import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { useI18n, useT } from "@/lib/i18n";
import type { Task } from "@/lib/types";
import { Column, DataTable, Pagination } from "@/components/shared/data";
import { Avatar, Checkbox, EmptyState, StatusBadge } from "@/components/ui/misc";
import { BulkBar } from "@/features/tasks/bulk-bar";
import { TYPE_COLORS, TYPE_ICONS } from "@/features/tasks/task-card";
import { cn, formatDate, isOverdue } from "@/lib/utils";
import type { Page } from "@/lib/api";

export function TaskTable({
  data,
  loading,
  onPage,
  hideProject,
  projectId,
  selectable = true,
}: {
  data?: Page<Task>;
  loading?: boolean;
  onPage?: (page: number) => void;
  hideProject?: boolean;
  projectId?: string;
  /** Off for read-only embeds, such as a project's task panel. */
  selectable?: boolean;
}) {
  const t = useT();
  const { locale } = useI18n();
  const [selected, setSelected] = React.useState<string[]>([]);

  const rows = data?.items ?? [];
  const allSelected = rows.length > 0 && selected.length === rows.length;

  // A page change should not leave a selection pointing at rows you can no
  // longer see.
  React.useEffect(() => {
    setSelected((current) => current.filter((id) => rows.some((row) => row.id === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.page]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const selectColumn: Column<Task> = {
    key: "select",
    width: "36px",
    header: (
      <Checkbox
        checked={allSelected}
        onCheckedChange={(checked) => setSelected(checked ? rows.map((row) => row.id) : [])}
      />
    ),
    cell: (row) => (
      <span
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <Checkbox checked={selected.includes(row.id)} onCheckedChange={() => toggle(row.id)} />
      </span>
    ),
  };

  const columns: Column<Task>[] = [
    {
      key: "key",
      header: "ID",
      width: "110px",
      cell: (row) => {
        const Icon = TYPE_ICONS[row.type] ?? CheckSquare;
        return (
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
            <Icon className={cn("h-3.5 w-3.5", TYPE_COLORS[row.type])} />
            {row.key}
          </span>
        );
      },
    },
    {
      key: "title",
      header: t("common.title"),
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span className="truncate">{row.title}</span>
          {row.is_blocked ? (
            <span className="rounded border border-danger/30 bg-danger/10 px-1 text-[10px] text-danger">
              blocked
            </span>
          ) : null}
        </span>
      ),
    },
    ...(hideProject
      ? []
      : [
          {
            key: "project",
            header: t("common.project"),
            cell: (row: Task) =>
              row.project ? (
                <span className="flex items-center gap-1.5 text-[12px] text-muted">
                  <span>{row.project.icon}</span>
                  <span className="truncate">{row.project.name}</span>
                </span>
              ) : (
                <span className="text-faint">—</span>
              ),
          } as Column<Task>,
        ]),
    { key: "status", header: t("common.status"), cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "priority",
      header: t("common.priority"),
      cell: (row) => (
        <span
          className={cn(
            "text-[12px]",
            { low: "text-muted", medium: "text-info", high: "text-warning", urgent: "text-danger" }[
              row.priority
            ],
          )}
        >
          {row.priority}
        </span>
      ),
    },
    {
      key: "assignee",
      header: t("common.assignee"),
      cell: (row) =>
        row.assignee ? (
          <span className="flex items-center gap-1.5">
            <Avatar name={row.assignee.full_name} color={row.assignee.avatar_color} size={18} />
            <span className="truncate text-[12px]">{row.assignee.full_name}</span>
          </span>
        ) : (
          <span className="text-[12px] text-faint">{t("common.unassigned")}</span>
        ),
    },
    {
      key: "due",
      header: t("common.dueDate"),
      align: "end",
      cell: (row) => (
        <span
          className={cn(
            "text-[12px]",
            isOverdue(row.due_date) && row.status !== "done" ? "text-danger" : "text-muted",
          )}
        >
          {formatDate(row.due_date, locale)}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="panel overflow-hidden">
        <DataTable
          columns={selectable ? [selectColumn, ...columns] : columns}
          rows={rows}
          loading={loading}
          rowHref={(row) => `/tasks/${row.id}`}
          empty={<EmptyState icon={CheckSquare} title={t("common.empty")} />}
        />
        {data && onPage ? (
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={onPage} />
        ) : null}
      </div>
      {selectable ? (
        <BulkBar ids={selected} onClear={() => setSelected([])} projectId={projectId} />
      ) : null}
    </>
  );
}
