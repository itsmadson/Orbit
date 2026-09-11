export type UserRef = {
  id: string;
  full_name: string;
  email?: string | null;
  title?: string | null;
  avatar_color?: string | null;
  role?: string | null;
};

export type ProjectSummary = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  status: string;
  priority: string;
  health: string;
  color: string;
  icon: string;
  progress: number;
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
  lead?: UserRef | null;
  open_tasks: number;
  total_tasks: number;
  overdue_tasks: number;
  spent: number;
  member_count: number;
};

export type Task = {
  id: string;
  key: string;
  title: string;
  description?: string | null;
  type: string;
  status: string;
  priority: string;
  project_id?: string | null;
  project?: { id: string; key: string; name: string; color: string; icon: string } | null;
  assignee?: UserRef | null;
  reporter?: UserRef | null;
  epic_id?: string | null;
  parent_id?: string | null;
  sprint_id?: string | null;
  estimate?: number | null;
  due_date?: string | null;
  labels: string[];
  order_index: number;
  is_blocked: boolean;
  comment_count: number;
  subtask_count: number;
  created_at: string;
  updated_at: string;
  subtasks?: Task[];
  blocked_by?: Task[];
  blocks?: Task[];
};

export type Idea = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  author?: UserRef | null;
  tags: string[];
  business_value: number;
  technical_feasibility: number;
  expected_impact: number;
  effort: number;
  estimated_cost?: number | null;
  score: number;
  vote_count: number;
  project_id?: string | null;
  contributors: UserRef[];
  comment_count: number;
  has_voted: boolean;
  created_at: string;
};

export type Research = {
  id: string;
  title: string;
  research_question?: string | null;
  hypothesis?: string | null;
  objectives: string[];
  methods?: string | null;
  findings?: string | null;
  conclusion?: string | null;
  references: string[];
  status: string;
  lead?: UserRef | null;
  project_id?: string | null;
  idea_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
  experiment_count: number;
  running_experiments: number;
};

export type Experiment = {
  id: string;
  number: number;
  name: string;
  research_id?: string | null;
  research_title?: string | null;
  hypothesis?: string | null;
  method?: string | null;
  status: string;
  result?: string | null;
  metrics: Record<string, number>;
  dataset_ref?: string | null;
  researcher?: UserRef | null;
  started_at?: string | null;
  ended_at?: string | null;
};

export type Doc = {
  id: string;
  title: string;
  space_id?: string | null;
  parent_id?: string | null;
  doc_type: string;
  excerpt?: string | null;
  content?: string | null;
  status: string;
  tags: string[];
  version: number;
  author?: UserRef | null;
  project_id?: string | null;
  child_count: number;
  updated_at: string;
  created_at: string;
  space_name?: string | null;
  breadcrumb?: { id: string; title: string }[];
};

export type Decision = {
  id: string;
  title: string;
  problem?: string | null;
  context?: string | null;
  options: { title: string; pros?: string; cons?: string; chosen?: boolean }[];
  decision?: string | null;
  reason?: string | null;
  consequences?: string | null;
  status: string;
  decided_by?: UserRef | null;
  decided_at?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  meeting_id?: string | null;
  participant_refs: UserRef[];
  created_at: string;
};

export type Meeting = {
  id: string;
  title: string;
  description?: string | null;
  agenda: { title: string; owner?: string; minutes?: number }[];
  notes?: string | null;
  location?: string | null;
  meeting_url?: string | null;
  status: string;
  starts_at: string;
  ends_at?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  organizer?: UserRef | null;
  participant_count: number;
  action_item_count: number;
  participants?: { id: string; user: UserRef; response: string; attended: boolean }[];
  action_items?: {
    id: string;
    title: string;
    assignee?: UserRef | null;
    due_date?: string | null;
    status: string;
    task_id?: string | null;
  }[];
};

export type WorkflowDefinition = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  icon: string;
  category: string;
  is_active: boolean;
  form_schema: {
    key: string;
    label: string;
    type: string;
    required?: boolean;
    options?: string[];
    help?: string;
  }[];
  states: { key: string; label: string; type: string; approver_role?: string; result?: string }[];
  transitions: { from: string; to: string; action: string; label?: string }[];
  request_count: number;
  open_count: number;
};

