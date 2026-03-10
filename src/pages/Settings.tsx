import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Monitor, Moon, Sun } from "lucide-react";
import { AnimatedTitle } from "@/components/AnimatedTitle";
import type { AppMode } from "@/types/app-mode";
import { clearActivityLog, getActivityLog, logActivity, type ActivityEntry } from "@/lib/activity-log";
import type { SidebarPosition } from "@/components/DashboardLayout";
import {
  applyThemePreference,
  getStoredThemePreference,
  resolveThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const TIMEZONE_KEY = "delphi_time_zone";
const TIME_FORMAT_KEY = "delphi_time_format";
const AUTH_SESSION_KEY = "delphi_auth_session";
const APP_MODE_KEY = "delphi_app_mode";
const SIDEBAR_POSITION_KEY = "delphi_sidebar_position";
const timeZoneOptions = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

const shortcutGuide = [
  { combo: "Cmd/Ctrl + 1", action: "Toggle Light/Dark Mode" },
  { combo: "Cmd/Ctrl + D", action: "Open Add Anything" },
  { combo: "Cmd/Ctrl + S", action: "Open Oracle Search" },
  { combo: "Cmd/Ctrl + N", action: "Create New Item (Page Context)" },
  { combo: "Cmd/Ctrl + Enter", action: "Submit / Enter Primary Action" },
  { combo: "Cmd/Ctrl + Z", action: "Undo Last Local Change" },
  { combo: "Cmd/Ctrl + Shift + Z", action: "Redo Last Local Change" },
  { combo: "Cmd/Ctrl + X", action: "Return to Intro Lobby" },
];

type AuthSession = {
  email: string;
  name: string;
  signedInAt: string;
};

export default function Settings() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => getStoredThemePreference());
  const [timeZone, setTimeZone] = useState(() => {
    const saved = localStorage.getItem(TIMEZONE_KEY);
    return saved || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  });
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">(() => {
    const saved = localStorage.getItem(TIME_FORMAT_KEY);
    if (saved === "12h" || saved === "24h") return saved;
    const hourCycle = Intl.DateTimeFormat().resolvedOptions().hourCycle;
    return hourCycle === "h23" || hourCycle === "h24" ? "24h" : "12h";
  });
  const [timePreview, setTimePreview] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [session, setSession] = useState<AuthSession | null>(() => {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.email || !parsed?.name || !parsed?.signedInAt) return null;
      return parsed as AuthSession;
    } catch {
      return null;
    }
  });
  const [workspaceMode, setWorkspaceMode] = useState<AppMode>(() => {
    const saved = localStorage.getItem(APP_MODE_KEY);
    if (saved === "personal" || saved === "business" || saved === "combined") {
      return saved;
    }
    return "combined";
  });
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() => {
    const saved = localStorage.getItem(SIDEBAR_POSITION_KEY);
    if (saved === "left" || saved === "right" || saved === "top-dock") return saved;
    return "left";
  });
  const [history, setHistory] = useState<ActivityEntry[]>(() => getActivityLog());
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyAreaFilter, setHistoryAreaFilter] = useState<"all" | ActivityEntry["area"]>("all");
  const [forcePushBusy, setForcePushBusy] = useState(false);
  const [forcePushStatus, setForcePushStatus] = useState("");

  useEffect(() => {
    applyThemePreference(themePreference);
  }, [themePreference]);

  useEffect(() => {
    localStorage.setItem(TIMEZONE_KEY, timeZone);
    window.dispatchEvent(new CustomEvent("delphi-timezone-change", { detail: timeZone }));
  }, [timeZone]);

  useEffect(() => {
    localStorage.setItem(TIME_FORMAT_KEY, timeFormat);
    window.dispatchEvent(new CustomEvent("delphi-timeformat-change", { detail: timeFormat }));
  }, [timeFormat]);

  useEffect(() => {
    const render = () => {
      setTimePreview(
        new Intl.DateTimeFormat("en-US", {
          timeZone,
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: timeFormat === "12h",
        }).format(new Date())
      );
    };
    render();
    const interval = window.setInterval(render, 30000);
    return () => window.clearInterval(interval);
  }, [timeZone, timeFormat]);

  useEffect(() => {
    if (session) {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
      window.dispatchEvent(new CustomEvent("delphi-auth-change", { detail: "signed-in" }));
    } else {
      localStorage.removeItem(AUTH_SESSION_KEY);
      window.dispatchEvent(new CustomEvent("delphi-auth-change", { detail: "signed-out" }));
    }
  }, [session]);

  useEffect(() => {
    localStorage.setItem(APP_MODE_KEY, workspaceMode);
    window.dispatchEvent(new CustomEvent("delphi-appmode-change", { detail: workspaceMode }));
  }, [workspaceMode]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_POSITION_KEY, sidebarPosition);
    window.dispatchEvent(new CustomEvent("delphi-sidebar-position-change", { detail: sidebarPosition }));
  }, [sidebarPosition]);

  useEffect(() => {
    const refresh = () => setHistory(getActivityLog());
    window.addEventListener("delphi-activity-change", refresh as EventListener);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("delphi-activity-change", refresh as EventListener);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const handleForcePushToSupabase = () => {
    if (forcePushBusy) return;
    setForcePushBusy(true);
    setForcePushStatus("Pushing local data to Supabase...");

    const timeoutId = window.setTimeout(() => {
      setForcePushBusy(false);
      setForcePushStatus("Push timed out. Keep Delphi open and try again.");
    }, 25000);

    const onResult = (event: Event) => {
      const custom = event as CustomEvent<{
        state?: "ok" | "error";
        message?: string;
        counts?: { myWork: number; calendar: number; sales: number; development: number; subscriptions: number };
      }>;
      window.clearTimeout(timeoutId);
      const detail = custom.detail || {};
      if (detail.state === "ok") {
        const counts = detail.counts;
        setForcePushStatus(
          counts
            ? `Push complete. Sales ${counts.sales}, Development ${counts.development}, Subscriptions ${counts.subscriptions}, My Work ${counts.myWork}, Calendar ${counts.calendar}.`
            : "Push complete."
        );
        logActivity({
          area: "settings",
          action: "Force Push",
          detail: "Local data pushed to Supabase",
        });
      } else {
        setForcePushStatus(`Push failed: ${detail.message || "Unknown sync error."}`);
      }
      setForcePushBusy(false);
      window.removeEventListener("delphi-force-supabase-sync", onResult as EventListener);
    };

    window.addEventListener("delphi-force-supabase-sync", onResult as EventListener, { once: true });
    window.dispatchEvent(new CustomEvent("delphi-force-sync-now"));
  };

  const historyRows = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    return history
      .filter((entry) => (historyAreaFilter === "all" ? true : entry.area === historyAreaFilter))
      .filter((entry) => {
        if (!query) return true;
        const haystack = [
          entry.action,
          entry.detail,
          entry.area,
          ...Object.entries(entry.meta || {}).map(([k, v]) => `${k}:${String(v ?? "")}`),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 120)
      .map((entry) => ({
        ...entry,
        stamp: new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(entry.at)),
      }));
  }, [history, historyAreaFilter, historyQuery]);

  const handleThemeChange = (next: ThemePreference) => {
    setThemePreference(next);
    logActivity({
      area: "settings",
      action: "Changed Theme",
      detail: next === "system" ? "System Mode" : next === "dark" ? "Dark Mode" : "Light Mode",
    });
  };

  const handleSignIn = () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      setAuthError("Enter a valid email.");
      return;
    }
    if (password.length < 4) {
      setAuthError("Password must be at least 4 characters.");
      return;
    }
    const localName = normalized.split("@")[0].replace(/[._-]+/g, " ").trim();
    const safeName = localName ? localName.charAt(0).toUpperCase() + localName.slice(1) : "Delphi User";
    setSession({
      email: normalized,
      name: safeName,
      signedInAt: new Date().toISOString(),
    });
    setPassword("");
    setAuthError("");
    logActivity({
      area: "settings",
      action: "Signed In",
      detail: normalized,
    });
  };

  const handleSignOut = () => {
    const detail = session?.email || "Local session";
    setSession(null);
    setPassword("");
    setAuthError("");
    logActivity({
      area: "settings",
      action: "Signed Out",
      detail,
    });
  };

  return (
    <div className="app-atmosphere-page app-light-page min-h-screen relative overflow-hidden">
      <div className="app-light-frame relative space-y-8">
        <div className="animate-fade-in-up">
          <AnimatedTitle text="Settings" className="app-light-title" />
          <p className="app-light-subtitle">Workspace controls and preferences.</p>
        </div>

        <Card className="p-6 bg-card/75 backdrop-blur-sm border-border animate-fade-in-up">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Delphi Workspace</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Switch between your combined flow, personal focus, or business focus.
              </p>
            </div>
            <Badge variant="secondary">{workspaceMode === "combined" ? "Both" : workspaceMode === "personal" ? "Personal" : "Business"}</Badge>
          </div>
          <div className="mt-4 flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
            <Button
              size="sm"
              variant={workspaceMode === "combined" ? "secondary" : "ghost"}
              onClick={() => {
                setWorkspaceMode("combined");
                logActivity({ area: "settings", action: "Switched Workspace", detail: "Both" });
              }}
              className="h-8 px-4"
            >
              Both
            </Button>
            <Button
              size="sm"
              variant={workspaceMode === "personal" ? "secondary" : "ghost"}
              onClick={() => {
                setWorkspaceMode("personal");
                logActivity({ area: "settings", action: "Switched Workspace", detail: "Personal" });
              }}
              className="h-8 px-4"
            >
              Personal
            </Button>
            <Button
              size="sm"
              variant={workspaceMode === "business" ? "secondary" : "ghost"}
              onClick={() => {
                setWorkspaceMode("business");
                logActivity({ area: "settings", action: "Switched Workspace", detail: "Business" });
              }}
              className="h-8 px-4"
            >
              Business
            </Button>
          </div>
        </Card>

        <Card className="p-6 bg-card/75 backdrop-blur-sm border-border animate-fade-in-up">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Sidebar Position</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Place navigation on the left, right, or reveal it as a top-edge dock.
              </p>
            </div>
            <Badge variant="secondary">
              {sidebarPosition === "left" ? "Left" : sidebarPosition === "right" ? "Right" : "Top Dock"}
            </Badge>
          </div>
          <div className="mt-4 flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
            <Button
              size="sm"
              variant={sidebarPosition === "left" ? "secondary" : "ghost"}
              onClick={() => {
                setSidebarPosition("left");
                logActivity({ area: "settings", action: "Sidebar Position", detail: "Left" });
              }}
              className="h-8 px-4"
            >
              Left
            </Button>
            <Button
              size="sm"
              variant={sidebarPosition === "right" ? "secondary" : "ghost"}
              onClick={() => {
                setSidebarPosition("right");
                logActivity({ area: "settings", action: "Sidebar Position", detail: "Right" });
              }}
              className="h-8 px-4"
            >
              Right
            </Button>
            <Button
              size="sm"
              variant={sidebarPosition === "top-dock" ? "secondary" : "ghost"}
              onClick={() => {
                setSidebarPosition("top-dock");
                logActivity({ area: "settings", action: "Sidebar Position", detail: "Top Dock" });
              }}
              className="h-8 px-4"
            >
              Top Dock
            </Button>
          </div>
        </Card>

        <Card className="p-6 bg-card/75 backdrop-blur-sm border-border animate-fade-in-up">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Education</h2>
              <p className="text-sm text-muted-foreground mt-1">Keyboard shortcuts for faster control.</p>
            </div>
            <Badge variant="secondary">{shortcutGuide.length} shortcuts</Badge>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {shortcutGuide.map((shortcut) => (
              <div
                key={shortcut.combo}
                className="rounded-xl border border-border/60 bg-card/60 px-4 py-3"
              >
                <p className="text-sm font-semibold text-foreground">{shortcut.action}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.08em] text-muted-foreground">{shortcut.combo}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 bg-card/75 backdrop-blur-sm border-border animate-fade-in-up">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Cloud Recovery Push</h2>
              <p className="text-sm text-muted-foreground mt-1">
                One-time migration: push all local Delphi data in this app to Supabase.
              </p>
            </div>
            <Button onClick={handleForcePushToSupabase} disabled={forcePushBusy}>
              {forcePushBusy ? "Pushing..." : "Force Push Local -> Supabase"}
            </Button>
          </div>
          {forcePushStatus ? <p className="mt-3 text-sm text-muted-foreground">{forcePushStatus}</p> : null}
        </Card>

        <Card className="p-6 bg-card/75 backdrop-blur-sm border-border animate-fade-in-up">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Backups</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Create a full Supabase backup into your local Delphi folder for exact restore later.
              </p>
            </div>
            <Badge variant="secondary">JSON + CSV</Badge>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-card/60 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Run This Command</p>
              <p className="mt-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2 font-mono text-xs text-foreground">
                npm run backup:supabase
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/60 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Backup Folder</p>
              <p className="mt-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2 font-mono text-xs text-foreground break-all">
                /Users/yardenhenn/Desktop/Delphi/delphi/backups/supabase
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Included Data</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                "sales_outreach",
                "sales_page_state",
                "development_projects",
                "subscription_clients",
                "my_work_tasks",
                "calendar_events",
              ].map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full border border-border/65 bg-background/55 px-2.5 py-1 text-[11px] font-medium text-foreground/85"
                >
                  {item}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Each run creates a timestamped folder with JSON for exact re-import, CSV for spreadsheet review, and a manifest with row counts and file sizes.
            </p>
          </div>
        </Card>

        <Card className="p-6 bg-card/75 backdrop-blur-sm border-border animate-fade-in-up">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Recent History</h2>
              <p className="text-sm text-muted-foreground mt-1">Full activity timeline across Delphi with exact date/time and action details.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{historyRows.length} shown</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearActivityLog();
                  setHistory([]);
                }}
              >
                Clear History
              </Button>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
            <Input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search actions, details, keys, pages..."
            />
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
              <Button size="sm" variant={historyAreaFilter === "all" ? "secondary" : "ghost"} onClick={() => setHistoryAreaFilter("all")} className="h-8 px-3">All</Button>
              <Button size="sm" variant={historyAreaFilter === "system" ? "secondary" : "ghost"} onClick={() => setHistoryAreaFilter("system")} className="h-8 px-3">System</Button>
              <Button size="sm" variant={historyAreaFilter === "sales" ? "secondary" : "ghost"} onClick={() => setHistoryAreaFilter("sales")} className="h-8 px-3">Sales</Button>
              <Button size="sm" variant={historyAreaFilter === "my-work" ? "secondary" : "ghost"} onClick={() => setHistoryAreaFilter("my-work")} className="h-8 px-3">My Work</Button>
              <Button size="sm" variant={historyAreaFilter === "settings" ? "secondary" : "ghost"} onClick={() => setHistoryAreaFilter("settings")} className="h-8 px-3">Settings</Button>
            </div>
          </div>

          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {historyRows.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-card/60 px-4 py-6 text-sm text-muted-foreground">
                No activity yet.
              </div>
            ) : (
              historyRows.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-border/60 bg-card/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{entry.action}</p>
                    <Badge variant="outline">{entry.stamp}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{entry.detail}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.08em] text-muted-foreground/80">{entry.area}</p>
                  {entry.meta ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(entry.meta).map(([key, value]) => (
                        <span
                          key={`${entry.id}-${key}`}
                          className="inline-flex items-center rounded-full border border-border/65 bg-background/55 px-2 py-0.5 text-[11px] text-foreground/85"
                        >
                          <span className="mr-1 uppercase tracking-[0.06em] text-muted-foreground">{key}</span>
                          <span>{String(value ?? "-")}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6 bg-card/75 backdrop-blur-sm border-border animate-fade-in-up">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Account Session</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Local sign-in for Delphi access on this device.
              </p>
            </div>
            {session ? (
              <Badge variant="secondary">Signed In</Badge>
            ) : (
              <Badge variant="outline">Signed Out</Badge>
            )}
          </div>

          {session ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-foreground">{session.name}</p>
                <p className="text-sm text-muted-foreground">{session.email}</p>
              </div>
              <Button variant="outline" onClick={handleSignOut}>
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
              />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
              <Button onClick={handleSignIn}>Sign In</Button>
              {authError ? <p className="text-sm text-destructive md:col-span-3">{authError}</p> : null}
            </div>
          )}
        </Card>

        <Card className="p-6 bg-card/75 backdrop-blur-sm border-border animate-fade-in-up">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Appearance</h2>
              <p className="text-sm text-muted-foreground mt-1">Switch between light, dark, or follow system mode.</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
              <Button size="sm" variant={themePreference === "light" ? "secondary" : "ghost"} onClick={() => handleThemeChange("light")} className="h-8 px-4">
                <Sun className="h-4 w-4" />
                Light
              </Button>
              <Button size="sm" variant={themePreference === "dark" ? "secondary" : "ghost"} onClick={() => handleThemeChange("dark")} className="h-8 px-4">
                <Moon className="h-4 w-4" />
                Dark
              </Button>
              <Button size="sm" variant={themePreference === "system" ? "secondary" : "ghost"} onClick={() => handleThemeChange("system")} className="h-8 px-4">
                <Monitor className="h-4 w-4" />
                System
              </Button>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Active now: {resolveThemePreference(themePreference) === "dark" ? "Dark" : "Light"}
          </p>
        </Card>

        <Card className="p-6 bg-card/75 backdrop-blur-sm border-border animate-fade-in-up">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Timezone</h2>
              <p className="text-sm text-muted-foreground mt-1">Use one timezone across your Delphi planning views.</p>
              <p className="mt-2 text-sm text-foreground/80">{timePreview}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={timeFormat}
                onChange={(event) => {
                  const next = event.target.value as "12h" | "24h";
                  setTimeFormat(next);
                  logActivity({
                    area: "settings",
                    action: "Changed Time Format",
                    detail: next === "12h" ? "12-hour" : "24-hour",
                  });
                }}
                className="h-10 min-w-[120px] rounded-xl border border-border/70 bg-card/70 px-3 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary/50"
              >
                <option value="12h">12-hour</option>
                <option value="24h">24-hour</option>
              </select>
              <select
                value={timeZone}
                onChange={(event) => {
                  const next = event.target.value;
                  setTimeZone(next);
                  logActivity({
                    area: "settings",
                    action: "Changed Timezone",
                    detail: next,
                  });
                }}
                className="h-10 min-w-[250px] rounded-xl border border-border/70 bg-card/70 px-3 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary/50"
              >
                {timeZoneOptions.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
