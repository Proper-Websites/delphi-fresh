export const ACTIVITY_LOG_KEY = "delphi_activity_log_v1";

export type ActivityEntry = {
  id: string;
  at: string;
  area:
    | "my-work"
    | "sales"
    | "settings"
    | "development"
    | "subscriptions"
    | "calendar"
    | "admin"
    | "admin-review"
    | "system";
  action: string;
  detail: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

const MAX_ACTIVITY_ITEMS = 1200;

export function getActivityLog(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ActivityEntry[]) : [];
  } catch {
    return [];
  }
}

export function logActivity(entry: Omit<ActivityEntry, "id" | "at">) {
  const current = getActivityLog();
  const nextEntry: ActivityEntry = {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    area: entry.area,
    action: entry.action,
    detail: entry.detail,
  };
  const next = [nextEntry, ...current].slice(0, MAX_ACTIVITY_ITEMS);
  localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("delphi-activity-change"));
}

export function clearActivityLog() {
  localStorage.removeItem(ACTIVITY_LOG_KEY);
  window.dispatchEvent(new CustomEvent("delphi-activity-change"));
}
