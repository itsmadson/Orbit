/**
 * Currencies the workspace can keep its books in.
 *
 * Most are ISO 4217 and go through Intl. Toman is the one worth the code: it is
 * what Iranians actually quote prices in, it has no ISO code — so Intl throws on
 * it — and it is worth ten rial. It is therefore formatted by hand, with the
 * symbol after the amount the way Persian writes it.
 */

export type Currency = {
  code: string;
  name_en: string;
  name_fa: string;
  symbol_en: string;
  symbol_fa: string;
  decimals: number;
  iso: boolean;
  symbol_position: "before" | "after";
  base_code?: string | null;
  base_rate?: number;
};

export const CURRENCIES: Currency[] = [
  { code: "IRT", name_en: "Toman", name_fa: "تومان", symbol_en: "IRT", symbol_fa: "تومان",
    decimals: 0, iso: false, symbol_position: "after", base_code: "IRR", base_rate: 10 },
  { code: "IRR", name_en: "Iranian rial", name_fa: "ریال ایران", symbol_en: "﷼",
    symbol_fa: "ریال", decimals: 0, iso: true, symbol_position: "after" },
  { code: "USD", name_en: "US dollar", name_fa: "دلار آمریکا", symbol_en: "$",
    symbol_fa: "$", decimals: 2, iso: true, symbol_position: "before" },
  { code: "EUR", name_en: "Euro", name_fa: "یورو", symbol_en: "€", symbol_fa: "€",
    decimals: 2, iso: true, symbol_position: "before" },
  { code: "GBP", name_en: "Pound sterling", name_fa: "پوند", symbol_en: "£", symbol_fa: "£",
    decimals: 2, iso: true, symbol_position: "before" },
  { code: "AED", name_en: "UAE dirham", name_fa: "درهم امارات", symbol_en: "AED",
    symbol_fa: "درهم", decimals: 2, iso: true, symbol_position: "after" },
  { code: "TRY", name_en: "Turkish lira", name_fa: "لیر ترکیه", symbol_en: "₺",
    symbol_fa: "₺", decimals: 2, iso: true, symbol_position: "before" },
  { code: "IQD", name_en: "Iraqi dinar", name_fa: "دینار عراق", symbol_en: "IQD",
    symbol_fa: "دینار", decimals: 0, iso: true, symbol_position: "after" },
  { code: "RUB", name_en: "Russian rouble", name_fa: "روبل روسیه", symbol_en: "₽",
    symbol_fa: "₽", decimals: 2, iso: true, symbol_position: "before" },
  { code: "CNY", name_en: "Chinese yuan", name_fa: "یوان چین", symbol_en: "¥",
    symbol_fa: "¥", decimals: 2, iso: true, symbol_position: "before" },
  { code: "INR", name_en: "Indian rupee", name_fa: "روپیه هند", symbol_en: "₹",
    symbol_fa: "₹", decimals: 2, iso: true, symbol_position: "before" },
  { code: "CAD", name_en: "Canadian dollar", name_fa: "دلار کانادا", symbol_en: "CA$",
    symbol_fa: "CA$", decimals: 2, iso: true, symbol_position: "before" },
  { code: "AUD", name_en: "Australian dollar", name_fa: "دلار استرالیا", symbol_en: "A$",
    symbol_fa: "A$", decimals: 2, iso: true, symbol_position: "before" },
  { code: "CHF", name_en: "Swiss franc", name_fa: "فرانک سوئیس", symbol_en: "CHF",
    symbol_fa: "فرانک", decimals: 2, iso: true, symbol_position: "before" },
  { code: "JPY", name_en: "Japanese yen", name_fa: "ین ژاپن", symbol_en: "¥",
    symbol_fa: "¥", decimals: 0, iso: true, symbol_position: "before" },
  { code: "SEK", name_en: "Swedish krona", name_fa: "کرون سوئد", symbol_en: "kr",
    symbol_fa: "کرون", decimals: 2, iso: true, symbol_position: "after" },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currencyOf(code?: string | null): Currency {
  return BY_CODE.get((code ?? "USD").toUpperCase()) ?? BY_CODE.get("USD")!;
}

export function currencyName(code: string, locale: string) {
  const currency = currencyOf(code);
  return locale === "fa" ? currency.name_fa : currency.name_en;
}

export function currencySymbol(code: string, locale: string) {
  const currency = currencyOf(code);
  return locale === "fa" ? currency.symbol_fa : currency.symbol_en;
}
