import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, RefreshCw, Send, Shield, Terminal, TrendingUp } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { SidebarPosition } from "./DashboardLayout";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMoney, parseMoney } from "@/lib/money";

const mainItems = [
  { title: "Schedule", url: "/my-work", icon: ClipboardList },
];

const p3Items = [
  { title: "Sales", url: "/sales", icon: TrendingUp },
  { title: "Development", url: "/development", icon: Terminal },
  { title: "Subscriptions", url: "/subscriptions", icon: RefreshCw },
];

const bottomItems = [
  { title: "Admin", url: "/admin", icon: Shield },
];

interface SidebarProps {
  position?: SidebarPosition;
}

interface OracleMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export function Sidebar({ position = "left" }: SidebarProps) {
  const navigate = useNavigate();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [oracleInput, setOracleInput] = useState("");
  const [oracleMessages, setOracleMessages] = useState<OracleMessage[]>([
    {
      id: "oracle-welcome",
      role: "assistant",
      text: "Oracle online. Ask for focus, pipeline health, schedule risk, or a fast operating summary.",
    },
  ]);
  const [oraclePulseStats, setOraclePulseStats] = useState({
    tasks: 0,
    prospects: 0,
    projects: 0,
    mrr: 0,
  });
  const oracleQuickPrompts = useMemo(
    () => [
      "Give me an operating summary.",
      "What should I focus on first today?",
      "Analyze sales pipeline risk.",
      "Analyze development bottlenecks.",
      "Show schedule overload risk.",
    ],
    [],
  );
  const [topDockOpen, setTopDockOpen] = useState(false);
  const topDockRef = useRef<HTMLDivElement | null>(null);
  const [topDockGlow, setTopDockGlow] = useState({ x: 50, y: 4, intensity: 0.25 });
  const [sideDockGlow, setSideDockGlow] = useState({ x: 50, y: 50, intensity: 0.2 });
  const dockTooltipClass =
    "border border-[var(--glass-stroke)] bg-[linear-gradient(180deg,hsl(220_28%_100%/.16),hsl(220_28%_100%/.07))] text-foreground shadow-[var(--glass-shadow-soft)] backdrop-blur-2xl font-semibold";

  useEffect(() => {
    if (position !== "top-dock") return;

    const onMove = (event: MouseEvent) => {
      const viewportHeight = window.innerHeight || 1;
      const viewportWidth = window.innerWidth || 1;
      const xRatio = event.clientX / viewportWidth;
      const proximity = Math.max(0, 1 - event.clientY / 220);

      setTopDockGlow({
        x: Math.max(0, Math.min(100, xRatio * 100)),
        y: Math.max(0, Math.min(18, (event.clientY / viewportHeight) * 100)),
        intensity: Math.max(0.18, Math.min(0.95, proximity)),
      });

      if (event.clientY <= 8) {
        setTopDockOpen(true);
        return;
      }

      const dockRect = topDockRef.current?.getBoundingClientRect();
      const inDockBounds = Boolean(
        dockRect &&
          event.clientX >= dockRect.left &&
          event.clientX <= dockRect.right &&
          event.clientY >= dockRect.top &&
          event.clientY <= dockRect.bottom
      );

      if (!inDockBounds && event.clientY > 52) {
        setTopDockOpen(false);
      }
    };

    const forceClose = () => {
      setTopDockOpen(false);
    };

    const onWindowBlur = () => forceClose();
    const onVisibilityChange = () => {
      if (document.hidden) forceClose();
    };
    const onMouseOut = (event: MouseEvent) => {
      if (!event.relatedTarget) forceClose();
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("mouseout", onMouseOut);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("mouseout", onMouseOut);
    };
  }, [position]);

