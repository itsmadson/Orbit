import {
  Activity, Atom, Banknote, Bot, Boxes, Building2, Calendar, CalendarDays, CheckSquare, ClipboardCheck,
  ClipboardList, FileText, FlaskConical, FolderKanban, Gavel, Home, Inbox, Gauge, Landmark, LayoutGrid, LifeBuoy, Mail,
  Library, LineChart, Lightbulb, Map, Package, Settings, Share2, Sparkles, Target, Users, Workflow,
} from "lucide-react";

export type NavItem = {
  href: string;
  labelKey: string;
  icon: any;
  permission?: string;
  shortcut?: string;
};

export type NavGroup = {
  key: string;
  labelKey?: string;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    key: "top",
    items: [
      { href: "/", labelKey: "nav.home", icon: Home, shortcut: "h" },
      { href: "/inbox", labelKey: "nav.inbox", icon: Inbox, shortcut: "i" },
    ],
  },
  {
    key: "work",
    labelKey: "nav.group.work",
    items: [
      { href: "/projects", labelKey: "nav.projects", icon: FolderKanban, permission: "projects.read", shortcut: "p" },
      { href: "/tasks", labelKey: "nav.tasks", icon: CheckSquare, permission: "tasks.read", shortcut: "t" },
      { href: "/roadmaps", labelKey: "nav.roadmaps", icon: Map, permission: "projects.read" },
      { href: "/planning", labelKey: "nav.planning", icon: Gauge, permission: "planning.read" },
    ],
  },
  {
    key: "innovation",
    labelKey: "nav.group.innovation",
    items: [
      { href: "/ideas", labelKey: "nav.ideas", icon: Lightbulb, permission: "ideas.read", shortcut: "d" },
      { href: "/brainstorm", labelKey: "nav.brainstorm", icon: Sparkles, permission: "brainstorm.read" },
      { href: "/rd", labelKey: "nav.rd", icon: FlaskConical, permission: "rd.read", shortcut: "r" },
      { href: "/experiments", labelKey: "nav.experiments", icon: Atom, permission: "rd.read" },
    ],
  },
  {
    key: "knowledge",
    labelKey: "nav.group.knowledge",
    items: [
      { href: "/wiki", labelKey: "nav.wiki", icon: Library, permission: "documents.read", shortcut: "w" },
      { href: "/documents", labelKey: "nav.documents", icon: FileText, permission: "documents.read" },
      { href: "/decisions", labelKey: "nav.decisions", icon: Gavel, permission: "decisions.read" },
    ],
  },
  {
    key: "operations",
    labelKey: "nav.group.operations",
    items: [
      { href: "/office", labelKey: "nav.office", icon: LayoutGrid, permission: "workflows.read", shortcut: "o" },
      { href: "/letters", labelKey: "nav.letters", icon: Mail, permission: "letters.read", shortcut: "l" },
      { href: "/tickets", labelKey: "nav.tickets", icon: LifeBuoy, permission: "support.read", shortcut: "s" },
      { href: "/monitors", labelKey: "nav.monitors", icon: Activity, permission: "monitoring.read" },
      { href: "/workflows", labelKey: "nav.workflows", icon: Workflow, permission: "workflows.read" },
      { href: "/approvals", labelKey: "nav.approvals", icon: ClipboardCheck, permission: "workflows.read", shortcut: "a" },
      { href: "/meetings", labelKey: "nav.meetings", icon: Calendar, permission: "meetings.read", shortcut: "m" },
      { href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays, permission: "meetings.read" },
    ],
  },
  {
    key: "business",
    labelKey: "nav.group.business",
    items: [
      { href: "/crm", labelKey: "nav.crm", icon: Building2, permission: "crm.read", shortcut: "c" },
      { href: "/finance", labelKey: "nav.finance", icon: Banknote, permission: "finance.read", shortcut: "f" },
      { href: "/procurement", labelKey: "nav.procurement", icon: Package, permission: "procurement.read" },
      { href: "/assets", labelKey: "nav.assets", icon: Boxes, permission: "assets.read" },
    ],
  },
  {
    key: "people",
    labelKey: "nav.group.people",
    items: [
      { href: "/employees", labelKey: "nav.employees", icon: Users, permission: "users.read", shortcut: "e" },
      { href: "/hr", labelKey: "nav.hr", icon: Landmark, permission: "hr.read" },
      { href: "/goals", labelKey: "nav.goals", icon: Target, permission: "goals.read", shortcut: "g" },
    ],
  },
  {
    key: "analytics",
    labelKey: "nav.group.analytics",
    items: [
      { href: "/analytics/company", labelKey: "nav.analytics.company", icon: LineChart, permission: "analytics.read" },
      { href: "/analytics/projects", labelKey: "nav.analytics.projects", icon: LineChart, permission: "analytics.read" },
      { href: "/analytics/finance", labelKey: "nav.analytics.finance", icon: LineChart, permission: "finance.read" },
      { href: "/analytics/people", labelKey: "nav.analytics.people", icon: LineChart, permission: "analytics.read" },
    ],
  },
  {
    key: "ai",
    labelKey: "nav.group.ai",
    items: [
      { href: "/ai", labelKey: "nav.ai", icon: Bot, permission: "ai.read" },
      { href: "/graph", labelKey: "nav.graph", icon: Share2 },
    ],
  },
  {
    key: "bottom",
    items: [{ href: "/settings", labelKey: "nav.settings", icon: Settings }],
  },
];

export const QUICK_CREATE = [
  { key: "task", labelKey: "tasks.new", href: "/tasks?create=1", permission: "tasks.write", icon: CheckSquare },
  { key: "project", labelKey: "projects.new", href: "/projects?create=1", permission: "projects.write", icon: FolderKanban },
  { key: "idea", labelKey: "ideas.new", href: "/ideas?create=1", permission: "ideas.write", icon: Lightbulb },
  { key: "meeting", labelKey: "meetings.new", href: "/meetings?create=1", permission: "meetings.write", icon: Calendar },
  { key: "document", labelKey: "knowledge.newDocument", href: "/documents?create=1", permission: "documents.write", icon: FileText },
  { key: "letter", labelKey: "letters.new", href: "/letters?create=1", permission: "letters.write", icon: Mail },
  { key: "ticket", labelKey: "support.new", href: "/tickets?create=1", permission: "support.write", icon: LifeBuoy },
  { key: "decision", labelKey: "decisions.new", href: "/decisions?create=1", permission: "decisions.write", icon: Gavel },
  { key: "expense", labelKey: "finance.newTransaction", href: "/finance?create=1", permission: "finance.write", icon: Banknote },
  { key: "request", labelKey: "office.newRequest", href: "/office?create=1", permission: "workflows.write", icon: ClipboardList },
];
