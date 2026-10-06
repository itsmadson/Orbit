"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, Unlink } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Task } from "@/lib/types";
import { TimeAgo } from "@/components/ui/misc";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownTrigger,
} from "@/components/ui/dropdown";

export const PROVIDER_NAMES: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
};

type IntegrationLink = {
  id: string;
  provider: string;
  remote_key: string;
  project_id: string;
};

/**
 * The remote twins of a task: the GitHub / GitLab / Jira issue it mirrors.
 *
 * A task imported from a tracker already has one. For a task born in Orbit,
 * "Publish" creates the remote issue, and the two stay in step from then on.
 */
export function ExternalIssues({ task }: { task: Task }) {
  const { t } = useI18n();
  const { can } = useSession();
  const client = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const canWrite = can("integrations.write");
  const external = task.external ?? [];

  const links = useItem<IntegrationLink[]>(
    task.project_id && canWrite ? "/integration-links" : null,
    { project_id: task.project_id },
  );
  // A task can have one twin per tracker; offer only the ones it lacks.
  const available = (links.data ?? []).filter(
    (link) => !external.some((item) => item.provider === link.provider),
  );

  const refresh = () => {
    client.invalidateQueries({ queryKey: [`/tasks/${task.id}`] });
    client.invalidateQueries({ queryKey: ["/tasks"] });
  };

  const publish = async (link: IntegrationLink) => {
    setBusy(true);
    try {
      await api.post(`/tasks/${task.id}/external`, { link_id: link.id });
      toast.success(
        t("integrations.published", { provider: PROVIDER_NAMES[link.provider] ?? link.provider }),
      );
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (id: string) => {
    try {
      await api.delete(`/tasks/${task.id}/external/${id}`);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    }
  };

  if (!external.length && !available.length) return null;

  return (
    <div className="space-y-1.5">
      {external.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5"
        >
          <div className="min-w-0 flex-1">
            <a
              href={item.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[12px] font-medium hover:text-accent"
            >
              <span className="truncate" dir="ltr">
                {PROVIDER_NAMES[item.provider] ?? item.provider} ·{" "}
                {item.provider === "jira" ? item.remote_id : `${item.remote_key}#${item.remote_id}`}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-faint">
              {item.remote_state ? <span dir="auto">{item.remote_state}</span> : null}
              {item.synced_at ? (
                <>
                  <span>·</span>
                  <span>{t("integrations.synced")}</span>
                  <TimeAgo value={item.synced_at} />
                </>
              ) : null}
            </p>
          </div>
          {canWrite ? (
            <button
              type="button"
              title={t("integrations.unlink")}
              aria-label={t("integrations.unlink")}
              onClick={() => unlink(item.id)}
              className="rounded p-1 text-faint transition-colors hover:bg-surface hover:text-danger"
            >
              <Unlink className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ))}
      {available.length ? (
        <Dropdown>
          <DropdownTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:border-accent/50 hover:text-text disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("integrations.publish")}
            </button>
          </DropdownTrigger>
          <DropdownContent align="end">
            <DropdownLabel>{t("integrations.publishTo")}</DropdownLabel>
            {available.map((link) => (
              <DropdownItem key={link.id} onSelect={() => publish(link)}>
                <span dir="ltr">
                  {PROVIDER_NAMES[link.provider] ?? link.provider} · {link.remote_key}
                </span>
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>
      ) : null}
    </div>
  );
}
