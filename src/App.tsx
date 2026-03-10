import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { EntryLobby } from "./components/EntryLobby";
import { LoginGate } from "./components/LoginGate";
import { DashboardLayout } from "./components/DashboardLayout";
import type { AppMode } from "./types/app-mode";
import MyWork from "./pages/MyWork";
import Development from "./pages/Development";
import Subscriptions from "./pages/Subscriptions";
import Sales from "./pages/Sales";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import { isSupabaseConfigured } from "./lib/supabase";
import { applyStoredThemePreference, getStoredThemePreference, resolveThemePreference, type ThemePreference } from "./lib/theme";
import { replaceMyWorkTasks } from "./lib/supabase-my-work";
import { replaceCalendarEvents } from "./lib/supabase-calendar-events";
import { replaceSalesOutreach } from "./lib/supabase-sales-outreach";
import { replaceSalesPageState } from "./lib/supabase-sales-page-state";
import { replaceDevelopmentProjects } from "./lib/supabase-development-projects";
import { replaceSubscriptionClients } from "./lib/supabase-subscriptions-clients";
import { runLinkedScheduleSync } from "./lib/linked-schedule-engine";
import { logActivity } from "./lib/activity-log";

const queryClient = new QueryClient();
const EXIT_DRAFT_KEY = "delphi_exit_draft_v1";
const AUTH_REMEMBER_KEY = "delphi_auth_remember_v1";
const AUTH_SESSION_KEY = "delphi_auth_session_v1";
const DATA_RESET_VERSION_KEY = "delphi_data_reset_version";
const DATA_RESET_VERSION = "2026-03-03-clear-seed-data-v1";
const SCHEDULE_RESET_VERSION_KEY = "delphi_schedule_reset_version";
const SCHEDULE_RESET_VERSION = "2026-03-09-clear-schedule-v1";
const FORCE_SYNC_THROTTLE_MS = 12_000;
const FORCE_SYNC_INTERVAL_MS = 20_000;
const UNDO_HISTORY_LIMIT = 120;

type LocalStorageHistoryEntry = {
  key: string;
  prevRaw: string | null;
  nextRaw: string | null;
  at: number;
};

type LocalStorageWriteDetail = {
  key: string;
  prevRaw: string | null;
  nextRaw: string;
};

const summarizeJsonShape = (raw: string | null) => {
  if (!raw) return "empty";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return `list:${parsed.length}`;
    if (parsed && typeof parsed === "object") return `object:${Object.keys(parsed).length}`;
    return typeof parsed;
  } catch {
    return "text";
  }
};

const readLocalArray = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

