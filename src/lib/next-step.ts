export function promptForNextStep(completedLabel: string) {
  if (typeof window === "undefined") return null;
  const response = window.prompt(`"${completedLabel}" marked done.\n\nWhat's next? Leave blank if nothing.`, "");
  const next = (response || "").trim();
  return next.length ? next : null;
}
