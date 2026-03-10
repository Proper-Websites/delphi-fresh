import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Clock, Command, GitBranch, LayoutGrid, List, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { TaskModal } from "@/components/TaskModal";
import CalendarPage from "@/pages/Calendar";
import { useLocalStorageState } from "@/hooks/use-local-storage";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnimatedTitle } from "@/components/AnimatedTitle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { logActivity } from "@/lib/activity-log";
import { useSearchParams } from "react-router-dom";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getSupabaseErrorMessage } from "@/lib/supabase-errors";
import { fetchMyWorkTasks, mapMyWorkRowToRecord, replaceMyWorkTasks } from "@/lib/supabase-my-work";
import { applyLinkedWriteback } from "@/lib/linked-writeback";
import { runLinkedScheduleSync } from "@/lib/linked-schedule-engine";
import { syncDatesIntoSchedule } from "@/lib/date-funnel-sync";
import { LinkedSyncStatusLine } from "@/components/LinkedSyncStatusLine";
import { cn } from "@/lib/utils";
import { promptForNextStep } from "@/lib/next-step";
import { groupDateOnlyTasksByDepartment, isDateOnlyTask, type DateOnlyDepartmentDisplayItem } from "@/lib/task-grouping";

interface WorkTask {
  id: number;
  title: string;
  project: string;
  priority: "crucial" | "high" | "medium" | "low";
  required?: boolean;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: number;
  completed: boolean;
  department: string;
  linked?: boolean;
  linkedSource?: "development" | "sales" | "subscriptions";
  linkedKey?: string;
  linkedRefId?: number | null;
  linkedRefSubId?: number | null;
}

interface EditableTask {
  id: string;
  name: string;
  department: string;
  priority: "crucial" | "high" | "medium" | "low";
  status: "not-started" | "in-progress" | "complete";
  required: boolean;
  date: string;
  startTime: string;
  endTime: string;
}

type ScheduleMode = "work" | "calendar";
type MyWorkView = "command" | "list" | "cards" | "bubble";

const TIMEZONE_KEY = "delphi_time_zone";
const TIME_FORMAT_KEY = "delphi_time_format";

const initialTasks: WorkTask[] = [];
const pickerTooltipClass =
  "border border-[hsl(236_28%_86%/.82)] bg-[linear-gradient(180deg,hsl(0_0%_100%/.86),hsl(236_48%_96%/.62))] text-foreground shadow-[0_22px_36px_-26px_hsl(248_30%_46%/.2)] backdrop-blur-xl font-semibold dark:!border-[hsl(218_31%_33%/.92)] dark:!bg-[linear-gradient(180deg,hsl(221_42%_18%/.96),hsl(222_48%_12%/.96))] dark:!text-white";

const hasAssignedTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

const toMinutes = (time: string, fallback = Number.POSITIVE_INFINITY) => {
  if (!hasAssignedTime(time)) return fallback;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

const getStoredTimeZone = () => localStorage.getItem(TIMEZONE_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const getStoredTimeFormat = () => {
  const saved = localStorage.getItem(TIME_FORMAT_KEY);
  if (saved === "12h" || saved === "24h") return saved;
  const hourCycle = Intl.DateTimeFormat().resolvedOptions().hourCycle;
  return hourCycle === "h23" || hourCycle === "h24" ? "24h" : "12h";
};

const getTodayDateKey = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const getDayGreeting = (timeZone: string) => {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
  if (hour < 5) return "Good Night";
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  if (hour < 21) return "Good Evening";
  return "Good Night";
};

const isValidDateKey = (value: string | undefined | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
};

const shiftDateKey = (dateKey: string, offsetDays: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays, 12, 0, 0));
  return shifted.toISOString().split("T")[0];
};

const getDateLabel = (date: string, timeZone: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const safeDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return safeDate.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
};

