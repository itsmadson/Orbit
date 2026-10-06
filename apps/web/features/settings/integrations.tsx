"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  ExternalLink,
  GitBranch,
  Link2,
  Plug,
  Plus,
  RefreshCw,
  SquareKanban,
  Trash2,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useDebounced, useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { Section } from "@/components/shared/page";
import { useProjects } from "@/components/shared/pickers";
import { StatusBadge, Switch, TimeAgo } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Integration = {
  provider: string;
  name: string;
  description: string;
  category: string;
  status: string;
  connectable: boolean;
  managed_by?: "env" | "ui" | null;
  needs_base_url: boolean;
  needs_username: boolean;
  default_base_url?: string | null;
  account?: string | null;
  base_url?: string | null;
  username?: string | null;
  token_hint?: string | null;
  last_error?: string | null;
  link_count?: number;
  details?: Record<string, string | null>;
};

type ProjectLink = {
  id: string;
  provider: string;
  project_id: string;
  project?: { id: string; key: string; name: string } | null;
  remote_key: string;
  remote_url?: string | null;
  auto_sync: boolean;
  last_synced_at?: string | null;
  last_error?: string | null;
  issue_count: number;
};

type SyncStats = { imported: number; updated: number; pushed: number; errors: number; error?: string };

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  github: GitBranch,
  gitlab: GitBranch,
  jira: SquareKanban,
  gapgpt: Bot,
  tau: Bot,
};

const TRACKERS = ["github", "gitlab", "jira"];

/** Where each tracker hands out the token Orbit needs. */
const TOKEN_HELP: Record<string, string> = {
  github: "https://github.com/settings/tokens",
  gitlab: "https://gitlab.com/-/user_settings/personal_access_tokens",
  jira: "https://id.atlassian.com/manage-profile/security/api-tokens",
};

function useRefresh() {
  const client = useQueryClient();
  return React.useCallback(() => {
    for (const key of ["/integrations", "/integration-links", "/tasks", "/tasks/board", "/projects"]) {
      client.invalidateQueries({ queryKey: [key] });
    }
  }, [client]);
}

