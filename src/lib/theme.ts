export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

export const getStoredThemePreference = (): ThemePreference => {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemePreference(saved)) return saved;
  if (saved === "light" || saved === "dark") return saved;
  return "system";
};

export const getSystemResolvedTheme = (): ResolvedTheme => {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const resolveThemePreference = (preference: ThemePreference): ResolvedTheme =>
  preference === "system" ? getSystemResolvedTheme() : preference;

export const applyThemePreference = (preference: ThemePreference) => {
  if (typeof window === "undefined") return;
  const resolved = resolveThemePreference(preference);
  localStorage.setItem(THEME_STORAGE_KEY, preference);
  document.documentElement.classList.toggle("dark", resolved === "dark");
};

export const applyStoredThemePreference = () => {
  const preference = getStoredThemePreference();
  applyThemePreference(preference);
  return preference;
};

export const toggleLightDarkTheme = () => {
  const nextTheme: ThemePreference = document.documentElement.classList.contains("dark") ? "light" : "dark";
  applyThemePreference(nextTheme);
  return nextTheme;
};
