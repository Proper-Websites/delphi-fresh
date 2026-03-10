const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDateString = (value: string) => ISO_DATE_PATTERN.test(value);

export const formatDateWritten = (value: string) => {
  if (!value || !isIsoDateString(value)) return value;

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!year || !month || !day) return value;

  const safeDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(safeDate);
};