export function IntegrationsPanel() {
  const { t } = useI18n();
  const { can } = useSession();
  const canManage = can("integrations.manage");
  const confirm = useConfirm();
  const refresh = useRefresh();
  const integrations = useItem<Integration[]>("/integrations");
  const [connecting, setConnecting] = React.useState<Integration | null>(null);
  const [testing, setTesting] = React.useState<string | null>(null);

  const items = integrations.data ?? [];
  const connected = items.filter((item) => TRACKERS.includes(item.provider) && item.status !== "available");

  const test = async (item: Integration) => {
    setTesting(item.provider);
    try {
      const result = await api.post<{ account: string }>(`/integrations/${item.provider}/test`);
      toast.success(t("integrations.testOk", { account: result.account }));
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    } finally {
      setTesting(null);
      refresh();
    }
  };

  const disconnect = async (item: Integration) => {
    const ok = await confirm({
      title: t("integrations.disconnectTitle", { name: item.name }),
      body: t("integrations.disconnectBody"),
      confirmLabel: t("integrations.disconnect"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/integrations/${item.provider}`);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    }
  };

  // Things that work first, then what can be connected, then the roadmap.
  const rank = (item: Integration) =>
    item.status === "connected" || item.status === "error" ? 0 : item.status === "available" ? 1 : 2;
  const sorted = [...items].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((item) => {
          const Icon = ICONS[item.provider] ?? Plug;
          const live = item.status === "connected" || item.status === "error";
          return (
            <div
              key={item.provider}
              className={cn("panel flex flex-col p-4", item.status === "coming_soon" && "opacity-70")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className={cn("h-4 w-4 shrink-0", live ? "text-accent" : "text-muted")} />
                  <p className="truncate text-[13px] font-medium" dir="ltr">
                    {item.name}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                {t(`integrations.desc.${item.provider}`) === `integrations.desc.${item.provider}`
                  ? item.description
                  : t(`integrations.desc.${item.provider}`)}
              </p>

              {live && item.connectable ? (
                <p className="mt-2 truncate text-[11px] text-faint" dir="ltr">
                  {item.account}
                  {item.token_hint ? ` · ${item.token_hint}` : ""}
                  {item.base_url ? ` · ${item.base_url.replace(/^https?:\/\//, "")}` : ""}
                </p>
              ) : null}
              {item.managed_by === "env" && item.details ? (
                <p className="mt-2 truncate text-[11px] text-faint" dir="ltr">
                  {[item.details.model, item.details.version && `v${item.details.version}`, item.details.base_url]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              {item.last_error ? (
                <p className="mt-2 text-[11px] text-danger" dir="auto">
                  {item.last_error}
                </p>
              ) : null}

              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                <span className="me-auto text-[11px] text-faint">
                  {t(`integrations.category.${item.category}`)}
                </span>
                {item.managed_by === "env" ? (
                  <span className="text-[11px] text-faint">{t("integrations.viaEnv")}</span>
                ) : null}
                {item.details?.url ? (
                  <a
                    href={item.details.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent"
                  >
                    {t("integrations.website")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
                {item.connectable && live ? (
                  <>
                    <Button size="sm" variant="ghost" loading={testing === item.provider} onClick={() => test(item)}>
                      {t("integrations.test")}
                    </Button>
                    {canManage ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setConnecting(item)}>
                          {t("integrations.changeToken")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => disconnect(item)} aria-label={t("integrations.disconnect")}>
                          <Unplug className="h-3.5 w-3.5 text-danger" />
                        </Button>
                      </>
                    ) : null}
                  </>
                ) : null}
                {item.connectable && !live && canManage ? (
                  <Button size="sm" variant="primary" onClick={() => setConnecting(item)}>
                    <Plug className="h-3.5 w-3.5" />
                    {t("integrations.connect")}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {connected.length ? <ProjectLinks providers={connected} canManage={canManage} /> : null}

      <ConnectDialog integration={connecting} onClose={() => setConnecting(null)} />
    </div>
  );
}

function ConnectDialog({ integration, onClose }: { integration: Integration | null; onClose: () => void }) {
  const { t } = useI18n();
  const refresh = useRefresh();
  const [form, setForm] = React.useState({ base_url: "", username: "", token: "" });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!integration) return;
    setForm({
      base_url: integration.base_url ?? "",
      username: integration.username ?? "",
      token: "",
    });
  }, [integration]);

  if (!integration) return null;
  const provider = integration.provider;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api.post<{ account: string }>(`/integrations/${provider}/connect`, form);
      toast.success(t("integrations.connectedAs", { account: result.account }));
      refresh();
      onClose();
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader
          title={t("integrations.connectTitle", { name: integration.name })}
          description={t("integrations.connectHint")}
        />
        <form onSubmit={submit} className="space-y-3">
          {integration.needs_base_url ? (
            <Field
              label={t("integrations.baseUrl")}
              hint={provider === "jira" ? t("integrations.baseUrlHint.jira") : t("integrations.baseUrlHint.gitlab")}
            >
              <Input
                dir="ltr"
                required={provider === "jira"}
                value={form.base_url}
                onChange={(event) => setForm({ ...form, base_url: event.target.value })}
                placeholder={provider === "jira" ? "https://your-team.atlassian.net" : integration.default_base_url ?? ""}
              />
            </Field>
          ) : null}
          {integration.needs_username ? (
            <Field label={t("integrations.email")} hint={t("integrations.emailHint")}>
              <Input
                dir="ltr"
                type="email"
                autoComplete="off"
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="you@company.com"
              />
            </Field>
          ) : null}
          <Field label={t("integrations.token")} hint={t(`integrations.tokenHint.${provider}`)}>
            <Input
              dir="ltr"
              required
              type="password"
              autoComplete="off"
              value={form.token}
              onChange={(event) => setForm({ ...form, token: event.target.value })}
              placeholder={integration.token_hint ?? "••••••••"}
            />
          </Field>
          <a
            href={TOKEN_HELP[provider]}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
          >
            {t("integrations.createToken")}
            <ExternalLink className="h-3 w-3" />
          </a>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {t("integrations.connect")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectLinks({ providers, canManage }: { providers: Integration[]; canManage: boolean }) {
  const { t, n } = useI18n();
  const { can } = useSession();
  const confirm = useConfirm();
  const refresh = useRefresh();
  const links = useItem<ProjectLink[]>("/integration-links");
  const [adding, setAdding] = React.useState(false);
  const [syncing, setSyncing] = React.useState<string | null>(null);
  const names = Object.fromEntries(providers.map((item) => [item.provider, item.name]));

  const report = (stats?: SyncStats | null) => {
    if (!stats) return;
    if (stats.error) toast.error(stats.error);
    else
      toast.success(
        t("integrations.syncResult", {
          imported: n(stats.imported),
          updated: n(stats.updated),
          pushed: n(stats.pushed),
        }),
      );
  };

  const sync = async (link: ProjectLink) => {
    setSyncing(link.id);
    try {
      const result = await api.post<{ sync: SyncStats }>(`/integration-links/${link.id}/sync`);
      report(result.sync);
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    } finally {
      setSyncing(null);
      refresh();
    }
  };

  const toggle = async (link: ProjectLink, auto_sync: boolean) => {
    try {
      await api.patch(`/integration-links/${link.id}`, { auto_sync });
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    }
  };

  const remove = async (link: ProjectLink) => {
    const ok = await confirm({
      title: t("integrations.unlinkTitle"),
      body: t("integrations.unlinkBody"),
      confirmLabel: t("integrations.unlink"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/integration-links/${link.id}`);
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    }
  };

  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" />
          {t("integrations.links")}
        </span>
      }
      action={
        canManage ? (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("integrations.linkProject")}
          </Button>
        ) : undefined
      }
      contentClassName="p-0"
    >
      {(links.data ?? []).length ? (
        <ul className="divide-y divide-border/60">
          {(links.data ?? []).map((link) => (
            <li key={link.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="font-medium">{link.project?.name ?? "—"}</span>
                  <span className="text-faint">↔</span>
                  <a
                    href={link.remote_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    dir="ltr"
                    className="inline-flex items-center gap-1 text-muted hover:text-accent"
                  >
                    {names[link.provider] ?? link.provider} · {link.remote_key}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-faint">
                  <span>{t("integrations.issueCount", { count: n(link.issue_count) })}</span>
                  <span>·</span>
                  {link.last_synced_at ? (
                    <>
                      <span>{t("integrations.synced")}</span>
                      <TimeAgo value={link.last_synced_at} />
                    </>
                  ) : (
                    <span>{t("integrations.neverSynced")}</span>
                  )}
                </p>
                {link.last_error ? (
                  <p className="mt-0.5 text-[11px] text-danger" dir="auto">
                    {link.last_error}
                  </p>
                ) : null}
              </div>
              {canManage ? (
                <label className="flex items-center gap-1.5 text-[11px] text-muted">
                  <Switch checked={link.auto_sync} onCheckedChange={(value) => toggle(link, value)} />
                  {t("integrations.autoSync")}
                </label>
              ) : null}
              {can("integrations.write") ? (
                <Button size="sm" variant="ghost" loading={syncing === link.id} onClick={() => sync(link)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("integrations.syncNow")}
                </Button>
              ) : null}
              {canManage ? (
                <Button size="sm" variant="ghost" onClick={() => remove(link)} aria-label={t("integrations.unlink")}>
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-center text-[12px] text-muted">{t("integrations.noLinks")}</p>
      )}
      <LinkDialog open={adding} onClose={() => setAdding(false)} providers={providers} onDone={report} />
    </Section>
  );
}

function LinkDialog({
  open,
  onClose,
  providers,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  providers: Integration[];
  onDone: (stats?: SyncStats | null) => void;
}) {
  const { t } = useI18n();
  const refresh = useRefresh();
  const projects = useProjects();
  const [provider, setProvider] = React.useState(providers[0]?.provider ?? "");
  const [projectId, setProjectId] = React.useState("");
  const [remoteKey, setRemoteKey] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const search = useDebounced(query, 350);

  React.useEffect(() => {
    if (open) {
      setProvider(providers[0]?.provider ?? "");
      setProjectId("");
      setRemoteKey("");
      setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const remote = useItem<{ key: string; name: string }[]>(
    open && provider ? `/integrations/${provider}/projects` : null,
    { q: search || undefined },
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api.post<{ sync?: SyncStats | null }>("/integration-links", {
        project_id: projectId,
        provider,
        remote_key: remoteKey,
        import_now: true,
      });
      onDone(result.sync);
      refresh();
      onClose();
    } catch (error: any) {
      toast.error(error?.message ?? t("common.requestFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md">
        <DialogHeader title={t("integrations.linkProject")} description={t("integrations.linkHint")} />
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("integrations.orbitProject")}>
              <SimpleSelect
                value={projectId}
                onValueChange={setProjectId}
                placeholder={t("common.project")}
                options={(projects.data?.items ?? []).map((project) => ({
                  value: project.id,
                  label: `${project.icon} ${project.name}`,
                }))}
              />
            </Field>
            <Field label={t("integrations.tracker")}>
              <SimpleSelect
                value={provider}
                onValueChange={(value) => {
                  setProvider(value);
                  setRemoteKey("");
                }}
                options={providers.map((item) => ({ value: item.provider, label: item.name }))}
              />
            </Field>
          </div>
          <Field
            label={provider === "jira" ? t("integrations.jiraProject") : t("integrations.repository")}
            hint={provider === "jira" ? t("integrations.remoteHint.jira") : t("integrations.remoteHint.repo")}
          >
            <Input
              dir="ltr"
              required
              value={remoteKey}
              onChange={(event) => {
                setRemoteKey(event.target.value);
                setQuery(event.target.value);
              }}
              placeholder={provider === "jira" ? "ENG" : "owner/repository"}
            />
          </Field>
          {(remote.data ?? []).length ? (
            <div className="max-h-44 overflow-y-auto rounded-md border border-border">
              {(remote.data ?? []).slice(0, 40).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  dir="ltr"
                  onClick={() => setRemoteKey(item.key)}
                  className={cn(
                    "block w-full truncate px-3 py-1.5 text-start text-[12px] transition-colors hover:bg-surface-2",
                    item.key === remoteKey ? "bg-accent-soft text-accent" : "text-muted",
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!projectId || !remoteKey}>
              {t("integrations.linkAndImport")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
