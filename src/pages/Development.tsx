import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, User, DollarSign, Clock, MoreHorizontal, Trash2, ListFilter, Globe, MessageSquare, Circle, CheckCircle2, Plus, ExternalLink, Mail, Phone, ChevronDown } from "lucide-react";
import { ProjectModal, Project } from "@/components/ProjectModal";
import { useLocalStorageState } from "@/hooks/use-local-storage";
import { AnimatedTitle } from "@/components/AnimatedTitle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatDateWritten } from "@/lib/date-format";
import { useSearchParams } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  deleteDevelopmentProject,
  fetchDevelopmentProjects,
  mapRowToProject,
  replaceDevelopmentProjects,
} from "@/lib/supabase-development-projects";
import { fetchSalesPageState, replaceSalesPageState } from "@/lib/supabase-sales-page-state";
import { syncDatesIntoSchedule } from "@/lib/date-funnel-sync";
import { formatMoney, parseMoney } from "@/lib/money";
import { MeetingNotesDialog } from "@/components/MeetingNotesDialog";
import { LinkedSyncStatusLine } from "@/components/LinkedSyncStatusLine";
import { GlassScrollArea } from "@/components/ui/glass-scroll-area";
import { promptForNextStep } from "@/lib/next-step";

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof error === "string" && error.trim()) return error;
  return "Supabase sync failed.";
};

const toExternalUrl = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).toString();
  } catch {
    return "";
  }
};

const dockHoverCardClass =
  "border border-white/50 bg-[linear-gradient(180deg,hsl(0_0%_100%/.9),hsl(0_0%_100%/.74))] text-foreground shadow-xl backdrop-blur-xl font-semibold dark:!border-[hsl(218_31%_33%/.92)] dark:!bg-[linear-gradient(180deg,hsl(221_42%_18%/.96),hsl(222_48%_12%/.96))] dark:!text-white";

const initialProjects: Project[] = [];

type WorkflowSubtask = {
  id: number;
  title: string;
  done: boolean;
};

type WorkflowTask = {
  id: number;
  title: string;
  done: boolean;
  priority: Project["tasks"]["total"] extends number ? "crucial" | "high" | "medium" | "low" : "medium";
  durationMinutes: number;
  date: string;
  subtasks: WorkflowSubtask[];
  contingency?: {
    responseLabel: string;
    followUpLabel: string;
    responseTaskTitle: string;
    followUpTaskTitle: string;
  };
};

const newWorkflowId = () => Date.now() + Math.floor(Math.random() * 100000);
const isWorkflowPriority = (value: unknown): value is WorkflowTask["priority"] =>
  value === "crucial" || value === "high" || value === "medium" || value === "low";
const isIsoDateValue = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
};

const safeDateInputValue = (value: unknown) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return isIsoDateValue(normalized) ? normalized : "";
};

const normalizeWorkflowTask = (raw: unknown): WorkflowTask => {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<WorkflowTask> & {
    subtasks?: unknown;
    contingency?: unknown;
  };
  const subtasksRaw = Array.isArray(source.subtasks) ? source.subtasks : [];
  const subtasks: WorkflowSubtask[] = subtasksRaw.map((item) => {
    const sub = (item && typeof item === "object" ? item : {}) as Partial<WorkflowSubtask>;
    return {
      id: typeof sub.id === "number" ? sub.id : newWorkflowId(),
      title: String(sub.title || "Subtask").trim(),
      done: Boolean(sub.done),
    };
  });
  const contingencyRaw =
    source.contingency && typeof source.contingency === "object"
      ? (source.contingency as Partial<WorkflowTask["contingency"]>)
      : undefined;

  return {
    id: typeof source.id === "number" ? source.id : newWorkflowId(),
    title: String(source.title || "Task").trim(),
    done: Boolean(source.done),
    priority: isWorkflowPriority(source.priority) ? source.priority : "medium",
    durationMinutes: Math.max(15, Number(source.durationMinutes) || 30),
    date: (() => {
      const raw = String((source as { date?: unknown }).date || "").trim();
      return isIsoDateValue(raw) ? raw : "";
    })(),
    subtasks,
    contingency:
      contingencyRaw &&
      contingencyRaw.responseLabel &&
      contingencyRaw.followUpLabel &&
      contingencyRaw.responseTaskTitle &&
      contingencyRaw.followUpTaskTitle
        ? {
            responseLabel: String(contingencyRaw.responseLabel),
            followUpLabel: String(contingencyRaw.followUpLabel),
            responseTaskTitle: String(contingencyRaw.responseTaskTitle),
            followUpTaskTitle: String(contingencyRaw.followUpTaskTitle),
          }
        : undefined,
  };
};

const normalizeWorkflowTasks = (tasks: unknown): WorkflowTask[] => {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task) => normalizeWorkflowTask(task));
};

