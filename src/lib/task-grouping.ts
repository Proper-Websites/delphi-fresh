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
  startTime: string;
  endTime: string;
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
  const byBucket = new Map<string, T[]>();

  tasks.forEach((task) => {
    const normalizedDepartment = task.department.trim().toLowerCase();
    const timeBucket = isDateOnlyTask(task)
      ? "date-only"
      : `${task.startTime.trim().toLowerCase()}__${task.endTime.trim().toLowerCase()}`;
    const bucketKey = `${task.date}__${normalizedDepartment}__${timeBucket}`;
    const bucket = byBucket.get(bucketKey) ?? [];
    bucket.push(task);
    byBucket.set(bucketKey, bucket);
  });

  const items: DateOnlyDepartmentDisplayItem<T>[] = [];

  byBucket.forEach((bucket, bucketKey) => {
    const [sample] = bucket;
    if (bucket.length < 2) {
      bucket.forEach((task) => {
        items.push({
          kind: "task",
          key: `task-${task.id}`,
          task,
        });
      });
      return;
    }

    items.push({
      kind: "group",
      key: `group-${bucketKey}`,
      date: sample.date,
      department: sample.department,
      startTime: sample.startTime,
      endTime: sample.endTime,
      count: bucket.length,
      tasks: bucket.slice().sort((a, b) => a.id - b.id),
    });
  });

  return items.sort((a, b) => {
    const aDate = a.kind === "group" ? a.date : a.task.date;
    const bDate = b.kind === "group" ? b.date : b.task.date;
    if (aDate !== bDate) return aDate.localeCompare(bDate);

    const aDepartment = a.kind === "group" ? a.department : a.task.department;
    const bDepartment = b.kind === "group" ? b.department : b.task.department;
    if (aDepartment !== bDepartment) return aDepartment.localeCompare(bDepartment);

    const aStart = a.kind === "group" ? a.startTime : a.task.startTime;
    const bStart = b.kind === "group" ? b.startTime : b.task.startTime;
    return aStart.localeCompare(bStart);
  });
};
