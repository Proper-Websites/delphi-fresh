type LinkedCleanupCandidate = {
  title?: string | null;
  department?: string | null;
  badgeLabel?: string | null;
  linkedSource?: string | null;
  linkedKey?: string | null;
  sourceLayer?: string | null;
  date?: string | null;
};

const DEVELOPMENT_AUTO_TITLE_REGEX = /^(kickoff|deadline|task):/i;
const DEVELOPMENT_BADGE_REGEX = /^(kickoff|deadline|task)$/i;
const SALES_AUTO_TITLE_REGEX = /^next task:/i;
const SUBSCRIPTION_AUTO_TITLE_REGEX = /^(billing|revision):/i;
const SUBSCRIPTION_BADGE_REGEX = /^(billing|revision|task)$/i;

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const hasDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

export const isStaleDevelopmentAutoTask = (value: LinkedCleanupCandidate) => {
  const linkedSource = normalize(value.linkedSource);
  const linkedKey = normalize(value.linkedKey);
  const department = normalize(value.department);
  const badgeLabel = normalize(value.badgeLabel);
  const title = String(value.title || "").trim();

  if (linkedSource === "development" || linkedKey.startsWith("development:")) return true;
  if (department !== "development") return false;
  return DEVELOPMENT_AUTO_TITLE_REGEX.test(title) || DEVELOPMENT_BADGE_REGEX.test(badgeLabel);
};

export const isStaleDevelopmentAutoEvent = (value: LinkedCleanupCandidate) => {
  const linkedSource = normalize(value.linkedSource);
  const linkedKey = normalize(value.linkedKey);
  const sourceLayer = normalize(value.sourceLayer);
  const title = String(value.title || "").trim();

  if (linkedSource === "development" || linkedKey.startsWith("development:")) return true;
  if (sourceLayer !== "my-work-mirror") return false;
  return DEVELOPMENT_AUTO_TITLE_REGEX.test(title);
};

export const isStaleSalesAutoTask = (value: LinkedCleanupCandidate) => {
  const linkedSource = normalize(value.linkedSource);
  const linkedKey = normalize(value.linkedKey);
  const department = normalize(value.department);
  const title = String(value.title || "").trim();
  const dated = hasDate(value.date);

  if (dated) return false;
  if (department !== "sales" && linkedSource !== "sales" && !linkedKey.startsWith("sales:")) return false;
  return SALES_AUTO_TITLE_REGEX.test(title);
};

export const isStaleSalesAutoEvent = (value: LinkedCleanupCandidate) => {
  const linkedSource = normalize(value.linkedSource);
  const linkedKey = normalize(value.linkedKey);
  const sourceLayer = normalize(value.sourceLayer);
  const title = String(value.title || "").trim();
  const dated = hasDate(value.date);

  if (dated) return false;
  if (sourceLayer !== "my-work-mirror" && linkedSource !== "sales" && !linkedKey.startsWith("sales:")) return false;
  return SALES_AUTO_TITLE_REGEX.test(title);
};

export const isStaleSubscriptionAutoTask = (value: LinkedCleanupCandidate) => {
  const linkedSource = normalize(value.linkedSource);
  const linkedKey = normalize(value.linkedKey);
  const department = normalize(value.department);
  const badgeLabel = normalize(value.badgeLabel);
  const title = String(value.title || "").trim();
  const dated = hasDate(value.date);

  if (dated) return false;
  if (linkedSource === "subscriptions" || linkedKey.startsWith("subscriptions:")) return true;
  if (department !== "subscriptions") return false;
  return SUBSCRIPTION_AUTO_TITLE_REGEX.test(title) || SUBSCRIPTION_BADGE_REGEX.test(badgeLabel);
};

export const isStaleSubscriptionAutoEvent = (value: LinkedCleanupCandidate) => {
  const linkedSource = normalize(value.linkedSource);
  const linkedKey = normalize(value.linkedKey);
  const sourceLayer = normalize(value.sourceLayer);
  const title = String(value.title || "").trim();
  const dated = hasDate(value.date);

  if (dated) return false;
  if (linkedSource === "subscriptions" || linkedKey.startsWith("subscriptions:")) return true;
  if (sourceLayer !== "my-work-mirror") return false;
  return SUBSCRIPTION_AUTO_TITLE_REGEX.test(title);
};
