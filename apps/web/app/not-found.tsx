"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

export default function NotFound() {
  const t = useT();
  return (
    <div className="glow-warm flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-mono text-[12px] uppercase tracking-widest text-faint">404</p>
      <h1 className="text-[22px] font-semibold tracking-tight">{t("notFound.title")}</h1>
      <p className="max-w-sm text-[13px] text-muted">
        {t("notFound.body")}
      </p>
      <Link
        href="/"
        className="mt-2 rounded-md bg-accent-solid px-3 py-2 text-[13px] font-medium text-accent-fg shadow-[var(--shadow-accent)] transition-colors hover:bg-accent"
      >
        {t("notFound.back")}
      </Link>
    </div>
  );
}
