import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, RefreshCcw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLinkedSyncHealth } from "@/hooks/use-linked-sync-health";
import { runLinkedScheduleSync, type LinkedSyncIssue } from "@/lib/linked-schedule-engine";

interface LinkedSyncStatusLineProps {
  className?: string;
}

const LINKED_SYNC_OVERRIDE_KEY = "delphi_linked_sync_issue_overrides_v1";
const LINKED_SYNC_BASELINE_KEY = "delphi_linked_sync_issue_baseline_v1";

const getIssueLabel = (issue: LinkedSyncIssue) => {
  if (issue.category === "unscheduled_source") return "Missing Date";
  if (issue.category === "duplicate_linked_key") return "Duplicate Linked Key";
  if (issue.category === "orphan_linked_item") return "Orphan Linked Item";
  if (issue.category === "writeback_failure") return "Writeback Failure";
  if (issue.category === "calendar_mismatch") return "Mirror Mismatch";
  return "Sync Issue";
};

const resolveIssueRoute = (issue: LinkedSyncIssue) => {
  if (issue.key.startsWith("development:")) return "/development";
  if (issue.key.startsWith("sales:")) return "/sales";
  if (issue.key.startsWith("subscriptions:")) return "/subscriptions";
  return "/admin?tab=review";
};

const issueSignature = (issue: LinkedSyncIssue) => `${issue.category}::${issue.key}`;

const readOverrides = () => {
  try {
    const raw = localStorage.getItem(LINKED_SYNC_OVERRIDE_KEY);
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [] as string[];
  }
};

export function LinkedSyncStatusLine({ className }: LinkedSyncStatusLineProps) {
  const navigate = useNavigate();
  const linkedSync = useLinkedSyncHealth();
  const [open, setOpen] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [overrides, setOverrides] = useState<Set<string>>(() => new Set(readOverrides()));
  const issues = linkedSync?.issues || [];

  const { visibleIssues, hiddenCount } = useMemo(() => {
    const nextVisible = issues.filter((issue) => !overrides.has(issueSignature(issue)));
    return { visibleIssues: nextVisible, hiddenCount: issues.length - nextVisible.length };
  }, [issues, overrides]);

  const issueCount = visibleIssues.length;

  useEffect(() => {
    if (!issues.length) return;
    if (localStorage.getItem(LINKED_SYNC_BASELINE_KEY) === "1") return;

    const next = new Set(overrides);
    issues.forEach((issue) => next.add(issueSignature(issue)));
    persistOverrides(next);
    localStorage.setItem(LINKED_SYNC_BASELINE_KEY, "1");
  }, [issues, overrides]);

  const persistOverrides = (next: Set<string>) => {
    setOverrides(next);
    localStorage.setItem(LINKED_SYNC_OVERRIDE_KEY, JSON.stringify(Array.from(next)));
  };

  const toggleOverride = (issue: LinkedSyncIssue) => {
    const signature = issueSignature(issue);
    const next = new Set(overrides);
    if (next.has(signature)) next.delete(signature);
    else next.add(signature);
    persistOverrides(next);
  };

  const overrideAllVisible = () => {
    const next = new Set(overrides);
    visibleIssues.forEach((issue) => next.add(issueSignature(issue)));
    persistOverrides(next);
  };

  const clearOverrides = () => {
    const next = new Set<string>();
    persistOverrides(next);
  };

  const handleResync = async () => {
    setResyncing(true);
    try {
      await runLinkedScheduleSync();
    } finally {
      setResyncing(false);
    }
  };

  if (linkedSync?.state === "syncing") {
    return <p className={`text-xs text-muted-foreground ${className || ""}`.trim()}>Linked schedule syncing...</p>;
  }

  if (issueCount === 0) {
    return null;
  }

  return (
    <>
      <div className={`flex items-center gap-2 ${className || ""}`.trim()}>
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-xs font-medium text-destructive underline-offset-4 hover:underline"
          onClick={() => setOpen(true)}
        >
          Sync Issues: {issueCount}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sync Issues ({issueCount})</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
            {visibleIssues.map((issue, index) => (
              <div key={`${issue.key}-${index}`} className="rounded-xl border border-border bg-card/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{getIssueLabel(issue)}</p>
                    <p className="text-xs text-muted-foreground">{issue.detail}</p>
                    <p className="text-[11px] text-muted-foreground/90">{issue.key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {issue.category === "unscheduled_source" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          setOpen(false);
                          navigate(resolveIssueRoute(issue));
                        }}
                      >
                        Open Source
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={handleResync}
                        disabled={resyncing}
                      >
                        <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${resyncing ? "animate-spin" : ""}`} />
                        Re-sync
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setOpen(false);
                        navigate("/admin?tab=review");
                      }}
                    >
                      <Wrench className="mr-1.5 h-3.5 w-3.5" />
                      Sync Review
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8"
                      onClick={() => toggleOverride(issue)}
                    >
                      Override
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {visibleIssues.length === 0 ? (
              <div className="rounded-xl border border-border bg-card/70 p-3 text-sm text-muted-foreground">
                No active sync issues. All current issues are overridden.
              </div>
            ) : null}
          </div>

          <div className="flex justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {hiddenCount > 0 ? `${hiddenCount} issue${hiddenCount === 1 ? "" : "s"} overridden.` : "No overrides."}
            </div>
            <div className="flex gap-2">
              {visibleIssues.length > 0 ? (
                <Button type="button" variant="secondary" onClick={overrideAllVisible}>
                  Override All
                </Button>
              ) : null}
              {hiddenCount > 0 ? (
                <Button type="button" variant="outline" onClick={clearOverrides}>
                  Clear Overrides
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button type="button" onClick={handleResync} disabled={resyncing}>
                <RefreshCcw className={`mr-2 h-4 w-4 ${resyncing ? "animate-spin" : ""}`} />
                Re-sync All
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
