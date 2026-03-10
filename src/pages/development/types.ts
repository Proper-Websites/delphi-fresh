export type TaskStatus = "backlog" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Comment {
  id: string;
  author: string; // simple string for now
  body: string;   // markdown/plain
  createdAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  url?: string; // optional local link
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignees: string[]; // names/initials
  dueDate?: string; // ISO
  startDate?: string; // ISO
  tags: string[];
  estimateHours?: number;
  actualHours?: number;
  dependencies: string[]; // ids of tasks that block this task
  subtasks: Subtask[];
  attachments: Attachment[];
  comments: Comment[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sprintId?: string;
  projectId?: number;
}

export interface Sprint {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
}

export interface SavedView {
  id: string;
  name: string;
  view: ViewType;
  filters: Filters;
  sort: SortOption | null;
  groupBy: GroupBy | null;
}

export type ViewType = "current" | "list" | "card" | "kanban";
export type GroupBy = "status" | "assignee" | "tag" | "sprint";
export type SortOption = "dueDate" | "priority" | "updatedAt";

export interface Filters {
  statuses: TaskStatus[];
  assignees: string[];
  tags: string[];
  priorities: TaskPriority[];
  dueBefore?: string; // ISO
}

export type Role = "owner" | "editor" | "viewer";