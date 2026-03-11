import { supabase } from "@/lib/supabase";

type LegacySubscriptionClientStatus = "active" | "limit_reached" | "pending_payment";

export type SubscriptionClientStatus = "active" | "pending_payment";

export interface SubscriptionClientRow {
  id: number;
  client: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  client_since?: string | null;
  plan: string;
  mrr: string;
  revisions_used: number;
  revisions_total: number;
  status: LegacySubscriptionClientStatus;
  next_billing: string | null;
  last_revision: string;
  last_revision_date: string | null;
  display_order: number;
  updated_at: string;
}

export interface SubscriptionClientRecord {
  id: number;
  client: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  clientSince: string;
  plan: string;
  mrr: string;
  status: SubscriptionClientStatus;
  nextBilling: string;
  lastRevision: string;
  lastRevisionDate: string;
}

export function mapSubscriptionClientRowToRecord(row: SubscriptionClientRow): SubscriptionClientRecord {
  return {
    id: row.id,
    client: row.client,
    contactName: row.contact_name ?? "",
    contactPhone: row.contact_phone ?? "",
    contactEmail: row.contact_email ?? "",
    clientSince: row.client_since ?? "",
    plan: row.plan,
    mrr: row.mrr,
    status: row.status === "pending_payment" ? "pending_payment" : "active",
    nextBilling: row.next_billing ?? "",
    lastRevision: row.last_revision,
    lastRevisionDate: row.last_revision_date ?? "N/A",
  };
}

export async function fetchSubscriptionClients() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("subscription_clients")
    .select("*")
    .order("display_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SubscriptionClientRow[];
}

export async function replaceSubscriptionClients(items: SubscriptionClientRecord[]) {
  if (!supabase) return;
  const payload = items.map((item, index) => ({
    id: item.id,
    client: item.client,
    contact_name: item.contactName?.trim() ? item.contactName : null,
    contact_phone: item.contactPhone?.trim() ? item.contactPhone : null,
    contact_email: item.contactEmail?.trim() ? item.contactEmail : null,
    client_since: item.clientSince?.trim() ? item.clientSince : null,
    plan: item.plan,
    mrr: item.mrr,
    revisions_used: 0,
    revisions_total: 0,
    status: item.status,
    next_billing: item.nextBilling?.trim() ? item.nextBilling : null,
    last_revision: item.lastRevision,
    last_revision_date: item.lastRevisionDate?.trim() && item.lastRevisionDate !== "N/A" ? item.lastRevisionDate : null,
    display_order: index,
  }));

  const getMissingOptionalColumn = (error: unknown): "contact_name" | "contact_phone" | "contact_email" | "client_since" | null => {
    const message = String((error as { message?: unknown })?.message || "").toLowerCase();
    const isSchemaCacheMiss = message.includes("schema cache") && message.includes("could not find");
    const isMissingColumn = message.includes("does not exist");
    if (!isSchemaCacheMiss && !isMissingColumn) return null;
    if (message.includes("contact_name")) return "contact_name";
    if (message.includes("contact_phone")) return "contact_phone";
    if (message.includes("contact_email")) return "contact_email";
    if (message.includes("client_since")) return "client_since";
    return null;
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
  const upsertPayload = async (rows: Array<Record<string, unknown>>) => {
    const { error } = await supabase.from("subscription_clients").upsert(rows, { onConflict: "id" });
    if (!error) return;
    const missing = getMissingOptionalColumn(error);
    if (!missing) throw error;
    throw toMissingColumnMigrationError(error);
  };

  if (payload.length > 0) {
    await upsertPayload(payload as Array<Record<string, unknown>>);
    const ids = payload.map((item) => item.id);
    const { error: pruneError } = await supabase.from("subscription_clients").delete().not("id", "in", `(${ids.join(",")})`);
    if (pruneError) throw pruneError;
    return;
  }

  const { error } = await supabase.from("subscription_clients").delete().neq("id", -1);
  if (error) throw error;
}
