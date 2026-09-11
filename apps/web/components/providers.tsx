"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState } from "react";
import { Toaster } from "sonner";
import { I18nProvider, type Locale } from "@/lib/i18n";
import { TooltipProvider } from "@/components/ui/misc";
import type { SessionUser } from "@/lib/server";

type SessionContextValue = SessionUser & {
  can: (permission: string) => boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside Providers");
  return context;
}

/** Frontend permission checks are for UX only — the API enforces them again. */
function buildCan(permissions: string[]) {
  const set = new Set(permissions);
  return (permission: string) => {
    if (set.has(permission)) return true;
    const [domain, action] = permission.split(".");
    if (action === "read") return set.has(`${domain}.write`) || set.has(`${domain}.manage`);
    if (action === "write") return set.has(`${domain}.manage`);
    return false;
  };
}

export function Providers({
  children,
  session,
  locale,
}: {
  children: React.ReactNode;
  session?: SessionUser | null;
  locale: Locale;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: false,
            retry: (count, error: any) => (error?.status === 401 ? false : count < 1),
          },
        },
      }),
  );

  const value = useMemo<SessionContextValue | null>(
    () => (session ? { ...session, can: buildCan(session.permissions) } : null),
    [session],
  );

  const content = (
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale={locale}>
        <TooltipProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--elevated)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: "13px",
              },
            }}
          />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );

  if (!value) return content;
  return <SessionContext.Provider value={value}>{content}</SessionContext.Provider>;
}
