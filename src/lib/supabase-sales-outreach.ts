import { supabase } from "@/lib/supabase";

type DbOutreachStatus = "interested" | "follow_up" | "meeting_scheduled" | "verdict" | "no_response";
export type OutreachStatus = "interested" | "follow_up" | "booked" | "verdict" | "no_response";
export type OutreachSource = "cold_email" | "targeted" | "referral" | "network" | "repeat";

export interface SalesOutreachRow {
  id: number;
  prospect: string;
  contact: string;
  status: DbOutreachStatus;
  last_contact: string | null;
  emails_sent: number;
  replies: number;
  notion_url: string | null;
  display_order: number;
  updated_at: string;
  source?: OutreachSource | "instantly_ai" | null;
  instantly_list?: string | null;
  campaign?: string | null;
  prospect_group?: string | null;
  interest_level?: "low" | "medium" | "high" | null;
  plan_mode?: "custom" | "template" | null;
  budget_tier?: "premium" | "standard" | "basic" | null;
  response_tags?: Array<"price" | "sample" | "meeting" | "interest"> | null;
  asked_for?: "price" | "sample" | "meeting" | "interest" | "later" | "not_set" | null;
  asked_for_secondary?: "price" | "sample" | "meeting" | "interest" | "later" | "not_set" | null;
  auto_top_prospect?: boolean | null;
  next_follow_up_date?: string | null;
  next_follow_up_time?: string | null;
  follow_up_type?: "call" | "email" | null;
  company_name?: string | null;
  prospect_name?: string | null;
  role?: string | null;
  industry?: string | null;
  email?: string | null;
  secondary_email?: string | null;
  cell_phone?: string | null;
  business_phone?: string | null;
  city?: string | null;
  state?: string | null;
  fee?: string | null;
  mrr?: string | null;
  special_notes?: string | null;
}

export interface SalesOutreachRecord {
  id: number;
  prospect: string;
  contact: string;
  status: OutreachStatus;
  lastContact: string;
  emailsSent: number;
  replies: number;
  notionUrl: string;
  source?: OutreachSource;
  instantlyList?: string;
  campaign?: string;
  group?: string;
  interestLevel?: "low" | "medium" | "high";
  planMode?: "custom" | "template";
  budgetTier?: "premium" | "standard" | "basic";
  responses?: Array<"price" | "sample" | "meeting" | "interest" | "later">;
  askedFor?: "price" | "sample" | "meeting" | "interest" | "later" | "not_set";
  askedForSecondary?: "price" | "sample" | "meeting" | "interest" | "later" | "not_set";
  autoTopProspect?: boolean;
  nextFollowUpDate?: string;
  nextFollowUpTime?: string;
  followUpType?: "call" | "email";
  companyName?: string;
  prospectName?: string;
  role?: string;
  industry?: string;
  email?: string;
  secondaryEmail?: string;
  cellPhone?: string;
  businessPhone?: string;
  city?: string;
  state?: string;
  fee?: string;
  mrr?: string;
  specialNotes?: string;
}

const fromDbStatus = (status: DbOutreachStatus): OutreachStatus => {
  if (status === "meeting_scheduled") return "booked";
  return status;
};

const toDbStatus = (status: OutreachStatus): DbOutreachStatus => {
  if (status === "booked") return "meeting_scheduled";
  return status;
};