  useEffect(() => {
    if (position === "top-dock") return;

    const onMove = (event: MouseEvent) => {
      const viewportHeight = window.innerHeight || 1;
      const viewportWidth = window.innerWidth || 1;
      const yRatio = event.clientY / viewportHeight;

      const edgeDistance =
        position === "right" ? Math.max(0, viewportWidth - event.clientX) : Math.max(0, event.clientX);
      const proximity = Math.max(0, 1 - edgeDistance / 230);

      const dockX =
        position === "right"
          ? Math.max(8, Math.min(92, 100 - (edgeDistance / 150) * 100))
          : Math.max(8, Math.min(92, (edgeDistance / 150) * 100));

      setSideDockGlow({
        x: dockX,
        y: Math.max(6, Math.min(94, yRatio * 100)),
        intensity: Math.max(0.16, Math.min(0.95, proximity)),
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [position]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
      if (!isSaveShortcut) return;
      event.preventDefault();
      setIsSearchOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const triggerHaptic = (pattern: number | number[] = 8) => {
    if (typeof navigator === "undefined") return;
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  };

  const searchableItems = useMemo(() => {
    const fromStorage = <T,>(key: string): T[] => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const pages = [
      { id: "page-my-work", title: "Schedule", subtitle: "Main workspace", url: "/my-work?tab=list", kind: "Page" },
      { id: "page-sales", title: "Sales", subtitle: "P3 pillar", url: "/sales", kind: "Page" },
      { id: "page-development", title: "Development", subtitle: "P3 pillar", url: "/development", kind: "Page" },
      { id: "page-subscriptions", title: "Subscriptions", subtitle: "P3 pillar", url: "/subscriptions", kind: "Page" },
      { id: "page-admin", title: "Admin", subtitle: "Admin command center", url: "/admin", kind: "Page" },
      { id: "page-calendar", title: "Calendar", subtitle: "Schedule tab view", url: "/my-work?tab=calendar", kind: "Page" },
      { id: "page-settings", title: "Settings", subtitle: "Admin • settings tab", url: "/admin?tab=settings", kind: "Admin" },
      { id: "page-finances", title: "Finances", subtitle: "Admin • financial overview", url: "/admin?tab=finances", kind: "Admin" },
      { id: "page-web", title: "Web", subtitle: "Admin • business flow", url: "/admin?tab=web", kind: "Admin" },
      { id: "page-roadmap", title: "Road Map", subtitle: "Admin • strategic planning", url: "/admin?tab=roadmap", kind: "Admin" },
      { id: "page-tools", title: "Tools", subtitle: "Admin • tool stack", url: "/admin?tab=tools", kind: "Admin" },
      { id: "page-shortlist", title: "Shortlist", subtitle: "Admin • top focus items", url: "/admin?tab=shortlist", kind: "Admin" },
      { id: "page-review", title: "Review", subtitle: "Admin • visual feedback", url: "/admin?tab=review", kind: "Admin" },
    ];

    const work = fromStorage<{ id: number; title: string; project?: string }>("delphi_my_work_tasks_v3").map((item) => ({
      id: `work-${item.id}`,
      title: item.title,
      subtitle: item.project ? `Schedule • ${item.project}` : "Schedule task",
      url: "/my-work",
      kind: "Task",
    }));

    const sales = fromStorage<{ id: number; prospect: string; contact?: string }>("delphi_sales_outreach_v2").map((item) => ({
      id: `sales-${item.id}`,
      title: item.prospect,
      subtitle: item.contact ? `Sales • ${item.contact}` : "Sales prospect",
      url: "/sales",
      kind: "Sales",
    }));

    const development = fromStorage<{ id: number; name: string; client?: string }>("delphi_development_projects_v2").map((item) => ({
      id: `dev-${item.id}`,
      title: item.name,
      subtitle: item.client ? `Development • ${item.client}` : "Development project",
      url: "/development",
      kind: "Project",
    }));

    const subscriptions = fromStorage<{ id: number; client: string; plan?: string }>("delphi_subscriptions_clients_v2").map((item) => ({
      id: `subs-${item.id}`,
      title: item.client,
      subtitle: item.plan ? `Subscriptions • ${item.plan}` : "Retainer client",
      url: "/subscriptions",
      kind: "Client",
    }));

    return [...pages, ...work, ...sales, ...development, ...subscriptions];
  }, [isSearchOpen]);

  const filteredResults = useMemo(() => {
    const q = oracleInput.trim().toLowerCase();
    if (!q) return searchableItems.slice(0, 24);
    return searchableItems
      .filter((item) => `${item.title} ${item.subtitle} ${item.kind}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [oracleInput, searchableItems]);

  const readArray = <T,>(key: string): T[] => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const buildOracleReply = (prompt: string) => {
    const q = prompt.trim().toLowerCase();
    const tasks = readArray<Array<{ title?: string; priority?: string; completed?: boolean; date?: string; startTime?: string }>>("delphi_my_work_tasks_v3");
    const prospects = readArray<Array<{ prospect?: string; replies?: number; emailsSent?: number; status?: string }>>("delphi_sales_outreach_v2");
    const projects = readArray<Array<{ name?: string; status?: string; stage?: string; budget?: string; spent?: string }>>("delphi_development_projects_v2");
    const clients = readArray<Array<{ client?: string; mrr?: string; status?: string }>>("delphi_subscriptions_clients_v2");
    const today = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

    const taskOpen = tasks.filter((task) => !task.completed);
    const taskToday = tasks.filter((task) => task.date === today);
    const crucial = taskOpen.filter((task) => String(task.priority || "").toLowerCase() === "crucial");
    const projectFee = projects.reduce((sum, item) => sum + parseMoney(item.budget || ""), 0);
    const mrr = clients.reduce((sum, item) => sum + parseMoney(item.mrr || ""), 0);
    const replies = prospects.reduce((sum, item) => sum + (Number(item.replies) || 0), 0);
    const sent = prospects.reduce((sum, item) => sum + (Number(item.emailsSent) || 0), 0);
    const responseRate = sent > 0 ? ((replies / sent) * 100).toFixed(1) : "0.0";

    if (!q || q.includes("summary") || q.includes("overview") || q.includes("status")) {
      return [
        `Operating snapshot:`,
        `Schedule: ${taskOpen.length} open, ${taskToday.length} on ${today}, ${crucial.length} crucial.`,
        `Development: ${projects.length} projects, fee ${formatMoney(projectFee)}.`,
        `Sales: ${prospects.length} prospects, ${replies}/${sent} replies (${responseRate}%).`,
        `Subscriptions: ${clients.length} clients, MRR ${formatMoney(mrr)}.`,
      ].join("\n");
    }

    if (q.includes("focus") || q.includes("priority") || q.includes("crucial")) {
      if (!crucial.length) return "No crucial tasks are currently open. Next best move: prioritize highest-fee project deliverable.";
      const top = crucial
        .slice(0, 5)
        .map((task, index) => `${index + 1}. ${task.title || "Untitled task"}${task.startTime ? ` (${task.startTime})` : ""}`)
        .join("\n");
      return `Top crucial focus queue:\n${top}`;
    }

    if (q.includes("sales") || q.includes("prospect") || q.includes("outreach")) {
      const hot = prospects
        .slice()
        .sort((a, b) => (Number(b.replies) || 0) - (Number(a.replies) || 0))
        .slice(0, 5)
        .map((p, index) => `${index + 1}. ${p.prospect || "Unnamed"} • replies ${p.replies || 0}`)
        .join("\n");
      return `Sales pulse: ${prospects.length} prospects, response rate ${responseRate}%.\n${hot || "No ranked prospects yet."}`;
    }

    if (q.includes("development") || q.includes("project") || q.includes("fee")) {
      const inProgress = projects.filter((p) => p.status === "in_progress").length;
      const review = projects.filter((p) => p.status === "review").length;
      return `Development pulse: ${projects.length} total • ${inProgress} in progress • ${review} in review • fee ${formatMoney(projectFee)}.`;
    }

    if (q.includes("mrr") || q.includes("subscription") || q.includes("retainer")) {
      const active = clients.filter((c) => c.status === "active").length;
      return `Subscription pulse: ${clients.length} clients • ${active} active • MRR ${formatMoney(mrr)}.`;
    }

    const terms = q.split(/\s+/).filter(Boolean);
    const matches = searchableItems
      .filter((item) => terms.every((term) => `${item.title} ${item.subtitle} ${item.kind}`.toLowerCase().includes(term)))
      .slice(0, 6);
    if (matches.length) {
      return `Found ${matches.length} related entries:\n${matches
        .map((item, index) => `${index + 1}. ${item.title} (${item.kind})`)
        .join("\n")}`;
    }

    return "No direct match found yet. Ask for summary, focus queue, sales pulse, development fee, or MRR snapshot.";
  };

  const sendOraclePrompt = (prompt: string) => {
    if (!prompt.trim()) return;
    triggerHaptic([8, 20, 12]);
    setTimeout(() => {
      const userMessage: OracleMessage = { id: `user-${Date.now()}`, role: "user", text: prompt.trim() };
      const assistantMessage: OracleMessage = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant",
        text: buildOracleReply(prompt.trim()),
      };
      setOracleMessages((prev) => [...prev, userMessage, assistantMessage]);
      setOracleInput("");
    }, 0);
  };

  const submitOraclePrompt = () => {
    sendOraclePrompt(oracleInput);
  };

  const oracleStats = useMemo(() => {
    const fromStorage = <T,>(key: string): T[] => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const tasks = fromStorage<Array<{ completed?: boolean }>>("delphi_my_work_tasks_v3").filter((task) => !task.completed).length;
    const prospects = fromStorage<Array<{ id: number }>>("delphi_sales_outreach_v2").length;
    const projects = fromStorage<Array<{ id: number }>>("delphi_development_projects_v2").length;
    const mrr = fromStorage<Array<{ mrr?: string }>>("delphi_subscriptions_clients_v2").reduce(
      (sum, item) => sum + parseMoney(item.mrr || ""),
      0,
    );

    return { tasks, prospects, projects, mrr };
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const start = performance.now();
    const duration = 680;
    let raf = 0;

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setOraclePulseStats({
        tasks: Math.round(oracleStats.tasks * eased),
        prospects: Math.round(oracleStats.prospects * eased),
        projects: Math.round(oracleStats.projects * eased),
        mrr: Math.round(oracleStats.mrr * eased),
      });
      if (t < 1) raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [isSearchOpen, oracleStats]);

  const renderNavItems = (items: typeof mainItems) =>
    items.map((item) => (
      <TooltipProvider key={item.title} delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink to={item.url} end={item.url === "/"} className="outline-none">
              {({ isActive }) => (
                <div
                  className={`group relative flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-xl transition-all duration-300 focus-visible:outline-none ${
                    isActive
                      ? "border-transparent bg-[linear-gradient(180deg,hsl(199_100%_72%/.3),hsl(214_95%_62%/.22))] text-[hsl(206_100%_96%)] shadow-[0_0_16px_hsl(199_100%_72%/.28)] dark:border-transparent dark:bg-[linear-gradient(180deg,hsl(197_100%_72%/.28),hsl(214_95%_62%/.2))] dark:text-white dark:shadow-[0_0_18px_hsl(193_100%_72%/.34)] dark:hover:scale-[1.06]"
                      : "border-white/40 bg-[linear-gradient(180deg,hsl(0_0%_100%/.42),hsl(0_0%_100%/.24))] text-foreground/80 hover:border-[hsl(202_85%_62%/.62)] hover:bg-[linear-gradient(180deg,hsl(197_100%_72%/.24),hsl(214_95%_62%/.18))] hover:text-[hsl(206_100%_38%)] hover:shadow-[0_0_18px_hsl(199_100%_72%/.35)] dark:border-white/15 dark:bg-[linear-gradient(180deg,hsl(220_31%_20%/.7),hsl(221_34%_15%/.58))] dark:text-white/90 dark:hover:border-[hsl(202_75%_66%/.62)] dark:hover:bg-[linear-gradient(180deg,hsl(197_100%_72%/.2),hsl(214_95%_62%/.18))] dark:hover:text-white dark:hover:shadow-[0_0_16px_hsl(199_100%_72%/.28)] dark:hover:scale-[1.04]"
                  }`}
                >
                  <item.icon className="h-4.5 w-4.5" />
                </div>
              )}
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right" className={dockTooltipClass}>
            <p>{item.title}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ));

  const renderTopDockItems = (items: typeof mainItems) =>
    items.map((item) => (
      <TooltipProvider key={item.title} delayDuration={80}>
        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink to={item.url} end={item.url === "/"} className="outline-none">
              {({ isActive }) => (
                <div
                  className={`group relative flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-xl transition-all duration-300 ${
                    isActive
                      ? "border-[hsl(199_86%_62%/.52)] bg-[linear-gradient(180deg,hsl(0_0%_100%/.84),hsl(195_100%_92%/.62))] text-[hsl(210_58%_34%)] shadow-[inset_0_1px_0_hsl(0_0%_100%/.88),0_0_0_1px_hsl(199_95%_72%/.26),0_0_20px_hsl(199_100%_72%/.22)] dark:border-transparent dark:bg-[linear-gradient(180deg,hsl(199_100%_72%/.3),hsl(214_95%_62%/.22))] dark:text-white dark:shadow-[0_0_18px_hsl(193_100%_72%/.34)]"
                      : "border-white/35 bg-[linear-gradient(180deg,hsl(0_0%_100%/.4),hsl(0_0%_100%/.2))] text-foreground/80 hover:border-[hsl(202_85%_62%/.62)] hover:bg-[linear-gradient(180deg,hsl(197_100%_72%/.24),hsl(214_95%_62%/.18))] dark:border-white/15 dark:bg-[linear-gradient(180deg,hsl(220_31%_20%/.72),hsl(221_34%_15%/.58))] dark:text-white/90 dark:hover:border-[hsl(202_75%_66%/.62)] dark:hover:bg-[linear-gradient(180deg,hsl(197_100%_72%/.2),hsl(214_95%_62%/.18))]"
                  }`}
                >
                  <item.icon className="h-4.5 w-4.5" />
                </div>
              )}
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="bottom" className={dockTooltipClass}>
            <p>{item.title}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ));

  const verticalPositionClass = position === "right" ? "right-4 top-4 bottom-4" : "left-4 top-4 bottom-4";
  const primaryItems = mainItems;
  const adminItems = bottomItems;

  return (
    <>
      {position === "top-dock" && (
        <>
          <div
            className="fixed inset-x-0 top-0 z-50 h-4"
            onMouseEnter={() => setTopDockOpen(true)}
            aria-hidden
          />
          <div
            className="pointer-events-none fixed left-1/2 top-2 z-40 h-16 w-[64vw] -translate-x-1/2 rounded-full blur-2xl transition-[opacity,filter] duration-150"
            style={{
              opacity: Math.min(1, 0.42 + topDockGlow.intensity * 0.62),
              filter: `blur(${22 + topDockGlow.intensity * 20}px) saturate(${1 + topDockGlow.intensity * 0.32})`,
              background: `radial-gradient(ellipse at ${topDockGlow.x}% ${topDockGlow.y}%, hsl(222 92% 82% / ${0.28 + topDockGlow.intensity * 0.36}) 0%, hsl(278 76% 84% / ${0.18 + topDockGlow.intensity * 0.24}) 34%, transparent 72%)`,
            }}
            aria-hidden
          />
          <div
            className={`fixed left-1/2 top-0 z-50 w-auto -translate-x-1/2 transition-transform duration-200 ${
              topDockOpen ? "translate-y-0" : "-translate-y-[84%]"
            }`}
            ref={topDockRef}
            onMouseEnter={() => setTopDockOpen(true)}
            onMouseLeave={() => setTopDockOpen(false)}
          >
            <div className="top-dock-bezel-shape relative min-w-[min(420px,92vw)] border border-t-0 border-[var(--glass-stroke)] bg-[linear-gradient(180deg,hsl(220_28%_100%/.14),hsl(220_28%_100%/.05)),linear-gradient(145deg,hsl(205_100%_72%/.08),transparent_40%,hsl(264_88%_79%/.08))] px-8 pb-2.5 pt-2.5 shadow-[var(--glass-shadow)] backdrop-blur-[28px]">
              <div className="pointer-events-none absolute left-0 right-0 top-0 h-[1px] bg-[linear-gradient(90deg,transparent,hsl(0_0%_100%/.9),transparent)] dark:bg-[linear-gradient(90deg,transparent,hsl(195_100%_82%/.45),transparent)]" />
              <div className="flex items-center justify-center gap-4">
                <div className="flex items-center gap-2.5">{renderTopDockItems(primaryItems)}</div>
                <div className="h-7 w-px mx-1 bg-[linear-gradient(180deg,hsl(233_30%_82%/.08),hsl(234_34%_76%/.42),hsl(271_40%_80%/.12))] dark:bg-white/16" />
                <div className="flex items-center gap-2.5">{renderTopDockItems(p3Items)}</div>
                <div className="h-7 w-px mx-1 bg-[linear-gradient(180deg,hsl(233_30%_82%/.08),hsl(234_34%_76%/.42),hsl(271_40%_80%/.12))] dark:bg-white/16" />
                <div className="flex items-center gap-2.5">
                  {renderTopDockItems(adminItems)}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {position !== "top-dock" && (
    <div className={`fixed z-50 w-[92px] ${verticalPositionClass}`}>
      <div
        className="pointer-events-none absolute inset-0 -z-10 rounded-[34px] blur-2xl transition-[opacity,filter] duration-150"
        style={{
          opacity: Math.min(1, 0.24 + sideDockGlow.intensity * 0.68),
          filter: `blur(${18 + sideDockGlow.intensity * 20}px) saturate(${1 + sideDockGlow.intensity * 0.4})`,
          background: `radial-gradient(ellipse at ${sideDockGlow.x}% ${sideDockGlow.y}%, hsl(222 92% 82% / ${0.22 + sideDockGlow.intensity * 0.34}) 0%, hsl(278 76% 84% / ${0.12 + sideDockGlow.intensity * 0.22}) 36%, transparent 74%)`,
        }}
        aria-hidden
      />
      <aside
        className="relative flex h-full flex-col items-center rounded-[34px] border border-[var(--glass-stroke)] bg-[linear-gradient(180deg,hsl(220_28%_100%/.12),hsl(220_28%_100%/.05)),linear-gradient(160deg,hsl(205_100%_72%/.08),transparent_40%,hsl(264_88%_79%/.08))] px-3 py-4 shadow-[var(--glass-shadow)] backdrop-blur-[28px]"
        style={{
          boxShadow: `0 30px 72px rgba(1, 6, 19, 0.42), 0 14px 34px rgba(4, 10, 26, 0.24), inset 0 1px 0 rgba(255,255,255,0.16), 0 0 ${18 + sideDockGlow.intensity * 18}px hsl(205 100% 72% / ${0.08 + sideDockGlow.intensity * 0.18}), 0 0 ${42 + sideDockGlow.intensity * 26}px hsl(264 88% 79% / ${0.06 + sideDockGlow.intensity * 0.14})`,
        }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-[34px] border border-white/10" />
        <div className="relative z-10 flex h-full w-full flex-col items-center">
          <div className="flex w-full flex-col items-center gap-3">{renderNavItems(primaryItems)}</div>

          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-px w-12 -translate-x-1/2 bg-gradient-to-r from-transparent via-[hsl(272_70%_82%/.34)] to-transparent" />
          <div className="absolute left-1/2 top-1/2 z-10 flex w-full -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
            {renderNavItems(p3Items)}
          </div>

          <div className="mt-auto flex w-full flex-col items-center gap-3">
            {renderNavItems(adminItems)}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsSearchOpen(true)}
                    className="gamify-tap mt-2 flex h-14 w-14 items-center justify-center rounded-[22px] border border-[var(--glass-stroke-soft)] bg-[linear-gradient(180deg,hsl(220_28%_100%/.14),hsl(220_28%_100%/.06))] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_18px_34px_-24px_rgba(2,8,23,0.24),0_0_22px_rgba(124,172,255,0.12)] backdrop-blur-2xl transition-all duration-300 hover:scale-105 hover:border-[hsl(205_100%_72%/.32)]"
                    aria-label="Search Delphi"
                    onMouseDown={() => triggerHaptic(7)}
                  >
                    <div className="flex flex-col items-center">
                      <div className="h-8 w-8 rounded-full bg-[radial-gradient(circle_at_35%_30%,hsl(193_92%_84%),hsl(227_92%_76%)_52%,hsl(289_74%_78%))] shadow-[inset_0_1px_1px_hsl(0_0%_100%/.7),0_0_18px_hsl(274_76%_84%/.32)]" />
                      <div className="mt-[2px] h-[4px] w-7 rounded-full bg-[linear-gradient(180deg,hsl(202_90%_84%/.92),hsl(274_70%_78%/.82))] shadow-[inset_0_1px_0_hsl(0_0%_100%/.6),0_4px_8px_-6px_hsl(274_76%_84%/.38)]" />
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className={dockTooltipClass}>
                  <p>Search Delphi</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </aside>
      </div>
      )}

      <Dialog
        open={isSearchOpen}
        onOpenChange={(open) => {
          setIsSearchOpen(open);
          if (!open) {
            setOracleInput("");
          }
        }}
      >
        <DialogContent className="max-w-2xl overflow-hidden border border-[var(--glass-stroke)] bg-[linear-gradient(180deg,hsl(220_28%_100%/.16),hsl(220_28%_100%/.07)),linear-gradient(145deg,hsl(205_100%_72%/.08),transparent_40%,hsl(264_88%_79%/.08))] p-5 shadow-[var(--glass-shadow)] backdrop-blur-[30px]">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            aria-hidden
            style={{
              background:
                "radial-gradient(circle at 18% 16%, hsl(193 100% 74% / 0.2) 0%, transparent 38%), radial-gradient(circle at 82% 86%, hsl(214 95% 62% / 0.14) 0%, transparent 42%)",
            }}
          />
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tight">Oracle Command</DialogTitle>
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Search + Chat • Cmd/Ctrl + S</p>
          </DialogHeader>
          <div className="oracle-search relative overflow-hidden rounded-2xl border border-white/45 bg-white/45 p-4 shadow-[inset_0_1px_0_hsl(0_0%_100%/.85)] backdrop-blur-xl dark:border-white/15 dark:bg-white/6">
            <div className="oracle-fog" />
            <div className="oracle-sphere-wrap">
              <div className="oracle-base" />
              <div className="oracle-sphere">
                <div className="oracle-core" />
                <div className="oracle-gloss" />
                <div className="oracle-mesh" />
                <div className="oracle-pulse" />
              </div>
            </div>
            <p className="mt-1 text-center text-xs tracking-[0.12em] text-muted-foreground">THE ORACLE IS LISTENING</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-xl border border-white/45 bg-white/55 px-3 py-2 text-center shadow-[inset_0_1px_0_hsl(0_0%_100%/.86)] backdrop-blur-xl dark:border-white/15 dark:bg-white/6">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Open Tasks</p>
              <p className="text-lg font-semibold text-foreground dark:text-white">{oraclePulseStats.tasks}</p>
            </div>
            <div className="rounded-xl border border-white/45 bg-white/55 px-3 py-2 text-center shadow-[inset_0_1px_0_hsl(0_0%_100%/.86)] backdrop-blur-xl dark:border-white/15 dark:bg-white/6">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Prospects</p>
              <p className="text-lg font-semibold text-foreground dark:text-white">{oraclePulseStats.prospects}</p>
            </div>
            <div className="rounded-xl border border-white/45 bg-white/55 px-3 py-2 text-center shadow-[inset_0_1px_0_hsl(0_0%_100%/.86)] backdrop-blur-xl dark:border-white/15 dark:bg-white/6">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Projects</p>
              <p className="text-lg font-semibold text-foreground dark:text-white">{oraclePulseStats.projects}</p>
            </div>
            <div className="rounded-xl border border-white/45 bg-white/55 px-3 py-2 text-center shadow-[inset_0_1px_0_hsl(0_0%_100%/.86)] backdrop-blur-xl dark:border-white/15 dark:bg-white/6">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">MRR</p>
              <p className="text-lg font-semibold text-foreground dark:text-white">{formatMoney(oraclePulseStats.mrr)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {oracleQuickPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendOraclePrompt(prompt)}
                className="gamify-tap rounded-full border border-white/45 bg-white/58 px-3 py-1 text-xs font-semibold text-foreground/85 transition-all hover:-translate-y-[1px] hover:border-cyan-300/70 hover:bg-[linear-gradient(180deg,hsl(197_100%_88%/.4),hsl(214_95%_86%/.3))] hover:shadow-[0_0_14px_hsl(195_100%_74%/.24)] dark:border-white/16 dark:bg-white/8 dark:text-white/90 dark:hover:border-cyan-300/32 dark:hover:bg-cyan-300/10"
              >
                {prompt}
              </button>
            ))}
          </div>
          <div className="max-h-[44vh] space-y-2 overflow-y-auto rounded-2xl border border-white/40 bg-white/48 p-3 backdrop-blur-xl dark:border-white/12 dark:bg-white/6">
            {oracleMessages.map((message) => (
              <div
                key={message.id}
                className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  message.role === "assistant"
                    ? "border border-cyan-200/50 bg-[linear-gradient(180deg,hsl(193_100%_90%/.46),hsl(214_95%_86%/.26))] text-[hsl(214_58%_20%)] dark:border-cyan-300/25 dark:bg-[linear-gradient(180deg,hsl(198_100%_74%/.16),hsl(214_95%_62%/.1))] dark:text-cyan-50"
                    : "border border-white/55 bg-white/75 text-foreground dark:border-white/20 dark:bg-white/10 dark:text-white"
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/45 bg-white/55 p-2 shadow-[inset_0_1px_0_hsl(0_0%_100%/.85)] backdrop-blur-xl dark:border-white/15 dark:bg-white/6">
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={oracleInput}
                onChange={(event) => setOracleInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitOraclePrompt();
                  }
                }}
                placeholder="Ask the Oracle to search, think, and analyze..."
                className="h-11 border-transparent bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <button
                onClick={submitOraclePrompt}
                className="gamify-tap flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/45 bg-[linear-gradient(180deg,hsl(197_100%_70%/.42),hsl(214_95%_62%/.3))] text-[hsl(213_54%_28%)] transition-colors hover:border-cyan-300/72 hover:text-[hsl(207_86%_20%)] hover:shadow-[0_0_16px_hsl(195_100%_74%/.3)] dark:text-cyan-50"
                aria-label="Send oracle prompt"
                onMouseDown={() => triggerHaptic([10, 22, 10])}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-[24vh] space-y-2 overflow-y-auto pr-1">
            {filteredResults.slice(0, 8).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  triggerHaptic(8);
                  navigate(item.url);
                  setIsSearchOpen(false);
                  setOracleInput("");
                }}
                className="gamify-card w-full rounded-xl border border-white/40 bg-white/52 px-4 py-3 text-left shadow-[inset_0_1px_0_hsl(0_0%_100%/.7)] backdrop-blur-xl transition-all hover:-translate-y-[1px] hover:border-cyan-300/70 hover:bg-[linear-gradient(180deg,hsl(197_100%_88%/.4),hsl(214_95%_86%/.3))] hover:shadow-[0_0_18px_hsl(195_100%_74%/.28)] dark:border-white/12 dark:bg-white/6 dark:hover:bg-[linear-gradient(180deg,hsl(197_100%_72%/.12),hsl(214_95%_62%/.12))] dark:hover:border-cyan-300/40 dark:hover:shadow-[0_0_18px_hsl(195_100%_74%/.24)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">{item.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{item.subtitle}</p>
                  </div>
                  <Badge variant="outline">{item.kind}</Badge>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
