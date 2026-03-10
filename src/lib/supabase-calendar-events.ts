import { supabase } from "@/lib/supabase";

export type CalendarColor = "cyan" | "violet" | "emerald" | "rose" | "amber";

export interface CalendarEventRow {
  id: number;
  title: string;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  all_day: boolean;
  color: CalendarColor;
  display_order: number;
  updated_at: string;
  source_layer?: "manual" | "my-work-mirror" | null;
  linked?: boolean | null;
  linked_source?: "development" | "sales" | "subscriptions" | null;
  linked_key?: string | null;
  linked_ref_id?: number | null;
  linked_ref_sub_id?: number | null;
}

export interface CalendarEventRecord {
  id: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
  allDay?: boolean;
  color?: CalendarColor;
  sourceLayer?: "manual" | "my-work-mirror";
  linked?: boolean;
  linkedSource?: "development" | "sales" | "subscriptions";
  linkedKey?: string;
  linkedRefId?: number | null;
  linkedRefSubId?: number | null;
}

export function mapCalendarRowToRecord(row: CalendarEventRow): CalendarEventRecord {
  return {
    id: row.id,
    title: row.title,
    date: row.event_date ?? "",
    startTime: row.start_time?.slice(0, 5) ?? "",
    endTime: row.end_time?.slice(0, 5) ?? "",
    notes: row.notes ?? "",
    allDay: row.all_day,
    color: row.color || "cyan",
    sourceLayer: row.source_layer ?? "manual",
    linked: Boolean(row.linked),
    linkedSource: row.linked_source ?? undefined,
    linkedKey: row.linked_key ?? undefined,
    linkedRefId: row.linked_ref_id ?? null,
    linkedRefSubId: row.linked_ref_sub_id ?? null,
  };
}

export async function fetchCalendarEvents() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .order("display_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CalendarEventRow[];
}

export async function replaceCalendarEvents(events: CalendarEventRecord[]) {
  if (!supabase) return;
  const payload = events.map((event, index) => ({
    id: event.id,
    title: event.title,
    event_date: event.date?.trim() ? event.date : null,
    start_time: event.startTime?.trim() ? `${event.startTime}:00` : null,
    end_time: event.endTime?.trim() ? `${event.endTime}:00` : null,
    notes: (event.notes || "").trim(),
    all_day: Boolean(event.allDay),
    color: event.color || "cyan",
    display_order: index,
    source_layer: event.sourceLayer || "manual",
    linked: Boolean(event.linked),
    linked_source: event.linkedSource ?? null,
    linked_key: event.linkedKey ?? null,
    linked_ref_id: event.linkedRefId ?? null,
    linked_ref_sub_id: event.linkedRefSubId ?? null,
  }));

  if (payload.length > 0) {
    const { error: upsertError } = await upsertCalendarPayload(payload);
    if (upsertError) throw upsertError;
    const ids = payload.map((item) => item.id);
    const { error: pruneError } = await supabase.from("calendar_events").delete().not("id", "in", `(${ids.join(",")})`);
    if (pruneError) throw pruneError;
    return;
  }

  const { error } = await supabase.from("calendar_events").delete().neq("id", -1);
  if (error) throw error;
}

type OptionalCalendarColumn =
  | "source_layer"
  | "linked"
  | "linked_source"
  | "linked_key"
  | "linked_ref_id"
  | "linked_ref_sub_id";

const isMissingOptionalColumnError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  const mentionsOptionalColumn =
    message.includes("source_layer") ||
    message.includes("linked_source") ||
    message.includes("linked_key") ||
    message.includes("linked_ref_id") ||
    message.includes("linked_ref_sub_id") ||
    message.includes("linked");
  const isSchemaCacheMiss = message.includes("schema cache") && message.includes("could not find");
  const isMissingColumn = message.includes("does not exist");
  return mentionsOptionalColumn && (isSchemaCacheMiss || isMissingColumn);
};

const getMissingOptionalColumn = (error: unknown): OptionalCalendarColumn | null => {
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  if (message.includes("source_layer")) return "source_layer";
  if (message.includes("linked_source")) return "linked_source";
  if (message.includes("linked_key")) return "linked_key";
  if (message.includes("linked_ref_id")) return "linked_ref_id";
  if (message.includes("linked_ref_sub_id")) return "linked_ref_sub_id";
  if (message.includes("linked")) return "linked";
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

async function upsertCalendarPayload(payload: Array<Record<string, unknown>>) {
  if (!supabase) return { error: null };
  const attempt = await supabase.from("calendar_events").upsert(payload, { onConflict: "id" });
  if (!attempt.error) return attempt;
  if (!isMissingOptionalColumnError(attempt.error)) return attempt;
  const missingColumn = getMissingOptionalColumn(attempt.error);
  if (!missingColumn) return { ...attempt, error: toMissingColumnMigrationError(attempt.error) as unknown as typeof attempt.error };
  return {
    ...attempt,
    error: toMissingColumnMigrationError(attempt.error) as unknown as typeof attempt.error,
  };
}