export function mapSalesOutreachRowToRecord(row: SalesOutreachRow): SalesOutreachRecord {
  const normalizeSource = (value: SalesOutreachRow["source"]): OutreachSource => {
    if (value === "instantly_ai") return "cold_email";
    if (value === "cold_email" || value === "targeted" || value === "referral" || value === "network" || value === "repeat") return value;
    return "cold_email";
  };
  const normalizeResponses = (value: SalesOutreachRow["response_tags"]) =>
    Array.isArray(value)
      ? value.filter(
          (entry): entry is "price" | "sample" | "meeting" | "interest" =>
            entry === "price" || entry === "sample" || entry === "meeting" || entry === "interest"
        )
      : [];

  return {
    id: row.id,
    prospect: row.prospect,
    contact: row.contact,
    status: fromDbStatus(row.status),
    lastContact: row.last_contact ?? "",
    emailsSent: row.emails_sent,
    replies: row.replies,
    notionUrl: row.notion_url ?? "",
    source: normalizeSource(row.source),
    instantlyList: row.instantly_list ?? "",
    campaign: row.campaign ?? "",
    group: row.prospect_group ?? "",
    interestLevel: row.interest_level ?? "medium",
    planMode: row.plan_mode === "template" ? "template" : "custom",
    budgetTier:
      row.budget_tier === "premium" || row.budget_tier === "standard" || row.budget_tier === "basic"
        ? row.budget_tier
        : undefined,
    responses: normalizeResponses(row.response_tags),
    askedFor: row.asked_for ?? "not_set",
    askedForSecondary: row.asked_for_secondary ?? "not_set",
    autoTopProspect: Boolean(row.auto_top_prospect),
    nextFollowUpDate: row.next_follow_up_date ?? "",
    nextFollowUpTime: row.next_follow_up_time ?? "",
    followUpType: row.follow_up_type ?? "email",
    companyName: row.company_name ?? "",
    prospectName: row.prospect_name ?? "",
    role: row.role ?? "",
    industry: row.industry ?? "",
    email: row.email ?? "",
    secondaryEmail: row.secondary_email ?? "",
    cellPhone: row.cell_phone ?? "",
    businessPhone: row.business_phone ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    fee: row.fee ?? "",
    mrr: row.mrr ?? "",
    specialNotes: row.special_notes ?? "",
  };
}

export async function fetchSalesOutreach() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("sales_outreach")
    .select("*")
    .order("display_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SalesOutreachRow[];
}

export async function replaceSalesOutreach(
  items: SalesOutreachRecord[],
  options?: { allowEmptyDelete?: boolean }
) {
  if (!supabase) return;
  const payload = items.map((item, index) => ({
    id: item.id,
    prospect: item.prospect,
    contact: item.contact,
    status: toDbStatus(item.status),
    last_contact: item.lastContact?.trim() ? item.lastContact : null,
    emails_sent: item.emailsSent,
    replies: item.replies,
    notion_url: item.notionUrl?.trim() ? item.notionUrl : null,
    display_order: index,
    source: item.source === "cold_email" ? "cold_email" : item.source ?? "cold_email",
    instantly_list: item.instantlyList?.trim() ? item.instantlyList : null,
    campaign: item.campaign?.trim() ? item.campaign : null,
    prospect_group: item.group?.trim() ? item.group : null,
    interest_level: item.interestLevel ?? null,
    plan_mode: item.planMode ?? "custom",
    budget_tier: item.budgetTier ?? null,
    response_tags: item.responses && item.responses.length > 0 ? item.responses : null,
    asked_for: item.askedFor ?? null,
    asked_for_secondary: item.askedForSecondary ?? null,
    auto_top_prospect: Boolean(item.autoTopProspect),
    next_follow_up_date: item.nextFollowUpDate?.trim() ? item.nextFollowUpDate : null,
    next_follow_up_time: item.nextFollowUpTime?.trim() ? item.nextFollowUpTime : null,
    follow_up_type: item.followUpType ?? null,
    company_name: item.companyName?.trim() ? item.companyName : null,
    prospect_name: item.prospectName?.trim() ? item.prospectName : null,
    role: item.role?.trim() ? item.role : null,
    industry: item.industry?.trim() ? item.industry : null,
    email: item.email?.trim() ? item.email : null,
    secondary_email: item.secondaryEmail?.trim() ? item.secondaryEmail : null,
    cell_phone: item.cellPhone?.trim() ? item.cellPhone : null,
    business_phone: item.businessPhone?.trim() ? item.businessPhone : null,
    city: item.city?.trim() ? item.city : null,
    state: item.state?.trim() ? item.state : null,
    fee: item.fee?.trim() ? item.fee : null,
    mrr: item.mrr?.trim() ? item.mrr : null,
    special_notes: item.specialNotes?.trim() ? item.specialNotes : null,
  }));

  if (payload.length > 0) {
    const { error: upsertError } = await upsertSalesPayload(payload);
    if (upsertError) throw upsertError;
    const ids = payload.map((item) => item.id);
    const { error: pruneError } = await supabase.from("sales_outreach").delete().not("id", "in", `(${ids.join(",")})`);
    if (pruneError) throw pruneError;
    return;
  }

  if (!options?.allowEmptyDelete) {
    return;
  }

  const { error } = await supabase.from("sales_outreach").delete().neq("id", -1);
  if (error) throw error;
}

