import { runLinkedScheduleSync } from "@/lib/linked-schedule-engine";

export async function syncDatesIntoSchedule() {
  const report = await runLinkedScheduleSync();
  return {
    linkedCount: report.linkedCount,
    mirroredCount: report.mirroredCount,
    totalCount: report.linkedCount + report.manualTaskCount,
    state: report.state,
    issues: report.issues,
  };
}

