import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  ListFilter,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react";
import { AnimatedTitle } from "@/components/AnimatedTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import DelphiCalendarEngine from "@/components/DelphiCalendarEngine";
import { cn } from "@/lib/utils";
import { useLocalStorageState } from "@/hooks/use-local-storage";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getSupabaseErrorMessage } from "@/lib/supabase-errors";
import { fetchCalendarEvents, mapCalendarRowToRecord, replaceCalendarEvents } from "@/lib/supabase-calendar-events";
import { toSmartTitleCase, toSmartTitleCaseLive } from "@/lib/text-format";
import { applyLinkedWriteback } from "@/lib/linked-writeback";
import { runLinkedScheduleSync } from "@/lib/linked-schedule-engine";
import { groupDateOnlyTasksByDepartment, type DateOnlyDepartmentDisplayItem } from "@/lib/task-grouping";

type CalendarViewMode = "day" | "week" | "month" | "year" | "agenda";
type FormMode = "onboard" | "all";
type SourceLayer = "manual" | "my-work";
type EventColor = "cyan" | "violet" | "emerald" | "rose" | "amber";
type TimeFormat = "12h" | "24h";

type CalendarEvent = {
  id: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
  allDay?: boolean;
  color?: EventColor;
  sourceLayer?: "manual" | "my-work-mirror";
  linked?: boolean;
  linkedKey?: string;
};

type MyWorkTask = {
  id: number;
  title: string;
  project: string;
  department: string;
  date: string;
  startTime: string;
  endTime: string;
  completed: boolean;
  linked?: boolean;
  linkedKey?: string;
  linkedSource?: "development" | "sales" | "subscriptions";
};

type CalendarItem = {
  id: string;
  source: SourceLayer;
  refId: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
  completed?: boolean;
  allDay: boolean;
  color: EventColor;
  linked?: boolean;
  linkedKey?: string;
  department?: string;
  groupTaskIds?: number[];
  grouped?: boolean;
};

type PlacedEvent = CalendarItem & {
  lane: number;
  laneCount: number;
};

const CALENDAR_KEY = "delphi_calendar_events_v2";
const LEGACY_KEY = "delphi_calendar_events_v1";
const TIME_FORMAT_KEY = "delphi_time_format";
const CALENDAR_RIGHT_PANEL_HIDDEN_KEY = "delphi_calendar_right_panel_hidden_v1";
const CALENDAR_EVENT_DRAFT_KEY = "delphi_calendar_event_draft_v1";
const MY_WORK_KEY = "delphi_my_work_tasks_v3";

const INITIAL_EVENTS: CalendarEvent[] = [];

const HOUR_ROW_PX = 72;
const HOURS = Array.from({ length: 24 }, (_, index) => index);

const getTodayKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};

const isValidDateKey = (value: string | undefined | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
};

const formatDateKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const startOfWeek = (date: Date) => {
  const next = new Date(date);
  const day = next.getDay();
  next.setDate(next.getDate() - day);
  next.setHours(12, 0, 0, 0);
  return next;
};

const startOfMonth = (date: Date) => {
  const next = new Date(date);
  next.setDate(1);
  next.setHours(12, 0, 0, 0);
  return next;
};

const toMinutes = (time: string) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return Number.POSITIVE_INFINITY;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const hasAssignedTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
const hasTimedRange = (item: Pick<CalendarItem | CalendarEvent | MyWorkTask, "startTime" | "endTime">) =>
  hasAssignedTime(item.startTime) && hasAssignedTime(item.endTime);

const toTime = (minutesRaw: number) => {
  const minutes = Math.max(0, Math.min(23 * 60 + 59, minutesRaw));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const formatClock = (time: string, format: TimeFormat) => {
  if (!hasAssignedTime(time)) return "No time";
  if (format === "24h") return time;
  const [hoursRaw, minsRaw] = time.split(":");
  const hours = Number(hoursRaw);
  const mins = Number(minsRaw);
  if (Number.isNaN(hours) || Number.isNaN(mins)) return time;
  const ampm = hours >= 12 ? "PM" : "AM";
  const twelve = hours % 12 || 12;
  return `${twelve}:${String(mins).padStart(2, "0")} ${ampm}`;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const inRange = (dateKey: string, from: Date, to: Date) => {
  const value = parseDateKey(dateKey).getTime();
  return value >= from.getTime() && value <= to.getTime();
};

const getMonthLabel = (date: Date) => date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
const getDayLabel = (date: Date) => date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const getDateHeaderLabel = (view: CalendarViewMode, visibleDate: Date) => {
  if (view === "day") return visibleDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  if (view === "week") {
    const weekStart = startOfWeek(visibleDate);
    const weekEnd = addDays(weekStart, 6);
    return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }
  if (view === "month") return getMonthLabel(visibleDate);
  if (view === "year") return visibleDate.toLocaleDateString("en-US", { year: "numeric" });
  return "Agenda";
};

const colorClass: Record<EventColor, string> = {
  cyan: "border-[hsl(201_88%_52%/.78)] bg-[linear-gradient(180deg,hsl(198_100%_82%/.9),hsl(214_92%_68%/.78))] text-[hsl(219_34%_15%)] dark:border-[hsl(199_92%_68%/.72)] dark:bg-[linear-gradient(180deg,hsl(198_98%_56%/.94),hsl(217_90%_44%/.88))] dark:text-[hsl(210_100%_98%)]",
  violet: "border-[hsl(255_84%_72%/.78)] bg-[linear-gradient(180deg,hsl(254_95%_86%/.9),hsl(242_84%_76%/.8))] text-[hsl(246_30%_16%)] dark:border-[hsl(253_94%_74%/.72)] dark:bg-[linear-gradient(180deg,hsl(252_90%_66%/.94),hsl(241_74%_54%/.88))] dark:text-[hsl(244_100%_98%)]",
  emerald: "border-[hsl(156_70%_42%/.76)] bg-[linear-gradient(180deg,hsl(155_84%_80%/.9),hsl(160_68%_68%/.8))] text-[hsl(161_32%_15%)] dark:border-[hsl(156_82%_58%/.72)] dark:bg-[linear-gradient(180deg,hsl(158_72%_44%/.94),hsl(169_70%_30%/.88))] dark:text-[hsl(156_100%_98%)]",
  rose: "border-[hsl(347_84%_64%/.76)] bg-[linear-gradient(180deg,hsl(347_96%_86%/.9),hsl(349_84%_74%/.8))] text-[hsl(345_36%_16%)] dark:border-[hsl(347_90%_70%/.72)] dark:bg-[linear-gradient(180deg,hsl(346_78%_56%/.94),hsl(352_70%_45%/.88))] dark:text-[hsl(350_100%_98%)]",
  amber: "border-[hsl(39_96%_52%/.8)] bg-[linear-gradient(180deg,hsl(44_100%_84%/.94),hsl(39_95%_72%/.82))] text-[hsl(32_48%_16%)] dark:border-[hsl(40_96%_62%/.76)] dark:bg-[linear-gradient(180deg,hsl(41_92%_58%/.94),hsl(31_84%_46%/.88))] dark:text-[hsl(42_100%_98%)]",
};

const baseSourceClass = {
  "manual": "",
  "my-work": "border-[hsl(250_88%_70%/.78)] bg-[linear-gradient(180deg,hsl(249_100%_88%/.92),hsl(239_86%_78%/.82))] text-[hsl(242_28%_16%)] dark:border-[hsl(252_92%_72%/.76)] dark:bg-[linear-gradient(180deg,hsl(251_86%_62%/.94),hsl(243_72%_52%/.88))] dark:text-[hsl(242_100%_98%)]",
} satisfies Record<SourceLayer, string>;

const eventAccentClass: Record<EventColor, string> = {
  cyan: "bg-[hsl(201_100%_60%)]",
  violet: "bg-[hsl(255_88%_72%)]",
  emerald: "bg-[hsl(156_74%_44%)]",
  rose: "bg-[hsl(347_84%_64%)]",
  amber: "bg-[hsl(39_95%_55%)]",
};

const densityStyles = {
  free: "bg-emerald-500/35",
  light: "bg-sky-500/35",
  moderate: "bg-amber-400/35",
  busy: "bg-orange-500/35",
  overloaded: "bg-red-500/35",
} as const;

const defaultEvent = (date: string): Omit<CalendarEvent, "id"> => ({
  title: "",
  date,
  startTime: "09:00",
  endTime: "10:00",
  notes: "",
  allDay: false,
  color: "cyan",
});

const isMissingCalendarTableError = (error: unknown) => {
  const message = getSupabaseErrorMessage(error).toLowerCase();
  return message.includes("calendar_events") && message.includes("schema cache");
};

const layoutOverlaps = (events: CalendarItem[]): PlacedEvent[] => {
  const timed = events
    .filter((item) => !item.allDay)
    .slice()
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime) || toMinutes(b.endTime) - toMinutes(a.endTime));

  const placed: PlacedEvent[] = [];

  for (const event of timed) {
    const start = toMinutes(event.startTime);
    const laneUsed = new Set<number>();
    placed.forEach((p) => {
      const pStart = toMinutes(p.startTime);
      const pEnd = toMinutes(p.endTime);
      if (Math.max(start, pStart) < Math.min(toMinutes(event.endTime), pEnd)) {
        laneUsed.add(p.lane);
      }
    });

    let lane = 0;
    while (laneUsed.has(lane)) lane += 1;
    placed.push({ ...event, lane, laneCount: lane + 1 });
  }

  placed.forEach((event, index) => {
    const start = toMinutes(event.startTime);
    const end = toMinutes(event.endTime);
    let maxLane = event.lane + 1;

    placed.forEach((other, otherIndex) => {
      if (index === otherIndex) return;
      const otherStart = toMinutes(other.startTime);
      const otherEnd = toMinutes(other.endTime);
      if (Math.max(start, otherStart) < Math.min(end, otherEnd)) {
        maxLane = Math.max(maxLane, other.lane + 1);
      }
    });

    event.laneCount = maxLane;
  });

  return placed;
};