type OptionalSalesColumn =
  | "source"
  | "instantly_list"
  | "campaign"
  | "prospect_group"
  | "interest_level"
  | "plan_mode"
  | "budget_tier"
  | "response_tags"
  | "asked_for"
  | "asked_for_secondary"
  | "auto_top_prospect"
  | "next_follow_up_date"
  | "next_follow_up_time"
  | "follow_up_type"
  | "company_name"
  | "prospect_name"
  | "role"
  | "industry"
  | "email"
  | "secondary_email"
  | "cell_phone"
  | "business_phone"
  | "city"
  | "state"
  | "fee"
  | "mrr"
  | "special_notes";

const isMissingOptionalColumnError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  const candidates: OptionalSalesColumn[] = [
    "source",
    "instantly_list",
    "campaign",
    "prospect_group",
    "interest_level",
    "plan_mode",
    "budget_tier",
    "response_tags",
    "asked_for",
    "asked_for_secondary",
    "auto_top_prospect",
    "next_follow_up_date",
    "next_follow_up_time",
    "follow_up_type",
    "company_name",
    "prospect_name",
    "role",
    "industry",
    "email",
    "secondary_email",
    "cell_phone",
    "business_phone",
    "city",
    "state",
    "fee",
    "mrr",
    "special_notes",
  ];
  const mentionsOptional = candidates.some((column) => message.includes(column));
  const isSchemaCacheMiss = message.includes("schema cache") && message.includes("could not find");
  const isMissingColumn = message.includes("does not exist");
  return mentionsOptional && (isSchemaCacheMiss || isMissingColumn);
};

const getMissingOptionalColumn = (error: unknown): OptionalSalesColumn | null => {
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  const hasColumn = (column: OptionalSalesColumn) => {
    const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(message);
  };
  const candidates: OptionalSalesColumn[] = [
    "instantly_list",
    "campaign",
    "prospect_group",
    "interest_level",
    "plan_mode",
    "budget_tier",
    "response_tags",
    "asked_for_secondary",
    "asked_for",
    "auto_top_prospect",
    "next_follow_up_date",
    "next_follow_up_time",
    "follow_up_type",
    "company_name",
    "prospect_name",
    "cell_phone",
    "business_phone",
    "industry",
    "source",
    "email",
    "secondary_email",
    "state",
    "city",
    "role",
    "fee",
    "mrr",
    "special_notes",
  ];
  return candidates.find((column) => hasColumn(column)) ?? null;
};

const toMissingColumnMigrationError = (error: unknown) => {
  const baseMessage =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message || "Missing column")
      : "Missing column";
  return new Error(
    `${baseMessage}. Supabase schema is behind Delphi fields. Run /supabase/linked_schedule_sync_migration.sql, then retry save.`
  );
};

async function upsertSalesPayload(payload: Array<Record<string, unknown>>) {
  if (!supabase) return { error: null };
  const attempt = await supabase.from("sales_outreach").upsert(payload, { onConflict: "id" });
  if (!attempt.error) return attempt;
  if (!isMissingOptionalColumnError(attempt.error)) return attempt;
  const missingColumn = getMissingOptionalColumn(attempt.error);
  if (!missingColumn) return { ...attempt, error: toMissingColumnMigrationError(attempt.error) as unknown as typeof attempt.error };
  return {
    ...attempt,
    error: toMissingColumnMigrationError(attempt.error) as unknown as typeof attempt.error,
  };
}
