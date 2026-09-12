"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, LifeBuoy, LogOut, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { OrbitMark } from "@/components/layout/sidebar";
import { Section } from "@/components/shared/page";
import { Avatar, Badge, EmptyState, StatusBadge, TimeAgo } from "@/components/ui/misc";
import { OrbitLoading } from "@/components/ui/orbit-loader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { StatusDot } from "@/features/support/monitors";
import { SlaPill, type Ticket } from "@/features/support/tickets";
import { cn } from "@/lib/utils";

type Overview = {
  company?: { id: string; name: string } | null;
  open_tickets: number;
  tickets: Ticket[];
  monitors: {
    id: string;
    name: string;
    url: string;
    status: string;
    uptime: number;
    last_response_ms?: number | null;
  }[];
  uptime?: number | null;
};

/**
 * The customer's whole world.
 *
 * Deliberately its own shell rather than the staff app with the sidebar hidden:
 * a portal that is one forgotten filter away from the internal UI is a portal
 * that will eventually leak.
 */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const { user, company } = useSession();

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-dvh bg-bg">
      <header className="glow-warm border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 md:px-6">
          <Link href="/portal" className="flex items-center gap-2.5">
            <span className="tile h-8 w-8">
              <OrbitMark size={18} mono />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em]">{company.name}</span>
          </Link>
          <nav className="ms-4 flex items-center gap-1 text-[13px]">
            <Link href="/portal" className="rounded-lg px-2.5 py-1 text-muted hover:bg-surface-2 hover:text-text">
              {t("portal.overview")}
            </Link>
            <Link href="/portal/tickets" className="rounded-lg px-2.5 py-1 text-muted hover:bg-surface-2 hover:text-text">
              {t("support.title")}
            </Link>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <span className="hidden text-[12px] text-muted sm:inline">{user.full_name}</span>
            <Avatar name={user.full_name} color={user.avatar_color} size={26} />
            <Button size="icon-sm" variant="ghost" onClick={signOut} title={t("auth.signOut")}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}

export function PortalOverview() {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const data = useItem<Overview>("/portal/overview");

  if (data.isLoading || !data.data) return <OrbitLoading />;
  const overview = data.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
            {t("portal.welcome")}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">{t("portal.subtitle")}</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t("portal.newTicket")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <div className="flex items-center gap-2.5">
            <span className="tile h-[30px] w-[30px]">
              <LifeBuoy className="h-[15px] w-[15px]" />
            </span>
            <div>
              <p className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted">
                {t("portal.openTickets")}
              </p>
              <p className="text-[23px] font-semibold leading-none tnum">
                {overview.open_tickets}
              </p>
            </div>
          </div>
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-2.5">
            <span className="tile h-[30px] w-[30px]">
              <Activity className="h-[15px] w-[15px]" />
            </span>
            <div>
              <p className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted">
                {t("monitoring.uptime")}
              </p>
              <p className="text-[23px] font-semibold leading-none tnum">
                {overview.uptime !== null && overview.uptime !== undefined
                  ? `${overview.uptime}%`
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {overview.monitors.length ? (
        <Section title={t("portal.systems")} contentClassName="p-0">
          <ul className="divide-y divide-border">
            {overview.monitors.map((monitor) => (
              <li key={monitor.id} className="flex items-center gap-3 px-4 py-2.5">
                <StatusDot status={monitor.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text">{monitor.name}</span>
                  <span className="block truncate text-[11px] text-muted">{monitor.url}</span>
                </span>
                {monitor.last_response_ms ? (
                  <span className="text-[11px] tnum text-muted">
                    {monitor.last_response_ms}ms
                  </span>
                ) : null}
                <span className="w-16 text-end text-[12px] tnum text-text">
                  {monitor.uptime}%
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section
        title={t("support.title")}
        action={
          <Link href="/portal/tickets" className="text-[12px] text-muted hover:text-accent">
            {t("action.viewAll")}
          </Link>
        }
        contentClassName="p-0"
      >
        {overview.tickets.length ? (
          <ul className="divide-y divide-border">
            {overview.tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/portal/tickets/${ticket.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <span className="font-mono text-[11px] tnum text-muted">{ticket.number}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                    {ticket.subject}
                  </span>
                  <SlaPill ticket={ticket} />
                  <StatusBadge status={ticket.status} />
                  <TimeAgo value={ticket.created_at} className="text-[11px] text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-[13px] text-faint">{t("support.empty")}</p>
        )}
      </Section>

      <NewTicketDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function PortalTickets() {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const list = useItem<{ items: Ticket[] }>("/tickets", { page_size: 100 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.02em]">{t("support.title")}</h1>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t("portal.newTicket")}
        </Button>
      </div>

      {list.data?.items.length ? (
        <Section contentClassName="p-0">
          <ul className="divide-y divide-border">
            {list.data.items.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/portal/tickets/${ticket.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="font-mono text-[11px] tnum text-muted">{ticket.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text">{ticket.subject}</span>
                    <span className="block text-[11px] text-muted">
                      {ticket.message_count} {t("portal.replies")}
                    </span>
                  </span>
                  <Badge>{ticket.priority}</Badge>
                  <StatusBadge status={ticket.status} />
                  <TimeAgo value={ticket.created_at} className="text-[11px] text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <EmptyState icon={LifeBuoy} title={t("support.empty")} />
      )}

      <NewTicketDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function NewTicketDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const [form, setForm] = React.useState({ subject: "", body: "", priority: "normal" });
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const ticket = await api.post<Ticket>("/tickets", form);
      toast.success(ticket.number);
      onOpenChange(false);
      setForm({ subject: "", body: "", priority: "normal" });
      client.invalidateQueries({ queryKey: ["/portal/overview"] });
      client.invalidateQueries({ queryKey: ["/tickets"] });
      router.push(`/portal/tickets/${ticket.id}`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader title={t("portal.newTicket")} description={t("portal.ticketHint")} />
          <div className="space-y-3 px-4 py-3">
            <Field label={t("support.subject")}>
              <Input
                required
                autoFocus
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
              />
            </Field>
            <Field label={t("common.priority")}>
              <SimpleSelect
                value={form.priority}
                onValueChange={(priority) => setForm({ ...form, priority })}
                options={["urgent", "high", "normal", "low"].map((p) => ({
                  value: p,
                  label: p,
                }))}
              />
            </Field>
            <Field label={t("support.describe")}>
              <Textarea
                rows={6}
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!form.subject.trim()}>
              {t("action.send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
