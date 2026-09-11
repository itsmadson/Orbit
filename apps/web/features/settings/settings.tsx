"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, KeyRound, Plug, Shield, User } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { LOCALES, useI18n, useT } from "@/lib/i18n";
import { useItem, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import { PageHeader, Section } from "@/components/shared/page";
import { Avatar, Badge, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { UserPicker } from "@/components/shared/pickers";
import { Column, DataTable } from "@/components/shared/data";
import { ActivityFeed } from "@/components/shared/entity";
import { cn, formatDate, humanize } from "@/lib/utils";

export function SettingsView() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  const client = useQueryClient();
  const { user, company, permissions, can } = useSession();

  const [profile, setProfile] = React.useState({
    full_name: user.full_name,
    title: user.title ?? "",
    phone: "",
    location: "",
  });
  const [passwords, setPasswords] = React.useState({ current_password: "", new_password: "" });
  const [saving, setSaving] = React.useState(false);

  const integrations = useItem<any[]>("/integrations", undefined, {
    enabled: can("integrations.read"),
  } as any);
  const audit = useList<any>("/audit", { page_size: 25 }, { enabled: can("audit.read") } as any);
  const grants = useItem<any[]>("/permissions/grants", undefined, {
    enabled: can("settings.read"),
  } as any);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch("/auth/me", profile);
      toast.success(t("action.save"));
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.post("/auth/change-password", passwords);
      toast.success("Password updated");
      setPasswords({ current_password: "", new_password: "" });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const setTheme = (theme: "dark" | "light") => {
    document.documentElement.dataset.theme = theme;
    document.cookie = `orbit_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
    api.patch("/auth/me", { theme }).catch(() => null);
  };

  return (
    <div>
      <PageHeader title={t("settings.title")} subtitle={company.name} />

      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile">{t("settings.profile")}</TabsTrigger>
          <TabsTrigger value="appearance">{t("settings.appearance")}</TabsTrigger>
          <TabsTrigger value="security">{t("settings.security")}</TabsTrigger>
          {can("integrations.read") ? (
            <TabsTrigger value="integrations">{t("settings.integrations")}</TabsTrigger>
          ) : null}
          {can("settings.read") ? (
            <TabsTrigger value="permissions">{t("settings.permissions")}</TabsTrigger>
          ) : null}
          {can("audit.read") ? <TabsTrigger value="audit">{t("nav.audit")}</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="profile">
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={t("settings.profile")}>
              <form className="space-y-3" onSubmit={saveProfile}>
                <div className="mb-2 flex items-center gap-3">
                  <Avatar name={user.full_name} color={user.avatar_color} size={44} />
                  <div>
                    <p className="text-[14px] font-medium">{user.full_name}</p>
                    <p className="text-[12px] text-muted">{user.email}</p>
                  </div>
                  <Badge className="ms-auto">{humanize(user.role)}</Badge>
                </div>
                <Field label={t("common.name")}>
                  <Input
                    value={profile.full_name}
                    onChange={(event) => setProfile({ ...profile, full_name: event.target.value })}
                  />
                </Field>
                <Field label="Title">
                  <Input
                    value={profile.title}
                    onChange={(event) => setProfile({ ...profile, title: event.target.value })}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Phone">
                    <Input
                      value={profile.phone}
                      onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                    />
                  </Field>
                  <Field label="Location">
                    <Input
                      value={profile.location}
                      onChange={(event) => setProfile({ ...profile, location: event.target.value })}
                    />
                  </Field>
                </div>
                <Button type="submit" variant="primary" loading={saving}>
                  {t("action.save")}
                </Button>
              </form>
            </Section>

            <Section title={t("settings.company")}>
              <div className="flex items-center gap-3">
                <span className="text-[28px]">{company.logo_emoji}</span>
                <div>
                  <p className="text-[15px] font-medium">{company.name}</p>
                  <p className="text-[12px] text-muted">
                    {company.slug} · {company.currency}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-[12px] text-muted">
                <p className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" />
                  Your role grants {permissions.length} permissions
                </p>
                <p className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5" />
                  Authorization is enforced by the API on every request
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {permissions.slice(0, 18).map((permission) => (
                  <Badge key={permission}>{permission}</Badge>
                ))}
                {permissions.length > 18 ? (
                  <Badge>+{permissions.length - 18}</Badge>
                ) : null}
              </div>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="appearance">
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={t("common.theme")}>
              <div className="grid grid-cols-2 gap-3">
                {(["dark", "light"] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => setTheme(theme)}
                    className="rounded-lg border border-border p-3 text-start transition-colors hover:border-accent/40"
                  >
                    <div
                      className={cn(
                        "mb-2 h-16 rounded-md border",
                        theme === "dark" ? "border-[#1d2839] bg-[#070a12]" : "border-[#e5e5ea] bg-[#f4f4f6]",
                      )}
                    >
                      <div
                        className={cn(
                          "m-2 h-3 w-16 rounded",
                          theme === "dark" ? "bg-[#f4511e]" : "bg-[#d44212]",
                        )}
                      />
                      <div
                        className={cn(
                          "mx-2 h-2 w-24 rounded",
                          theme === "dark" ? "bg-[#1d2839]" : "bg-[#e5e5ea]",
                        )}
                      />
                    </div>
                    <span className="text-[13px]">{t(`common.${theme}`)}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title={t("common.language")}>
              <div className="space-y-2">
                {LOCALES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setLocale(option.value);
                      api.patch("/auth/me", { locale: option.value }).catch(() => null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-3 text-start transition-colors",
                      locale === option.value
                        ? "border-accent/40 bg-accent-soft"
                        : "border-border hover:border-border-strong",
                    )}
                  >
                    <span className="text-[15px]">{option.native}</span>
                    <span className="text-[11px] text-faint">{option.dir.toUpperCase()}</span>
                    {locale === option.value ? (
                      <Check className="ms-auto h-4 w-4 text-accent" />
                    ) : null}
                  </button>
                ))}
                <p className="text-[12px] text-muted">
                  Persian switches the whole interface to right-to-left, including navigation,
                  tables and charts.
                </p>
              </div>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={t("settings.changePassword")}>
              <form className="space-y-3" onSubmit={changePassword}>
                <Field label={t("settings.currentPassword")}>
                  <Input
                    type="password"
                    required
                    value={passwords.current_password}
                    onChange={(event) =>
                      setPasswords({ ...passwords, current_password: event.target.value })
                    }
                  />
                </Field>
                <Field label={t("settings.newPassword")} hint="Minimum 8 characters">
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={passwords.new_password}
                    onChange={(event) =>
                      setPasswords({ ...passwords, new_password: event.target.value })
                    }
                  />
                </Field>
                <Button type="submit" variant="primary">
                  <KeyRound className="h-3.5 w-3.5" />
                  {t("action.save")}
                </Button>
              </form>
            </Section>
            <Section title="Session">
              <ul className="space-y-2 text-[13px] text-muted">
                <li>Access tokens are short-lived and stored in httpOnly cookies.</li>
                <li>Refresh tokens are rotated on use and revocable server-side.</li>
                <li>Every sensitive mutation is written to the audit log with your IP.</li>
              </ul>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(integrations.data ?? []).map((integration) => (
              <div key={integration.provider} className="panel p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4 text-muted" />
                    <p className="text-[13px] font-medium">{integration.name}</p>
                  </div>
                  <StatusBadge status={integration.status} />
                </div>
                <p className="mt-1.5 text-[12px] text-muted">{integration.description}</p>
                <p className="mt-2 text-[11px] text-faint">{integration.category}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-muted">
            Integrations implement a common interface on the backend; connecting one is a
            configuration change, not a rewrite.
          </p>
        </TabsContent>

        <TabsContent value="permissions">
          <Section title={t("settings.permissions")} contentClassName="p-0">
            <DataTable
              columns={[
                {
                  key: "user",
                  header: "User",
                  cell: (row: any) => (
                    <span className="flex items-center gap-2">
                      <Avatar name={row.user?.full_name} color={row.user?.avatar_color} size={20} />
                      {row.user?.full_name}
                    </span>
                  ),
                },
                { key: "permission", header: "Permission", cell: (row: any) => <Badge>{row.permission}</Badge> },
                { key: "scope", header: "Scope", cell: (row: any) => <span className="text-[12px] text-muted">{row.scope_type}</span> },
              ]}
              rows={(grants.data ?? []) as any[]}
              loading={grants.isLoading}
              empty={
                <p className="text-[13px] text-faint">
                  No extra grants — everyone runs on their role's permissions.
                </p>
              }
            />
          </Section>
        </TabsContent>

        <TabsContent value="audit">
          <Section title={t("nav.audit")}>
            <ActivityFeed items={(audit.data?.items ?? []) as any[]} />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
