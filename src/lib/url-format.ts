export const sanitizeWebsiteInput = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
};

