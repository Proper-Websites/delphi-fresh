import { isSupabaseConfigured } from "@/lib/supabase";
import { replaceCalendarEvents, type CalendarEventRecord } from "@/lib/supabase-calendar-events";
import { replaceMyWorkTasks, type MyWorkTaskRecord } from "@/lib/supabase-my-work";
import { getSupabaseErrorMessage } from "@/lib/supabase-errors";

const MY_WORK_KEY = "delphi_my_work_tasks_v3";
const CALENDAR_KEY = "delphi_calendar_events_v2";
const DEVELOPMENT_KEY = "delphi_development_projects_v2";
const DEVELOPMENT_WORKFLOW_KEY = "delphi_development_project_workflows_v2";
const SALES_KEY = "delphi_sales_outreach_v2";
const SUBSCRIPTIONS_KEY = "delphi_subscriptions_clients_v2";
const SYNC_HEALTH_KEY = "delphi_linked_sync_health_v1";

type LinkedSource = "development" | "sales" | "subscriptions";
type LinkedSyncState = "synced" | "warning" | "error";

type StoredTask = MyWorkTaskRecord & {
  linked?: boolean;
  linkedSource?: LinkedSource;
  linkedKey?: string;
  linkedRefId?: number | null;
  linkedRefSubId?: number | null;
};

type StoredCalendarEvent = CalendarEventRecord & {
  sourceLayer?: "manual" | "my-work-mirror";
  linked?: boolean;
  linkedSource?: LinkedSource;
  linkedKey?: string;
  linkedRefId?: number | null;
  linkedRefSubId?: number | null;
};

type DevelopmentProject = {
  id: number;
  name?: string;
  client?: string;
  startDate?: string;
  deadline?: string;
  status?: "planning" | "in_progress" | "review";
};

type DevelopmentWorkflowTask = {
  id: number;
  title?: string;
  done?: boolean;
  priority?: MyWorkTaskRecord["priority"];
  durationMinutes?: number;
  date?: string;
};

type SalesProspect = {
  id: number;
  prospect?: string;
  status?: "interested" | "follow_up" | "booked" | "verdict" | "no_response";
  nextFollowUpDate?: string;
  nextFollowUpTime?: string;
  lastContact?: string;
};

type SubscriptionClient = {
  id: number;
  client?: string;
  nextBilling?: string;
  lastRevisionDate?: string;
  status?: "active" | "limit_reached" | "pending_payment";
};

export interface LinkedSyncIssue {
  category: "duplicate_linked_key" | "orphan_linked_item" | "unscheduled_source" | "calendar_mismatch" | "writeback_failure";
  key: string;
  detail: string;
}

export interface LinkedSyncReport {
  state: LinkedSyncState;
  linkedCount: number;
  mirroredCount: number;
  manualTaskCount: number;
  manualCalendarCount: number;
  issues: LinkedSyncIssue[];
  message: string;
  finishedAt: string;
}

const isPriority = (value: unknown): value is MyWorkTaskRecord["priority"] =>
  value === "crucial" || value === "high" || value === "medium" || value === "low";

const readArray = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const readRecord = <T,>(key: string): Record<string, T> => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, T>;
  } catch {
    return {};
  }
};

const isValidDateKey = (value: string | undefined | null): value is string => {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
};

const isValidTimeKey = (value: string | undefined | null): value is string =>
  Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

const getTodayDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toTimeKey = (minutes: number) => {
  const safe = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const hours = String(Math.floor(safe / 60)).padStart(2, "0");
  const mins = String(safe % 60).padStart(2, "0");
  return `${hours}:${mins}`;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const linkedTaskId = (key: string) => 700_000_000 + (hashString(key) % 200_000_000);
const linkedEventId = (key: string) => 900_000_000 + (hashString(key) % 90_000_000);

const normalizeWorkflowTasks = (value: unknown): DevelopmentWorkflowTask[] => {
  if (!Array.isArray(value)) return [];
  return value.map((task) => {
    const source = (task && typeof task === "object" ? task : {}) as Partial<DevelopmentWorkflowTask>;
    return {
      id: typeof source.id === "number" ? source.id : Date.now(),
      title: String(source.title || "").trim(),
      done: Boolean(source.done),
      priority: isPriority(source.priority) ? source.priority : "medium",
      durationMinutes: Math.max(15, Number(source.durationMinutes) || 30),
      date: String((source as { date?: unknown }).date || "").trim(),
    };
  });
};

const makeLinkedTask = (
  source: LinkedSource,
  linkedKey: string,
  title: string,
  date: string,
  options: {
    project: string;
    department: string;
    priority?: MyWorkTaskRecord["priority"];
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
    linkedRefId?: number | null;
    linkedRefSubId?: number | null;
    completed?: boolean;
  }
): StoredTask => ({
  id: linkedTaskId(linkedKey),
  linked: true,
  linkedSource: source,
  linkedKey,
  linkedRefId: options.linkedRefId ?? null,
  linkedRefSubId: options.linkedRefSubId ?? null,
  title,
  project: options.project,
  priority: options.priority ?? "medium",
  date,
  startTime: options.startTime ?? "",
  endTime: options.endTime ?? "",
  durationMinutes: options.durationMinutes ?? 60,
  completed: Boolean(options.completed),
  department: options.department,
});

const makeMirrorEvent = (task: StoredTask): StoredCalendarEvent => ({
  id: linkedEventId(task.linkedKey || String(task.id)),
  title: task.title,
  date: task.date,
  startTime: task.startTime,
  endTime: task.endTime,
  notes: task.project || "",
  allDay: !isValidTimeKey(task.startTime) || !isValidTimeKey(task.endTime),
  color: task.linkedSource === "sales" ? "emerald" : task.linkedSource === "subscriptions" ? "amber" : "violet",
  sourceLayer: "my-work-mirror",
  linked: true,
  linkedSource: task.linkedSource,
  linkedKey: task.linkedKey,
  linkedRefId: task.linkedRefId ?? null,
  linkedRefSubId: task.linkedRefSubId ?? null,
});

const buildLinkedTasksFromSnapshot = (): { linkedTasks: StoredTask[]; issues: LinkedSyncIssue[] } => {
  const issues: LinkedSyncIssue[] = [];
  const development = readArray<DevelopmentProject>(DEVELOPMENT_KEY);
  const developmentWorkflowMap = readRecord<DevelopmentWorkflowTask[]>(DEVELOPMENT_WORKFLOW_KEY);
  const sales = readArray<SalesProspect>(SALES_KEY);
  const subscriptions = readArray<SubscriptionClient>(SUBSCRIPTIONS_KEY);
  const linkedTasks: StoredTask[] = [];

  development.forEach((project) => {
    const projectName = String(project.name || "Project").trim() || "Project";
    const clientName = String(project.client || "Development").trim() || "Development";

    if (isValidDateKey(project.startDate)) {
      const key = `development:${project.id}:start`;
      linkedTasks.push(
        makeLinkedTask("development", key, `Kickoff: ${projectName}`, project.startDate, {
          project: clientName,
          department: "Development",
          priority: "medium",
          linkedRefId: project.id,
        })
      );
    } else {
      issues.push({
        category: "unscheduled_source",
        key: `development:${project.id}:start`,
        detail: `Project "${projectName}" is missing Start Date.`,
      });
    }

    if (isValidDateKey(project.deadline)) {
      const key = `development:${project.id}:deadline`;
      linkedTasks.push(
        makeLinkedTask("development", key, `Deadline: ${projectName}`, project.deadline, {
          project: clientName,
          department: "Development",
          priority: "crucial",
          linkedRefId: project.id,
        })
      );
    } else {
      issues.push({
        category: "unscheduled_source",
        key: `development:${project.id}:deadline`,
        detail: `Project "${projectName}" is missing Launch Date.`,
      });
    }

    const workflow = normalizeWorkflowTasks(
      developmentWorkflowMap[String(project.id)] ?? developmentWorkflowMap[String(Number(project.id))]
    );
    const openWorkflow = workflow.filter((task) => !task.done && task.title);
    openWorkflow.slice(0, 8).forEach((task, index) => {
      const key = `development:${project.id}:workflow:${task.id}`;
      const durationMinutes = Math.max(15, Number(task.durationMinutes) || 30);
      const startMinutes = 9 * 60 + index * 45;
      const taskDate =
        (isValidDateKey(task.date) && task.date) ||
        (isValidDateKey(project.deadline) && project.deadline) ||
        (isValidDateKey(project.startDate) && project.startDate) ||
        null;
      if (!taskDate) {
        issues.push({
          category: "unscheduled_source",
          key,
          detail: `Workflow task "${String(task.title).trim()}" in "${projectName}" is missing a date.`,
        });
        return;
      }
      linkedTasks.push(
        makeLinkedTask("development", key, `Task: ${projectName} — ${String(task.title).trim()}`, taskDate, {
          project: clientName,
          department: "Development",
          priority: task.priority || "medium",
          durationMinutes,
          linkedRefId: project.id,
          linkedRefSubId: task.id,
        })
      );
    });
  });

  sales.forEach((prospect) => {
    const followUpDate = isValidDateKey(prospect.nextFollowUpDate) ? prospect.nextFollowUpDate : null;

    if (!followUpDate) {
      issues.push({
        category: "unscheduled_source",
        key: `sales:${prospect.id}:next-task`,
        detail: `Prospect "${prospect.prospect || prospect.id}" is missing Next Task Date.`,
      });
      return;
    }

    const prospectName = String(prospect.prospect || "Prospect").trim() || "Prospect";
    const status = prospect.status || "follow_up";
    const startTime = isValidTimeKey(prospect.nextFollowUpTime) ? prospect.nextFollowUpTime : "";
    const [hour, minute] = startTime ? startTime.split(":").map(Number) : [0, 0];
    linkedTasks.push(
      makeLinkedTask("sales", `sales:${prospect.id}:next-task`, prospectName, followUpDate, {
        project: prospectName,
        department: "Sales",
        priority: status === "interested" || status === "booked" || status === "verdict" ? "high" : "medium",
        startTime,
        endTime: startTime ? toTimeKey(hour * 60 + minute + 30) : "",
        durationMinutes: 30,
        linkedRefId: prospect.id,
      })
    );
  });

  subscriptions.forEach((client) => {
    const clientName = String(client.client || "Client").trim() || "Client";

    if (isValidDateKey(client.nextBilling)) {
      linkedTasks.push(
        makeLinkedTask("subscriptions", `subscriptions:${client.id}:billing`, `Billing: ${clientName}`, client.nextBilling, {
          project: clientName,
          department: "Subscriptions",
          priority: client.status === "pending_payment" ? "crucial" : "high",
          durationMinutes: 30,
          linkedRefId: client.id,
        })
      );
    } else {
      issues.push({
        category: "unscheduled_source",
        key: `subscriptions:${client.id}:billing`,
        detail: `Subscription "${clientName}" is missing Next Billing Date.`,
      });
    }

    if (isValidDateKey(client.lastRevisionDate)) {
      linkedTasks.push(
        makeLinkedTask("subscriptions", `subscriptions:${client.id}:revision`, `Revision: ${clientName}`, client.lastRevisionDate, {
          project: clientName,
          department: "Subscriptions",
          priority: "medium",
          durationMinutes: 30,
          linkedRefId: client.id,
        })
      );
    }
  });

  return { linkedTasks, issues };
};

const dedupeByLinkedKey = <T extends { linkedKey?: string; id: number }>(items: T[], issues: LinkedSyncIssue[]) => {
  const next: T[] = [];
  const seen = new Set<string>();
  items.forEach((item) => {
    if (!item.linkedKey) {
      next.push(item);
      return;
    }
    if (seen.has(item.linkedKey)) {
      issues.push({
        category: "duplicate_linked_key",
        key: item.linkedKey,
        detail: `Duplicate linked key found and removed: ${item.linkedKey}`,
      });
      return;
    }
    seen.add(item.linkedKey);
    next.push(item);
  });
  return next;
};

const dedupeAndNormalizeIds = <T extends { id: number }>(items: T[]) => {
  const seen = new Set<number>();
  return items.map((item) => {
    if (!Number.isFinite(item.id)) {
      let fallback = Date.now();
      while (seen.has(fallback)) fallback += 1;
      seen.add(fallback);
      return { ...item, id: fallback };
    }

    let nextId = Math.trunc(item.id);
    const originalId = nextId;
    while (seen.has(nextId)) nextId += 1;
    seen.add(nextId);

    if (nextId !== originalId) return { ...item, id: nextId };
    return item;
  });
};

const isMissingSupabaseTableError = (error: unknown) => {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String((error as { message?: unknown }).message || "").toLowerCase();
  return (
    (message.includes("could not find") && message.includes("table")) ||
    message.includes("relation") && message.includes("does not exist")
  );
};

const toMirrorWriteDetail = (tableName: "my_work_tasks" | "calendar_events", error: unknown) => {
  const message = getSupabaseErrorMessage(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("permission denied") || normalized.includes("row-level security")) {
    return `Supabase write failed for ${tableName}: ${message}. Check RLS/policies for insert, update, and delete.`;
  }
  if (normalized.includes("schema cache") || normalized.includes("does not exist") || normalized.includes("could not find")) {
    return `Supabase write failed for ${tableName}: ${message}. Run migration SQL and reload schema cache.`;
  }
  return `Supabase write failed for ${tableName}: ${message}`;
};

const storeHealth = (report: LinkedSyncReport) => {
  localStorage.setItem(SYNC_HEALTH_KEY, JSON.stringify(report));
  window.dispatchEvent(new CustomEvent("delphi-linked-schedule-sync", { detail: report }));
};

export function getStoredLinkedSyncHealth(): LinkedSyncReport | null {
  try {
    const raw = localStorage.getItem(SYNC_HEALTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LinkedSyncReport;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function previewLinkedSyncReview(): LinkedSyncReport {
  const existingTasks = readArray<StoredTask>(MY_WORK_KEY);
  const existingEvents = readArray<StoredCalendarEvent>(CALENDAR_KEY);
  const manualTaskCount = existingTasks.filter((task) => !task.linked).length;
  const manualCalendarCount = existingEvents.filter((event) => event.sourceLayer !== "my-work-mirror").length;
  const { linkedTasks, issues } = buildLinkedTasksFromSnapshot();
  const linkedDedupe = dedupeByLinkedKey(linkedTasks, issues);
  const mirrorDedupe = dedupeByLinkedKey(linkedDedupe.map((task) => makeMirrorEvent(task)), issues);

  const missingDateCount = issues.filter((issue) => issue.category === "unscheduled_source").length;
  const hardIssueCount = issues.length - missingDateCount;
  const report: LinkedSyncReport = {
    state: issues.length > 0 ? "warning" : "synced",
    linkedCount: linkedDedupe.length,
    mirroredCount: mirrorDedupe.length,
    manualTaskCount,
    manualCalendarCount,
    issues,
    message:
      issues.length === 0
        ? "Linked sync preview clean."
        : hardIssueCount > 0 && missingDateCount > 0
          ? `Sync preview: ${missingDateCount} missing date warning(s), ${hardIssueCount} system warning(s).`
          : missingDateCount > 0
            ? `Sync preview: ${missingDateCount} missing date warning(s).`
            : `Linked sync preview found ${hardIssueCount} system warning(s).`,
    finishedAt: new Date().toISOString(),
  };
  return report;
}

export async function runLinkedScheduleSync(): Promise<LinkedSyncReport> {
  const existingTasks = readArray<StoredTask>(MY_WORK_KEY);
  const existingEvents = readArray<StoredCalendarEvent>(CALENDAR_KEY);
  const issues: LinkedSyncIssue[] = [];

  const completionByLinkedKey = new Map<string, boolean>();
  existingTasks.forEach((task) => {
    if (task.linked && task.linkedKey) completionByLinkedKey.set(task.linkedKey, Boolean(task.completed));
  });

  const { linkedTasks, issues: sourceIssues } = buildLinkedTasksFromSnapshot();
  issues.push(...sourceIssues);

  linkedTasks.forEach((task) => {
    if (task.linkedKey && completionByLinkedKey.has(task.linkedKey)) {
      task.completed = completionByLinkedKey.get(task.linkedKey) ?? false;
    }
  });

  const linkedTaskList = dedupeByLinkedKey(linkedTasks, issues).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return a.title.localeCompare(b.title);
  });

  const manualTasks = existingTasks.filter((task) => !task.linked);
  const nextTasks = dedupeAndNormalizeIds([...manualTasks, ...linkedTaskList]);
  localStorage.setItem(MY_WORK_KEY, JSON.stringify(nextTasks));

  const mirroredEvents = dedupeByLinkedKey(linkedTaskList.map((task) => makeMirrorEvent(task)), issues).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });
  const manualCalendar = existingEvents.filter((event) => event.sourceLayer !== "my-work-mirror" && !event.linked);
  const nextCalendar = dedupeAndNormalizeIds([...manualCalendar, ...mirroredEvents]);
  localStorage.setItem(CALENDAR_KEY, JSON.stringify(nextCalendar));

  if (isSupabaseConfigured) {
    try {
      await replaceMyWorkTasks(nextTasks);
    } catch (error) {
      if (!isMissingSupabaseTableError(error)) {
        issues.push({
          category: "calendar_mismatch",
          key: "my_work_tasks",
          detail: toMirrorWriteDetail("my_work_tasks", error),
        });
      }
    }
    try {
      await replaceCalendarEvents(nextCalendar);
    } catch (error) {
      if (!isMissingSupabaseTableError(error)) {
        issues.push({
          category: "calendar_mismatch",
          key: "calendar_events",
          detail: toMirrorWriteDetail("calendar_events", error),
        });
      }
    }
  }

  const missingDateCount = issues.filter((issue) => issue.category === "unscheduled_source").length;
  const hardIssueCount = issues.length - missingDateCount;
  const report: LinkedSyncReport = {
    state: issues.length > 0 ? "warning" : "synced",
    linkedCount: linkedTaskList.length,
    mirroredCount: mirroredEvents.length,
    manualTaskCount: manualTasks.length,
    manualCalendarCount: manualCalendar.length,
    issues,
    message:
      issues.length === 0
        ? `Linked schedule synced (${linkedTaskList.length} linked tasks).`
        : hardIssueCount > 0 && missingDateCount > 0
          ? `Linked schedule synced with ${missingDateCount} missing date warning(s) and ${hardIssueCount} system warning(s).`
          : missingDateCount > 0
            ? `Linked schedule synced with ${missingDateCount} missing date warning(s).`
            : `Linked schedule synced with ${hardIssueCount} system warning(s).`,
    finishedAt: new Date().toISOString(),
  };
  storeHealth(report);
  return report;
}
