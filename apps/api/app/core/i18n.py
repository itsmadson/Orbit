"""Server-side text for the two locales the product ships: English and Persian.

Most translation lives in the web app, which turns keys such as ``in_progress``
into words. This module covers the text the *server* writes and stores or sends
ready-made: notification titles, insight sentences and error messages.

Two entry points:

``tr(locale, key, **vars)``
    A keyed catalogue, for new code.

``localize(locale, text)``
    Translates an English sentence the API already produces, by pattern. It lets
    every existing ``notify(title=f"…")`` and ``raise BadRequest("…")`` call stay
    readable in the source while still reaching a Persian user in Persian. An
    unknown sentence is returned unchanged — never a broken string.
"""

import re
from collections.abc import Callable

from fastapi import Request

SUPPORTED = ("en", "fa")

_PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def digits(locale: str, value) -> str:
    text = str(value)
    return text.translate(_PERSIAN_DIGITS) if locale == "fa" else text


def normalize(locale: str | None) -> str:
    locale = (locale or "en").lower()[:2]
    return locale if locale in SUPPORTED else "en"


def request_locale(request: Request | None, fallback: str | None = None) -> str:
    """The locale the caller is *looking at*, which may differ from their profile."""
    if request is not None:
        explicit = request.headers.get("x-orbit-locale") or request.cookies.get("orbit_locale")
        if explicit:
            return normalize(explicit)
        accept = request.headers.get("accept-language")
        if accept:
            return normalize(accept.split(",")[0])
    return normalize(fallback)


# --------------------------------------------------------------- keyed catalogue
CATALOG: dict[str, dict[str, str]] = {
    "notify.task_moved": {
        "en": "{key} moved to {status}",
        "fa": "{key} به «{status}» منتقل شد",
    },
    "ai.no_provider": {
        "en": "No language model is configured. Set GAPGPT_API_KEY (or ASSISTANT_API_KEY) in .env to enable the assistant.",
        "fa": "هیچ مدل زبانی پیکربندی نشده است. برای فعال‌سازی دستیار، GAPGPT_API_KEY (یا ASSISTANT_API_KEY) را در فایل .env تنظیم کنید.",
    },
    "ai.provider_down": {
        "en": "The AI provider could not be reached ({reason}). Try again in a moment.",
        "fa": "ارتباط با سرویس هوش مصنوعی برقرار نشد ({reason}). کمی بعد دوباره تلاش کنید.",
    },
    "ai.daily_limit": {
        "en": "You have reached today's limit of {limit} assistant messages.",
        "fa": "به سقف {limit} پیام روزانهٔ دستیار رسیده‌اید.",
    },
    "ai.too_long": {
        "en": "That message is too long (limit {limit} characters).",
        "fa": "این پیام بیش از حد طولانی است (حداکثر {limit} نویسه).",
    },
    "ai.needs_confirmation": {
        "en": "This action changes or removes data, so it needs your confirmation.",
        "fa": "این عملیات داده‌ها را تغییر می‌دهد یا حذف می‌کند و به تأیید شما نیاز دارد.",
    },
    "ai.max_steps": {
        "en": "I stopped after {steps} steps without finishing. Ask me to continue, or narrow the request.",
        "fa": "پس از {steps} مرحله متوقف شدم و کار کامل نشد. بگویید ادامه بدهم یا درخواست را محدودتر کنید.",
    },
    "ai.cancelled": {
        "en": "Cancelled. Nothing was changed.",
        "fa": "لغو شد. چیزی تغییر نکرد.",
    },
}


def tr(locale: str | None, message: str, /, **variables) -> str:
    locale = normalize(locale)
    entry = CATALOG.get(message, {})
    text = entry.get(locale) or entry.get("en") or message
    try:
        return text.format(**{k: digits(locale, v) if isinstance(v, (int, float)) else v
                              for k, v in variables.items()})
    except (KeyError, IndexError):
        return text


