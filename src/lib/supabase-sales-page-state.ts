import { supabase } from "@/lib/supabase";

export type SalesPageStateKey =
  | "starred_prospect_ids"
  | "strategy_items"
  | "sales_tasks"
  | "limbo_items"
  | "instantly_lists"
  | "campaign_options"
  | "group_options"
  | "role_options"
  | "industry_options";

export interface SalesPageStateRow {
  key: SalesPageStateKey;
  payload: unknown;
  updated_at: string;
}

const VALID_KEYS: SalesPageStateKey[] = [
  "starred_prospect_ids",
  "strategy_items",
  "sales_tasks",
  "limbo_items",
  "instantly_lists",
  "campaign_options",
  "group_options",
  "role_options",
  "industry_options",
];

const isMissingTableError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  return (
    message.includes("sales_page_state") &&
    ((message.includes("schema cache") && message.includes("could not find")) || message.includes("does not exist"))
  );
};

const toMissingTableMigrationError = (error: unknown) => {
  const baseMessage =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message || "Missing table")
      : "Missing table";
  return new Error(
    `${baseMessage}. Supabase sales page state table is missing. Run /supabase/linked_schedule_sync_migration.sql, then retry save.`
  );
};

export async function fetchSalesPageState() {
  if (!supabase) return [] as SalesPageStateRow[];
  const { data, error } = await supabase
    .from("sales_page_state")
    .select("*")
    .order("key", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) throw toMissingTableMigrationError(error);
    throw error;
  }
  return (data ?? []) as SalesPageStateRow[];
}

export async function replaceSalesPageState(entries: Partial<Record<SalesPageStateKey, unknown>>) {
  if (!supabase) return;
  const keys = VALID_KEYS.filter((key) => key in entries);
  const payload = keys.map((key) => ({
    key,
    payload: entries[key] ?? null,
  }));

  if (payload.length > 0) {
    const { error: upsertError } = await supabase.from("sales_page_state").upsert(payload, { onConflict: "key" });
    if (upsertError) {
      if (isMissingTableError(upsertError)) throw toMissingTableMigrationError(upsertError);
      throw upsertError;
    }
    const quotedKeys = payload.map((item) => `'${item.key}'`).join(",");
    const { error: pruneError } = await supabase.from("sales_page_state").delete().not("key", "in", `(${quotedKeys})`);
    if (pruneError) throw pruneError;
    return;
  }

  const { error } = await supabase.from("sales_page_state").delete().neq("key", "");
  if (error) {
    if (isMissingTableError(error)) throw toMissingTableMigrationError(error);
    throw error;
  }
}
