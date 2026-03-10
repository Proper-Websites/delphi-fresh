import { toSmartTitleCase } from "@/lib/text-format";

export type ImportMode = "merge" | "replace";

type CsvRow = Record<string, string>;

export interface ImportedMyWorkTask {
  id: number;
  title: string;
  project: string;
  priority: "crucial" | "high" | "medium" | "low";
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  completed: boolean;
  department: string;
}

export interface ImportedDevelopmentProject {
  id: number;
  name: string;
  client: string;
  websiteUrl: string;
  commentingToolUrl: string;
  status: "in_progress" | "review" | "planning";
  stage: "rough_draft" | "final_draft" | "retrieve_info" | "finalize" | "launch";
  progress: number;
  budget: string;
  spent: string;
  deposit: string;
  startDate: string;
  deadline: string;
  team: string[];
  tasks: { total: number; completed: number };
}

export interface ImportedSalesProspect {
  id: number;
  prospect: string;
  contact: string;
  status: "interested" | "follow_up" | "meeting_scheduled" | "no_response";
  lastContact: string;
  emailsSent: number;
  replies: number;
  notionUrl: string;
}

export interface ImportedSubscriptionClient {
  id: number;
  client: string;
  plan: string;
  mrr: string;
  revisionsUsed: number;
  revisionsTotal: number;
  status: "active" | "limit_reached" | "pending_payment";
  nextBilling: string;
  lastRevision: string;
  lastRevisionDate: string;
}

export interface ClickUpImportBundle {
  myWork: ImportedMyWorkTask[];
  development: ImportedDevelopmentProject[];
  sales: ImportedSalesProspect[];
  subscriptions: ImportedSubscriptionClient[];
  warnings: string[];
}

const DEFAULT_START_HOUR = 9;

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-/.]+/g, " ")
    .replace(/\([^)]*\)/g, "")
    .trim();

const splitCsvLine = (line: string) => {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((item) => item.trim());
};

const parseCsv = (raw: string) => {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((header) => normalizeHeader(header));
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    if (values.every((value) => !value.trim())) continue;
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || "").trim();
    });
    rows.push(row);
  }

  return rows;
};

const getField = (row: CsvRow, keys: string[]) => {
  for (const key of keys) {
    const normalized = normalizeHeader(key);
    if (row[normalized]?.trim()) return row[normalized].trim();
  }
  return "";
};