# --------------------------------------------------------------------- vocabulary
#: Enum values that appear inside sentences ("is now on hold").
WORDS_FA: dict[str, str] = {
    "backlog": "بک‌لاگ", "todo": "برای انجام", "in progress": "در حال انجام",
    "in review": "در حال بازبینی", "done": "انجام‌شده", "cancelled": "لغوشده",
    "planning": "برنامه‌ریزی", "active": "فعال", "on hold": "متوقف", "completed": "تکمیل‌شده",
    "on track": "طبق برنامه", "at risk": "در معرض خطر", "off track": "خارج از برنامه",
    "open": "باز", "pending": "در انتظار", "approved": "تأییدشده", "rejected": "ردشده",
    "resolved": "حل‌شده", "closed": "بسته", "waiting": "در انتظار پاسخ",
    "planned": "برنامه‌ریزی‌شده", "running": "در حال اجرا", "validated": "تأییدشده",
    "failed": "ناموفق", "inconclusive": "بی‌نتیجه", "draft": "پیش‌نویس", "new": "جدید",
    "under review": "در حال بررسی", "accepted": "پذیرفته‌شده", "archived": "بایگانی‌شده",
    "converted": "تبدیل‌شده", "promoted": "ارتقایافته", "evaluating": "در حال ارزیابی",
    "annual": "استحقاقی", "sick": "استعلاجی", "unpaid": "بدون حقوق", "remote": "دورکاری",
    "task": "وظیفه", "bug": "باگ", "feature": "قابلیت", "story": "استوری", "epic": "اپیک",
    "subtask": "زیروظیفه", "above": "بیشتر از", "below": "کمتر از",
    "Project": "پروژه", "Task": "وظیفه", "Idea": "ایده", "Document": "سند",
    "Decision": "تصمیم", "Meeting": "جلسه", "Customer": "مشتری", "Deal": "معامله",
    "Contract": "قرارداد", "Invoice": "فاکتور", "Transaction": "تراکنش", "Asset": "دارایی",
    "Goal": "هدف", "Request": "درخواست", "Letter": "نامه", "Ticket": "تیکت",
    "Monitor": "پایشگر", "User": "کاربر", "Conversation": "گفت‌وگو", "Status": "وضعیت",
    "Sprint": "اسپرینت", "Resource": "مورد", "Experiment": "آزمایش", "Comment": "دیدگاه",
    "Attachment": "پیوست", "Milestone": "نقطهٔ عطف", "Department": "واحد",
    "Integration": "یکپارچه‌سازی", "Employee": "کارمند", "Vendor": "تأمین‌کننده",
    "Budget": "بودجه", "Account": "حساب", "Template": "قالب", "Board": "تابلو",
    "Card": "کارت", "Workflow": "گردش‌کار", "Approval": "تأیید", "View": "نما",
    "Research project": "پروژهٔ تحقیقاتی", "Notification": "اعلان", "Contact": "مخاطب",
}


def word(locale: str, value: str) -> str:
    if locale != "fa":
        return value
    plain = value.replace("_", " ")
    return WORDS_FA.get(plain) or WORDS_FA.get(plain.lower()) or value


# ------------------------------------------------------------- pattern catalogue
def _p(pattern: str, template: str | Callable, *, words: tuple[str, ...] = ()):
    return re.compile(f"^{pattern}$", re.S), template, words


