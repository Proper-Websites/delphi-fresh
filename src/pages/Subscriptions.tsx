import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/StatCard";
import { Users, DollarSign, AlertCircle, CheckCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { useLocalStorageState } from "@/hooks/use-local-storage";
import { AnimatedTitle } from "@/components/AnimatedTitle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDateWritten } from "@/lib/date-format";
import { useSearchParams } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getSupabaseErrorMessage } from "@/lib/supabase-errors";
import {
  fetchSubscriptionClients,
  mapSubscriptionClientRowToRecord,
  replaceSubscriptionClients,
} from "@/lib/supabase-subscriptions-clients";
import { syncDatesIntoSchedule } from "@/lib/date-funnel-sync";
import { formatMoney, normalizeMoneyInput, parseMoney } from "@/lib/money";
import { toSmartTitleCase, toSmartTitleCaseLive } from "@/lib/text-format";
import { MeetingNotesDialog } from "@/components/MeetingNotesDialog";
import { LinkedSyncStatusLine } from "@/components/LinkedSyncStatusLine";
import { GlassScrollArea } from "@/components/ui/glass-scroll-area";

type ClientStatus = "active" | "limit_reached" | "pending_payment";
type ClientFormMode = "onboard" | "all";

interface RetainerClient {
  id: number;
  client: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  clientSince: string;
  plan: string;
  mrr: string;
  revisionsUsed: number;
  revisionsTotal: number;
  status: ClientStatus;
  nextBilling: string;
  lastRevision: string;
  lastRevisionDate: string;
}

interface ClientFormData {
  client: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  clientSince: string;
  mrr: string;
  revisionsTotal: number;
  status: ClientStatus;
  nextBilling: string;
  lastRevision: string;
}

const initialRetainerClients: RetainerClient[] = [];
const SUBSCRIPTIONS_CLIENT_DRAFT_KEY = "delphi_subscriptions_client_draft_v1";
const DEFAULT_SUBSCRIPTION_PLAN = "Retainer";

