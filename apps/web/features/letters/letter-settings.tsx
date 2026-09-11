"use client";

import * as React from "react";
import { toast } from "sonner";
import { Hash, ImagePlus, Plus, Stamp, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Letterhead, LetterNumbering, LetterTemplate } from "@/lib/types";
import { Section } from "@/components/shared/page";
import { Badge, EmptyState, Separator } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SimpleSelect } from "@/components/ui/select";

/** Header, footer and numbering — captured once, used by every letter. */
export function LetterSettings() {
  const t = useT();
  const { can } = useSession();
  const client = useQueryClient();
  const heads = useItem<Letterhead[]>("/letterheads");
  const numbering = useItem<LetterNumbering>("/letter-numbering");
  const templates = useItem<LetterTemplate[]>("/letter-templates");

  const head = heads.data?.[0];
  const editable = can("letters.write");

  return (
    <div className="space-y-4">
      <NumberingCard
        numbering={numbering.data}
        editable={can("letters.manage")}
        onSaved={() => {
          client.invalidateQueries({ queryKey: ["/letter-numbering"] });
          client.invalidateQueries({ queryKey: ["/letters/stats"] });
        }}
      />
      <LetterheadCard
        head={head}
        editable={editable}
        onSaved={() => client.invalidateQueries({ queryKey: ["/letterheads"] })}
      />
      <TemplatesCard
        templates={templates.data ?? []}
        editable={editable}
        onChanged={() => client.invalidateQueries({ queryKey: ["/letter-templates"] })}
      />
    </div>
  );
}