#: (regex, Persian template, groups that are enum words to translate too).
_PATTERNS = [
    # --- notifications
    _p(r"(?P<who>.+) assigned this (?P<type>\w+) to you\.", "{who} این {type} را به شما سپرد.", words=("type",)),
    _p(r"(?P<who>.+) assigned you (?P<n>\d+) task\(s\)", "{who} {n} وظیفه به شما سپرد"),
    _p(r"(?P<n>\d+) task\(s\) planned for you", "{n} وظیفه برای شما برنامه‌ریزی شد"),
    _p(r"Added to project (?P<name>.+)", "به پروژهٔ {name} اضافه شدید"),
    _p(r"(?P<who>.+) added you to (?P<name>.+)\.", "{who} شما را به {name} اضافه کرد."),
    _p(r"(?P<who>.+) mentioned you on (?P<what>.+)", "{who} در {what} از شما نام برد"),
    _p(r"New comment on (?P<what>.+)", "دیدگاه تازه روی {what}"),
    _p(r"Leave request from (?P<who>.+)", "درخواست مرخصی از {who}"),
    _p(r"Your leave request was (?P<status>\w+)", "درخواست مرخصی شما {status} شد", words=("status",)),
    _p(r"Your (?P<type>\w+) balance changed by (?P<days>[+-]?[\d.]+) days",
       "ماندهٔ مرخصی {type} شما {days} روز تغییر کرد", words=("type",)),
    _p(r"Meeting: (?P<title>.+)", "جلسه: {title}"),
    _p(r"Action item: (?P<title>.+)", "اقدام: {title}"),
    _p(r"From meeting “(?P<title>.+)”\.", "از جلسهٔ «{title}»."),
    _p(r"You are named in decision “(?P<title>.+)”", "در تصمیم «{title}» از شما نام برده شده است"),
    _p(r"Your idea “(?P<title>.+)” is now (?P<status>[\w ]+)", "ایدهٔ «{title}» شما اکنون {status} است",
       words=("status",)),
    _p(r"Experiment #(?P<n>\d+) is (?P<status>[\w ]+)", "آزمایش شمارهٔ {n} {status} است", words=("status",)),
    _p(r"(?P<name>.+) assigned to you", "{name} به شما تحویل شد"),
    _p(r"Approval needed: (?P<title>.+)", "نیاز به تأیید: {title}"),
    _p(r"(?P<step>.+) step is waiting for you\.", "مرحلهٔ «{step}» منتظر شماست."),
    _p(r"Your request (?P<title>.+) is now (?P<status>[\w ]+)\.", "درخواست «{title}» شما اکنون {status} است.",
       words=("status",)),
    _p(r"(?P<name>.+) is now (?P<status>[\w ]+)", "{name} اکنون {status} است", words=("status",)),
    _p(r"(?P<name>.+) is (?P<status>off track|at risk|on track)", "{name} {status} است", words=("status",)),
    # --- insights
    _p(r"(?P<a>\d+) overdue task\(s\) and (?P<b>\d+)% progress(?:, due (?P<due>[\d-]+))?",
       lambda m: f"{m['a']} وظیفهٔ عقب‌افتاده و {m['b']}٪ پیشرفت"
                 + (f"، موعد {m['due']}" if m["due"] else "")),
    _p(r"Expenses are (?P<pct>\d+)% (?P<dir>above|below) last month",
       "هزینه‌ها {pct}٪ {dir} ماه گذشته است", words=("dir",)),
    _p(r"(?P<a>[\d,]+) this month vs (?P<b>[\d,]+) last month\.", "{a} در این ماه در برابر {b} در ماه گذشته."),
    _p(r"(?P<n>\d+) idea\(s\) score high on value and feasibility",
       "{n} ایده از نظر ارزش و امکان‌پذیری امتیاز بالایی دارند"),
    _p(r"(?P<name>.+) carries (?P<n>\d+) open tasks", "{name} {n} وظیفهٔ باز بر عهده دارد"),
    _p(r"Consider rebalancing work across the team\.", "توزیع دوبارهٔ کار میان اعضای تیم را در نظر بگیرید."),
    _p(r"(?P<n>\d+) task\(s\) are past their due date", "موعد {n} وظیفه گذشته است"),
    _p(r"Review the overdue queue and reschedule or reassign\.",
       "صف وظایف عقب‌افتاده را مرور و آن‌ها را زمان‌بندی دوباره یا واگذار کنید."),
    _p(r"(?P<n>[\d,]+) outstanding in unpaid invoices", "{n} مطالبات در فاکتورهای پرداخت‌نشده"),
    _p(r"Chase overdue customer invoices to protect cash flow\.",
       "برای حفظ جریان نقدی، فاکتورهای معوق مشتریان را پیگیری کنید."),
    _p(r"Invoice (?P<rest>.+)", "فاکتور {rest}"),
    _p(r"Experiment #(?P<n>\d+) (?P<status>[\w ]+)", "آزمایش شمارهٔ {n}: {status}", words=("status",)),
    # --- errors
    _p(r"(?P<what>[A-Z][\w ]*?) not found", "{what} پیدا نشد", words=("what",)),
    _p(r"Missing permission: (?P<perm>[\w.]+)", "دسترسی لازم را ندارید: {perm}"),
    _p(r"You do not have permission to perform this action", "اجازهٔ انجام این کار را ندارید"),
    _p(r"Not authenticated", "وارد حساب نشده‌اید"),
    _p(r"Invalid or expired token", "نشست شما منقضی شده است؛ دوباره وارد شوید"),
    _p(r"Account is not active", "این حساب فعال نیست"),
    _p(r"Conflicting state", "وضعیت ناسازگار"),
    _p(r"The submitted data is not valid", "داده‌های ارسالی معتبر نیست"),
    _p(r"Too many requests, slow down\.", "تعداد درخواست‌ها زیاد است؛ کمی صبر کنید."),
    _p(r"Unknown status: (?P<v>[^.]+)\. Valid: (?P<keys>.+); or a category: (?P<c>.+)",
       "وضعیت ناشناخته: {v}. مقادیر مجاز: {keys}"),
    _p(r"Unknown status: (?P<v>.+)", "وضعیت ناشناخته: {v}"),
    _p(r"timed out after (?P<s>\d+)s, (?P<n>\d+) step\(s\) completed", "پس از {s} ثانیه پاسخی نرسید؛ {n} مرحله انجام شد"),
    _p(r"Unknown category: (?P<v>.+)", "دستهٔ ناشناخته: {v}"),
    _p(r"Unknown provider: (?P<v>.+)", "سرویس ناشناخته: {v}"),
    _p(r"No tasks selected", "هیچ وظیفه‌ای انتخاب نشده است"),
    _p(r"Too many tasks in one operation \(limit (?P<n>\d+)\)", "تعداد وظایف در یک عملیات زیاد است (حداکثر {n})"),
    _p(r"A task cannot depend on itself", "یک وظیفه نمی‌تواند به خودش وابسته باشد"),
    _p(r"A board can have at most (?P<n>\d+) statuses", "هر تابلو حداکثر {n} وضعیت می‌تواند داشته باشد"),
    _p(r"The meaning of a built-in status cannot be changed", "دستهٔ وضعیت‌های پیش‌فرض قابل تغییر نیست"),
    _p(r"A status needs a name", "وضعیت باید نام داشته باشد"),
    _p(r"Built-in statuses cannot be deleted", "وضعیت‌های پیش‌فرض قابل حذف نیستند"),
    _p(r"Choose a status to move this column's tasks to", "وضعیتی برای انتقال وظایف این ستون انتخاب کنید"),
    _p(r"Task deleted", "وظیفه حذف شد"),
    _p(r"Status deleted", "وضعیت حذف شد"),
    _p(r"Dependency removed", "وابستگی حذف شد"),
    _p(r"Deleted (?P<n>\d+) tasks", "{n} وظیفه حذف شد"),
    _p(r"Updated (?P<n>\d+) tasks \((?P<f>.*)\)", "{n} وظیفه به‌روزرسانی شد"),
    _p(r"(?P<name>.+) is not connected", "{name} متصل نیست"),
    _p(r"(?P<name>.+) rejected the credentials(?: \((?P<d>.+)\))?",
       lambda m: f"{m['name']} اطلاعات ورود را نپذیرفت" + (f" ({m['d']})" if m["d"] else "")),
    _p(r"Could not reach (?P<name>.+?)(?:: (?P<d>.+))?",
       lambda m: f"ارتباط با {m['name']} برقرار نشد" + (f": {m['d']}" if m["d"] else "")),
    _p(r"A token is required", "توکن دسترسی لازم است"),
    _p(r"Jira needs a base URL, an email and an API token", "Jira به نشانی پایه، ایمیل و توکن API نیاز دارد"),
    _p(r"This task is not linked to (?P<name>.+)", "این وظیفه به {name} متصل نیست"),
    _p(r"This task is already linked to (?P<name>.+)", "این وظیفه از قبل به {name} متصل است"),
    _p(r"This project is not linked to (?P<name>.+)", "این پروژه به {name} متصل نیست"),
    _p(r"Disconnected", "اتصال قطع شد"),
    _p(r"This action was already decided", "دربارهٔ این اقدام قبلاً تصمیم گرفته شده است"),
    _p(r"Ask a question first", "ابتدا پرسشی بنویسید"),
    _p(r"Decision must be approve or reject", "تصمیم باید «تأیید» یا «رد» باشد"),
    _p(r"That endpoint is not available to the assistant", "این مسیر در دسترس دستیار نیست"),
    _p(r"Conversation deleted", "گفت‌وگو حذف شد"),
    _p(r"Link removed", "پیوند حذف شد"),
    _p(r"Incorrect email or password", "ایمیل یا گذرواژه نادرست است"),
    _p(r"Current password is incorrect", "گذرواژهٔ فعلی نادرست است"),
    _p(r"Password must be at least (?P<n>\d+) characters", "گذرواژه باید دست‌کم {n} نویسه باشد"),
    _p(r"Email already in use", "این ایمیل قبلاً استفاده شده است"),
    _p(r"File is too large.*", "حجم فایل بیش از حد مجاز است"),
    _p(r"This view belongs to someone else\.", "این نما متعلق به شخص دیگری است."),
    _p(r"Unknown entity(?: type)?: (?P<v>.+)", "نوع موجودیت ناشناخته: {v}"),
    _p(r"You can only see your own leave balance\.", "فقط ماندهٔ مرخصی خودتان را می‌توانید ببینید."),
    _p(r"You can only request leave for yourself", "فقط برای خودتان می‌توانید مرخصی درخواست کنید"),
    _p(r"You can only delete your own comments", "فقط دیدگاه‌های خودتان را می‌توانید حذف کنید"),
    _p(r"You can only close or rate your own ticket\.", "فقط تیکت خودتان را می‌توانید ببندید یا امتیاز دهید."),
    _p(r"You cannot view this request", "اجازهٔ دیدن این درخواست را ندارید"),
    _p(r"You cannot deactivate your own account\.?", "نمی‌توانید حساب خودتان را غیرفعال کنید"),
    _p(r"You cannot deactivate a more senior account\.", "نمی‌توانید حساب ردهٔ بالاتر را غیرفعال کنید."),
    _p(r"You cannot change your own role\.", "نمی‌توانید نقش خودتان را تغییر دهید."),
    _p(r"You cannot change the role of a more senior account\.", "نمی‌توانید نقش حساب ردهٔ بالاتر را تغییر دهید."),
    _p(r"You are not the approver for this request", "شما تأییدکنندهٔ این درخواست نیستید"),
    _p(r"You are not an approver for this step", "شما تأییدکنندهٔ این مرحله نیستید"),
    _p(r"Workflow definition has no states", "این گردش‌کار هیچ وضعیتی ندارد"),
    _p(r"Unknown urgency level", "سطح فوریت ناشناخته است"),
    _p(r"Unknown delivery method", "روش ارسال ناشناخته است"),
    _p(r"Unknown confidentiality level", "سطح محرمانگی ناشناخته است"),
    _p(r"Transition points at an unknown state", "این گذار به وضعیتی ناشناخته اشاره می‌کند"),
    _p(r"This ticket already has a task\.", "این تیکت از قبل وظیفه دارد."),
    _p(r"This request is already closed", "این درخواست قبلاً بسته شده است"),
    _p(r"This account is disabled", "این حساب غیرفعال است"),
    _p(r"The portal is for customer logins\.", "پرتال مخصوص ورود مشتریان است."),
    _p(r"Status must be approved or rejected", "وضعیت باید «تأییدشده» یا «ردشده» باشد"),
    _p(r"Session has been revoked", "این نشست باطل شده است"),
    _p(r"Request is in an unknown state", "درخواست در وضعیتی ناشناخته است"),
    _p(r"Provide a skill_id or a name", "شناسه یا نام مهارت را وارد کنید"),
    _p(r"Only the requester can cancel this request", "فقط درخواست‌دهنده می‌تواند این درخواست را لغو کند"),
    _p(r"Not available from the portal\.", "از طریق پرتال در دسترس نیست."),
    _p(r"Nobody available to plan for\.", "کسی برای برنامه‌ریزی در دسترس نیست."),
    _p(r"Missing required fields: (?P<v>.*)", "فیلدهای الزامی وارد نشده‌اند: {v}"),
    _p(r"Invalid refresh token", "توکن تازه‌سازی نامعتبر است"),
    _p(r"You do not hold (?P<v>[\w.]+), so you cannot grant it\.", "شما دسترسی {v} را ندارید و نمی‌توانید آن را واگذار کنید."),
    _p(r"Unsupported currency: (?P<v>.+)", "واحد پول پشتیبانی نمی‌شود: {v}"),
    _p(r"Unknown role: (?P<v>.+)", "نقش ناشناخته: {v}"),
    _p(r"Unknown priority: (?P<v>.+)", "اولویت ناشناخته: {v}"),
    _p(r"Unknown permission: (?P<v>.+)", "دسترسی ناشناخته: {v}"),
    _p(r"Unknown letter kind: (?P<v>.+)", "نوع نامهٔ ناشناخته: {v}"),
    _p(r"This letter already carries number (?P<v>.+)\.", "این نامه از قبل شمارهٔ {v} را دارد."),
    _p(r"(?P<a>.+) already has an active sprint: (?P<b>.+)", "{a} از قبل اسپرینت فعال دارد: {b}"),
    _p(r"Action '(?P<a>.+)' is not allowed from state '(?P<b>.+)'", "اقدام «{a}» در وضعیت «{b}» مجاز نیست"),
    _p(r"End date must be on or after the start date", "تاریخ پایان نباید پیش از تاریخ شروع باشد"),
    _p(r"A user with this email already exists", "کاربری با این ایمیل از قبل وجود دارد"),
    _p(r"A sent or archived letter cannot be edited; issue a new one\.", "نامهٔ ارسال‌شده یا بایگانی‌شده قابل ویرایش نیست؛ نامهٔ تازه‌ای صادر کنید."),
    _p(r"A monitor URL must start with http:// or https://", "نشانی پایشگر باید با http:// یا https:// شروع شود"),
    _p(r"A filename is required", "نام فایل لازم است"),
    _p(r"The ORBIT API is not reachable\.", "سرور ORBIT در دسترس نیست."),
]


def localize(locale: str | None, text: str | None) -> str | None:
    """Translate a server-written English sentence, if we know its shape."""
    locale = normalize(locale)
    if locale != "fa" or not text:
        return text
    for regex, template, words in _PATTERNS:
        match = regex.match(text)
        if not match:
            continue
        if callable(template):
            return digits(locale, template(match))
        groups = {k: (v or "") for k, v in match.groupdict().items()}
        for name in words:
            groups[name] = word(locale, groups[name])
        return digits_outside_names(template.format(**groups))
    return text


def digits_outside_names(text: str) -> str:
    """Persian digits for counts, but identifiers such as ATLAS-12 stay Latin."""
    return re.sub(
        r"(?<![A-Za-z0-9\-#/.:_])\d+(?:[.,]\d+)*(?![A-Za-z\-_/]|:\d)",
        lambda m: m.group(0).translate(_PERSIAN_DIGITS),
        text,
    )
