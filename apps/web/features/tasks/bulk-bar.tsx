"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";

import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { UserPicker } from "@/components/shared/pickers";
import { useConfirm } from "@/components/ui/confirm";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/utils";

/**
 * Triage, which is what a board is for on a Monday morning.
 *
 * Appears only when something is selected, and applies one change to the whole
 * selection in a single request rather than one PATCH per row.
 */
export function BulkBar({
  ids,
  onClear,
  projectId,
}: {
  ids: string[];
  onClear: () => void;
  projectId?: string;
}) {
  const t = useT();
  const client = useQueryClient();
  const confirm = useConfirm();
  const { can } = useSession();
  const [busy, setBusy] = React.useState(false);
  const sprints = useItem<{ id: string; name: string }[]>("/sprints", projectId ? { project_id: projectId } : undefined);

  if (!ids.length || !can("tasks.write")) return null;

  const refresh = () => {
    client.invalidateQueries({ queryKey: ["/tasks"] });
    client.invalidateQueries({ queryKey: ["/tasks/board"] });
    client.invalidateQueries({ queryKey: ["dashboard"] });
    onClear();
  };

  async function apply(body: Record<string, unknown>, label: string) {
    setBusy(true);
    try {
      const result = await api.post<{ message: string }>("/tasks/bulk", { ids, ...body });
      toast.success(result.message ?? label);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: t("tasks.bulkDelete").replace("{count}", String(ids.length)),
      body: t("tasks.bulkDeleteBody"),
      confirmLabel: t("action.delete"),
      destructive: true,
    });
    if (ok) apply({ action: "delete" }, t("action.delete"));
  }

  return (
    <div className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-2xl border border-border bg-elevated px-3 py-2 shadow-[var(--shadow-pop)]">
      <span className="ps-1 text-[12px] font-medium text-text tnum">
        {t("tasks.selected").replace("{count}", String(ids.length))}
      </span>

      <span className="mx-1 h-5 w-px bg-border" />

      <SimpleSelect
        value=""
        onValueChange={(status) => apply({ status }, t("common.status"))}
        placeholder={t("common.status")}
        className="h-8 w-36"
        disabled={busy}
        options={TASK_STATUSES.map((value) => ({
          value,
          label: t(`status.${value}`) === `status.${value}` ? value : t(`status.${value}`),
        }))}
      />

      <SimpleSelect
        value=""
        onValueChange={(priority) => apply({ priority }, t("common.priority"))}
        placeholder={t("common.priority")}
        className="h-8 w-32"
        disabled={busy}
        options={TASK_PRIORITIES.map((value) => ({
          value,
          label: t(`priority.${value}`) === `priority.${value}` ? value : t(`priority.${value}`),
        }))}
      />

      <div className="w-44">
        <UserPicker
          value={null}
          onChange={(assignee_id) => assignee_id && apply({ assignee_id }, t("common.assignee"))}
          placeholder={t("common.assignee")}
        />
      </div>

      {sprints.data?.length ? (
        <SimpleSelect
          value=""
          onValueChange={(sprint_id) => apply({ sprint_id }, t("tasks.sprint"))}
          placeholder={t("tasks.sprint")}
          className="h-8 w-40"
          disabled={busy}
          options={sprints.data.map((sprint) => ({ value: sprint.id, label: sprint.name }))}
        />
      ) : null}

      <Button size="icon-sm" variant="ghost" onClick={remove} disabled={busy}
              title={t("action.delete")}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon-sm" variant="ghost" onClick={onClear} title={t("action.cancel")}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