export default function Development() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useLocalStorageState<Project[]>("delphi_development_projects_v2", initialProjects);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [viewDetailsProject, setViewDetailsProject] = useState<Project | null>(null);
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [contactInfoProject, setContactInfoProject] = useState<Project | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [projectMilestonesMap, setProjectMilestonesMap] = useLocalStorageState<Record<number, WorkflowTask[]>>(
    "delphi_development_project_workflows_v2",
    {}
  );
  const [statusFilter, setStatusFilter] = useState<"all" | Project["status"]>("all");
  const [progressFilter, setProgressFilter] = useState<"all" | "low" | "mid" | "high">("all");
  const [tasksFilter, setTasksFilter] = useState<"all" | "not_started" | "in_progress" | "completed" | "no_tasks">("all");
  const [deadlineFilter, setDeadlineFilter] = useState<"all" | "overdue" | "today" | "7d" | "30d" | "no_deadline">("all");
  const [sortMode, setSortMode] = useState<"manual" | "progress_desc" | "progress_asc" | "due_soon" | "tasks_remaining">("manual");
  const [isFilterBarOpen, setIsFilterBarOpen] = useState(false);
  const [draggedProjectId, setDraggedProjectId] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ projectId: number; position: "before" | "after" } | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [celebratingProjectId, setCelebratingProjectId] = useState<number | null>(null);
  const [reviewCelebratingProjectId, setReviewCelebratingProjectId] = useState<number | null>(null);
  const [newProjectCelebration, setNewProjectCelebration] = useState<{ id: number; name: string } | null>(null);
  const [isStageMapHovered, setIsStageMapHovered] = useState(false);
  const [isStageMapAutoAnimating, setIsStageMapAutoAnimating] = useState(false);
  const [deleteTargetProject, setDeleteTargetProject] = useState<Project | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);
  const [openWorkflowTaskId, setOpenWorkflowTaskId] = useState<number | null>(null);
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  const [isTaskManagerOpen, setIsTaskManagerOpen] = useState(false);
  const [meetingNotesTarget, setMeetingNotesTarget] = useState<{ key: string; title: string } | null>(null);
  const [taskGroupOpen, setTaskGroupOpen] = useState<{ now: boolean; next: boolean; done: boolean }>({
    now: true,
    next: false,
    done: false,
  });
  const hasLoadedFromSupabase = useRef(false);
  const suppressNextSync = useRef(false);
  const hasLoadedWorkflowStateFromSupabase = useRef(false);
  const suppressNextWorkflowStateSync = useRef(false);
  const previousProgressRef = useRef<Map<number, number>>(new Map());
  const previousStatusRef = useRef<Map<number, Project["status"]>>(new Map());
  const celebrationTimeoutRef = useRef<number | null>(null);
  const reviewCelebrationTimeoutRef = useRef<number | null>(null);
  const newProjectCelebrationTimeoutRef = useRef<number | null>(null);

  const handleAddProject = () => {
    setSelectedProject(null);
    setIsModalOpen(true);
  };

  useEffect(() => {
    const onCommandNew = () => {
      setSelectedProject(null);
      setIsModalOpen(true);
    };
    window.addEventListener("delphi-command-new", onCommandNew as EventListener);
    return () => window.removeEventListener("delphi-command-new", onCommandNew as EventListener);
  }, []);

  useEffect(() => {
    if (searchParams.get("add") !== "project") return;
    setSelectedProject(null);
    setIsModalOpen(true);
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      updated.delete("add");
      return updated;
    });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const loadFromSupabase = async () => {
      setSyncState("syncing");
      setSyncMessage("Syncing projects...");
      try {
        const rows = await fetchDevelopmentProjects();
        if (cancelled) return;
        if (rows.length > 0) {
          suppressNextSync.current = true;
          setProjects((prev) => {
            const localById = new Map(prev.map((project) => [String(project.id), project]));
            const localByIdentity = new Map(
              prev.map((project) => [
                `${project.name.trim().toLowerCase()}::${project.client.trim().toLowerCase()}`,
                project,
              ])
            );
            return rows.map((row) => {
              const mapped = mapRowToProject(row);
              const local =
                localById.get(String(mapped.id)) ||
                localByIdentity.get(`${mapped.name.trim().toLowerCase()}::${mapped.client.trim().toLowerCase()}`);
              const keepLocalDeposit = !mapped.deposit.trim() && Boolean(local?.deposit.trim());
              const keepLocalContactName = !mapped.contactName.trim() && Boolean(local?.contactName.trim());
              const keepLocalContactEmail = !mapped.contactEmail.trim() && Boolean(local?.contactEmail.trim());
              const keepLocalContactPhone = !mapped.contactPhone.trim() && Boolean(local?.contactPhone.trim());
              const keepLocalWebsite = !mapped.websiteUrl.trim() && Boolean(local?.websiteUrl.trim());
              const keepLocalCommenting = !mapped.commentingToolUrl.trim() && Boolean(local?.commentingToolUrl.trim());
              if (
                !keepLocalDeposit &&
                !keepLocalContactName &&
                !keepLocalContactEmail &&
                !keepLocalContactPhone &&
                !keepLocalWebsite &&
                !keepLocalCommenting
              ) return mapped;
              return {
                ...mapped,
                deposit: keepLocalDeposit ? local!.deposit : mapped.deposit,
                contactName: keepLocalContactName ? local!.contactName : mapped.contactName,
                contactEmail: keepLocalContactEmail ? local!.contactEmail : mapped.contactEmail,
                contactPhone: keepLocalContactPhone ? local!.contactPhone : mapped.contactPhone,
                websiteUrl: keepLocalWebsite ? local!.websiteUrl : mapped.websiteUrl,
                commentingToolUrl: keepLocalCommenting ? local!.commentingToolUrl : mapped.commentingToolUrl,
              };
            });
          });
        } else {
          await replaceDevelopmentProjects(projects);
        }
        hasLoadedFromSupabase.current = true;
        setSyncState("idle");
        setSyncMessage("Synced");
      } catch (error) {
        if (cancelled) return;
        hasLoadedFromSupabase.current = true;
        setSyncState("error");
        setSyncMessage(getErrorMessage(error));
      }
    };
    void loadFromSupabase();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const loadWorkflowStateFromSupabase = async () => {
      try {
        const rows = await fetchSalesPageState();
        if (cancelled) return;
        const workflowRow = rows.find((row) => row.key === "development_workflow_map");
        if (workflowRow?.payload && typeof workflowRow.payload === "object" && !Array.isArray(workflowRow.payload)) {
          const rawMap = workflowRow.payload as Record<string, unknown>;
          const normalized = Object.fromEntries(
            Object.entries(rawMap).map(([projectId, tasks]) => [projectId, normalizeWorkflowTasks(tasks)])
          );
          suppressNextWorkflowStateSync.current = true;
          setProjectMilestonesMap(normalized);
        } else if (Object.keys(projectMilestonesMap).length > 0) {
          await replaceSalesPageState({ development_workflow_map: projectMilestonesMap });
        }
        hasLoadedWorkflowStateFromSupabase.current = true;
      } catch (error) {
        if (cancelled) return;
        hasLoadedWorkflowStateFromSupabase.current = true;
        setSyncState("error");
        setSyncMessage(getErrorMessage(error));
      }
    };
    void loadWorkflowStateFromSupabase();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void syncDatesIntoSchedule().catch(() => {
      // non-blocking: linked schedule sync should never crash the page
    });
  }, [projects, projectMilestonesMap]);

  useEffect(() => {
    if (!isSupabaseConfigured || !hasLoadedFromSupabase.current) return;
    if (suppressNextSync.current) {
      suppressNextSync.current = false;
      return;
    }
    let cancelled = false;
    const persistToSupabase = async () => {
      setSyncState("syncing");
      try {
        await replaceDevelopmentProjects(projects);
        if (!cancelled) {
          setSyncState("idle");
          setSyncMessage("Synced");
        }
      } catch (error) {
        if (!cancelled) {
          setSyncState("error");
          setSyncMessage(getErrorMessage(error));
        }
      }
    };
    void persistToSupabase();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  useEffect(() => {
    if (!isSupabaseConfigured || !hasLoadedWorkflowStateFromSupabase.current) return;
    if (suppressNextWorkflowStateSync.current) {
      suppressNextWorkflowStateSync.current = false;
      return;
    }
    let cancelled = false;
    const persistWorkflowState = async () => {
      try {
        await replaceSalesPageState({ development_workflow_map: projectMilestonesMap });
        if (!cancelled && syncState !== "error") {
          setSyncState("idle");
          setSyncMessage("Synced");
        }
      } catch (error) {
        if (!cancelled) {
          setSyncState("error");
          setSyncMessage(getErrorMessage(error));
        }
      }
    };
    void persistWorkflowState();
    return () => {
      cancelled = true;
    };
  }, [projectMilestonesMap, syncState]);

  useEffect(() => {
    const previousProgressMap = previousProgressRef.current;
    const previousStatusMap = previousStatusRef.current;
    let completedId: number | null = null;
    let inReviewId: number | null = null;

    for (const project of projects) {
      const previousProgress = previousProgressMap.get(project.id);
      const previousStatus = previousStatusMap.get(project.id);
      if (previousProgress !== undefined && previousProgress < 100 && project.progress >= 100) {
        completedId = project.id;
      }
      if (previousStatus !== undefined && previousStatus !== "review" && project.status === "review") {
        inReviewId = project.id;
      }
      previousProgressMap.set(project.id, project.progress);
      previousStatusMap.set(project.id, project.status);
    }

    const existingIds = new Set(projects.map((project) => project.id));
    for (const storedId of Array.from(previousProgressMap.keys())) {
      if (!existingIds.has(storedId)) previousProgressMap.delete(storedId);
    }
    for (const storedId of Array.from(previousStatusMap.keys())) {
      if (!existingIds.has(storedId)) previousStatusMap.delete(storedId);
    }

    if (completedId !== null) {
      setCelebratingProjectId(completedId);
      if (celebrationTimeoutRef.current) window.clearTimeout(celebrationTimeoutRef.current);
      celebrationTimeoutRef.current = window.setTimeout(() => {
        setCelebratingProjectId((current) => (current === completedId ? null : current));
      }, 2000);
    }

    if (inReviewId !== null) {
      setReviewCelebratingProjectId(inReviewId);
      if (reviewCelebrationTimeoutRef.current) window.clearTimeout(reviewCelebrationTimeoutRef.current);
      reviewCelebrationTimeoutRef.current = window.setTimeout(() => {
        setReviewCelebratingProjectId((current) => (current === inReviewId ? null : current));
      }, 2400);
    }
  }, [projects]);

  useEffect(() => {
    return () => {
      if (celebrationTimeoutRef.current) window.clearTimeout(celebrationTimeoutRef.current);
      if (reviewCelebrationTimeoutRef.current) window.clearTimeout(reviewCelebrationTimeoutRef.current);
      if (newProjectCelebrationTimeoutRef.current) window.clearTimeout(newProjectCelebrationTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!viewDetailsProject) return;
    setIsStageMapAutoAnimating(false);
    const start = window.setTimeout(() => setIsStageMapAutoAnimating(true), 40);
    const stop = window.setTimeout(() => setIsStageMapAutoAnimating(false), 1900);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [viewDetailsProject?.id]);

  const handleEditProject = (project: Project) => {
    setSelectedProject(project);
    setIsModalOpen(true);
  };

  const handleViewDetails = (project: Project) => {
    setViewDetailsProject(project);
    setNewMilestoneTitle("");
    setOpenWorkflowTaskId(null);
    setIsBriefOpen(false);
    setIsTaskManagerOpen(false);
    setTaskGroupOpen({ now: true, next: false, done: false });
    const existing = projectMilestonesMap[project.id];
    if (!existing) {
      const seeded = normalizeWorkflowTasks(getDefaultMilestones(project));
      setProjectMilestonesMap((prev) => ({ ...prev, [project.id]: seeded }));
      return;
    }
    const normalized = normalizeWorkflowTasks(existing);
    setProjectMilestonesMap((prev) => ({ ...prev, [project.id]: normalized }));
  };

  const openContactInfo = (project: Project) => {
    setContactInfoProject(project);
    setContactInfoOpen(true);
  };

  const handleSaveProject = (project: Project) => {
    const seededWorkflow = projectMilestonesMap[project.id] ?? getDefaultMilestones(project);
    const projectWithCounts: Project = {
      ...project,
      tasks: {
        ...project.tasks,
        total: seededWorkflow.length,
        completed: seededWorkflow.filter((task) => task.done).length,
      },
    };
    if (!projectMilestonesMap[project.id]) {
      setProjectMilestonesMap((prev) => ({ ...prev, [project.id]: seededWorkflow }));
    }
    if (selectedProject) {
      // Edit existing project
      setProjects(projects.map((p) => p.id === project.id ? projectWithCounts : p));
    } else {
      // Add new project
      setProjects([...projects, projectWithCounts]);
      setNewProjectCelebration({ id: project.id, name: projectWithCounts.name });
      if (newProjectCelebrationTimeoutRef.current) window.clearTimeout(newProjectCelebrationTimeoutRef.current);
      newProjectCelebrationTimeoutRef.current = window.setTimeout(() => {
        setNewProjectCelebration((current) => (current?.id === project.id ? null : current));
      }, 2400);
    }
    setIsModalOpen(false);
    setSelectedProject(null);
  };

  const handleAutoSaveProject = (project: Project) => {
    const seededWorkflow = projectMilestonesMap[project.id] ?? getDefaultMilestones(project);
    const projectWithCounts: Project = {
      ...project,
      tasks: {
        ...project.tasks,
        total: seededWorkflow.length,
        completed: seededWorkflow.filter((task) => task.done).length,
      },
    };
    if (!projectMilestonesMap[project.id]) {
      setProjectMilestonesMap((prev) => ({ ...prev, [project.id]: seededWorkflow }));
    }
    setProjects((prev) => prev.map((p) => (p.id === project.id ? projectWithCounts : p)));
    setSelectedProject(projectWithCounts);
  };

  const handleDeleteProject = (id: number) => {
    setProjects(projects.filter((project) => project.id !== id));
    setProjectMilestonesMap((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
    if (viewDetailsProject?.id === id) {
      setViewDetailsProject(null);
    }
    if (!isSupabaseConfigured) return;
    void deleteDevelopmentProject(id).catch((error) => {
      setSyncState("error");
      setSyncMessage(getErrorMessage(error));
    });
  };

  const openDeleteConfirmation = (project: Project) => {
    setDeleteTargetProject(project);
    setDeleteConfirmStep(1);
  };

  const closeDeleteConfirmation = () => {
    setDeleteTargetProject(null);
    setDeleteConfirmStep(1);
  };

  const getTaskRatio = (project: Project) => {
    if (!project.tasks.total) return 0;
    return project.tasks.completed / project.tasks.total;
  };

  const getNextTaskForProject = (project: Project) => {
    const sourceTasks = normalizeWorkflowTasks((projectMilestonesMap[project.id] ?? []) as unknown[]);
    const pending = sourceTasks.filter((task) => !task.done);
    if (!pending.length) return null;

    const todayKey = new Date().toISOString().slice(0, 10);
    const withDate = pending.filter((task) => safeDateInputValue(task.date));
    if (withDate.length) {
      const upcomingOrToday = withDate
        .filter((task) => safeDateInputValue(task.date) >= todayKey)
        .sort((a, b) => safeDateInputValue(a.date).localeCompare(safeDateInputValue(b.date)));
      if (upcomingOrToday.length) return upcomingOrToday[0];

      return [...withDate].sort((a, b) => safeDateInputValue(a.date).localeCompare(safeDateInputValue(b.date)))[0];
    }

    // If no dated tasks exist yet, still reflect real task-manager state.
    return pending[0];
  };

  const getDaysUntilDeadline = (project: Project): number | null => {
    if (!project.deadline?.trim()) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${project.deadline}T12:00:00`);
    if (Number.isNaN(due.getTime())) return null;
    return Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const reorderByDrag = (sourceId: number, targetId: number, position: "before" | "after") => {
    if (sourceId === targetId) return;
    setProjects((prev) => {
      const sourceIndex = prev.findIndex((project) => project.id === sourceId);
      const targetIndex = prev.findIndex((project) => project.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(sourceIndex, 1);
      let insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
      if (sourceIndex < insertIndex) insertIndex -= 1;
      updated.splice(insertIndex, 0, moved);
      return updated;
    });
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (statusFilter !== "all" && project.status !== statusFilter) return false;

      if (progressFilter !== "all") {
        if (progressFilter === "low" && project.progress >= 34) return false;
        if (progressFilter === "mid" && (project.progress < 34 || project.progress > 66)) return false;
        if (progressFilter === "high" && project.progress < 67) return false;
      }

      if (tasksFilter !== "all") {
        const total = project.tasks.total;
        const completed = project.tasks.completed;
        if (tasksFilter === "no_tasks" && total !== 0) return false;
        if (tasksFilter === "not_started" && !(total > 0 && completed === 0)) return false;
        if (tasksFilter === "in_progress" && !(total > 0 && completed > 0 && completed < total)) return false;
        if (tasksFilter === "completed" && !(total > 0 && completed >= total)) return false;
      }

      if (deadlineFilter !== "all") {
        const days = getDaysUntilDeadline(project);
        if (deadlineFilter === "no_deadline" && days !== null) return false;
        if (deadlineFilter === "overdue" && !(days !== null && days < 0)) return false;
        if (deadlineFilter === "today" && days !== 0) return false;
        if (deadlineFilter === "7d" && !(days !== null && days >= 0 && days <= 7)) return false;
        if (deadlineFilter === "30d" && !(days !== null && days >= 0 && days <= 30)) return false;
      }

      return true;
    });
  }, [projects, statusFilter, progressFilter, tasksFilter, deadlineFilter]);

  const displayedProjects = useMemo(() => {
    const list = [...filteredProjects];
    if (sortMode === "progress_desc") list.sort((a, b) => b.progress - a.progress);
    if (sortMode === "progress_asc") list.sort((a, b) => a.progress - b.progress);
    if (sortMode === "due_soon") {
      list.sort((a, b) => {
        const aDays = getDaysUntilDeadline(a);
        const bDays = getDaysUntilDeadline(b);
        const aValue = aDays === null ? Number.POSITIVE_INFINITY : aDays;
        const bValue = bDays === null ? Number.POSITIVE_INFINITY : bDays;
        return aValue - bValue;
      });
    }
    if (sortMode === "tasks_remaining") {
      list.sort((a, b) => {
        const aRemaining = a.tasks.total - a.tasks.completed;
        const bRemaining = b.tasks.total - b.tasks.completed;
        return bRemaining - aRemaining;
      });
    }
    return list;
  }, [filteredProjects, sortMode]);

  const filterBarStats = useMemo(() => {
    const projectCount = displayedProjects.length;
    const pipelineFee = displayedProjects.reduce((sum, project) => sum + parseMoney(project.budget), 0);
    const pipelineMrr = displayedProjects.reduce((sum, project) => sum + parseMoney(project.spent), 0);
    return { projectCount, pipelineFee, mrr: pipelineMrr };
  }, [displayedProjects]);

  const allProjectsFeeSplit = useMemo(() => {
    const deposits = projects.reduce((sum, project) => sum + parseMoney(project.deposit || ""), 0);
    const unpaid = projects.reduce((sum, project) => {
      const fee = parseMoney(project.budget);
      const deposit = parseMoney(project.deposit || "");
      return sum + Math.max(0, fee - deposit);
    }, 0);
    return { deposits, unpaid };
  }, [projects]);

  const getStageLabel = (stage: Project["stage"]) => {
    if (stage === "rough_draft") return "Rough Draft";
    if (stage === "final_draft") return "Final Draft";
    if (stage === "retrieve_info") return "Retrieval";
    if (stage === "finalize") return "Finalize";
    if (stage === "launch") return "Launch";
    return "Rough Draft";
  };

  const getStagePhaseNumber = (stage: Project["stage"]) => {
    if (stage === "rough_draft") return 1;
    if (stage === "final_draft") return 2;
    if (stage === "retrieve_info") return 3;
    if (stage === "finalize") return 4;
    if (stage === "launch") return 5;
    return 1;
  };

  const getStageNodeClass = (stage: Project["stage"]) => {
    if (stage === "rough_draft") {
      return "border-slate-300/90 text-slate-500 shadow-[0_0_10px_hsl(220_10%_70%/.25)] dark:border-slate-300/45 dark:text-slate-200";
    }
    if (stage === "final_draft") {
      return "border-cyan-300/90 text-cyan-500 shadow-[0_0_12px_hsl(192_95%_58%/.32)] dark:border-cyan-300/60 dark:text-cyan-200";
    }
    if (stage === "retrieve_info") {
      return "border-amber-300/90 text-amber-500 shadow-[0_0_12px_hsl(40_98%_56%/.28)] dark:border-amber-300/60 dark:text-amber-200";
    }
    if (stage === "finalize") {
      return "border-violet-300/90 text-violet-500 shadow-[0_0_12px_hsl(260_90%_62%/.28)] dark:border-violet-300/60 dark:text-violet-200";
    }
    if (stage === "launch") {
      return "border-emerald-300/90 text-emerald-500 shadow-[0_0_12px_hsl(155_80%_48%/.3)] dark:border-emerald-300/60 dark:text-emerald-200";
    }
    return "border-border text-foreground";
  };

  const getStageHighlightClass = (stage: Project["stage"]) => {
    if (stage === "rough_draft") {
      return "border-slate-300/70 bg-slate-200/55 text-slate-800 dark:border-slate-300/35 dark:bg-slate-300/18 dark:text-slate-100";
    }
    if (stage === "final_draft") {
      return "border-sky-300/70 bg-sky-200/55 text-sky-900 dark:border-sky-300/35 dark:bg-sky-300/18 dark:text-sky-100";
    }
    if (stage === "retrieve_info") {
      return "border-amber-300/70 bg-amber-200/55 text-amber-900 dark:border-amber-300/35 dark:bg-amber-300/18 dark:text-amber-100";
    }
    if (stage === "finalize") {
      return "border-violet-300/70 bg-violet-200/55 text-violet-900 dark:border-violet-300/35 dark:bg-violet-300/18 dark:text-violet-100";
    }
    if (stage === "launch") {
      return "border-emerald-300/70 bg-emerald-200/55 text-emerald-900 dark:border-emerald-300/35 dark:bg-emerald-300/18 dark:text-emerald-100";
    }
    return "border-border/70 bg-card/70 text-foreground";
  };

  const getStatusHighlightClass = (status: Project["status"]) => {
    if (status === "planning") {
      return "border-sky-400/90 bg-gradient-to-r from-sky-200/90 to-cyan-200/80 text-sky-950 shadow-[0_0_14px_hsl(198_100%_62%/.3)] dark:border-sky-300/70 dark:bg-gradient-to-r dark:from-sky-400/26 dark:to-cyan-400/18 dark:text-sky-100 dark:shadow-[0_0_16px_hsl(198_100%_70%/.28)]";
    }
    if (status === "in_progress") {
      return "border-amber-400/90 bg-gradient-to-r from-amber-200/95 to-yellow-200/85 text-amber-950 shadow-[0_0_14px_hsl(42_98%_58%/.28)] dark:border-amber-300/70 dark:bg-gradient-to-r dark:from-amber-400/26 dark:to-yellow-400/16 dark:text-amber-100 dark:shadow-[0_0_16px_hsl(42_98%_66%/.28)]";
    }
    if (status === "review") {
      return "border-emerald-400/90 bg-gradient-to-r from-emerald-200/95 to-lime-200/85 text-emerald-950 shadow-[0_0_14px_hsl(152_72%_46%/.28)] dark:border-emerald-300/70 dark:bg-gradient-to-r dark:from-emerald-400/26 dark:to-lime-400/14 dark:text-emerald-100 dark:shadow-[0_0_16px_hsl(152_72%_58%/.3)]";
    }
    return "border-border/70 bg-card/70 text-foreground";
  };

  const getNextTaskShellStyle = (status: Project["status"]) => {
    if (status === "in_progress") {
      return {
        borderColor: "hsl(42 92% 66% / 0.5)",
        boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.48), 0 0 8px hsl(42 95% 64% / 0.1)",
      };
    }
    if (status === "review") {
      return {
        borderColor: "hsl(152 72% 52% / 0.78)",
        boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.52)",
      };
    }
    return {
      borderColor: "hsl(195 100% 64% / 0.76)",
      boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.52)",
    };
  };

  const getDefaultMilestones = (project: Project): WorkflowTask[] => {
    const projectName = project.name?.trim() || "project";
    const defaultTaskDate = project.startDate || project.deadline || "";
    const launchDate = project.deadline || defaultTaskDate;
    return [
      {
        id: newWorkflowId(),
        title: `Submit revisions to editor for ${projectName}`,
        done: false,
        priority: "high",
        durationMinutes: 45,
        date: defaultTaskDate,
        subtasks: [
          { id: newWorkflowId(), title: "Prepare revision summary", done: false },
          { id: newWorkflowId(), title: "Attach all required assets", done: false },
          { id: newWorkflowId(), title: "Send package to editor", done: false },
        ],
      },
      {
        id: newWorkflowId(),
        title: "Receive revisions from editor",
        done: false,
        priority: "high",
        durationMinutes: 30,
        date: defaultTaskDate,
        subtasks: [
          { id: newWorkflowId(), title: "Review returned files", done: false },
          { id: newWorkflowId(), title: "Confirm requested changes are included", done: false },
        ],
      },
      {
        id: newWorkflowId(),
        title: "Confirm results and finalize package",
        done: false,
        priority: "crucial",
        durationMinutes: 40,
        date: defaultTaskDate,
        subtasks: [
          { id: newWorkflowId(), title: "QA critical pages and mobile", done: false },
          { id: newWorkflowId(), title: "Approve final deliverable", done: false },
        ],
      },
      {
        id: newWorkflowId(),
        title: "Draft client email",
        done: false,
        priority: "high",
        durationMinutes: 25,
        date: launchDate,
        subtasks: [
          { id: newWorkflowId(), title: "Write summary of updates", done: false },
          { id: newWorkflowId(), title: "Include review links", done: false },
        ],
      },
      {
        id: newWorkflowId(),
        title: "Send client email",
        done: false,
        priority: "crucial",
        durationMinutes: 15,
        date: launchDate,
        subtasks: [
          { id: newWorkflowId(), title: "Send to client contact", done: false },
        ],
        contingency: {
          responseLabel: "Response received",
          followUpLabel: "Need follow-up",
          responseTaskTitle: "Process client response and apply updates",
          followUpTaskTitle: "Send follow-up email to client",
        },
      },
    ];
  };

  const utilityActionButtonClass =
    "border-border/65 bg-card/55 text-foreground hover:bg-card/80 hover:border-border/80 hover:text-foreground hover:scale-105 transition-all duration-300";

  const getProjectMilestones = (project: Project | null) => {
    if (!project) return [];
    const existing = projectMilestonesMap[project.id];
    if (!existing) return getDefaultMilestones(project);
    return normalizeWorkflowTasks(existing as unknown[]);
  };

  const syncProjectTaskCounts = (projectId: number, tasks: WorkflowTask[]) => {
    const total = tasks.length;
    const completed = tasks.filter((task) => task.done).length;
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? { ...project, tasks: { ...project.tasks, total, completed } }
          : project
      )
    );
  };

  const saveProjectMilestones = (projectId: number, milestones: WorkflowTask[]) => {
    const normalized = normalizeWorkflowTasks(milestones as unknown[]);
    setProjectMilestonesMap((prev) => ({ ...prev, [projectId]: normalized }));
    syncProjectTaskCounts(projectId, normalized);
  };

  const toggleMilestone = (projectId: number, milestoneId: number) => {
    const current = normalizeWorkflowTasks((projectMilestonesMap[projectId] ?? []) as unknown[]);
    const source = current.find((item) => item.id === milestoneId);
    const willComplete = Boolean(source && !source.done);
    const nextStepTitle = willComplete && source ? promptForNextStep(source.title) : null;
    const next = current.map((item) => (item.id === milestoneId ? { ...item, done: !item.done } : item));
    if (willComplete && source && nextStepTitle) {
      const insertIndex = next.findIndex((item) => item.id === milestoneId);
      const followUp: WorkflowTask = {
        id: newWorkflowId(),
        title: nextStepTitle,
        done: false,
        priority: source.priority,
        durationMinutes: source.durationMinutes,
        date: source.date || viewDetailsProject?.deadline || "",
        subtasks: [],
      };
      if (insertIndex === -1) {
        next.push(followUp);
      } else {
        next.splice(insertIndex + 1, 0, followUp);
      }
    }
    saveProjectMilestones(projectId, next);
  };

  const toggleSubtask = (projectId: number, taskId: number, subtaskId: number) => {
    const current = normalizeWorkflowTasks((projectMilestonesMap[projectId] ?? []) as unknown[]);
    const sourceTask = current.find((task) => task.id === taskId);
    const sourceSubtask = sourceTask?.subtasks.find((subtask) => subtask.id === subtaskId);
    const willComplete = Boolean(sourceSubtask && !sourceSubtask.done);
    const nextStepTitle = willComplete && sourceSubtask ? promptForNextStep(sourceSubtask.title) : null;
    const next = current.map((task) => {
      if (task.id !== taskId) return task;
      const subtasks = task.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask
      );
      if (willComplete && nextStepTitle) {
        const subtaskIndex = subtasks.findIndex((subtask) => subtask.id === subtaskId);
        const followUpSubtask: WorkflowSubtask = {
          id: newWorkflowId(),
          title: nextStepTitle,
          done: false,
        };
        if (subtaskIndex === -1) {
          subtasks.push(followUpSubtask);
        } else {
          subtasks.splice(subtaskIndex + 1, 0, followUpSubtask);
        }
      }
      const done = subtasks.length > 0 ? subtasks.every((subtask) => subtask.done) : task.done;
      return { ...task, subtasks, done };
    });
    saveProjectMilestones(projectId, next);
  };

  const addSubtask = (projectId: number, taskId: number) => {
    const title = window.prompt("Subtask name");
    if (!title || !title.trim()) return;
    const current = normalizeWorkflowTasks((projectMilestonesMap[projectId] ?? []) as unknown[]);
    const next = current.map((task) =>
      task.id === taskId
        ? {
            ...task,
            subtasks: [...task.subtasks, { id: newWorkflowId(), title: title.trim(), done: false }],
            done: false,
          }
        : task
    );
    saveProjectMilestones(projectId, next);
  };

  const setTaskDate = (projectId: number, taskId: number, date: string) => {
    const current = normalizeWorkflowTasks((projectMilestonesMap[projectId] ?? []) as unknown[]);
    const next = current.map((task) =>
      task.id === taskId ? { ...task, date: safeDateInputValue(date) } : task
    );
    saveProjectMilestones(projectId, next);
  };

  const repairWorkflowForProject = (project: Project | null) => {
    if (!project) return;
    const seeded = getDefaultMilestones(project);
    setProjectMilestonesMap((prev) => ({ ...prev, [project.id]: seeded }));
    syncProjectTaskCounts(project.id, seeded);
  };

  const createNextStepFromTask = (projectId: number, taskId: number) => {
    const current = normalizeWorkflowTasks((projectMilestonesMap[projectId] ?? []) as unknown[]);
    const sourceTask = current.find((task) => task.id === taskId);
    if (!sourceTask) return;

    const fallbackTitle = `Next step: ${sourceTask.title}`;
    const nextTitle =
      sourceTask.contingency?.responseTaskTitle?.trim() ||
      sourceTask.contingency?.followUpTaskTitle?.trim() ||
      fallbackTitle;

    const alreadyExists = current.some(
      (task) => task.id !== taskId && task.title.trim().toLowerCase() === nextTitle.trim().toLowerCase()
    );
    if (alreadyExists) return;

    const nextTask: WorkflowTask = {
      id: newWorkflowId(),
      title: nextTitle,
      done: false,
      priority: sourceTask.priority,
      durationMinutes: sourceTask.durationMinutes,
      date: sourceTask.date || viewDetailsProject?.deadline || "",
      subtasks: [],
    };

    const updated = current.map((task) =>
      task.id === taskId
        ? {
            ...task,
            done: true,
            subtasks: task.subtasks.map((subtask) => ({ ...subtask, done: true })),
          }
        : task
    );
    saveProjectMilestones(projectId, [...updated, nextTask]);
  };

  const addMilestone = (project: Project | null) => {
    if (!project) return;
    const title = newMilestoneTitle.trim();
    if (!title) return;
    const current = getProjectMilestones(project);
    const next: WorkflowTask[] = [
      ...current,
      { id: newWorkflowId(), title, done: false, priority: "medium", durationMinutes: 30, date: project.deadline || "", subtasks: [] },
    ];
    saveProjectMilestones(project.id, next);
    setNewMilestoneTitle("");
  };

  const statusCounts = useMemo(
    () => ({
      all: projects.length,
      in_progress: projects.filter((project) => project.status === "in_progress").length,
      review: projects.filter((project) => project.status === "review").length,
      planning: projects.filter((project) => project.status === "planning").length,
    }),
    [projects]
  );

  return (
    <div className="development-readable-scope app-atmosphere-page app-light-page h-[100vh] relative overflow-hidden">
      {newProjectCelebration && (
        <div className="dev-new-project-celebration" aria-hidden>
          <div className="dev-new-project-core" />
          <div className="dev-new-project-ring dev-new-project-ring-a" />
          <div className="dev-new-project-ring dev-new-project-ring-b" />
          <div className="dev-new-project-sparks">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="dev-new-project-title">
            <p className="dev-new-project-label">Project Added</p>
            <p className="dev-new-project-name">{newProjectCelebration.name}</p>
          </div>
        </div>
      )}
      <div className="absolute top-40 right-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-accent/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '3s' }} />
      
      <div className="development-zoom-surface app-light-frame relative flex h-full min-h-0 flex-col gap-8 overflow-hidden">
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <AnimatedTitle text="Development" className="app-light-title" />
            <p className="app-light-subtitle">Manage and track ongoing client projects</p>
            {!isSupabaseConfigured ? (
              <p className="mt-1 text-xs text-amber-500">Supabase not configured. Using local storage.</p>
            ) : syncState === "syncing" || syncState === "error" ? (
              <p className={`mt-1 text-xs ${syncState === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {syncState === "syncing" ? "Supabase syncing..." : syncMessage}
              </p>
            ) : null}
            <LinkedSyncStatusLine className="mt-1" />
          </div>
          <div className="flex items-center gap-3">
            <div className="glass-chip-rail app-light-toolbar flex items-center gap-1.5 p-1.5">
              <TooltipProvider delayDuration={80}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant={statusFilter === "all" ? "secondary" : "ghost"} onClick={() => setStatusFilter("all")} className="h-10 w-10 px-0" aria-label="All projects">
                      <ListFilter className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>All Projects ({statusCounts.all})</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant={statusFilter === "planning" ? "secondary" : "ghost"} onClick={() => setStatusFilter("planning")} className="h-10 w-10 px-0" aria-label="Planning projects">
                      <User className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Planning ({statusCounts.planning})</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant={statusFilter === "in_progress" ? "secondary" : "ghost"} onClick={() => setStatusFilter("in_progress")} className="h-10 w-10 px-0" aria-label="In progress projects">
                      <Clock className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>In Progress ({statusCounts.in_progress})</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant={statusFilter === "review" ? "secondary" : "ghost"} onClick={() => setStatusFilter("review")} className="h-10 w-10 px-0" aria-label="In review projects">
                      <Calendar className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>In Review ({statusCounts.review})</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <TooltipProvider delayDuration={80}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleAddProject} className="add-action add-action-icon h-11 w-11 rounded-full px-0" aria-label="New Project">
                    <Plus className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>New Project</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <GlassScrollArea
          containerClassName="min-h-0 flex-1"
          className="glass-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-2 scroll-smooth [scrollbar-gutter:stable]"
        >
          <div className="content-glass-surface relative z-10 space-y-4 p-4 md:p-5">
            <div className="glass-toolbar relative z-[180] flex flex-wrap items-center justify-between gap-2 p-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 px-1 text-sm font-semibold text-foreground/90 transition-colors hover:text-foreground"
                  onClick={() => setIsFilterBarOpen((value) => !value)}
                >
                  <ListFilter className="h-4 w-4" />
                  <span>{isFilterBarOpen ? "Hide Filters" : "Filters"}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${isFilterBarOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </div>

              <div className="glass-chip-rail ml-auto flex items-center gap-2.5 px-3 py-1.5">
                <Badge variant="outline" className="h-8 px-4 text-sm font-semibold">Projects {filterBarStats.projectCount}</Badge>
                <div className="group relative z-[220]">
                  <Badge variant="outline" className="h-8 px-4 text-sm font-semibold">
                    Fees {formatMoney(filterBarStats.pipelineFee)}
                  </Badge>
                  <div
                    className={`${dockHoverCardClass} pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-[260] min-w-[210px] -translate-x-1/2 rounded-xl p-3 opacity-0 shadow-xl transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100`}
                  >
                    <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground dark:text-slate-300">
                      Fees Split
                    </p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground dark:text-slate-300">Deposits</span>
                        <span>{formatMoney(allProjectsFeeSplit.deposits)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground dark:text-slate-300">Unpaid</span>
                        <span>{formatMoney(allProjectsFeeSplit.unpaid)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="h-8 px-4 text-sm font-semibold">MRR {formatMoney(filterBarStats.mrr)}</Badge>
              </div>
            </div>
            {isFilterBarOpen ? (
              <div className="glass-toolbar relative z-[170] flex flex-wrap items-center gap-2 p-2">
                <Select value={progressFilter} onValueChange={(value) => setProgressFilter(value as typeof progressFilter)}>
                  <SelectTrigger className="h-8 w-[138px]">
                    <SelectValue placeholder="Progress" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Progress: All</SelectItem>
                    <SelectItem value="low">Progress: Low (0-33%)</SelectItem>
                    <SelectItem value="mid">Progress: Medium (34-66%)</SelectItem>
                    <SelectItem value="high">Progress: High (67-100%)</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={tasksFilter} onValueChange={(value) => setTasksFilter(value as typeof tasksFilter)}>
                  <SelectTrigger className="h-8 w-[168px]">
                    <SelectValue placeholder="Tasks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tasks: All</SelectItem>
                    <SelectItem value="not_started">Tasks: Not Started</SelectItem>
                    <SelectItem value="in_progress">Tasks: In Progress</SelectItem>
                    <SelectItem value="completed">Tasks: Completed</SelectItem>
                    <SelectItem value="no_tasks">Tasks: No Tasks</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={deadlineFilter} onValueChange={(value) => setDeadlineFilter(value as typeof deadlineFilter)}>
                  <SelectTrigger className="h-8 w-[172px]">
                    <SelectValue placeholder="Deadline" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Deadline: All</SelectItem>
                    <SelectItem value="overdue">Deadline: Overdue</SelectItem>
                    <SelectItem value="today">Deadline: Today</SelectItem>
                    <SelectItem value="7d">Deadline: Next 7d</SelectItem>
                    <SelectItem value="30d">Deadline: Next 30d</SelectItem>
                    <SelectItem value="no_deadline">Deadline: No Deadline</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortMode} onValueChange={(value) => setSortMode(value as typeof sortMode)}>
                  <SelectTrigger className="h-8 w-[158px]">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Sort: Manual</SelectItem>
                    <SelectItem value="progress_desc">Sort: Progress High</SelectItem>
                    <SelectItem value="progress_asc">Sort: Progress Low</SelectItem>
                    <SelectItem value="due_soon">Sort: Due Soon</SelectItem>
                    <SelectItem value="tasks_remaining">Sort: Tasks Remaining</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-1 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground dark:hover:text-white"
                  onClick={() => {
                    setStatusFilter("all");
                    setProgressFilter("all");
                    setTasksFilter("all");
                    setDeadlineFilter("all");
                    setSortMode("manual");
                  }}
                >
                  Reset
                </Button>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-6">
          {displayedProjects.map((project, index) => {
            const websiteHref = toExternalUrl(project.websiteUrl);
            const commentingHref = toExternalUrl(project.commentingToolUrl);
            const nextTask = getNextTaskForProject(project);
            const hasMissingScheduleDates = !safeDateInputValue(project.startDate) || !safeDateInputValue(project.deadline);
            return (
            <Card
              key={project.id}
              role="button"
              tabIndex={0}
              className={`group dev-project-card entity-card-hover no-card-surface-hover glass-hero-panel relative z-0 p-5 transition-[box-shadow,border-color,transform,opacity] duration-300 animate-fade-in-up will-change-transform ${
                draggedProjectId === project.id
                  ? "opacity-55 scale-[0.995] border-primary/50"
                  : "hover:z-20 hover:-translate-y-3 hover:scale-[1.02] hover:shadow-xl hover:shadow-[0_30px_56px_-20px_hsl(206_85%_56%/.34)] dark:hover:shadow-[0_34px_62px_-22px_hsl(200_100%_70%/.4)]"
              } ${project.status === "review" ? "dev-review-state" : ""} ${celebratingProjectId === project.id ? "dev-complete-celebrate" : ""}`}
              style={{ animationDelay: `${index * 0.1}s` }}
              onClick={() => handleViewDetails(project)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleViewDetails(project);
                }
              }}
              draggable={sortMode === "manual"}
              onDragStart={(event) => {
                if (sortMode !== "manual") return;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(project.id));
                setDraggedProjectId(project.id);
              }}
              onDragEnd={() => {
                setDraggedProjectId(null);
                setDropIndicator(null);
              }}
              onDragOver={(event) => {
                if (!draggedProjectId || draggedProjectId === project.id || sortMode !== "manual") return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                const offsetY = event.clientY - rect.top;
                const position: "before" | "after" = offsetY < rect.height / 2 ? "before" : "after";
                setDropIndicator({ projectId: project.id, position });
              }}
              onDragLeave={() => {
                if (dropIndicator?.projectId === project.id) setDropIndicator(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!draggedProjectId || draggedProjectId === project.id || sortMode !== "manual") return;
                const rect = event.currentTarget.getBoundingClientRect();
                const offsetY = event.clientY - rect.top;
                const position: "before" | "after" = offsetY < rect.height / 2 ? "before" : "after";
                reorderByDrag(draggedProjectId, project.id, position);
                setDropIndicator(null);
                setDraggedProjectId(null);
              }}
            >
              {dropIndicator?.projectId === project.id && dropIndicator.position === "before" && (
                <div className="pointer-events-none absolute -top-[2px] left-4 right-4 h-[3px] rounded-full bg-cyan-300 shadow-[0_0_12px_hsl(195_100%_70%/.85)]" />
              )}
              {dropIndicator?.projectId === project.id && dropIndicator.position === "after" && (
                <div className="pointer-events-none absolute -bottom-[2px] left-4 right-4 h-[3px] rounded-full bg-cyan-300 shadow-[0_0_12px_hsl(195_100%_70%/.85)]" />
              )}
              {celebratingProjectId === project.id && (
                <div className="dev-complete-burst" aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              )}
              {reviewCelebratingProjectId === project.id && (
                <div className="dev-review-burst" aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              )}
              <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold text-foreground">{project.name}</h3>
                  <button
                    type="button"
                    className="text-muted-foreground flex items-center gap-2 hover:text-foreground transition-colors"
                    onClick={(event) => {
                      event.stopPropagation();
                      openContactInfo(project);
                    }}
                  >
                    <User className="h-4 w-4" />
                    {project.client}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {hasMissingScheduleDates ? (
                    <Badge variant="destructive" className="h-8 px-4 text-sm font-semibold">
                      Missing Dates
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className={`${getStatusHighlightClass(project.status)} h-8 px-4 text-sm font-semibold`}>
                    {project.status === "in_progress"
                      ? "In Progress"
                      : project.status === "review"
                      ? "In Review"
                      : "Planning"}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 items-center gap-4 xl:grid-cols-[1fr_1fr_1fr_1fr_360px]">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Budget
                  </p>
                  <p className="font-semibold text-foreground">{project.budget}</p>
                  <p className="text-xs text-muted-foreground">MRR: {project.spent}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Timeline
                  </p>
                  <p className="font-semibold text-foreground">
                    {project.startDate && project.deadline
                      ? `${formatDateWritten(project.startDate)} - ${formatDateWritten(project.deadline)}`
                      : project.startDate
                      ? `Start ${formatDateWritten(project.startDate)}`
                      : project.deadline
                      ? `Launch ${formatDateWritten(project.deadline)}`
                      : "Not set"}
                  </p>
                  <p className="text-xs text-muted-foreground">Start to launch</p>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Circle className="h-4 w-4" />
                    Stage
                  </p>
                  <div className="flex items-center gap-3">
                    <div className={`relative h-8 w-8 rounded-full border-2 ${getStageNodeClass(project.stage)}`}>
                      <span className="absolute inset-1.5 rounded-full bg-current/35" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground leading-tight">{getStageLabel(project.stage)}</p>
                      <p className="text-xs text-muted-foreground">Phase {getStagePhaseNumber(project.stage)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Tasks
                  </p>
                  <p className="font-semibold text-foreground">
                    {project.tasks.completed}/{project.tasks.total}
                  </p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>

                <div
                  className="glass-list-surface rounded-[26px] p-4 transition-[border-color,box-shadow,transform] duration-300"
                  style={getNextTaskShellStyle(project.status)}
                >
                  <p className="text-[12px] font-semibold tracking-[0.12em] text-muted-foreground">NEXT TASK</p>
                  {nextTask ? (
                    <>
                      <p className="mt-2 text-base font-bold leading-snug text-foreground line-clamp-2">{nextTask.title}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {safeDateInputValue(nextTask.date) ? `Due ${formatDateWritten(nextTask.date)}` : "No date set"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-base font-bold text-foreground">All tasks completed</p>
                      <p className="mt-2 text-sm text-muted-foreground">No pending next step</p>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="group/progress relative pt-1">
                  <div className="dev-progress-track w-full rounded-full h-2 overflow-hidden">
                    <div
                      className="dev-progress-fill h-2 rounded-full transition-all duration-500"
                      data-dev-progress
                      style={{ ["--dev-progress" as string]: `${project.progress}%` }}
                    >
                      <div className="dev-progress-shimmer" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleViewDetails(project);
                    }}
                    className="h-9 px-1 text-sm font-semibold text-primary hover:bg-transparent hover:text-primary/80 dark:text-cyan-200 dark:hover:text-cyan-100"
                  >
                    View Details
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => handleEditProject(project)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setMeetingNotesTarget({
                            key: `project:${project.id}`,
                            title: `${project.name} Meeting Notes`,
                          })
                        }
                      >
                        Notes
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openDeleteConfirmation(project)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!websiteHref}
                    className={`${utilityActionButtonClass} glass-control border-[var(--glass-stroke-soft)] bg-transparent`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!websiteHref) return;
                      window.open(websiteHref, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <Globe className="mr-1.5 h-4 w-4" />
                    Website
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!commentingHref}
                    className={`${utilityActionButtonClass} glass-control border-[var(--glass-stroke-soft)] bg-transparent`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!commentingHref) return;
                      window.open(commentingHref, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <MessageSquare className="mr-1.5 h-4 w-4" />
                    Commenting
                  </Button>
                </div>
              </div>
            </div>
              
          </Card>
        )})}
          {displayedProjects.length === 0 ? (
            <Card className="glass-hero-panel p-8 text-center">
              <p className="text-base font-semibold text-foreground">No projects match this filter.</p>
              <p className="mt-1 text-sm text-muted-foreground">Try another status or switch back to All.</p>
            </Card>
          ) : null}
            </div>
          </div>
        </GlassScrollArea>

      <ProjectModal
        project={selectedProject}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedProject(null);
        }}
        onSave={handleSaveProject}
        onAutoSave={handleAutoSaveProject}
      />

      {meetingNotesTarget ? (
        <MeetingNotesDialog
          open={Boolean(meetingNotesTarget)}
          onOpenChange={(open) => {
            if (!open) setMeetingNotesTarget(null);
          }}
          scopeKey={meetingNotesTarget.key}
          title={meetingNotesTarget.title}
        />
      ) : null}

      <Dialog
        open={!!viewDetailsProject}
        onOpenChange={() => {
          setViewDetailsProject(null);
          setContactInfoOpen(false);
          setOpenWorkflowTaskId(null);
          setIsBriefOpen(false);
          setIsTaskManagerOpen(false);
          setTaskGroupOpen({ now: true, next: false, done: false });
        }}
      >
        <DialogContent className="development-readable-scope glass-scrollbar w-[94vw] max-h-[92vh] overflow-y-auto sm:max-w-[1150px]">
          <DialogHeader className="sr-only">
            <DialogTitle>Project Details</DialogTitle>
            <DialogDescription>Detailed project information and task workflow.</DialogDescription>
          </DialogHeader>
          
          {viewDetailsProject && (
            <div className="space-y-6 py-4">
              {(() => {
                try {
                  const stageOrder: Project["stage"][] = ["rough_draft", "final_draft", "retrieve_info", "finalize", "launch"];
                  const currentStageIndex = stageOrder.indexOf(viewDetailsProject.stage);
                  const workflowTasks = getProjectMilestones(viewDetailsProject);
                  const completedTasks = workflowTasks.filter((task) => task.done).length;
                  const shouldAnimateStageMap = isStageMapHovered || isStageMapAutoAnimating;
                  const todayKey = new Date().toISOString().slice(0, 10);
                  const nowTasks = workflowTasks.filter((task) => !task.done && safeDateInputValue(task.date) === todayKey);
                  const nextTasks = workflowTasks.filter((task) => !task.done && safeDateInputValue(task.date) !== todayKey);
                  const doneTasks = workflowTasks.filter((task) => task.done);
                  return (
                  <>
                    <div className="flex flex-col items-center text-center">
                      <h3 className="text-3xl font-bold tracking-tight text-slate-600 dark:text-slate-300">
                        {viewDetailsProject.name}
                      </h3>
                      <div className="mt-2 inline-flex items-center rounded-full border border-cyan-300/40 bg-card/70 px-4 py-1.5 text-sm font-semibold text-muted-foreground backdrop-blur-md dark:bg-card/55">
                        {viewDetailsProject.client}
                      </div>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="mt-1 block h-auto px-0 text-xs font-semibold text-primary"
                        onClick={() => openContactInfo(viewDetailsProject)}
                      >
                        View Contact Info
                      </Button>
                      <div className="mx-auto mt-2 h-px w-52 bg-gradient-to-r from-transparent via-cyan-300/65 to-transparent" />
                    </div>

                    <div
                      className={`mx-auto w-full py-2 stage-map ${shouldAnimateStageMap ? "stage-map-hovered" : ""}`}
                      onMouseEnter={() => setIsStageMapHovered(true)}
                      onMouseLeave={() => setIsStageMapHovered(false)}
                    >
                      <div className="mx-auto grid w-full grid-cols-[minmax(0,1fr)_90px_minmax(0,1fr)_90px_minmax(0,1fr)_90px_minmax(0,1fr)_90px_minmax(0,1fr)] items-start">
                        {stageOrder.map((stage, index) => {
                          const isDone = index < currentStageIndex;
                          const isActive = index === currentStageIndex;
                          const isUpcoming = index > currentStageIndex;
                          const nodeCol = index * 2 + 1;
                          const lineCol = index * 2 + 2;
                          return (
                            <div key={stage} className="contents">
                              <div className="flex flex-col items-center px-2" style={{ gridColumn: `${nodeCol}` }}>
                                <div
                                  className={`stage-map-node relative h-6 w-6 rounded-full border transition-all duration-300 ${
                                    isDone
                                      ? "border-cyan-300 bg-cyan-300 shadow-[0_0_16px_hsl(195_100%_70%/.75)]"
                                      : isActive
                                      ? "border-cyan-300 bg-cyan-300/35 shadow-[0_0_18px_hsl(195_100%_70%/.65)]"
                                      : "border-border bg-transparent"
                                  } ${shouldAnimateStageMap && index <= currentStageIndex ? "stage-map-node-hit" : ""}`}
                                  style={
                                    shouldAnimateStageMap
                                      ? { animationDelay: `${index * 95}ms` }
                                      : undefined
                                  }
                                >
                                  {isActive ? (
                                    <span className="absolute inset-[-5px] rounded-full border border-cyan-300/50 animate-pulse" />
                                  ) : null}
                                </div>
                                <p
                                  className={`mt-2.5 text-center text-sm font-semibold leading-tight ${
                                    isUpcoming ? "text-muted-foreground" : "text-foreground"
                                  }`}
                                >
                                  {getStageLabel(stage)}
                                </p>
                                <p className="mt-1 text-[11px] tracking-[0.1em] text-muted-foreground">PHASE {index + 1}</p>
                                {index === 4 ? (
                                  <p className="mt-1.5 text-xs text-muted-foreground text-center">Launch: {formatDateWritten(viewDetailsProject.deadline)}</p>
                                ) : null}
                              </div>
                              {index < stageOrder.length - 1 ? (
                                <div className="mt-[12px] h-[3px]" style={{ gridColumn: `${lineCol}` }}>
                                  <div className="relative h-full w-full overflow-hidden rounded-full">
                                    <div className="h-full w-full border-t-2 border-dashed border-border/80" />
                                    <div
                                      className={`stage-map-track-fill absolute inset-y-0 left-0 border-t-2 border-dashed border-cyan-300/95 shadow-[0_0_10px_hsl(195_100%_70%/.75)] transition-[width] ease-out ${
                                        shouldAnimateStageMap && index < currentStageIndex ? "stage-map-track-filled" : ""
                                      }`}
                                      style={{
                                        width: shouldAnimateStageMap && index < currentStageIndex ? "100%" : "0%",
                                        transitionDelay: `${index * 90}ms`,
                                      }}
                                    />
                                    <span
                                      className={`stage-map-track-sweep absolute inset-y-0 left-0 w-10 ${
                                        shouldAnimateStageMap && index < currentStageIndex ? "stage-map-track-sweep-active" : ""
                                      }`}
                                      style={{ animationDelay: `${index * 90}ms` }}
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-card/62 p-4 dark:bg-card/45">
                      <button
                        type="button"
                        className="mb-1 flex w-full items-center justify-between gap-3 text-left"
                        onClick={() => setIsBriefOpen((current) => !current)}
                      >
                        <p className="text-sm font-semibold tracking-[0.06em] text-foreground">BRIEF</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={getStatusHighlightClass(viewDetailsProject.status)}>
                            {viewDetailsProject.status === "in_progress"
                              ? "In Progress"
                              : viewDetailsProject.status === "review"
                              ? "In Review"
                              : "Planning"}
                          </Badge>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                              isBriefOpen ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>

                      {isBriefOpen ? (
                        <>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded-xl border border-border/55 bg-card/72 p-3 dark:bg-card/60">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">FEE</p>
                              <p className="mt-1 text-base font-semibold text-foreground">{viewDetailsProject.budget || "$0"}</p>
                            </div>
                            <div className="rounded-xl border border-border/55 bg-card/72 p-3 dark:bg-card/60">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">MRR</p>
                              <p className="mt-1 text-base font-semibold text-foreground">{viewDetailsProject.spent || "$0"}</p>
                            </div>
                            <div className="rounded-xl border border-border/55 bg-card/72 p-3 dark:bg-card/60">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">DEPOSIT</p>
                              <p className="mt-1 text-base font-semibold text-foreground">{viewDetailsProject.deposit || "$0"}</p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="rounded-xl border border-border/55 bg-card/72 p-3 dark:bg-card/60">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">START DATE</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{formatDateWritten(viewDetailsProject.startDate)}</p>
                            </div>
                            <div className="rounded-xl border border-border/55 bg-card/72 p-3 dark:bg-card/60">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">LAUNCH DATE</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{formatDateWritten(viewDetailsProject.deadline)}</p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="rounded-xl border border-border/55 bg-card/72 p-3 dark:bg-card/60">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">WEBSITE</p>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <p className="truncate text-xs text-muted-foreground">{viewDetailsProject.websiteUrl || "N/A"}</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!toExternalUrl(viewDetailsProject.websiteUrl)}
                                  onClick={() => {
                                    const href = toExternalUrl(viewDetailsProject.websiteUrl);
                                    if (!href) return;
                                    window.open(href, "_blank", "noopener,noreferrer");
                                  }}
                                >
                                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                  Open
                                </Button>
                              </div>
                            </div>
                            <div className="rounded-xl border border-border/55 bg-card/72 p-3 dark:bg-card/60">
                              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">COMMENTING TOOL</p>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <p className="truncate text-xs text-muted-foreground">{viewDetailsProject.commentingToolUrl || "N/A"}</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!toExternalUrl(viewDetailsProject.commentingToolUrl)}
                                  onClick={() => {
                                    const href = toExternalUrl(viewDetailsProject.commentingToolUrl);
                                    if (!href) return;
                                    window.open(href, "_blank", "noopener,noreferrer");
                                  }}
                                >
                                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                  Open
                                </Button>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-card/62 p-4 dark:bg-card/45">
                      <button
                        type="button"
                        className="mb-1 flex w-full items-center justify-between gap-3 text-left"
                        onClick={() => setIsTaskManagerOpen((current) => !current)}
                      >
                        <div>
                          <p className="text-sm font-semibold tracking-[0.06em] text-foreground">TASK MANAGEMENT</p>
                          <p className="text-xs text-muted-foreground">Now = today. Next = queued. Done = completed. All dates sync to Schedule / Calendar.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {completedTasks}/{workflowTasks.length}
                          </Badge>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                              isTaskManagerOpen ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>

                      {isTaskManagerOpen ? (
                        <>
                          <div className="mb-3 flex gap-2">
                            <Input
                              value={newMilestoneTitle}
                              onChange={(event) => setNewMilestoneTitle(event.target.value)}
                              placeholder="Add task (e.g. Draft follow-up email)"
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  addMilestone(viewDetailsProject);
                                }
                              }}
                            />
                            <Button onClick={() => addMilestone(viewDetailsProject)}>
                              <Plus className="mr-1 h-4 w-4" />
                              Add
                            </Button>
                          </div>

                          {workflowTasks.length === 0 ? (
                            <div className="rounded-xl border border-border/50 bg-card/68 p-4 text-sm text-muted-foreground dark:bg-card/55">
                              No tasks yet for this project.
                            </div>
                          ) : (
                            <GlassScrollArea className="glass-scrollbar max-h-[520px] space-y-4 overflow-y-auto pr-1">
                              {[
                                { key: "now" as const, title: "Now", tasks: nowTasks },
                                { key: "next" as const, title: "Next", tasks: nextTasks },
                                { key: "done" as const, title: "Done", tasks: doneTasks },
                              ].map((group) => (
                                <div key={group.title} className="space-y-2">
                                  <button
                                    type="button"
                                    className="flex w-full items-center justify-between rounded-lg border border-border/45 bg-card/58 px-3 py-2 text-left dark:bg-card/40"
                                    onClick={() =>
                                      setTaskGroupOpen((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
                                    }
                                  >
                                    <p className="text-xs font-semibold tracking-[0.09em] text-muted-foreground uppercase">{group.title}</p>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-[10px]">{group.tasks.length}</Badge>
                                      <ChevronDown
                                        className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                                          taskGroupOpen[group.key] ? "rotate-180" : ""
                                        }`}
                                      />
                                    </div>
                                  </button>
                                  {taskGroupOpen[group.key] ? (
                                    group.tasks.length === 0 ? (
                                      <div className="rounded-lg border border-border/45 bg-card/64 px-3 py-2 text-xs text-muted-foreground dark:bg-card/50">
                                        No {group.title.toLowerCase()} tasks.
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {group.tasks.map((task) => (
                                        <div
                                          key={task.id}
                                          className={`w-full rounded-xl border p-3 ${task.done ? "border-emerald-300/60 bg-emerald-200/25 dark:border-emerald-300/30 dark:bg-emerald-300/10" : "border-border/55 bg-card/74 dark:bg-card/60"}`}
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex min-w-0 items-center gap-2">
                                              <button
                                                type="button"
                                                onClick={() => toggleMilestone(viewDetailsProject.id, task.id)}
                                                className="shrink-0"
                                              >
                                                {task.done ? (
                                                  <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                                                ) : (
                                                  <Circle className="h-4.5 w-4.5 text-muted-foreground" />
                                                )}
                                              </button>
                                              <p className={`truncate text-sm font-semibold ${task.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                                {task.title}
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <DatePickerField
                                                value={safeDateInputValue(task.date)}
                                                onChange={(value) => setTaskDate(viewDetailsProject.id, task.id, value)}
                                                triggerClassName="h-8 w-[145px] rounded-lg px-2.5 text-xs"
                                              />
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                  setOpenWorkflowTaskId((current) => (current === task.id ? null : task.id))
                                                }
                                              >
                                                {openWorkflowTaskId === task.id ? "Close" : "Open"}
                                              </Button>
                                            </div>
                                          </div>

                                          {openWorkflowTaskId === task.id ? (
                                            <div className="mt-3 rounded-lg border border-border/45 bg-card/62 p-3 dark:bg-card/45">
                                              <div className="mb-2 flex items-center justify-between">
                                                <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Subtasks</p>
                                                <Button size="sm" variant="ghost" onClick={() => addSubtask(viewDetailsProject.id, task.id)}>
                                                  + Subtask
                                                </Button>
                                              </div>
                                              {task.subtasks.length === 0 ? (
                                                <p className="text-xs text-muted-foreground">No subtasks yet.</p>
                                              ) : (
                                                <div className="space-y-1.5">
                                                  {task.subtasks.map((subtask) => (
                                                    <button
                                                      key={subtask.id}
                                                      type="button"
                                                      onClick={() => toggleSubtask(viewDetailsProject.id, task.id, subtask.id)}
                                                      className="flex w-full items-center gap-2 rounded-lg border border-border/45 bg-card/68 px-2 py-1.5 text-left text-xs hover:border-cyan-300/60 dark:bg-card/55"
                                                    >
                                                      {subtask.done ? (
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                                      ) : (
                                                        <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                                                      )}
                                                      <span className={subtask.done ? "text-muted-foreground line-through" : "text-foreground"}>
                                                        {subtask.title}
                                                      </span>
                                                    </button>
                                                  ))}
                                                </div>
                                              )}
                                              {!task.done ? (
                                                <div className="mt-3">
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => createNextStepFromTask(viewDetailsProject.id, task.id)}
                                                  >
                                                    Next Step
                                                  </Button>
                                                </div>
                                              ) : null}
                                            </div>
                                          ) : null}
                                        </div>
                                        ))}
                                      </div>
                                    )
                                  ) : null}
                                </div>
                              ))}
                            </GlassScrollArea>
                          )}
                        </>
                      ) : null}
                    </div>
                  </>
                  );
                } catch (error) {
                  console.error("Development view-details workflow render failed", error);
                  return (
                    <div className="rounded-2xl border border-destructive/40 bg-card/60 p-5">
                      <p className="text-sm font-semibold text-destructive">Task manager hit a local data issue.</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Repair this project workflow and reopen details.
                      </p>
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          onClick={() => repairWorkflowForProject(viewDetailsProject)}
                        >
                          Repair Task Data
                        </Button>
                      </div>
                    </div>
                  );
                }
              })()}
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-border">
            <Button onClick={() => setViewDetailsProject(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={contactInfoOpen && !!contactInfoProject}
        onOpenChange={(open) => {
          setContactInfoOpen(open);
          if (!open) setContactInfoProject(null);
        }}
      >
        <DialogContent className="development-readable-scope sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">Contact Info</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {contactInfoProject?.name}
            </DialogDescription>
          </DialogHeader>
          {contactInfoProject ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">CLIENT</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{contactInfoProject.client || "N/A"}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">CONTACT NAME</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{contactInfoProject.contactName || "N/A"}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                  <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">EMAIL</p>
                  <p className="flex items-center gap-1.5 text-sm text-foreground break-all">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    {contactInfoProject.contactEmail || "N/A"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                  <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">PHONE</p>
                  <p className="flex items-center gap-1.5 text-sm text-foreground">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {contactInfoProject.contactPhone || "N/A"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">WEBSITE</p>
                  <p className="mt-1 text-sm text-foreground break-all">{contactInfoProject.websiteUrl || "N/A"}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/60 p-3">
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">COMMENTING TOOL</p>
                  <p className="mt-1 text-sm text-foreground break-all">{contactInfoProject.commentingToolUrl || "N/A"}</p>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTargetProject} onOpenChange={(open) => !open && closeDeleteConfirmation()}>
        <DialogContent className="development-readable-scope sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-foreground">
              {deleteConfirmStep === 1 ? "Delete Project?" : "Final Confirmation"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {deleteConfirmStep === 1
                ? `You are about to delete ${deleteTargetProject?.name || "this project"}.`
                : "This action is permanent and cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeDeleteConfirmation}>
              Cancel
            </Button>
            {deleteConfirmStep === 1 ? (
              <Button
                variant="destructive"
                onClick={() => setDeleteConfirmStep(2)}
              >
                Continue
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => {
                  if (!deleteTargetProject) return;
                  handleDeleteProject(deleteTargetProject.id);
                  closeDeleteConfirmation();
                }}
              >
                Yes, Delete Permanently
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
