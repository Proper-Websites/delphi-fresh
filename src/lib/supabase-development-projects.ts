import type { Project } from "@/components/ProjectModal";
import { supabase } from "@/lib/supabase";
import { formatPhoneNumber } from "@/lib/phone-format";

export interface DevelopmentProjectRow {
  id: number | string;
  name: string;
  client: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website_url: string | null;
  commenting_tool_url: string | null;
  status: Project["status"];
  stage: Project["stage"] | null;
  progress: number;
  budget: string;
  spent: string;
  deposit_amount?: string | null;
  start_date: string | null;
  deadline: string | null;
  team: string[] | null;
  tasks_total: number;
  tasks_completed: number;
  display_order: number;
  updated_at: string;
}

export function mapRowToProject(row: DevelopmentProjectRow): Project {
  const parsedId = typeof row.id === "number" ? row.id : Number(row.id);
  const safeId = Number.isFinite(parsedId) ? parsedId : Date.now();
  const normalizeStage = (value: string | null | undefined, progress: number): Project["stage"] => {
    if (value === "rough_draft" || value === "final_draft" || value === "retrieve_info" || value === "finalize" || value === "launch") {
      return value;
    }
    if (value === "draft") return "rough_draft";
    if (value === "import") return "final_draft";
    if (progress >= 90) return "launch";
    if (progress >= 70) return "finalize";
    if (progress >= 50) return "retrieve_info";
    if (progress >= 30) return "final_draft";
    return "rough_draft";
  };

  const inferredStage: Project["stage"] =
    row.progress >= 90 ? "launch" :
    row.progress >= 70 ? "finalize" :
    row.progress >= 50 ? "retrieve_info" :
    row.progress >= 30 ? "final_draft" :
    "rough_draft";

  return {
    id: safeId,
    name: row.name,
    client: row.client,
    contactName: row.contact_name ?? "",
    contactEmail: row.contact_email ?? "",
    contactPhone: formatPhoneNumber(row.contact_phone ?? ""),
    websiteUrl: row.website_url ?? "",
    commentingToolUrl: row.commenting_tool_url ?? "",
    status: row.status,
    stage: normalizeStage(row.stage, row.progress) ?? inferredStage,
    progress: row.progress,
    budget: row.budget,
    spent: row.spent,
    deposit: row.deposit_amount ?? "",
    startDate: row.start_date ?? "",
    deadline: row.deadline ?? "",
    team: Array.isArray(row.team) ? row.team : [],
    tasks: {
      total: row.tasks_total,
      completed: row.tasks_completed,
    },
  };
}

export async function fetchDevelopmentProjects() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("development_projects")
    .select("*")
    .order("display_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as DevelopmentProjectRow[];
}

export async function upsertDevelopmentProjects(projects: Project[]) {
  if (!supabase) return;
  const payload = projects.map((project, index) => ({
    id: project.id,
    name: project.name,
    client: project.client,
    contact_name: project.contactName?.trim() ? project.contactName : null,
    contact_email: project.contactEmail?.trim() ? project.contactEmail : null,
    contact_phone: project.contactPhone?.trim() ? formatPhoneNumber(project.contactPhone) : null,
    website_url: project.websiteUrl?.trim() ? project.websiteUrl : null,
    commenting_tool_url: project.commentingToolUrl?.trim() ? project.commentingToolUrl : null,
    status: project.status,
    stage: project.stage,
    progress: project.progress,
    budget: project.budget,
    spent: project.spent,
    deposit_amount: project.deposit?.trim() ? project.deposit : null,
    start_date: project.startDate?.trim() ? project.startDate : null,
    deadline: project.deadline?.trim() ? project.deadline : null,
    team: project.team,
    tasks_total: project.tasks.total,
    tasks_completed: project.tasks.completed,
    display_order: index,
  }));

  const { error } = await upsertDevelopmentPayload(payload);
  if (error) throw error;
}

export async function replaceDevelopmentProjects(projects: Project[]) {
  if (!supabase) return;
  const payload = projects.map((project, index) => ({
    id: project.id,
    name: project.name,
    client: project.client,
    contact_name: project.contactName?.trim() ? project.contactName : null,
    contact_email: project.contactEmail?.trim() ? project.contactEmail : null,
    contact_phone: project.contactPhone?.trim() ? formatPhoneNumber(project.contactPhone) : null,
    website_url: project.websiteUrl?.trim() ? project.websiteUrl : null,
    commenting_tool_url: project.commentingToolUrl?.trim() ? project.commentingToolUrl : null,
    status: project.status,
    stage: project.stage,
    progress: project.progress,
    budget: project.budget,
    spent: project.spent,
    deposit_amount: project.deposit?.trim() ? project.deposit : null,
    start_date: project.startDate?.trim() ? project.startDate : null,
    deadline: project.deadline?.trim() ? project.deadline : null,
    team: project.team,
    tasks_total: project.tasks.total,
    tasks_completed: project.tasks.completed,
    display_order: index,
  }));

  if (payload.length > 0) {
    const { error: upsertError } = await upsertDevelopmentPayload(payload);
    if (upsertError) throw upsertError;
    const ids = payload.map((item) => item.id);
    const { error: pruneError } = await supabase
      .from("development_projects")
      .delete()
      .not("id", "in", `(${ids.join(",")})`);
    if (pruneError) throw pruneError;
    return;
  }

  const { error } = await supabase.from("development_projects").delete().neq("id", -1);
  if (error) throw error;
}

export async function deleteDevelopmentProject(id: number) {
  if (!supabase) return;
  const { error } = await supabase.from("development_projects").delete().eq("id", id);
  if (error) throw error;
}

const isMissingOptionalColumnError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  const mentionsOptionalColumn =
    message.includes("stage") ||
    message.includes("contact_name") ||
    message.includes("contact_email") ||
    message.includes("contact_phone") ||
    message.includes("website_url") ||
    message.includes("commenting_tool_url") ||
    message.includes("deposit_amount");
  const isSchemaCacheMiss = message.includes("schema cache") && message.includes("could not find");
  const isMissingColumn = message.includes("does not exist");
  return (
    mentionsOptionalColumn &&
    (isSchemaCacheMiss || isMissingColumn)
  );
};

type OptionalDevelopmentColumn =
  | "stage"
  | "contact_name"
  | "contact_email"
  | "contact_phone"
  | "website_url"
  | "commenting_tool_url"
  | "deposit_amount";

const getMissingOptionalColumn = (error: unknown): OptionalDevelopmentColumn | null => {
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  if (message.includes("contact_name")) return "contact_name";
  if (message.includes("contact_email")) return "contact_email";
  if (message.includes("contact_phone")) return "contact_phone";
  if (message.includes("commenting_tool_url")) return "commenting_tool_url";
  if (message.includes("website_url")) return "website_url";
  if (message.includes("deposit_amount")) return "deposit_amount";
  if (message.includes("stage")) return "stage";
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

async function upsertDevelopmentPayload(payload: Array<Record<string, unknown>>) {
  if (!supabase) return { error: null };
  const attempt = await supabase.from("development_projects").upsert(payload, { onConflict: "id" });
  if (!attempt.error) return attempt;
  if (!isMissingOptionalColumnError(attempt.error)) return attempt;
  const missingColumn = getMissingOptionalColumn(attempt.error);
  if (!missingColumn) return { ...attempt, error: toMissingColumnMigrationError(attempt.error) as unknown as typeof attempt.error };
  return {
    ...attempt,
    error: toMissingColumnMigrationError(attempt.error) as unknown as typeof attempt.error,
  };
}
