"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bookmark, BookmarkPlus, Globe, Lock, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

export type SavedView = {
  id: string;
  entity: string;
  name: string;
  filters: Record<string, unknown>;
  is_shared: boolean;
  is_default: boolean;
  is_mine: boolean;
  use_count: number;
};

/**
 * The two or three queries a person runs all week, kept as buttons.
 *
 * A filter bar answers "what can I narrow to"; a saved view answers "what do I
 * look at every morning". The active view is matched by comparing the stored
 * filters to the live ones, so editing a filter visibly leaves the view.
 */
export function ViewBar({
  entity,
  filters,
  onApply,
}: {
  entity: string;
  /** The filter state currently driving the list. */
  filters: Record<string, unknown>;
  onApply: (filters: Record<string, unknown>) => void;
}) {
  const t = useT();
  const client = useQueryClient();
  const confirm = useConfirm();
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const views = useItem<SavedView[]>("/views", { entity });

  const clean = React.useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "" && v != null)),
    [filters],
  );
  const activeId = React.useMemo(() => {
    const current = JSON.stringify(clean, Object.keys(clean).sort());
    return (views.data ?? []).find((view) => {
      const keys = Object.keys(view.filters ?? {}).sort();
      return JSON.stringify(view.filters ?? {}, keys) === current;
    })?.id;
  }, [views.data, clean]);

  const refresh = () => client.invalidateQueries({ queryKey: ["/views"] });

  async function save() {
    if (!name.trim()) return;
    try {
      await api.post("/views", { entity, name: name.trim(), filters: clean });
      toast.success(t("views.saved"));
      setName("");
      setNaming(false);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    }
  }

  async function remove(view: SavedView) {
    const ok = await confirm({
      title: t("views.delete"),
      body: view.name,
      confirmLabel: t("action.delete"),
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/views/${view.id}`);
    refresh();
  }

  const hasFilters = Object.keys(clean).length > 0;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {(views.data ?? []).map((view) => (
        <span key={view.id} className="group relative">
          <button
            type="button"
            onClick={() => {
              onApply(view.filters ?? {});
              api.post(`/views/${view.id}/use`).catch(() => null);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
              activeId === view.id
                ? "border-accent/45 bg-accent-soft text-accent"
                : "border-border bg-surface-2 text-muted hover:text-text",
            )}
          >
            {view.is_shared ? (
              <Globe className="h-3 w-3 opacity-70" />
            ) : (
              <Lock className="h-3 w-3 opacity-50" />
            )}
            {view.name}
          </button>
          {view.is_mine ? (
            <button
              type="button"
              onClick={() => remove(view)}
              title={t("action.delete")}
              className="absolute -end-1 -top-1 hidden rounded-full bg-elevated p-0.5 text-faint hover:text-danger group-hover:block"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          ) : null}
        </span>
      ))}

      {naming ? (
        <span className="flex items-center gap-1">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") setNaming(false);
            }}
            placeholder={t("views.namePlaceholder")}
            className="h-7 w-44 text-[12px]"
          />
          <Button size="xs" variant="primary" onClick={save}>
            {t("action.save")}
          </Button>
        </span>
      ) : hasFilters && !activeId ? (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[12px] text-muted transition-colors hover:border-accent/40 hover:text-accent"
        >
          <BookmarkPlus className="h-3 w-3" />
          {t("views.save")}
        </button>
      ) : null}

      {activeId ? (
        <button
          type="button"
          onClick={() => onApply({})}
          className="ms-1 text-[11px] text-faint transition-colors hover:text-muted"
        >
          {t("views.clear")}
        </button>
      ) : null}
    </div>
  );
}
