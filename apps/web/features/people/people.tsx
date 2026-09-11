"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck, Briefcase, CalendarDays, Check, Clock, Mail, MapPin, Plus, UserPlus, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreate, useCreateParam, useDebounced, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import { Column, DataTable, FilterChips, SearchInput, Toolbar } from "@/components/shared/data";
import { DetailRow, LoadingPanel, RelatedPanel } from "@/components/shared/entity";
import { Avatar, Badge, EmptyState, Progress, Skeleton, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { UserPicker } from "@/components/shared/pickers";
import { cn, formatCurrency, formatDate, humanize, relativeTime } from "@/lib/utils";

type Employee = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  title?: string | null;
  avatar_color: string;
  department?: { id: string; name: string; color: string } | null;
  manager?: any;
  location?: string | null;
  employment_type: string;
  hired_at?: string | null;
  is_active: boolean;
};

const ROLES = [
  "company_admin", "manager", "project_manager", "employee", "finance", "hr", "rd", "viewer",
];

export function EmployeesView() {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [query, setQuery] = React.useState("");
  const [department, setDepartment] = React.useState<string | undefined>();
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const search = useDebounced(query);

  const departments = useItem<any[]>("/departments");
  const list = useList<Employee>("/users", {
    q: search,
    department_id: department,
    page_size: 60,
  });

  const columns: Column<Employee>[] = [
    {
      key: "name",
      header: t("common.name"),
      cell: (row) => (
        <span className="flex items-center gap-2">
          <Avatar name={row.full_name} color={row.avatar_color} size={22} />
          <span className="truncate font-medium">{row.full_name}</span>
        </span>
      ),
    },
    { key: "title", header: "Title", cell: (row) => <span className="text-[12px] text-muted">{row.title ?? "—"}</span> },
    {
      key: "department",
      header: t("common.department"),
      cell: (row) =>
        row.department ? (
          <span className="flex items-center gap-1.5 text-[12px]">
            <span className="h-2 w-2 rounded-full" style={{ background: row.department.color }} />
            {row.department.name}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    { key: "role", header: t("common.role"), cell: (row) => <Badge>{humanize(row.role)}</Badge> },
    { key: "manager", header: t("people.manager"), cell: (row) => <span className="text-[12px] text-muted">{row.manager?.full_name ?? "—"}</span> },
    {
      key: "hired",
      header: t("people.hiredOn"),
      align: "end",
      cell: (row) => <span className="text-[12px] text-muted">{formatDate(row.hired_at, locale)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("people.title")}
        subtitle={`${list.data?.total ?? 0} people`}
        actions={
          can("users.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              {t("people.new")}
            </Button>
          ) : null
        }
      />

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} className="w-56" />
        <FilterChips
          value={department}
          onChange={setDepartment}
          options={(departments.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
        />
        <div className="ms-auto flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5">
          {(["grid", "list"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={cn(
                "rounded px-2 py-1 text-[11px]",
                view === mode ? "bg-elevated text-text" : "text-muted",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </Toolbar>

      {view === "list" ? (
        <div className="panel overflow-hidden">
          <DataTable
            columns={columns}
            rows={list.data?.items ?? []}
            loading={list.isLoading}
            rowHref={(row) => `/employees/${row.id}`}
            empty={<EmptyState icon={Users} title={t("common.empty")} />}
          />
        </div>
      ) : list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(list.data?.items ?? []).map((person) => (
            <Link
              key={person.id}
              href={`/employees/${person.id}`}
              className="panel flex items-start gap-3 p-3.5 transition-all hover:-translate-y-px hover:border-border-strong"
            >
              <Avatar name={person.full_name} color={person.avatar_color} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{person.full_name}</p>
                <p className="truncate text-[11px] text-muted">{person.title}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {person.department ? (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px]"
                      style={{
                        background: `color-mix(in oklab, ${person.department.color} 16%, transparent)`,
                        color: person.department.color,
                      }}
                    >
                      {person.department.name}
                    </span>
                  ) : null}
                  <Badge>{humanize(person.role)}</Badge>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <EmployeeDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function EmployeeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const departments = useItem<any[]>("/departments");
  const [form, setForm] = React.useState({
    full_name: "",
    email: "",
    password: "",
    role: "employee",
    title: "",
    department_id: "",
    manager_id: null as string | null,
    employment_type: "full_time",
    hired_at: new Date().toISOString().slice(0, 10),
  });

  const create = useCreate<Employee>("/users", {
    invalidate: ["/users", "directory", "/hr/summary"],
    success: "Employee added",
    onDone: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={t("people.new")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({
              ...form,
              department_id: form.department_id || null,
              hired_at: form.hired_at || null,
            } as any);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.name")}>
              <Input
                required
                autoFocus
                value={form.full_name}
                onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              />
            </Field>
            <Field label={t("common.email")}>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </Field>
            <Field label={t("auth.password")} hint="min 8 characters">
              <Input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </Field>
            <Field label="Title">
              <Input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </Field>
            <Field label={t("common.role")}>
              <SimpleSelect
                value={form.role}
                onValueChange={(role) => setForm({ ...form, role })}
                options={ROLES.map((value) => ({ value, label: humanize(value) }))}
              />
            </Field>
            <Field label={t("common.department")}>
              <SimpleSelect
                value={form.department_id}
                onValueChange={(department_id) => setForm({ ...form, department_id })}
                placeholder={t("common.none")}
                options={(departments.data ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            </Field>
            <Field label={t("people.manager")}>
              <UserPicker value={form.manager_id} onChange={(manager_id) => setForm({ ...form, manager_id })} />
            </Field>
            <Field label={t("people.hiredOn")}>
              <Input
                type="date"
                value={form.hired_at}
                onChange={(event) => setForm({ ...form, hired_at: event.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {t("action.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EmployeeProfile({ userId }: { userId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const { company, user: me, can } = useSession();
  const client = useQueryClient();
  const [skill, setSkill] = React.useState("");

  const { data, isLoading } = useItem<any>(`/users/${userId}/profile`);
  const attendance = useItem<any[]>("/hr/attendance", { user_id: userId });

  if (isLoading || !data) return <LoadingPanel />;
  const person = data.user;
  const isSelf = me.id === userId;

  const addSkill = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!skill.trim()) return;
    try {
      await api.post(`/hr/users/${userId}/skills`, { name: skill, level: 3 });
      setSkill("");
      client.invalidateQueries({ queryKey: [`/users/${userId}/profile`] });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t("people.title"), href: "/employees" }, { label: person.full_name }]}
        icon={<Avatar name={person.full_name} color={person.avatar_color} size={40} />}
        title={person.full_name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            <span>{person.title}</span>
            {person.department ? (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: person.department.color }} />
                {person.department.name}
              </span>
            ) : null}
            <a href={`mailto:${person.email}`} className="flex items-center gap-1 hover:text-accent">
              <Mail className="h-3 w-3" />
              {person.email}
            </a>
            {person.location ? (
              <span className="flex items-center gap-1 text-faint">
                <MapPin className="h-3 w-3" />
                {person.location}
              </span>
            ) : null}
          </span>
        }
        actions={<Badge>{humanize(person.role)}</Badge>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Open tasks" value={data.stats.open_tasks} icon={<Briefcase className="h-3.5 w-3.5" />} />
        <MetricCard label="Completed" value={data.stats.done_tasks} tone="positive" />
        <MetricCard label={t("nav.projects")} value={data.projects.length} />
        <MetricCard
          label={t("people.hiredOn")}
          value={formatDate(person.hired_at, locale)}
          hint={person.employment_type ? humanize(person.employment_type) : undefined}
          icon={<CalendarDays className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Section title={t("nav.projects")} contentClassName="p-0">
            <ul>
              {data.projects.map((project: any) => (
                <li key={project.id} className="border-b border-border/60 last:border-0">
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-2"
                  >
                    <span>{project.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{project.name}</span>
                    <StatusBadge status={project.status} />
                  </Link>
                </li>
              ))}
              {!data.projects.length ? (
                <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
              ) : null}
            </ul>
          </Section>

          {(isSelf || can("hr.read")) && attendance.data?.length ? (
            <Section title={t("hr.attendance")} contentClassName="p-3">
              <div className="flex flex-wrap gap-1">
                {attendance.data.slice(0, 30).reverse().map((record) => (
                  <span
                    key={record.id}
                    title={`${record.work_date} · ${record.status} · ${record.hours}h`}
                    className={cn(
                      "h-6 w-6 rounded",
                      record.status === "present"
                        ? "bg-positive/70"
                        : record.status === "remote"
                          ? "bg-accent/70"
                          : record.status === "leave"
                            ? "bg-warning/60"
                            : "bg-surface-2",
                    )}
                  />
                ))}
              </div>
            </Section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Section
            title={t("people.skills")}
            contentClassName="p-3"
          >
            <ul className="space-y-2">
              {data.skills.map((item: any) => (
                <li key={item.id}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span>{item.name}</span>
                    <span className="text-faint">{item.level}/5</span>
                  </div>
                  <Progress value={(item.level / 5) * 100} />
                </li>
              ))}
              {!data.skills.length ? <p className="text-[13px] text-faint">{t("common.empty")}</p> : null}
            </ul>
            {isSelf || can("hr.write") ? (
              <form onSubmit={addSkill} className="mt-3 flex gap-2">
                <Input
                  value={skill}
                  onChange={(event) => setSkill(event.target.value)}
                  placeholder={t("action.add")}
                  className="h-7"
                />
                <Button type="submit" size="sm" variant="secondary">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </form>
            ) : null}
          </Section>

          <Section title={t("common.details")} contentClassName="p-3">
            <div className="divide-y divide-border/60">
              <DetailRow label={t("people.manager")}>{person.manager?.full_name ?? "—"}</DetailRow>
              <DetailRow label={t("people.employment")}>{humanize(person.employment_type)}</DetailRow>
              <DetailRow label={t("common.language")}>{person.locale}</DetailRow>
              {data.salary ? (
                <DetailRow label="Salary">
                  {formatCurrency(data.salary, company.currency, locale, true)}
                </DetailRow>
              ) : null}
            </div>
          </Section>

          {data.reports?.length ? (
            <Section title={t("people.reports")} contentClassName="p-3">
              <ul className="space-y-2">
                {data.reports.map((report: any) => (
                  <li key={report.id}>
                    <Link href={`/employees/${report.id}`} className="flex items-center gap-2 text-[13px] hover:text-accent">
                      <Avatar name={report.full_name} color={report.avatar_color} size={20} />
                      {report.full_name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title={t("common.related")} contentClassName="p-2">
            <RelatedPanel entityType="user" entityId={userId} />
          </Section>
        </aside>
      </div>
    </div>
  );
}

export function HrView() {
  const t = useT();
  const { locale } = useI18n();
  const client = useQueryClient();
  const { can, user } = useSession();
  const [leaveOpen, setLeaveOpen] = React.useState(false);

  const summary = useItem<any>("/hr/summary", undefined, { enabled: can("hr.read") } as any);
  const leave = useList<any>("/hr/leave", { page_size: 50 });
  const onboarding = useItem<any[]>("/hr/onboarding", undefined, {
    enabled: can("hr.read"),
  } as any);

  const decide = async (id: string, status: string) => {
    try {
      await api.post(`/hr/leave/${id}/decision`, { status });
      client.invalidateQueries({ queryKey: ["/hr/leave"] });
      client.invalidateQueries({ queryKey: ["/hr/summary"] });
      toast.success(humanize(status));
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const checkIn = async () => {
    try {
      const record = await api.post<any>("/hr/attendance/check-in");
      toast.success(record.check_out ? t("hr.checkOut") : t("hr.checkIn"));
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("hr.title")}
        subtitle="People operations: leave, attendance and onboarding"
        actions={
          <>
            <Button variant="secondary" onClick={checkIn}>
              <Clock className="h-3.5 w-3.5" />
              {t("hr.checkIn")}
            </Button>
            <Button variant="primary" onClick={() => setLeaveOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("hr.requestLeave")}
            </Button>
          </>
        }
      />

      {can("hr.read") ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label={t("dashboard.headcount")} value={summary.data?.headcount ?? 0} icon={<Users className="h-3.5 w-3.5" />} />
          <MetricCard label={t("hr.onLeaveToday")} value={summary.data?.on_leave_today ?? 0} />
          <MetricCard
            label={t("hr.pendingLeave")}
            value={summary.data?.pending_leave ?? 0}
            tone={summary.data?.pending_leave ? "warning" : "default"}
          />
          <MetricCard label={t("hr.newHires")} value={summary.data?.new_hires_90d ?? 0} tone="positive" />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={t("hr.leave")} className="lg:col-span-2" contentClassName="p-0">
          <ul>
            {(leave.data?.items ?? []).map((request: any) => (
              <li
                key={request.id}
                className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0"
              >
                <Avatar name={request.user?.full_name} color={request.user?.avatar_color} size={24} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">
                    {request.user?.full_name}
                    <Badge className="ms-2">{humanize(request.type)}</Badge>
                  </p>
                  <p className="text-[11px] text-faint">
                    {formatDate(request.start_date, locale)} → {formatDate(request.end_date, locale)} ·{" "}
                    {request.days} days
                  </p>
                </div>
                <StatusBadge status={request.status} />
                {request.status === "pending" && (can("hr.write") || request.approver?.id === user.id) ? (
                  <span className="flex gap-1">
                    <Button size="icon-sm" variant="secondary" onClick={() => decide(request.id, "approved")}>
                      <Check className="h-3.5 w-3.5 text-positive" />
                    </Button>
                    <Button size="icon-sm" variant="secondary" onClick={() => decide(request.id, "rejected")}>
                      <X className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
            {!leave.data?.items.length ? (
              <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
            ) : null}
          </ul>
        </Section>

        <div className="space-y-4">
          {can("hr.read") ? (
            <>
              <Section title={t("analytics.byDepartment")} contentClassName="p-3">
                <ul className="space-y-2">
                  {(summary.data?.by_department ?? []).map((item: any) => (
                    <li key={item.name} className="flex items-center gap-2 text-[13px]">
                      <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                      <span className="flex-1 truncate text-muted">{item.name}</span>
                      <span>{item.count}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title={t("hr.onboarding")} contentClassName="p-3">
                <ul className="space-y-2">
                  {(onboarding.data ?? []).slice(0, 8).map((item: any) => (
                    <li key={item.id} className="flex items-center gap-2 text-[13px]">
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full border text-[9px]",
                          item.status === "done"
                            ? "border-positive bg-positive/15 text-positive"
                            : "border-border text-faint",
                        )}
                      >
                        {item.status === "done" ? <Check className="h-2.5 w-2.5" /> : ""}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span className="text-[11px] text-faint">{item.user_name}</span>
                    </li>
                  ))}
                  {!onboarding.data?.length ? (
                    <p className="text-[13px] text-faint">{t("common.empty")}</p>
                  ) : null}
                </ul>
              </Section>
            </>
          ) : null}
        </div>
      </div>

      <LeaveDialog open={leaveOpen} onOpenChange={setLeaveOpen} />
    </div>
  );
}

function LeaveDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const [form, setForm] = React.useState({
    type: "vacation",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  const create = useCreate("/hr/leave", {
    invalidate: ["/hr/leave", "/hr/summary"],
    success: "Leave requested",
    onDone: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader title={t("hr.requestLeave")} />
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(form as any);
          }}
        >
          <Field label={t("common.type")}>
            <SimpleSelect
              value={form.type}
              onValueChange={(type) => setForm({ ...form, type })}
              options={["vacation", "sick", "unpaid", "remote"].map((value) => ({
                value,
                label: humanize(value),
              }))}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From">
              <Input
                type="date"
                required
                value={form.start_date}
                onChange={(event) => setForm({ ...form, start_date: event.target.value })}
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                required
                value={form.end_date}
                onChange={(event) => setForm({ ...form, end_date: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Reason">
            <Input
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {t("action.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
