"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CommandPalette, QuickCreate } from "@/components/layout/command-palette";
import { Shortcuts } from "@/components/layout/shortcuts";
import { useSession } from "@/components/providers";

/**
 * Two floating slabs on the canvas — a navigation rail and the work surface —
 * rather than panes butted against the viewport edge. The gutter is what makes
 * the chrome read as an object on a desk instead of a browser window.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  return (
    <div className="flex h-dvh gap-2 overflow-hidden bg-bg p-0 lg:gap-2.5 lg:p-2.5">
      <Sidebar unread={session.unread_notifications} />
      <div className="slab flex min-w-0 flex-1 flex-col overflow-hidden max-lg:rounded-none max-lg:border-0 max-lg:shadow-none">
        <Topbar />
        <main className="flex-1 overflow-y-auto pb-[4.5rem] lg:pb-0">
          <div className="mx-auto w-full max-w-[1500px] px-4 py-5 md:px-6">{children}</div>
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
      <QuickCreate />
      <Shortcuts />
    </div>
  );
}
