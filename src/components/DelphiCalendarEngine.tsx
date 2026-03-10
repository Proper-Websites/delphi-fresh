import { useEffect, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DateClickArg,
  DatesSetArg,
  DayHeaderContentArg,
  EventChangeArg,
  EventClickArg,
  EventContentArg,
  SelectArg,
} from "@fullcalendar/core";
import { cn } from "@/lib/utils";

export type DelphiCalendarViewMode = "day" | "week" | "month";
export type DelphiCalendarTimeFormat = "12h" | "24h";
export type DelphiCalendarSourceLayer = "manual" | "my-work";
export type DelphiCalendarEventColor = "cyan" | "violet" | "emerald" | "rose" | "amber";

export interface DelphiCalendarEngineItem {
  id: string;
  source: DelphiCalendarSourceLayer;
  refId: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
  completed?: boolean;
  allDay: boolean;
  color: DelphiCalendarEventColor;
  linked?: boolean;
  linkedKey?: string;
  grouped?: boolean;
}

interface DelphiCalendarEngineProps {
  viewMode: DelphiCalendarViewMode;
  visibleDate: Date;
  selectedDate: string;
  items: DelphiCalendarEngineItem[];
  timeFormat: DelphiCalendarTimeFormat;
  onSelectDate: (dateKey: string) => void;
  onVisibleDateChange: (date: Date) => void;
  onViewModeChange?: (viewMode: DelphiCalendarViewMode) => void;
  onCreate: (dateOverride?: string, minuteOverride?: number, endMinuteOverride?: number, allDayOverride?: boolean) => void;
  onEdit: (item: DelphiCalendarEngineItem) => void;
  onMoveItem: (
    item: DelphiCalendarEngineItem,
    next: { date: string; startTime: string; endTime: string; allDay: boolean }
  ) => void | Promise<void>;
}

const viewNameMap: Record<DelphiCalendarViewMode, string> = {
  day: "timeGridDay",
  week: "timeGridWeek",
  month: "dayGridMonth",
};

const colorClassMap: Record<DelphiCalendarEventColor, string> = {
  cyan: "delphi-fc-event--cyan",
  violet: "delphi-fc-event--violet",
  emerald: "delphi-fc-event--emerald",
  rose: "delphi-fc-event--rose",
  amber: "delphi-fc-event--amber",
};

const buildIso = (date: string, time: string) => `${date}T${time}:00`;
const addOneDay = (date: string) => {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString().slice(0, 10);
};

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const isValidDateKey = (value: string | undefined | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
};