const formatClock = (time: string, format: "12h" | "24h") => {
  if (!hasAssignedTime(time)) return "No time";
  if (format === "24h") return time;
  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
  const period = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${period}`;
};

const hasTimedWindow = (task: Pick<WorkTask, "startTime" | "endTime">) => hasAssignedTime(task.startTime) && hasAssignedTime(task.endTime);
const formatTaskWindow = (task: Pick<WorkTask, "startTime" | "endTime">, format: "12h" | "24h") =>
  hasTimedWindow(task) ? `${formatClock(task.startTime, format)}-${formatClock(task.endTime, format)}` : "No time assigned";

const getPriorityLabel = (priority: WorkTask["priority"]) => priority.toUpperCase();
const getCoreMatterBadgeClass = () =>
  "border border-fuchsia-300/70 bg-fuchsia-200/45 text-fuchsia-900 shadow-[inset_0_1px_0_hsl(0_0%_100%/.46)] dark:border-fuchsia-300/38 dark:bg-fuchsia-300/18 dark:text-fuchsia-100";
const myWorkViews: MyWorkView[] = ["command", "list", "cards", "bubble"];
const resolveScheduleMode = (value: string | null): ScheduleMode => (value === "calendar" ? "calendar" : "work");
const resolveMyWorkView = (value: string | null): MyWorkView => {
  if (!value || value === "calendar") return "command";
  return myWorkViews.includes(value as MyWorkView) ? (value as MyWorkView) : "command";
};

export default function MyWork() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(() => resolveScheduleMode(searchParams.get("tab")));
  const [activeView, setActiveView] = useState<MyWorkView>(() => resolveMyWorkView(searchParams.get("tab")));
  const [timeZone, setTimeZone] = useState(getStoredTimeZone);
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">(getStoredTimeFormat);
  const [taskList, setTaskList] = useLocalStorageState<WorkTask[]>("delphi_my_work_tasks_v3", initialTasks);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<EditableTask | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ taskId: number; position: "before" | "after" } | null>(null);
  const [focusTaskId, setFocusTaskId] = useState<number | null>(null);
  const [listSize, setListSize] = useState<1 | 2 | 3>(2);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateKey(getStoredTimeZone()));
  const [scaleCards, setScaleCards] = useState(false);
  const [cardLayout, setCardLayout] = useState<"grid" | "flow">("grid");
  const [cardScaleBy, setCardScaleBy] = useState<"timing" | "difficulty">("timing");
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [completedBurstTaskId, setCompletedBurstTaskId] = useState<number | null>(null);
  const [todayPulseCollapsed, setTodayPulseCollapsed] = useState(true);
  const [nextCollapsed, setNextCollapsed] = useState(false);
  const [laterCollapsed, setLaterCollapsed] = useState(true);
  const [overdueCollapsed, setOverdueCollapsed] = useState(true);
  const [unscheduledCollapsed, setUnscheduledCollapsed] = useState(true);
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<string[]>([]);
  const lastDragAtRef = useRef(0);
  const lastHoverHapticAtRef = useRef(0);
  const hasLoadedFromSupabase = useRef(false);
  const suppressNextSync = useRef(false);
  const completionBurstTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const hasLegacyCritical = taskList.some((task) => (task as { priority: string }).priority === "critical");
    if (!hasLegacyCritical) return;
    setTaskList(
      taskList.map((task) =>
        (task as { priority: string }).priority === "critical"
          ? ({ ...task, priority: "crucial" } as WorkTask)
          : task
      )
    );
  }, [taskList, setTaskList]);

  const filteredTasks = useMemo(
    () =>
      taskList.filter((task) => {
        if (statusFilter === "active") return !task.completed;
        if (statusFilter === "completed") return task.completed;
        return true;
      }),
    [taskList, statusFilter]
  );

  const scheduledTasks = useMemo(
    () => taskList.filter((task) => isValidDateKey(task.date)),
    [taskList]
  );

  const visibleTasks = useMemo(
    () => filteredTasks.filter((task) => isValidDateKey(task.date)),
    [filteredTasks]
  );

  const tasksForDay = visibleTasks.filter((task) => task.date === selectedDate);
  const sortedDayTasks = tasksForDay
    .slice()
    .sort((a, b) => {
      const aTimed = hasTimedWindow(a);
      const bTimed = hasTimedWindow(b);
      if (aTimed !== bTimed) return aTimed ? -1 : 1;
      if (aTimed && bTimed) return toMinutes(a.startTime) - toMinutes(b.startTime);
      return a.title.localeCompare(b.title);
    });

  const priorityRank: Record<WorkTask["priority"], number> = {
    crucial: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  const commandFocusQueue = useMemo(
    () =>
      filteredTasks
        .filter((task) => isValidDateKey(task.date))
        .filter((task) => !task.completed)
        .slice()
        .sort((a, b) => {
          if (priorityRank[b.priority] !== priorityRank[a.priority]) {
            return priorityRank[b.priority] - priorityRank[a.priority];
          }
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          const aTimed = hasTimedWindow(a);
          const bTimed = hasTimedWindow(b);
          if (aTimed !== bTimed) return aTimed ? -1 : 1;
          if (aTimed && bTimed) return toMinutes(a.startTime) - toMinutes(b.startTime);
          return a.title.localeCompare(b.title);
        })
        .slice(0, 8),
    [filteredTasks, priorityRank]
  );

  const dayStrip = useMemo(() => {
    return Array.from({ length: 11 }, (_, index) => shiftDateKey(selectedDate, index - 5));
  }, [selectedDate]);

  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const todayWritten = useMemo(
    () => {
      const now = new Date();
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "long",
      }).format(now);
      const datePart = new Intl.DateTimeFormat("en-US", {
        timeZone,
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(now);
      return `${weekday} - ${datePart}`;
    },
    [timeZone]
  );
  const completedToday = sortedDayTasks.filter((task) => task.completed).length;
  const activeToday = sortedDayTasks.filter((task) => !task.completed).length;
  const upcomingToday = sortedDayTasks.filter((task) => !task.completed && hasTimedWindow(task) && toMinutes(task.startTime) >= currentMinutes).length;
  const dayGreeting = getDayGreeting(timeZone);
  const nowTask =
    sortedDayTasks.find(
      (task) => !task.completed && hasTimedWindow(task) && toMinutes(task.startTime) <= currentMinutes && toMinutes(task.endTime) >= currentMinutes
    ) ?? null;
  const nextTasks = sortedDayTasks.filter(
    (task) =>
      !task.completed &&
      hasTimedWindow(task) &&
      toMinutes(task.startTime) > currentMinutes
  );
  const laterTasks = useMemo(
    () =>
      visibleTasks
        .filter((task) => !task.completed && task.date > selectedDate)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.startTime) - toMinutes(b.startTime))
        .slice(0, 30),
    [visibleTasks, selectedDate]
  );
  const laterTaskGroups = useMemo(() => {
    const groups = new Map<string, WorkTask[]>();
    laterTasks.forEach((task) => {
      const bucket = groups.get(task.date) ?? [];
      bucket.push(task);
      groups.set(task.date, bucket);
    });
    return Array.from(groups.entries()).map(([date, tasks]) => [date, groupDateOnlyTasksByDepartment(tasks)] as const);
  }, [laterTasks]);
  const requiredTasks = useMemo(
    () =>
      filteredTasks
        .filter((task) => task.required)
        .slice()
        .sort((a, b) => {
          if (priorityRank[b.priority] !== priorityRank[a.priority]) {
            return priorityRank[b.priority] - priorityRank[a.priority];
          }
          const aHasDate = isValidDateKey(a.date);
          const bHasDate = isValidDateKey(b.date);
          if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          const aTimed = hasTimedWindow(a);
          const bTimed = hasTimedWindow(b);
          if (aTimed !== bTimed) return aTimed ? -1 : 1;
          if (aTimed && bTimed) return toMinutes(a.startTime) - toMinutes(b.startTime);
          return a.title.localeCompare(b.title);
        })
        .slice(0, 6),
    [filteredTasks, priorityRank]
  );
  const overdueTasks = useMemo(
    () =>
      visibleTasks
        .filter((task) => !task.completed && task.date < selectedDate)
        .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)),
    [visibleTasks, selectedDate]
  );
  const overdueDisplayItems = useMemo(() => groupDateOnlyTasksByDepartment(overdueTasks), [overdueTasks]);
  const unscheduledTasks = useMemo(
    () =>
      filteredTasks
        .filter((task) => !task.completed && !isValidDateKey(task.date))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [filteredTasks]
  );

  const toggleTaskGroup = (key: string) => {
    setExpandedTaskGroups((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  useEffect(() => {
    const tab = searchParams.get("tab");
    setScheduleMode(resolveScheduleMode(tab));
    setActiveView(resolveMyWorkView(tab));
  }, [searchParams]);

  useEffect(() => {
    if (activeView === "cards") {
      setScaleCards(false);
    }
  }, [activeView]);

  useEffect(() => {
    void syncDatesIntoSchedule();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const loadFromSupabase = async () => {
      setSyncState("syncing");
      setSyncMessage("Syncing tasks...");
      try {
        const rows = await fetchMyWorkTasks();
        if (cancelled) return;
        if (rows.length > 0) {
          suppressNextSync.current = true;
          setTaskList(rows.map(mapMyWorkRowToRecord));
        } else {
          await replaceMyWorkTasks(taskList);
        }
        hasLoadedFromSupabase.current = true;
        setSyncState("idle");
        setSyncMessage("Synced");
      } catch (error) {
        if (cancelled) return;
        hasLoadedFromSupabase.current = true;
        setSyncState("error");
        setSyncMessage(getSupabaseErrorMessage(error));
      }
    };
    void loadFromSupabase();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !hasLoadedFromSupabase.current) return;
    if (suppressNextSync.current) {
      suppressNextSync.current = false;
      return;
    }
    let cancelled = false;
    const persist = async () => {
      setSyncState("syncing");
      try {
        await replaceMyWorkTasks(taskList);
        if (!cancelled) {
          setSyncState("idle");
          setSyncMessage("Synced");
        }
      } catch (error) {
        if (!cancelled) {
          setSyncState("error");
          setSyncMessage(getSupabaseErrorMessage(error));
        }
      }
    };
    void persist();
    return () => {
      cancelled = true;
    };
  }, [taskList]);

  useEffect(() => {
    if (searchParams.get("add") !== "task") return;
    setSelectedTask(null);
    setIsModalOpen(true);
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      updated.delete("add");
      return updated;
    });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const loadTasksFromStorage = () => {
      try {
        const raw = localStorage.getItem("delphi_my_work_tasks_v3");
        const parsed = raw ? JSON.parse(raw) : [];
        setTaskList(Array.isArray(parsed) ? parsed : []);
      } catch {
        // Ignore malformed task snapshots.
      }
    };

    const onTimeZoneChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.length > 0) setTimeZone(detail);
    };
    const onTimeFormatChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "12h" || detail === "24h") setTimeFormat(detail);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === TIMEZONE_KEY && event.newValue) setTimeZone(event.newValue);
      if (event.key === TIME_FORMAT_KEY && (event.newValue === "12h" || event.newValue === "24h")) setTimeFormat(event.newValue);
      if (event.key === "delphi_my_work_tasks_v3") loadTasksFromStorage();
    };
    const onLinkedScheduleSync = () => loadTasksFromStorage();
    window.addEventListener("delphi-timezone-change", onTimeZoneChange as EventListener);
    window.addEventListener("delphi-timeformat-change", onTimeFormatChange as EventListener);
    window.addEventListener("delphi-linked-schedule-sync", onLinkedScheduleSync as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("delphi-timezone-change", onTimeZoneChange as EventListener);
      window.removeEventListener("delphi-timeformat-change", onTimeFormatChange as EventListener);
      window.removeEventListener("delphi-linked-schedule-sync", onLinkedScheduleSync as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [setTaskList]);

  const triggerHaptic = (ms = 10) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  };

  const triggerHoverHaptic = () => {
    const now = Date.now();
    if (now - lastHoverHapticAtRef.current < 110) return;
    lastHoverHapticAtRef.current = now;
    triggerHaptic(4);
  };

  const handleViewChange = (next: string) => {
    const nextView = resolveMyWorkView(next);
    setActiveView(nextView);
    setScheduleMode("work");
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      updated.set("tab", nextView);
      return updated;
    });
    triggerHaptic(6);
  };

  const handleScheduleModeChange = (nextMode: ScheduleMode) => {
    setScheduleMode(nextMode);
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      updated.set("tab", nextMode === "calendar" ? "calendar" : activeView);
      return updated;
    });
    triggerHaptic(8);
  };

  const toggleTask = (id: number) => {
    triggerHaptic(8);
    const target = taskList.find((task) => task.id === id);
    const willComplete = Boolean(target && !target.completed);
    const nextStepTitle = willComplete && target ? promptForNextStep(target.title) : null;
    setTaskList((prev) => {
      const next = prev.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task));
      if (!willComplete || !target || !nextStepTitle) return next;
      const completedIndex = next.findIndex((task) => task.id === id);
      const followUp: WorkTask = {
        id: Date.now() + Math.floor(Math.random() * 100000),
        title: nextStepTitle,
        project: target.project,
        priority: target.priority,
        required: false,
        date: "",
        startTime: "",
        endTime: "",
        durationMinutes: target.durationMinutes || 30,
        completed: false,
        department: target.department,
      };
      if (completedIndex === -1) return [...next, followUp];
      const updated = [...next];
      updated.splice(completedIndex + 1, 0, followUp);
      return updated;
    });
    if (willComplete) {
      setCompletedBurstTaskId(id);
      if (completionBurstTimeoutRef.current) window.clearTimeout(completionBurstTimeoutRef.current);
      completionBurstTimeoutRef.current = window.setTimeout(() => {
        setCompletedBurstTaskId((current) => (current === id ? null : current));
      }, 1200);
    }
    if (target) {
      logActivity({
        area: "my-work",
        action: target.completed ? "Marked Incomplete" : "Marked Complete",
        detail: target.title,
      });
      if (willComplete && nextStepTitle) {
        logActivity({
          area: "my-work",
          action: "Added Next Step",
          detail: nextStepTitle,
        });
      }
    }
  };

  const handleAddTask = () => {
    setSelectedTask(null);
    setIsModalOpen(true);
  };

  useEffect(() => {
    const onCommandNew = () => {
      setSelectedTask(null);
      setIsModalOpen(true);
    };
    window.addEventListener("delphi-command-new", onCommandNew as EventListener);
    return () => window.removeEventListener("delphi-command-new", onCommandNew as EventListener);
  }, []);

  useEffect(() => {
    return () => {
      if (completionBurstTimeoutRef.current) window.clearTimeout(completionBurstTimeoutRef.current);
    };
  }, []);

  const handleEditTask = (task: WorkTask) => {
    setSelectedTask({
      id: String(task.id),
      name: task.title,
      department: task.department,
      priority: task.priority,
      status: task.completed ? "complete" : "in-progress",
      required: Boolean(task.required),
      date: task.date,
      startTime: task.startTime,
      endTime: task.endTime,
    });
    setIsModalOpen(true);
  };

  const handleSaveTask = async (task: EditableTask) => {
    const durationMinutes = Math.max(15, toMinutes(task.endTime) - toMinutes(task.startTime));

    if (selectedTask) {
      const taskId = parseInt(task.id, 10);
      const previous = taskList.find((current) => current.id === taskId);
      if (previous?.linked && previous.linkedKey) {
        const writeback = await applyLinkedWriteback(previous.linkedKey, {
          date: task.date,
          startTime: task.startTime,
          endTime: task.endTime,
        });
        if (writeback.ok) {
          await runLinkedScheduleSync();
        }
      } else {
        setTaskList(
          taskList.map((current) =>
            current.id === taskId
              ? {
                  ...current,
                  title: task.name,
                  department: task.department,
                  priority: task.priority,
                  required: task.required,
                  date: task.date,
                  startTime: task.startTime,
                  endTime: task.endTime,
                  durationMinutes,
                  completed: task.status === "complete",
                }
              : current
          )
        );
      }
      logActivity({
        area: "my-work",
        action: "Updated Task",
        detail: previous ? `${previous.title} -> ${task.name}` : task.name,
      });
    } else {
      setTaskList([
        ...taskList,
        {
          id: Date.now(),
          title: task.name,
          project: "New Project",
          priority: task.priority,
          required: task.required,
          date: task.date,
          startTime: task.startTime,
          endTime: task.endTime,
          durationMinutes,
          completed: task.status === "complete",
          department: task.department,
        },
      ]);
      logActivity({
        area: "my-work",
        action: "Added Task",
        detail: task.name,
      });
    }
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  const handleDeleteTask = (id: number) => {
    triggerHaptic(12);
    const target = taskList.find((task) => task.id === id);
    setTaskList(taskList.filter((task) => task.id !== id));
    if (target) {
      logActivity({
        area: "my-work",
        action: "Deleted Task",
        detail: target.title,
      });
    }
  };

  const reorderByDrag = (sourceId: number, targetId: number, position: "before" | "after") => {
    if (sourceId === targetId) return;
    const sourceIndex = taskList.findIndex((task) => task.id === sourceId);
    const targetIndex = taskList.findIndex((task) => task.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const updated = [...taskList];
    const [moved] = updated.splice(sourceIndex, 1);
    let insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
    if (sourceIndex < insertIndex) insertIndex -= 1;
    updated.splice(insertIndex, 0, moved);
    triggerHaptic(16);
    setTaskList(updated);
  };

const getPriorityColor = (priority: WorkTask["priority"]) => {
  switch (priority) {
    case "crucial":
      return "border border-rose-300/70 bg-rose-200/55 text-rose-900 shadow-[inset_0_1px_0_hsl(0_0%_100%/.46)] dark:border-rose-300/38 dark:bg-rose-300/18 dark:text-rose-100";
    case "high":
      return "border border-amber-300/70 bg-amber-200/55 text-amber-900 shadow-[inset_0_1px_0_hsl(0_0%_100%/.46)] dark:border-amber-300/38 dark:bg-amber-300/18 dark:text-amber-100";
    case "medium":
      return "border border-sky-300/70 bg-sky-200/55 text-sky-900 shadow-[inset_0_1px_0_hsl(0_0%_100%/.46)] dark:border-sky-300/38 dark:bg-sky-300/18 dark:text-sky-100";
    case "low":
      return "border border-slate-300/70 bg-slate-200/60 text-slate-800 shadow-[inset_0_1px_0_hsl(0_0%_100%/.46)] dark:border-slate-300/34 dark:bg-slate-300/14 dark:text-slate-100";
      default:
        return "bg-muted text-foreground border-border";
    }
  };

  const listSizeClasses: Record<1 | 2 | 3, string> = {
    1: "p-4 text-base",
    2: "p-5 text-base min-h-[112px]",
    3: "p-8 text-lg min-h-[240px]",
  };

  const listTitleClasses: Record<1 | 2 | 3, string> = {
    1: "text-base",
    2: "text-xl",
    3: "text-3xl",
  };

  const listMetaClasses: Record<1 | 2 | 3, string> = {
    1: "text-sm",
    2: "text-sm",
    3: "text-lg",
  };

  const focusedTask = focusTaskId ? scheduledTasks.find((task) => task.id === focusTaskId) ?? null : null;

  const getCardSizeStyle = (task: WorkTask) => {
    if (!scaleCards) {
      return cardLayout === "flow"
        ? {
            minHeight: "clamp(280px, 46vh, 360px)",
            height: "clamp(280px, 46vh, 360px)",
            minWidth: "clamp(420px, 31vw, 560px)",
          }
        : { minHeight: "100%", height: "100%" };
    }

    if (cardScaleBy === "difficulty") {
      const difficultyHeight =
        task.priority === "crucial" ? 360 : task.priority === "high" ? 320 : task.priority === "medium" ? 240 : 170;
      const difficultyWidth =
        task.priority === "crucial" ? 460 : task.priority === "high" ? 420 : task.priority === "medium" ? 340 : 280;
      return cardLayout === "flow"
        ? { minHeight: `${difficultyHeight}px`, minWidth: `${difficultyWidth}px` }
        : { minHeight: `${difficultyHeight}px` };
    }

    const timingHeight = Math.max(150, Math.min(360, task.durationMinutes * 1.8));
    const timingWidth = Math.max(260, Math.min(460, 220 + task.durationMinutes * 1.2));
    return cardLayout === "flow"
      ? { minHeight: `${timingHeight}px`, minWidth: `${timingWidth}px` }
      : { minHeight: `${timingHeight}px` };
  };

  return (
    <div className="schedule-light-page relative h-[100vh] overflow-hidden">
      <div className="schedule-light-frame relative flex h-full flex-col gap-6 p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <AnimatedTitle text="Schedule" className="schedule-light-title" />
            <p className="schedule-light-subtitle mt-1">{todayWritten}</p>
            {isSupabaseConfigured && (syncState === "syncing" || syncState === "error") ? (
              <p className={`mt-1 text-xs ${syncState === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {syncState === "syncing" ? "Supabase syncing..." : syncMessage}
              </p>
            ) : null}
            <LinkedSyncStatusLine className="schedule-light-sync mt-1" />
            <div className="schedule-light-mode-toggle mt-6 inline-flex items-center gap-1.5 rounded-[24px] p-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleScheduleModeChange("work")}
                className={`schedule-light-mode-pill h-10 rounded-full px-5 text-sm font-semibold transition-all ${
                  scheduleMode === "work"
                    ? "schedule-light-pill-active"
                    : "schedule-light-pill"
                }`}
              >
                My Work
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleScheduleModeChange("calendar")}
                className={`schedule-light-mode-pill h-10 rounded-full px-5 text-sm font-semibold transition-all ${
                  scheduleMode === "calendar"
                    ? "schedule-light-pill-active"
                    : "schedule-light-pill"
                }`}
              >
                Calendar
              </Button>
            </div>
          </div>
          {scheduleMode === "work" && (
            <div className="schedule-light-header-actions flex max-w-[56rem] flex-wrap items-center justify-end gap-2">
              <div className="schedule-light-toolbar flex items-center rounded-full">
                <TooltipProvider delayDuration={80}>
                  <div className="schedule-light-top-controls flex items-center rounded-full">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant={activeView === "command" ? "secondary" : "ghost"} onClick={() => handleViewChange("command")} className="h-10 w-11 px-0" aria-label="Focus">
                          <Command className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className={pickerTooltipClass}>
                        <p>Focus</p>
                      </TooltipContent>
                    </Tooltip>
                    <span className="schedule-light-toolbar-divider" aria-hidden />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant={activeView === "list" ? "secondary" : "ghost"} onClick={() => handleViewChange("list")} className="h-10 w-11 px-0" aria-label="List">
                          <List className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className={pickerTooltipClass}>
                        <p>List</p>
                      </TooltipContent>
                    </Tooltip>
                    <span className="schedule-light-toolbar-divider" aria-hidden />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant={activeView === "cards" ? "secondary" : "ghost"} onClick={() => handleViewChange("cards")} className="h-10 w-11 px-0" aria-label="Cards">
                          <LayoutGrid className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className={pickerTooltipClass}>
                        <p>Cards</p>
                      </TooltipContent>
                    </Tooltip>
                    <span className="schedule-light-toolbar-divider" aria-hidden />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant={activeView === "bubble" ? "secondary" : "ghost"} onClick={() => handleViewChange("bubble")} className="h-10 w-11 px-0" aria-label="Bubble">
                          <GitBranch className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className={pickerTooltipClass}>
                        <p>Bubble</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleAddTask}
                      className="schedule-light-add schedule-light-add-icon h-11 w-14 rounded-full px-0"
                      aria-label="Add Task"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className={pickerTooltipClass}>
                    <p>Add Task</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
        </div>
        {scheduleMode === "work" ? (
          <Tabs value={activeView} onValueChange={handleViewChange} className="flex min-h-0 flex-1 flex-col gap-4">

          <TabsContent value="command" className="min-h-0 flex-1">
            <div className="relative grid h-full min-h-0 gap-4 xl:grid-cols-[1.5fr_1fr]">
              <Card className={cn("schedule-light-shell relative min-h-0 overflow-hidden border-0 bg-transparent p-6 shadow-none before:content-none hover:translate-y-0 hover:scale-100 hover:shadow-none", todayPulseCollapsed && "xl:col-span-2")}>
                <div className="schedule-light-filter-corner" role="tablist" aria-label="Task status filter">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === "all"}
                    onClick={() => setStatusFilter("all")}
                    className={cn("schedule-light-filter-chip", statusFilter === "all" && "schedule-light-filter-chip-active")}
                  >
                    <span className="schedule-light-filter-dot" aria-hidden />
                    <span className="sr-only">All</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === "active"}
                    onClick={() => setStatusFilter("active")}
                    className={cn("schedule-light-filter-chip", statusFilter === "active" && "schedule-light-filter-chip-active")}
                  >
                    <span className="schedule-light-filter-dot" aria-hidden />
                    <span className="sr-only">Active</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === "completed"}
                    onClick={() => setStatusFilter("completed")}
                    className={cn("schedule-light-filter-chip", statusFilter === "completed" && "schedule-light-filter-chip-active")}
                  >
                    <span className="schedule-light-filter-dot" aria-hidden />
                    <span className="sr-only">Completed</span>
                  </button>
                </div>
                <div className="schedule-light-shell-glow" aria-hidden />

                <div className="relative mb-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="schedule-light-greeting text-2xl font-semibold tracking-tight">{dayGreeting}</h2>
                    </div>
                  </div>

                </div>

                <div className="relative grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,35%)]">
                  <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
                    {overdueTasks.length > 0 && (
                      <div className="schedule-light-row rounded-[28px] p-4">
                        <button
                          type="button"
                          onClick={() => setOverdueCollapsed((prev) => !prev)}
                          className="schedule-light-section-header flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">OVERDUE</p>
                          <Badge variant="outline" className="h-5 px-2 text-[10px]">{overdueTasks.length}</Badge>
                          </div>
                          <span className={cn("schedule-light-row-control", !overdueCollapsed && "schedule-light-row-control-open")} aria-hidden />
                        </button>
                        {!overdueCollapsed && (
                          <div className="mt-2 space-y-2">
                            {overdueDisplayItems.map((item) =>
                              item.kind === "group" ? (
                                <div key={item.key} className="space-y-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleTaskGroup(item.key)}
                                    className="schedule-light-task-card block w-full rounded-[20px] p-3 text-left"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="truncate text-sm font-semibold">{item.department} ({item.count})</p>
                                      <Badge variant="outline" className="tracking-[0.08em]">GROUP</Badge>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {getDateLabel(item.date, timeZone)} • No time assigned
                                    </p>
                                  </button>
                                  {expandedTaskGroups.includes(item.key) && (
                                    <div className="space-y-2 pl-3">
                                      {item.tasks.map((task) => (
                                        <button
                                          key={task.id}
                                          onClick={() => setFocusTaskId(task.id)}
                                          className="schedule-light-task-card block w-full rounded-[20px] p-3 text-left"
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <p className="truncate text-sm font-semibold">{task.title}</p>
                                            <Badge className={`${getPriorityColor(task.priority)} tracking-[0.08em]`}>
                                              {getPriorityLabel(task.priority)}
                                            </Badge>
                                          </div>
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            {task.department} • No time assigned
                                          </p>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <button
                                  key={item.key}
                                  onClick={() => setFocusTaskId(item.task.id)}
                                  className="schedule-light-task-card block w-full rounded-[20px] p-3 text-left"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-sm font-semibold">{item.task.title}</p>
                                    <Badge className={`${getPriorityColor(item.task.priority)} tracking-[0.08em]`}>
                                      {getPriorityLabel(item.task.priority)}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {getDateLabel(item.task.date, timeZone)} • {item.task.department}
                                  </p>
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="schedule-light-row rounded-[28px] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="schedule-light-section-label text-xs font-semibold tracking-[0.08em] text-muted-foreground">NOW</p>
                        <span className="schedule-light-row-control" aria-hidden />
                      </div>
                      {nowTask ? (
                        <button
                          onClick={() => setFocusTaskId(nowTask.id)}
                          className="schedule-light-task-card mt-2 block w-full rounded-[20px] p-3 text-left"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{nowTask.title}</p>
                            {nowTask.required ? (
                              <Badge className={`${getCoreMatterBadgeClass()} tracking-[0.08em]`}>
                                ATTENTION
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatTaskWindow(nowTask, timeFormat)} • {nowTask.project}
                          </p>
                        </button>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">Empty</p>
                      )}
                    </div>

                    <div className="schedule-light-row rounded-[28px] p-4">
                        <button
                          type="button"
                          onClick={() => setNextCollapsed((prev) => !prev)}
                          className="schedule-light-section-header flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">NEXT</p>
                          <Badge variant="outline" className="h-5 px-2 text-[10px]">{nextTasks.length}</Badge>
                        </div>
                        <span className={cn("schedule-light-row-control", !nextCollapsed && "schedule-light-row-control-open")} aria-hidden />
                      </button>
                      {!nextCollapsed && (nextTasks.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {nextTasks.map((task) => (
                            <div
                              key={task.id}
                              draggable
                              className={cn(
                                "schedule-light-task-card relative rounded-[20px] p-3 text-left transition-all",
                                draggedTaskId === task.id && "opacity-55"
                              )}
                              onDragStart={(event) => {
                                setDraggedTaskId(task.id);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", String(task.id));
                              }}
                              onDragEnd={() => {
                                setDraggedTaskId(null);
                                setDropIndicator(null);
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                const rect = event.currentTarget.getBoundingClientRect();
                                const midpoint = rect.top + rect.height / 2;
                                const position = event.clientY < midpoint ? "before" : "after";
                                setDropIndicator({ taskId: task.id, position });
                              }}
                              onDragLeave={() => {
                                if (dropIndicator?.taskId === task.id) setDropIndicator(null);
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                const rect = event.currentTarget.getBoundingClientRect();
                                const midpoint = rect.top + rect.height / 2;
                                const position = event.clientY < midpoint ? "before" : "after";
                                if (draggedTaskId) reorderByDrag(draggedTaskId, task.id, position);
                                setDraggedTaskId(null);
                                setDropIndicator(null);
                              }}
                            >
                              {dropIndicator?.taskId === task.id && dropIndicator.position === "before" && (
                                <div className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />
                              )}
                              {dropIndicator?.taskId === task.id && dropIndicator.position === "after" && (
                                <div className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
                              )}
                              <button onClick={() => setFocusTaskId(task.id)} className="block w-full text-left">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <p className="truncate text-sm font-semibold">{task.title}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {task.required ? (
                                      <Badge className={`${getCoreMatterBadgeClass()} tracking-[0.08em]`}>
                                        ATTENTION
                                      </Badge>
                                    ) : null}
                                    <Badge className={`${getPriorityColor(task.priority)} tracking-[0.08em]`}>
                                      {getPriorityLabel(task.priority)}
                                    </Badge>
                                  </div>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatClock(task.startTime, timeFormat)} • {task.department}
                                </p>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">Empty</p>
                      ))}
                    </div>

                    <div className="schedule-light-row rounded-[28px] p-4">
                        <button
                          type="button"
                          onClick={() => setLaterCollapsed((prev) => !prev)}
                          className="schedule-light-section-header flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">LATER</p>
                          <Badge variant="outline" className="h-5 px-2 text-[10px]">{laterTasks.length}</Badge>
                        </div>
                        <span className={cn("schedule-light-row-control", !laterCollapsed && "schedule-light-row-control-open")} aria-hidden />
                      </button>
                      {!laterCollapsed && (
                        <div className="mt-2 space-y-3">
                          {laterTaskGroups.length > 0 ? laterTaskGroups.map(([date, items]) => (
                            <div key={date} className="space-y-2">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">{getDateLabel(date, timeZone)}</p>
                              {items.map((item) =>
                                item.kind === "group" ? (
                                  <div key={item.key} className="space-y-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleTaskGroup(item.key)}
                                      className="schedule-light-task-card block w-full rounded-[20px] p-3 text-left"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="truncate text-sm font-semibold">{item.department} ({item.count})</p>
                                        <Badge variant="outline" className="tracking-[0.08em]">GROUP</Badge>
                                      </div>
                                      <p className="mt-1 text-xs text-muted-foreground">No time assigned</p>
                                    </button>
                                    {expandedTaskGroups.includes(item.key) && (
                                      <div className="space-y-2 pl-3">
                                        {item.tasks.map((task) => (
                                          <button
                                            key={task.id}
                                            onClick={() => setFocusTaskId(task.id)}
                                            className="schedule-light-task-card block w-full rounded-[20px] p-3 text-left"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="flex min-w-0 items-center gap-2">
                                                <p className="truncate text-sm font-semibold">{task.title}</p>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                {task.required ? (
                                                  <Badge className={`${getCoreMatterBadgeClass()} tracking-[0.08em]`}>
                                                    ATTENTION
                                                  </Badge>
                                                ) : null}
                                                <Badge className={`${getPriorityColor(task.priority)} tracking-[0.08em]`}>
                                                  {getPriorityLabel(task.priority)}
                                                </Badge>
                                              </div>
                                            </div>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                              {task.department} • No time assigned
                                            </p>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    key={item.key}
                                    onClick={() => setFocusTaskId(item.task.id)}
                                    className="schedule-light-task-card block w-full rounded-[20px] p-3 text-left"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <p className="truncate text-sm font-semibold">{item.task.title}</p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {item.task.required ? (
                                          <Badge className={`${getCoreMatterBadgeClass()} tracking-[0.08em]`}>
                                            ATTENTION
                                          </Badge>
                                        ) : null}
                                        <Badge className={`${getPriorityColor(item.task.priority)} tracking-[0.08em]`}>
                                          {getPriorityLabel(item.task.priority)}
                                        </Badge>
                                      </div>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {isDateOnlyTask(item.task) ? "No time assigned" : formatClock(item.task.startTime, timeFormat)} • {item.task.department}
                                    </p>
                                  </button>
                                )
                              )}
                            </div>
                          )) : <p className="text-sm text-muted-foreground">Empty</p>}
                        </div>
                      )}
                    </div>

                    <div className="schedule-light-row rounded-[28px] p-4">
                        <button
                          type="button"
                          onClick={() => setUnscheduledCollapsed((prev) => !prev)}
                          className="schedule-light-section-header flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">UNSCHEDULED</p>
                          <Badge variant="outline" className="h-5 px-2 text-[10px]">{unscheduledTasks.length}</Badge>
                        </div>
                        <span className={cn("schedule-light-row-control", !unscheduledCollapsed && "schedule-light-row-control-open")} aria-hidden />
                      </button>
                      {!unscheduledCollapsed && (
                        <div className="mt-2 space-y-2">
                          {unscheduledTasks.length > 0 ? unscheduledTasks.map((task) => (
                            <button
                              key={task.id}
                              onClick={() => setFocusTaskId(task.id)}
                              className="schedule-light-task-card block w-full rounded-[20px] p-3 text-left"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <p className="truncate text-sm font-semibold">{task.title}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {task.required ? (
                                    <Badge className={`${getCoreMatterBadgeClass()} tracking-[0.08em]`}>
                                      ATTENTION
                                    </Badge>
                                  ) : null}
                                  <Badge className={`${getPriorityColor(task.priority)} tracking-[0.08em]`}>
                                    {getPriorityLabel(task.priority)}
                                  </Badge>
                                </div>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                No date assigned • {task.department}
                              </p>
                            </button>
                          )) : <p className="text-sm text-muted-foreground">Empty</p>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="schedule-light-required flex min-h-0 h-full flex-col self-stretch rounded-[30px] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="schedule-light-section-label text-xs font-semibold tracking-[0.08em] text-muted-foreground">CORE MATTER</p>
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {requiredTasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => setFocusTaskId(task.id)}
                          className="schedule-light-task-card w-full rounded-[20px] p-3 text-left"
                          onMouseEnter={triggerHoverHaptic}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{task.title}</p>
                            <Badge className={`${getCoreMatterBadgeClass()} tracking-[0.08em]`}>
                              CORE
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {task.project} • {isValidDateKey(task.date) ? getDateLabel(task.date, timeZone) : "No date assigned"}{hasTimedWindow(task) ? ` • ${formatClock(task.startTime, timeFormat)}` : ""}
                          </p>
                        </button>
                      ))}
                      {requiredTasks.length === 0 && <p className="text-sm text-muted-foreground">No active tasks queued.</p>}
                    </div>
                  </div>
                </div>
              </Card>

              {!todayPulseCollapsed && (
                <Card className="schedule-light-pulse min-h-0 overflow-hidden p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold tracking-[0.08em] text-muted-foreground">TODAY PULSE</h3>
                    <Badge variant="outline">{activeToday} active</Badge>
                  </div>

                    <div className="mb-4 grid grid-cols-3 gap-2">
                      <div className="schedule-light-mini rounded-[22px] p-3 text-center">
                        <p className="text-[11px] text-muted-foreground">Today</p>
                        <p className="text-xl font-bold">{sortedDayTasks.length}</p>
                      </div>
                      <div className="schedule-light-mini rounded-[22px] p-3 text-center">
                        <p className="text-[11px] text-muted-foreground">Done</p>
                        <p className="text-xl font-bold">{completedToday}</p>
                      </div>
                      <div className="schedule-light-mini rounded-[22px] p-3 text-center">
                        <p className="text-[11px] text-muted-foreground">Upcoming</p>
                        <p className="text-xl font-bold">{upcomingToday}</p>
                      </div>
                    </div>

                    <div className="max-h-[calc(100%-128px)] space-y-2 overflow-y-auto pr-1">
                      {sortedDayTasks.map((task) => (
                        <div
                          key={task.id}
                          className="schedule-light-task-card relative overflow-hidden rounded-xl p-3"
                          onMouseEnter={triggerHoverHaptic}
                        >
                          {completedBurstTaskId === task.id && (
                            <div className="mywork-complete-burst" aria-hidden>
                              <span /><span /><span /><span /><span /><span /><span /><span />
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <button onClick={() => setFocusTaskId(task.id)} className="truncate text-sm font-semibold text-left">
                              {task.title}
                            </button>
                            <Button
                              size="sm"
                              variant={task.completed ? "outline" : "secondary"}
                              onClick={() => toggleTask(task.id)}
                              className="h-7 px-2"
                            >
                              {task.completed ? "Undo" : "Done"}
                            </Button>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatTaskWindow(task, timeFormat)} • {task.department}
                          </p>
                        </div>
                      ))}
                      {sortedDayTasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks scheduled for this day.</p>}
                    </div>
                </Card>
              )}

              <Button
                size="icon"
                variant="outline"
                onClick={() => setTodayPulseCollapsed((prev) => !prev)}
                className="schedule-light-corner-button absolute bottom-4 right-4 z-20 h-10 w-10 rounded-full"
                aria-label={todayPulseCollapsed ? "Show today pulse" : "Collapse today pulse"}
              >
                {todayPulseCollapsed ? <ChevronDown className="h-4.5 w-4.5" /> : <ChevronUp className="h-4.5 w-4.5" />}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="list" className="min-h-0 flex-1">
            <Card className="schedule-light-surface schedule-light-shell h-full p-6 flex flex-col hover:!translate-y-0 hover:!scale-100">
              <div className="mb-4 flex items-center justify-between shrink-0">
                <h2 className="schedule-light-greeting text-xl font-semibold">List View</h2>
                <div className="flex items-center gap-3">
                  <div className="schedule-light-shell-toggle flex items-center gap-1 rounded-full">
                    {[1, 2, 3].map((size) => (
                      <Button
                        key={size}
                        size="sm"
                        variant={listSize === size ? "secondary" : "ghost"}
                        onClick={() => {
                          triggerHaptic(6);
                          setListSize(size as 1 | 2 | 3);
                        }}
                        className="h-8 min-w-8 rounded-full px-3"
                      >
                        {size}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1">
                {visibleTasks.map((task) => (
                  <div
                    key={task.id}
                    data-task-row="true"
                    draggable
                    className={`group schedule-light-task-card relative flex cursor-grab active:cursor-grabbing items-center gap-3 rounded-[24px] transition-all ${listSizeClasses[listSize]} ${
                      draggedTaskId === task.id ? "border-primary/50 bg-primary/5 opacity-55 scale-[0.99] dark:bg-primary/10" : ""
                    }`}
                    onClick={() => {
                      if (Date.now() - lastDragAtRef.current < 180) return;
                      triggerHaptic(6);
                      setFocusTaskId(task.id);
                    }}
                    onMouseEnter={triggerHoverHaptic}
                    onDragStart={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("button,[role='checkbox'],a,input,textarea")) {
                        event.preventDefault();
                        return;
                      }
                      triggerHaptic(6);
                      setDraggedTaskId(task.id);
                      const row = event.currentTarget;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(task.id));
                      event.dataTransfer.setDragImage(row, 24, 20);
                    }}
                    onDragEnd={() => {
                      lastDragAtRef.current = Date.now();
                      setDraggedTaskId(null);
                      setDropIndicator(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                      setDropIndicator({ taskId: task.id, position });
                    }}
                    onDragLeave={() => {
                      if (dropIndicator?.taskId === task.id) setDropIndicator(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                      if (draggedTaskId) {
                        reorderByDrag(draggedTaskId, task.id, position);
                      }
                      setDraggedTaskId(null);
                      setDropIndicator(null);
                    }}
                  >
                    {dropIndicator?.taskId === task.id && dropIndicator.position === "before" && (
                      <div className="pointer-events-none absolute -top-[2px] left-4 right-4 h-[3px] rounded-full bg-cyan-300 shadow-[0_0_12px_hsl(195_100%_70%/.85)]" />
                    )}
                    {dropIndicator?.taskId === task.id && dropIndicator.position === "after" && (
                      <div className="pointer-events-none absolute -bottom-[2px] left-4 right-4 h-[3px] rounded-full bg-cyan-300 shadow-[0_0_12px_hsl(195_100%_70%/.85)]" />
                    )}
                    {completedBurstTaskId === task.id && (
                      <div className="mywork-complete-burst" aria-hidden>
                        <span /><span /><span /><span /><span /><span /><span /><span />
                      </div>
                    )}
                    <Checkbox
                      checked={task.completed}
                      onCheckedChange={() => toggleTask(task.id)}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`font-medium ${listTitleClasses[listSize]} ${task.completed ? "line-through text-muted-foreground" : ""}`}
                        >
                          {task.title}
                        </p>
                        <Badge className={`${getPriorityColor(task.priority)} h-8 px-4 text-sm font-semibold tracking-[0.08em]`}>
                          {getPriorityLabel(task.priority)}
                        </Badge>
                      </div>
                      <p className={`${listMetaClasses[listSize]} text-muted-foreground mt-1`}>
                        {task.department} • {getDateLabel(task.date, timeZone)} • {formatTaskWindow(task, timeFormat)} ({formatMinutes(task.durationMinutes)})
                      </p>
                    </div>
                    <Badge className="max-w-[220px] truncate border border-sky-300/70 bg-sky-200/55 px-4 py-1.5 text-sm font-semibold text-sky-900 shadow-[inset_0_1px_0_hsl(0_0%_100%/.46)] dark:border-sky-300/38 dark:bg-sky-300/18 dark:text-sky-100">
                      {task.project}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={(event) => event.stopPropagation()}
                          className="h-8 w-8 opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={(event) => {
                            event.stopPropagation();
                            triggerHaptic(8);
                            handleEditTask(task);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteTask(task.id);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
                {visibleTasks.length === 0 && <div className="text-sm text-muted-foreground">No tasks found.</div>}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="cards" className="min-h-0 flex-1">
            <Card className="schedule-light-surface schedule-light-shell h-full p-6 flex flex-col hover:!translate-y-0 hover:!scale-100">
              <div className="mb-4 flex items-center justify-between shrink-0">
                <h2 className="schedule-light-greeting text-xl font-semibold">Card View</h2>
                <div className="flex items-center gap-2">
                  <div className="schedule-light-shell-toggle flex items-center gap-1 rounded-full">
                    <Button
                      size="sm"
                      variant={cardLayout === "flow" ? "secondary" : "ghost"}
                      onClick={() => {
                        triggerHaptic(6);
                        setCardLayout("flow");
                      }}
                      className="h-8 rounded-full px-3"
                    >
                      Left to Right
                    </Button>
                    <Button
                      size="sm"
                      variant={cardLayout === "grid" ? "secondary" : "ghost"}
                      onClick={() => {
                        triggerHaptic(6);
                        setCardLayout("grid");
                      }}
                      className="h-8 rounded-full px-3"
                    >
                      Boxes
                    </Button>
                  </div>
                  <div className="schedule-light-shell-toggle flex items-center gap-1 rounded-full">
                    <Button
                      size="sm"
                      variant={scaleCards ? "secondary" : "ghost"}
                      onClick={() => {
                        triggerHaptic(6);
                        setScaleCards(!scaleCards);
                      }}
                      className="h-8 rounded-full px-3"
                    >
                      Scale {scaleCards ? "On" : "Off"}
                    </Button>
                    <Button
                      size="sm"
                      variant={cardScaleBy === "timing" ? "secondary" : "ghost"}
                      onClick={() => {
                        triggerHaptic(6);
                        setCardScaleBy("timing");
                      }}
                      className="h-8 rounded-full px-3"
                      disabled={!scaleCards}
                    >
                      Timing
                    </Button>
                    <Button
                      size="sm"
                      variant={cardScaleBy === "difficulty" ? "secondary" : "ghost"}
                      onClick={() => {
                        triggerHaptic(6);
                        setCardScaleBy("difficulty");
                      }}
                      className="h-8 rounded-full px-3"
                      disabled={!scaleCards}
                    >
                      Difficulty
                    </Button>
                  </div>
                </div>
              </div>
              <div
                className={
                  cardLayout === "flow"
                    ? "flex-1 min-h-0 overflow-x-auto overflow-y-hidden"
                    : "flex-1 min-h-0 overflow-y-auto"
                }
              >
                <div
                  className={
                    cardLayout === "flow"
                      ? "flex h-full items-start gap-3 pb-2 pr-2"
                      : "grid grid-cols-1 items-start gap-4 pr-1 md:grid-cols-2 xl:grid-cols-3"
                  }
                >
                  {visibleTasks.map((task, index) => (
                    <div key={task.id} className={`relative ${cardLayout === "flow" ? "flex h-full items-center gap-2" : "w-full"}`}>
                      <Card
                        className={`schedule-light-task-card relative overflow-hidden cursor-pointer rounded-[28px] p-5 ${cardLayout === "flow" ? "h-full flex-shrink-0" : "w-full"}`}
                        onClick={() => {
                          triggerHaptic(6);
                          setFocusTaskId(task.id);
                        }}
                        onMouseEnter={triggerHoverHaptic}
                        style={getCardSizeStyle(task)}
                      >
                        {completedBurstTaskId === task.id && (
                          <div className="mywork-complete-burst" aria-hidden>
                            <span /><span /><span /><span /><span /><span /><span /><span />
                          </div>
                        )}
                        <div className="flex h-full flex-col justify-between">
                          <div>
                            <div className="mb-3 flex items-center justify-between">
                              <Badge className={`${getPriorityColor(task.priority)} tracking-[0.08em]`}>{getPriorityLabel(task.priority)}</Badge>
                              <span className="text-xs text-muted-foreground">{task.department}</span>
                            </div>
                            <h3 className="text-lg font-semibold">{task.title}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{task.project}</p>
                          </div>
                          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                            <span>{getDateLabel(task.date, timeZone)}</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" /> {formatMinutes(task.durationMinutes)}
                            </span>
                          </div>
                        </div>
                      </Card>
                      {cardLayout === "flow" && index < visibleTasks.length - 1 ? (
                        <div className="pointer-events-none flex h-full items-center justify-center px-1">
                          <div className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 shadow-[0_0_10px_hsl(199_100%_72%/.2)]">
                            <span className="h-px w-4 bg-primary/45" />
                            <ChevronRight className="h-3.5 w-3.5 text-primary/75" />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="bubble" className="min-h-0 flex-1">
            <Card className="schedule-light-surface schedule-light-shell h-full p-6 flex flex-col hover:!translate-y-0 hover:!scale-100">
              <h2 className="schedule-light-greeting mb-4 text-xl font-semibold shrink-0">Bubble Chart View</h2>
              <div className="mb-4 flex gap-2 overflow-x-auto pb-2 shrink-0">
                {dayStrip.map((day) => (
                  <Button
                    key={day}
                    variant={day === selectedDate ? "secondary" : "outline"}
                    onClick={() => {
                      triggerHaptic(6);
                      setSelectedDate(day);
                    }}
                    className={cn("schedule-light-day-pill shrink-0 rounded-full", day === selectedDate ? "schedule-light-pill-active" : "schedule-light-pill")}
                  >
                    {getDateLabel(day, timeZone)}
                  </Button>
                ))}
              </div>
              <div className="schedule-light-bubble-stage relative mx-auto flex-1 min-h-0 w-full max-w-4xl overflow-y-auto px-4 py-6 md:px-6">
                {sortedDayTasks.map((task, index) => (
                  <div
                    key={task.id}
                    className="schedule-light-task-card relative overflow-hidden grid cursor-pointer grid-cols-[64px_44px_1fr_36px] items-center gap-3 rounded-[24px] px-2 py-3 md:grid-cols-[86px_58px_1fr_42px] md:gap-4 md:px-3"
                    style={{ minHeight: `${Math.max(78, Math.min(180, task.durationMinutes * 1.2))}px` }}
                    onClick={() => {
                      triggerHaptic(6);
                      setFocusTaskId(task.id);
                    }}
                    onMouseEnter={triggerHoverHaptic}
                  >
                    {completedBurstTaskId === task.id && (
                      <div className="mywork-complete-burst" aria-hidden>
                        <span /><span /><span /><span /><span /><span /><span /><span />
                      </div>
                    )}
                    <div className="text-xs md:text-sm font-medium text-muted-foreground">
                      {formatClock(task.startTime, timeFormat)}
                    </div>

                    <div className="relative flex h-full items-center justify-center">
                      {index > 0 && <div className="absolute -top-4 h-4 w-[2px] bg-primary/45" />}
                      {index < sortedDayTasks.length - 1 && <div className="absolute -bottom-4 h-4 w-[2px] bg-primary/45" />}
                      <div
                        className="rounded-[999px] border border-primary/25 bg-[hsl(var(--card)/0.9)] shadow-[inset_0_1px_0_hsl(0_0%_100%/.08)]"
                        style={{
                          width: `${Math.max(26, Math.min(42, 20 + task.durationMinutes / 12))}px`,
                          height: `${Math.max(64, Math.min(164, task.durationMinutes * 0.95))}px`,
                        }}
                      />
                    </div>

                    <div className="min-w-0">
                      <p className={`truncate text-base md:text-lg font-semibold ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                        {task.title}
                      </p>
                      <p className="text-xs md:text-sm text-muted-foreground">
                        {formatTaskWindow(task, timeFormat)} ({formatMinutes(task.durationMinutes)}) • {task.project}
                      </p>
                    </div>

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleTask(task.id);
                      }}
                      className={`h-6 w-6 md:h-7 md:w-7 rounded-full border-2 transition-colors ${
                        task.completed
                          ? "border-emerald-400 bg-emerald-500/20"
                          : "border-primary/65 hover:border-primary"
                      }`}
                      aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
                    />
                  </div>
                ))}
                {sortedDayTasks.length === 0 && <div className="text-sm text-muted-foreground">No tasks for this day.</div>}
              </div>
            </Card>
          </TabsContent>
          </Tabs>
        ) : (
          <div className="min-h-0 flex-1">
            <CalendarPage embedded />
          </div>
        )}

        <TaskModal
          task={selectedTask}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
          onSave={handleSaveTask}
        />

        <Dialog open={!!focusedTask} onOpenChange={(open) => !open && setFocusTaskId(null)}>
          <DialogContent className="max-w-5xl h-[80vh] overflow-auto border-border/70 bg-card/92 backdrop-blur-xl">
            {focusedTask && (
              <div className="h-full space-y-6">
                <DialogHeader>
                  <DialogTitle className="text-4xl font-bold tracking-tight">{focusedTask.title}</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Card className="p-5">
                    <p className="text-sm text-muted-foreground">Project</p>
                    <p className="text-2xl font-semibold">{focusedTask.project}</p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-sm text-muted-foreground">Department</p>
                    <p className="text-2xl font-semibold">{focusedTask.department}</p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-sm text-muted-foreground">Schedule</p>
                    <p className="text-2xl font-semibold">{getDateLabel(focusedTask.date, timeZone)}</p>
                    <p className="text-lg text-muted-foreground">
                      {formatTaskWindow(focusedTask, timeFormat)}
                    </p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-sm text-muted-foreground">Priority / Duration</p>
                    <div className="mt-1 flex items-center gap-3">
                      <Badge className={`${getPriorityColor(focusedTask.priority)} tracking-[0.08em]`}>{getPriorityLabel(focusedTask.priority)}</Badge>
                      <span className="text-lg text-muted-foreground">{formatMinutes(focusedTask.durationMinutes)}</span>
                    </div>
                  </Card>
                </div>

                <Card className="p-6">
                  <p className="mb-2 text-sm text-muted-foreground">Focus Mode</p>
                  <p className="text-xl font-medium leading-relaxed">
                    This task is now in focus. Keep this panel open while you execute, then mark it complete or edit details.
                  </p>
                  <div className="mt-6 flex gap-3">
                    <Button
                      onClick={() => toggleTask(focusedTask.id)}
                      variant={focusedTask.completed ? "outline" : "secondary"}
                    >
                      {focusedTask.completed ? "Mark Incomplete" : "Mark Complete"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleEditTask(focusedTask);
                        setFocusTaskId(null);
                      }}
                    >
                      Edit Task
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
