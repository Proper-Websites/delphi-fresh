import { supabase } from "@/lib/supabase";

export interface MyWorkTaskRow {
  id: number;
  title: string;
  project: string;
  priority: "crucial" | "high" | "medium" | "low";
  required: boolean;
  task_date: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  completed: boolean;
  department: string;
  display_order: number;
  updated_at: string;
  linked?: boolean | null;
  linked_source?: "development" | "sales" | "subscriptions" | null;
  linked_key?: string | null;
  linked_ref_id?: number | null;
  linked_ref_sub_id?: number | null;
}

export interface MyWorkTaskRecord {
  id: number;
  title: string;
  project: string;
  priority: "crucial" | "high" | "medium" | "low";
  required: boolean;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  completed: boolean;
  department: string;
  linked?: boolean;
  linkedSource?: "development" | "sales" | "subscriptions";
  linkedKey?: string;
  linkedRefId?: number | null;
  linkedRefSubId?: number | null;
}

export function mapMyWorkRowToRecord(row: MyWorkTaskRow): MyWorkTaskRecord {
  return {
    id: row.id,
    title: row.title,
    project: row.project,
    priority: row.priority,
    required: Boolean(row.required),
    date: row.task_date ?? "",
    startTime: row.start_time?.slice(0, 5) ?? "",
    endTime: row.end_time?.slice(0, 5) ?? "",
    durationMinutes: row.duration_minutes,
    completed: row.completed,
    department: row.department,
    linked: Boolean(row.linked),
    linkedSource: row.linked_source ?? undefined,
    linkedKey: row.linked_key ?? undefined,
    linkedRefId: row.linked_ref_id ?? null,
    linkedRefSubId: row.linked_ref_sub_id ?? null,
  };
}

export async function fetchMyWorkTasks() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("my_work_tasks")
    .select("*")
    .order("display_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyWorkTaskRow[];
}

export async function replaceMyWorkTasks(tasks: MyWorkTaskRecord[]) {
  if (!supabase) return;
  const payload = tasks.map((task, index) => ({
    id: task.id,
    title: task.title,
    project: task.project,
    priority: task.priority,
    required: Boolean(task.required),
    task_date: task.date?.trim() ? task.date : null,
    start_time: task.startTime?.trim() ? `${task.startTime}:00` : null,
    end_time: task.endTime?.trim() ? `${task.endTime}:00` : null,
    duration_minutes: task.durationMinutes,
    completed: task.completed,
    department: task.department,
    display_order: index,
    linked: Boolean(task.linked),
    linked_source: task.linkedSource ?? null,
    linked_key: task.linkedKey ?? null,
    linked_ref_id: task.linkedRefId ?? null,
    linked_ref_sub_id: task.linkedRefSubId ?? null,
  }));

  if (payload.length > 0) {
    const { error: upsertError } = await upsertMyWorkPayload(payload);
    if (upsertError) throw upsertError;
    const ids = payload.map((item) => item.id);
    const { error: pruneError } = await supabase.from("my_work_tasks").delete().not("id", "in", `(${ids.join(",")})`);
    if (pruneError) throw pruneError;
    return;
  }

  const { error } = await supabase.from("my_work_tasks").delete().neq("id", -1);
  if (error) throw error;
}

type OptionalMyWorkColumn =
  | "required"
  | "linked"
  | "linked_source"
  | "linked_key"
  | "linked_ref_id"
  | "linked_ref_sub_id";

const isMissingOptionalColumnError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  const mentionsOptionalColumn =
    message.includes("required") ||
    message.includes("linked_source") ||
    message.includes("linked_key") ||
    message.includes("linked_ref_id") ||
    message.includes("linked_ref_sub_id") ||
    message.includes("linked");
  const isSchemaCacheMiss = message.includes("schema cache") && message.includes("could not find");
  const isMissingColumn = message.includes("does not exist");
  return mentionsOptionalColumn && (isSchemaCacheMiss || isMissingColumn);
};

const getMissingOptionalColumn = (error: unknown): OptionalMyWorkColumn | null => {
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  if (message.includes("required")) return "required";
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

async function upsertMyWorkPayload(payload: Array<Record<string, unknown>>) {
  if (!supabase) return { error: null };
  const attempt = await supabase.from("my_work_tasks").upsert(payload, { onConflict: "id" });
  if (!attempt.error) return attempt;
  if (!isMissingOptionalColumnError(attempt.error)) return attempt;
  const missingColumn = getMissingOptionalColumn(attempt.error);
  if (!missingColumn) return { ...attempt, error: toMissingColumnMigrationError(attempt.error) as unknown as typeof attempt.error };
  return {
    ...attempt,
    error: toMissingColumnMigrationError(attempt.error) as unknown as typeof attempt.error,
  };
}
