import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getSession } from "@/lib/server";
import type { Locale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: {
    default: `${process.env.NEXT_PUBLIC_APP_NAME ?? "ORBIT"} — The operating system for your company`,
    template: `%s · ${process.env.NEXT_PUBLIC_APP_NAME ?? "ORBIT"}`,
  },
  description: "ORBIT connects projects, people, knowledge, operations and money in one workspace.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070a12" },
    { media: "(prefers-color-scheme: light)", color: "#f4f4f6" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = await getSession();
  const locale = ((store.get("orbit_locale")?.value ?? session?.user.locale ?? "en") as Locale) === "fa" ? "fa" : "en";
  const theme = store.get("orbit_theme")?.value ?? session?.user.theme ?? "dark";

  return (
    <html lang={locale} dir={locale === "fa" ? "rtl" : "ltr"} data-theme={theme === "light" ? "light" : "dark"}>
      <body>
        <Providers session={session} locale={locale as Locale}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