const getEventSurfaceClass = (item: CalendarItem) =>
  cn(
    "group/event relative overflow-hidden rounded-2xl border text-left shadow-[0_18px_40px_-24px_hsl(220_45%_10%/.32),inset_0_1px_0_hsl(0_0%_100%/.52)] transition-all hover:-translate-y-0.5 hover:brightness-[1.03]",
    item.source === "manual" ? colorClass[item.color] : baseSourceClass[item.source]
  );

interface CalendarPageProps {
  embedded?: boolean;
}

export default function CalendarPage({ embedded = false }: CalendarPageProps) {
  const [events, setEvents] = useLocalStorageState<CalendarEvent[]>(CALENDAR_KEY, INITIAL_EVENTS);
  const [myWorkTasks, setMyWorkTasks] = useState<MyWorkTask[]>([]);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [selectedDate, setSelectedDate] = useState(getTodayKey);
  const [visibleDate, setVisibleDate] = useState(() => parseDateKey(getTodayKey()));
  const [showManual, setShowManual] = useState(true);
  const [showMyWork, setShowMyWork] = useState(true);
  const [search, setSearch] = useState("");
  const [rightPanelHidden, setRightPanelHidden] = useState(true);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(() => {
    const saved = localStorage.getItem(TIME_FORMAT_KEY);
    return saved === "24h" ? "24h" : "12h";
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editingSource, setEditingSource] = useState<SourceLayer>("manual");
  const [editingLinkedKey, setEditingLinkedKey] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("onboard");
  const [onboardStep, setOnboardStep] = useState(0);
  const [formData, setFormData] = useState<Omit<CalendarEvent, "id">>(defaultEvent(getTodayKey()));
  const [clearNextCalendarDraftLoad, setClearNextCalendarDraftLoad] = useState(false);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [showDensityPreview, setShowDensityPreview] = useState(false);
  const [densityPreviewPinned, setDensityPreviewPinned] = useState(false);
  const [groupedTaskDialog, setGroupedTaskDialog] = useState<{ title: string; tasks: MyWorkTask[] } | null>(null);
  const hasLoadedFromSupabase = useRef(false);
  const suppressNextSync = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const loadFromSupabase = async () => {
      setSyncState("syncing");
      setSyncMessage("Syncing calendar...");
      try {
        const rows = await fetchCalendarEvents();
        if (cancelled) return;
        if (rows.length > 0) {
          suppressNextSync.current = true;
          setEvents(rows.map(mapCalendarRowToRecord));
        } else {
          await replaceCalendarEvents(events);
        }
        hasLoadedFromSupabase.current = true;
        setSyncState("idle");
        setSyncMessage("Synced");
      } catch (error) {
        if (cancelled) return;
        if (isMissingCalendarTableError(error)) {
          hasLoadedFromSupabase.current = false;
          setSyncState("idle");
          setSyncMessage("Calendar table missing in Supabase. Using local storage.");
          return;
        }
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
        await replaceCalendarEvents(events);
        if (!cancelled) {
          setSyncState("idle");
          setSyncMessage("Synced");
        }
      } catch (error) {
        if (!cancelled) {
          if (isMissingCalendarTableError(error)) {
            hasLoadedFromSupabase.current = false;
            setSyncState("idle");
            setSyncMessage("Calendar table missing in Supabase. Using local storage.");
            return;
          }
          setSyncState("error");
          setSyncMessage(getSupabaseErrorMessage(error));
        }
      }
    };
    void persist();
    return () => {
      cancelled = true;
    };
  }, [events]);

  useEffect(() => {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw || events.length > 0) return;
    try {
      const parsed = JSON.parse(legacyRaw) as Array<Partial<CalendarEvent>>;
      if (!Array.isArray(parsed)) return;
      const migrated = parsed
        .map((item, index) => {
          if (!item.title || !item.date || !item.startTime || !item.endTime) return null;
          return {
            id: item.id ?? Date.now() + index,
            title: String(item.title),
            date: String(item.date),
            startTime: String(item.startTime),
            endTime: String(item.endTime),
            notes: item.notes ? String(item.notes) : "",
            allDay: Boolean(item.allDay),
            color: (item.color as EventColor) || "cyan",
          } satisfies CalendarEvent;
        })
        .filter(Boolean) as CalendarEvent[];
      if (migrated.length) setEvents(migrated);
    } catch {
      // ignore malformed legacy
    }
  }, [events.length, setEvents]);

  useEffect(() => {
    localStorage.setItem(CALENDAR_RIGHT_PANEL_HIDDEN_KEY, rightPanelHidden ? "1" : "0");
  }, [rightPanelHidden]);

  useEffect(() => {
    if (!isModalOpen || editingEventId !== null) return;
    if (clearNextCalendarDraftLoad) {
      localStorage.removeItem(CALENDAR_EVENT_DRAFT_KEY);
      setClearNextCalendarDraftLoad(false);
      return;
    }
    try {
      const raw = localStorage.getItem(CALENDAR_EVENT_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Omit<CalendarEvent, "id">>;
      setFormData((prev) => ({
        ...prev,
        ...parsed,
        date: prev.date,
        startTime: prev.startTime,
        endTime: prev.endTime,
      }));
    } catch {
      // ignore malformed draft
    }
  }, [isModalOpen, editingEventId, clearNextCalendarDraftLoad]);

  useEffect(() => {
    if (!isModalOpen || editingEventId !== null) return;
    const hasContent = Boolean(formData.title.trim() || (formData.notes || "").trim());
    if (!hasContent) {
      localStorage.removeItem(CALENDAR_EVENT_DRAFT_KEY);
      return;
    }
    localStorage.setItem(CALENDAR_EVENT_DRAFT_KEY, JSON.stringify(formData));
  }, [formData, isModalOpen, editingEventId]);

  useEffect(() => {
    if (!isModalOpen || editingEventId === null) return;
    const target = events.find((event) => event.id === editingEventId);
    if (!target) return;

    const normalizedTitle = toSmartTitleCase(formData.title).trim();
    const validTimedRange = formData.allDay || toMinutes(formData.endTime) > toMinutes(formData.startTime);
    if (!validTimedRange) return;

    const nextEvent: CalendarEvent = {
      ...target,
      title: normalizedTitle || target.title,
      date: formData.date || target.date,
      startTime: formData.allDay ? "00:00" : formData.startTime,
      endTime: formData.allDay ? "23:59" : formData.endTime,
      notes: (formData.notes || "").trim(),
      allDay: Boolean(formData.allDay),
      color: formData.color || target.color || "cyan",
    };

    const hasChanged =
      target.title !== nextEvent.title ||
      target.date !== nextEvent.date ||
      target.startTime !== nextEvent.startTime ||
      target.endTime !== nextEvent.endTime ||
      (target.notes || "") !== (nextEvent.notes || "") ||
      Boolean(target.allDay) !== Boolean(nextEvent.allDay) ||
      (target.color || "cyan") !== (nextEvent.color || "cyan");

    if (hasChanged) {
      setEvents((prev) => prev.map((event) => (event.id === editingEventId ? nextEvent : event)));
    }
  }, [isModalOpen, editingEventId, formData, events, setEvents]);

  useEffect(() => {
    const loadMyWorkFromStorage = () => {
      try {
        const raw = localStorage.getItem("delphi_my_work_tasks_v3");
        const parsed = raw ? JSON.parse(raw) : [];
        setMyWorkTasks(Array.isArray(parsed) ? parsed : []);
      } catch {
        setMyWorkTasks([]);
      }
    };

    const onTimeFormatChange = (event: Event) => {
      const detail = (event as CustomEvent<TimeFormat>).detail;
      if (detail === "12h" || detail === "24h") setTimeFormat(detail);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === TIME_FORMAT_KEY && (event.newValue === "12h" || event.newValue === "24h")) {
        setTimeFormat(event.newValue);
      }
      if (event.key === "delphi_my_work_tasks_v3") {
        loadMyWorkFromStorage();
      }
    };
    const onLinkedScheduleSync = () => loadMyWorkFromStorage();

    window.addEventListener("delphi-timeformat-change", onTimeFormatChange as EventListener);
    window.addEventListener("delphi-linked-schedule-sync", onLinkedScheduleSync as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("delphi-timeformat-change", onTimeFormatChange as EventListener);
      window.removeEventListener("delphi-linked-schedule-sync", onLinkedScheduleSync as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("delphi_my_work_tasks_v3");
      const parsed = raw ? JSON.parse(raw) : [];
      setMyWorkTasks(Array.isArray(parsed) ? parsed : []);
    } catch {
      setMyWorkTasks([]);
    }
  }, []);

  const allItems = useMemo<CalendarItem[]>(() => {
    const manualItems: CalendarItem[] = events
      .filter((event) => event.sourceLayer !== "my-work-mirror" && !event.linked && isValidDateKey(event.date))
      .map((event) => ({
      id: `manual-${event.id}`,
      source: "manual",
      refId: event.id,
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      notes: event.notes,
      allDay: Boolean(event.allDay) || !hasTimedRange(event),
      color: event.color || "cyan",
      linked: Boolean(event.linked),
      linkedKey: event.linkedKey,
    }));

    const validMyWorkTasks = myWorkTasks.filter((task) => isValidDateKey(task.date));
    const groupedDisplays = new Map<string, MyWorkTask[]>();

    validMyWorkTasks.forEach((task) => {
      const bucket = groupedDisplays.get(task.date) ?? [];
      bucket.push(task);
      groupedDisplays.set(task.date, bucket);
    });

    const myWorkItems: CalendarItem[] = Array.from(groupedDisplays.entries()).flatMap(([date, rawTasks]) =>
      groupDateOnlyTasksByDepartment(rawTasks as MyWorkTask[]).map((item) => {
        if (item.kind === "group") {
          return {
            id: `work-group-${date}-${item.department.toLowerCase()}`,
            source: "my-work" as const,
            refId: item.tasks[0].id,
            title: `${item.department} (${item.count})`,
            date,
            startTime: "00:00",
            endTime: "23:59",
            notes: "Department work block",
            completed: item.tasks.every((task) => task.completed),
            allDay: true,
            color: "violet" as const,
            linked: item.tasks.some((task) => Boolean(task.linked)),
            linkedKey: item.tasks.find((task) => task.linkedKey)?.linkedKey,
            department: item.department,
            grouped: true,
            groupTaskIds: item.tasks.map((task) => task.id),
          };
        }

        const task = item.task;
        return {
          id: `work-${task.id}`,
          source: "my-work" as const,
          refId: task.id,
          title: task.title,
          date: task.date,
          startTime: task.startTime,
          endTime: task.endTime,
          notes: task.project,
          completed: task.completed,
          allDay: !hasTimedRange(task),
          color: "violet" as const,
          linked: Boolean(task.linked),
          linkedKey: task.linkedKey,
          department: task.department,
        };
      })
    );

    return [...manualItems, ...myWorkItems].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return toMinutes(a.startTime) - toMinutes(b.startTime);
    });
  }, [events, myWorkTasks]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((item) => {
      if (item.source === "manual" && !showManual) return false;
      if (item.source === "my-work" && !showMyWork) return false;
      if (!q) return true;
      return `${item.title} ${item.notes || ""} ${item.source}`.toLowerCase().includes(q);
    });
  }, [allItems, search, showManual, showMyWork]);

  const selectedDayItems = useMemo(
    () => filteredItems.filter((item) => item.date === selectedDate),
    [filteredItems, selectedDate]
  );

  const weekDays = useMemo(() => {
    const start = startOfWeek(visibleDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [visibleDate]);

  const monthGridDays = useMemo(() => {
    const monthStart = startOfMonth(visibleDate);
    const firstCell = startOfWeek(monthStart);
    return Array.from({ length: 42 }, (_, index) => addDays(firstCell, index));
  }, [visibleDate]);

  const agendaItems = useMemo(() => {
    const from = addDays(parseDateKey(selectedDate), -3);
    const to = addDays(parseDateKey(selectedDate), 30);
    return filteredItems.filter((item) => inRange(item.date, from, to));
  }, [filteredItems, selectedDate]);

  const selectedDayTimeline = useMemo(
    () =>
      selectedDayItems
        .slice()
        .sort((a, b) => {
          if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
          return toMinutes(a.startTime) - toMinutes(b.startTime);
        }),
    [selectedDayItems]
  );

  const miniCalendarDensity = useMemo(() => {
    const counts = new Map<string, number>();
    filteredItems.forEach((item) => {
      counts.set(item.date, (counts.get(item.date) || 0) + 1);
    });
    return counts;
  }, [filteredItems]);

  const nowMarker = useMemo(() => {
    const now = new Date();
    const todayKey = formatDateKey(now);
    const minutes = now.getHours() * 60 + now.getMinutes();
    return { todayKey, top: (minutes / 60) * HOUR_ROW_PX };
  }, []);

  const conflictCount = useMemo(() => {
    const dayEvents = events.filter((event) => event.date === selectedDate && !event.allDay && hasTimedRange(event));
    let conflicts = 0;
    for (let i = 0; i < dayEvents.length; i += 1) {
      for (let j = i + 1; j < dayEvents.length; j += 1) {
        const aStart = toMinutes(dayEvents[i].startTime);
        const aEnd = toMinutes(dayEvents[i].endTime);
        const bStart = toMinutes(dayEvents[j].startTime);
        const bEnd = toMinutes(dayEvents[j].endTime);
        if (Math.max(aStart, bStart) < Math.min(aEnd, bEnd)) conflicts += 1;
      }
    }
    return conflicts;
  }, [events, selectedDate]);

  const openGroupedTaskItem = (item: CalendarItem) => {
    if (!item.grouped || !item.groupTaskIds?.length) {
      openGroupedTaskItem(item);
      return;
    }
    const tasks = myWorkTasks.filter((task) => item.groupTaskIds?.includes(task.id));
    setGroupedTaskDialog({ title: item.title, tasks });
  };

  const navigateRange = (direction: 1 | -1) => {
    if (viewMode === "day") {
      const next = addDays(visibleDate, direction);
      setVisibleDate(next);
      setSelectedDate(formatDateKey(next));
      return;
    }
    if (viewMode === "week") {
      setVisibleDate(addDays(visibleDate, direction * 7));
      return;
    }
    if (viewMode === "month") {
      const next = new Date(visibleDate);
      next.setMonth(next.getMonth() + direction);
      next.setDate(1);
      setVisibleDate(next);
      return;
    }
    if (viewMode === "year") {
      const next = new Date(visibleDate);
      next.setFullYear(next.getFullYear() + direction);
      next.setMonth(0, 1);
      setVisibleDate(next);
      return;
    }
    setVisibleDate(addDays(visibleDate, direction * 7));
  };

  const jumpToToday = () => {
    const today = parseDateKey(getTodayKey());
    setVisibleDate(today);
    setSelectedDate(formatDateKey(today));
  };

  const openCreate = (
    dateOverride?: string,
    minuteOverride?: number,
    endMinuteOverride?: number,
    allDayOverride = false
  ) => {
    const date = dateOverride || selectedDate;
    const snappedStartMinutes = minuteOverride !== undefined ? Math.floor(minuteOverride / 30) * 30 : undefined;
    const snappedEndMinutes =
      endMinuteOverride !== undefined
        ? Math.max((snappedStartMinutes ?? endMinuteOverride) + 30, Math.ceil(endMinuteOverride / 30) * 30)
        : undefined;
    const start = allDayOverride
      ? "00:00"
      : snappedStartMinutes !== undefined
        ? toTime(snappedStartMinutes)
        : "09:00";
    const end = allDayOverride
      ? "23:59"
      : snappedEndMinutes !== undefined
        ? toTime(Math.min(23 * 60 + 59, snappedEndMinutes))
        : snappedStartMinutes !== undefined
          ? toTime(Math.min(23 * 60 + 59, snappedStartMinutes + 60))
          : "10:00";

    setEditingEventId(null);
    setEditingSource("manual");
    setEditingLinkedKey(null);
    setFormMode("onboard");
    setOnboardStep(0);
    setFormData({
      ...defaultEvent(date),
      startTime: start,
      endTime: end,
      allDay: allDayOverride,
    });
    setIsModalOpen(true);
  };

  const persistMyWorkTasks = (nextTasks: MyWorkTask[]) => {
    setMyWorkTasks(nextTasks);
    try {
      const raw = JSON.stringify(nextTasks);
      localStorage.setItem(MY_WORK_KEY, raw);
      window.dispatchEvent(
        new CustomEvent("delphi-localstorage-apply", {
          detail: { key: MY_WORK_KEY, raw },
        })
      );
    } catch {
      // ignore storage write failures
    }
  };

  const moveCalendarItem = async (
    item: CalendarItem,
    next: { date: string; startTime: string; endTime: string; allDay: boolean }
  ) => {
    if (item.source === "manual") {
      setEvents((prev) =>
        prev.map((event) =>
          event.id === item.refId
            ? {
                ...event,
                date: next.date,
                startTime: next.allDay ? "00:00" : next.startTime,
                endTime: next.allDay ? "23:59" : next.endTime,
                allDay: next.allDay,
              }
            : event
        )
      );
      return;
    }

    if (item.linkedKey) {
      const result = await applyLinkedWriteback(item.linkedKey, {
        date: next.date,
        startTime: next.allDay ? "00:00" : next.startTime,
        endTime: next.allDay ? "23:59" : next.endTime,
      });
      if (result.ok) {
        await runLinkedScheduleSync();
      }
      return;
    }

    const nextTasks = myWorkTasks.map((task) =>
      task.id === item.refId
        ? {
            ...task,
            date: next.date,
            startTime: next.allDay ? "" : next.startTime,
            endTime: next.allDay ? "" : next.endTime,
          }
        : task
    );
    persistMyWorkTasks(nextTasks);
  };

  const openEdit = (item: CalendarItem) => {
    setEditingEventId(item.refId);
    setEditingSource(item.source);
    setEditingLinkedKey(item.linkedKey || null);
    if (item.source === "manual") {
      const target = events.find((event) => event.id === item.refId);
      if (!target) return;
      setFormMode("onboard");
      setOnboardStep(0);
      setFormData({
        title: target.title,
        date: target.date,
        startTime: target.startTime,
        endTime: target.endTime,
        notes: target.notes || "",
        allDay: Boolean(target.allDay),
        color: target.color || "cyan",
      });
      setIsModalOpen(true);
      return;
    }
    setFormMode("onboard");
    setOnboardStep(0);
    setFormData({
      title: item.title,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      notes: item.notes || "",
      allDay: Boolean(item.allDay),
      color: item.color || "cyan",
    });
    setIsModalOpen(true);
  };

  const openMyWorkTaskFromGroup = (task: MyWorkTask) => {
    openEdit({
      id: `work-${task.id}`,
      source: "my-work",
      refId: task.id,
      title: task.title,
      date: task.date,
      startTime: task.startTime,
      endTime: task.endTime,
      notes: task.project,
      completed: task.completed,
      allDay: !hasTimedRange(task),
      color: "violet",
      linked: Boolean(task.linked),
      linkedKey: task.linkedKey,
      department: task.department,
    });
  };

  const deleteEvent = (eventId: number) => {
    if (editingSource === "my-work") return;
    setEvents(events.filter((event) => event.id !== eventId));
  };

  const saveEvent = async () => {
    const normalizedTitle = toSmartTitleCase(formData.title);
    if (!normalizedTitle) return;
    if (!formData.allDay && toMinutes(formData.endTime) <= toMinutes(formData.startTime)) return;

    const cleanEvent: Omit<CalendarEvent, "id"> = {
      ...formData,
      title: normalizedTitle,
      notes: (formData.notes || "").trim(),
      startTime: formData.allDay ? "00:00" : formData.startTime,
      endTime: formData.allDay ? "23:59" : formData.endTime,
    };

    if (editingEventId && editingSource === "my-work") {
      if (editingLinkedKey) {
        const result = await applyLinkedWriteback(editingLinkedKey, {
          date: cleanEvent.date,
          startTime: cleanEvent.startTime,
          endTime: cleanEvent.endTime,
        });
        if (result.ok) {
          await runLinkedScheduleSync();
        }
      }
    } else if (editingEventId) {
      setEvents(events.map((event) => (event.id === editingEventId ? { ...event, ...cleanEvent } : event)));
    } else {
      setEvents([...events, { id: Date.now(), ...cleanEvent }]);
    }

    localStorage.removeItem(CALENDAR_EVENT_DRAFT_KEY);
    setClearNextCalendarDraftLoad(true);
    setIsModalOpen(false);
    setEditingSource("manual");
    setEditingLinkedKey(null);
    setEditingEventId(null);
  };

  const onboardingSteps = ["Title", "Date", "Time", "Notes"] as const;
  const canAdvanceOnboardStep = () => {
    if (onboardStep === 0) return formData.title.trim().length > 0;
    if (onboardStep === 2 && !formData.allDay) return toMinutes(formData.endTime) > toMinutes(formData.startTime);
    return true;
  };

  const renderMonthView = () => {
    const month = visibleDate.getMonth();
    return (
      <Card className={cn("glass-hero-panel h-full overflow-hidden p-0", !embedded && "calendar-light-shell")}>
        <div className="grid grid-cols-7 border-b border-border/60 bg-white/60 px-3 py-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
            <div key={label} className="px-3 py-1">{label}</div>
          ))}
        </div>

        <div className="grid h-full grid-cols-7 grid-rows-6">
          {monthGridDays.map((day) => {
            const key = formatDateKey(day);
            const dayItems = filteredItems.filter((item) => item.date === key);
            const isCurrentMonth = day.getMonth() === month;
            const isSelected = key === selectedDate;
            const isToday = key === getTodayKey();
            const visibleChips = dayItems.slice(0, 3);
            const hiddenCount = Math.max(0, dayItems.length - visibleChips.length);

            return (
              <div
                key={key}
                className={cn(
                  "relative min-h-[154px] border-r border-b border-border/45 bg-white/56 p-3 text-left transition-colors hover:bg-primary/[0.04]",
                  isSelected && "bg-primary/[0.09]",
                  !isCurrentMonth && "opacity-55"
                )}
              >
                <button
                  onClick={() => {
                    setSelectedDate(key);
                    setVisibleDate(day);
                  }}
                  className="mb-3 flex w-full items-center justify-between"
                >
                  <span className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold", isToday && "bg-primary text-[hsl(220_30%_32%)] dark:text-primary-foreground")}>{day.getDate()}</span>
                  <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{dayItems.length} items</span>
                </button>

                <div className="space-y-1.5">
                  {visibleChips.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        openGroupedTaskItem(item);
                      }}
                      className={cn("block w-full rounded-xl px-2.5 py-2.5", getEventSurfaceClass(item))}
                    >
                      <div className="flex items-start gap-2">
                        <span className={cn("mt-0.5 h-2.5 w-2.5 rounded-full", eventAccentClass[item.color])} />
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-bold">{item.title}</p>
                          <p className="truncate text-[10px] font-medium opacity-85">{item.allDay ? "All day" : formatClock(item.startTime, timeFormat)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                  {hiddenCount > 0 && <p className="px-1 text-[11px] font-medium text-primary">+{hiddenCount} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  const renderTimeGrid = (days: Date[]) => {
    const dayCount = days.length;
    const gridTemplateColumns = `72px repeat(${dayCount}, minmax(0, 1fr))`;

    const dayData = days.map((day) => {
      const dayKey = formatDateKey(day);
      const items = filteredItems.filter((item) => item.date === dayKey);
      return {
        key: dayKey,
        allDay: items.filter((item) => item.allDay),
        placed: layoutOverlaps(items),
      };
    });

    return (
      <Card className={cn("glass-hero-panel h-full overflow-hidden p-0", !embedded && "calendar-light-shell")}>
        <div className="grid border-b border-border/60 bg-white/64" style={{ gridTemplateColumns }}>
          <div className="border-r border-border/50 p-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground">Time</div>
          {days.map((day) => {
            const key = formatDateKey(day);
            const today = key === getTodayKey();
            const selected = key === selectedDate;
            return (
              <button
                key={key}
                onClick={() => {
                  setSelectedDate(key);
                  if (viewMode === "day") setVisibleDate(day);
                }}
                className={cn("border-r border-border/50 p-3 text-center text-sm transition-colors hover:bg-primary/[0.05]", selected && "bg-primary/[0.09]", today && "text-primary font-semibold")}
              >
                <div className="text-sm font-semibold">{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
                <div className="text-xs text-muted-foreground">{day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
              </button>
            );
          })}
        </div>

        <div className="grid border-b border-border/60 bg-white/58" style={{ gridTemplateColumns }}>
          <div className="border-r border-border/50 px-2 py-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground">All Day</div>
          {dayData.map((day) => (
            <div key={`all-${day.key}`} className="min-h-[62px] border-r border-border/50 p-2.5">
              <div className="space-y-1">
                {day.allDay.slice(0, 2).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      openGroupedTaskItem(item);
                    }}
                      className={cn("block w-full rounded-xl px-3 py-2.5", getEventSurfaceClass(item))}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", eventAccentClass[item.color])} />
                      <span className="truncate text-[11px] font-bold">{item.title}</span>
                    </div>
                  </button>
                ))}
                {day.allDay.length > 2 && <p className="text-[11px] text-muted-foreground">+{day.allDay.length - 2} more</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="glass-scrollbar relative max-h-[64vh] overflow-auto">
          <div className="relative" style={{ height: `${24 * HOUR_ROW_PX}px` }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 grid"
                style={{ top: `${hour * HOUR_ROW_PX}px`, height: `${HOUR_ROW_PX}px`, gridTemplateColumns }}
              >
                <div className="border-r border-b border-border/45 bg-white/58 px-3 py-2 text-[11px] font-semibold text-foreground/70">
                  {formatClock(`${String(hour).padStart(2, "0")}:00`, timeFormat)}
                </div>
                {dayData.map((day) => (
                  <button
                    key={`${day.key}-${hour}`}
                    onClick={() => openCreate(day.key, hour * 60)}
                    className="border-r border-b border-border/35 bg-white/56 text-left hover:bg-primary/[0.03]"
                    aria-label={`Create event ${day.key} ${hour}:00`}
                  />
                ))}
              </div>
            ))}

            {dayData.map((day, dayIndex) =>
              day.key === nowMarker.todayKey ? (
                <div
                  key={`now-line-${day.key}`}
                  className="pointer-events-none absolute z-10"
                  style={{
                    top: nowMarker.top,
                    left: `calc(72px + (${dayIndex} * ((100% - 72px) / ${dayCount})))`,
                    width: `calc((100% - 72px) / ${dayCount})`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-rose-500 shadow-[0_0_12px_hsl(350_89%_60%/.5)]" />
                    <div className="h-[2px] flex-1 bg-rose-500/85" />
                  </div>
                </div>
              ) : null
            )}

            {dayData.map((day, dayIndex) =>
              day.placed.map((item) => {
                const start = toMinutes(item.startTime);
                const end = toMinutes(item.endTime);
                const top = (start / 60) * HOUR_ROW_PX;
                const height = Math.max(24, ((end - start) / 60) * HOUR_ROW_PX);
                const columnLeft = `calc(72px + (${dayIndex} * ((100% - 72px) / ${dayCount})))`;
                const laneWidth = `calc((((100% - 72px) / ${dayCount}) - 8px) / ${item.laneCount})`;
                const left = `calc(${columnLeft} + 4px + (${item.lane} * ${laneWidth}))`;

                return (
                  <button
                    key={item.id}
                    className={cn("absolute px-3 py-2.5", getEventSurfaceClass(item))}
                    style={{ top, height, left, width: laneWidth }}
                    onClick={() => {
                      openGroupedTaskItem(item);
                    }}
                  >
                    <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-2xl bg-current opacity-45" />
                    <div className="pl-1">
                      <div className="mb-1 flex items-center justify-between gap-1.5">
                        <p className="truncate text-[11px] font-bold">{item.title}</p>
                        {height >= 52 && (
                          <span className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] dark:bg-white/12">
                            {item.source === "manual" ? "Event" : "Task"}
                          </span>
                        )}
                      </div>
                      {height >= 44 && (
                        <p className="truncate text-[10px] font-medium opacity-90">
                          {formatClock(item.startTime, timeFormat)} - {formatClock(item.endTime, timeFormat)}
                        </p>
                      )}
                      {height >= 56 && item.notes && <p className="truncate text-[10px] opacity-85">{item.notes}</p>}
                      {height >= 74 && (
                        <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.09em] opacity-70">
                          {item.source === "manual" ? "Calendar" : "Schedule"}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </Card>
    );
  };

  const renderAgendaView = () => {
    const grouped = agendaItems.reduce<Record<string, CalendarItem[]>>((acc, item) => {
      acc[item.date] = acc[item.date] ? [...acc[item.date], item] : [item];
      return acc;
    }, {});

    const sortedDays = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

    return (
      <Card className={cn("glass-hero-panel h-full overflow-auto p-6", !embedded && "calendar-light-shell")}>
        <div className="space-y-6">
          {sortedDays.map((dayKey) => (
            <div key={dayKey}>
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold tracking-[0.08em] text-muted-foreground">{getDayLabel(parseDateKey(dayKey))}</h3>
              </div>
              <div className="space-y-2">
                {grouped[dayKey]
                  .slice()
                  .sort((a, b) => (a.allDay ? -1 : b.allDay ? 1 : toMinutes(a.startTime) - toMinutes(b.startTime)))
                  .map((item) => (
                    <button
                      key={item.id}
                      className={cn("flex w-full items-center justify-between p-4", getEventSurfaceClass(item))}
                      onClick={() => {
                        openGroupedTaskItem(item);
                      }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{item.title}</p>
                        <p className="mt-1 text-sm opacity-85">
                          {item.allDay ? "All day" : `${formatClock(item.startTime, timeFormat)} - ${formatClock(item.endTime, timeFormat)}`}
                          {item.notes ? ` • ${item.notes}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 rounded-full bg-black/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] dark:bg-white/10">
                        {item.source === "manual" ? "Event" : "Task"}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {sortedDays.length === 0 && <p className="text-sm text-muted-foreground">No upcoming events in this range.</p>}
        </div>
      </Card>
    );
  };

  const renderYearView = () => {
    const year = visibleDate.getFullYear();
    const monthStarts = Array.from({ length: 12 }, (_, index) => new Date(year, index, 1, 12, 0, 0));

    return (
      <Card className={cn("glass-hero-panel h-full overflow-hidden p-3", !embedded && "calendar-light-shell")}>
        <div className="grid h-full min-h-0 grid-cols-4 grid-rows-3 gap-2">
          {monthStarts.map((monthStart) => {
            const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
            const month = monthStart.getMonth();
            const firstCell = startOfWeek(monthStart);
            const days = Array.from({ length: 42 }, (_, index) => addDays(firstCell, index));

            return (
              <div
                key={monthLabel}
                className="flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-white/40 bg-[linear-gradient(180deg,hsl(0_0%_100%/.64),hsl(210_100%_97%/.4))] p-2.5 shadow-[inset_0_1px_0_hsl(0_0%_100%/.86),0_20px_40px_-34px_hsl(214_70%_58%/.28)] backdrop-blur-xl dark:border-white/15 dark:bg-[linear-gradient(180deg,hsl(220_30%_22%/.84),hsl(221_32%_15%/.76))]"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <h3 className="truncate pr-2 text-[11px] font-semibold tracking-[0.03em] text-[hsl(221_42%_36%)] dark:text-foreground">{monthLabel}</h3>
                  <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.08em] text-[hsl(220_28%_50%)] dark:text-muted-foreground">
                    {days.filter((day) => day.getMonth() === month).length} days
                  </span>
                </div>

                <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-[hsl(219_46%_49%)] dark:text-muted-foreground">
                  {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
                    <div key={`${monthLabel}-${label}-${index}`} className="py-0.5">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-0.5">
                  {days.map((day) => {
                    const key = formatDateKey(day);
                    const isCurrentMonth = day.getMonth() === month;
                    const isToday = key === getTodayKey();
                    const isSelected = key === selectedDate;
                    const itemCount = filteredItems.filter((item) => item.date === key).length;

                    return (
                      <button
                        key={`${monthLabel}-${key}`}
                        onClick={() => {
                          setSelectedDate(key);
                          setVisibleDate(day);
                          setViewMode("day");
                        }}
                        className={cn(
                          "relative flex min-h-0 items-center justify-center rounded-lg border border-transparent px-0.5 py-0.5 text-center text-[hsl(220_30%_52%)] transition-all hover:border-primary/30 hover:bg-primary/[0.08] dark:text-foreground",
                          isSelected && "border-primary/35 bg-primary/[0.11]",
                          isToday && "bg-primary/[0.12]",
                          !isCurrentMonth && "text-[hsl(220_22%_72%)] dark:opacity-35"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-[hsl(220_32%_48%)] dark:text-foreground",
                            isSelected && "text-[hsl(216_78%_38%)] dark:text-primary-foreground",
                            isToday && "bg-primary text-[hsl(220_30%_32%)] dark:text-primary-foreground"
                          )}
                        >
                          {day.getDate()}
                        </span>
                        {itemCount > 0 && (
                          <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary/85" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  const selectedDateObj = parseDateKey(selectedDate);

  return (
    <div className={embedded ? "schedule-light-page h-full min-h-0 relative overflow-hidden" : "app-atmosphere-page app-light-page calendar-light-page min-h-screen relative overflow-hidden"}>
      <div className={embedded ? "schedule-light-frame relative flex h-full flex-col gap-4 p-2 xl:flex-row" : "app-light-frame relative flex min-h-screen flex-col gap-5 xl:h-[100vh] xl:flex-row"}>
        <div className="order-1 flex min-w-0 flex-1 flex-col gap-4">
          <Card className={cn("overflow-hidden p-4", embedded ? "schedule-light-shell schedule-light-surface" : "glass-hero-panel calendar-light-shell")}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-3 xl:flex-row xl:items-center">
                <div className="min-w-0">
                  {!embedded && <AnimatedTitle text="Calendar" className="app-light-title" />}
                </div>

                <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as CalendarViewMode)} className="w-full max-w-[640px]">
                  <TabsList className={cn("grid grid-cols-5", embedded && "schedule-light-mode-toggle schedule-calendar-tabs")}>
                    <TabsTrigger value="day" className={cn("gap-1.5", embedded && "schedule-light-mode-pill")}><Clock3 className="h-4 w-4" />Day</TabsTrigger>
                    <TabsTrigger value="week" className={cn("gap-1.5", embedded && "schedule-light-mode-pill")}><Rows3 className="h-4 w-4" />Week</TabsTrigger>
                    <TabsTrigger value="month" className={cn("gap-1.5", embedded && "schedule-light-mode-pill")}><CalendarDays className="h-4 w-4" />Month</TabsTrigger>
                    <TabsTrigger value="year" className={cn("gap-1.5", embedded && "schedule-light-mode-pill")}><CalendarRange className="h-4 w-4" />Year</TabsTrigger>
                    <TabsTrigger value="agenda" className={cn("gap-1.5", embedded && "schedule-light-mode-pill")}><ListFilter className="h-4 w-4" />Agenda</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className={cn("flex flex-wrap items-center gap-2 xl:justify-end", embedded && "-mt-1")}>
                {conflictCount > 0 && (
                  <Badge variant="outline" className="h-8 rounded-full border-amber-500/40 bg-amber-500/10 px-3 text-xs text-amber-600 dark:text-amber-300">
                    {conflictCount} overlap{conflictCount > 1 ? "s" : ""}
                  </Badge>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("h-9 rounded-full px-3 text-sm", embedded && "schedule-light-pill")}>
                      {getDateHeaderLabel(viewMode, visibleDate)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-auto rounded-2xl border border-white/45 bg-[linear-gradient(180deg,hsl(0_0%_100%/.92),hsl(0_0%_100%/.78))] p-2 shadow-[inset_0_1px_0_hsl(0_0%_100%/.88)] backdrop-blur-xl dark:border-white/18 dark:bg-[linear-gradient(180deg,hsl(220_30%_22%/.9),hsl(221_32%_15%/.84))]"
                  >
                    <Calendar
                      mode="single"
                      selected={visibleDate}
                      onSelect={(date) => {
                        if (!date) return;
                        setVisibleDate(date);
                        setSelectedDate(formatDateKey(date));
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="outline" onClick={jumpToToday} className={cn("rounded-full", embedded && "schedule-light-pill")}>Today</Button>
                <Button size="icon" variant="outline" onClick={() => navigateRange(-1)} className={cn(embedded && "schedule-light-pill")}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" onClick={() => navigateRange(1)} className={cn(embedded && "schedule-light-pill")}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button onClick={() => openCreate(selectedDate)} className={cn("h-10 rounded-full px-5 text-sm font-semibold", embedded ? "schedule-light-add" : "add-action")}>+ Add Event</Button>
              </div>
            </div>
          </Card>

          <div className="min-h-0 flex-1">
            {(viewMode === "month" || viewMode === "week" || viewMode === "day") && (
              <DelphiCalendarEngine
                viewMode={viewMode}
                visibleDate={visibleDate}
                selectedDate={selectedDate}
                items={filteredItems}
                timeFormat={timeFormat}
                onSelectDate={setSelectedDate}
                onVisibleDateChange={setVisibleDate}
                onViewModeChange={setViewMode}
                onCreate={openCreate}
                onEdit={openGroupedTaskItem}
                onMoveItem={moveCalendarItem}
              />
            )}
            {viewMode === "year" && renderYearView()}
            {viewMode === "agenda" && renderAgendaView()}
          </div>
        </div>

        {!rightPanelHidden && <Card className={cn("order-2 w-full shrink-0 overflow-hidden p-4 xl:sticky xl:top-6 xl:w-[320px] 2xl:w-[360px]", embedded ? "schedule-light-shell schedule-light-surface" : "glass-hero-panel calendar-light-shell")}>
          <Button onClick={() => openCreate()} className="mb-4 h-10 w-full rounded-full text-sm font-semibold">
            <Plus className="mr-1.5 h-4 w-4" /> Create
          </Button>

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search events"
            className="mb-4"
          />

          <div className="mb-3 flex items-center justify-between">
            <Button size="icon" variant="ghost" onClick={() => setVisibleDate((prev) => addDays(prev, -30))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm font-semibold">{getMonthLabel(visibleDate)}</p>
            <Button size="icon" variant="ghost" onClick={() => setVisibleDate((prev) => addDays(prev, 30))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground">MONTH LOAD</p>
            <div className="relative">
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--glass-stroke-soft)] bg-[linear-gradient(180deg,hsl(220_28%_100%/.12),hsl(220_28%_100%/.05))] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary backdrop-blur-xl"
                aria-label="Show workload density"
                aria-pressed={densityPreviewPinned}
                onClick={() => {
                  setDensityPreviewPinned((current) => {
                    const next = !current;
                    setShowDensityPreview(next);
                    return next;
                  });
                }}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              <div className={cn("pointer-events-none absolute right-0 top-9 z-20 flex min-w-[132px] flex-col gap-2 rounded-[22px] border border-[var(--glass-stroke)] bg-[linear-gradient(180deg,hsl(220_28%_100%/.18),hsl(220_28%_100%/.07))] p-3 opacity-0 shadow-[var(--glass-shadow-soft)] backdrop-blur-2xl transition-opacity duration-200", showDensityPreview && "opacity-100")}>
                {[
                  ["free", "0 tasks", "Free day"],
                  ["light", "1-4 tasks", "Light"],
                  ["moderate", "5-9 tasks", "Moderate"],
                  ["busy", "10-14 tasks", "Busy"],
                  ["overloaded", "15+ tasks", "Overloaded"],
                ].map(([key, range, label]) => (
                  <div key={key} className="flex items-center gap-2 text-[11px]">
                    <span className={cn("h-2.5 w-2.5 rounded-full", densityStyles[key as keyof typeof densityStyles])} />
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="text-muted-foreground">{range}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
            {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
              <div key={day} className="py-1">{day}</div>
            ))}
            {monthGridDays.map((day) => {
              const key = formatDateKey(day);
              const isCurrentMonth = day.getMonth() === visibleDate.getMonth();
              const isSelected = key === selectedDate;
              const isToday = key === getTodayKey();
              const densityCount = miniCalendarDensity.get(key) || 0;
              const densityLevel =
                densityCount === 0
                  ? "free"
                  : densityCount <= 4
                    ? "light"
                    : densityCount <= 9
                      ? "moderate"
                      : densityCount <= 14
                        ? "busy"
                        : "overloaded";
              return (
                <button
                  key={`mini-${key}`}
                  onClick={() => {
                    setSelectedDate(key);
                    setVisibleDate(day);
                  }}
                  className={cn(
                    "relative h-8 rounded-lg text-xs transition-colors",
                    isSelected && "bg-primary text-primary-foreground",
                    !isSelected && "hover:bg-secondary",
                    !isCurrentMonth && "opacity-45",
                    isToday && !isSelected && "border border-primary/45"
                  )}
                >
                  {isCurrentMonth && !isSelected ? (
                    <span
                      className={cn(
                        "absolute inset-1 rounded-full opacity-0 transition-opacity duration-200",
                        showDensityPreview && "opacity-100",
                        densityStyles[densityLevel]
                      )}
                    />
                  ) : null}
                  <span className="relative z-10">{day.getDate()}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-3 border-t border-[var(--glass-stroke-soft)] pt-4">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">LAYERS</p>
            <div className="glass-subpanel flex items-center gap-2 rounded-[18px] px-2 py-2">
              <Checkbox checked={showManual} onCheckedChange={(checked) => setShowManual(Boolean(checked))} />
              <span className="text-sm">Delphi Calendar</span>
            </div>
            <div className="glass-subpanel flex items-center gap-2 rounded-[18px] px-2 py-2">
              <Checkbox checked={showMyWork} onCheckedChange={(checked) => setShowMyWork(Boolean(checked))} />
              <span className="text-sm">Schedule Tasks</span>
            </div>
          </div>

          <div className="mt-5 space-y-2 border-t border-[var(--glass-stroke-soft)] pt-4">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">SELECTED DAY</p>
            <p className="text-sm font-semibold">{getDayLabel(selectedDateObj)}</p>
            <p className="text-xs text-muted-foreground">{selectedDayItems.length} scheduled blocks</p>
            {conflictCount > 0 && <p className="text-xs text-amber-500">{conflictCount} overlap conflict{conflictCount > 1 ? "s" : ""}</p>}
            <div className="glass-scrollbar mt-3 max-h-[36vh] space-y-2 overflow-auto pr-1 xl:max-h-[42vh]">
              {selectedDayTimeline.length === 0 ? (
                <div className="glass-list-surface rounded-[24px] border-dashed px-4 py-5 text-sm text-muted-foreground">
                  No scheduled blocks for this day.
                </div>
              ) : (
                selectedDayTimeline.map((item) => (
                  <button
                    key={`summary-${item.id}`}
                    onClick={() => openGroupedTaskItem(item)}
                    className={cn("flex w-full items-start gap-3 p-3.5", getEventSurfaceClass(item))}
                  >
                    <div className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", eventAccentClass[item.color])} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{item.title}</p>
                        <Badge variant="outline" className="text-[10px]">{item.source === "manual" ? "Manual" : "Schedule"}</Badge>
                      </div>
                      <p className="mt-1 text-xs opacity-75">
                        {item.allDay ? "All day" : `${formatClock(item.startTime, timeFormat)} - ${formatClock(item.endTime, timeFormat)}`}
                      </p>
                      {item.notes && <p className="mt-1 line-clamp-2 text-xs opacity-70">{item.notes}</p>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </Card>}
      </div>

      <Button
        size="icon"
        variant="outline"
        onClick={() => setRightPanelHidden((prev) => !prev)}
        className={embedded ? "absolute bottom-1 right-1 z-50 h-10 w-10 rounded-full border-white/45 bg-white/60 backdrop-blur-xl dark:border-white/20 dark:bg-[hsl(220_31%_20%/.72)]" : "absolute bottom-1 right-1 z-50 h-10 w-10 rounded-full border-white/45 bg-white/60 backdrop-blur-xl md:bottom-2 md:right-2 xl:bottom-3 xl:right-3 dark:border-white/20 dark:bg-[hsl(220_31%_20%/.72)]"}
        aria-label={rightPanelHidden ? "Show panel" : "Collapse panel"}
      >
        {rightPanelHidden ? <PanelRightOpen className="h-4.5 w-4.5" /> : <PanelRightClose className="h-4.5 w-4.5" />}
      </Button>

      <Dialog open={Boolean(groupedTaskDialog)} onOpenChange={(open) => !open && setGroupedTaskDialog(null)}>
        <DialogContent className="form-dialog-shell max-w-md">
          <DialogHeader>
            <DialogTitle>{groupedTaskDialog?.title ?? "Grouped Tasks"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {groupedTaskDialog?.tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  setGroupedTaskDialog(null);
                  openMyWorkTaskFromGroup(task);
                }}
                className={cn("flex w-full items-start justify-between rounded-xl p-3 text-left", getEventSurfaceClass({
                  id: `work-${task.id}`,
                  source: "my-work",
                  refId: task.id,
                  title: task.title,
                  date: task.date,
                  startTime: task.startTime,
                  endTime: task.endTime,
                  notes: task.project,
                  completed: task.completed,
                  allDay: !hasTimedRange(task),
                  color: "violet",
                  department: task.department,
                }))}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{task.title}</p>
                  <p className="mt-1 text-xs opacity-80">
                    {task.department} • {hasTimedRange(task) ? `${formatClock(task.startTime, timeFormat)} - ${formatClock(task.endTime, timeFormat)}` : "No time assigned"}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">Task</Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="form-dialog-shell max-w-xl p-0">
          <div className="p-6 pb-4">
            <DialogHeader>
              <DialogTitle>{editingEventId ? "Edit Calendar Event" : "Add Calendar Event"}</DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-4 px-6 pb-6 relative">
            <div className="absolute right-6 top-0 z-10">
              <Tabs value={formMode} onValueChange={(value) => setFormMode(value as FormMode)}>
                <TabsList className="form-mode-tabs">
                  <TabsTrigger value="onboard" className="h-6 rounded-full px-3 text-[11px] font-semibold">Guided</TabsTrigger>
                  <TabsTrigger value="all" className="h-6 rounded-full px-3 text-[11px] font-semibold">Full Form</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {formMode === "onboard" ? (
              <div className="form-surface p-4">
                <div className="mb-4">
                  <div className="h-2 rounded-full bg-background/65">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,hsl(191_100%_72%),hsl(215_93%_63%))] shadow-[0_0_14px_hsl(199_100%_72%/.45)] transition-all"
                      style={{ width: `${((onboardStep + 1) / onboardingSteps.length) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="mb-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground">{onboardingSteps[onboardStep]}</div>

                {onboardStep === 0 && (
                  <Input value={formData.title} onChange={(event) => setFormData({ ...formData, title: toSmartTitleCaseLive(event.target.value) })} onBlur={(event) => setFormData({ ...formData, title: toSmartTitleCase(event.target.value) })} />
                )}
                {onboardStep === 1 && (
                  <DatePickerField
                    value={formData.date}
                    onChange={(value) => setFormData({ ...formData, date: value })}
                  />
                )}
                {onboardStep === 2 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={Boolean(formData.allDay)}
                        onCheckedChange={(checked) => setFormData({ ...formData, allDay: Boolean(checked) })}
                      />
                      <span className="text-sm">All day</span>
                    </div>
                    {!formData.allDay && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Start</Label>
                          <Input type="time" value={formData.startTime} onChange={(event) => setFormData({ ...formData, startTime: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>End</Label>
                          <Input type="time" value={formData.endTime} onChange={(event) => setFormData({ ...formData, endTime: event.target.value })} />
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-5 gap-2">
                      {(["cyan", "violet", "emerald", "rose", "amber"] as EventColor[]).map((color) => (
                        <button
                          key={color}
                          onClick={() => setFormData({ ...formData, color })}
                          className={cn(
                            "h-8 rounded-lg border text-[10px] font-semibold uppercase tracking-[0.06em]",
                            colorClass[color],
                            formData.color === color ? "ring-2 ring-primary/65" : "opacity-75"
                          )}
                        >
                          {color}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {onboardStep === 3 && (
                  <Textarea value={formData.notes} onChange={(event) => setFormData({ ...formData, notes: event.target.value })} className="min-h-[100px]" />
                )}

                <div className="mt-5 flex items-center justify-between">
                  <Button variant="outline" onClick={() => setOnboardStep((step) => Math.max(0, step - 1))} disabled={onboardStep === 0}>Back</Button>
                  {onboardStep < onboardingSteps.length - 1 ? (
                    <Button className="h-10 rounded-full px-6" onClick={() => setOnboardStep((step) => Math.min(onboardingSteps.length - 1, step + 1))} disabled={!canAdvanceOnboardStep()}>Next</Button>
                  ) : (
                    <Button className="h-10 rounded-full px-6" onClick={saveEvent}>{editingEventId ? "Update Event" : "Create Event"}</Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="form-surface p-5">
                <div className="space-y-4">
                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">EVENT BASICS</p>
                    <Input
                      value={formData.title}
                      onChange={(event) => setFormData({ ...formData, title: toSmartTitleCaseLive(event.target.value) })}
                      onBlur={(event) => setFormData({ ...formData, title: toSmartTitleCase(event.target.value) })}
                      placeholder="Event Title"
                      className="h-11"
                    />
                  </section>

                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">DATE + TIME</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <DatePickerField
                        value={formData.date}
                        onChange={(value) => setFormData({ ...formData, date: value })}
                        triggerClassName="h-11"
                      />
                      <div className="flex h-11 items-center rounded-xl border border-border bg-background/65 px-3">
                        <Label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={Boolean(formData.allDay)}
                            onCheckedChange={(checked) => setFormData({ ...formData, allDay: Boolean(checked) })}
                          />
                          All day
                        </Label>
                      </div>
                    </div>
                    {!formData.allDay && (
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Input
                          type="time"
                          value={formData.startTime}
                          onChange={(event) => setFormData({ ...formData, startTime: event.target.value })}
                          className="h-11"
                        />
                        <Input
                          type="time"
                          value={formData.endTime}
                          onChange={(event) => setFormData({ ...formData, endTime: event.target.value })}
                          className="h-11"
                        />
                      </div>
                    )}
                    <div className="mt-3 grid grid-cols-5 gap-2">
                      {(["cyan", "violet", "emerald", "rose", "amber"] as EventColor[]).map((color) => (
                        <button
                          key={color}
                          onClick={() => setFormData({ ...formData, color })}
                          className={cn(
                            "h-8 rounded-lg border text-[10px] font-semibold uppercase tracking-[0.06em]",
                            colorClass[color],
                            formData.color === color ? "ring-2 ring-primary/65" : "opacity-75"
                          )}
                        >
                          {color}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">DETAILS</p>
                    <Textarea
                      value={formData.notes}
                      onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
                      className="min-h-[100px]"
                      placeholder="Notes"
                    />
                  </section>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  {editingEventId && editingSource === "manual" && (
                    <Button variant="outline" className="text-destructive" onClick={() => {
                      deleteEvent(editingEventId);
                      setIsModalOpen(false);
                    }}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                  <Button onClick={saveEvent}>{editingEventId ? "Update Event" : "Create Event"}</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
