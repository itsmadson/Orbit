"""Currencies the workspace can keep its books in.

Most are ISO 4217 and format themselves through the standard library. Toman is
the exception worth the code: it is what Iranians actually quote prices in, it
has no ISO code, and it is worth ten rial — so it is carried here explicitly
rather than approximated with IRR.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Currency:
    code: str
    name_en: str
    name_fa: str
    symbol_en: str
    symbol_fa: str
    decimals: int
    iso: bool = True          # False when Intl/babel will not know the code
    symbol_position: str = "before"   # before | after
    #: Value of one unit in the ISO currency it derives from, when not ISO.
    base_code: str | None = None
    base_rate: float = 1.0


CURRENCIES: list[Currency] = [
    Currency("IRT", "Toman", "تومان", "IRT", "تومان", 0,
             iso=False, symbol_position="after", base_code="IRR", base_rate=10.0),
    Currency("IRR", "Iranian rial", "ریال ایران", "﷼", "ریال", 0,
             symbol_position="after"),
    Currency("USD", "US dollar", "دلار آمریکا", "$", "$", 2),
    Currency("EUR", "Euro", "یورو", "€", "€", 2),
    Currency("GBP", "Pound sterling", "پوند", "£", "£", 2),
    Currency("AED", "UAE dirham", "درهم امارات", "AED", "درهم", 2,
             symbol_position="after"),
    Currency("TRY", "Turkish lira", "لیر ترکیه", "₺", "₺", 2),
    Currency("IQD", "Iraqi dinar", "دینار عراق", "IQD", "دینار", 0,
             symbol_position="after"),
    Currency("RUB", "Russian rouble", "روبل روسیه", "₽", "₽", 2),
    Currency("CNY", "Chinese yuan", "یوان چین", "¥", "¥", 2),
    Currency("INR", "Indian rupee", "روپیه هند", "₹", "₹", 2),
    Currency("CAD", "Canadian dollar", "دلار کانادا", "CA$", "CA$", 2),
    Currency("AUD", "Australian dollar", "دلار استرالیا", "A$", "A$", 2),
    Currency("CHF", "Swiss franc", "فرانک سوئیس", "CHF", "فرانک", 2),
    Currency("JPY", "Japanese yen", "ین ژاپن", "¥", "¥", 0),
    Currency("SEK", "Swedish krona", "کرون سوئد", "kr", "کرون", 2,
             symbol_position="after"),
]

BY_CODE = {c.code: c for c in CURRENCIES}
DEFAULT = "USD"


def get(code: str | None) -> Currency:
    return BY_CODE.get((code or DEFAULT).upper(), BY_CODE[DEFAULT])


def is_supported(code: str | None) -> bool:
    return bool(code) and code.upper() in BY_CODE


def as_dicts() -> list[dict]:
    return [
        {
            "code": c.code,
            "name_en": c.name_en,
            "name_fa": c.name_fa,
            "symbol_en": c.symbol_en,
            "symbol_fa": c.symbol_fa,
            "decimals": c.decimals,
            "iso": c.iso,
            "symbol_position": c.symbol_position,
            "base_code": c.base_code,
            "base_rate": c.base_rate,
        }
        for c in CURRENCIES
    ]
