export const parseMoney = (value: string | number | null | undefined): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const raw = String(value ?? "");
  const normalized = raw.replace(/[^0-9.-]+/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatMoney = (value: string | number | null | undefined): string => {
  const parsed = parseMoney(value);
  return `$${parsed.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

export const normalizeMoneyInput = (value: string): string => {
  if (!/\d/.test(value)) return "";
  return formatMoney(value);
};