export type Request = {
  id: string;
  number: number;
  title: string;
  state: string;
  state_label?: string | null;
  status: string;
  data: Record<string, any>;
  amount?: number | null;
  requester?: UserRef | null;
  definition_id: string;
  definition_name?: string | null;
  definition_icon?: string | null;
  created_at: string;
  completed_at?: string | null;
  awaiting_me: boolean;
  approvals?: {
    id: string;
    state_key: string;
    step: number;
    approver?: UserRef | null;
    approver_role?: string | null;
    status: string;
    comment?: string | null;
    decided_at?: string | null;
  }[];
  available_actions?: { from: string; to: string; action: string; label?: string }[];
  form_schema?: WorkflowDefinition["form_schema"];
  states?: WorkflowDefinition["states"];
  can_act?: boolean;
};

export type Transaction = {
  id: string;
  kind: string;
  description: string;
  amount: number;
  currency: string;
  occurred_on: string;
  status: string;
  category_id?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  vendor_name?: string | null;
  created_by?: UserRef | null;
};

export type Invoice = {
  id: string;
  number: string;
  direction: string;
  status: string;
  customer_name?: string | null;
  project_name?: string | null;
  lines: { description: string; qty: number; unit_price: number }[];
  subtotal: number;
  total: number;
  currency: string;
  issued_on?: string | null;
  due_on?: string | null;
  paid_on?: string | null;
};

export type Notification = {
  id: string;
  type: string;
  category: string;
  title: string;
  body?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  url?: string | null;
  actor?: UserRef | null;
  priority: string;
  read_at?: string | null;
  created_at: string;
};

export type Goal = {
  id: string;
  objective: string;
  description?: string | null;
  level: string;
  parent_id?: string | null;
  owner?: UserRef | null;
  department_name?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  period: string;
  status: string;
  progress: number;
  due_date?: string | null;
  key_results: {
    id: string;
    title: string;
    metric?: string | null;
    start_value: number;
    current_value: number;
    target_value: number;
    unit?: string | null;
    progress: number;
    owner?: UserRef | null;
  }[];
  child_count: number;
  children?: Goal[];
};

/* ----------------------------------------------------------------- letters */
export type Letterhead = {
  id: string;
  name: string;
  is_default: boolean;
  org_name: string;
  org_name_secondary?: string | null;
  org_subtitle?: string | null;
  logo_data_url?: string | null;
  header_image_data_url?: string | null;
  footer_image_data_url?: string | null;
  header_image_height_mm: number;
  footer_image_height_mm: number;
  header_image_full_bleed: boolean;
  header_html?: string | null;
  footer_html?: string | null;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  website?: string | null;
  postal_code?: string | null;
  paper: string;
  margin_top_mm: number;
  margin_bottom_mm: number;
  margin_x_mm: number;
  direction: string;
  language: string;
  font_family: string;
  font_size_pt: number;
  accent_color: string;
  signature_data_url?: string | null;
  stamp_data_url?: string | null;
  show_qr: boolean;
  show_page_numbers: boolean;
};

export type LetterNumbering = {
  id: string;
  name: string;
  pattern: string;
  prefix: string;
  kind_codes: Record<string, string>;
  calendar: string;
  digits: string;
  reset: string;
  scope: string;
  start_at: number;
  separator: string;
  preview?: string | null;
  tokens?: Record<string, string> | null;
  counters?: { scope: string; period: string; next: number }[] | null;
};

export type LetterTemplate = {
  id: string;
  name: string;
  description?: string | null;
  kind: string;
  language: string;
  subject?: string | null;
  salutation?: string | null;
  body?: string | null;
  closing?: string | null;
  letterhead_id?: string | null;
  variables: string[];
  is_default: boolean;
  usage_count: number;
};

export type Letter = {
  id: string;
  number?: string | null;
  kind: string;
  status: string;
  subject: string;
  confidentiality: string;
  urgency: string;
  letter_date: string;
  letter_date_display?: string | null;
  recipient_name?: string | null;
  recipient_org?: string | null;
  author?: UserRef | null;
  signer?: UserRef | null;
  project_id?: string | null;
  tags: string[];
  attachment_count: number;
  has_pdf: boolean;
  has_docx: boolean;
  created_at: string;
  updated_at: string;
  // detail only
  body?: string | null;
  salutation?: string | null;
  closing?: string | null;
  recipient_title?: string | null;
  recipient_address?: string | null;
  cc?: string[];
  sender_name?: string | null;
  sender_title?: string | null;
  in_reply_to_id?: string | null;
  follow_up_of?: string | null;
  attachment_note?: string | null;
  letterhead_id?: string | null;
  template_id?: string | null;
  registered_at?: string | null;
  signed_at?: string | null;
  sent_at?: string | null;
  delivery_method?: string | null;
  number_seq?: number | null;
};

export type LetterStats = {
  total: number;
  by_kind: Record<string, number>;
  by_status: Record<string, number>;
  drafts: number;
  awaiting_signature: number;
  next_number?: string | null;
};
