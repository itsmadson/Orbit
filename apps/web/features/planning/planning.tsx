"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, Gauge, Sparkles, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import {
  Avatar, Badge, Progress, Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Person = {
  user: { id: string; full_name: string; avatar_color?: string | null };
  gross_hours: number;
  leave_days: number;
  committed_hours: number;
  available_hours: number;
  open_tasks: number;
  open_tickets: number;
  utilisation: number;
  skills: string[];
};

type Capacity = {
  working_days: number;
  people: Person[];
  total_available: number;
  total_committed: number;
  overloaded: string[];
};

type Assignment = {
  task: string;
  title: string;
  hours: number;
  assignee: { full_name: string; avatar_color?: string | null };
  why: string[];
};

/**
 * Capacity, and the two things you do with it: spread loose work, or fill a
 * sprint. Both preview before they commit — an auto-assigner you cannot inspect
 * first gets used exactly once.
 */
export function PlanningView() {
  const t = useT();
  const { can } = useSession();
  const client = useQueryClient();
  const [tab, setTab] = React.useState("capacity");
  const [projectId, setProjectId] = React.useState("");
  const projects = useItem<{ items: { id: string; name: string }[] }>("/projects", {
    page_size: 50,
  });
  const capacity = useItem<Capacity>(
    "/planning/capacity",
    projectId ? { project_id: projectId } : undefined,
  );

  const [preview, setPreview] = React.useState<any>(null);
  const [sprintPlan, setSprintPlan] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const editable = can("planning.write");

  async function run(path: string, body: Record<string, unknown>, setter: (v: any) => void) {
    setBusy(true);
    try {
      const result = await api.post<any>(path, body);
      if (body.commit) {
        toast.success(t("planning.applied"));
        client.invalidateQueries({ queryKey: ["/planning/capacity"] });
        client.invalidateQueries({ queryKey: ["/tasks"] });
        client.invalidateQueries({ queryKey: ["/tasks/board"] });
        setter(null);
      } else {
        setter(result);
      }
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t("planning.title")} subtitle={t("planning.subtitle")} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("planning.available")}
          value={`${capacity.data?.total_available ?? 0}h`}
          icon={<Gauge className="h-[15px] w-[15px]" />} />
        <MetricCard label={t("planning.committed")}
          value={`${capacity.data?.total_committed ?? 0}h`}
          icon={<Users className="h-[15px] w-[15px]" />} />
        <MetricCard label={t("planning.overloaded")}
          value={capacity.data?.overloaded.length ?? 0}
          tone={capacity.data?.overloaded.length ? "danger" : "default"}
          icon={<Users className="h-[15px] w-[15px]" />} />
        <MetricCard label={t("planning.workingDays")}
          value={capacity.data?.working_days ?? 0}
          icon={<CalendarRange className="h-[15px] w-[15px]" />} />
      </div>

      <div className="mb-4 w-64">
        <SimpleSelect
          value={projectId}
          onValueChange={setProjectId}
          placeholder={t("planning.wholeCompany")}
          options={[
            { value: "", label: t("planning.wholeCompany") },
            ...(projects.data?.items ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="pill" className="mb-4">
          <TabsTrigger variant="pill" value="capacity">{t("planning.capacity")}</TabsTrigger>
          <TabsTrigger variant="pill" value="assign">{t("planning.autoAssign")}</TabsTrigger>
          <TabsTrigger variant="pill" value="sprint">{t("planning.sprint")}</TabsTrigger>
        </TabsList>

        <TabsContent value="capacity">
          <Section title={t("planning.capacity")} contentClassName="p-0">
            <ul className="divide-y divide-border">
              {(capacity.data?.people ?? []).map((person) => (
                <li key={person.user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar name={person.user.full_name} color={person.user.avatar_color} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-text">{person.user.full_name}</div>
                    <div className="truncate text-[11px] text-muted">
                      {person.open_tasks} {t("planning.tasks")}
                      {person.open_tickets ? ` · ${person.open_tickets} ${t("support.title")}` : ""}
                      {person.leave_days ? ` · ${person.leave_days}d ${t("hr.leave")}` : ""}
                    </div>
                  </div>
                  <div className="w-40">
                    <Progress
                      value={person.utilisation}
                      tone={
                        person.utilisation > 100
                          ? "var(--danger)"
                          : person.utilisation > 85
                            ? "var(--warning)"
                            : undefined
                      }
                    />
                    <div className="mt-1 flex justify-between text-[10.5px] tnum text-faint">
                      <span>{person.committed_hours}h</span>
                      <span>{person.gross_hours}h</span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "w-20 text-end text-[14px] font-semibold tnum",
                      person.available_hours < 0 ? "text-danger" : "text-text",
                    )}
                  >
                    {person.available_hours}h
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </TabsContent>

        <TabsContent value="assign">
          <Section
            title={t("planning.autoAssign")}
            action={
              editable ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" loading={busy}
                    onClick={() => run("/planning/auto-assign",
                      { project_id: projectId || null, commit: false }, setPreview)}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("planning.preview")}
                  </Button>
                  {preview?.assignments?.length ? (
                    <Button size="sm" variant="primary" loading={busy}
                      onClick={() => run("/planning/auto-assign",
                        { project_id: projectId || null, commit: true }, setPreview)}>
                      {t("planning.apply")}
                    </Button>
                  ) : null}
                </div>
              ) : null
            }
            contentClassName="p-0"
          >
            {preview ? (
              <>
                <p className="border-b border-border px-4 py-2 text-[12px] text-muted">
                  {t("planning.wouldAssign")
                    .replace("{count}", String(preview.assigned))
                    .replace("{skipped}", String(preview.skipped))}
                </p>
                <ul className="divide-y divide-border">
                  {preview.assignments.map((item: Assignment) => (
                    <li key={item.task} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="font-mono text-[11px] tnum text-muted">{item.task}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                        {item.title}
                      </span>
                      <span className="text-[11px] tnum text-faint">{item.hours}h</span>
                      <span className="flex items-center gap-1.5">
                        <Avatar name={item.assignee.full_name}
                          color={item.assignee.avatar_color} size={20} />
                        <span className="text-[12px] text-muted">{item.assignee.full_name}</span>
                      </span>
                      <span className="w-full text-[11px] text-faint sm:w-auto">
                        {item.why.join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
                {preview.unplaceable?.length ? (
                  <p className="border-t border-border px-4 py-2 text-[12px] text-warning">
                    {preview.unplaceable.length} {t("planning.unplaceable")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="p-4 text-[13px] text-faint">{t("planning.previewHint")}</p>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="sprint">
          <Section
            title={t("planning.sprint")}
            action={
              editable && projectId ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" loading={busy}
                    onClick={() => run("/planning/sprint",
                      { project_id: projectId, commit: false, allow_parallel: true },
                      setSprintPlan)}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("planning.preview")}
                  </Button>
                  {sprintPlan?.tasks?.length ? (
                    <Button size="sm" variant="primary" loading={busy}
                      onClick={() => run("/planning/sprint",
                        { project_id: projectId, commit: true, allow_parallel: true },
                        setSprintPlan)}>
                      {t("planning.createSprint")}
                    </Button>
                  ) : null}
                </div>
              ) : null
            }
            contentClassName="p-0"
          >
            {!projectId ? (
              <p className="p-4 text-[13px] text-faint">{t("planning.pickProject")}</p>
            ) : sprintPlan ? (
              <>
                <div className="flex flex-wrap gap-4 border-b border-border px-4 py-3 text-[12px]">
                  <span>
                    <span className="text-faint">{t("planning.capacity")} </span>
                    <span className="tnum text-text">{sprintPlan.capacity_hours}h</span>
                  </span>
                  <span>
                    <span className="text-faint">{t("planning.planned")} </span>
                    <span className="tnum text-accent">{sprintPlan.planned_hours}h</span>
                  </span>
                  <span>
                    <span className="text-faint">{t("planning.headroom")} </span>
                    <span className="tnum text-text">{sprintPlan.headroom_hours}h</span>
                  </span>
                  <span className="ms-auto text-faint">
                    {sprintPlan.left_out} {t("planning.leftOut")}
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {sprintPlan.tasks.map((task: any) => (
                    <li key={task.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="font-mono text-[11px] tnum text-muted">{task.key}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                        {task.title}
                      </span>
                      <Badge>{task.priority}</Badge>
                      <span className="text-[11px] tnum text-faint">{task.hours}h</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="p-4 text-[13px] text-faint">{t("planning.sprintHint")}</p>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
