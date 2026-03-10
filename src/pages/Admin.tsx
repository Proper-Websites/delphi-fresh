import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatedTitle } from "@/components/AnimatedTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/StatCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  CheckCircle,
  Copy,
  DollarSign,
  FileText,
  Globe,
  LayoutDashboard,
  Layers,
  ListChecks,
  ListTodo,
  Mail,
  Monitor,
  MessageSquare,
  Moon,
  PenSquare,
  Plus,
  Settings as SettingsIcon,
  Shield,
  SlidersHorizontal,
  Sun,
  Target,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { AppMode } from "@/types/app-mode";
import type { SidebarPosition } from "@/components/DashboardLayout";
import { clearActivityLog, getActivityLog, logActivity, type ActivityEntry } from "@/lib/activity-log";
import { formatDateWritten } from "@/lib/date-format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getSupabaseErrorMessage } from "@/lib/supabase-errors";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { replaceMyWorkTasks } from "@/lib/supabase-my-work";
import { replaceSalesOutreach } from "@/lib/supabase-sales-outreach";
import { fetchSalesPageState, replaceSalesPageState } from "@/lib/supabase-sales-page-state";
import { replaceSubscriptionClients } from "@/lib/supabase-subscriptions-clients";
import { replaceDevelopmentProjects } from "@/lib/supabase-development-projects";
import {
  mergeImportedData,
  parseClickUpCsv,
  type ClickUpImportBundle,
  type ImportMode,
} from "@/lib/clickup-import";
import {
  applyThemePreference,
  getStoredThemePreference,
  resolveThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { previewLinkedSyncReview, runLinkedScheduleSync, type LinkedSyncReport } from "@/lib/linked-schedule-engine";

type AdminView =
  | "dashboard"
  | "finances"
  | "web"
  | "roadmap"
  | "tools"
  | "shortlist"
  | "goals"
  | "review"
  | "tasks"
  | "variables"
  | "settings";

type AuthSession = {
  email: string;
  name: string;
  signedInAt: string;
};

type RoadmapTask = {
  id: string;
  title: string;
  dept: string;
  priority: "high" | "medium" | "low";
  status: "complete" | "in-progress" | "not-started";
  date?: string;
};

type FlowBranch = { label: string; next?: number };
type FlowNode = {
  id: number;
  name: string;
  icon: "users" | "mail" | "calendar" | "file" | "check" | "money";
  branches: FlowBranch[];
};

type ReviewStatus = "todo" | "in_progress" | "approved";
type ReviewPin = {
  id: string;
  x: number;
  y: number;
  text: string;
  assignee: string;
  status: ReviewStatus;
  resolved: boolean;
  createdAt: string;
};

type SyncTableHealth = {
  table: string;
  label: string;
  ok: boolean;
  message: string;
};

const TIMEZONE_KEY = "delphi_time_zone";
const TIME_FORMAT_KEY = "delphi_time_format";
const AUTH_SESSION_KEY = "delphi_auth_session";
const AUTH_GATE_REMEMBER_KEY = "delphi_auth_remember_v1";
const AUTH_GATE_SESSION_KEY = "delphi_auth_session_v1";
const APP_MODE_KEY = "delphi_app_mode";
const SIDEBAR_POSITION_KEY = "delphi_sidebar_position";
const REVIEW_PINS_KEY = "delphi_admin_review_pins_v1";
const MY_WORK_KEY = "delphi_my_work_tasks_v3";
const SALES_KEY = "delphi_sales_outreach_v2";
const DEVELOPMENT_KEY = "delphi_development_projects_v2";
const SUBSCRIPTIONS_KEY = "delphi_subscriptions_clients_v2";

const SYNC_TABLES = [
  { key: "my_work_tasks", label: "My Work" },
  { key: "calendar_events", label: "Calendar" },
  { key: "sales_outreach", label: "Sales" },
  { key: "sales_page_state", label: "Shared State" },
  { key: "development_projects", label: "Development" },
  { key: "subscription_clients", label: "Subscriptions" },
] as const;

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

const recurringExpenseRows = [
  { name: "AWS", category: "Infrastructure", amount: "$450", frequency: "Monthly", nextBilling: "2026-12-01", status: "Active" },
  { name: "Figma", category: "Design", amount: "$45", frequency: "Monthly", nextBilling: "2026-12-03", status: "Active" },
  { name: "GitHub", category: "Development", amount: "$210", frequency: "Monthly", nextBilling: "2026-12-08", status: "Active" },
  { name: "Adobe", category: "Design", amount: "$79", frequency: "Monthly", nextBilling: "2026-12-11", status: "Active" },
  { name: "Notion", category: "Productivity", amount: "$15", frequency: "Monthly", nextBilling: "2026-12-15", status: "Active" },
];

const oneTimeExpenseRows = [
  { name: "MacBook Pro", category: "Hardware", amount: "$2,499", vendor: "Apple", date: "2026-11-09" },
  { name: "Domain Renewal Bundle", category: "Domains", amount: "$150", vendor: "Namecheap", date: "2026-11-03" },
  { name: "Stock Photos", category: "Assets", amount: "$199", vendor: "Envato", date: "2026-10-30" },
  { name: "SSL Certificate", category: "Security", amount: "$89", vendor: "Cloudflare", date: "2026-10-22" },
  { name: "Conference Ticket", category: "Education", amount: "$599", vendor: "Web Summit", date: "2026-10-18" },
];

const expenseBreakdownRows = [
  { category: "Infrastructure", percent: 58 },
  { category: "Development", percent: 27 },
  { category: "Design Tools", percent: 16 },
  { category: "Productivity", percent: 2 },
];

const roadmapTaskSections: Array<{ section: "Next" | "Later" | "No Date"; tasks: RoadmapTask[] }> = [
  {
    section: "Next",
    tasks: [
      { id: "road-1", title: "Redesign Homepage", dept: "Development", priority: "high", status: "in-progress", date: "2026-11-15" },
      { id: "road-2", title: "Client Presentation", dept: "Sales", priority: "medium", status: "not-started", date: "2026-11-18" },
      { id: "road-3", title: "API Integration", dept: "Development", priority: "high", status: "in-progress", date: "2026-11-20" },
    ],
  },
  {
    section: "Later",
    tasks: [
      { id: "road-4", title: "Marketing Campaign", dept: "Marketing", priority: "low", status: "not-started", date: "2026-12-01" },
      { id: "road-5", title: "Database Migration", dept: "Development", priority: "medium", status: "not-started", date: "2026-12-05" },
      { id: "road-6", title: "Team Workshop", dept: "HR", priority: "low", status: "not-started", date: "2026-12-10" },
    ],
  },
  {
    section: "No Date",
    tasks: [
      { id: "road-7", title: "Documentation Update", dept: "Development", priority: "low", status: "not-started" },
      { id: "road-8", title: "Brand Guidelines", dept: "Marketing", priority: "medium", status: "not-started" },
      { id: "road-9", title: "Security Audit", dept: "Development", priority: "high", status: "not-started" },
    ],
  },
];

const flowNodes: FlowNode[] = [
  { id: 1, name: "Prospect", icon: "users", branches: [{ label: "Cold Outreach", next: 2 }, { label: "Referral", next: 3 }, { label: "Inbound Lead", next: 3 }] },
  { id: 2, name: "Follow-up", icon: "mail", branches: [{ label: "Interested", next: 3 }, { label: "Not Interested" }, { label: "No Response", next: 2 }] },
  { id: 3, name: "Discovery Call", icon: "calendar", branches: [{ label: "Good Fit", next: 4 }, { label: "Not Ready", next: 2 }, { label: "Wrong Fit" }] },
  { id: 4, name: "Proposal", icon: "file", branches: [{ label: "Accepted", next: 5 }, { label: "Negotiation", next: 4 }, { label: "Declined" }] },
  { id: 5, name: "Contract Signed", icon: "check", branches: [{ label: "One-time Project", next: 6 }, { label: "Retainer Client", next: 7 }] },
  { id: 6, name: "Project Delivery", icon: "money", branches: [{ label: "Completed", next: 8 }, { label: "Revision Needed", next: 6 }] },
  { id: 7, name: "Ongoing Retainer", icon: "money", branches: [{ label: "Active", next: 7 }, { label: "Renewal", next: 5 }, { label: "Cancelled" }] },
  { id: 8, name: "Final Payment", icon: "check", branches: [{ label: "Paid" }, { label: "Follow-up", next: 8 }] },
];

const toolsRows = [
  { name: "Instantly.ai", category: "Sales", description: "Cold email outreach", gradient: "from-sky-400/45 to-blue-500/45", url: "https://instantly.ai" },
  { name: "Canva", category: "Design", description: "Graphic design", gradient: "from-fuchsia-400/45 to-purple-500/45", url: "https://www.canva.com" },
  { name: "Figma", category: "Design", description: "Interface design", gradient: "from-purple-400/45 to-indigo-500/45", url: "https://www.figma.com" },
  { name: "Notion", category: "Productivity", description: "All-in-one workspace", gradient: "from-slate-300/40 to-slate-500/40", url: "https://www.notion.so" },
  { name: "GitHub", category: "Development", description: "Code repository", gradient: "from-slate-500/45 to-zinc-700/45", url: "https://github.com" },
  { name: "AWS Console", category: "Infrastructure", description: "Cloud computing", gradient: "from-orange-400/45 to-amber-500/45", url: "https://aws.amazon.com/console/" },
  { name: "Stripe", category: "Payments", description: "Payment processing", gradient: "from-indigo-400/45 to-violet-500/45", url: "https://dashboard.stripe.com" },
  { name: "Google Analytics", category: "Analytics", description: "Website analytics", gradient: "from-yellow-300/50 to-orange-500/45", url: "https://analytics.google.com" },
  { name: "Namecheap", category: "Domains", description: "Domain registration", gradient: "from-orange-400/45 to-rose-500/45", url: "https://www.namecheap.com" },
  { name: "ClickUp", category: "Project Management", description: "Task management", gradient: "from-pink-400/45 to-purple-500/45", url: "https://clickup.com" },
  { name: "Slack", category: "Communication", description: "Team messaging", gradient: "from-violet-400/45 to-indigo-500/45", url: "https://slack.com" },
  { name: "Loom", category: "Communication", description: "Video messaging", gradient: "from-purple-400/45 to-fuchsia-500/45", url: "https://www.loom.com" },
];

const shortlistRows = [
  { title: "Renew AWS hosting payment", area: "Admin", due: "2026-03-08", status: "Due Soon" },
  { title: "Finalize top 5 sales focus targets", area: "Sales", due: "2026-03-05", status: "In Progress" },
  { title: "Ship pricing page QA fixes", area: "Development", due: "2026-03-06", status: "Blocked" },
  { title: "Send monthly retainer reports", area: "Subscriptions", due: "2026-03-07", status: "Queued" },
];

const adminViews: AdminView[] = ["dashboard", "finances", "web", "roadmap", "tools", "shortlist", "goals", "review", "tasks", "variables", "settings"];
const resolveAdminView = (value: string | null): AdminView => {
  if (!value) return "dashboard";
  return adminViews.includes(value as AdminView) ? (value as AdminView) : "dashboard";
};

export default function Admin() {
  const hasLoadedReviewPinsFromSupabase = useRef(false);
  const suppressNextReviewPinsSync = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<AdminView>(() => resolveAdminView(searchParams.get("tab")));
  const [financeTab, setFinanceTab] = useState<"recurring" | "one-time">("recurring");
  const [roadmapViewMode, setRoadmapViewMode] = useState<"list" | "calendar" | "timeline">("list");
  const [selectedRoadmapTask, setSelectedRoadmapTask] = useState<RoadmapTask | null>(null);

  const [reviewAnnotateMode, setReviewAnnotateMode] = useState(false);
  const [reviewSurfaceUrl, setReviewSurfaceUrl] = useState(
    "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1600&q=80"
  );
  const [reviewDraft, setReviewDraft] = useState("");
  const [reviewAssignee, setReviewAssignee] = useState("You");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"all" | ReviewStatus | "resolved">("all");
  const [reviewPins, setReviewPins] = useState<ReviewPin[]>(() => {
    try {
      const raw = localStorage.getItem(REVIEW_PINS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ReviewPin[]) : [];
    } catch {
      return [];
    }
  });

  const [themePreference, setThemePreference] = useState<ThemePreference>(() => getStoredThemePreference());
  const [timeZone, setTimeZone] = useState(() => localStorage.getItem(TIMEZONE_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
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
    if (saved === "personal" || saved === "business" || saved === "combined") return saved;
    return "combined";
  });
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() => {
    const saved = localStorage.getItem(SIDEBAR_POSITION_KEY);
    if (saved === "left" || saved === "right" || saved === "top-dock") return saved;
    return "top-dock";
  });
  const [history, setHistory] = useState<ActivityEntry[]>(() => getActivityLog());
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [importDraft, setImportDraft] = useState<ClickUpImportBundle | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [syncHealth, setSyncHealth] = useState<SyncTableHealth[]>([]);
  const [syncHealthBusy, setSyncHealthBusy] = useState(false);
  const [linkedSyncReview, setLinkedSyncReview] = useState<LinkedSyncReport | null>(null);
  const [linkedSyncBusy, setLinkedSyncBusy] = useState(false);

  useEffect(() => setView(resolveAdminView(searchParams.get("tab"))), [searchParams]);

  const setViewWithUrl = (nextView: AdminView) => {
    setView(nextView);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", nextView);
      return next;
    });
  };

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

  useEffect(() => {
    localStorage.setItem(REVIEW_PINS_KEY, JSON.stringify(reviewPins));
  }, [reviewPins]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const loadReviewPinsFromSupabase = async () => {
      try {
        const rows = await fetchSalesPageState();
        if (cancelled) return;
        const pinsRow = rows.find((row) => row.key === "admin_review_pins");
        if (Array.isArray(pinsRow?.payload)) {
          suppressNextReviewPinsSync.current = true;
          setReviewPins(pinsRow.payload as ReviewPin[]);
        } else if (reviewPins.length > 0) {
          await replaceSalesPageState({ admin_review_pins: reviewPins });
        }
        hasLoadedReviewPinsFromSupabase.current = true;
      } catch {
        if (cancelled) return;
        hasLoadedReviewPinsFromSupabase.current = true;
      }
    };
    void loadReviewPinsFromSupabase();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !hasLoadedReviewPinsFromSupabase.current) return;
    if (suppressNextReviewPinsSync.current) {
      suppressNextReviewPinsSync.current = false;
      return;
    }
    void replaceSalesPageState({ admin_review_pins: reviewPins }).catch(() => {
      // Keep local admin review pins even if Supabase sync fails.
    });
  }, [reviewPins]);

  const historyRows = useMemo(
    () =>
      history.slice(0, 24).map((entry) => ({
        ...entry,
        stamp: new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(entry.at)),
      })),
    [history]
  );

  const dashboardStats = useMemo(
    () => ({
      finance: recurringExpenseRows.length + oneTimeExpenseRows.length,
      web: flowNodes.length,
      roadmap: roadmapTaskSections.reduce((sum, section) => sum + section.tasks.length, 0),
      tools: toolsRows.length,
    }),
    []
  );

  const reviewFilteredPins = useMemo(() => {
    if (reviewStatusFilter === "all") return reviewPins;
    if (reviewStatusFilter === "resolved") return reviewPins.filter((pin) => pin.resolved);
    return reviewPins.filter((pin) => !pin.resolved && pin.status === reviewStatusFilter);
  }, [reviewPins, reviewStatusFilter]);

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
    setSession({ email: normalized, name: safeName, signedInAt: new Date().toISOString() });
    setPassword("");
    setAuthError("");
    logActivity({ area: "settings", action: "Signed In", detail: normalized });
  };

  const handleSignOut = () => {
    const detail = session?.email || "Local session";
    setSession(null);
    setPassword("");
    setAuthError("");
    logActivity({ area: "settings", action: "Signed Out", detail });
  };

  const handleLogoutDelphi = () => {
    localStorage.removeItem(AUTH_GATE_REMEMBER_KEY);
    sessionStorage.removeItem(AUTH_GATE_SESSION_KEY);
    logActivity({ area: "settings", action: "Logged Out", detail: "Exited Delphi to login page" });
    window.dispatchEvent(new CustomEvent("delphi-global-logout"));
  };

  const readJsonArray = <T,>(key: string) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [] as T[];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [] as T[];
    }
  };

  const writeJsonArray = (key: string, value: unknown[]) => {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("delphi-data-change", { detail: key }));
  };

  const handleClickUpFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseClickUpCsv(text);
      setImportDraft(parsed);
      setImportFileName(file.name);
      if (!parsed.myWork.length && !parsed.development.length && !parsed.sales.length && !parsed.subscriptions.length) {
        setImportStatus("No importable rows found. Check your ClickUp CSV columns.");
      } else {
        setImportStatus(
          `Ready: ${parsed.myWork.length} tasks, ${parsed.development.length} projects, ${parsed.sales.length} prospects, ${parsed.subscriptions.length} clients.`
        );
      }
    } catch {
      setImportDraft(null);
      setImportStatus("CSV parse failed. Please export again from ClickUp and retry.");
    }
  };

  const handleApplyImport = async () => {
    if (!importDraft) return;
    setImportBusy(true);
    setImportStatus("Applying import...");

    const currentMyWork = readJsonArray<typeof importDraft.myWork[number]>(MY_WORK_KEY);
    const currentDevelopment = readJsonArray<typeof importDraft.development[number]>(DEVELOPMENT_KEY);
    const currentSales = readJsonArray<typeof importDraft.sales[number]>(SALES_KEY);
    const currentSubscriptions = readJsonArray<typeof importDraft.subscriptions[number]>(SUBSCRIPTIONS_KEY);

    const nextMyWork = mergeImportedData(
      currentMyWork,
      importDraft.myWork,
      (item) => `${item.title.toLowerCase()}|${item.date}|${item.startTime}`,
      importMode
    );
    const nextDevelopment = mergeImportedData(
      currentDevelopment,
      importDraft.development,
      (item) => `${item.name.toLowerCase()}|${item.client.toLowerCase()}`,
      importMode
    );
    const nextSales = mergeImportedData(
      currentSales,
      importDraft.sales,
      (item) => `${item.prospect.toLowerCase()}|${item.contact.toLowerCase()}`,
      importMode
    );
    const nextSubscriptions = mergeImportedData(
      currentSubscriptions,
      importDraft.subscriptions,
      (item) => `${item.client.toLowerCase()}|${item.plan.toLowerCase()}`,
      importMode
    );

    writeJsonArray(MY_WORK_KEY, nextMyWork);
    writeJsonArray(DEVELOPMENT_KEY, nextDevelopment);
    writeJsonArray(SALES_KEY, nextSales);
    writeJsonArray(SUBSCRIPTIONS_KEY, nextSubscriptions);

    const syncErrors: string[] = [];
    if (isSupabaseConfigured) {
      try {
        await replaceMyWorkTasks(nextMyWork);
      } catch (error) {
        syncErrors.push(`My Work: ${getSupabaseErrorMessage(error)}`);
      }
      try {
        await replaceDevelopmentProjects(nextDevelopment);
      } catch (error) {
        syncErrors.push(`Development: ${getSupabaseErrorMessage(error)}`);
      }
      try {
        await replaceSalesOutreach(nextSales);
      } catch (error) {
        syncErrors.push(`Sales: ${getSupabaseErrorMessage(error)}`);
      }
      try {
        await replaceSubscriptionClients(nextSubscriptions);
      } catch (error) {
        syncErrors.push(`Subscriptions: ${getSupabaseErrorMessage(error)}`);
      }
    }

    if (syncErrors.length > 0) {
      setImportStatus(`Import saved locally. Supabase issues: ${syncErrors.join(" | ")}`);
    } else {
      setImportStatus("Import complete and synced.");
    }
    logActivity({
      area: "settings",
      action: "Imported ClickUp CSV",
      detail: `${nextMyWork.length} tasks, ${nextDevelopment.length} projects, ${nextSales.length} prospects, ${nextSubscriptions.length} clients`,
    });
    setImportBusy(false);
  };

  const handleRunSyncHealth = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setSyncHealth([]);
      return;
    }
    setSyncHealthBusy(true);
    const checks = await Promise.all(
      SYNC_TABLES.map(async (table) => {
        const { error } = await supabase.from(table.key).select("id", { head: true, count: "exact" }).limit(1);
        if (error) {
          return {
            table: table.key,
            label: table.label,
            ok: false,
            message: getSupabaseErrorMessage(error),
          } satisfies SyncTableHealth;
        }
        return {
          table: table.key,
          label: table.label,
          ok: true,
          message: "Connected",
        } satisfies SyncTableHealth;
      })
    );
    setSyncHealth(checks);
    setSyncHealthBusy(false);
  };

  const handlePreviewLinkedSync = () => {
    setLinkedSyncReview(previewLinkedSyncReview());
  };

  const handleApplyLinkedSync = async () => {
    setLinkedSyncBusy(true);
    try {
      const report = await runLinkedScheduleSync();
      setLinkedSyncReview(report);
    } finally {
      setLinkedSyncBusy(false);
    }
  };

  const handleDownloadLinkedSyncReport = () => {
    if (!linkedSyncReview) return;
    const blob = new Blob([JSON.stringify(linkedSyncReview, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `delphi-linked-sync-review-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  return (
    <div className="app-atmosphere-page app-light-page min-h-screen relative overflow-hidden">
      <div className="app-light-frame relative space-y-8">
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <AnimatedTitle text="Admin" className="app-light-title" />
            <p className="app-light-subtitle">Internal command center for operations and business structure.</p>
          </div>

          <div className="app-light-toolbar flex items-center gap-2 rounded-full p-2">
            <TooltipProvider delayDuration={80}>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant={view === "dashboard" ? "secondary" : "ghost"} onClick={() => setViewWithUrl("dashboard")} className="h-11 w-11 px-0" aria-label="Dashboard"><LayoutDashboard className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Dashboard</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant={view === "finances" ? "secondary" : "ghost"} onClick={() => setViewWithUrl("finances")} className="h-11 w-11 px-0" aria-label="Finances"><DollarSign className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Finances</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant={view === "web" ? "secondary" : "ghost"} onClick={() => setViewWithUrl("web")} className="h-11 w-11 px-0" aria-label="Web"><Globe className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Web</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant={view === "roadmap" ? "secondary" : "ghost"} onClick={() => setViewWithUrl("roadmap")} className="h-11 w-11 px-0" aria-label="Road Map"><Layers className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Road Map</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant={view === "tools" ? "secondary" : "ghost"} onClick={() => setViewWithUrl("tools")} className="h-11 w-11 px-0" aria-label="Tools"><Wrench className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Tools</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant={view === "shortlist" ? "secondary" : "ghost"} onClick={() => setViewWithUrl("shortlist")} className="h-11 w-11 px-0" aria-label="Shortlist"><ListTodo className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Shortlist</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant={view === "goals" ? "secondary" : "ghost"} onClick={() => setViewWithUrl("goals")} className="h-11 w-11 px-0" aria-label="Goals"><Target className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Goals</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant={view === "review" ? "secondary" : "ghost"} onClick={() => setViewWithUrl("review")} className="h-11 w-11 px-0" aria-label="Review"><MessageSquare className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Review</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant={view === "tasks" ? "secondary" : "ghost"} onClick={() => setViewWithUrl("tasks")} className="h-11 w-11 px-0" aria-label="Tasks"><ListChecks className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Tasks</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant={view === "variables" ? "secondary" : "ghost"} onClick={() => setViewWithUrl("variables")} className="h-11 w-11 px-0" aria-label="Variables"><SlidersHorizontal className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Variables</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant={view === "settings" ? "secondary" : "ghost"} onClick={() => setViewWithUrl("settings")} className="h-11 w-11 px-0" aria-label="Settings"><SettingsIcon className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Settings</p></TooltipContent></Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {view === "dashboard" && (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              <StatCard title="Finances" value={String(dashboardStats.finance)} change="Billing modules" changeType="neutral" icon={DollarSign} />
              <StatCard title="Web Flow" value={String(dashboardStats.web)} change="Pipeline stages" changeType="neutral" icon={Globe} />
              <StatCard title="Road Map" value={String(dashboardStats.roadmap)} change="Strategic tracks" changeType="neutral" icon={Layers} />
              <StatCard title="Tools" value={String(dashboardStats.tools)} change="Active systems" changeType="neutral" icon={Wrench} />
            </div>
            <Card className="glass-hero-panel p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Admin Overview</h2>
                <Badge variant="outline" className="gap-1 border-white/35 bg-white/20 text-[hsl(220_38%_46%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-white/15 dark:bg-white/5 dark:text-white"><Shield className="h-3.5 w-3.5" /> Internal</Badge>
              </div>
              <p className="text-sm leading-relaxed text-[hsl(219_30%_52%)] dark:text-muted-foreground">Use this center to oversee financial obligations, process flow, roadmap sequencing, tooling, review loops, and settings.</p>
            </Card>
          </>
        )}

        {view === "finances" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div><h2 className="text-2xl font-semibold">Billing & Finances</h2><p className="text-sm text-muted-foreground">Track company expenses and manage budgets.</p></div>
              <Button className="add-action h-11 rounded-full px-6 text-base font-semibold">+ Add Expense</Button>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              <StatCard title="Monthly Recurring" value="$2,847" change="Active subscriptions" changeType="neutral" icon={DollarSign} />
              <StatCard title="This Month Spent" value="$6,383" change="-15% from last month" changeType="positive" icon={BarChart3} />
              <StatCard title="One-Time Expenses" value="$3,536" change="Last 30 days" changeType="neutral" icon={Wrench} />
              <StatCard title="Next Billing" value="December 1" change="$450 AWS" changeType="neutral" icon={Calendar} />
            </div>
            <Card className="p-6 bg-card/80 backdrop-blur-sm">
              <Tabs value={financeTab} onValueChange={(value) => setFinanceTab(value as "recurring" | "one-time")}>
                <TabsList className="mb-4 h-10 gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
                  <TabsTrigger value="recurring" className="h-8 px-4">Recurring Expenses</TabsTrigger>
                  <TabsTrigger value="one-time" className="h-8 px-4">One-Time Expenses</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="space-y-3">
                {financeTab === "recurring" ? recurringExpenseRows.map((item) => (
                  <div key={item.name} className="liquid-cyan-hover rounded-xl border border-border bg-card p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_1fr_1fr_1fr_auto] md:items-center">
                      <div><p className="font-semibold">{item.name}</p><p className="text-sm text-muted-foreground">{item.category}</p></div>
                      <p className="font-medium">{item.amount}</p>
                      <p className="text-sm text-muted-foreground">{item.frequency}</p>
                      <p className="text-sm text-muted-foreground">{formatDateWritten(item.nextBilling)}</p>
                      <div className="flex items-center justify-end gap-2"><Badge variant="outline">{item.status}</Badge><Button size="sm" variant="outline">Edit</Button><Button size="sm" variant="outline">Cancel</Button></div>
                    </div>
                  </div>
                )) : oneTimeExpenseRows.map((item) => (
                  <div key={item.name} className="liquid-cyan-hover rounded-xl border border-border bg-card p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_1fr_1fr_1fr_auto] md:items-center">
                      <div><p className="font-semibold">{item.name}</p><p className="text-sm text-muted-foreground">{item.category}</p></div>
                      <p className="font-medium">{item.amount}</p>
                      <p className="text-sm text-muted-foreground">{item.vendor}</p>
                      <p className="text-sm text-muted-foreground">{formatDateWritten(item.date)}</p>
                      <div className="flex items-center justify-end gap-2"><Button size="sm" variant="outline">View Receipt</Button><Button size="sm" variant="outline">Edit</Button></div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card className="p-6 bg-card/80 backdrop-blur-sm">
                <h3 className="text-lg font-semibold mb-4">Expense Breakdown</h3>
                <div className="space-y-4">{expenseBreakdownRows.map((row) => (<div key={row.category}><div className="mb-1 flex items-center justify-between text-sm"><span>{row.category}</span><span className="text-muted-foreground">{row.percent}%</span></div><div className="h-2.5 w-full rounded-full bg-secondary"><div className="h-full rounded-full bg-[linear-gradient(90deg,hsl(191_100%_72%),hsl(215_93%_63%))]" style={{ width: `${row.percent}%` }} /></div></div>))}</div>
              </Card>
              <Card className="p-6 bg-card/80 backdrop-blur-sm">
                <h3 className="text-lg font-semibold mb-4">Budget Overview</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span>Monthly budget</span><span className="font-semibold">$10,000</span></div>
                  <div className="flex items-center justify-between"><span>Spent</span><span className="font-semibold">$6,383</span></div>
                  <div className="flex items-center justify-between"><span>Remaining</span><span className="font-semibold text-emerald-400">$3,617</span></div>
                </div>
                <div className="mt-4 h-3 w-full rounded-full bg-secondary"><div className="h-full rounded-full bg-[linear-gradient(90deg,hsl(191_100%_72%),hsl(215_93%_63%))]" style={{ width: "64%" }} /></div>
              </Card>
            </div>
          </div>
        )}

        {view === "roadmap" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div><h2 className="text-2xl font-semibold">Road Map</h2><p className="text-sm text-muted-foreground">Plan and prioritize upcoming work across departments.</p></div>
              <Button className="add-action h-11 rounded-full px-6 text-base font-semibold" onClick={() => setSelectedRoadmapTask({ id: `new-${Date.now()}`, title: "", dept: "", priority: "medium", status: "not-started" })}>+ New Task</Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
                <Button size="sm" variant={roadmapViewMode === "list" ? "secondary" : "ghost"} onClick={() => setRoadmapViewMode("list")} className="h-8 px-3">List View</Button>
                <Button size="sm" variant={roadmapViewMode === "calendar" ? "secondary" : "ghost"} onClick={() => setRoadmapViewMode("calendar")} className="h-8 px-3">Calendar View</Button>
                <Button size="sm" variant={roadmapViewMode === "timeline" ? "secondary" : "ghost"} onClick={() => setRoadmapViewMode("timeline")} className="h-8 px-3">Timeline View</Button>
              </div>
              <div className="flex items-center gap-2"><Badge className="border-red-400/40 bg-red-500/10 text-red-300">High</Badge><Badge className="border-amber-400/40 bg-amber-500/10 text-amber-200">Medium</Badge><Badge className="border-emerald-400/40 bg-emerald-500/10 text-emerald-200">Low</Badge></div>
            </div>
            {roadmapViewMode !== "list" ? (
              <Card className="p-6 bg-card/80 backdrop-blur-sm"><p className="text-sm text-muted-foreground">{roadmapViewMode === "calendar" ? "Calendar View coming next." : "Timeline View coming next."}</p></Card>
            ) : (
              roadmapTaskSections.map((section) => (
                <Card key={section.section} className="p-6 bg-card/80 backdrop-blur-sm">
                  <h3 className="mb-4 text-lg font-semibold">{section.section}</h3>
                  <div className="space-y-3">
                    {section.tasks.map((task) => (
                      <button key={task.id} onClick={() => setSelectedRoadmapTask(task)} className="liquid-cyan-hover w-full rounded-xl border border-border bg-card p-4 text-left transition-all">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${task.priority === "high" ? "bg-red-400" : task.priority === "medium" ? "bg-amber-300" : "bg-emerald-300"}`} /><p className="truncate font-semibold">{task.title}</p></div><p className="mt-1 text-sm text-muted-foreground">{task.dept}</p></div>
                          <div className="flex items-center gap-2"><Badge variant="outline">{task.status === "complete" ? "Complete" : task.status === "in-progress" ? "In Progress" : "Not Started"}</Badge>{task.date ? <Badge variant="outline">{formatDateWritten(task.date)}</Badge> : null}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {view === "web" && (
          <div className="space-y-6">
            <div><h2 className="text-2xl font-semibold">Business Flow Web</h2><p className="text-sm text-muted-foreground">Visual map of the company journey from prospect to payment.</p></div>
            <Card className="p-6 bg-card/80 backdrop-blur-sm">
              <div className="overflow-x-auto pb-2">
                <div className="flex min-w-max items-start gap-6">
                  {flowNodes.map((node, index) => (
                    <div key={node.id} className="relative">
                      <Card className="w-72 p-4 bg-card/85 backdrop-blur-sm border border-primary/20">
                        <div className="mb-3 flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-[linear-gradient(135deg,hsl(193_100%_72%/.35),hsl(214_95%_62%/.35))] flex items-center justify-center">
                            {node.icon === "users" ? <Users className="h-4 w-4" /> : null}
                            {node.icon === "mail" ? <Mail className="h-4 w-4" /> : null}
                            {node.icon === "calendar" ? <Calendar className="h-4 w-4" /> : null}
                            {node.icon === "file" ? <FileText className="h-4 w-4" /> : null}
                            {node.icon === "check" ? <CheckCircle className="h-4 w-4" /> : null}
                            {node.icon === "money" ? <DollarSign className="h-4 w-4" /> : null}
                          </div>
                          <div><p className="text-xs text-muted-foreground">Stage {node.id}</p><p className="font-semibold">{node.name}</p></div>
                        </div>
                        <div className="space-y-2">
                          {node.branches.map((branch, idx) => (
                            <div key={`${branch.label}-${idx}`} className="flex items-center justify-between rounded-lg border border-border/65 bg-card/60 px-3 py-2 text-sm">
                              <span>{branch.label}</span>
                              {branch.next ? <ArrowRight className="h-3.5 w-3.5 text-primary/75" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                            </div>
                          ))}
                        </div>
                      </Card>
                      {index < flowNodes.length - 1 ? <div className="pointer-events-none absolute -right-5 top-1/2 hidden -translate-y-1/2 rounded-full border border-primary/30 bg-card/70 p-1.5 md:block"><ArrowRight className="h-4 w-4 text-primary/75" /></div> : null}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
            <Card className="p-6 bg-card/80 backdrop-blur-sm">
              <h3 className="mb-4 text-lg font-semibold">Journey Overview</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-border/60 bg-card/60 p-4"><p className="text-xs text-muted-foreground">Total Stages</p><p className="mt-1 text-xl font-semibold">8</p></div>
                <div className="rounded-xl border border-border/60 bg-card/60 p-4"><p className="text-xs text-muted-foreground">Decision Points</p><p className="mt-1 text-xl font-semibold">~20</p></div>
                <div className="rounded-xl border border-border/60 bg-card/60 p-4"><p className="text-xs text-muted-foreground">Revenue Streams</p><p className="mt-1 text-xl font-semibold">2</p></div>
                <div className="rounded-xl border border-border/60 bg-card/60 p-4"><p className="text-xs text-muted-foreground">Avg Conversion</p><p className="mt-1 text-xl font-semibold">65%</p></div>
              </div>
            </Card>
          </div>
        )}

        {view === "tools" && (
          <div className="space-y-6">
            <div><h2 className="text-2xl font-semibold">Tools</h2><p className="text-sm text-muted-foreground">Quick access to all essential business tools.</p></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {toolsRows.map((tool) => (
                <a key={tool.name} href={tool.url} target="_blank" rel="noreferrer" className="liquid-cyan-hover group rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-sm transition-all hover:scale-[1.02]">
                  <div className={`mb-3 h-16 w-16 rounded-2xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center text-xl font-bold text-white`}>{tool.name.charAt(0)}</div>
                  <div className="flex items-center justify-between"><p className="font-semibold">{tool.name}</p><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div>
                  <p className="mt-1 text-xs text-muted-foreground">{tool.category}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{tool.description}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {view === "shortlist" && (
          <Card className="p-6 bg-card/80 backdrop-blur-sm">
            <h2 className="text-xl font-semibold mb-4">Shortlist</h2>
            <div className="space-y-3">
              {shortlistRows.map((item) => (
                <div key={item.title} className="liquid-cyan-hover rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                  <div><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.area}</p></div>
                  <div className="text-right"><Badge variant="outline">{item.status}</Badge><p className="mt-2 text-xs text-muted-foreground">{formatDateWritten(item.due)}</p></div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {view === "goals" && (
          <Card className="p-6 bg-card/80 backdrop-blur-sm">
            <h2 className="text-xl font-semibold mb-5">Goals</h2>
            <div className="space-y-5">
              <div className="liquid-cyan-hover rounded-2xl border border-border bg-card p-5">
                <div className="mb-2 flex items-center justify-between"><p className="text-base font-semibold text-foreground">Revenue Goal</p><Badge variant="outline">$10,000 Target</Badge></div>
                <p className="text-sm text-muted-foreground">$6,383 achieved</p>
                <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-[linear-gradient(90deg,hsl(191_100%_72%),hsl(215_93%_63%))]" style={{ width: "63.8%" }} /></div>
                <p className="mt-2 text-xs text-muted-foreground">63.8% complete</p>
              </div>
              <div className="liquid-cyan-hover rounded-2xl border border-border bg-card p-5">
                <div className="mb-2 flex items-center justify-between"><p className="text-base font-semibold text-foreground">MRR Goal</p><Badge variant="outline">$1,500 Target</Badge></div>
                <p className="text-sm text-muted-foreground">$1,320 achieved</p>
                <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-[linear-gradient(90deg,hsl(191_100%_72%),hsl(215_93%_63%))]" style={{ width: "88%" }} /></div>
                <p className="mt-2 text-xs text-muted-foreground">88% complete</p>
              </div>
            </div>
          </Card>
        )}

        {view === "review" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-2xl font-semibold">Review</h2><p className="text-sm text-muted-foreground">Ruttl-style visual feedback workflow.</p></div>
              <div className="flex items-center gap-2">
                <Button variant={reviewAnnotateMode ? "secondary" : "outline"} onClick={() => setReviewAnnotateMode((v) => !v)} className="gap-2"><PenSquare className="h-4 w-4" />{reviewAnnotateMode ? "Annotate On" : "Annotate Off"}</Button>
                <Button variant="outline" className="gap-2" onClick={async () => { const shareUrl = `${window.location.origin}/admin?tab=review`; await navigator.clipboard.writeText(shareUrl); }}><Copy className="h-4 w-4" />Share</Button>
              </div>
            </div>

            <Card className="p-4 bg-card/80 backdrop-blur-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_260px]">
                <Input value={reviewSurfaceUrl} onChange={(e) => setReviewSurfaceUrl(e.target.value)} placeholder="Paste page image URL for review board..." />
                <Input value={reviewAssignee} onChange={(e) => setReviewAssignee(e.target.value)} placeholder="Assignee" />
                <Input value={reviewDraft} onChange={(e) => setReviewDraft(e.target.value)} placeholder="Comment text (then click board)" />
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
              <Card className="relative h-[560px] overflow-hidden border border-border/70 bg-card/70 backdrop-blur-sm">
                <div
                  className="absolute inset-0 cursor-crosshair bg-cover bg-center"
                  style={{ backgroundImage: `url(${reviewSurfaceUrl})` }}
                  onClick={(event) => {
                    if (!reviewAnnotateMode || !reviewDraft.trim()) return;
                    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const x = ((event.clientX - rect.left) / rect.width) * 100;
                    const y = ((event.clientY - rect.top) / rect.height) * 100;
                    const pin: ReviewPin = {
                      id: `pin-${Date.now()}`,
                      x,
                      y,
                      text: reviewDraft.trim(),
                      assignee: reviewAssignee.trim() || "Unassigned",
                      status: "todo",
                      resolved: false,
                      createdAt: new Date().toISOString(),
                    };
                    setReviewPins((prev) => [pin, ...prev]);
                    setReviewDraft("");
                    logActivity({ area: "admin-review", action: "Added Comment", detail: pin.text });
                  }}
                />
                <div className="absolute inset-0">
                  {reviewPins.map((pin, idx) => (
                    <button
                      key={pin.id}
                      className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[10px] font-bold shadow-lg ${pin.resolved ? "border-emerald-400/80 bg-emerald-500/70 text-white" : "border-cyan-300/80 bg-cyan-500/80 text-slate-950"}`}
                      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                      onClick={() => setReviewPins((prev) => prev.map((entry) => entry.id === pin.id ? { ...entry, resolved: !entry.resolved } : entry))}
                      title={`${pin.text} • ${pin.assignee}`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </Card>

              <Card className="p-4 bg-card/80 backdrop-blur-sm">
                <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold">Comments</h3><Badge variant="outline">{reviewPins.length}</Badge></div>
                <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
                  <Button size="sm" variant={reviewStatusFilter === "all" ? "secondary" : "ghost"} onClick={() => setReviewStatusFilter("all")} className="h-7 px-2.5 text-xs">All</Button>
                  <Button size="sm" variant={reviewStatusFilter === "todo" ? "secondary" : "ghost"} onClick={() => setReviewStatusFilter("todo")} className="h-7 px-2.5 text-xs">Todo</Button>
                  <Button size="sm" variant={reviewStatusFilter === "in_progress" ? "secondary" : "ghost"} onClick={() => setReviewStatusFilter("in_progress")} className="h-7 px-2.5 text-xs">In Progress</Button>
                  <Button size="sm" variant={reviewStatusFilter === "approved" ? "secondary" : "ghost"} onClick={() => setReviewStatusFilter("approved")} className="h-7 px-2.5 text-xs">Approved</Button>
                  <Button size="sm" variant={reviewStatusFilter === "resolved" ? "secondary" : "ghost"} onClick={() => setReviewStatusFilter("resolved")} className="h-7 px-2.5 text-xs">Resolved</Button>
                </div>
                <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
                  {reviewFilteredPins.map((pin) => (
                    <div key={pin.id} className="rounded-xl border border-border/60 bg-card/60 p-3">
                      <p className="text-sm font-medium">{pin.text}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{pin.assignee} • {formatDateWritten(pin.createdAt.slice(0, 10))}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setReviewPins((prev) => prev.map((entry) => entry.id === pin.id ? { ...entry, status: entry.status === "todo" ? "in_progress" : entry.status === "in_progress" ? "approved" : "todo" } : entry))}>
                          {pin.status === "todo" ? "Todo" : pin.status === "in_progress" ? "In Progress" : "Approved"}
                        </Button>
                        <Button size="sm" variant={pin.resolved ? "secondary" : "outline"} className="h-7 px-2 text-xs" onClick={() => setReviewPins((prev) => prev.map((entry) => entry.id === pin.id ? { ...entry, resolved: !entry.resolved } : entry))}>
                          <Check className="mr-1 h-3 w-3" />{pin.resolved ? "Resolved" : "Resolve"}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {reviewFilteredPins.length === 0 ? <p className="text-sm text-muted-foreground">No comments for this filter.</p> : null}
                </div>
              </Card>
            </div>
          </div>
        )}

        {view === "tasks" && (
          <Card className="p-6 bg-card/80 backdrop-blur-sm">
            <h2 className="text-xl font-semibold mb-2">Tasks</h2>
            <p className="text-sm text-muted-foreground">Blank page ready for admin task systems.</p>
          </Card>
        )}

        {view === "variables" && (
          <Card className="p-6 bg-card/80 backdrop-blur-sm">
            <h2 className="text-xl font-semibold mb-2">Variables</h2>
            <p className="text-sm text-muted-foreground">Blank page ready for variable definitions.</p>
          </Card>
        )}

        {view === "settings" && (
          <div className="space-y-6">
            <Card className="p-6 bg-card/80 backdrop-blur-sm">
              <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Workspace Mode</h2><p className="text-sm text-muted-foreground mt-1">Control personal, business, or combined workspace focus.</p></div><Badge variant="secondary">{workspaceMode === "combined" ? "Both" : workspaceMode === "personal" ? "Personal" : "Business"}</Badge></div>
              <div className="mt-4 flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
                <Button size="sm" variant={workspaceMode === "combined" ? "secondary" : "ghost"} onClick={() => setWorkspaceMode("combined")} className="h-8 px-4">Both</Button>
                <Button size="sm" variant={workspaceMode === "personal" ? "secondary" : "ghost"} onClick={() => setWorkspaceMode("personal")} className="h-8 px-4">Personal</Button>
                <Button size="sm" variant={workspaceMode === "business" ? "secondary" : "ghost"} onClick={() => setWorkspaceMode("business")} className="h-8 px-4">Business</Button>
              </div>
            </Card>

            <Card className="p-6 bg-card/80 backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Appearance</h2>
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

            <Card className="p-6 bg-card/80 backdrop-blur-sm">
              <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Sidebar Position</h2><p className="text-sm text-muted-foreground mt-1">Left, right, or top-dock behavior.</p></div><Badge variant="secondary">{sidebarPosition === "left" ? "Left" : sidebarPosition === "right" ? "Right" : "Top Dock"}</Badge></div>
              <div className="mt-4 flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1">
                <Button size="sm" variant={sidebarPosition === "left" ? "secondary" : "ghost"} onClick={() => setSidebarPosition("left")} className="h-8 px-4">Left</Button>
                <Button size="sm" variant={sidebarPosition === "right" ? "secondary" : "ghost"} onClick={() => setSidebarPosition("right")} className="h-8 px-4">Right</Button>
                <Button size="sm" variant={sidebarPosition === "top-dock" ? "secondary" : "ghost"} onClick={() => setSidebarPosition("top-dock")} className="h-8 px-4">Top Dock</Button>
              </div>
            </Card>

            <Card className="p-6 bg-card/80 backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div><h2 className="text-xl font-semibold">Timezone</h2><p className="text-sm text-muted-foreground mt-1">Use one timezone/time format across Delphi.</p><p className="mt-2 text-sm text-foreground/80">{timePreview}</p></div>
                <div className="flex flex-wrap items-center gap-3">
                  <select value={timeFormat} onChange={(event) => setTimeFormat(event.target.value as "12h" | "24h")} className="h-10 min-w-[120px] rounded-xl border border-border/70 bg-card/70 px-3 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary/50"><option value="12h">12-hour</option><option value="24h">24-hour</option></select>
                  <select value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className="h-10 min-w-[250px] rounded-xl border border-border/70 bg-card/70 px-3 text-sm text-foreground outline-none backdrop-blur-sm transition-colors focus:border-primary/50">{timeZoneOptions.map((zone) => (<option key={zone} value={zone}>{zone.replace("_", " ")}</option>))}</select>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-card/80 backdrop-blur-sm space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">ClickUp CSV Import</h2>
                  <p className="text-sm text-muted-foreground mt-1">Import tasks and map into My Work, Development, Sales, and Subscriptions.</p>
                </div>
                <Badge variant="secondary">{importMode === "merge" ? "Merge" : "Replace"}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-1">
                <Button
                  size="sm"
                  variant={importMode === "merge" ? "secondary" : "ghost"}
                  onClick={() => setImportMode("merge")}
                  className="h-8 px-4"
                >
                  Merge
                </Button>
                <Button
                  size="sm"
                  variant={importMode === "replace" ? "secondary" : "ghost"}
                  onClick={() => setImportMode("replace")}
                  className="h-8 px-4"
                >
                  Replace
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => void handleClickUpFile(event.target.files?.[0] ?? null)}
                  />
                  <span className="add-action inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold">Choose CSV</span>
                </label>
                <Button onClick={() => void handleApplyImport()} disabled={!importDraft || importBusy} className="h-10 rounded-full px-5 text-sm font-semibold">
                  {importBusy ? "Importing..." : "Apply Import"}
                </Button>
                {importFileName ? <Badge variant="outline">{importFileName}</Badge> : null}
              </div>
              {importDraft ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm"><p className="text-muted-foreground">My Work</p><p className="font-semibold">{importDraft.myWork.length}</p></div>
                  <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm"><p className="text-muted-foreground">Development</p><p className="font-semibold">{importDraft.development.length}</p></div>
                  <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm"><p className="text-muted-foreground">Sales</p><p className="font-semibold">{importDraft.sales.length}</p></div>
                  <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm"><p className="text-muted-foreground">Subscriptions</p><p className="font-semibold">{importDraft.subscriptions.length}</p></div>
                </div>
              ) : null}
              {importStatus ? <p className="text-sm text-muted-foreground">{importStatus}</p> : null}
              {importDraft?.warnings?.length ? (
                <div className="space-y-1">
                  {importDraft.warnings.map((warning) => (
                    <p key={warning} className="text-xs text-amber-400">{warning}</p>
                  ))}
                </div>
              ) : null}
            </Card>

            <Card className="p-6 bg-card/80 backdrop-blur-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Supabase Sync Health</h2>
                  <p className="text-sm text-muted-foreground mt-1">Check if required tables are present and reachable.</p>
                </div>
                <Button variant="outline" onClick={() => void handleRunSyncHealth()} disabled={!isSupabaseConfigured || syncHealthBusy}>
                  {syncHealthBusy ? "Checking..." : "Run Check"}
                </Button>
              </div>
              {!isSupabaseConfigured ? <p className="text-sm text-amber-400">Supabase is not configured in this environment.</p> : null}
              <div className="space-y-2">
                {syncHealth.map((item) => (
                  <div key={item.table} className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-3 py-2">
                    <p className="text-sm font-medium">{item.label}</p>
                    <Badge variant={item.ok ? "secondary" : "destructive"}>{item.ok ? "OK" : item.message}</Badge>
                  </div>
                ))}
                {isSupabaseConfigured && syncHealth.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Run check to validate table wiring.</p>
                ) : null}
              </div>
            </Card>

            <Card className="p-6 bg-card/80 backdrop-blur-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Sync Review</h2>
                  <p className="text-sm text-muted-foreground mt-1">Preview and apply linked schedule reconcile safely.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handlePreviewLinkedSync}>Preview Reconcile</Button>
                  <Button onClick={() => void handleApplyLinkedSync()} disabled={linkedSyncBusy}>
                    {linkedSyncBusy ? "Applying..." : "Apply Reconcile"}
                  </Button>
                  <Button variant="outline" onClick={handleDownloadLinkedSyncReport} disabled={!linkedSyncReview}>
                    Download Report JSON
                  </Button>
                </div>
              </div>
              {linkedSyncReview ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm">
                      <p className="text-muted-foreground">State</p>
                      <p className="font-semibold capitalize">{linkedSyncReview.state}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm">
                      <p className="text-muted-foreground">Linked Tasks</p>
                      <p className="font-semibold">{linkedSyncReview.linkedCount}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm">
                      <p className="text-muted-foreground">Mirrored Events</p>
                      <p className="font-semibold">{linkedSyncReview.mirroredCount}</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm">
                      <p className="text-muted-foreground">Issues</p>
                      <p className="font-semibold">{linkedSyncReview.issues.length}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{linkedSyncReview.message}</p>
                  <div className="max-h-[180px] space-y-2 overflow-y-auto pr-1">
                    {linkedSyncReview.issues.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No linked sync issues found.</p>
                    ) : (
                      linkedSyncReview.issues.map((issue, index) => (
                        <div key={`${issue.key}-${index}`} className="rounded-xl border border-border/60 bg-card/60 px-3 py-2">
                          <p className="text-sm font-semibold">{issue.category}</p>
                          <p className="text-xs text-muted-foreground">{issue.detail}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Run Preview Reconcile to inspect duplicates, orphans, and unscheduled source items.</p>
              )}
            </Card>

            <Card className="p-6 bg-card/80 backdrop-blur-sm">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Account Session</h2><p className="text-sm text-muted-foreground mt-1">Local sign-in for Delphi access on this device.</p></div>{session ? <Badge variant="secondary">Signed In</Badge> : <Badge variant="outline">Signed Out</Badge>}</div>
              {session ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4"><div><p className="text-base font-semibold">{session.name}</p><p className="text-sm text-muted-foreground">{session.email}</p></div><Button variant="outline" onClick={handleSignOut}>Sign Out</Button></div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" /><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" /><Button onClick={handleSignIn}>Sign In</Button>{authError ? <p className="text-sm text-destructive md:col-span-3">{authError}</p> : null}</div>
              )}
            </Card>

            <Card className="p-6 bg-card/80 backdrop-blur-sm"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Security</h2><p className="text-sm text-muted-foreground mt-1">Log out and return to the Delphi login page.</p></div><Button variant="outline" onClick={handleLogoutDelphi}>Log Out</Button></div></Card>

            <Card className="p-6 bg-card/80 backdrop-blur-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Recent History</h2><p className="text-sm text-muted-foreground mt-1">Cross-app activity log.</p></div><Button variant="outline" size="sm" onClick={() => { clearActivityLog(); setHistory([]); }}>Clear History</Button></div>
              <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                {historyRows.length === 0 ? <div className="rounded-xl border border-border/60 bg-card/60 px-4 py-6 text-sm text-muted-foreground">No activity yet.</div> : historyRows.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-border/60 bg-card/60 px-4 py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-foreground">{entry.action}</p><Badge variant="outline">{entry.stamp}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{entry.detail}</p><p className="mt-1 text-xs uppercase tracking-[0.08em] text-muted-foreground/80">{entry.area}</p></div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={!!selectedRoadmapTask} onOpenChange={() => setSelectedRoadmapTask(null)}>
        <DialogContent className="max-w-lg border border-white/35 bg-[linear-gradient(180deg,hsl(0_0%_100%/.74),hsl(0_0%_100%/.56))] p-5 backdrop-blur-2xl dark:border-[hsl(198_84%_75%/.24)] dark:bg-[linear-gradient(180deg,hsl(219_33%_20%/.9),hsl(220_35%_14%/.76))]">
          <DialogHeader><DialogTitle>Roadmap Task</DialogTitle></DialogHeader>
          {selectedRoadmapTask ? (
            <div className="space-y-2 text-sm"><p><span className="font-semibold">Title:</span> {selectedRoadmapTask.title || "New Task"}</p><p><span className="font-semibold">Department:</span> {selectedRoadmapTask.dept || "-"}</p><p><span className="font-semibold">Priority:</span> {selectedRoadmapTask.priority}</p><p><span className="font-semibold">Status:</span> {selectedRoadmapTask.status}</p></div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
