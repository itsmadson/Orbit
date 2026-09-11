"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, Home, Inbox, Menu, Plus } from "lucide-react";
import * as React from "react";
import { NAV } from "@/lib/nav";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useUi } from "@/lib/store";
import { useSession } from "@/components/providers";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/** Mobile gets a real bottom bar plus a full navigation drawer, not a squeezed sidebar. */
export function MobileNav() {
  const t = useT();
  const pathname = usePathname();
  const { can } = useSession();
  const setQuickCreateOpen = useUi((state) => state.setQuickCreateOpen);
  const [open, setOpen] = React.useState(false);

  const primary = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/tasks", label: t("nav.tasks"), icon: CheckSquare },
    { href: "/inbox", label: t("nav.inbox"), icon: Inbox },
  ];

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-stretch border-t border-border bg-[color-mix(in_oklab,var(--surface)_96%,transparent)] backdrop-blur-xl lg:hidden">
        {primary.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px]",
                active ? "text-accent" : "text-muted",
              )}
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setQuickCreateOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"
        >
          <Plus className="h-4.5 w-4.5" />
          {t("action.create")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"
        >
          <Menu className="h-4.5 w-4.5" />
          {t("common.all")}
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="start" width="max-w-[280px]" className="p-0">
          <div className="border-b border-border px-4 py-3 text-[14px] font-semibold">ORBIT</div>
          <div className="flex-1 overflow-y-auto p-2">
            {NAV.map((group) => {
              const items = group.items.filter((item) => !item.permission || can(item.permission));
              if (!items.length) return null;
              return (
                <div key={group.key} className="mb-3">
                  {group.labelKey ? (
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
                      {t(group.labelKey)}
                    </p>
                  ) : null}
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] text-muted hover:bg-surface-2 hover:text-text"
                    >
                      <item.icon className="h-4 w-4" />
                      {t(item.labelKey)}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
