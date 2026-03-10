import { replaceDevelopmentProjects } from "@/lib/supabase-development-projects";
import { replaceSalesOutreach, type SalesOutreachRecord } from "@/lib/supabase-sales-outreach";
import { replaceSubscriptionClients, type SubscriptionClientRecord } from "@/lib/supabase-subscriptions-clients";
import type { Project } from "@/components/ProjectModal";

const DEVELOPMENT_KEY = "delphi_development_projects_v2";
const DEVELOPMENT_WORKFLOW_KEY = "delphi_development_project_workflows_v2";
const SALES_KEY = "delphi_sales_outreach_v2";
const SUBSCRIPTIONS_KEY = "delphi_subscriptions_clients_v2";

export interface LinkedWritebackPatch {
  date?: string;
  startTime?: string;
  endTime?: string;
}

export interface LinkedWritebackResult {
  ok: boolean;
  source?: "development" | "sales" | "subscriptions";
  message: string;
}

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

const writeRecord = (key: string, value: unknown) => {
  const raw = JSON.stringify(value);
  localStorage.setItem(key, raw);
  window.dispatchEvent(
    new CustomEvent("delphi-localstorage-apply", {
      detail: { key, raw },
    })
  );
};

const persistDevelopmentProjects = async (projects: Record<string, unknown>[]) => {
  await replaceDevelopmentProjects(projects as unknown as Project[]);
};

const persistSalesOutreach = async (sales: Record<string, unknown>[]) => {
  await replaceSalesOutreach(sales as SalesOutreachRecord[]);
};

const persistSubscriptionClients = async (clients: Record<string, unknown>[]) => {
  await replaceSubscriptionClients(clients as SubscriptionClientRecord[]);
};

export async function applyLinkedWriteback(linkedKey: string, patch: LinkedWritebackPatch): Promise<LinkedWritebackResult> {
  if (!linkedKey) {
    return { ok: false, message: "Missing linked key." };
  }

  const devStartMatch = linkedKey.match(/^development:(\d+):start$/);
  if (devStartMatch) {
    const projectId = Number(devStartMatch[1]);
    const projects = readArray<Record<string, unknown>>(DEVELOPMENT_KEY);
    const next = projects.map((project) =>
      Number(project.id) === projectId ? { ...project, startDate: patch.date || project.startDate } : project
    );
    writeRecord(DEVELOPMENT_KEY, next);
    await persistDevelopmentProjects(next);
    window.dispatchEvent(new CustomEvent("delphi-linked-writeback", { detail: { source: "development", linkedKey } }));
    return { ok: true, source: "development", message: "Development kickoff date updated." };
  }

  const devDeadlineMatch = linkedKey.match(/^development:(\d+):deadline$/);
  if (devDeadlineMatch) {
    const projectId = Number(devDeadlineMatch[1]);
    const projects = readArray<Record<string, unknown>>(DEVELOPMENT_KEY);
    const next = projects.map((project) =>
      Number(project.id) === projectId ? { ...project, deadline: patch.date || project.deadline } : project
    );
    writeRecord(DEVELOPMENT_KEY, next);
    await persistDevelopmentProjects(next);
    window.dispatchEvent(new CustomEvent("delphi-linked-writeback", { detail: { source: "development", linkedKey } }));
    return { ok: true, source: "development", message: "Development deadline updated." };
  }

  const devWorkflowMatch = linkedKey.match(/^development:(\d+):workflow:(\d+)$/);
  if (devWorkflowMatch) {
    const projectId = Number(devWorkflowMatch[1]);
    const workflowTaskId = Number(devWorkflowMatch[2]);
    const workflowMap = readRecord<Array<Record<string, unknown>>>(DEVELOPMENT_WORKFLOW_KEY);
    const mapKey = String(projectId);
    const tasks = Array.isArray(workflowMap[mapKey]) ? workflowMap[mapKey] : [];
    const updated = tasks.map((task) =>
      Number(task.id) === workflowTaskId ? { ...task, date: patch.date || task.date } : task
    );
    writeRecord(DEVELOPMENT_WORKFLOW_KEY, { ...workflowMap, [mapKey]: updated });
    window.dispatchEvent(new CustomEvent("delphi-linked-writeback", { detail: { source: "development", linkedKey } }));
    return { ok: true, source: "development", message: "Development workflow task date updated." };
  }

  const salesMatch = linkedKey.match(/^sales:(\d+):next-task$/);
  if (salesMatch) {
    const prospectId = Number(salesMatch[1]);
    const sales = readArray<Record<string, unknown>>(SALES_KEY);
    const next = sales.map((prospect) =>
      Number(prospect.id) === prospectId
        ? {
            ...prospect,
            nextFollowUpDate: patch.date || prospect.nextFollowUpDate,
            nextFollowUpTime: patch.startTime || prospect.nextFollowUpTime,
          }
        : prospect
    );
    writeRecord(SALES_KEY, next);
    await persistSalesOutreach(next);
    window.dispatchEvent(new CustomEvent("delphi-linked-writeback", { detail: { source: "sales", linkedKey } }));
    return { ok: true, source: "sales", message: "Sales next task updated." };
  }

  const subBillingMatch = linkedKey.match(/^subscriptions:(\d+):billing$/);
  if (subBillingMatch) {
    const clientId = Number(subBillingMatch[1]);
    const clients = readArray<Record<string, unknown>>(SUBSCRIPTIONS_KEY);
    const next = clients.map((client) =>
      Number(client.id) === clientId ? { ...client, nextBilling: patch.date || client.nextBilling } : client
    );
    writeRecord(SUBSCRIPTIONS_KEY, next);
    await persistSubscriptionClients(next);
    window.dispatchEvent(new CustomEvent("delphi-linked-writeback", { detail: { source: "subscriptions", linkedKey } }));
    return { ok: true, source: "subscriptions", message: "Subscription billing date updated." };
  }

  const subRevisionMatch = linkedKey.match(/^subscriptions:(\d+):revision$/);
  if (subRevisionMatch) {
    const clientId = Number(subRevisionMatch[1]);
    const clients = readArray<Record<string, unknown>>(SUBSCRIPTIONS_KEY);
    const next = clients.map((client) =>
      Number(client.id) === clientId ? { ...client, lastRevisionDate: patch.date || client.lastRevisionDate } : client
    );
    writeRecord(SUBSCRIPTIONS_KEY, next);
    await persistSubscriptionClients(next);
    window.dispatchEvent(new CustomEvent("delphi-linked-writeback", { detail: { source: "subscriptions", linkedKey } }));
    return { ok: true, source: "subscriptions", message: "Subscription revision date updated." };
  }

  return { ok: false, message: `Unsupported linked key: ${linkedKey}` };
}
