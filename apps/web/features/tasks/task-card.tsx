"use client";

import Link from "next/link";
import { AlertOctagon, Bug, CheckSquare, Layers, MessageSquare, Sparkles, Zap } from "lucide-react";
import type { Task } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { Avatar } from "@/components/ui/misc";
import { cn, formatDate, isOverdue, PRIORITY_TONES } from "@/lib/utils";

export const TYPE_ICONS: Record<string, any> = {
  task: CheckSquare,
  bug: Bug,
  feature: Sparkles,
  story: Layers,
  epic: Zap,
  subtask: CheckSquare,
};

export const TYPE_COLORS: Record<string, string> = {
  task: "text-info",
  bug: "text-danger",
  feature: "text-accent",
  story: "text-positive",
  epic: "text-warning",
  subtask: "text-muted",
};

export function TaskCard({ task, dragging }: { task: Task; dragging?: boolean }) {
  const { locale } = useI18n();
  const Icon = TYPE_ICONS[task.type] ?? CheckSquare;
  const overdue = isOverdue(task.due_date) && task.status !== "done";

  return (
    <div
      className={cn(
        "panel group select-none p-2.5 transition-colors hover:border-border-strong",
        dragging && "rotate-1 opacity-90 shadow-xl",
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", TYPE_COLORS[task.type])} />
        <Link
          href={`/tasks/${task.id}`}
          className="min-w-0 flex-1 text-[13px] leading-snug hover:text-accent"
          onClick={(event) => event.stopPropagation()}
        >
          {task.title}
        </Link>
      </div>
      {task.labels?.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((label) => (
            <span key={label} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
              {label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-faint">
        <span className="font-mono">{task.key}</span>
        <span className={cn("h-1.5 w-1.5 rounded-full", {
          low: "bg-muted",
          medium: "bg-info",
          high: "bg-warning",
          urgent: "bg-danger",
        }[task.priority] ?? "bg-muted")} />
        {task.is_blocked ? <AlertOctagon className="h-3 w-3 text-danger" /> : null}
        {task.comment_count > 0 ? (
          <span className="flex items-center gap-0.5">
            <MessageSquare className="h-3 w-3" />
            {task.comment_count}
          </span>
        ) : null}
        {task.due_date ? (
          <span className={cn(overdue && "text-danger")}>{formatDate(task.due_date, locale)}</span>
        ) : null}
        <span className="ms-auto">
          {task.assignee ? (
            <Avatar name={task.assignee.full_name} color={task.assignee.avatar_color} size={18} />
          ) : null}
        </span>
      </div>
    </div>
  );
}
