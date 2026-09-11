"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileSignature, FileText, Hash, Mail, MailCheck, PenLine, Plus, Settings2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useCreateParam, useDebounced, useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Letter, LetterStats, LetterTemplate } from "@/lib/types";
import { MetricCard, PageHeader, Section } from "@/components/shared/page";
import { Column, DataTable, FilterChips, SearchInput, Toolbar } from "@/components/shared/data";
import { Badge, EmptyState, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { LetterSettings } from "@/features/letters/letter-settings";
import { cn, formatDate } from "@/lib/utils";

const KIND_TONES: Record<string, string> = {
  outgoing: "text-accent",
  incoming: "text-info",
  internal: "text-muted",
};

export function LettersView() {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const q = useDebounced(search);

  const stats = useItem<LetterStats>("/letters/stats");
  const list = useList<Letter>("/letters", {
    q: q || undefined,
    kind: tab === "all" || tab === "settings" ? undefined : tab,
    status: status || undefined,
    page_size: 50,
  });

  const columns: Column<Letter>[] = [
    {
      key: "number",
      header: t("letters.number"),
      className: "w-40",
      cell: (row: Letter) =>
        row.number ? (
          <span dir="auto" className="font-mono text-[12px] tnum text-text">{row.number}</span>
        ) : (
          <span className="text-[11px] text-faint">{t("letters.unnumbered")}</span>
        ),
    },
    {
      key: "subject",
      header: t("letters.subject"),
      cell: (row: Letter) => (
        <div className="min-w-0">
          <div dir="auto" className="truncate font-medium text-text">{row.subject}</div>
          {row.recipient_org || row.recipient_name ? (
            <div dir="auto" className="truncate text-[11px] text-muted">
              {[row.recipient_name, row.recipient_org].filter(Boolean).join(" · ")}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "kind",
      header: t("letters.kind"),
      className: "w-24",
      cell: (row: Letter) => (
        <span className={cn("text-[12px]", KIND_TONES[row.kind])}>
          {t(`letters.${row.kind}`)}
        </span>
      ),
    },
    {
      key: "letter_date",
      header: t("letters.date"),
      className: "w-32",
      cell: (row: Letter) => (
        <span dir="auto" className="text-[12px] tnum text-muted">
          {row.letter_date_display ?? formatDate(row.letter_date, locale)}
        </span>
      ),
    },
    {
      key: "status",
      header: t("common.status"),
      className: "w-36",
      cell: (row: Letter) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("letters.title")}
        subtitle={t("letters.subtitle")}
        actions={
          can("letters.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("letters.new")}
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("letters.title")}
          value={stats.data?.total ?? 0}
          icon={<Mail className="h-[15px] w-[15px]" />}
        />
        <MetricCard
          label={t("letters.drafts")}
          value={stats.data?.drafts ?? 0}
          icon={<PenLine className="h-[15px] w-[15px]" />}
        />
        <MetricCard
          label={t("letters.awaitingSignature")}
          value={stats.data?.awaiting_signature ?? 0}
          icon={<FileSignature className="h-[15px] w-[15px]" />}
          tone={stats.data?.awaiting_signature ? "warning" : "default"}
        />
        <MetricCard
          label={t("letters.nextNumber")}
          value={
            <span dir="auto" className="font-mono text-[18px]">{stats.data?.next_number ?? "—"}</span>
          }
          icon={<Hash className="h-[15px] w-[15px]" />}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="pill" className="mb-4">
          <TabsTrigger variant="pill" value="all">{t("common.all")}</TabsTrigger>
          <TabsTrigger variant="pill" value="outgoing">{t("letters.outgoing")}</TabsTrigger>
          <TabsTrigger variant="pill" value="incoming">{t("letters.incoming")}</TabsTrigger>
          <TabsTrigger variant="pill" value="internal">{t("letters.internal")}</TabsTrigger>
          {can("letters.write") ? (
            <TabsTrigger variant="pill" value="settings">
              {t("letters.settings")}
            </TabsTrigger>
          ) : null}
        </TabsList>

        {["all", "outgoing", "incoming", "internal"].map((value) => (
          <TabsContent key={value} value={value}>
            <Toolbar>
              <SearchInput value={search} onChange={setSearch} className="w-56" />
              <FilterChips
                value={status}
                onChange={(value) => setStatus(value ?? "")}
                options={[
                  { value: "draft", label: t("letters.drafts") },
                  { value: "awaiting_signature", label: t("letters.awaitingSignature") },
                  { value: "signed", label: t("letters.sign") },
                  { value: "sent", label: t("letters.send") },
                  { value: "archived", label: t("letters.archive") },
                ]}
              />
            </Toolbar>
            {list.data?.items.length === 0 ? (
              <EmptyState
                icon={Mail}
                title={t("letters.empty")}
                description={t("letters.emptyHint")}
                action={
                  can("letters.write") ? (
                    <Button variant="primary" onClick={() => setCreateOpen(true)}>
                      {t("letters.new")}
                    </Button>
                  ) : null
                }
              />
            ) : (
              <DataTable
                columns={columns}
                rows={list.data?.items ?? []}
                loading={list.isLoading}
                rowHref={(row) => `/letters/${row.id}`}
              />
            )}
          </TabsContent>
        ))}

        <TabsContent value="settings">
          <LetterSettings />
        </TabsContent>
      </Tabs>

      <ComposeDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function ComposeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const router = useRouter();
  const templates = useItem<LetterTemplate[]>("/letter-templates");
  const [form, setForm] = React.useState({
    text: "",
    subject: "",
    recipient_name: "",
    recipient_org: "",
    template_id: "",
    kind: "outgoing",
    register_now: true,
  });
  const [saving, setSaving] = React.useState(false);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.text.trim()) return;
    setSaving(true);
    try {
      const letter = await api.post<Letter>("/letters/compose", {
        ...form,
        subject: form.subject || undefined,
        recipient_name: form.recipient_name || undefined,
        recipient_org: form.recipient_org || undefined,
        template_id: form.template_id || undefined,
      });
      toast.success(letter.number ? `${t("letters.registered")}: ${letter.number}` : t("letters.new"));
      onOpenChange(false);
      setForm({ ...form, text: "", subject: "", recipient_name: "", recipient_org: "" });
      router.push(`/letters/${letter.id}`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={submit}>
          <DialogHeader title={t("letters.compose")} description={t("letters.composeHint")} />
          <div className="space-y-3 px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("letters.kind")}>
                <SimpleSelect
                  value={form.kind}
                  onValueChange={(value) => set({ kind: value })}
                  options={[
                    { value: "outgoing", label: t("letters.outgoing") },
                    { value: "incoming", label: t("letters.incoming") },
                    { value: "internal", label: t("letters.internal") },
                  ]}
                />
              </Field>
              <Field label={t("letters.template")}>
                <SimpleSelect
                  value={form.template_id}
                  onValueChange={(value) => set({ template_id: value })}
                  placeholder="—"
                  options={[
                    { value: "", label: "—" },
                    ...(templates.data ?? []).map((tpl) => ({
                      value: tpl.id,
                      label: tpl.name,
                    })),
                  ]}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("letters.recipient")}>
                <Input
                  value={form.recipient_name}
                  onChange={(e) => set({ recipient_name: e.target.value })}
                  placeholder="مهندس رضایی"
                />
              </Field>
              <Field label={t("letters.recipientOrg")}>
                <Input
                  value={form.recipient_org}
                  onChange={(e) => set({ recipient_org: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t("letters.subject")} hint={t("common.optional")}>
              <Input
                value={form.subject}
                onChange={(e) => set({ subject: e.target.value })}
              />
            </Field>
            <Field label={t("letters.body")}>
              <Textarea
                value={form.text}
                onChange={(e) => set({ text: e.target.value })}
                rows={9}
                autoFocus
                placeholder={t("letters.composeHint")}
              />
            </Field>
            <label className="flex items-center gap-2 text-[12px] text-muted">
              <input
                type="checkbox"
                checked={form.register_now}
                onChange={(e) => set({ register_now: e.target.checked })}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              {t("letters.register")}
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {t("letters.compose")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
