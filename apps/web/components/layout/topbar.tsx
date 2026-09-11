"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bell, Command, Languages, LogOut, Moon, Search, Sun, User } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT, LOCALES } from "@/lib/i18n";
import { useUi } from "@/lib/store";
import { useSession } from "@/components/providers";
import { Avatar, Kbd } from "@/components/ui/misc";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { OrbitMark } from "@/components/layout/sidebar";

export function Topbar() {
  const t = useT();
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const { user } = useSession();
  const setPaletteOpen = useUi((state) => state.setPaletteOpen);

  const { data: counts } = useQuery({
    queryKey: ["inbox-counts"],
    queryFn: () => api.get<{ unread: number }>("/notifications/counts"),
    refetchInterval: 60_000,
  });

  const toggleTheme = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    document.cookie = `orbit_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    api.patch("/auth/me", { theme: next }).catch(() => null);
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] px-3 backdrop-blur-xl lg:px-4">
      <Link href="/" className="flex items-center gap-2 lg:hidden">
        <OrbitMark size={20} />
        <span className="text-[14px] font-semibold tracking-tight">ORBIT</span>
      </Link>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="group ms-auto flex h-9 w-full max-w-md items-center gap-2 rounded-full border border-border bg-surface-2 px-3.5 text-[13px] text-faint transition-colors hover:border-accent/40 hover:text-muted lg:ms-0"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="truncate">{t("palette.placeholder")}</span>
        <span className="ms-auto hidden items-center gap-0.5 sm:flex">
          <Kbd>
            <Command className="inline h-2.5 w-2.5" />K
          </Kbd>
        </span>
      </button>

      <div className="ms-auto flex items-center gap-0.5">
        <Link
          href="/inbox"
          className="relative rounded-xl border border-transparent p-2 text-muted transition-colors hover:border-border hover:bg-surface-2 hover:text-text"
        >
          <Bell className="h-4 w-4" />
          {counts?.unread ? (
            <span className="absolute end-0.5 top-0.5 min-w-[15px] rounded-full bg-accent-solid px-1 text-[9px] font-semibold leading-[15px] text-accent-fg">
              {counts.unread > 99 ? "99+" : counts.unread}
            </span>
          ) : null}
        </Link>

        <Dropdown>
          <DropdownTrigger asChild>
            <button className="rounded-xl border border-transparent p-2 text-muted transition-colors hover:border-border hover:bg-surface-2 hover:text-text">
              <Languages className="h-4 w-4" />
            </button>
          </DropdownTrigger>
          <DropdownContent align="end">
            <DropdownLabel>{t("common.language")}</DropdownLabel>
            {LOCALES.map((option) => (
              <DropdownItem key={option.value} onSelect={() => setLocale(option.value)}>
                <span className="flex-1">{option.native}</span>
                {locale === option.value ? <span className="text-accent">•</span> : null}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>

        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-xl border border-transparent p-2 text-muted transition-colors hover:border-border hover:bg-surface-2 hover:text-text"
        >
          <Sun className="hidden h-4 w-4 [html[data-theme='light']_&]:block" />
          <Moon className="block h-4 w-4 [html[data-theme='light']_&]:hidden" />
        </button>

        <Dropdown>
          <DropdownTrigger asChild>
            <button className="ms-1 rounded-full outline-none ring-accent/40 focus-visible:ring-2">
              <Avatar name={user.full_name} color={user.avatar_color} size={26} />
            </button>
          </DropdownTrigger>
          <DropdownContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-[13px] font-medium">{user.full_name}</p>
              <p className="text-[11px] text-faint">{user.email}</p>
            </div>
            <DropdownSeparator />
            <DropdownItem onSelect={() => router.push(`/employees/${user.id}`)}>
              <User className="h-3.5 w-3.5" />
              {t("settings.profile")}
            </DropdownItem>
            <DropdownItem onSelect={() => router.push("/settings")}>
              {t("nav.settings")}
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem destructive onSelect={signOut}>
              <LogOut className="h-3.5 w-3.5" />
              {t("action.signOut")}
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    </header>
  );
}