const hasValidTime = (value: string | undefined | null) => Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
const toLocalDateKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const todayKey = () => toLocalDateKey(new Date());
const minutesToTime = (minutesRaw: number) => {
  const minutes = Math.max(0, Math.min(23 * 60 + 59, minutesRaw));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

export default function DelphiCalendarEngine({
  viewMode,
  visibleDate,
  selectedDate,
  items,
  timeFormat,
  onSelectDate,
  onVisibleDateChange,
  onViewModeChange,
  onCreate,
  onEdit,
  onMoveItem,
}: DelphiCalendarEngineProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const suppressDatesSet = useRef(false);

  const fullCalendarEvents = useMemo(
    () =>
      items
        .filter((item) => isValidDateKey(item.date))
        .map((item) => {
          const hasTimedRange = hasValidTime(item.startTime) && hasValidTime(item.endTime);
          const allDay = item.allDay || !hasTimedRange || timeToMinutes(item.endTime) <= timeToMinutes(item.startTime);
          return {
            id: item.id,
            title: item.title,
            start: allDay ? item.date : buildIso(item.date, item.startTime),
            end: allDay ? addOneDay(item.date) : buildIso(item.date, item.endTime),
            allDay,
            editable: !item.grouped,
            durationEditable: !item.grouped,
            startEditable: !item.grouped,
            classNames: [
              "delphi-fc-event",
              colorClassMap[item.color],
              item.source === "my-work" ? "delphi-fc-event--task" : "delphi-fc-event--manual",
            ],
            extendedProps: {
              item: { ...item, allDay },
            },
          };
        }),
    [items]
  );

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    const targetView = viewNameMap[viewMode];
    if (api.view.type !== targetView) {
      suppressDatesSet.current = true;
      api.changeView(targetView);
    }
    const targetDate = toLocalDateKey(visibleDate);
    if (toLocalDateKey(api.getDate()) !== targetDate) {
      suppressDatesSet.current = true;
      api.gotoDate(visibleDate);
    }
  }, [viewMode, visibleDate]);

  const handleDatesSet = (arg: DatesSetArg) => {
    if (suppressDatesSet.current) {
      suppressDatesSet.current = false;
      return;
    }
    const nextVisible = new Date(arg.view.currentStart || arg.start);
    onVisibleDateChange(nextVisible);
  };

  const handleDateClick = (arg: DateClickArg) => {
    const dateKey = arg.dateStr.slice(0, 10);
    onSelectDate(dateKey);

    if (viewMode === "month") {
      onVisibleDateChange(arg.date);
      onViewModeChange?.("day");
      return;
    }

    const clickedMinutes = arg.allDay ? undefined : arg.date.getHours() * 60 + arg.date.getMinutes();
    onCreate(dateKey, clickedMinutes);
  };

  const handleEventClick = (arg: EventClickArg) => {
    const item = arg.event.extendedProps.item as DelphiCalendarEngineItem | undefined;
    if (!item) return;
    onSelectDate(item.date);
    onEdit(item);
  };

  const handleSelect = (arg: SelectArg) => {
    const dateKey = arg.startStr.slice(0, 10);
    onSelectDate(dateKey);
    const isAllDay = Boolean(arg.allDay);
    if (isAllDay) {
      onCreate(dateKey, undefined, undefined, true);
      return;
    }
    const startMinutes = arg.start.getHours() * 60 + arg.start.getMinutes();
    const endDate = arg.end ?? new Date(arg.start.getTime() + 60 * 60 * 1000);
    let endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
    if (endDate.toDateString() !== arg.start.toDateString()) {
      endMinutes = 23 * 60 + 59;
    }
    onCreate(dateKey, startMinutes, endMinutes, false);
  };

  const handleEventChange = (arg: EventChangeArg) => {
    const item = arg.event.extendedProps.item as DelphiCalendarEngineItem | undefined;
    if (!item || !arg.event.start) return;
    const nextDate = toLocalDateKey(arg.event.start);
    const allDay = Boolean(arg.event.allDay);
    const endDate = arg.event.end ?? arg.event.start;
    const startTime = allDay ? "00:00" : minutesToTime(arg.event.start.getHours() * 60 + arg.event.start.getMinutes());
    const endTime = allDay
      ? "23:59"
      : minutesToTime(
          endDate.toDateString() !== arg.event.start.toDateString()
            ? 23 * 60 + 59
            : endDate.getHours() * 60 + endDate.getMinutes()
        );
    onSelectDate(nextDate);
    void onMoveItem(item, { date: nextDate, startTime, endTime, allDay });
  };

  const renderEventContent = (arg: EventContentArg) => {
    const item = arg.event.extendedProps.item as DelphiCalendarEngineItem;
    const compactTimeGrid = arg.view.type === "timeGridWeek" || arg.view.type === "timeGridDay";
    const showMeta = arg.view.type !== "dayGridMonth" && !compactTimeGrid;
    return (
      <div className="delphi-fc-event-content">
        <div className="delphi-fc-event-topline">
          <span className="delphi-fc-event-title">{arg.event.title}</span>
          {showMeta && (
            <span className="delphi-fc-event-kind">{item.source === "manual" ? "Event" : "Task"}</span>
          )}
        </div>
        {showMeta && !item.allDay && (
          <div className="delphi-fc-event-time">
            {timeFormat === "24h"
              ? `${item.startTime} - ${item.endTime}`
              : `${arg.timeText}${item.endTime ? ` - ${new Date(buildIso(item.date, item.endTime)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}`}
          </div>
        )}
        {showMeta && item.notes ? <div className="delphi-fc-event-notes">{item.notes}</div> : null}
      </div>
    );
  };

  const renderDayHeader = (arg: DayHeaderContentArg) => {
    if (viewMode === "month") return arg.text;

    const dateKey = toLocalDateKey(arg.date);
    const isToday = dateKey === todayKey();
    const weekday = arg.date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
    const dayNumber = arg.date.toLocaleDateString("en-US", { day: "numeric" });

    return (
      <div className="delphi-fc-day-header">
        <span className={cn("delphi-fc-day-header-weekday", isToday && "delphi-fc-day-header-weekday--today")}>
          {weekday}
        </span>
        <span className={cn("delphi-fc-day-header-date", isToday && "delphi-fc-day-header-date--today")}>
          {dayNumber}
        </span>
      </div>
    );
  };

  return (
    <div className={cn("delphi-fc-shell", `delphi-fc-shell--${viewMode}`)}>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={viewNameMap[viewMode]}
        initialDate={visibleDate}
        headerToolbar={false}
        events={fullCalendarEvents}
        nowIndicator
        allDaySlot
        allDayText=""
        editable
        selectable={viewMode !== "month"}
        selectMirror
        unselectAuto
        weekends
        expandRows
        dayMaxEventRows={4}
        fixedWeekCount={false}
        showNonCurrentDates
        slotDuration="00:30:00"
        slotLabelInterval="01:00:00"
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        slotLabelFormat={timeFormat === "24h" ? { hour: "numeric", hour12: false } : { hour: "numeric", meridiem: "short" }}
        height="100%"
        timeZone="local"
        dateClick={handleDateClick}
        select={handleSelect}
        eventClick={handleEventClick}
        eventDrop={handleEventChange}
        eventResize={handleEventChange}
        datesSet={handleDatesSet}
        dayHeaderFormat={viewMode === "month" ? { weekday: "short" } : { weekday: "short", month: "short", day: "numeric" }}
        dayHeaderContent={renderDayHeader}
        eventContent={renderEventContent}
        eventClassNames={(arg) =>
          cn(arg.event.startStr.slice(0, 10) === selectedDate && "delphi-fc-event--selected")
        }
      />
    </div>
  );
}