const parseDate = (value: string) => {
  const raw = value.trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    const year = Number(us[3].length === 2 ? `20${us[3]}` : us[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
};

const parseTime = (value: string) => {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return "";
  let hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const ampm = match[3];
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return "";
  if (ampm === "pm" && hours < 12) hours += 12;
  if (ampm === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const toTime = (minutesRaw: number) => {
  const minutes = Math.max(0, Math.min(23 * 60 + 59, minutesRaw));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const parseDurationMinutes = (value: string) => {
  const raw = value.trim().toLowerCase();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (numeric > 100000) return Math.round(numeric / 60000);
    return numeric;
  }

  let total = 0;
  const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*h/);
  const minMatch = raw.match(/(\d+(?:\.\d+)?)\s*m/);
  if (hourMatch) total += Math.round(Number(hourMatch[1]) * 60);
  if (minMatch) total += Math.round(Number(minMatch[1]));
  return total;
};

const normalizeMoney = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return "$0";
  const number = Number(cleaned);
  return `$${number.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const inferDepartment = (row: CsvRow, title: string) => {
  const context = [
    title,
    getField(row, ["list name", "list"]),
    getField(row, ["folder name", "folder"]),
    getField(row, ["space name", "space"]),
    getField(row, ["tags", "tag"]),
  ]
    .join(" ")
    .toLowerCase();

  if (/(sale|lead|outreach|prospect|pipeline|discovery|proposal)/.test(context)) return "Sales";
  if (/(subscription|retainer|mrr|renewal|maintenance)/.test(context)) return "Subscriptions";
  if (/(dev|development|build|website|web|design|implementation|qa|launch)/.test(context)) return "Development";
  return "General";
};

const mapPriority = (value: string): ImportedMyWorkTask["priority"] => {
  const raw = value.trim().toLowerCase();
  if (/(urgent|critical|crucial|highest|p1)/.test(raw)) return "crucial";
  if (/(high|p2)/.test(raw)) return "high";
  if (/(medium|normal|p3)/.test(raw)) return "medium";
  return "low";
};

const mapCompleted = (value: string) => /(done|complete|closed|resolved|finished)/i.test(value);

const mapSalesStatus = (value: string): ImportedSalesProspect["status"] => {
  const raw = value.toLowerCase();
  if (/(interested|qualified|proposal)/.test(raw)) return "interested";
  if (/(meeting|call|booked)/.test(raw)) return "meeting_scheduled";
  if (/(no response|cold|ghost)/.test(raw)) return "no_response";
  return "follow_up";
};

const mapProjectStatus = (value: string): ImportedDevelopmentProject["status"] => {
  const raw = value.toLowerCase();
  if (/(review|qa|testing|feedback)/.test(raw)) return "review";
  if (/(planning|scope|backlog|draft)/.test(raw)) return "planning";
  return "in_progress";
};

const mapProjectStage = (value: string): ImportedDevelopmentProject["stage"] => {
  const raw = value.toLowerCase();
  if (/(launch|ship|live|done|complete)/.test(raw)) return "launch";
  if (/(final|handoff|approve)/.test(raw)) return "finalize";
  if (/(import|build|implement|develop)/.test(raw)) return "final_draft";
  if (/(retriev|intake|collect|discovery)/.test(raw)) return "retrieve_info";
  return "rough_draft";
};

const STAGE_TO_PROGRESS: Record<ImportedDevelopmentProject["stage"], number> = {
  rough_draft: 20,
  final_draft: 40,
  retrieve_info: 60,
  finalize: 80,
  launch: 100,
};

export const parseClickUpCsv = (rawCsv: string): ClickUpImportBundle => {
  const rows = parseCsv(rawCsv);
  const warnings: string[] = [];
  if (!rows.length) {
    return { myWork: [], development: [], sales: [], subscriptions: [], warnings: ["No rows found in CSV file."] };
  }

  const nowDate = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const myWork: ImportedMyWorkTask[] = [];
  const devMap = new Map<string, ImportedDevelopmentProject>();
  const sales: ImportedSalesProspect[] = [];
  const subscriptionMap = new Map<string, ImportedSubscriptionClient>();

  rows.forEach((row, index) => {
    const rawTitle = getField(row, ["task name", "name", "title"]);
    if (!rawTitle) return;

    const title = toSmartTitleCase(rawTitle);
    const statusRaw = getField(row, ["status"]);
    const department = inferDepartment(row, title);
    const priority = mapPriority(getField(row, ["priority"]));
    const startDate = parseDate(getField(row, ["start date", "date started"]));
    const dueDate = parseDate(getField(row, ["due date", "date due"]));
    const date = startDate || dueDate || nowDate;
    const estimate = parseDurationMinutes(getField(row, ["time estimate", "estimated time", "duration"]));
    const startTimeRaw =
      parseTime(getField(row, ["start time"])) ||
      parseTime(getField(row, ["start date"]));
    const dueTimeRaw =
      parseTime(getField(row, ["due time"])) ||
      parseTime(getField(row, ["due date"]));
    const fallbackStart = toTime((DEFAULT_START_HOUR + (index % 8)) * 60);
    const startTime = startTimeRaw || fallbackStart;
    const endTime = dueTimeRaw || toTime(toMinutes(startTime) + (estimate > 0 ? estimate : 60));
    const durationMinutes = Math.max(15, estimate || Math.max(15, toMinutes(endTime) - toMinutes(startTime)));
    const completed = mapCompleted(statusRaw);
    const projectContext = toSmartTitleCase(
      getField(row, ["list name", "list"]) || getField(row, ["folder name", "folder"]) || getField(row, ["space name", "space"])
    );
    const client = toSmartTitleCase(
      getField(row, ["client", "company", "account"]) || getField(row, ["assignees", "assignee"]) || "Internal"
    );

    myWork.push({
      id: Date.now() + index,
      title,
      project: projectContext || client,
      priority,
      date,
      startTime,
      endTime,
      durationMinutes,
      completed,
      department,
    });

    if (department === "Development") {
      const key = (projectContext || title).toLowerCase();
      const current = devMap.get(key);
      const stage = mapProjectStage(statusRaw);
      const status = mapProjectStatus(statusRaw);
      if (!current) {
        devMap.set(key, {
          id: Date.now() + 200000 + index,
          name: projectContext || title,
          client,
          websiteUrl: getField(row, ["website", "website url", "url"]),
          commentingToolUrl: getField(row, ["commenting tool", "commenting url", "ruttl", "ruttl url"]),
          status,
          stage,
          progress: STAGE_TO_PROGRESS[stage],
          budget: normalizeMoney(getField(row, ["budget", "fee", "development fee"])),
          spent: normalizeMoney(getField(row, ["spent", "cost"])),
          deposit: normalizeMoney(getField(row, ["deposit", "down payment", "initial payment"])),
          startDate: startDate || "",
          deadline: dueDate || "",
          team: [],
          tasks: { total: 1, completed: completed ? 1 : 0 },
        });
      } else {
        current.tasks.total += 1;
        if (completed) current.tasks.completed += 1;
        if (!current.startDate && startDate) current.startDate = startDate;
        if (!current.deadline && dueDate) current.deadline = dueDate;
        if (STAGE_TO_PROGRESS[stage] > current.progress) {
          current.stage = stage;
          current.progress = STAGE_TO_PROGRESS[stage];
          current.status = status;
        }
      }
    }

    if (department === "Sales") {
      const email = getField(row, ["email", "contact", "contact email"]);
      sales.push({
        id: Date.now() + 300000 + index,
        prospect: toSmartTitleCase(getField(row, ["company", "client", "prospect"]) || title),
        contact: email || "no-email@pending.local",
        status: mapSalesStatus(statusRaw),
        lastContact: dueDate || startDate || nowDate,
        emailsSent: Number(getField(row, ["emails sent", "emails"])) || 0,
        replies: Number(getField(row, ["replies"])) || 0,
        notionUrl: getField(row, ["url", "notion", "notion url"]),
      });
    }

    if (department === "Subscriptions") {
      const subKey = (getField(row, ["client", "company"]) || title).toLowerCase();
      if (!subscriptionMap.has(subKey)) {
        subscriptionMap.set(subKey, {
          id: Date.now() + 400000 + index,
          client: toSmartTitleCase(getField(row, ["client", "company"]) || title),
          plan: toSmartTitleCase(getField(row, ["plan"]) || "Retainer"),
          mrr: normalizeMoney(getField(row, ["mrr", "monthly recurring", "monthly fee"])),
          revisionsUsed: 0,
          revisionsTotal: Math.max(1, Number(getField(row, ["revisions", "revision limit"])) || 3),
          status: "active",
          nextBilling: dueDate || "",
          lastRevision: "N/A",
          lastRevisionDate: "N/A",
        });
      }
    }
  });

  if (!myWork.length) warnings.push("No valid task rows detected. Check that your CSV includes a Name or Task Name column.");

  return {
    myWork,
    development: Array.from(devMap.values()),
    sales,
    subscriptions: Array.from(subscriptionMap.values()),
    warnings,
  };
};

const dedupeBy = <T,>(items: T[], keyFn: (item: T) => string) => {
  const map = new Map<string, T>();
  items.forEach((item) => map.set(keyFn(item), item));
  return Array.from(map.values());
};

export const mergeImportedData = <T,>(current: T[], imported: T[], keyFn: (item: T) => string, mode: ImportMode) => {
  if (mode === "replace") return imported;
  return dedupeBy([...current, ...imported], keyFn);
};
