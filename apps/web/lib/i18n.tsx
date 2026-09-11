"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import en from "@/messages/en.json";
import fa from "@/messages/fa.json";

export type Locale = "en" | "fa";

const DICTIONARIES: Record<Locale, Record<string, string>> = { en, fa };

export const LOCALES: { value: Locale; label: string; native: string; dir: "ltr" | "rtl" }[] = [
  { value: "en", label: "English", native: "English", dir: "ltr" },
  { value: "fa", label: "Persian", native: "فارسی", dir: "rtl" },
];

type I18nContextValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  n: (value: string | number) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    document.cookie = `orbit_locale=${next}; path=/; max-age=31536000; samesite=lax`;
    const dir = next === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = next;
    document.documentElement.dir = dir;
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = DICTIONARIES[locale] ?? DICTIONARIES.en;
    return {
      locale,
      dir: locale === "fa" ? "rtl" : "ltr",
      setLocale,
      t: (key, vars) => {
        let text = dictionary[key] ?? DICTIONARIES.en[key] ?? key;
        if (vars) {
          for (const [name, replacement] of Object.entries(vars)) {
            text = text.replace(`{${name}}`, String(replacement));
          }
        }
        return text;
      },
      n: (input) =>
        locale === "fa"
          ? String(input).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])
          : String(input),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

export function useT() {
  return useI18n().t;
}
