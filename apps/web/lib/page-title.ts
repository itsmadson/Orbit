import type { Metadata } from "next";
import { cookies } from "next/headers";
import en from "@/messages/en.json";
import fa from "@/messages/fa.json";

const DICTIONARIES: Record<string, Record<string, string>> = { en, fa };

/** Server-side lookup for the few strings rendered before the client i18n exists. */
export async function serverT() {
  const locale = (await cookies()).get("orbit_locale")?.value === "fa" ? "fa" : "en";
  return (key: string) => DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key;
}

/**
 * The browser-tab title, in the reader's language.
 *
 *   export const generateMetadata = pageTitle("nav.tasks");
 */
export function pageTitle(key: string) {
  return async (): Promise<Metadata> => ({ title: (await serverT())(key) });
}
