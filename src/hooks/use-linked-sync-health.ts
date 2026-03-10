import { useEffect, useState } from "react";
import { getStoredLinkedSyncHealth, type LinkedSyncReport } from "@/lib/linked-schedule-engine";

export function useLinkedSyncHealth() {
  const [health, setHealth] = useState<LinkedSyncReport | null>(() => getStoredLinkedSyncHealth());

  useEffect(() => {
    const onLinkedSync = (event: Event) => {
      const detail = (event as CustomEvent<LinkedSyncReport>).detail;
      if (detail && typeof detail === "object") {
        setHealth(detail);
      } else {
        setHealth(getStoredLinkedSyncHealth());
      }
    };
    window.addEventListener("delphi-linked-schedule-sync", onLinkedSync as EventListener);
    return () => window.removeEventListener("delphi-linked-schedule-sync", onLinkedSync as EventListener);
  }, []);

  return health;
}