export default function Subscriptions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useLocalStorageState<RetainerClient[]>(
    "delphi_subscriptions_clients_v2",
    initialRetainerClients
  );
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const hasLoadedFromSupabase = useRef(false);
  const suppressNextSync = useRef(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientFormMode, setClientFormMode] = useState<ClientFormMode>("onboard");
  const [onboardStep, setOnboardStep] = useState(0);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [clearNextClientDraftLoad, setClearNextClientDraftLoad] = useState(false);
  const [draggedClientId, setDraggedClientId] = useState<number | null>(null);
  const [clientDropIndicator, setClientDropIndicator] = useState<{ clientId: number; position: "before" | "after" } | null>(null);
  const [meetingNotesTarget, setMeetingNotesTarget] = useState<{ key: string; title: string } | null>(null);
  const [clientForm, setClientForm] = useState<ClientFormData>({
    client: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    clientSince: "",
    mrr: "",
    revisionsTotal: 3,
    status: "active",
    nextBilling: new Date().toISOString().split("T")[0],
    lastRevision: "N/A",
  });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const loadFromSupabase = async () => {
      setSyncState("syncing");
      setSyncMessage("Syncing clients...");
      try {
        const rows = await fetchSubscriptionClients();
        if (cancelled) return;
        if (rows.length > 0) {
          suppressNextSync.current = true;
          setClients(rows.map(mapSubscriptionClientRowToRecord));
        } else {
          await replaceSubscriptionClients(clients);
        }
        hasLoadedFromSupabase.current = true;
        setSyncState("idle");
        setSyncMessage("Synced");
      } catch (error) {
        if (cancelled) return;
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
    void syncDatesIntoSchedule();
  }, [clients]);

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
        await replaceSubscriptionClients(clients);
        if (!cancelled) {
          setSyncState("idle");
          setSyncMessage("Synced");
        }
      } catch (error) {
        if (!cancelled) {
          setSyncState("error");
          setSyncMessage(getSupabaseErrorMessage(error));
        }
      }
    };
    void persist();
    return () => {
      cancelled = true;
    };
  }, [clients]);

  const getStatusColor = (status: ClientStatus) => {
    switch (status) {
      case "active":
        return "default";
      case "limit_reached":
        return "secondary";
      case "pending_payment":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getStatusText = (status: ClientStatus) => {
    switch (status) {
      case "active":
        return "Active";
      case "limit_reached":
        return "Limit Reached";
      case "pending_payment":
        return "Pending Payment";
      default:
        return status;
    }
  };

  const resetClientForm = () => {
    setClientForm({
      client: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      clientSince: "",
      mrr: "",
      revisionsTotal: 3,
      status: "active",
      nextBilling: new Date().toISOString().split("T")[0],
      lastRevision: "N/A",
    });
    setClientFormMode("onboard");
    setOnboardStep(0);
    setEditingClientId(null);
  };

  const openAddClientModal = () => {
    resetClientForm();
    setIsClientModalOpen(true);
  };

  useEffect(() => {
    const onCommandNew = () => {
      resetClientForm();
      setIsClientModalOpen(true);
    };
    window.addEventListener("delphi-command-new", onCommandNew as EventListener);
    return () => window.removeEventListener("delphi-command-new", onCommandNew as EventListener);
  }, []);

  const openEditClientModal = (client: RetainerClient) => {
    setEditingClientId(client.id);
    setClientForm({
      client: client.client,
      contactName: client.contactName || "",
      contactPhone: client.contactPhone || "",
      contactEmail: client.contactEmail || "",
      clientSince: client.clientSince || "",
      mrr: `${formatMoney(parseMoney(client.mrr))}/mo`,
      revisionsTotal: client.revisionsTotal,
      status: client.status,
      nextBilling: client.nextBilling,
      lastRevision: client.lastRevision,
    });
    setClientFormMode("onboard");
    setOnboardStep(0);
    setIsClientModalOpen(true);
  };

  const handleSaveClient = () => {
    const clientName = toSmartTitleCase(clientForm.client);
    const contactName = toSmartTitleCase(clientForm.contactName);
    const contactPhone = clientForm.contactPhone.trim();
    const contactEmail = clientForm.contactEmail.trim().toLowerCase();
    const clientSince = clientForm.clientSince.trim();
    const revisionLabel = toSmartTitleCase(clientForm.lastRevision);
    if (!clientName) return;
    const mrrValue = parseMoney(clientForm.mrr);
    const formattedMrr = `${formatMoney(mrrValue)}/mo`;
    const revisionsTotal = clientForm.revisionsTotal > 0 ? clientForm.revisionsTotal : 1;

    if (editingClientId) {
      setClients(
        clients.map((client) =>
          client.id === editingClientId
            ? {
                ...client,
                client: clientName,
                contactName,
                contactPhone,
                contactEmail,
                clientSince,
                plan: DEFAULT_SUBSCRIPTION_PLAN,
                mrr: formattedMrr,
                revisionsTotal,
                status: clientForm.status,
                nextBilling: clientForm.nextBilling,
                lastRevision: revisionLabel || "N/A",
              }
            : client
        )
      );
    } else {
      setClients([
        ...clients,
        {
          id: Date.now(),
          client: clientName,
          contactName,
          contactPhone,
          contactEmail,
          clientSince,
          plan: DEFAULT_SUBSCRIPTION_PLAN,
          mrr: formattedMrr,
          revisionsUsed: 0,
          revisionsTotal,
          status: clientForm.status,
          nextBilling: clientForm.nextBilling,
          lastRevision: revisionLabel || "N/A",
          lastRevisionDate: "N/A",
        },
      ]);
    }

    setIsClientModalOpen(false);
    localStorage.removeItem(SUBSCRIPTIONS_CLIENT_DRAFT_KEY);
    setClearNextClientDraftLoad(true);
    resetClientForm();
  };

  useEffect(() => {
    if (!isClientModalOpen || editingClientId !== null) return;
    if (clearNextClientDraftLoad) {
      localStorage.removeItem(SUBSCRIPTIONS_CLIENT_DRAFT_KEY);
      setClearNextClientDraftLoad(false);
      return;
    }
    try {
      const raw = localStorage.getItem(SUBSCRIPTIONS_CLIENT_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ClientFormData>;
      setClientForm((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore malformed draft
    }
  }, [isClientModalOpen, editingClientId, clearNextClientDraftLoad]);

  useEffect(() => {
    if (!isClientModalOpen || editingClientId !== null) return;
    const hasContent = Boolean(
      clientForm.client.trim() ||
        clientForm.contactName.trim() ||
        clientForm.contactPhone.trim() ||
        clientForm.contactEmail.trim() ||
        clientForm.clientSince.trim() ||
        clientForm.mrr.trim() ||
        clientForm.lastRevision.trim()
    );
    if (!hasContent) {
      localStorage.removeItem(SUBSCRIPTIONS_CLIENT_DRAFT_KEY);
      return;
    }
    localStorage.setItem(SUBSCRIPTIONS_CLIENT_DRAFT_KEY, JSON.stringify(clientForm));
  }, [clientForm, isClientModalOpen, editingClientId]);

  useEffect(() => {
    if (!isClientModalOpen || editingClientId === null) return;
    const target = clients.find((client) => client.id === editingClientId);
    if (!target) return;

    const clientName = toSmartTitleCase(clientForm.client);
    if (!clientName) return;
    const contactName = toSmartTitleCase(clientForm.contactName);
    const contactPhone = clientForm.contactPhone.trim();
    const contactEmail = clientForm.contactEmail.trim().toLowerCase();
    const clientSince = clientForm.clientSince.trim();
    const revisionLabel = toSmartTitleCase(clientForm.lastRevision);
    const mrrValue = parseMoney(clientForm.mrr);
    const formattedMrr = `${formatMoney(mrrValue)}/mo`;
    const revisionsTotal = clientForm.revisionsTotal > 0 ? clientForm.revisionsTotal : 1;

    const nextClient: RetainerClient = {
      ...target,
      client: clientName,
      contactName,
      contactPhone,
      contactEmail,
      clientSince,
      plan: target.plan || DEFAULT_SUBSCRIPTION_PLAN,
      mrr: formattedMrr,
      revisionsTotal,
      status: clientForm.status,
      nextBilling: clientForm.nextBilling,
      lastRevision: revisionLabel || "N/A",
    };

    const hasChanged =
      target.client !== nextClient.client ||
      target.contactName !== nextClient.contactName ||
      target.contactPhone !== nextClient.contactPhone ||
      target.contactEmail !== nextClient.contactEmail ||
      target.clientSince !== nextClient.clientSince ||
      target.mrr !== nextClient.mrr ||
      target.revisionsTotal !== nextClient.revisionsTotal ||
      target.status !== nextClient.status ||
      target.nextBilling !== nextClient.nextBilling ||
      target.lastRevision !== nextClient.lastRevision;

    if (hasChanged) {
      setClients((prev) => prev.map((client) => (client.id === editingClientId ? nextClient : client)));
    }
  }, [isClientModalOpen, editingClientId, clientForm, clients, setClients]);

  useEffect(() => {
    if (searchParams.get("add") !== "client") return;
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      updated.delete("add");
      return updated;
    });
    openAddClientModal();
  }, [searchParams, setSearchParams]);

  const handleLogRevision = (id: number) => {
    setClients(
      clients.map((client) => {
        if (client.id !== id) return client;
        const revisionsUsed = Math.min(client.revisionsUsed + 1, client.revisionsTotal);
        return {
          ...client,
          revisionsUsed,
          status: revisionsUsed >= client.revisionsTotal ? "limit_reached" : client.status,
          lastRevision: "Manual revision logged",
          lastRevisionDate: new Date().toISOString().split("T")[0],
        };
      })
    );
  };

  const handleDeleteClient = (id: number) => {
    setClients(clients.filter((client) => client.id !== id));
  };

  const reorderClientsByDrag = (sourceId: number, targetId: number, position: "before" | "after") => {
    if (sourceId === targetId) return;
    setClients((prev) => {
      const sourceIndex = prev.findIndex((item) => item.id === sourceId);
      const targetIndex = prev.findIndex((item) => item.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;

      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      if (!moved) return prev;

      let insertIndex = targetIndex;
      if (sourceIndex < targetIndex) insertIndex -= 1;
      if (position === "after") insertIndex += 1;
      insertIndex = Math.max(0, Math.min(next.length, insertIndex));
      next.splice(insertIndex, 0, moved);
      return next;
    });
  };

  const onboardingSteps = ["Client", "Contact Details", "MRR", "Status & Billing"] as const;
  const updateMrrField = (value: string) => {
    const normalized = normalizeMoneyInput(value.replace(/\/mo/gi, ""));
    setClientForm((prev) => ({
      ...prev,
      mrr: normalized ? `${normalized}/mo` : "",
    }));
  };
  const canAdvanceOnboardStep = () => {
    if (onboardStep === 0) return clientForm.client.trim().length > 0;
    if (onboardStep === 2) return parseMoney(clientForm.mrr) >= 0;
    return true;
  };

  const activeRetainers = clients.filter((client) => client.status === "active").length;
  const monthlyRecurring = clients.reduce((sum, client) => sum + parseMoney(client.mrr), 0);
  const pendingPayments = clients.filter((client) => client.status === "pending_payment").length;
  const revisionsAvailable = clients.reduce(
    (sum, client) => sum + Math.max(client.revisionsTotal - client.revisionsUsed, 0),
    0
  );
  const revisionRequests = useMemo(
    () =>
      clients
        .filter((client) => client.lastRevision && client.lastRevision !== "N/A")
        .map((client) => ({
          id: client.id,
          client: client.client,
          request: client.lastRevision,
          date: client.lastRevisionDate,
          status: client.status,
        }))
        .sort((a, b) => {
          const statusRank = (value: ClientStatus) =>
            value === "limit_reached" ? 3 : value === "pending_payment" ? 2 : 1;
          if (statusRank(a.status) !== statusRank(b.status)) return statusRank(b.status) - statusRank(a.status);
          return b.date.localeCompare(a.date);
        }),
    [clients]
  );
  const getTenureLabel = (clientSince: string) => {
    if (!clientSince) return "Tenure not set";
    const start = new Date(clientSince);
    if (Number.isNaN(start.getTime())) return "Tenure not set";
    const now = new Date();
    let months =
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) months -= 1;
    months = Math.max(0, months);
    if (months < 1) return "Less than 1 month";
    if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) return `${years} year${years === 1 ? "" : "s"}`;
    return `${years}y ${remainingMonths}m`;
  };

  return (
    <div className="app-atmosphere-page app-light-page min-h-screen relative overflow-hidden">
      <div className="absolute top-24 right-12 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-32 left-12 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-float" style={{ animationDelay: "2s" }} />

      <div className="app-light-frame relative space-y-8">
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <AnimatedTitle text="Subscriptions" className="app-light-title" />
            <p className="app-light-subtitle">Manage retainer clients and revision requests</p>
            {isSupabaseConfigured && (syncState === "syncing" || syncState === "error") ? (
              <p className={`mt-1 text-xs ${syncState === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {syncState === "syncing" ? "Supabase syncing..." : syncMessage}
              </p>
            ) : null}
            <LinkedSyncStatusLine className="mt-1" />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={openAddClientModal} className="add-action h-11 rounded-full px-6 text-base font-semibold">
              + Add Client
            </Button>
          </div>
        </div>

        <div className="content-glass-surface space-y-6 p-4 md:p-5">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            <StatCard title="Active Retainers" value={String(activeRetainers)} change="Current clients" changeType="positive" icon={Users} />
            <StatCard
              title="MRR"
              value={formatMoney(monthlyRecurring)}
              change="From all retainers"
              changeType="positive"
              icon={DollarSign}
            />
            <StatCard
              title="Pending Payments"
              value={String(pendingPayments)}
              change="Needs attention"
              changeType="negative"
              icon={AlertCircle}
              iconColor="text-destructive"
            />
            <StatCard
              title="Revisions Available"
              value={String(revisionsAvailable)}
              change="Across all clients"
              changeType="neutral"
              icon={CheckCircle}
            />
          </div>

          <Card className="glass-hero-panel p-6 animate-fade-in-up">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Revision Requests</h2>
            <Badge variant="outline">{revisionRequests.length}</Badge>
          </div>
          {revisionRequests.length === 0 ? (
            <div className="glass-list-surface rounded-[24px] p-4 text-sm text-muted-foreground">
              No revision requests yet.
            </div>
          ) : (
            <GlassScrollArea className="glass-scrollbar max-h-[220px] space-y-2 overflow-y-auto pr-1">
              {revisionRequests.map((request) => (
                <div key={request.id} className="glass-list-surface rounded-[22px] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{request.client}</p>
                    <Badge variant={getStatusColor(request.status)}>{getStatusText(request.status)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{request.request}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateWritten(request.date)}</p>
                </div>
              ))}
            </GlassScrollArea>
          )}
          </Card>

          <Card className="glass-hero-panel p-6 animate-fade-in-up">
          <div className="mb-6 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-foreground">Retainer Clients</h2>
            <span className="text-sm font-semibold text-foreground/85">Total Results {clients.length}</span>
          </div>
          <div className="space-y-4">
            {clients.map((client, index) => (
              (() => {
                const missingNextBillingDate = !String(client.nextBilling || "").trim();
                return (
              <div
                key={client.id}
                className="group relative liquid-cyan-hover entity-card-hover glass-list-surface p-5 rounded-[30px] transition-all duration-300 hover:scale-[1.01] cursor-grab active:cursor-grabbing animate-fade-in-up"
                style={{ animationDelay: `${index * 0.1}s` }}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(client.id));
                  setDraggedClientId(client.id);
                }}
                onDragEnd={() => {
                  setDraggedClientId(null);
                  setClientDropIndicator(null);
                }}
                onDragOver={(event) => {
                  if (!draggedClientId || draggedClientId === client.id) return;
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const offsetY = event.clientY - rect.top;
                  const position: "before" | "after" = offsetY < rect.height / 2 ? "before" : "after";
                  setClientDropIndicator({ clientId: client.id, position });
                }}
                onDragLeave={() => {
                  if (clientDropIndicator?.clientId === client.id) setClientDropIndicator(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!draggedClientId || draggedClientId === client.id) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const offsetY = event.clientY - rect.top;
                  const position: "before" | "after" = offsetY < rect.height / 2 ? "before" : "after";
                  reorderClientsByDrag(draggedClientId, client.id, position);
                  setClientDropIndicator(null);
                  setDraggedClientId(null);
                }}
              >
                {clientDropIndicator?.clientId === client.id && clientDropIndicator.position === "before" ? (
                  <div className="pointer-events-none absolute -top-[2px] left-4 right-4 h-[3px] rounded-full bg-cyan-300 shadow-[0_0_12px_hsl(195_100%_70%/.85)]" />
                ) : null}
                {clientDropIndicator?.clientId === client.id && clientDropIndicator.position === "after" ? (
                  <div className="pointer-events-none absolute -bottom-[2px] left-4 right-4 h-[3px] rounded-full bg-cyan-300 shadow-[0_0_12px_hsl(195_100%_70%/.85)]" />
                ) : null}
                <div className="flex items-start justify-between mb-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-foreground">{client.client}</h3>
                    {(client.contactName || client.contactEmail || client.contactPhone) ? (
                      <p className="text-xs text-muted-foreground">
                        {[client.contactName, client.contactEmail, client.contactPhone].filter(Boolean).join(" • ")}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      With You: <span className="font-medium text-foreground/90">{getTenureLabel(client.clientSince)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {missingNextBillingDate ? (
                      <Badge variant="destructive">Missing Next Billing Date</Badge>
                    ) : null}
                    <Badge variant={getStatusColor(client.status)}>{getStatusText(client.status)}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                    <p className="text-lg font-semibold text-foreground">{client.mrr}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Revisions Used</p>
                    <p className="text-lg font-semibold text-foreground">
                      {client.revisionsUsed}/{client.revisionsTotal}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Next Billing</p>
                    <p className="text-sm font-medium text-foreground">{formatDateWritten(client.nextBilling)}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Last Revision</p>
                    <p className="text-sm font-medium text-foreground truncate">{client.lastRevision}</p>
                    <p className="text-xs text-muted-foreground">{formatDateWritten(client.lastRevisionDate)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Revisions Progress</span>
                    <span className="font-medium text-foreground">
                      {Math.round((client.revisionsUsed / client.revisionsTotal) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        client.revisionsUsed >= client.revisionsTotal
                          ? "bg-destructive"
                          : "bg-gradient-to-r from-primary to-primary-glow"
                      }`}
                      style={{ width: `${(client.revisionsUsed / client.revisionsTotal) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="glass-control border-[var(--glass-stroke-soft)] bg-transparent"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleLogRevision(client.id);
                    }}
                  >
                    Log Revision
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="glass-control border-[var(--glass-stroke-soft)] bg-transparent"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEditClientModal(client);
                    }}
                  >
                    Edit Client
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="glass-control border-[var(--glass-stroke-soft)] bg-transparent"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMeetingNotesTarget({
                        key: `subscriber:${client.id}`,
                        title: `${client.client} Meeting Notes`,
                      });
                    }}
                  >
                    Notes
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="glass-control h-9 w-9 border-[var(--glass-stroke-soft)] bg-transparent"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteClient(client.id);
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
                );
              })()
            ))}
          </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={isClientModalOpen}
        onOpenChange={(open) => {
          setIsClientModalOpen(open);
          if (!open) resetClientForm();
        }}
      >
        <DialogContent className="form-dialog-shell max-w-2xl p-0">
          <div className="p-6 pb-4">
            <DialogHeader>
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                {editingClientId ? "Edit Client" : "Add Client"}
              </DialogTitle>
            </DialogHeader>
            <p className="mt-1 text-sm text-muted-foreground">Choose mode: guided flow or full form.</p>
          </div>

          <div className="relative px-6 pb-6">
            <div className="absolute right-6 top-0 z-10">
              <Tabs value={clientFormMode} onValueChange={(value) => setClientFormMode(value as ClientFormMode)}>
                <TabsList className="form-mode-tabs">
                  <TabsTrigger value="onboard" className="h-6 rounded-full px-3 text-[11px] font-semibold">Guided</TabsTrigger>
                  <TabsTrigger value="all" className="h-6 rounded-full px-3 text-[11px] font-semibold">Full Form</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {clientFormMode === "onboard" ? (
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
                  <Input
                    value={clientForm.client}
                    onChange={(event) => setClientForm({ ...clientForm, client: toSmartTitleCaseLive(event.target.value) })}
                    onBlur={(event) => setClientForm({ ...clientForm, client: toSmartTitleCase(event.target.value) })}
                    className="h-11"
                  />
                )}
                {onboardStep === 1 && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      value={clientForm.contactName}
                      onChange={(event) => setClientForm({ ...clientForm, contactName: toSmartTitleCaseLive(event.target.value) })}
                      onBlur={(event) => setClientForm({ ...clientForm, contactName: toSmartTitleCase(event.target.value) })}
                      placeholder="Contact Name"
                      className="h-11"
                    />
                    <Input
                      value={clientForm.contactPhone}
                      onChange={(event) => setClientForm({ ...clientForm, contactPhone: event.target.value })}
                      placeholder="Phone"
                      className="h-11"
                    />
                    <Input
                      value={clientForm.contactEmail}
                      onChange={(event) => setClientForm({ ...clientForm, contactEmail: event.target.value.toLowerCase() })}
                      placeholder="Email"
                      className="h-11 md:col-span-2"
                    />
                  </div>
                )}
                {onboardStep === 2 && (
                  <Input
                    value={clientForm.mrr}
                    onChange={(event) => updateMrrField(event.target.value)}
                    onBlur={(event) => updateMrrField(event.target.value)}
                    inputMode="decimal"
                    placeholder="$1,200/mo"
                    className="h-11"
                  />
                )}
                {onboardStep === 3 && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Select
                      value={clientForm.status}
                      onValueChange={(value) => setClientForm({ ...clientForm, status: value as ClientStatus })}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="limit_reached">Limit Reached</SelectItem>
                        <SelectItem value="pending_payment">Pending Payment</SelectItem>
                      </SelectContent>
                    </Select>
                    <DatePickerField
                      value={clientForm.nextBilling}
                      onChange={(value) => setClientForm({ ...clientForm, nextBilling: value })}
                      triggerClassName="h-11"
                    />
                  </div>
                )}

                <div className="mt-5 flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setOnboardStep((step) => Math.max(0, step - 1))}
                    disabled={onboardStep === 0}
                  >
                    Back
                  </Button>
                  {onboardStep < onboardingSteps.length - 1 ? (
                    <Button
                      onClick={() => setOnboardStep((step) => Math.min(onboardingSteps.length - 1, step + 1))}
                      disabled={!canAdvanceOnboardStep()}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button onClick={handleSaveClient} disabled={!canAdvanceOnboardStep()}>
                      Save Client
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="form-surface p-5">
                <div className="space-y-4">
                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">CLIENT</p>
                    <Input
                      value={clientForm.client}
                      onChange={(event) => setClientForm({ ...clientForm, client: toSmartTitleCaseLive(event.target.value) })}
                      onBlur={(event) => setClientForm({ ...clientForm, client: toSmartTitleCase(event.target.value) })}
                      className="h-11"
                    />
                  </section>

                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">CONTACT DETAILS</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Input
                        value={clientForm.contactName}
                        onChange={(event) => setClientForm({ ...clientForm, contactName: toSmartTitleCaseLive(event.target.value) })}
                        onBlur={(event) => setClientForm({ ...clientForm, contactName: toSmartTitleCase(event.target.value) })}
                        placeholder="Contact Name"
                        className="h-11"
                      />
                      <Input
                        value={clientForm.contactPhone}
                        onChange={(event) => setClientForm({ ...clientForm, contactPhone: event.target.value })}
                        placeholder="Phone"
                        className="h-11"
                      />
                      <Input
                        value={clientForm.contactEmail}
                        onChange={(event) => setClientForm({ ...clientForm, contactEmail: event.target.value.toLowerCase() })}
                        placeholder="Email"
                        className="h-11 md:col-span-2"
                      />
                      <DatePickerField
                        value={clientForm.clientSince}
                        onChange={(value) => setClientForm({ ...clientForm, clientSince: value })}
                        triggerClassName="h-11 md:col-span-2"
                        placeholder="Client Since"
                      />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">MRR</p>
                    <Input
                      value={clientForm.mrr}
                      onChange={(event) => updateMrrField(event.target.value)}
                      onBlur={(event) => updateMrrField(event.target.value)}
                      inputMode="decimal"
                      placeholder="$1,200/mo"
                      className="h-11"
                    />
                  </section>

                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">REVISIONS + STATUS</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Input
                        type="number"
                        value={clientForm.revisionsTotal}
                        onChange={(event) => setClientForm({ ...clientForm, revisionsTotal: Math.max(1, Number(event.target.value) || 1) })}
                        placeholder="Revisions Total"
                        className="h-11"
                      />
                      <Select value={clientForm.status} onValueChange={(value) => setClientForm({ ...clientForm, status: value as ClientStatus })}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="limit_reached">Limit Reached</SelectItem>
                          <SelectItem value="pending_payment">Pending Payment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">BILLING + LAST REVISION</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <DatePickerField
                        value={clientForm.nextBilling}
                        onChange={(value) => setClientForm({ ...clientForm, nextBilling: value })}
                        triggerClassName="h-11"
                      />
                      <Input
                        value={clientForm.lastRevision}
                        onChange={(event) => setClientForm({ ...clientForm, lastRevision: toSmartTitleCaseLive(event.target.value) })}
                        onBlur={(event) => setClientForm({ ...clientForm, lastRevision: toSmartTitleCase(event.target.value) })}
                        placeholder="Last Revision Note"
                        className="h-11"
                      />
                    </div>
                  </section>
                </div>
                <div className="mt-5 flex items-center justify-end">
                  <Button onClick={handleSaveClient}>
                    Save Client
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