const readLocalRecord = <T,>(key: string): Record<string, T> => {
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

const isElementVisible = (element: HTMLElement | null) => {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
};

const clickPrimaryActionInContainer = (container: HTMLElement) => {
  const directPrimary = container.querySelector<HTMLElement>("[data-primary-action='true']");
  if (directPrimary && !directPrimary.hasAttribute("disabled")) {
    directPrimary.click();
    return true;
  }

  const submit = container.querySelector<HTMLButtonElement>("button[type='submit']:not([disabled])");
  if (submit && isElementVisible(submit)) {
    submit.click();
    return true;
  }

  const actionRegex = /^(save|create|update|submit|launch|enter|next)\b/i;
  const candidates = Array.from(container.querySelectorAll<HTMLButtonElement>("button:not([disabled])")).filter((button) =>
    isElementVisible(button)
  );
  for (const candidate of candidates) {
    const label = (candidate.textContent || "").trim();
    if (actionRegex.test(label)) {
      candidate.click();
      return true;
    }
  }

  return false;
};

const triggerCommandEnterAction = () => {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const activeForm = active?.closest("form");
  if (activeForm instanceof HTMLFormElement) {
    activeForm.requestSubmit();
    return true;
  }

  const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog']")).filter((dialog) => isElementVisible(dialog));
  const topDialog = dialogs[dialogs.length - 1];
  if (topDialog && clickPrimaryActionInContainer(topDialog)) return true;

  const fallbackMain = document.querySelector<HTMLElement>("main");
  if (fallbackMain && clickPrimaryActionInContainer(fallbackMain)) return true;

  return false;
};

const App = () => {
  const [authenticated, setAuthenticated] = useState(() => {
    return localStorage.getItem(AUTH_REMEMBER_KEY) === "1" || sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
  });
  const [entered, setEntered] = useState(false);
  const lastHapticAtRef = useRef(0);
  const lastForceSyncAtRef = useRef(0);
  const scrollActiveTimersRef = useRef<Map<HTMLElement, number>>(new Map());
  const [appMode, setAppMode] = useState<AppMode>(() => {
    const saved = localStorage.getItem("delphi_app_mode");
    if (saved === "personal" || saved === "business" || saved === "combined") {
      return saved;
    }
    return "combined";
  });
  const undoHistoryRef = useRef<LocalStorageHistoryEntry[]>([]);
  const redoHistoryRef = useRef<LocalStorageHistoryEntry[]>([]);

  const shouldTrackUndoKey = (key: string) => {
    if (!key) return false;
    if (key.includes("_draft_")) return false;
    if (key === "delphi_sync_health_v1") return false;
    if (key === "delphi_linked_sync_override_v1") return false;
    if (key === "delphi_auth_session_v1" || key === "delphi_auth_remember_v1") return false;
    return key.startsWith("delphi_") || key === "pm_state_v1";
  };

  const applyHistoryEntry = (entry: LocalStorageHistoryEntry, direction: "undo" | "redo") => {
    const rawToApply = direction === "undo" ? entry.prevRaw : entry.nextRaw;
    try {
      if (rawToApply === null) {
        localStorage.removeItem(entry.key);
      } else {
        localStorage.setItem(entry.key, rawToApply);
      }
      window.dispatchEvent(
        new CustomEvent("delphi-localstorage-apply", {
          detail: { key: entry.key, raw: rawToApply },
        })
      );
      window.dispatchEvent(new Event("delphi-linked-sync-refresh"));
    } catch {
      // Ignore apply failures; history entry remains consumed to avoid loops.
    }
  };

  const saveExitDraft = (reason: "shortcut" | "tab-close") => {
    try {
      localStorage.setItem(
        EXIT_DRAFT_KEY,
        JSON.stringify({
          reason,
          at: new Date().toISOString(),
          path: window.location.pathname,
          appMode,
        })
      );
    } catch {
      // Ignore draft snapshot failures
    }
  };

  useEffect(() => {
    localStorage.setItem("delphi_app_mode", appMode);
  }, [appMode]);

  useEffect(() => {
    if (localStorage.getItem(DATA_RESET_VERSION_KEY) === DATA_RESET_VERSION) return;
    // Historical seed-data reset is retired. Never auto-delete local or Supabase records on boot.
    localStorage.setItem(DATA_RESET_VERSION_KEY, DATA_RESET_VERSION);
  }, []);

  useEffect(() => {
    if (localStorage.getItem(SCHEDULE_RESET_VERSION_KEY) === SCHEDULE_RESET_VERSION) return;
    // Historical schedule reset is retired. Never auto-clear scheduling fields on boot.
    localStorage.setItem(SCHEDULE_RESET_VERSION_KEY, SCHEDULE_RESET_VERSION);
  }, []);

  useEffect(() => {
    const onAppModeChange = (event: Event) => {
      const detail = (event as CustomEvent<AppMode>).detail;
      if (detail === "combined" || detail === "personal" || detail === "business") {
        setAppMode(detail);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "delphi_app_mode") return;
      const value = event.newValue;
      if (value === "combined" || value === "personal" || value === "business") {
        setAppMode(value);
      }
    };
    window.addEventListener("delphi-appmode-change", onAppModeChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("delphi-appmode-change", onAppModeChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const canVibrate =
      typeof navigator !== "undefined" &&
      "vibrate" in navigator &&
      typeof navigator.vibrate === "function";
    if (!canVibrate) return;

    const shouldHaptic = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(
        target.closest(
          "button, a, [role='button'], [data-haptic='true'], input[type='checkbox'], [data-radix-collection-item]"
        )
      );
    };

    const pulse = (duration: number) => {
      const now = Date.now();
      if (now - lastHapticAtRef.current < 35) return;
      lastHapticAtRef.current = now;
      navigator.vibrate(duration);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!shouldHaptic(event.target)) return;
      pulse(9);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!shouldHaptic(event.target)) return;
      pulse(7);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  useEffect(() => {
    const onLocalStorageWrite = (event: Event) => {
      const detail = (event as CustomEvent<LocalStorageWriteDetail>).detail;
      if (!detail || !shouldTrackUndoKey(detail.key)) return;
      if (detail.prevRaw === detail.nextRaw) return;

      if (detail.key !== "delphi_activity_log_v1") {
        const prevShape = summarizeJsonShape(detail.prevRaw);
        const nextShape = summarizeJsonShape(detail.nextRaw);
        const keyLabel = detail.key
          .replace(/^delphi_/, "")
          .replace(/^pm_state_v1$/, "development_state")
          .replace(/_/g, " ");
        logActivity({
          area: "system",
          action: "Data Updated",
          detail: `${keyLabel}`,
          meta: {
            key: detail.key,
            before: prevShape,
            after: nextShape,
            path: window.location.pathname,
          },
        });
      }

      undoHistoryRef.current.push({
        key: detail.key,
        prevRaw: detail.prevRaw,
        nextRaw: detail.nextRaw,
        at: Date.now(),
      });
      if (undoHistoryRef.current.length > UNDO_HISTORY_LIMIT) {
        undoHistoryRef.current = undoHistoryRef.current.slice(-UNDO_HISTORY_LIMIT);
      }
      redoHistoryRef.current = [];
    };

    window.addEventListener("delphi-localstorage-write", onLocalStorageWrite as EventListener);
    return () => window.removeEventListener("delphi-localstorage-write", onLocalStorageWrite as EventListener);
  }, []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const isCommandEnter =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key === "Enter";
      if (isCommandEnter) {
        event.preventDefault();
        triggerCommandEnterAction();
        window.dispatchEvent(new CustomEvent("delphi-command-enter"));
        return;
      }

      const target = event.target;
      const isTypingContext =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      const isThemeToggleShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        (event.code === "Digit1" || event.key === "1");
      if (isThemeToggleShortcut) {
        event.preventDefault();
        const currentPreference = getStoredThemePreference();
        const currentResolved = resolveThemePreference(currentPreference);
        const nextPreference: ThemePreference = currentResolved === "dark" ? "light" : "dark";
        localStorage.setItem("theme", nextPreference);
        applyStoredThemePreference();
        window.dispatchEvent(new CustomEvent("delphi-theme-change"));
        logActivity({
          area: "settings",
          action: "Changed Theme",
          detail: nextPreference === "dark" ? "Dark Mode" : "Light Mode",
          meta: { via: "shortcut", path: window.location.pathname },
        });
        return;
      }

      const isUndoShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z";
      if (isUndoShortcut && !isTypingContext) {
        const entry = undoHistoryRef.current.pop();
        if (!entry) return;
        event.preventDefault();
        redoHistoryRef.current.push(entry);
        applyHistoryEntry(entry, "undo");
        logActivity({
          area: "system",
          action: "Undo",
          detail: entry.key,
          meta: { key: entry.key, path: window.location.pathname },
        });
        return;
      }

      const isRedoShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && event.shiftKey && event.key.toLowerCase() === "z";
      if (isRedoShortcut && !isTypingContext) {
        const entry = redoHistoryRef.current.pop();
        if (!entry) return;
        event.preventDefault();
        undoHistoryRef.current.push(entry);
        applyHistoryEntry(entry, "redo");
        logActivity({
          area: "system",
          action: "Redo",
          detail: entry.key,
          meta: { key: entry.key, path: window.location.pathname },
        });
        return;
      }

      if (isTypingContext) return;

      const isContextCreateShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "n";
      if (isContextCreateShortcut) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("delphi-command-new"));
        return;
      }

      const isReturnToLobbyShortcut =
        (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "x";
      if (!isReturnToLobbyShortcut) return;
      event.preventDefault();
      saveExitDraft("shortcut");
      setEntered(false);
    };

    document.addEventListener("keydown", onShortcut, true);
    return () => document.removeEventListener("keydown", onShortcut, true);
  }, [appMode]);

  useEffect(() => {
    const clearActive = (element: HTMLElement) => {
      element.classList.remove("scroll-active");
      const existing = scrollActiveTimersRef.current.get(element);
      if (existing !== undefined) {
        window.clearTimeout(existing);
        scrollActiveTimersRef.current.delete(element);
      }
    };

    const markActive = (element: HTMLElement) => {
      element.classList.add("scroll-active");
      const existing = scrollActiveTimersRef.current.get(element);
      if (existing !== undefined) window.clearTimeout(existing);
      const timeoutId = window.setTimeout(() => clearActive(element), 1400);
      scrollActiveTimersRef.current.set(element, timeoutId);
    };

    const onScrollCapture = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const container = target.classList.contains("glass-scrollbar")
        ? target
        : target.closest<HTMLElement>(".glass-scrollbar");
      if (!container) return;
      markActive(container);
    };

    const onWheelCapture = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const container = target.classList.contains("glass-scrollbar")
        ? target
        : target.closest<HTMLElement>(".glass-scrollbar");
      if (!container) return;
      markActive(container);
    };

    document.addEventListener("scroll", onScrollCapture, true);
    document.addEventListener("wheel", onWheelCapture, { capture: true, passive: true });
    document.addEventListener("touchmove", onWheelCapture, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScrollCapture, true);
      document.removeEventListener("wheel", onWheelCapture, true);
      document.removeEventListener("touchmove", onWheelCapture, true);
      scrollActiveTimersRef.current.forEach((timeoutId, element) => {
        window.clearTimeout(timeoutId);
        element.classList.remove("scroll-active");
      });
      scrollActiveTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      saveExitDraft("tab-close");
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [appMode]);

  useEffect(() => {
    const onGlobalLogout = () => {
      localStorage.removeItem(AUTH_REMEMBER_KEY);
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      setEntered(false);
      setAuthenticated(false);
    };
    window.addEventListener("delphi-global-logout", onGlobalLogout as EventListener);
    return () => window.removeEventListener("delphi-global-logout", onGlobalLogout as EventListener);
  }, []);

  useEffect(() => {
    applyStoredThemePreference();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (getStoredThemePreference() !== "system") return;
      applyStoredThemePreference();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "theme") return;
      applyStoredThemePreference();
    };
    const onThemeChange = () => {
      applyStoredThemePreference();
    };

    media.addEventListener("change", onMediaChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("delphi-theme-change", onThemeChange as EventListener);
    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("delphi-theme-change", onThemeChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    if (!entered) {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
      return;
    }

    document.documentElement.style.colorScheme = "";
    applyStoredThemePreference();
  }, [authenticated, entered]);

  useEffect(() => {
    if (!authenticated || !entered || !isSupabaseConfigured) return;

    let running = false;
    const flushAllToSupabase = async (reason: "initial" | "focus" | "visible" | "manual" | "interval") => {
      const now = Date.now();
      if (running) return;
      if (reason !== "manual" && now - lastForceSyncAtRef.current < FORCE_SYNC_THROTTLE_MS) return;
      running = true;
      lastForceSyncAtRef.current = now;
      try {
        await runLinkedScheduleSync().catch(() => undefined);
        const myWork = readLocalArray("delphi_my_work_tasks_v3");
        const calendar = readLocalArray("delphi_calendar_events_v2");
        const sales = readLocalArray("delphi_sales_outreach_v2");
        const salesPageState = {
          starred_prospect_ids: readLocalArray<number>("delphi_sales_starred_prospect_ids_v1"),
          strategy_items: readLocalArray("delphi_sales_strategy_items_v1"),
          sales_tasks: readLocalArray("delphi_sales_tasks_v1"),
          limbo_items: readLocalArray("delphi_sales_limbo_v1"),
          instantly_lists: readLocalArray<string>("delphi_sales_instantly_lists_v1"),
          campaign_options: readLocalArray<string>("delphi_sales_campaign_options_v1"),
          group_options: readLocalArray<string>("delphi_sales_group_options_v1"),
          role_options: readLocalArray<string>("delphi_sales_role_options_v1"),
          industry_options: readLocalArray<string>("delphi_sales_industry_options_v1"),
          development_workflow_map: readLocalRecord("delphi_development_project_workflows_v2"),
          meeting_notes_store: readLocalRecord("delphi_meeting_notes_v1"),
          admin_review_pins: readLocalArray("delphi_admin_review_pins_v1"),
        };
        const development = readLocalArray("delphi_development_projects_v2");
        const subscriptions = readLocalArray("delphi_subscriptions_clients_v2");

        const results = await Promise.allSettled([
          replaceMyWorkTasks(myWork as Parameters<typeof replaceMyWorkTasks>[0]),
          replaceCalendarEvents(calendar as Parameters<typeof replaceCalendarEvents>[0]),
          replaceSalesOutreach(sales as Parameters<typeof replaceSalesOutreach>[0]),
          replaceSalesPageState(salesPageState),
          replaceDevelopmentProjects(development as Parameters<typeof replaceDevelopmentProjects>[0]),
          replaceSubscriptionClients(subscriptions as Parameters<typeof replaceSubscriptionClients>[0]),
        ]);

        const failures = results
          .map((result, index) => ({ result, index }))
          .filter((entry): entry is { result: PromiseRejectedResult; index: number } => entry.result.status === "rejected")
          .map((entry) => {
            const tableName =
              entry.index === 0
                ? "my_work_tasks"
                : entry.index === 1
                  ? "calendar_events"
                  : entry.index === 2
                  ? "sales_outreach"
                    : entry.index === 3
                      ? "sales_page_state"
                      : entry.index === 4
                      ? "development_projects"
                      : "subscription_clients";
            return `${tableName}: ${String(entry.result.reason)}`;
          });

        if (failures.length > 0) {
          window.dispatchEvent(
            new CustomEvent("delphi-force-supabase-sync", {
              detail: {
                state: "error",
                reason,
                at: new Date().toISOString(),
                message: failures.join(" | "),
              },
            })
          );
          return;
        }

        window.dispatchEvent(
          new CustomEvent("delphi-force-supabase-sync", {
            detail: {
              state: "ok",
              reason,
              at: new Date().toISOString(),
              counts: {
                myWork: myWork.length,
                calendar: calendar.length,
                sales: sales.length,
                salesState: Object.keys(salesPageState).length,
                development: development.length,
                subscriptions: subscriptions.length,
              },
            },
          })
        );
      } catch (error) {
        window.dispatchEvent(
          new CustomEvent("delphi-force-supabase-sync", {
            detail: { state: "error", reason, at: new Date().toISOString(), message: String(error) },
          })
        );
      } finally {
        running = false;
      }
    };

    const onFocus = () => void flushAllToSupabase("focus");
    const onVisibility = () => {
      if (document.visibilityState === "visible") void flushAllToSupabase("visible");
    };
    const onManualSync = () => void flushAllToSupabase("manual");
    const intervalId = window.setInterval(() => {
      void flushAllToSupabase("interval");
    }, FORCE_SYNC_INTERVAL_MS);

    void flushAllToSupabase("initial");
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("delphi-force-sync-now", onManualSync as EventListener);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("delphi-force-sync-now", onManualSync as EventListener);
      window.clearInterval(intervalId);
    };
  }, [authenticated, entered]);

  if (!authenticated) {
    return (
      <LoginGate
        onLogin={(remember) => {
          setAuthenticated(true);
          sessionStorage.setItem(AUTH_SESSION_KEY, "1");
          if (remember) {
            localStorage.setItem(AUTH_REMEMBER_KEY, "1");
          } else {
            localStorage.removeItem(AUTH_REMEMBER_KEY);
          }
        }}
      />
    );
  }

  if (!entered) {
    return (
      <EntryLobby
        onEnter={(mode) => {
          setAppMode(mode);
          window.history.replaceState({}, "", "/my-work?tab=command");
          setEntered(true);
        }}
      />
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<DashboardLayout appMode={appMode} setAppMode={setAppMode} />}>
              <Route path="/" element={<Navigate to="/my-work" replace />} />
              <Route path="/my-work" element={<MyWork />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/development" element={<Development />} />
              <Route path="/subscriptions" element={<Subscriptions />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/calendar" element={<Navigate to="/my-work?tab=calendar" replace />} />
              <Route path="/settings" element={<Navigate to="/admin?tab=settings" replace />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