/* ------------------------------------------------------------- numbering */
function NumberingCard({
  numbering,
  editable,
  onSaved,
}: {
  numbering?: LetterNumbering;
  editable: boolean;
  onSaved: () => void;
}) {
  const t = useT();
  const [form, setForm] = React.useState<Partial<LetterNumbering>>({});
  const [preview, setPreview] = React.useState<{ kind: string; value: string }[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (numbering) setForm(numbering);
  }, [numbering]);

  const pattern = form.pattern ?? "";

  // Ask the server what the formula would produce, so the preview uses the
  // same renderer that mints real numbers rather than a second implementation.
  React.useEffect(() => {
    if (!pattern) return;
    const timer = setTimeout(async () => {
      try {
        const result = await api.get<{ samples: { kind: string; value: string }[] }>(
          "/letter-numbering/preview",
          {
            pattern,
            prefix: form.prefix ?? "",
            calendar: form.calendar ?? "jalali",
            digits: form.digits ?? "fa",
          },
        );
        setPreview(result.samples);
      } catch {
        setPreview([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [pattern, form.prefix, form.calendar, form.digits]);

  async function save() {
    setSaving(true);
    try {
      await api.patch("/letter-numbering", {
        pattern: form.pattern,
        prefix: form.prefix,
        calendar: form.calendar,
        digits: form.digits,
        reset: form.reset,
        scope: form.scope,
        start_at: form.start_at,
        kind_codes: form.kind_codes,
      });
      toast.success(t("action.save"));
      onSaved();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <Hash className="h-3.5 w-3.5 text-accent" />
          {t("letters.numbering")}
        </span>
      }
      action={
        editable ? (
          <Button size="sm" variant="primary" loading={saving} onClick={save}>
            {t("action.save")}
          </Button>
        ) : null
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <Field label={t("letters.pattern")} hint={t("letters.patternHint")}>
            <Input
              value={form.pattern ?? ""}
              onChange={(e) => setForm({ ...form, pattern: e.target.value })}
              disabled={!editable}
              className="font-mono"
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(numbering?.tokens ?? {}).map(([token, description]) => (
              <button
                key={token}
                type="button"
                title={description}
                disabled={!editable}
                onClick={() => setForm({ ...form, pattern: (form.pattern ?? "") + token })}
                className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                {token}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("letters.calendar")}>
              <SimpleSelect
                value={form.calendar ?? "jalali"}
                onValueChange={(value) => setForm({ ...form, calendar: value })}
                disabled={!editable}
                options={[
                  { value: "jalali", label: t("letters.jalali") },
                  { value: "gregorian", label: t("letters.gregorian") },
                ]}
              />
            </Field>
            <Field label={t("letters.digits")}>
              <SimpleSelect
                value={form.digits ?? "fa"}
                onValueChange={(value) => setForm({ ...form, digits: value })}
                disabled={!editable}
                options={[
                  { value: "fa", label: "۱۲۳۴" },
                  { value: "en", label: "1234" },
                ]}
              />
            </Field>
            <Field label={t("letters.reset")}>
              <SimpleSelect
                value={form.reset ?? "yearly"}
                onValueChange={(value) => setForm({ ...form, reset: value })}
                disabled={!editable}
                options={[
                  { value: "yearly", label: t("letters.yearly") },
                  { value: "monthly", label: t("letters.monthly") },
                  { value: "never", label: t("letters.never") },
                ]}
              />
            </Field>
            <Field label={t("letters.scope")}>
              <SimpleSelect
                value={form.scope ?? "per_kind"}
                onValueChange={(value) => setForm({ ...form, scope: value })}
                disabled={!editable}
                options={[
                  { value: "per_kind", label: t("letters.perKind") },
                  { value: "shared", label: t("letters.shared") },
                ]}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-3">
          <div className="panel-glow p-4">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted">
              {t("letters.preview")}
            </p>
            <div className="mt-2 space-y-1.5">
              {preview.map((sample) => (
                <div key={sample.kind} className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-muted">{t(`letters.${sample.kind}`)}</span>
                  <span dir="auto" className="font-mono text-[15px] tnum text-text">{sample.value}</span>
                </div>
              ))}
              {!preview.length ? (
                <p className="text-[12px] text-faint">—</p>
              ) : null}
            </div>
          </div>

          {numbering?.counters?.length ? (
            <div className="panel p-3">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-muted">
                {t("letters.counters")}
              </p>
              <ul className="mt-2 space-y-1">
                {numbering.counters.map((counter) => (
                  <li
                    key={`${counter.scope}-${counter.period}`}
                    className="flex items-center justify-between text-[12px]"
                  >
                    <span className="text-muted">
                      {counter.scope} · {counter.period}
                    </span>
                    <span className="tnum text-text">{counter.next}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ letterhead */
function LetterheadCard({
  head,
  editable,
  onSaved,
}: {
  head?: Letterhead;
  editable: boolean;
  onSaved: () => void;
}) {
  const t = useT();
  const [form, setForm] = React.useState<Partial<Letterhead>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (head) setForm(head);
  }, [head]);

  const set = (patch: Partial<Letterhead>) => setForm((f) => ({ ...f, ...patch }));

  async function readLogo(file: File, key: "logo_data_url" | "signature_data_url" | "stamp_data_url") {
    if (file.size > 1_500_000) {
      toast.error("Image must be under 1.5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set({ [key]: String(reader.result) } as Partial<Letterhead>);
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        name: form.name || "Letterhead",
        org_name: form.org_name ?? "",
        org_subtitle: form.org_subtitle,
        address: form.address,
        phone: form.phone,
        email: form.email,
        website: form.website,
        postal_code: form.postal_code,
        logo_data_url: form.logo_data_url,
        header_image_data_url: form.header_image_data_url,
        footer_image_data_url: form.footer_image_data_url,
        header_image_height_mm: form.header_image_height_mm ?? 26,
        footer_image_height_mm: form.footer_image_height_mm ?? 16,
        header_image_full_bleed: form.header_image_full_bleed ?? true,
        signature_data_url: form.signature_data_url,
        stamp_data_url: form.stamp_data_url,
        footer_html: form.footer_html,
        paper: form.paper ?? "A4",
        direction: form.direction ?? "rtl",
        language: form.language ?? "fa",
        font_size_pt: form.font_size_pt ?? 12,
        margin_top_mm: form.margin_top_mm ?? 38,
        margin_bottom_mm: form.margin_bottom_mm ?? 28,
        margin_x_mm: form.margin_x_mm ?? 22,
        accent_color: form.accent_color ?? "#f4511e",
        is_default: true,
      };
      if (head) await api.patch(`/letterheads/${head.id}`, body);
      else await api.post("/letterheads", body);
      toast.success(t("action.save"));
      onSaved();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title={
        <span className="flex items-center gap-1.5">
          <Stamp className="h-3.5 w-3.5 text-accent" />
          {t("letters.letterhead")}
        </span>
      }
      action={
        editable ? (
          <Button size="sm" variant="primary" loading={saving} onClick={save}>
            {t("action.save")}
          </Button>
        ) : null
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label={t("letters.letterhead")}>
            <Input
              value={form.org_name ?? ""}
              onChange={(e) => set({ org_name: e.target.value })}
              disabled={!editable}
              placeholder="شرکت اوربیت"
            />
          </Field>
          <Field label={t("common.description")}>
            <Input
              value={form.org_subtitle ?? ""}
              onChange={(e) => set({ org_subtitle: e.target.value })}
              disabled={!editable}
            />
          </Field>
          <Field label="Logo" hint="Used when no header banner is set">
            <div className="flex items-center gap-3">
              {form.logo_data_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.logo_data_url}
                  alt=""
                  className="h-10 w-auto rounded border border-border bg-white p-1"
                />
              ) : null}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                disabled={!editable}
                onChange={(e) =>
                  e.target.files?.[0] && readLogo(e.target.files[0], "logo_data_url")
                }
                className="text-[12px] text-muted file:me-2 file:rounded-md file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-[12px] file:text-text"
              />
            </div>
          </Field>
          <Field label="Address">
            <Textarea
              value={form.address ?? ""}
              onChange={(e) => set({ address: e.target.value })}
              rows={2}
              disabled={!editable}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <Input
                value={form.phone ?? ""}
                onChange={(e) => set({ phone: e.target.value })}
                disabled={!editable}
              />
            </Field>
            <Field label="Email">
              <Input
                value={form.email ?? ""}
                onChange={(e) => set({ email: e.target.value })}
                disabled={!editable}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("letters.calendar")}>
              <SimpleSelect
                value={form.language ?? "fa"}
                onValueChange={(value) =>
                  set({ language: value, direction: value === "fa" ? "rtl" : "ltr" })
                }
                disabled={!editable}
                options={[
                  { value: "fa", label: "فارسی (RTL)" },
                  { value: "en", label: "English (LTR)" },
                ]}
              />
            </Field>
            <Field label="Paper">
              <SimpleSelect
                value={form.paper ?? "A4"}
                onValueChange={(value) => set({ paper: value })}
                disabled={!editable}
                options={[
                  { value: "A4", label: "A4" },
                  { value: "A5", label: "A5" },
                  { value: "Letter", label: "US Letter" },
                ]}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Top (mm)">
              <Input
                type="number"
                value={form.margin_top_mm ?? 38}
                onChange={(e) => set({ margin_top_mm: Number(e.target.value) })}
                disabled={!editable}
              />
            </Field>
            <Field label="Bottom (mm)">
              <Input
                type="number"
                value={form.margin_bottom_mm ?? 28}
                onChange={(e) => set({ margin_bottom_mm: Number(e.target.value) })}
                disabled={!editable}
              />
            </Field>
            <Field label="Sides (mm)">
              <Input
                type="number"
                value={form.margin_x_mm ?? 22}
                onChange={(e) => set({ margin_x_mm: Number(e.target.value) })}
                disabled={!editable}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Signature image">
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={!editable}
                onChange={(e) =>
                  e.target.files?.[0] && readLogo(e.target.files[0], "signature_data_url")
                }
                className="text-[12px] text-muted file:me-2 file:rounded-md file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-[12px] file:text-text"
              />
            </Field>
            <Field label="Stamp image">
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={!editable}
                onChange={(e) =>
                  e.target.files?.[0] && readLogo(e.target.files[0], "stamp_data_url")
                }
                className="text-[12px] text-muted file:me-2 file:rounded-md file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-[12px] file:text-text"
              />
            </Field>
          </div>
          <p className="text-[11px] leading-relaxed text-faint">
            The signature and stamp are printed only once a letter is signed.
          </p>

          <Separator />

          {/* Pre-printed stationery. When a banner is set it replaces the
              generated header or footer entirely. */}
          <BannerField
            label={t("letters.headerImage")}
            hint={t("letters.bannerHint")}
            value={form.header_image_data_url}
            height={form.header_image_height_mm ?? 26}
            maxHeight={70}
            editable={editable}
            onChange={(value) => set({ header_image_data_url: value })}
            onHeight={(mm) => set({ header_image_height_mm: mm })}
          />
          <BannerField
            label={t("letters.footerImage")}
            value={form.footer_image_data_url}
            height={form.footer_image_height_mm ?? 16}
            maxHeight={50}
            editable={editable}
            onChange={(value) => set({ footer_image_data_url: value })}
            onHeight={(mm) => set({ footer_image_height_mm: mm })}
          />
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={form.header_image_full_bleed ?? true}
              disabled={!editable}
              onChange={(e) => set({ header_image_full_bleed: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            {t("letters.fullBleed")}
          </label>
        </div>
      </div>
    </Section>
  );
}

/** Upload for a wide, short stationery banner, previewed at its real width. */
function BannerField({
  label,
  hint,
  value,
  height,
  onChange,
  onHeight,
  editable,
  maxHeight,
}: {
  label: string;
  hint?: string;
  value?: string | null;
  height: number;
  onChange: (dataUrl: string | null) => void;
  onHeight: (mm: number) => void;
  editable: boolean;
  maxHeight: number;
}) {
  const t = useT();
  const inputRef = React.useRef<HTMLInputElement>(null);

  function read(file: File) {
    if (file.size > 3_000_000) {
      toast.error("Image must be under 3 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-text">{label}</p>
          {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
        </div>
        {value && editable ? (
          <Button size="xs" variant="ghost" onClick={() => onChange(null)}>
            {t("letters.removeImage")}
          </Button>
        ) : null}
      </div>

      <button
        type="button"
        disabled={!editable}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-surface-2 transition-colors",
          editable && "hover:border-accent/50",
          !value && "py-6",
        )}
        style={value ? { aspectRatio: `210 / ${Math.max(height, 6)}` } : undefined}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            <ImagePlus className="h-3.5 w-3.5" />
            {t("letters.bannerHint")}
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
      />

      <label className="flex items-center gap-2 text-[11px] text-muted">
        <span className="w-24 shrink-0">{t("letters.bannerHeight")}</span>
        <input
          type="range"
          min={8}
          max={maxHeight}
          value={height}
          disabled={!editable}
          onChange={(e) => onHeight(Number(e.target.value))}
          className="h-1 flex-1 accent-[var(--accent)]"
        />
        <span className="w-8 text-end tnum text-text">{height}</span>
      </label>
    </div>
  );
}

/* -------------------------------------------------------------- templates */
function TemplatesCard({
  templates,
  editable,
  onChanged,
}: {
  templates: LetterTemplate[];
  editable: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({
    name: "",
    kind: "outgoing",
    subject: "",
    salutation: "جناب آقای/سرکار خانم {{recipient}}",
    body: "",
    closing: "با تشکر و احترام",
  });

  async function create() {
    if (!draft.name.trim()) return;
    try {
      await api.post("/letter-templates", draft);
      toast.success(t("action.save"));
      setOpen(false);
      setDraft({ ...draft, name: "", subject: "", body: "" });
      onChanged();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    }
  }

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: t("letters.deleteTemplate"),
      body: t("letters.deleteTemplateBody").replace("{name}", name),
      confirmLabel: t("action.delete"),
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/letter-templates/${id}`);
    onChanged();
  }

  return (
    <Section
      title={t("letters.templates")}
      action={
        editable ? (
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
            <Plus className="h-3.5 w-3.5" />
            {t("letters.newTemplate")}
          </Button>
        ) : null
      }
      contentClassName="p-0"
    >
      {open ? (
        <div className="space-y-3 border-b border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.name")}>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label={t("letters.kind")}>
              <SimpleSelect
                value={draft.kind}
                onValueChange={(value) => setDraft({ ...draft, kind: value })}
                options={[
                  { value: "outgoing", label: t("letters.outgoing") },
                  { value: "incoming", label: t("letters.incoming") },
                  { value: "internal", label: t("letters.internal") },
                ]}
              />
            </Field>
          </div>
          <Field label={t("letters.salutation")} hint="{{recipient}}">
            <Input
              value={draft.salutation}
              onChange={(e) => setDraft({ ...draft, salutation: e.target.value })}
            />
          </Field>
          <Field label={t("letters.body")}>
            <Textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={4}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button variant="primary" size="sm" onClick={create}>
              {t("action.save")}
            </Button>
          </div>
        </div>
      ) : null}

      {templates.length ? (
        <ul className="divide-y divide-border">
          {templates.map((template) => (
            <li key={template.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-text">
                    {template.name}
                  </span>
                  <Badge>{t(`letters.${template.kind}`)}</Badge>
                  {template.is_default ? <Badge tone="active">default</Badge> : null}
                </div>
                {template.description ? (
                  <p className="truncate text-[11px] text-muted">{template.description}</p>
                ) : null}
              </div>
              <span className="text-[11px] tnum text-faint">{template.usage_count}×</span>
              {editable ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => remove(template.id, template.name)}
                  aria-label={t("action.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-[13px] text-faint">{t("common.empty")}</p>
      )}
    </Section>
  );
}
