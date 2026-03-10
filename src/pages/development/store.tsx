import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { Task, Sprint, Filters, ViewType, SavedView, SortOption, GroupBy, Role } from "./types";
import { toast } from "sonner";

interface PMState {
  tasks: Task[];
  sprints: Sprint[];
  filters: Filters;
  view: ViewType;
  savedViews: SavedView[];
  sort: SortOption | null;
  groupBy: GroupBy | null;
  role: Role;
  wipLimits: Record<string, number | undefined>; // by status
  selectedTaskId?: string;
}

type Action =
  | { type: "SET_VIEW"; view: ViewType }
  | { type: "ADD_TASK"; task: Task }
  | { type: "UPDATE_TASK"; id: string; patch: Partial<Task> }
  | { type: "DELETE_TASK"; id: string }
  | { type: "BULK_UPDATE"; ids: string[]; patch: Partial<Task> }
  | { type: "SET_FILTERS"; filters: Filters }
  | { type: "SET_SORT"; sort: SortOption | null }
  | { type: "SET_GROUP"; groupBy: GroupBy | null }
  | { type: "SAVE_VIEW"; view: SavedView }
  | { type: "DELETE_SAVED_VIEW"; id: string }
  | { type: "SET_ROLE"; role: Role }
  | { type: "MOVE_STATUS"; id: string; status: Task["status"] }
  | { type: "SELECT_TASK"; id?: string };

const initialState: PMState = {
  tasks: [],
  sprints: [],
  filters: { statuses: ["backlog", "in_progress", "blocked", "done"], assignees: [], tags: [], priorities: ["low", "medium", "high", "urgent"] },
  view: "current",
  savedViews: [],
  sort: null,
  groupBy: null,
  role: "owner",
  wipLimits: { in_progress: 8 },
};

function reducer(state: PMState, action: Action): PMState {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.view };
    case "ADD_TASK":
      return { ...state, tasks: [action.task, ...state.tasks] };
    case "UPDATE_TASK": {
      const tasks = state.tasks.map((t) => (t.id === action.id ? { ...t, ...action.patch, updatedAt: new Date().toISOString() } : t));
      return { ...state, tasks };
    }
    case "DELETE_TASK":
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) };
    case "BULK_UPDATE": {
      const set = new Set(action.ids);
      return { ...state, tasks: state.tasks.map((t) => (set.has(t.id) ? { ...t, ...action.patch, updatedAt: new Date().toISOString() } : t)) };
    }
    case "SET_FILTERS":
      return { ...state, filters: action.filters };
    case "SET_SORT":
      return { ...state, sort: action.sort };
    case "SET_GROUP":
      return { ...state, groupBy: action.groupBy };
    case "SAVE_VIEW": {
      const others = state.savedViews.filter((v) => v.id !== action.view.id);
      return { ...state, savedViews: [action.view, ...others] };
    }
    case "DELETE_SAVED_VIEW":
      return { ...state, savedViews: state.savedViews.filter((v) => v.id !== action.id) };
    case "SET_ROLE":
      return { ...state, role: action.role };
    case "MOVE_STATUS": {
      const task = state.tasks.find((t) => t.id === action.id);
      if (!task) return state;
      // Prevent moving to done if dependencies open
      if (action.status === "done" && task.dependencies.some((depId) => state.tasks.find((x) => x.id === depId && x.status !== "done"))) {
        toast.warning("Blocked by dependency. Complete blockers first.");
        return state;
      }
      return reducer(state, { type: "UPDATE_TASK", id: action.id, patch: { status: action.status } });
    }
    case "SELECT_TASK":
      return { ...state, selectedTaskId: action.id };
    default:
      return state;
  }
}

const PMContext = createContext<{ state: PMState; dispatch: React.Dispatch<Action> } | null>(null);

export function PMProvider({ children, seed }: { children: React.ReactNode; seed?: { tasks?: Task[]; sprints?: Sprint[] } }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // hydrate from localStorage
  useEffect(() => {
    const raw = localStorage.getItem("pm_state_v1");
    if (raw) {
      try {
        const stored = JSON.parse(raw) as Partial<PMState>;
        dispatch({ type: "SET_VIEW", view: stored.view ?? "current" });
        if (stored.filters) dispatch({ type: "SET_FILTERS", filters: stored.filters });
        if (stored.sort) dispatch({ type: "SET_SORT", sort: stored.sort });
        if (stored.groupBy) dispatch({ type: "SET_GROUP", groupBy: stored.groupBy });
        if (stored.savedViews) stored.savedViews.forEach((v) => dispatch({ type: "SAVE_VIEW", view: v }));
        if (stored.role) dispatch({ type: "SET_ROLE", role: stored.role });
        if (stored.tasks && stored.tasks.length) stored.tasks.forEach((t) => dispatch({ type: "ADD_TASK", task: t }));
        if (stored.sprints) stored.sprints.forEach((s) => {});
      } catch {}
    } else if (seed?.tasks?.length) {
      seed.tasks.forEach((t) => dispatch({ type: "ADD_TASK", task: t }));
    }
  }, []);

  // persist
  useEffect(() => {
    const toSave: Partial<PMState> = {
      tasks: state.tasks,
      filters: state.filters,
      view: state.view,
      savedViews: state.savedViews,
      sort: state.sort,
      groupBy: state.groupBy,
      role: state.role,
    };
    localStorage.setItem("pm_state_v1", JSON.stringify(toSave));
  }, [state.tasks, state.filters, state.view, state.savedViews, state.sort, state.groupBy, state.role]);

  // notifications: due soon (24h)
  useEffect(() => {
    const now = Date.now();
    state.tasks.forEach((t) => {
      if (t.dueDate && t.status !== "done") {
        const due = new Date(t.dueDate).getTime();
        if (due - now < 24 * 60 * 60 * 1000 && due - now > 0) {
          toast.info(`Due soon: ${t.title}`);
        }
      }
    });
  }, [state.tasks]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <PMContext.Provider value={value}>{children}</PMContext.Provider>;
}

export function usePM() {
  const ctx = useContext(PMContext);
  if (!ctx) throw new Error("usePM must be used within PMProvider");
  return ctx;
}
