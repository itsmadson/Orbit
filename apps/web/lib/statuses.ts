"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/components/providers";

/** One board column. Mirrors TaskStatus in app/models/work.py. */
export type TaskStatus = {
  id: string;
  key: string;
  name: string;
  name_fa?: string | null;
  category: "open" | "started" | "done" | "cancelled";
  color: string;
  order_index: number;
  is_system: boolean;
  task_count: number;
};

export const STATUS_CATEGORIES = ["open", "started", "done", "cancelled"] as const;

export const STATUS_COLORS = [
  "#8b93a1", "#2d88e2", "#00a7b5", "#61a746", "#d9a400",
  "#f5501b", "#e5484d", "#b2468b", "#946ad5", "#6b7280",
];

/** The names the built-in columns ship with; a renamed one stops matching. */
const BUILT_IN: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};

/**
 * The company's task statuses, in board order.
 *
 * Cached for the session: columns change rarely, and every badge reads this.
 */
export function useTaskStatuses() {
  const { can } = useSession();
  const query = useQuery<TaskStatus[]>({
    queryKey: ["/task-statuses"],
    queryFn: () => api.get<TaskStatus[]>("/task-statuses"),
    enabled: can("tasks.read"),
    staleTime: 60_000,
    retry: false,
  });
  return { ...query, statuses: query.data ?? [] };
}

/** Name of a status row in the reader's language. */
export function statusName(
  status: Pick<TaskStatus, "key" | "name" | "name_fa" | "is_system">,
  locale: string,
  t: (key: string) => string,
) {
  // An untouched built-in column follows the interface language; anything a
  // person named keeps the name they gave it.
  if (status.is_system && BUILT_IN[status.key] === status.name) {
    const translated = t(`status.${status.key}`);
    if (translated !== `status.${status.key}`) return translated;
  }
  return locale === "fa" && status.name_fa ? status.name_fa : status.name;
}

/** Lookups for anywhere a task status is shown or picked. */
export function useStatusLabels() {
  const { locale, t } = useI18n();
  const { statuses } = useTaskStatuses();
  const byKey = new Map(statuses.map((status) => [status.key, status]));
  return {
    statuses,
    byKey,
    label: (key?: string | null) => {
      if (!key) return "—";
      const row = byKey.get(key);
      if (row) return statusName(row, locale, t);
      const translated = t(`status.${key}`);
      return translated !== `status.${key}` ? translated : key.replace(/_/g, " ");
    },
    /** Options for a select. Cancelled states are left out unless asked for. */
    options: (withCancelled = false) =>
      statuses
        .filter((status) => withCancelled || status.category !== "cancelled")
        .map((status) => ({ value: status.key, label: statusName(status, locale, t) })),
    isDone: (key?: string | null) => (key ? byKey.get(key)?.category === "done" || key === "done" : false),
    isClosed: (key?: string | null) => {
      if (!key) return false;
      const category = byKey.get(key)?.category;
      return category ? category === "done" || category === "cancelled" : key === "done" || key === "cancelled";
    },
  };
}
