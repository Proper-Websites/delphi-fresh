export interface DateOnlyDepartmentTaskLike {
  id: number;
  date: string;
  department: string;
  startTime: string;
  endTime: string;
}

export interface DateOnlyDepartmentTaskGroup<T extends DateOnlyDepartmentTaskLike> {
  kind: "group";
  key: string;
  date: string;
  department: string;
  count: number;
  tasks: T[];
}

export interface DateOnlyDepartmentSingleTask<T extends DateOnlyDepartmentTaskLike> {
  kind: "task";
  key: string;
  task: T;
}

export type DateOnlyDepartmentDisplayItem<T extends DateOnlyDepartmentTaskLike> =
  | DateOnlyDepartmentTaskGroup<T>
  | DateOnlyDepartmentSingleTask<T>;

const hasAssignedTime = (value: string | undefined | null) => Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

export const isDateOnlyTask = <T extends DateOnlyDepartmentTaskLike>(task: T) =>
  !hasAssignedTime(task.startTime) || !hasAssignedTime(task.endTime);

export const groupDateOnlyTasksByDepartment = <T extends DateOnlyDepartmentTaskLike>(
  tasks: T[]
): DateOnlyDepartmentDisplayItem<T>[] => {
  const byDepartment = new Map<string, T[]>();

  tasks.forEach((task) => {
    const bucketKey = `${task.date}__${task.department.trim().toLowerCase()}`;
    const bucket = byDepartment.get(bucketKey) ?? [];
    bucket.push(task);
    byDepartment.set(bucketKey, bucket);
  });

  const items: DateOnlyDepartmentDisplayItem<T>[] = [];

  byDepartment.forEach((bucket, bucketKey) => {
    const [sample] = bucket;
    const dateOnlyTasks = bucket.filter(isDateOnlyTask);
    const timedTasks = bucket.filter((task) => !isDateOnlyTask(task));

    timedTasks.forEach((task) => {
      items.push({
        kind: "task",
        key: `task-${task.id}`,
        task,
      });
    });

    if (dateOnlyTasks.length >= 2) {
      items.push({
        kind: "group",
        key: `group-${bucketKey}`,
        date: sample.date,
        department: sample.department,
        count: dateOnlyTasks.length,
        tasks: dateOnlyTasks.slice().sort((a, b) => a.id - b.id),
      });
      return;
    }

    dateOnlyTasks.forEach((task) => {
      items.push({
        kind: "task",
        key: `task-${task.id}`,
        task,
      });
    });
  });

  return items.sort((a, b) => {
    const aDate = a.kind === "group" ? a.date : a.task.date;
    const bDate = b.kind === "group" ? b.date : b.task.date;
    if (aDate !== bDate) return aDate.localeCompare(bDate);

    const aDepartment = a.kind === "group" ? a.department : a.task.department;
    const bDepartment = b.kind === "group" ? b.department : b.task.department;
    return aDepartment.localeCompare(bDepartment);
  });
};
