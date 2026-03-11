import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Mail, Search, TrendingUp, UserCheck, Clock, MoreHorizontal, Trash2, Users, Compass, ListTodo, Star, SlidersHorizontal, ChevronDown, Plus } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useLocalStorageState } from "@/hooks/use-local-storage";
import { AnimatedTitle } from "@/components/AnimatedTitle";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { logActivity } from "@/lib/activity-log";
import { formatDateWritten } from "@/lib/date-format";
import { useSearchParams } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getSupabaseErrorMessage } from "@/lib/supabase-errors";
import { fetchSalesOutreach, mapSalesOutreachRowToRecord, replaceSalesOutreach, type OutreachStatus } from "@/lib/supabase-sales-outreach";
import { fetchSalesPageState, replaceSalesPageState } from "@/lib/supabase-sales-page-state";
import { syncDatesIntoSchedule } from "@/lib/date-funnel-sync";
import { toSmartTitleCase, toSmartTitleCaseLive } from "@/lib/text-format";
import { formatPhoneNumber } from "@/lib/phone-format";
import { sanitizeWebsiteInput } from "@/lib/url-format";
import { MeetingNotesDialog } from "@/components/MeetingNotesDialog";
import { LinkedSyncStatusLine } from "@/components/LinkedSyncStatusLine";
import { GlassScrollArea } from "@/components/ui/glass-scroll-area";
import { promptForNextStep } from "@/lib/next-step";
import {
  getTimeZoneLabel,
  getUserTimeZone,
  resolveClientTimeZone,
  type ProspectTimeZoneMode,
} from "@/lib/prospect-timezone";

type ProspectStatus = OutreachStatus;
type ProspectSource = "cold_email" | "referral" | "network" | "repeat" | "targeted";
type ProspectInterest = "low" | "medium" | "high";
type ProspectAskedFor =
  | "price"
  | "sample"
  | "meeting"
  | "interest"
  | "maintenance"
  | "edits"
  | "later"
  | "not_set";
type FollowUpType = "call" | "email";
type ProspectPlanMode = "custom" | "template";
type ProspectBudgetTier = "premium" | "standard" | "basic";
type ProspectSourceForm = ProspectSource | "";
type ProspectInterestForm = ProspectInterest | "";
type ProspectPlanModeForm = ProspectPlanMode | "";
type ProspectBudgetTierForm = ProspectBudgetTier | "";
type ProspectStatusForm = ProspectStatus | "";
type FollowUpTypeForm = FollowUpType | "";
const ROLE_CREATE_VALUE = "__create_role__";
const INDUSTRY_CREATE_VALUE = "__create_industry__";
const REALTOR_ROLE = "Realtor";
const REALTOR_INDUSTRY = "Real Estate";

interface OutreachItem {
  id: number;
  prospect: string;
  contact: string;
  status: ProspectStatus;
  lastContact: string;
  nextFollowUpDate?: string;
  nextFollowUpTime?: string;
  emailsSent: number;
  replies: number;
  notionUrl: string;
  companyName?: string;
  prospectName?: string;
  role?: string;
  industry?: string;
  source?: ProspectSource;
  instantlyList?: string;
  campaign?: string;
  group?: string;
  interestLevel?: ProspectInterest;
  planMode?: ProspectPlanMode;
  budgetTier?: ProspectBudgetTier;
  responses?: ProspectAskedFor[];
  askedFor?: ProspectAskedFor;
  askedForSecondary?: ProspectAskedFor;
  autoTopProspect?: boolean;
  email?: string;
  secondaryEmail?: string;
  cellPhone?: string;
  businessPhone?: string;
  city?: string;
  state?: string;
  timeZoneMode?: ProspectTimeZoneMode;
  clientTimeZone?: string;
  fee?: string;
  mrr?: string;
  followUpType?: FollowUpType;
  specialNotes?: string;
}

type ProspectFormMode = "onboard" | "all";

interface ProspectFormData {
  companyName: string;
  prospectName: string;
  role: string;
  industry: string;
  source: ProspectSourceForm;
  instantlyList: string;
  campaign: string;
  group: string;
  interestLevel: ProspectInterestForm;
  planMode: ProspectPlanModeForm;
  budgetTier: ProspectBudgetTierForm;
  responses: ProspectAskedFor[];
  askedFor: ProspectAskedFor;
  askedForSecondary: ProspectAskedFor;
  autoTopProspect: boolean;
  status: ProspectStatusForm;
  lastContact: string;
  nextFollowUpDate: string;
  hasSpecificTime: boolean;
  nextFollowUpTime: string;
  email: string;
  secondaryEmail: string;
  cellPhone: string;
  businessPhone: string;
  city: string;
  state: string;
  timeZoneMode: ProspectTimeZoneMode;
  clientTimeZone: string;
  fee: string;
  mrr: string;
  followUpType: FollowUpTypeForm;
  prospect: string;
  contact: string;
  notionUrl: string;
  specialNotes: string;
  emailsSent: number;
  replies: number;
}

interface SalesStrategyItem {
  id: number;
  title: string;
  note: string;
}

interface SalesTaskItem {
  id: number;
  title: string;
  done: boolean;
}

interface LimboItem {
  id: number;
  prospect: string;
  contact: string;
  reason: string;
  note: string;
  createdAt: string;
}

const initialOutreachData: OutreachItem[] = [];
const RESPONSE_OPTIONS: ProspectAskedFor[] = [
  "price",
  "sample",
  "meeting",
  "interest",
  "maintenance",
  "edits",
  "later",
];
const CREATE_GROUP_VALUE = "__create_group__";
const TIME_PRESETS: Array<{ label: string; value: string }> = [
  { label: "Morning", value: "09:00" },
  { label: "Afternoon", value: "13:00" },
  { label: "Evening", value: "17:00" },
];

const getAskedForLabel = (value?: ProspectAskedFor) => {
  if (value === "price") return "Price";
  if (value === "sample") return "Sample";
  if (value === "meeting") return "Meeting";
  if (value === "interest") return "Interest";
  if (value === "maintenance") return "Maintenance";
  if (value === "edits") return "Edits";
  if (value === "later") return "Later";
  return "Not Set";
};

const normalizeResponseSelections = (values: unknown): ProspectAskedFor[] => {
  if (!Array.isArray(values)) return [];
  const next: ProspectAskedFor[] = [];
  values.forEach((value) => {
    if (
      (value === "price" ||
        value === "sample" ||
        value === "meeting" ||
        value === "interest" ||
        value === "maintenance" ||
        value === "edits") &&
      !next.includes(value)
    ) {
      next.push(value);
    }
  });
  return next;
};

const deriveResponseSelections = (
  responses: unknown,
  askedFor?: ProspectAskedFor,
  askedForSecondary?: ProspectAskedFor
) => {
  const fromResponses = normalizeResponseSelections(responses);
  if (fromResponses.length > 0) return fromResponses;
  const next: ProspectAskedFor[] = [];
  if (askedFor && askedFor !== "not_set") next.push(askedFor);
  if (askedForSecondary && askedForSecondary !== "not_set" && !next.includes(askedForSecondary)) {
    next.push(askedForSecondary);
  }
  return next;
};

const getResponseSummary = (responses: ProspectAskedFor[]) => {
  if (responses.length === 0) return "Select responses";
  if (responses.length <= 2) return responses.map((value) => getAskedForLabel(value)).join(", ");
  return `${responses.slice(0, 2).map((value) => getAskedForLabel(value)).join(", ")} +${responses.length - 2}`;
};

const normalizeEmailKey = (value: string | undefined | null) => String(value || "").trim().toLowerCase();
const normalizePhoneKey = (value: string | undefined | null) => {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
};
const normalizeWebsiteKey = (value: string | undefined | null) => {
  const raw = sanitizeWebsiteInput(value).toLowerCase();
  if (!raw) return "";
  return raw
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
};
const normalizeRoleLabel = (value: string | undefined | null) => toSmartTitleCase(String(value || "").trim());
const isRealtorRoleValue = (value: string | undefined | null) => normalizeRoleLabel(value).toLowerCase() === "realtor";

const SALES_PROSPECT_DRAFT_KEY = "delphi_sales_prospect_draft_v1";
const US_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
] as const;

export default function Sales() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [folderView, setFolderView] = useState<"leads" | "strategy" | "tasks">("leads");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProspectStatus>("all");
  const [responseFilter, setResponseFilter] = useState<"any" | "replied" | "no-reply">("any");
  const [activityFilter, setActivityFilter] = useState<"all" | "7d" | "30d">("all");
  const [sortMode, setSortMode] = useState<"manual" | "focus" | "recent" | "replies">("focus");
  const [draggedProspectId, setDraggedProspectId] = useState<number | null>(null);
  const [prospectDropIndicator, setProspectDropIndicator] = useState<{ prospectId: number; position: "before" | "after" } | null>(null);
  const [topOnly, setTopOnly] = useState(false);
  const [outreachData, setOutreachData] = useLocalStorageState<OutreachItem[]>(
    "delphi_sales_outreach_v2",
    initialOutreachData
  );
  const [starredProspectIds, setStarredProspectIds] = useLocalStorageState<number[]>(
    "delphi_sales_starred_prospect_ids_v1",
    []
  );
  const [strategyItems, setStrategyItems] = useLocalStorageState<SalesStrategyItem[]>(
    "delphi_sales_strategy_items_v1",
    []
  );
  const [salesTasks, setSalesTasks] = useLocalStorageState<SalesTaskItem[]>(
    "delphi_sales_tasks_v1",
    []
  );
  const [limboItems, setLimboItems] = useLocalStorageState<LimboItem[]>(
    "delphi_sales_limbo_v1",
    []
  );
  const [isProspectModalOpen, setIsProspectModalOpen] = useState(false);
  const [isLimboModalOpen, setIsLimboModalOpen] = useState(false);
  const [editingProspectId, setEditingProspectId] = useState<number | null>(null);
  const [viewProspect, setViewProspect] = useState<OutreachItem | null>(null);
  const [meetingNotesTarget, setMeetingNotesTarget] = useState<{ key: string; title: string } | null>(null);
  const [clearNextProspectDraftLoad, setClearNextProspectDraftLoad] = useState(false);
  const [instantlyLists, setInstantlyLists] = useLocalStorageState<string[]>(
    "delphi_sales_instantly_lists_v1",
    ["500k"]
  );
  const [campaignOptions, setCampaignOptions] = useLocalStorageState<string[]>(
    "delphi_sales_campaign_options_v1",
    ["General"]
  );
  const [groupOptions, setGroupOptions] = useLocalStorageState<string[]>(
    "delphi_sales_group_options_v1",
    ["General"]
  );
  const [creatingInstantlyList, setCreatingInstantlyList] = useState(false);
  const [creatingCampaignOption, setCreatingCampaignOption] = useState(false);
  const [creatingGroupOption, setCreatingGroupOption] = useState(false);
  const [instantlyListDraft, setInstantlyListDraft] = useState("");
  const [campaignOptionDraft, setCampaignOptionDraft] = useState("");
  const [groupOptionDraft, setGroupOptionDraft] = useState("");
  const [roleOptions, setRoleOptions] = useLocalStorageState<string[]>("delphi_sales_role_options_v1", [REALTOR_ROLE]);
  const [industryOptions, setIndustryOptions] = useLocalStorageState<string[]>("delphi_sales_industry_options_v1", [REALTOR_INDUSTRY]);
  const [creatingRoleOption, setCreatingRoleOption] = useState(false);
  const [creatingIndustryOption, setCreatingIndustryOption] = useState(false);
  const [roleOptionDraft, setRoleOptionDraft] = useState("");
  const [industryOptionDraft, setIndustryOptionDraft] = useState("");
  const [prospectFormMode, setProspectFormMode] = useState<ProspectFormMode>("onboard");
  const [onboardStep, setOnboardStep] = useState(0);
  const [isFilterBarOpen, setIsFilterBarOpen] = useState(false);
  const [topProspectsScrollActive, setTopProspectsScrollActive] = useState(false);
  const [outreachScrollActive, setOutreachScrollActive] = useState(false);
  const [limboScrollActive, setLimboScrollActive] = useState(false);
  const topProspectsScrollTimeoutRef = useRef<number | null>(null);
  const outreachScrollTimeoutRef = useRef<number | null>(null);
  const limboScrollTimeoutRef = useRef<number | null>(null);
  const [prospectForm, setProspectForm] = useState<ProspectFormData>({
    companyName: "",
    prospectName: "",
    role: "",
    industry: "",
    source: "",
    instantlyList: "",
    campaign: "",
    group: "",
    interestLevel: "",
    planMode: "",
    budgetTier: "",
    responses: [],
    askedFor: "not_set",
    askedForSecondary: "not_set",
    autoTopProspect: true,
    email: "",
    secondaryEmail: "",
    cellPhone: "",
    businessPhone: "",
    city: "",
    state: "",
    timeZoneMode: "mine",
    clientTimeZone: "",
    fee: "",
    mrr: "",
    followUpType: "",
    prospect: "",
    contact: "",
    status: "",
    lastContact: "",
    nextFollowUpDate: "",
    hasSpecificTime: false,
    nextFollowUpTime: "",
    notionUrl: "",
    specialNotes: "",
    emailsSent: 0,
    replies: 0,
  });
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [supabaseLoadCount, setSupabaseLoadCount] = useState<number | null>(null);
  const [limboForm, setLimboForm] = useState({
    prospect: "",
    contact: "",
    reason: "",
    note: "",
  });
  const hasLoadedFromSupabase = useRef(false);
  const hasRemoteRowsFromSupabase = useRef(false);
  const suppressNextSync = useRef(false);
  const hasLoadedPageStateFromSupabase = useRef(false);
  const suppressNextPageStateSync = useRef(false);
  const userTimeZone = getUserTimeZone();
  const inferredClientTimeZone = useMemo(
    () => resolveClientTimeZone(prospectForm.city, prospectForm.state),
    [prospectForm.city, prospectForm.state]
  );
  const activeSchedulingTimeZone = prospectForm.timeZoneMode === "client" ? inferredClientTimeZone || prospectForm.clientTimeZone : userTimeZone;

  const buildSalesPageState = useCallback(
    (overrides?: Partial<Record<
      | "starred_prospect_ids"
      | "strategy_items"
      | "sales_tasks"
      | "limbo_items"
      | "instantly_lists"
      | "campaign_options"
      | "group_options"
      | "role_options"
      | "industry_options",
      unknown
    >>) => ({
      starred_prospect_ids: starredProspectIds,
      strategy_items: strategyItems,
      sales_tasks: salesTasks,
      limbo_items: limboItems,
      instantly_lists: instantlyLists,
      campaign_options: campaignOptions,
      group_options: groupOptions,
      role_options: roleOptions,
      industry_options: industryOptions,
      ...(overrides || {}),
    }),
    [starredProspectIds, strategyItems, salesTasks, limboItems, instantlyLists, campaignOptions, groupOptions, roleOptions, industryOptions]
  );

  const persistSalesNow = useCallback(
    async (
      nextOutreach: OutreachItem[],
      pageStateOverrides?: Partial<Record<
        | "starred_prospect_ids"
        | "strategy_items"
        | "sales_tasks"
        | "limbo_items"
        | "instantly_lists"
        | "campaign_options"
        | "group_options"
        | "role_options"
        | "industry_options",
        unknown
      >>
    ) => {
      if (!isSupabaseConfigured) return true;
      setSyncState("syncing");
      try {
        await replaceSalesOutreach(nextOutreach);
        await replaceSalesPageState(buildSalesPageState(pageStateOverrides));
        setSyncState("idle");
        setSyncMessage("Synced");
        return true;
      } catch (error) {
        setSyncState("error");
        setSyncMessage(getSupabaseErrorMessage(error));
        return false;
      }
    },
    [buildSalesPageState]
  );

  const toDateMs = (date: string) => {
    const parsed = new Date(`${String(date || "").trim()}T12:00:00`).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const nowMs = Date.now();
  const dayMs = 1000 * 60 * 60 * 24;

  useEffect(() => {
    return () => {
      if (topProspectsScrollTimeoutRef.current !== null) {
        window.clearTimeout(topProspectsScrollTimeoutRef.current);
      }
      if (outreachScrollTimeoutRef.current !== null) {
        window.clearTimeout(outreachScrollTimeoutRef.current);
      }
      if (limboScrollTimeoutRef.current !== null) {
        window.clearTimeout(limboScrollTimeoutRef.current);
      }
    };
  }, []);

  const markTopProspectsScrolling = () => {
    setTopProspectsScrollActive(true);
    if (topProspectsScrollTimeoutRef.current !== null) {
      window.clearTimeout(topProspectsScrollTimeoutRef.current);
    }
    topProspectsScrollTimeoutRef.current = window.setTimeout(() => {
      setTopProspectsScrollActive(false);
    }, 1600);
  };


  const markOutreachScrolling = () => {
    setOutreachScrollActive(true);
    if (outreachScrollTimeoutRef.current !== null) {
      window.clearTimeout(outreachScrollTimeoutRef.current);
    }
    outreachScrollTimeoutRef.current = window.setTimeout(() => {
      setOutreachScrollActive(false);
    }, 1600);
  };

  const markLimboScrolling = () => {
    setLimboScrollActive(true);
    if (limboScrollTimeoutRef.current !== null) {
      window.clearTimeout(limboScrollTimeoutRef.current);
    }
    limboScrollTimeoutRef.current = window.setTimeout(() => {
      setLimboScrollActive(false);
    }, 1600);
  };

  useEffect(() => {
    setOutreachData((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if ((item.source as string | undefined) !== "instantly_ai") return item;
        changed = true;
        return { ...item, source: "cold_email" as ProspectSource };
      });
      return changed ? next : prev;
    });
  }, [setOutreachData]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const loadFromSupabase = async () => {
      setSyncState("syncing");
      setSyncMessage("Syncing leads...");
      try {
        const rows = await fetchSalesOutreach();
        if (cancelled) return;
        if (rows.length > 0) {
          hasRemoteRowsFromSupabase.current = true;
          setSupabaseLoadCount(rows.length);
          suppressNextSync.current = true;
          setOutreachData(
            rows.map((row) => {
              const mapped = mapSalesOutreachRowToRecord(row);
              return {
                ...mapped,
                autoTopProspect: mapped.autoTopProspect ?? true,
              };
            })
          );
        } else {
          hasRemoteRowsFromSupabase.current = false;
          setSupabaseLoadCount(0);
          if (outreachData.length > 0) {
            await replaceSalesOutreach(outreachData);
          }
        }
        hasLoadedFromSupabase.current = true;
        setSyncState("idle");
        setSyncMessage("Synced");
      } catch (error) {
        if (cancelled) return;
        hasLoadedFromSupabase.current = true;
        setSupabaseLoadCount(null);
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
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    const loadPageStateFromSupabase = async () => {
      try {
        const rows = await fetchSalesPageState();
        if (cancelled) return;
        const stateMap = new Map(rows.map((row) => [row.key, row.payload]));
        const parseNumberArray = (value: unknown) =>
          Array.isArray(value) ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item)) : [];
        const parseStringArray = (value: unknown) =>
          Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
        const parseStrategyItems = (value: unknown): SalesStrategyItem[] =>
          Array.isArray(value)
            ? value
                .map((item) => {
                  if (!item || typeof item !== "object") return null;
                  const row = item as Record<string, unknown>;
                  const id = Number(row.id);
                  const title = String(row.title || "").trim();
                  const note = String(row.note || "").trim();
                  if (!Number.isFinite(id) || !title) return null;
                  return { id, title, note };
                })
                .filter((item): item is SalesStrategyItem => Boolean(item))
            : [];
        const parseSalesTasks = (value: unknown): SalesTaskItem[] =>
          Array.isArray(value)
            ? value
                .map((item) => {
                  if (!item || typeof item !== "object") return null;
                  const row = item as Record<string, unknown>;
                  const id = Number(row.id);
                  const title = String(row.title || "").trim();
                  if (!Number.isFinite(id) || !title) return null;
                  return { id, title, done: Boolean(row.done) };
                })
                .filter((item): item is SalesTaskItem => Boolean(item))
            : [];
        const parseLimboItems = (value: unknown): LimboItem[] =>
          Array.isArray(value)
            ? value
                .map((item) => {
                  if (!item || typeof item !== "object") return null;
                  const row = item as Record<string, unknown>;
                  const id = Number(row.id);
                  const prospect = String(row.prospect || "").trim();
                  if (!Number.isFinite(id) || !prospect) return null;
                  return {
                    id,
                    prospect,
                    contact: String(row.contact || "").trim(),
                    reason: String(row.reason || "").trim(),
                    note: String(row.note || "").trim(),
                    createdAt: String(row.createdAt || "").trim(),
                  };
                })
                .filter((item): item is LimboItem => Boolean(item))
            : [];

        suppressNextPageStateSync.current = true;
        if (stateMap.has("starred_prospect_ids")) setStarredProspectIds(parseNumberArray(stateMap.get("starred_prospect_ids")));
        if (stateMap.has("strategy_items")) setStrategyItems(parseStrategyItems(stateMap.get("strategy_items")));
        if (stateMap.has("sales_tasks")) setSalesTasks(parseSalesTasks(stateMap.get("sales_tasks")));
        if (stateMap.has("limbo_items")) setLimboItems(parseLimboItems(stateMap.get("limbo_items")));
        if (stateMap.has("instantly_lists")) setInstantlyLists(parseStringArray(stateMap.get("instantly_lists")));
        if (stateMap.has("campaign_options")) setCampaignOptions(parseStringArray(stateMap.get("campaign_options")));
        if (stateMap.has("group_options")) setGroupOptions(parseStringArray(stateMap.get("group_options")));
        if (stateMap.has("role_options")) setRoleOptions(parseStringArray(stateMap.get("role_options")));
        if (stateMap.has("industry_options")) setIndustryOptions(parseStringArray(stateMap.get("industry_options")));

        if (rows.length === 0) {
          await replaceSalesPageState({
            starred_prospect_ids: starredProspectIds,
            strategy_items: strategyItems,
            sales_tasks: salesTasks,
            limbo_items: limboItems,
            instantly_lists: instantlyLists,
            campaign_options: campaignOptions,
            group_options: groupOptions,
            role_options: roleOptions,
            industry_options: industryOptions,
          });
        }
        hasLoadedPageStateFromSupabase.current = true;
      } catch (error) {
        if (cancelled) return;
        hasLoadedPageStateFromSupabase.current = true;
        setSyncState("error");
        setSyncMessage(getSupabaseErrorMessage(error));
      }
    };
    void loadPageStateFromSupabase();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      // Ensure date-funnel sync reads the latest Sales state in the same cycle.
      localStorage.setItem("delphi_sales_outreach_v2", JSON.stringify(outreachData));
    } catch {
      // Ignore storage write failures; sync helper can still use previous snapshot.
    }
    void syncDatesIntoSchedule();
  }, [outreachData]);

  useEffect(() => {
    if (!isSupabaseConfigured || !hasLoadedFromSupabase.current) return;
    if (!hasRemoteRowsFromSupabase.current && outreachData.length === 0) return;
    if (suppressNextSync.current) {
      suppressNextSync.current = false;
      return;
    }
    let cancelled = false;
    const persist = async () => {
      setSyncState("syncing");
      try {
        await replaceSalesOutreach(outreachData);
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
  }, [outreachData]);

  useEffect(() => {
    if (!isSupabaseConfigured || !hasLoadedPageStateFromSupabase.current) return;
    if (suppressNextPageStateSync.current) {
      suppressNextPageStateSync.current = false;
      return;
    }
    let cancelled = false;
    const persistPageState = async () => {
      try {
        await replaceSalesPageState({
          starred_prospect_ids: starredProspectIds,
          strategy_items: strategyItems,
          sales_tasks: salesTasks,
          limbo_items: limboItems,
          instantly_lists: instantlyLists,
          campaign_options: campaignOptions,
          group_options: groupOptions,
          role_options: roleOptions,
          industry_options: industryOptions,
        });
        if (!cancelled && syncState !== "error") {
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
    void persistPageState();
    return () => {
      cancelled = true;
    };
  }, [
    starredProspectIds,
    strategyItems,
    salesTasks,
    limboItems,
    instantlyLists,
    campaignOptions,
    groupOptions,
    roleOptions,
    industryOptions,
    syncState,
  ]);

  const getFocusScore = (item: OutreachItem) => {
    const replies = Number(item.replies) || 0;
    const emailsSent = Number(item.emailsSent) || 0;
    const lastContactMs = toDateMs(String(item.lastContact || ""));
    const statusWeight =
      item.status === "interested"
        ? 24
        : item.status === "booked"
          ? 28
          : item.status === "verdict"
            ? 22
          : item.status === "follow_up"
            ? 14
            : -4;
    const interestWeight =
      item.interestLevel === "high" ? 18 : item.interestLevel === "medium" ? 8 : item.interestLevel === "low" ? 2 : 0;
    const recencyDays = Math.max(0, Math.floor((nowMs - lastContactMs) / dayMs));
    const recencyWeight = Math.max(0, 18 - Math.min(18, recencyDays));
    return replies * 22 + emailsSent * 3 + statusWeight + interestWeight + recencyWeight;
  };

  const getSourceLabel = (source?: ProspectSource) => {
    if (source === "cold_email") return "Cold Email";
    if (source === "repeat") return "Repeat";
    if (source === "targeted") return "Targeted";
    if (source === "referral") return "Referral";
    if (source === "network") return "Network";
    return "Unknown";
  };

  const getStatusLabel = (status: ProspectStatus) => {
    if (status === "interested") return "Interested";
    if (status === "follow_up") return "Follow-up";
    if (status === "booked") return "Booked";
    if (status === "verdict") return "Verdict";
    return "No Response";
  };

  const getStatusBadgeClass = (status: ProspectStatus) => {
    if (status === "interested") {
      return "border-emerald-300/70 bg-emerald-100/65 text-emerald-700 dark:border-emerald-400/45 dark:bg-emerald-500/18 dark:text-emerald-200";
    }
    if (status === "follow_up") {
      return "border-amber-300/70 bg-amber-100/70 text-amber-700 dark:border-amber-400/45 dark:bg-amber-500/20 dark:text-amber-200";
    }
    if (status === "booked") {
      return "border-cyan-300/75 bg-cyan-100/70 text-cyan-700 dark:border-cyan-400/45 dark:bg-cyan-500/18 dark:text-cyan-200";
    }
    if (status === "verdict") {
      return "border-violet-300/70 bg-violet-100/70 text-violet-700 dark:border-violet-400/45 dark:bg-violet-500/18 dark:text-violet-200";
    }
    return "border-slate-300/70 bg-slate-100/70 text-slate-700 dark:border-slate-400/40 dark:bg-slate-500/16 dark:text-slate-200";
  };

  const sourceBadgeClass =
    "inline-flex max-w-full items-center whitespace-nowrap rounded-full border border-border/70 bg-card/70 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground";
  const websiteTypeBadgeClass =
    "inline-flex max-w-full items-center whitespace-nowrap rounded-full border border-primary/35 bg-primary/12 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-primary";
  const budgetTierBadgeClass =
    "inline-flex max-w-full items-center whitespace-nowrap rounded-full border border-emerald-300/45 bg-emerald-100/65 px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-emerald-700 dark:border-emerald-300/35 dark:bg-emerald-500/16 dark:text-emerald-200";

  const getWebsiteTypeLabel = (mode?: ProspectPlanMode) => {
    if (mode === "template") return "Template";
    return "Custom";
  };

  const getBudgetTierLabel = (value?: ProspectBudgetTier) => {
    if (value === "premium") return "Premium";
    if (value === "standard") return "Standard";
    if (value === "basic") return "Basic";
    return "Not Set";
  };

  const formatMoneyPreview = (value?: string) => {
    if (!value) return "$0";
    const amount = Number(String(value).replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(amount)) return "$0";
    return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  };

  const isValidTimeValue = (value?: string) =>
    Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

  const formatTime12 = (value?: string) => {
    if (!isValidTimeValue(value)) return "";
    const [hoursRaw, minutes] = String(value).split(":");
    const hours = Number(hoursRaw);
    const period = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}:${minutes} ${period}`;
  };

  const formatNextFollowUp = (date?: string, time?: string) => {
    if (!date) return "Not scheduled";
    const dateText = formatDateWritten(date);
    const timeText = formatTime12(time);
    return timeText ? `${dateText} • ${timeText}` : dateText;
  };

  const formatScheduledPreview = (
    date?: string,
    time?: string,
    mode: ProspectTimeZoneMode = "mine",
    clientTimeZone?: string
  ) => {
    const base = formatNextFollowUp(date, time);
    if (!date) return base;
    if (mode === "client") {
      return `${base} • ${getTimeZoneLabel(clientTimeZone || inferredClientTimeZone)}`;
    }
    return `${base} • ${getTimeZoneLabel(userTimeZone)}`;
  };

  const topProspects = useMemo(() => {
    const starredSet = new Set(starredProspectIds);
    return outreachData
      .filter(
        (item) =>
          starredSet.has(item.id) ||
          (item.status === "interested" && item.interestLevel === "high")
      )
      .sort((a, b) => getFocusScore(b) - getFocusScore(a));
  }, [outreachData, starredProspectIds]);

  const topProspectIds = useMemo(() => new Set(topProspects.map((item) => item.id)), [topProspects]);
  const duplicateEmailProspect = useMemo(() => {
    const primaryEmail = normalizeEmailKey(prospectForm.email);
    const secondaryEmail = normalizeEmailKey(prospectForm.secondaryEmail);
    if (!primaryEmail && !secondaryEmail) return null;
    const lookupKeys = [primaryEmail, secondaryEmail].filter(Boolean);
    return outreachData.find((item) => {
      if (editingProspectId !== null && item.id === editingProspectId) return false;
      const itemPrimary = normalizeEmailKey(item.email || item.contact);
      const itemSecondary = normalizeEmailKey(item.secondaryEmail);
      return lookupKeys.some((key) => key === itemPrimary || key === itemSecondary);
    }) || null;
  }, [prospectForm.email, prospectForm.secondaryEmail, outreachData, editingProspectId]);
  const duplicateSelfEmailError =
    normalizeEmailKey(prospectForm.email) &&
    normalizeEmailKey(prospectForm.secondaryEmail) &&
    normalizeEmailKey(prospectForm.email) === normalizeEmailKey(prospectForm.secondaryEmail)
      ? "Primary and secondary email cannot be the same."
      : "";
  const duplicateEmailError = duplicateEmailProspect
    ? `Duplicate email: this address already exists on ${duplicateEmailProspect.prospect}.`
    : duplicateSelfEmailError;
  const duplicatePhoneProspect = useMemo(() => {
    const mobileKey = normalizePhoneKey(prospectForm.cellPhone);
    const officeKey = normalizePhoneKey(prospectForm.businessPhone);
    if (!mobileKey && !officeKey) return null;
    return (
      outreachData.find((item) => {
        if (editingProspectId !== null && item.id === editingProspectId) return false;
        const itemMobile = normalizePhoneKey(item.cellPhone);
        const itemOffice = normalizePhoneKey(item.businessPhone);
        const hasMobileDup = Boolean(mobileKey) && (mobileKey === itemMobile || mobileKey === itemOffice);
        const hasOfficeDup = Boolean(officeKey) && (officeKey === itemMobile || officeKey === itemOffice);
        return hasMobileDup || hasOfficeDup;
      }) || null
    );
  }, [prospectForm.cellPhone, prospectForm.businessPhone, outreachData, editingProspectId]);
  const duplicatePhoneError = duplicatePhoneProspect
    ? `Duplicate phone: this number already exists on ${duplicatePhoneProspect.prospect}.`
    : "";
  const duplicateWebsiteProspect = useMemo(() => {
    const websiteKey = normalizeWebsiteKey(prospectForm.notionUrl);
    if (!websiteKey) return null;
    return (
      outreachData.find((item) => {
        if (editingProspectId !== null && item.id === editingProspectId) return false;
        return normalizeWebsiteKey(item.notionUrl) === websiteKey;
      }) || null
    );
  }, [prospectForm.notionUrl, outreachData, editingProspectId]);
  const duplicateWebsiteError = duplicateWebsiteProspect
    ? `Duplicate website: ${normalizeWebsiteKey(prospectForm.notionUrl)} already exists on ${duplicateWebsiteProspect.prospect}.`
    : "";
  const hasDuplicateConflict = Boolean(duplicateEmailError || duplicatePhoneError || duplicateWebsiteError);
  useEffect(() => {
    setRoleOptions((prev) => {
      const next = [...prev];
      outreachData.forEach((item) => {
        const role = normalizeRoleLabel(item.role);
        if (role && !next.includes(role)) next.push(role);
      });
      const currentRole = normalizeRoleLabel(prospectForm.role);
      if (currentRole && !next.includes(currentRole)) next.push(currentRole);
      if (!next.includes(REALTOR_ROLE)) next.unshift(REALTOR_ROLE);
      return next;
    });
    setIndustryOptions((prev) => {
      const next = [...prev];
      outreachData.forEach((item) => {
        const industry = toSmartTitleCase(item.industry || "").trim();
        if (industry && !next.includes(industry)) next.push(industry);
      });
      const currentIndustry = toSmartTitleCase(prospectForm.industry || "").trim();
      if (currentIndustry && !next.includes(currentIndustry)) next.push(currentIndustry);
      if (!next.includes(REALTOR_INDUSTRY)) next.unshift(REALTOR_INDUSTRY);
      return next;
    });
    setCampaignOptions((prev) => {
      const next = [...prev];
      outreachData.forEach((item) => {
        const campaign = toSmartTitleCase(item.campaign || "").trim();
        if (campaign && !next.includes(campaign)) next.push(campaign);
      });
      const currentCampaign = toSmartTitleCase(prospectForm.campaign || "").trim();
      if (currentCampaign && !next.includes(currentCampaign)) next.push(currentCampaign);
      if (!next.includes("General")) next.unshift("General");
      return next;
    });
    setGroupOptions((prev) => {
      const next = [...prev];
      outreachData.forEach((item) => {
        const group = toSmartTitleCase(item.group || "").trim();
        if (group && !next.includes(group)) next.push(group);
      });
      const currentGroup = toSmartTitleCase(prospectForm.group || "").trim();
      if (currentGroup && !next.includes(currentGroup)) next.push(currentGroup);
      if (!next.includes("General")) next.unshift("General");
      return next;
    });
  }, [outreachData, prospectForm.role, prospectForm.industry, prospectForm.campaign, prospectForm.group, setRoleOptions, setIndustryOptions, setCampaignOptions, setGroupOptions]);

  const filteredProspects = useMemo(
    () =>
      outreachData.filter((item) => {
        const query = searchTerm.trim().toLowerCase();
        const prospectText = String(item.prospect || "").toLowerCase();
        const contactText = String(item.contact || "").toLowerCase();
        const statusText = String(item.status || "").toLowerCase();
        const matchesSearch =
          !query ||
          prospectText.includes(query) ||
          contactText.includes(query) ||
          statusText.includes(query);
        if (!matchesSearch) return false;

        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        if (responseFilter === "replied" && item.replies <= 0) return false;
        if (responseFilter === "no-reply" && item.replies > 0) return false;
        if (topOnly && !topProspectIds.has(item.id)) return false;

        if (activityFilter !== "all") {
          const days = Math.floor((nowMs - toDateMs(item.lastContact)) / dayMs);
          if (activityFilter === "7d" && days > 7) return false;
          if (activityFilter === "30d" && days > 30) return false;
        }

        return true;
      }),
    [outreachData, searchTerm, statusFilter, responseFilter, topOnly, activityFilter, topProspectIds, nowMs]
  );

  const sortedProspects = useMemo(() => {
    const list = [...filteredProspects];
    if (sortMode === "manual") return list;
    list.sort((a, b) => {
      if (sortMode === "recent") return toDateMs(b.lastContact) - toDateMs(a.lastContact);
      if (sortMode === "replies") return b.replies - a.replies || b.emailsSent - a.emailsSent;
      return getFocusScore(b) - getFocusScore(a);
    });
    return list;
  }, [filteredProspects, sortMode]);

  const totals = useMemo(() => {
    const sent = outreachData.reduce((sum, item) => sum + (Number(item.emailsSent) || 0), 0);
    const replies = outreachData.reduce((sum, item) => sum + (Number(item.replies) || 0), 0);
    return {
      sent,
      replies,
      followUps: outreachData.filter((item) => item.status === "follow_up").length,
      meetings: outreachData.filter((item) => item.status === "booked").length,
      responseRate: sent > 0 ? ((replies / sent) * 100).toFixed(1) : "0.0",
    };
  }, [outreachData]);

  const prospectInterestSplit = useMemo(() => {
    return outreachData.reduce(
      (acc, item) => {
        const level = item.interestLevel || "medium";
        if (level === "high") acc.high += 1;
        else if (level === "low") acc.low += 1;
        else acc.medium += 1;
        return acc;
      },
      { high: 0, medium: 0, low: 0 }
    );
  }, [outreachData]);

  const resetProspectForm = () => {
    setProspectForm({
      companyName: "",
      prospectName: "",
      role: "",
      industry: "",
      source: "",
      instantlyList: "",
      campaign: "",
      group: "",
      interestLevel: "",
      planMode: "",
      budgetTier: "",
      responses: [],
      askedFor: "not_set",
      askedForSecondary: "not_set",
      autoTopProspect: true,
      email: "",
      secondaryEmail: "",
      cellPhone: "",
      businessPhone: "",
      city: "",
      state: "",
      timeZoneMode: "mine",
      clientTimeZone: "",
      fee: "",
      mrr: "",
      followUpType: "",
      prospect: "",
      contact: "",
      status: "",
      lastContact: "",
      nextFollowUpDate: "",
      hasSpecificTime: false,
      nextFollowUpTime: "",
      notionUrl: "",
      specialNotes: "",
      emailsSent: 0,
      replies: 0,
    });
    setOnboardStep(0);
    setProspectFormMode("onboard");
    setEditingProspectId(null);
    setCreatingInstantlyList(false);
    setInstantlyListDraft("");
    setCreatingCampaignOption(false);
    setCampaignOptionDraft("");
    setCreatingGroupOption(false);
    setGroupOptionDraft("");
    setCreatingRoleOption(false);
    setCreatingIndustryOption(false);
    setRoleOptionDraft("");
    setIndustryOptionDraft("");
  };

  const openAddProspectModal = () => {
    resetProspectForm();
    setIsProspectModalOpen(true);
  };

  const openEditProspectModal = (item: OutreachItem) => {
    setEditingProspectId(item.id);
    setProspectForm({
      companyName: item.companyName || item.prospect,
      prospectName: item.prospectName || "",
      role: item.role || "",
      industry: isRealtorRoleValue(item.role) ? REALTOR_INDUSTRY : item.industry || "",
      source: item.source || "",
      instantlyList: item.instantlyList || "",
      campaign: item.campaign || "",
      group: item.group || "",
      interestLevel: item.interestLevel || "",
      planMode: item.planMode || "",
      budgetTier: item.budgetTier || "",
      responses: deriveResponseSelections(item.responses, item.askedFor, item.askedForSecondary),
      askedFor: item.askedFor || "not_set",
      askedForSecondary: item.askedForSecondary || "not_set",
      autoTopProspect: true,
      email: item.email || "",
      secondaryEmail: item.secondaryEmail || "",
      cellPhone: formatPhoneNumber(item.cellPhone || ""),
      businessPhone: formatPhoneNumber(item.businessPhone || ""),
      city: item.city || "",
      state: item.state || "",
      timeZoneMode: item.timeZoneMode || "mine",
      clientTimeZone: item.clientTimeZone || resolveClientTimeZone(item.city, item.state) || "",
      fee: item.fee || "",
      mrr: item.mrr || "",
      followUpType: item.followUpType || "",
      prospect: item.prospect,
      contact: item.contact,
      status: item.status || "",
      lastContact: item.lastContact || "",
      nextFollowUpDate: item.nextFollowUpDate || "",
      hasSpecificTime: Boolean(item.nextFollowUpTime),
      nextFollowUpTime: item.nextFollowUpTime || "",
      notionUrl: item.notionUrl || "",
      specialNotes: item.specialNotes || "",
      emailsSent: item.emailsSent || 0,
      replies: item.replies || 0,
    });
    setOnboardStep(0);
    setProspectFormMode("all");
    setCreatingInstantlyList(false);
    setInstantlyListDraft("");
    setCreatingCampaignOption(false);
    setCampaignOptionDraft("");
    setCreatingGroupOption(false);
    setGroupOptionDraft("");
    setCreatingRoleOption(false);
    setCreatingIndustryOption(false);
    setRoleOptionDraft("");
    setIndustryOptionDraft("");
    setIsProspectModalOpen(true);
  };

  useEffect(() => {
    if (searchParams.get("add") !== "prospect") return;
    resetProspectForm();
    setIsProspectModalOpen(true);
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      updated.delete("add");
      return updated;
    });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!isProspectModalOpen || editingProspectId !== null) return;
    if (clearNextProspectDraftLoad) {
      localStorage.removeItem(SALES_PROSPECT_DRAFT_KEY);
      setClearNextProspectDraftLoad(false);
      return;
    }
    try {
      const raw = localStorage.getItem(SALES_PROSPECT_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ProspectFormData>;
      setProspectForm((prev) => ({
        ...prev,
        ...parsed,
        hasSpecificTime:
          typeof parsed.hasSpecificTime === "boolean"
            ? parsed.hasSpecificTime
            : Boolean((parsed.nextFollowUpTime || prev.nextFollowUpTime || "").trim()),
        cellPhone: formatPhoneNumber(parsed.cellPhone || prev.cellPhone),
        businessPhone: formatPhoneNumber(parsed.businessPhone || prev.businessPhone),
      }));
    } catch {
      // ignore malformed draft
    }
  }, [isProspectModalOpen, editingProspectId, clearNextProspectDraftLoad]);

  useEffect(() => {
    if (!isProspectModalOpen || editingProspectId !== null) return;
    const hasContent = Boolean(
      prospectForm.companyName.trim() ||
        prospectForm.prospectName.trim() ||
        prospectForm.role.trim() ||
        prospectForm.industry.trim() ||
        prospectForm.instantlyList.trim() ||
        prospectForm.campaign.trim() ||
        prospectForm.group.trim() ||
        prospectForm.email.trim() ||
        prospectForm.secondaryEmail.trim() ||
        prospectForm.cellPhone.trim() ||
        prospectForm.businessPhone.trim() ||
        prospectForm.city.trim() ||
        prospectForm.state.trim() ||
        (prospectForm.timeZoneMode === "client" && (prospectForm.clientTimeZone.trim() || inferredClientTimeZone)) ||
        prospectForm.fee.trim() ||
        prospectForm.mrr.trim() ||
        prospectForm.prospect.trim() ||
        prospectForm.contact.trim() ||
        prospectForm.responses.length > 0 ||
        prospectForm.nextFollowUpDate.trim() ||
        prospectForm.nextFollowUpTime.trim() ||
        prospectForm.notionUrl.trim() ||
        prospectForm.specialNotes.trim() ||
        prospectForm.budgetTier.trim() ||
        prospectForm.emailsSent ||
        prospectForm.replies
    );
    if (!hasContent) {
      localStorage.removeItem(SALES_PROSPECT_DRAFT_KEY);
      return;
    }
    localStorage.setItem(SALES_PROSPECT_DRAFT_KEY, JSON.stringify(prospectForm));
  }, [isProspectModalOpen, prospectForm, editingProspectId]);

  useEffect(() => {
    if (!isProspectModalOpen || editingProspectId === null) return;
    const target = outreachData.find((item) => item.id === editingProspectId);
    if (!target) return;

    const companyName = toSmartTitleCase(prospectForm.companyName);
    const prospectName = toSmartTitleCase(prospectForm.prospectName);
    const roleValue = normalizeRoleLabel(prospectForm.role);
    const industryValue = isRealtorRoleValue(roleValue) ? REALTOR_INDUSTRY : toSmartTitleCase(prospectForm.industry);
    const email = prospectForm.email.trim().toLowerCase();
    const secondaryEmail = prospectForm.secondaryEmail.trim().toLowerCase();
    const rawProspectLabel = toSmartTitleCase(prospectForm.prospect);
    const prospect =
      rawProspectLabel ||
      (companyName && prospectName ? `${companyName} — ${prospectName}` : "") ||
      companyName ||
      prospectName ||
      target.prospect;
    const contact = email || secondaryEmail || prospectName || prospectForm.contact.trim() || target.contact;
    const responseSelections = normalizeResponseSelections(prospectForm.responses);

    const nextItem: OutreachItem = {
      ...target,
      prospect,
      contact,
      status: (prospectForm.status || "no_response") as ProspectStatus,
      lastContact: prospectForm.lastContact,
      nextFollowUpDate: prospectForm.nextFollowUpDate,
      nextFollowUpTime: prospectForm.hasSpecificTime ? prospectForm.nextFollowUpTime : "",
      emailsSent: Math.max(0, Number(prospectForm.emailsSent) || 0),
      replies: Math.max(0, Number(prospectForm.replies) || 0),
      notionUrl: sanitizeWebsiteInput(prospectForm.notionUrl),
      specialNotes: prospectForm.specialNotes.trim(),
      companyName,
      prospectName,
      role: roleValue,
      industry: industryValue,
      source: prospectForm.source || undefined,
      instantlyList: prospectForm.source === "cold_email" ? prospectForm.instantlyList.trim() : "",
      campaign: toSmartTitleCase(prospectForm.campaign).trim(),
      group: toSmartTitleCase(prospectForm.group).trim(),
      interestLevel: prospectForm.interestLevel || undefined,
      planMode: prospectForm.planMode || undefined,
      budgetTier: prospectForm.budgetTier || undefined,
      responses: responseSelections,
      askedFor: responseSelections[0] || "not_set",
      askedForSecondary: responseSelections[1] || "not_set",
      autoTopProspect: true,
      email,
      secondaryEmail,
      cellPhone: formatPhoneNumber(prospectForm.cellPhone),
      businessPhone: formatPhoneNumber(prospectForm.businessPhone),
      city: toSmartTitleCase(prospectForm.city),
      state: toSmartTitleCase(prospectForm.state),
      timeZoneMode: prospectForm.timeZoneMode || "mine",
      clientTimeZone: resolveClientTimeZone(prospectForm.city, prospectForm.state) || prospectForm.clientTimeZone || "",
      fee: prospectForm.fee.trim(),
      mrr: prospectForm.mrr.trim(),
      followUpType: prospectForm.followUpType || undefined,
    };

    const hasChanged =
      JSON.stringify({
        prospect: target.prospect,
        contact: target.contact,
        status: target.status,
        lastContact: target.lastContact,
        nextFollowUpDate: target.nextFollowUpDate || "",
        nextFollowUpTime: target.nextFollowUpTime || "",
        emailsSent: target.emailsSent,
        replies: target.replies,
        notionUrl: target.notionUrl,
        specialNotes: target.specialNotes || "",
        companyName: target.companyName || "",
        prospectName: target.prospectName || "",
        role: target.role || "",
        industry: target.industry || "",
        source: target.source || "",
        instantlyList: target.instantlyList || "",
        campaign: target.campaign || "",
        group: target.group || "",
        interestLevel: target.interestLevel || "",
        planMode: target.planMode || "",
        budgetTier: target.budgetTier || "",
        responses: deriveResponseSelections(target.responses, target.askedFor, target.askedForSecondary),
        askedFor: target.askedFor || "not_set",
        askedForSecondary: target.askedForSecondary || "not_set",
        autoTopProspect: true,
        email: target.email || "",
        secondaryEmail: target.secondaryEmail || "",
        cellPhone: target.cellPhone || "",
        businessPhone: target.businessPhone || "",
        city: target.city || "",
        state: target.state || "",
        timeZoneMode: target.timeZoneMode || "mine",
        clientTimeZone: target.clientTimeZone || "",
        fee: target.fee || "",
        mrr: target.mrr || "",
        followUpType: target.followUpType || "",
      }) !==
      JSON.stringify({
        prospect: nextItem.prospect,
        contact: nextItem.contact,
        status: nextItem.status,
        lastContact: nextItem.lastContact,
        nextFollowUpDate: nextItem.nextFollowUpDate || "",
        nextFollowUpTime: nextItem.nextFollowUpTime || "",
        emailsSent: nextItem.emailsSent,
        replies: nextItem.replies,
        notionUrl: nextItem.notionUrl,
        specialNotes: nextItem.specialNotes || "",
        companyName: nextItem.companyName || "",
        prospectName: nextItem.prospectName || "",
        role: nextItem.role || "",
        industry: nextItem.industry || "",
        source: nextItem.source || "",
        instantlyList: nextItem.instantlyList || "",
        campaign: nextItem.campaign || "",
        group: nextItem.group || "",
        interestLevel: nextItem.interestLevel || "",
        planMode: nextItem.planMode || "",
        budgetTier: nextItem.budgetTier || "",
        responses: deriveResponseSelections(nextItem.responses, nextItem.askedFor, nextItem.askedForSecondary),
        askedFor: nextItem.askedFor || "not_set",
        askedForSecondary: nextItem.askedForSecondary || "not_set",
        autoTopProspect: true,
        email: nextItem.email || "",
        secondaryEmail: nextItem.secondaryEmail || "",
        cellPhone: nextItem.cellPhone || "",
        businessPhone: nextItem.businessPhone || "",
        city: nextItem.city || "",
        state: nextItem.state || "",
        timeZoneMode: nextItem.timeZoneMode || "mine",
        clientTimeZone: nextItem.clientTimeZone || "",
        fee: nextItem.fee || "",
        mrr: nextItem.mrr || "",
        followUpType: nextItem.followUpType || "",
      });

    if (hasChanged) {
      setOutreachData((prev) => prev.map((item) => (item.id === editingProspectId ? nextItem : item)));
    }

    setStarredProspectIds((prev) => (prev.includes(editingProspectId) ? prev : [...prev, editingProspectId]));
  }, [isProspectModalOpen, editingProspectId, prospectForm, outreachData, setOutreachData, setStarredProspectIds]);

  const handleSaveProspect = async () => {
    const companyName = toSmartTitleCase(prospectForm.companyName);
    const prospectName = toSmartTitleCase(prospectForm.prospectName);
    const roleValue = normalizeRoleLabel(prospectForm.role);
    const industryValue = isRealtorRoleValue(roleValue) ? REALTOR_INDUSTRY : toSmartTitleCase(prospectForm.industry);
    const email = prospectForm.email.trim().toLowerCase();
    const secondaryEmail = prospectForm.secondaryEmail.trim().toLowerCase();
    if (hasDuplicateConflict) return;
    const fallbackProspect = `Untitled Prospect ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
    const rawProspectLabel = toSmartTitleCase(prospectForm.prospect);
    const prospect =
      rawProspectLabel ||
      (companyName && prospectName ? `${companyName} — ${prospectName}` : "") ||
      companyName ||
      prospectName ||
      fallbackProspect;
    const contact = email || secondaryEmail || prospectName || companyName || toSmartTitleCase(prospectForm.contact) || "No Contact Yet";
    const responseSelections = normalizeResponseSelections(prospectForm.responses);

    const newId = editingProspectId ?? Date.now();
    const nextItem: OutreachItem = {
      id: newId,
      prospect,
      contact,
      status: (prospectForm.status || "no_response") as ProspectStatus,
      lastContact: prospectForm.lastContact,
      nextFollowUpDate: prospectForm.nextFollowUpDate,
      nextFollowUpTime: prospectForm.hasSpecificTime ? prospectForm.nextFollowUpTime : "",
      emailsSent: Math.max(0, Number(prospectForm.emailsSent) || 0),
      replies: Math.max(0, Number(prospectForm.replies) || 0),
      notionUrl: sanitizeWebsiteInput(prospectForm.notionUrl),
      specialNotes: prospectForm.specialNotes.trim(),
      companyName,
      prospectName,
      role: roleValue,
      industry: industryValue,
      source: prospectForm.source || undefined,
      instantlyList: prospectForm.source === "cold_email" ? prospectForm.instantlyList.trim() : "",
      campaign: toSmartTitleCase(prospectForm.campaign).trim(),
      group: toSmartTitleCase(prospectForm.group).trim(),
      interestLevel: prospectForm.interestLevel || undefined,
      planMode: prospectForm.planMode || undefined,
      budgetTier: prospectForm.budgetTier || undefined,
      responses: responseSelections,
      askedFor: responseSelections[0] || "not_set",
      askedForSecondary: responseSelections[1] || "not_set",
      autoTopProspect: true,
      email,
      secondaryEmail,
      cellPhone: formatPhoneNumber(prospectForm.cellPhone),
      businessPhone: formatPhoneNumber(prospectForm.businessPhone),
      city: toSmartTitleCase(prospectForm.city),
      state: toSmartTitleCase(prospectForm.state),
      timeZoneMode: prospectForm.timeZoneMode || "mine",
      clientTimeZone: resolveClientTimeZone(prospectForm.city, prospectForm.state) || prospectForm.clientTimeZone || "",
      fee: prospectForm.fee.trim(),
      mrr: prospectForm.mrr.trim(),
      followUpType: prospectForm.followUpType || undefined,
    };

    const nextOutreach =
      editingProspectId !== null
        ? outreachData.map((item) => (item.id === editingProspectId ? nextItem : item))
        : [...outreachData, nextItem];
    const nextStarred = starredProspectIds.includes(newId) ? starredProspectIds : [...starredProspectIds, newId];
    const persisted = await persistSalesNow(nextOutreach, { starred_prospect_ids: nextStarred });
    if (!persisted) return;
    suppressNextSync.current = true;
    suppressNextPageStateSync.current = true;
    setOutreachData(nextOutreach);
    setStarredProspectIds(nextStarred);
    logActivity({
      area: "sales",
      action: editingProspectId !== null ? "Updated Prospect" : "Added Prospect",
      detail: `${prospect} (${prospectName || contact})`,
    });
    localStorage.removeItem(SALES_PROSPECT_DRAFT_KEY);
    setClearNextProspectDraftLoad(true);
    setIsProspectModalOpen(false);
    resetProspectForm();
  };

  const onboardingSteps = [
    { key: "prospect", label: "Prospect" },
    { key: "contact", label: "Contact Details" },
    { key: "source", label: "Source" },
    { key: "interest", label: "Interest Level" },
    { key: "status", label: "Status + Next Task Type" },
    { key: "timing", label: "Follow-up Timing" },
    { key: "financial", label: "Fee + MRR" },
    { key: "notes", label: "Special Notes" },
  ] as const;

  const currentOnboardKey = onboardingSteps[onboardStep]?.key;

  const getIncompleteProspectFields = (item: OutreachItem) => {
    const missing: string[] = [];
    const hasValue = (value: unknown) => Boolean(String(value ?? "").trim());
    if (!hasValue(item.prospectName)) missing.push("Prospect Name");
    if (!hasValue(item.role)) missing.push("Role");
    if (!hasValue(item.industry)) missing.push("Industry");
    if (!hasValue(item.source)) missing.push("Source");
    if (item.source === "cold_email" && !hasValue(item.instantlyList)) missing.push("Which List");
    if (!hasValue(item.interestLevel)) missing.push("Interest Level");
    if (!hasValue(item.planMode)) missing.push("Website Type");
    if (!hasValue(item.status)) missing.push("Status");
    const responses = deriveResponseSelections(item.responses, item.askedFor, item.askedForSecondary);
    if (responses.length === 0) missing.push("Response");
    if (!hasValue(item.lastContact)) missing.push("Last Contact");
    if (!hasValue(item.nextFollowUpDate)) missing.push("Next Task Date");
    if (!hasValue(item.email)) missing.push("Primary Email");
    if (!hasValue(item.cellPhone)) missing.push("Cell Phone");
    if (!hasValue(item.city)) missing.push("City");
    if (!hasValue(item.state)) missing.push("State");
    if (!hasValue(item.followUpType)) missing.push("Next Task Type");
    return missing;
  };

  const isProspectIncomplete = (item: OutreachItem) => getIncompleteProspectFields(item).length > 0;

  const renderIncompleteNeeds = (fields: string[]) => {
    if (fields.length === 0) return null;
    const previewFields = fields.slice(0, 4);
    const remainingCount = Math.max(0, fields.length - previewFields.length);
    return (
      <div
        className="mt-3 rounded-xl border border-amber-400/85 bg-[linear-gradient(160deg,hsl(43_100%_56%/.33),hsl(39_96%_54%/.2)_55%,hsl(0_0%_100%/.12))] px-3.5 py-3 shadow-[0_0_0_1px_hsl(43_100%_52%/.3),0_14px_34px_-18px_hsl(40_100%_48%/.68)] dark:border-amber-300/55 dark:bg-[linear-gradient(160deg,hsl(42_100%_57%/.3),hsl(39_96%_54%/.14)_58%,hsl(221_26%_12%/.3))] dark:shadow-[0_0_0_1px_hsl(43_100%_58%/.26),0_16px_36px_-20px_hsl(40_100%_52%/.58)]"
        title={`Missing: ${fields.join(", ")}`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full border border-amber-300/85 bg-amber-100/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-900 dark:border-amber-300/50 dark:bg-amber-500/24 dark:text-amber-100">
            ! Missing Info
          </span>
          <span className="inline-flex items-center rounded-full border border-amber-300/80 bg-background/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-900 dark:border-amber-300/50 dark:bg-background/35 dark:text-amber-100">
            {fields.length} field{fields.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {previewFields.map((field) => (
            <span
              key={field}
              className="inline-flex items-center rounded-full border border-amber-300/80 bg-background/85 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950 dark:border-amber-300/50 dark:bg-background/35 dark:text-amber-100"
            >
              {field}
            </span>
          ))}
          {remainingCount > 0 ? (
            <span className="inline-flex items-center rounded-full border border-amber-300/75 bg-amber-100/85 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 dark:border-amber-300/50 dark:bg-amber-500/24 dark:text-amber-100">
              +{remainingCount} more
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const handleInstantlyListSelect = (value: string) => {
    if (value === "__create__") {
      setCreatingInstantlyList(true);
      return;
    }
    setProspectForm((prev) => ({ ...prev, instantlyList: value }));
    setCreatingInstantlyList(false);
    setInstantlyListDraft("");
  };

  const getDateWithOffset = (offsetDays: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getNextWeekdayDate = (targetWeekday: number) => {
    const date = new Date();
    const currentWeekday = date.getDay();
    let delta = (targetWeekday - currentWeekday + 7) % 7;
    if (delta === 0) delta = 7;
    date.setDate(date.getDate() + delta);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const applyQuickFollowUp = (dateValue: string, timeValue?: string) => {
    setProspectForm((prev) => ({
      ...prev,
      nextFollowUpDate: dateValue,
      hasSpecificTime: Boolean(timeValue ?? prev.nextFollowUpTime),
      nextFollowUpTime: timeValue ?? prev.nextFollowUpTime,
    }));
  };

  const updateProspectPhone = (field: "cellPhone" | "businessPhone", value: string) => {
    setProspectForm((prev) => ({ ...prev, [field]: formatPhoneNumber(value) }));
  };

  const formatCurrencyWhole = (value: string) => {
    const digits = value.replace(/\D+/g, "");
    if (!digits) return "";
    return `$${Number.parseInt(digits, 10).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const normalizeFeeInput = (value: string) => {
    const raw = String(value || "").replace(/\/mo/gi, "").trim();
    if (!/\d/.test(raw)) return "";
    const rangeSeparator = /\bto\b|[-–—]/i;
    const parts = raw
      .split(rangeSeparator)
      .map((part) => formatCurrencyWhole(part))
      .filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} - ${parts[1]}`;
    return formatCurrencyWhole(raw);
  };

  const normalizeMrrInput = (value: string) => {
    const raw = String(value || "").replace(/\/mo/gi, "").trim();
    if (!/\d/.test(raw)) return "";
    const rangeSeparator = /\bto\b|[-–—]/i;
    const parts = raw
      .split(rangeSeparator)
      .map((part) => formatCurrencyWhole(part))
      .filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/mo - ${parts[1]}/mo`;
    return `${parts[0]}/mo`;
  };

  const updateProspectMoney = (field: "fee" | "mrr", value: string) => {
    setProspectForm((prev) => ({ ...prev, [field]: field === "fee" ? normalizeFeeInput(value) : normalizeMrrInput(value) }));
  };

  const handleRoleSelect = (value: string) => {
    if (value === ROLE_CREATE_VALUE) {
      setCreatingRoleOption(true);
      return;
    }
    const nextRole = normalizeRoleLabel(value);
    setProspectForm((prev) => ({
      ...prev,
      role: nextRole,
      industry: isRealtorRoleValue(nextRole) ? REALTOR_INDUSTRY : prev.industry,
    }));
    if (isRealtorRoleValue(nextRole)) {
      setIndustryOptions((prev) => (prev.includes(REALTOR_INDUSTRY) ? prev : [REALTOR_INDUSTRY, ...prev]));
    }
    setCreatingRoleOption(false);
    setRoleOptionDraft("");
  };

  const handleIndustrySelect = (value: string) => {
    if (isRealtorRoleValue(prospectForm.role)) return;
    if (value === INDUSTRY_CREATE_VALUE) {
      setCreatingIndustryOption(true);
      return;
    }
    const nextIndustry = toSmartTitleCase(value);
    setProspectForm((prev) => ({ ...prev, industry: nextIndustry }));
    setCreatingIndustryOption(false);
    setIndustryOptionDraft("");
  };

  const handleCreateRoleOption = () => {
    const nextRole = normalizeRoleLabel(roleOptionDraft);
    if (!nextRole) return;
    setRoleOptions((prev) => (prev.includes(nextRole) ? prev : [...prev, nextRole]));
    setProspectForm((prev) => ({
      ...prev,
      role: nextRole,
      industry: isRealtorRoleValue(nextRole) ? REALTOR_INDUSTRY : prev.industry,
    }));
    if (isRealtorRoleValue(nextRole)) {
      setIndustryOptions((prev) => (prev.includes(REALTOR_INDUSTRY) ? prev : [REALTOR_INDUSTRY, ...prev]));
    }
    setCreatingRoleOption(false);
    setRoleOptionDraft("");
  };

  const handleCreateIndustryOption = () => {
    if (isRealtorRoleValue(prospectForm.role)) return;
    const nextIndustry = toSmartTitleCase(industryOptionDraft).trim();
    if (!nextIndustry) return;
    setIndustryOptions((prev) => (prev.includes(nextIndustry) ? prev : [...prev, nextIndustry]));
    setProspectForm((prev) => ({ ...prev, industry: nextIndustry }));
    setCreatingIndustryOption(false);
    setIndustryOptionDraft("");
  };

  const toggleResponseSelection = (value: ProspectAskedFor) => {
    if (value === "not_set") return;
    setProspectForm((prev) => {
      const current = normalizeResponseSelections(prev.responses);
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      return { ...prev, responses: next };
    });
  };

  const handleCreateInstantlyList = () => {
    const next = toSmartTitleCase(instantlyListDraft).trim();
    if (!next) return;
    setInstantlyLists((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setProspectForm((prev) => ({ ...prev, instantlyList: next }));
    setCreatingInstantlyList(false);
    setInstantlyListDraft("");
  };

  const handleCampaignSelect = (value: string) => {
    if (value === "__create_campaign__") {
      setCreatingCampaignOption(true);
      return;
    }
    const nextCampaign = toSmartTitleCase(value).trim();
    setProspectForm((prev) => ({ ...prev, campaign: nextCampaign }));
    setCreatingCampaignOption(false);
    setCampaignOptionDraft("");
  };

  const handleCreateCampaignOption = () => {
    const nextCampaign = toSmartTitleCase(campaignOptionDraft).trim();
    if (!nextCampaign) return;
    setCampaignOptions((prev) => (prev.includes(nextCampaign) ? prev : [...prev, nextCampaign]));
    setProspectForm((prev) => ({ ...prev, campaign: nextCampaign }));
    setCreatingCampaignOption(false);
    setCampaignOptionDraft("");
  };

  const handleGroupSelect = (value: string) => {
    if (value === CREATE_GROUP_VALUE) {
      setCreatingGroupOption(true);
      return;
    }
    const nextGroup = toSmartTitleCase(value).trim();
    setProspectForm((prev) => ({ ...prev, group: nextGroup }));
    setCreatingGroupOption(false);
    setGroupOptionDraft("");
  };

  const handleCreateGroupOption = () => {
    const nextGroup = toSmartTitleCase(groupOptionDraft).trim();
    if (!nextGroup) return;
    setGroupOptions((prev) => (prev.includes(nextGroup) ? prev : [...prev, nextGroup]));
    setProspectForm((prev) => ({ ...prev, group: nextGroup }));
    setCreatingGroupOption(false);
    setGroupOptionDraft("");
  };

  const handleSendEmail = async (id: number) => {
    const target = outreachData.find((item) => item.id === id);
    const nextOutreach = outreachData.map((item) =>
        item.id === id
          ? { ...item, emailsSent: item.emailsSent + 1, lastContact: new Date().toISOString().split("T")[0] }
          : item
      );
    const persisted = await persistSalesNow(nextOutreach);
    if (!persisted) return;
    suppressNextSync.current = true;
    setOutreachData(nextOutreach);
    if (target) {
      logActivity({
        area: "sales",
        action: "Sent Email",
        detail: target.prospect,
      });
    }
  };

  const handleLogReply = async (id: number) => {
    const target = outreachData.find((item) => item.id === id);
    const nextOutreach = outreachData.map((item) =>
        item.id === id
          ? { ...item, replies: item.replies + 1, status: "interested", lastContact: new Date().toISOString().split("T")[0] }
          : item
      );
    const persisted = await persistSalesNow(nextOutreach);
    if (!persisted) return;
    suppressNextSync.current = true;
    setOutreachData(nextOutreach);
    if (target) {
      logActivity({
        area: "sales",
        action: "Logged Reply",
        detail: target.prospect,
      });
    }
  };

  const normalizeProspectStatusInput = (value: string): ProspectStatus | null => {
    const cleaned = value
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (cleaned === "interested") return "interested";
    if (cleaned === "follow_up" || cleaned === "followup") return "follow_up";
    if (cleaned === "booked") return "booked";
    if (cleaned === "verdict") return "verdict";
    if (cleaned === "no_response" || cleaned === "noresponse") return "no_response";
    return null;
  };

  const handleChangeStatus = async (id: number, explicitStatus?: ProspectStatus) => {
    const resolvedStatus =
      explicitStatus ??
      (() => {
        const value = window.prompt("Set status: interested | follow_up | booked | verdict | no_response", "follow_up");
        if (!value) return null;
        return normalizeProspectStatusInput(value);
      })();
    if (!resolvedStatus) return;
    const nextOutreach = outreachData.map((item) => (item.id === id ? { ...item, status: resolvedStatus } : item));
    const persisted = await persistSalesNow(nextOutreach);
    if (!persisted) return;
    suppressNextSync.current = true;
    setOutreachData(nextOutreach);
    if (viewProspect && viewProspect.id === id) {
      setViewProspect({ ...viewProspect, status: resolvedStatus });
    }
    if (editingProspectId === id) {
      setProspectForm((prev) => ({ ...prev, status: resolvedStatus }));
    }
    const target = outreachData.find((item) => item.id === id);
    if (target) {
      logActivity({
        area: "sales",
        action: "Changed Prospect Status",
        detail: `${target.prospect} -> ${resolvedStatus}`,
      });
    }
  };

  const handleDeleteProspect = async (id: number) => {
    const target = outreachData.find((item) => item.id === id);
    const nextOutreach = outreachData.filter((item) => item.id !== id);
    const nextStarred = starredProspectIds.filter((starredId) => starredId !== id);
    const persisted = await persistSalesNow(nextOutreach, { starred_prospect_ids: nextStarred });
    if (!persisted) return;
    suppressNextSync.current = true;
    suppressNextPageStateSync.current = true;
    setOutreachData(nextOutreach);
    setStarredProspectIds(nextStarred);
    if (target) {
      logActivity({
        area: "sales",
        action: "Removed Prospect",
        detail: target.prospect,
      });
    }
  };

  const handleToggleStarProspect = async (id: number) => {
    const nextStarred = starredProspectIds.includes(id)
      ? starredProspectIds.filter((starredId) => starredId !== id)
      : [...starredProspectIds, id];
    const persisted = await persistSalesNow(outreachData, { starred_prospect_ids: nextStarred });
    if (!persisted) return;
    suppressNextPageStateSync.current = true;
    setStarredProspectIds(nextStarred);
    const target = outreachData.find((item) => item.id === id);
    if (target) {
      const isCurrentlyStarred = starredProspectIds.includes(id);
      logActivity({
        area: "sales",
        action: isCurrentlyStarred ? "Unstarred Prospect" : "Starred Prospect",
        detail: target.prospect,
      });
    }
  };

  const reorderProspectsByDrag = async (sourceId: number, targetId: number, position: "before" | "after") => {
    if (sourceId === targetId) return;
    const sourceIndex = outreachData.findIndex((item) => item.id === sourceId);
    const targetIndex = outreachData.findIndex((item) => item.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const next = [...outreachData];
    const [moved] = next.splice(sourceIndex, 1);
    if (!moved) return;
    let insertIndex = targetIndex;
    if (sourceIndex < targetIndex) insertIndex -= 1;
    if (position === "after") insertIndex += 1;
    insertIndex = Math.max(0, Math.min(next.length, insertIndex));
    next.splice(insertIndex, 0, moved);
    const persisted = await persistSalesNow(next);
    if (!persisted) return;
    suppressNextSync.current = true;
    setOutreachData(next);
    const movedItem = outreachData.find((item) => item.id === sourceId);
    if (movedItem) {
      logActivity({
        area: "sales",
        action: "Reordered Prospect",
        detail: movedItem.prospect,
      });
    }
  };

  const resetOutreachFilters = () => {
    setStatusFilter("all");
    setResponseFilter("any");
    setActivityFilter("all");
    setSortMode("focus");
    setTopOnly(false);
    setSearchTerm("");
    setDraggedProspectId(null);
    setProspectDropIndicator(null);
  };

  useEffect(() => {
    const validIds = new Set(outreachData.map((item) => item.id));
    setStarredProspectIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [outreachData, setStarredProspectIds]);

  const handleAddTactic = async () => {
    const rawTitle = window.prompt("Tactic title");
    if (!rawTitle) return;
    const title = toSmartTitleCase(rawTitle.trim());
    if (!title) return;
    const note = (window.prompt("Optional note") || "").trim();
    const nextStrategy = [...strategyItems, { id: Date.now(), title, note }];
    const persisted = await persistSalesNow(outreachData, { strategy_items: nextStrategy });
    if (!persisted) return;
    suppressNextPageStateSync.current = true;
    setStrategyItems(nextStrategy);
    logActivity({ area: "sales", action: "Added Tactic", detail: title });
  };

  const handleAddSalesTask = async () => {
    const rawTitle = window.prompt("Task title");
    if (!rawTitle) return;
    const title = toSmartTitleCase(rawTitle.trim());
    if (!title) return;
    const nextTasks = [...salesTasks, { id: Date.now(), title, done: false }];
    const persisted = await persistSalesNow(outreachData, { sales_tasks: nextTasks });
    if (!persisted) return;
    suppressNextPageStateSync.current = true;
    setSalesTasks(nextTasks);
    logActivity({ area: "sales", action: "Added Sales Task", detail: title });
  };

  const addButtonLabel =
    folderView === "leads" ? "+ Add Prospect" : folderView === "strategy" ? "+ Add Tactic" : "+ Add Task";
  const getFilterButtonClass = (active: boolean) =>
    `h-9 rounded-full border border-transparent bg-transparent px-4 text-sm font-medium shadow-none transition-all duration-200 hover:border-border/70 hover:bg-card/80 ${
      active ? "text-primary dark:text-cyan-200 font-semibold" : "text-foreground/85"
    }`;
  const actionButtonClass = "h-10 px-4 text-sm font-medium";

  const handleAdaptiveAdd = () => {
    if (folderView === "leads") {
      openAddProspectModal();
      return;
    }
    if (folderView === "strategy") {
      handleAddTactic();
      return;
    }
    handleAddSalesTask();
  };

  const resetLimboForm = () => {
    setLimboForm({
      prospect: "",
      contact: "",
      reason: "",
      note: "",
    });
  };

  const handleAddLimbo = async () => {
    const prospect = toSmartTitleCase(limboForm.prospect).trim() || "Untitled Limbo Prospect";
    const next: LimboItem = {
      id: Date.now(),
      prospect,
      contact: limboForm.contact.trim(),
      reason: toSmartTitleCase(limboForm.reason).trim(),
      note: limboForm.note.trim(),
      createdAt: new Date().toISOString().split("T")[0],
    };
    const nextLimbo = [next, ...limboItems];
    const persisted = await persistSalesNow(outreachData, { limbo_items: nextLimbo });
    if (!persisted) return;
    suppressNextPageStateSync.current = true;
    setLimboItems(nextLimbo);
    logActivity({
      area: "sales",
      action: "Added Limbo Prospect",
      detail: prospect,
    });
    setIsLimboModalOpen(false);
    resetLimboForm();
  };

  const handleRemoveLimbo = async (id: number) => {
    const target = limboItems.find((item) => item.id === id);
    const nextLimbo = limboItems.filter((item) => item.id !== id);
    const persisted = await persistSalesNow(outreachData, { limbo_items: nextLimbo });
    if (!persisted) return;
    suppressNextPageStateSync.current = true;
    setLimboItems(nextLimbo);
    if (target) {
      logActivity({
        area: "sales",
        action: "Removed Limbo Prospect",
        detail: target.prospect,
      });
    }
  };

  const toggleSalesTaskDone = (taskId: number) => {
    const target = salesTasks.find((task) => task.id === taskId);
    const willComplete = Boolean(target && !target.done);
    const nextStepTitle = willComplete && target ? promptForNextStep(target.title) : null;
    setSalesTasks((prev) => {
      const next = prev.map((item) => (item.id === taskId ? { ...item, done: !item.done } : item));
      if (!willComplete || !target || !nextStepTitle) return next;
      const completedIndex = next.findIndex((item) => item.id === taskId);
      const followUp: SalesTaskItem = {
        id: Date.now() + Math.floor(Math.random() * 100000),
        title: nextStepTitle,
        done: false,
      };
      if (completedIndex === -1) return [...next, followUp];
      const updated = [...next];
      updated.splice(completedIndex + 1, 0, followUp);
      return updated;
    });
    if (target && willComplete && nextStepTitle) {
      logActivity({
        area: "sales",
        action: "Added Next Step",
        detail: nextStepTitle,
      });
    }
  };

  useEffect(() => {
    const onCommandNew = () => {
      if (folderView === "leads") {
        resetProspectForm();
        setIsProspectModalOpen(true);
        return;
      }
      if (folderView === "strategy") {
        handleAddTactic();
        return;
      }
      handleAddSalesTask();
    };
    window.addEventListener("delphi-command-new", onCommandNew as EventListener);
    return () => window.removeEventListener("delphi-command-new", onCommandNew as EventListener);
  }, [folderView, handleAddSalesTask, handleAddTactic]);

  return (
    <div className="sales-cosmos-page app-atmosphere-page app-light-page min-h-screen relative overflow-hidden">
      <div className="absolute top-32 right-16 w-80 h-80 bg-primary/5 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 left-16 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-float" style={{ animationDelay: "2.5s" }} />

      <div className="sales-cosmos-frame app-light-frame relative space-y-8">
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <AnimatedTitle text="Sales" className="app-light-title" />
            <p className="app-light-subtitle">Track outbound emails and prospect engagement</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Supabase: {isSupabaseConfigured ? "on" : "off"} | Loaded rows: {supabaseLoadCount ?? "unknown"} | Local rows: {outreachData.length}
            </p>
            {isSupabaseConfigured && (syncState === "syncing" || syncState === "error") ? (
              <p className={`mt-1 text-xs ${syncState === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {syncState === "syncing" ? "Supabase syncing..." : syncMessage}
              </p>
            ) : null}
            <LinkedSyncStatusLine className="mt-1" />
          </div>
          <div className="flex items-center gap-3">
            <div className="sales-toolbar glass-chip-rail app-light-toolbar flex items-center gap-1.5 p-1.5">
              <TooltipProvider delayDuration={80}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant={folderView === "leads" ? "secondary" : "ghost"} onClick={() => setFolderView("leads")} className="h-10 w-10 px-0" aria-label="Leads">
                      <Users className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="border border-white/50 bg-[linear-gradient(180deg,hsl(0_0%_100%/.9),hsl(0_0%_100%/.74))] text-foreground shadow-xl backdrop-blur-xl font-semibold dark:border-[hsl(218_31%_33%)] dark:bg-[hsl(220_40%_14%)] dark:text-white"
                  >
                    <p>Leads</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant={folderView === "strategy" ? "secondary" : "ghost"} onClick={() => setFolderView("strategy")} className="h-10 w-10 px-0" aria-label="Strategy">
                      <Compass className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="border border-white/50 bg-[linear-gradient(180deg,hsl(0_0%_100%/.9),hsl(0_0%_100%/.74))] text-foreground shadow-xl backdrop-blur-xl font-semibold dark:border-[hsl(218_31%_33%)] dark:bg-[hsl(220_40%_14%)] dark:text-white"
                  >
                    <p>Strategy</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant={folderView === "tasks" ? "secondary" : "ghost"} onClick={() => setFolderView("tasks")} className="h-10 w-10 px-0" aria-label="Tasks">
                      <ListTodo className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="border border-white/50 bg-[linear-gradient(180deg,hsl(0_0%_100%/.9),hsl(0_0%_100%/.74))] text-foreground shadow-xl backdrop-blur-xl font-semibold dark:border-[hsl(218_31%_33%)] dark:bg-[hsl(220_40%_14%)] dark:text-white"
                  >
                    <p>Tasks</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleAdaptiveAdd} className="sales-add-action add-action add-action-icon h-11 w-11 rounded-full px-0" aria-label={addButtonLabel.replace(/^\+\s*/, "")}>
                  <Plus className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="border border-white/50 bg-[linear-gradient(180deg,hsl(0_0%_100%/.9),hsl(0_0%_100%/.74))] text-foreground shadow-xl backdrop-blur-xl font-semibold dark:border-[hsl(218_31%_33%)] dark:bg-[hsl(220_40%_14%)] dark:text-white"
              >
                <p>{addButtonLabel.replace(/^\+\s*/, "")}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {folderView === "leads" && (
          <div className="sales-leads-shell content-glass-surface space-y-6 p-4 text-[15px] md:p-5">
            <div className="sales-stats-grid grid grid-cols-1 gap-6 md:grid-cols-4">
              <StatCard
                title="Top Prospects"
                value={String(topProspects.length)}
                change="High-priority focus"
                changeType="positive"
                icon={Star}
              />
              <StatCard
                title="Prospects"
                value={String(outreachData.length)}
                change={`High ${prospectInterestSplit.high} • Medium ${prospectInterestSplit.medium} • Low ${prospectInterestSplit.low}`}
                changeType="neutral"
                icon={UserCheck}
              />
              <StatCard
                title="Meetings Scheduled"
                value={String(totals.meetings)}
                change="Current pipeline"
                changeType="positive"
                icon={TrendingUp}
              />
              <StatCard
                title="Follow-ups Needed"
                value={String(totals.followUps)}
                change="Action required"
                changeType="neutral"
                icon={Clock}
              />
            </div>

            <Card className="sales-showcase-panel glass-hero-panel p-6 animate-fade-in-up">
              <div className="sales-panel-header mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Top Prospects</h2>
                <Button
                  variant={topOnly ? "secondary" : "outline"}
                  size="default"
                  className="sales-focus-button h-10 px-4 text-base font-medium !text-[hsl(220_38%_48%)] dark:!text-white"
                  onClick={() => setTopOnly((value) => !value)}
                >
                  {topOnly ? "Showing Top Only" : "Focus Top Only"}
                </Button>
              </div>
              <GlassScrollArea
                className={`glass-scrollbar relative overflow-x-auto overflow-y-hidden px-0.5 pb-2.5 ${topProspectsScrollActive ? "scroll-active" : ""}`}
                onScroll={() => {
                  markTopProspectsScrolling();
                }}
                onMouseEnter={() => {
                  markTopProspectsScrolling();
                }}
                onMouseMove={() => {
                  markTopProspectsScrolling();
                }}
                onTouchMove={() => {
                  markTopProspectsScrolling();
                }}
              >
                <div className="flex gap-3 snap-x snap-mandatory">
                {topProspects.map((item) => (
                  (() => {
                    return (
                  <div
                    key={item.id}
                    className="sales-top-prospect-card liquid-cyan-hover glass-list-surface flex min-h-[236px] w-[min(88vw,320px)] flex-shrink-0 snap-start flex-col rounded-[30px] p-4 cursor-pointer transition-all duration-300 sm:w-[300px] md:w-[292px]"
                    onClick={() => setViewProspect(item)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[1.02rem] font-semibold tracking-tight text-foreground">{item.prospect}</p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{item.contact}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleStarProspect(item.id);
                        }}
                        className={`rounded-full p-1 transition-all duration-200 ${
                          starredProspectIds.includes(item.id)
                            ? "text-amber-400 drop-shadow-[0_0_10px_hsl(45_95%_65%/.6)]"
                            : "text-muted-foreground hover:text-amber-400"
                        }`}
                        aria-label={starredProspectIds.includes(item.id) ? "Unstar prospect" : "Star prospect"}
                      >
                        <Star className={`h-4 w-4 ${starredProspectIds.includes(item.id) ? "fill-current" : ""}`} />
                      </button>
                    </div>
                    <div className="sales-next-task mt-3 rounded-[20px] border border-[var(--glass-stroke-soft)] bg-[linear-gradient(180deg,hsl(220_28%_100%/.12),hsl(220_28%_100%/.04))] px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Next Task</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{formatNextFollowUp(item.nextFollowUpDate, item.nextFollowUpTime)}</p>
                    </div>
                    {item.specialNotes ? (
                      <div className="sales-special-note mt-2 rounded-xl border border-primary/28 bg-primary/10 px-3 py-2.5 shadow-[inset_0_1px_0_hsl(0_0%_100%/.45)] dark:border-primary/35 dark:bg-primary/12">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary/80">Special Notes</p>
                        <p className="mt-1 line-clamp-2 min-h-[38px] text-sm leading-snug text-foreground/88">
                          {item.specialNotes}
                        </p>
                      </div>
                    ) : null}
                  </div>
                    );
                  })()
                ))}
                </div>
              </GlassScrollArea>
            </Card>

            <Card
              className="sales-tracker-panel flex h-[68vh] min-h-[28rem] flex-col overflow-hidden p-6 animate-fade-in-up hover:shadow-xl transition-all duration-300"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="sales-panel-header mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Outreach Tracker</h2>
                <div className="sales-search relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search prospects..."
                    className="h-11 w-72 pl-10 text-base"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="mb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="sales-filter-toggle inline-flex h-9 items-center gap-1.5 px-1 text-sm font-semibold text-foreground/90 transition-colors hover:text-foreground"
                      onClick={() => setIsFilterBarOpen((value) => !value)}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      <span>{isFilterBarOpen ? "Hide Filters" : "Filters"}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${isFilterBarOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground/85">
                      Total Prospects {sortedProspects.length}
                    </span>
                    {isFilterBarOpen ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-sm font-medium"
                        onClick={resetOutreachFilters}
                      >
                        Reset
                      </Button>
                    ) : null}
                  </div>
                </div>
                {isFilterBarOpen ? (
                  <div className="sales-filters-row mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" className={getFilterButtonClass(statusFilter === "all")} variant="ghost" onClick={() => setStatusFilter("all")}>All</Button>
                    <Button size="sm" className={getFilterButtonClass(statusFilter === "interested")} variant="ghost" onClick={() => setStatusFilter("interested")}>Interested</Button>
                    <Button size="sm" className={getFilterButtonClass(statusFilter === "follow_up")} variant="ghost" onClick={() => setStatusFilter("follow_up")}>Follow-up</Button>
                    <Button size="sm" className={getFilterButtonClass(statusFilter === "booked")} variant="ghost" onClick={() => setStatusFilter("booked")}>Booked</Button>
                    <Button size="sm" className={getFilterButtonClass(statusFilter === "verdict")} variant="ghost" onClick={() => setStatusFilter("verdict")}>Verdict</Button>
                    <Button size="sm" className={getFilterButtonClass(statusFilter === "no_response")} variant="ghost" onClick={() => setStatusFilter("no_response")}>No Response</Button>

                    <div className="mx-1 h-6 w-px bg-border" />

                    <Button size="sm" className={getFilterButtonClass(responseFilter === "any")} variant="ghost" onClick={() => setResponseFilter("any")}>Any Reply</Button>
                    <Button size="sm" className={getFilterButtonClass(responseFilter === "replied")} variant="ghost" onClick={() => setResponseFilter("replied")}>Replied</Button>
                    <Button size="sm" className={getFilterButtonClass(responseFilter === "no-reply")} variant="ghost" onClick={() => setResponseFilter("no-reply")}>No Reply</Button>

                    <div className="mx-1 h-6 w-px bg-border" />

                    <Button size="sm" className={getFilterButtonClass(activityFilter === "all")} variant="ghost" onClick={() => setActivityFilter("all")}>Any Time</Button>
                    <Button size="sm" className={getFilterButtonClass(activityFilter === "7d")} variant="ghost" onClick={() => setActivityFilter("7d")}>7d</Button>
                    <Button size="sm" className={getFilterButtonClass(activityFilter === "30d")} variant="ghost" onClick={() => setActivityFilter("30d")}>30d</Button>

                    <div className="mx-1 h-6 w-px bg-border" />

                    <Button size="sm" className={getFilterButtonClass(sortMode === "manual")} variant="ghost" onClick={() => setSortMode("manual")}>Sort: Manual</Button>
                    <Button size="sm" className={getFilterButtonClass(sortMode === "focus")} variant="ghost" onClick={() => setSortMode("focus")}>Sort: Focus</Button>
                    <Button size="sm" className={getFilterButtonClass(sortMode === "recent")} variant="ghost" onClick={() => setSortMode("recent")}>Sort: Recent</Button>
                    <Button size="sm" className={getFilterButtonClass(sortMode === "replies")} variant="ghost" onClick={() => setSortMode("replies")}>Sort: Replies</Button>
                  </div>
                ) : null}
              </div>

              <GlassScrollArea
                containerClassName="h-full min-h-0 flex-1"
                className={`h-full min-h-0 space-y-3 overflow-y-scroll pr-2.5 ${outreachScrollActive ? "scroll-active" : ""}`}
                onScroll={markOutreachScrolling}
              >
                {sortedProspects.length === 0 ? (
                  <div className="glass-list-surface rounded-[24px] p-6 text-center">
                    <p className="text-base font-semibold text-foreground">No leads match current filters.</p>
                    <p className="mt-1 text-sm text-muted-foreground">Your leads are still saved. Try resetting filters.</p>
                    <Button type="button" variant="outline" className="mt-3 h-9 px-4" onClick={resetOutreachFilters}>
                      Reset Filters
                    </Button>
                  </div>
                ) : null}
                {sortedProspects.map((prospect, index) => (
                  (() => {
                    return (
                  <div
                    key={prospect.id}
                    className="sales-prospect-row group entity-card-hover glass-list-surface relative flex items-start justify-between rounded-[30px] p-5 transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_30px_60px_-24px_hsl(var(--foreground)/0.42)] animate-fade-in-up cursor-grab active:cursor-grabbing"
                    style={{ animationDelay: `${0.3 + index * 0.1}s` }}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(prospect.id));
                      if (sortMode !== "manual") setSortMode("manual");
                      setDraggedProspectId(prospect.id);
                    }}
                    onDragEnd={() => {
                      setDraggedProspectId(null);
                      setProspectDropIndicator(null);
                    }}
                    onDragOver={(event) => {
                      if (!draggedProspectId || draggedProspectId === prospect.id) return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const offsetY = event.clientY - rect.top;
                      const position: "before" | "after" = offsetY < rect.height / 2 ? "before" : "after";
                      setProspectDropIndicator({ prospectId: prospect.id, position });
                    }}
                    onDragLeave={() => {
                      if (prospectDropIndicator?.prospectId === prospect.id) setProspectDropIndicator(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggedProspectId || draggedProspectId === prospect.id) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const offsetY = event.clientY - rect.top;
                      const position: "before" | "after" = offsetY < rect.height / 2 ? "before" : "after";
                      reorderProspectsByDrag(draggedProspectId, prospect.id, position);
                      setProspectDropIndicator(null);
                      setDraggedProspectId(null);
                    }}
                    onClick={() => setViewProspect(prospect)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setViewProspect(prospect);
                      }
                    }}
                  >
                    {prospectDropIndicator?.prospectId === prospect.id && prospectDropIndicator.position === "before" ? (
                      <div className="pointer-events-none absolute -top-[2px] left-4 right-4 h-[3px] rounded-full bg-cyan-300 shadow-[0_0_12px_hsl(195_100%_70%/.85)]" />
                    ) : null}
                    {prospectDropIndicator?.prospectId === prospect.id && prospectDropIndicator.position === "after" ? (
                      <div className="pointer-events-none absolute -bottom-[2px] left-4 right-4 h-[3px] rounded-full bg-cyan-300 shadow-[0_0_12px_hsl(195_100%_70%/.85)]" />
                    ) : null}
                    <div className="flex flex-1 items-start gap-5">
                      <div className="min-w-0 flex-1 space-y-3">
                        <p className="text-lg font-semibold text-foreground">{prospect.prospect}</p>
                        <p className="text-[0.98rem] text-muted-foreground">{prospect.contact}</p>
                        {prospect.specialNotes ? (
                          <div className="mt-1 rounded-lg border border-primary/28 bg-primary/10 px-3 py-2.5 shadow-[inset_0_1px_0_hsl(0_0%_100%/.45)] dark:border-primary/35 dark:bg-primary/12">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-primary/80">Special Notes</p>
                            <p className="mt-1 line-clamp-3 text-sm leading-snug text-foreground/88">{prospect.specialNotes}</p>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-start gap-3 pt-1">
                        <div className="sales-next-task min-w-[220px] rounded-[20px] border border-[var(--glass-stroke-soft)] bg-[linear-gradient(180deg,hsl(220_28%_100%/.12),hsl(220_28%_100%/.04))] px-3 py-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Next Task</p>
                          <p className="mt-1 text-sm font-medium text-foreground">{formatNextFollowUp(prospect.nextFollowUpDate, prospect.nextFollowUpTime)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="ml-4 flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleStarProspect(prospect.id);
                        }}
                        aria-label={starredProspectIds.includes(prospect.id) ? "Unstar prospect" : "Star prospect"}
                        className={`${actionButtonClass} ${starredProspectIds.includes(prospect.id) ? "border-amber-300/70 text-amber-500" : ""}`}
                      >
                        <Star className={`h-4 w-4 ${starredProspectIds.includes(prospect.id) ? "fill-current" : ""}`} />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSendEmail(prospect.id);
                            }}
                          >
                            Send Email
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              handleLogReply(prospect.id);
                            }}
                          >
                            Log Reply
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              handleChangeStatus(prospect.id, "interested");
                            }}
                          >
                            Set Interested
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              handleChangeStatus(prospect.id, "follow_up");
                            }}
                          >
                            Set Follow-up
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              handleChangeStatus(prospect.id, "booked");
                            }}
                          >
                            Set Booked
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              handleChangeStatus(prospect.id, "verdict");
                            }}
                          >
                            Set Verdict
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              handleChangeStatus(prospect.id, "no_response");
                            }}
                          >
                            Set No Response
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditProspectModal(prospect);
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              setMeetingNotesTarget({
                                key: `prospect:${prospect.id}`,
                                title: `${prospect.prospect} Meeting Notes`,
                              });
                            }}
                          >
                            Notes
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteProspect(prospect.id);
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
              </GlassScrollArea>
            </Card>

            <Card className="sales-limbo-panel flex h-[38vh] min-h-[18rem] flex-col overflow-hidden p-6 animate-fade-in-up" style={{ animationDelay: "0.25s" }}>
              <div className="sales-panel-header mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Limbo</h2>
                <Button
                  size="sm"
                  className="h-9 rounded-full px-4 text-sm font-semibold"
                  onClick={() => {
                    resetLimboForm();
                    setIsLimboModalOpen(true);
                  }}
                >
                  + Add Limbo
                </Button>
              </div>
              <GlassScrollArea
                containerClassName="min-h-0 flex-1"
                className={`min-h-0 space-y-3 overflow-y-auto pr-2 ${limboScrollActive ? "scroll-active" : ""}`}
                onScroll={markLimboScrolling}
                onMouseEnter={markLimboScrolling}
                onMouseMove={markLimboScrolling}
              >
                {limboItems.length === 0 ? (
                  <div className="glass-list-surface rounded-[24px] p-5 text-center">
                    <p className="text-base font-semibold text-foreground">No limbo prospects yet.</p>
                    <p className="mt-1 text-sm text-muted-foreground">Use + Add Limbo to track leads that are paused or uncertain.</p>
                  </div>
                ) : null}
                {limboItems.map((item) => (
                  <div key={item.id} className="liquid-cyan-hover glass-list-surface rounded-[24px] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground">{item.prospect}</p>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">{item.contact || "No contact provided"}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs font-semibold text-destructive/90 hover:text-destructive"
                        onClick={() => handleRemoveLimbo(item.id)}
                      >
                        Remove
                      </Button>
                    </div>
                    {item.reason ? (
                      <p className="mt-2 text-sm font-medium text-foreground/90">Reason: {item.reason}</p>
                    ) : null}
                    {item.note ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{item.note}</p>
                    ) : null}
                    <p className="mt-2 text-xs font-medium text-muted-foreground">Added {formatDateWritten(item.createdAt)}</p>
                  </div>
                ))}
              </GlassScrollArea>
            </Card>
          </div>
        )}

        {folderView === "strategy" && (
          <div className="sales-folder-shell content-glass-surface p-4 md:p-5">
          <Card className="sales-folder-panel p-6 animate-fade-in-up">
            <div className="sales-panel-header mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Sales Strategy</h2>
              <Badge variant="secondary">Folder</Badge>
            </div>
            {strategyItems.length === 0 ? (
              <Card className="glass-hero-panel p-6 text-center">
                <p className="text-base font-semibold text-foreground">No strategy items yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">Use + Add Tactic to build your strategy stack.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {strategyItems.map((item) => (
                  <div key={item.id} className="liquid-cyan-hover glass-list-surface rounded-[24px] p-4">
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    {item.note ? <p className="mt-1 text-xs text-muted-foreground">{item.note}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
          </div>
        )}

        {folderView === "tasks" && (
          <div className="sales-folder-shell content-glass-surface p-4 md:p-5">
          <Card className="sales-folder-panel p-6 animate-fade-in-up">
            <div className="sales-panel-header mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Sales Tasks</h2>
              <Badge variant="secondary">Folder</Badge>
            </div>
            {salesTasks.length === 0 ? (
              <Card className="glass-hero-panel p-6 text-center">
                <p className="text-base font-semibold text-foreground">No sales tasks yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">Use + Add Task to create your queue.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {salesTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => toggleSalesTaskDone(task.id)}
                    className="liquid-cyan-hover glass-list-surface flex w-full items-center justify-between rounded-[24px] px-4 py-3 text-left"
                  >
                    <span className={`text-sm font-medium ${task.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {task.title}
                    </span>
                    <Badge variant={task.done ? "secondary" : "outline"}>{task.done ? "Done" : "Open"}</Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>
          </div>
        )}
      </div>

      <Dialog open={Boolean(viewProspect)} onOpenChange={(open) => !open && setViewProspect(null)}>
        <DialogContent className="form-dialog-shell max-w-5xl p-0">
          {viewProspect ? (
            <div className="form-surface m-4 space-y-5 p-6">
              <DialogHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <DialogTitle className="text-3xl font-semibold tracking-tight text-foreground">
                      {viewProspect.prospect}
                    </DialogTitle>
                    <div className="inline-flex items-center rounded-full border border-cyan-300/55 bg-card/65 px-3 py-1 text-sm font-semibold text-foreground">
                      {viewProspect.prospectName || viewProspect.contact}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 text-sm font-medium"
                    onClick={() => {
                      const target = viewProspect;
                      setViewProspect(null);
                      openEditProspectModal(target);
                    }}
                  >
                    Edit
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.05em] ${getStatusBadgeClass(viewProspect.status)}`}>
                    {getStatusLabel(viewProspect.status)}
                  </span>
                  <span className={sourceBadgeClass}>{getSourceLabel(viewProspect.source)}</span>
                  {viewProspect.campaign ? <span className={sourceBadgeClass}>{viewProspect.campaign}</span> : null}
                  {viewProspect.group ? <span className={sourceBadgeClass}>{viewProspect.group}</span> : null}
                  <span className="inline-flex items-center rounded-full border border-border/80 bg-card/70 px-3 py-1 text-xs font-semibold tracking-[0.05em] text-foreground/90">
                    {getWebsiteTypeLabel(viewProspect.planMode)}
                  </span>
                  {viewProspect.budgetTier ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-300/45 bg-emerald-100/65 px-3 py-1 text-xs font-semibold tracking-[0.05em] text-emerald-700 dark:border-emerald-300/35 dark:bg-emerald-500/16 dark:text-emerald-200">
                      Budget: {getBudgetTierLabel(viewProspect.budgetTier)}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center rounded-full border border-primary/35 bg-primary/12 px-3 py-1 text-xs font-semibold tracking-[0.05em] text-primary">
                    Interest: {viewProspect.interestLevel ? toSmartTitleCase(viewProspect.interestLevel) : "Not Set"}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border/80 bg-card/70 px-3 py-1 text-xs font-semibold tracking-[0.05em] text-foreground/90">
                    Response:{" "}
                    {deriveResponseSelections(viewProspect.responses, viewProspect.askedFor, viewProspect.askedForSecondary).length
                      ? deriveResponseSelections(viewProspect.responses, viewProspect.askedFor, viewProspect.askedForSecondary)
                          .map((value) => getAskedForLabel(value))
                          .join(", ")
                      : "Not Set"}
                  </span>
                </div>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card className="rounded-2xl border border-border/70 bg-card/70 p-4 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">CONTACT BRIEF</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Primary Email</span>
                      <span className="font-medium text-foreground">{viewProspect.email || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Secondary Email</span>
                      <span className="font-medium text-foreground">{viewProspect.secondaryEmail || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Cell Phone</span>
                      <span className="font-medium text-foreground">{viewProspect.cellPhone || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Business Phone</span>
                      <span className="font-medium text-foreground">{viewProspect.businessPhone || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">City / State</span>
                      <span className="font-medium text-foreground">{[viewProspect.city, viewProspect.state].filter(Boolean).join(", ") || "-"}</span>
                    </div>
                  </div>
                </Card>

                <Card className="rounded-2xl border border-border/70 bg-card/70 p-4 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">PIPELINE BRIEF</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Next Task</span>
                      <span className="font-medium text-foreground">{formatNextFollowUp(viewProspect.nextFollowUpDate, viewProspect.nextFollowUpTime)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Last Contact</span>
                      <span className="font-medium text-foreground">{formatDateWritten(viewProspect.lastContact)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Emails Sent</span>
                      <span className="font-medium text-foreground">{viewProspect.emailsSent}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Replies</span>
                      <span className="font-medium text-foreground">{viewProspect.replies}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Fee</span>
                      <span className="font-semibold text-foreground">{formatMoneyPreview(viewProspect.fee)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">MRR</span>
                      <span className="font-semibold text-foreground">{formatMoneyPreview(viewProspect.mrr)}</span>
                    </div>
                    <div className="pt-1">
                      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">Special Notes</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
                        {viewProspect.specialNotes?.trim() || "No notes yet."}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {viewProspect.notionUrl ? (
                <div className="flex justify-end">
                  <Button asChild variant="outline" className="h-10 px-4 text-sm font-medium">
                    <a href={viewProspect.notionUrl} target="_blank" rel="noreferrer">
                      Open Website
                    </a>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
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

      <Dialog
        open={isLimboModalOpen}
        onOpenChange={(open) => {
          setIsLimboModalOpen(open);
          if (!open) resetLimboForm();
        }}
      >
        <DialogContent className="form-dialog-shell max-w-xl p-0">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-semibold tracking-tight">Add Limbo Prospect</DialogTitle>
            </DialogHeader>
            <p className="mt-1 text-sm text-muted-foreground">
              Separate from Add Prospect. Use this only for leads that are paused, uncertain, or not actively moving.
            </p>
            <div className="mt-5 space-y-3 rounded-2xl border border-border/70 bg-card/60 p-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Prospect Name</p>
                <Input
                  value={limboForm.prospect}
                  onChange={(event) => setLimboForm((prev) => ({ ...prev, prospect: toSmartTitleCaseLive(event.target.value) }))}
                  onBlur={(event) => setLimboForm((prev) => ({ ...prev, prospect: toSmartTitleCase(event.target.value) }))}
                  placeholder="Prospect Name"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Contact</p>
                <Input
                  value={limboForm.contact}
                  onChange={(event) => setLimboForm((prev) => ({ ...prev, contact: event.target.value }))}
                  placeholder="Email or phone"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Why Limbo?</p>
                <Input
                  value={limboForm.reason}
                  onChange={(event) => setLimboForm((prev) => ({ ...prev, reason: toSmartTitleCaseLive(event.target.value) }))}
                  onBlur={(event) => setLimboForm((prev) => ({ ...prev, reason: toSmartTitleCase(event.target.value) }))}
                  placeholder="Waiting on reply, budget hold, timing issue..."
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Notes</p>
                <Textarea
                  value={limboForm.note}
                  onChange={(event) => setLimboForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Optional context"
                  className="min-h-[130px] resize-y"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsLimboModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleAddLimbo}
                className="h-10 rounded-full px-5"
              >
                Save Limbo Prospect
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isProspectModalOpen} onOpenChange={(open) => {
        setIsProspectModalOpen(open);
        if (!open) resetProspectForm();
      }}>
        <DialogContent className="form-dialog-shell max-w-2xl p-0">
          <div className="p-6 pb-4">
            <DialogHeader>
              <DialogTitle className="text-2xl font-semibold tracking-tight">{editingProspectId !== null ? "Edit Prospect" : "Add Prospect"}</DialogTitle>
            </DialogHeader>
            <p className="mt-1 text-sm text-muted-foreground">Choose mode: guided flow or full form.</p>
          </div>

          <div className="px-6 pb-6 relative">
            <div className="absolute right-6 top-0 z-10">
              <Tabs value={prospectFormMode} onValueChange={(value) => setProspectFormMode(value as ProspectFormMode)}>
                <TabsList className="form-mode-tabs">
                  <TabsTrigger value="onboard" className="h-6 rounded-full px-3 text-[11px] font-semibold">Guided</TabsTrigger>
                  <TabsTrigger value="all" className="h-6 rounded-full px-3 text-[11px] font-semibold">Full Form</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {prospectFormMode === "onboard" ? (
              <div className="form-surface p-4">
                <div className="mb-4">
                  <div className="h-2 rounded-full bg-background/65">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,hsl(191_100%_72%),hsl(215_93%_63%))] shadow-[0_0_14px_hsl(199_100%_72%/.45)] transition-all"
                      style={{ width: `${((onboardStep + 1) / onboardingSteps.length) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="mb-3 text-xs font-semibold tracking-[0.08em] text-muted-foreground">
                  {onboardingSteps[onboardStep].label}
                </div>

                {currentOnboardKey === "prospect" && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Prospect Name</p>
                      <Input
                        value={prospectForm.prospectName}
                        onChange={(event) => setProspectForm({ ...prospectForm, prospectName: toSmartTitleCaseLive(event.target.value) })}
                        onBlur={(event) => setProspectForm({ ...prospectForm, prospectName: toSmartTitleCase(event.target.value) })}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Company Name</p>
                      <Input
                        value={prospectForm.companyName}
                        onChange={(event) => setProspectForm({ ...prospectForm, companyName: toSmartTitleCaseLive(event.target.value) })}
                        onBlur={(event) => setProspectForm({ ...prospectForm, companyName: toSmartTitleCase(event.target.value) })}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Role</p>
                      <Input
                        value={prospectForm.role}
                        placeholder="Role"
                        className="h-11"
                        onChange={(event) => {
                          const nextRole = toSmartTitleCaseLive(event.target.value);
                          setProspectForm((prev) => ({
                            ...prev,
                            role: nextRole,
                            industry: isRealtorRoleValue(nextRole) ? REALTOR_INDUSTRY : prev.industry,
                          }));
                        }}
                        onBlur={(event) => {
                          const nextRole = normalizeRoleLabel(event.target.value);
                          setProspectForm((prev) => ({
                            ...prev,
                            role: nextRole,
                            industry: isRealtorRoleValue(nextRole) ? REALTOR_INDUSTRY : prev.industry,
                          }));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Industry</p>
                      <Input
                        value={prospectForm.industry}
                        placeholder="Industry"
                        className="h-11"
                        disabled={isRealtorRoleValue(prospectForm.role)}
                        onChange={(event) => setProspectForm((prev) => ({ ...prev, industry: toSmartTitleCaseLive(event.target.value) }))}
                        onBlur={(event) => setProspectForm((prev) => ({ ...prev, industry: toSmartTitleCase(event.target.value) }))}
                      />
                      {isRealtorRoleValue(prospectForm.role) ? (
                        <p className="text-[11px] text-muted-foreground">Locked: Realtor always maps to Real Estate.</p>
                      ) : null}
                    </div>
                  </div>
                )}
                {currentOnboardKey === "source" && (
                  <div className="space-y-3">
                    <Select
                      value={prospectForm.source || undefined}
                      onValueChange={(value) =>
                        setProspectForm((prev) => ({
                          ...prev,
                          source: value as ProspectSource,
                          instantlyList: prev.instantlyList,
                        }))
                      }
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cold_email">Cold Email</SelectItem>
                        <SelectItem value="referral">Referral</SelectItem>
                        <SelectItem value="network">Network</SelectItem>
                        <SelectItem value="repeat">Repeat</SelectItem>
                        <SelectItem value="targeted">Targeted</SelectItem>
                      </SelectContent>
                    </Select>

                    {prospectForm.source === "cold_email" ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Which List</p>
                        <Select value={prospectForm.instantlyList} onValueChange={handleInstantlyListSelect}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Choose list" />
                          </SelectTrigger>
                          <SelectContent>
                            {instantlyLists.map((listName) => (
                              <SelectItem key={listName} value={listName}>
                                {listName}
                              </SelectItem>
                            ))}
                            <SelectItem value="__create__">+ Create New List</SelectItem>
                          </SelectContent>
                        </Select>
                        {creatingInstantlyList ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={instantlyListDraft}
                              onChange={(event) => setInstantlyListDraft(event.target.value)}
                              onBlur={(event) => setInstantlyListDraft(toSmartTitleCase(event.target.value))}
                              placeholder="New list name"
                              className="h-10"
                            />
                            <Button type="button" variant="outline" onClick={handleCreateInstantlyList}>
                              Add
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Campaign</p>
                      <Select value={prospectForm.campaign || undefined} onValueChange={handleCampaignSelect}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Choose campaign" />
                        </SelectTrigger>
                        <SelectContent>
                          {campaignOptions.map((campaign) => (
                            <SelectItem key={campaign} value={campaign}>
                              {campaign}
                            </SelectItem>
                          ))}
                          <SelectItem value="__create_campaign__">+ Create New Campaign</SelectItem>
                        </SelectContent>
                      </Select>
                      {creatingCampaignOption ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={campaignOptionDraft}
                            onChange={(event) => setCampaignOptionDraft(event.target.value)}
                            onBlur={(event) => setCampaignOptionDraft(toSmartTitleCase(event.target.value))}
                            placeholder="New campaign"
                            className="h-10"
                          />
                          <Button type="button" variant="outline" onClick={handleCreateCampaignOption}>
                            Add
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Group</p>
                      <Select value={prospectForm.group || undefined} onValueChange={handleGroupSelect}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Choose group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groupOptions.map((group) => (
                            <SelectItem key={group} value={group}>
                              {group}
                            </SelectItem>
                          ))}
                          <SelectItem value={CREATE_GROUP_VALUE}>+ Create New Group</SelectItem>
                        </SelectContent>
                      </Select>
                      {creatingGroupOption ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={groupOptionDraft}
                            onChange={(event) => setGroupOptionDraft(event.target.value)}
                            onBlur={(event) => setGroupOptionDraft(toSmartTitleCase(event.target.value))}
                            placeholder="New group"
                            className="h-10"
                          />
                          <Button type="button" variant="outline" onClick={handleCreateGroupOption}>
                            Add
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
                {currentOnboardKey === "interest" && (
                  <div className="space-y-3">
                    <Select
                      value={prospectForm.interestLevel || undefined}
                      onValueChange={(value) => setProspectForm({ ...prospectForm, interestLevel: value as ProspectInterest })}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select level of interest" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Website Type</p>
                      <Select
                        value={prospectForm.planMode || undefined}
                        onValueChange={(value) => setProspectForm({ ...prospectForm, planMode: value as ProspectPlanMode })}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Website type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom</SelectItem>
                          <SelectItem value="template">Template</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Budget</p>
                      <Select
                        value={prospectForm.budgetTier || undefined}
                        onValueChange={(value) => setProspectForm({ ...prospectForm, budgetTier: value as ProspectBudgetTier })}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select budget" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="premium">Premium</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="basic">Basic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Response</p>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" className="h-11 w-full justify-between px-3 text-sm font-normal">
                            <span className="truncate">{getResponseSummary(prospectForm.responses)}</span>
                            <ChevronDown className="h-4 w-4 opacity-70" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-[var(--radix-dropdown-menu-trigger-width)]">
                          {RESPONSE_OPTIONS.map((option) => (
                            <DropdownMenuCheckboxItem
                              key={option}
                              checked={prospectForm.responses.includes(option)}
                              onCheckedChange={() => toggleResponseSelection(option)}
                              onSelect={(event) => event.preventDefault()}
                            >
                              {getAskedForLabel(option)}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )}
                {currentOnboardKey === "status" && (
                  <div className="space-y-3">
                    <Select
                      value={prospectForm.status || undefined}
                      onValueChange={(value) => setProspectForm({ ...prospectForm, status: value as ProspectStatus })}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interested">Interested</SelectItem>
                        <SelectItem value="follow_up">Follow Up</SelectItem>
                        <SelectItem value="booked">Booked</SelectItem>
                        <SelectItem value="verdict">Verdict</SelectItem>
                        <SelectItem value="no_response">No Response</SelectItem>
                      </SelectContent>
                    </Select>
                    {prospectForm.status === "follow_up" ? (
                      <Select
                        value={prospectForm.followUpType || undefined}
                        onValueChange={(value) => setProspectForm({ ...prospectForm, followUpType: value as FollowUpType })}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Next task type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                )}
                {currentOnboardKey === "timing" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-primary/30 bg-primary/8 p-3">
                      <p className="text-[11px] font-semibold tracking-[0.08em] text-primary/90">Quick Schedule</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => applyQuickFollowUp(getDateWithOffset(0), "09:00")}>Today 9AM</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => applyQuickFollowUp(getDateWithOffset(1), "09:00")}>Tomorrow 9AM</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => applyQuickFollowUp(getDateWithOffset(7), "13:00")}>Next Week 1PM</Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => applyQuickFollowUp(getNextWeekdayDate(1), "09:00")}>Next Monday</Button>
                      </div>
                      <div className="mt-2 inline-flex items-center rounded-full border border-primary/35 bg-card/70 px-3 py-1 text-xs font-semibold text-foreground">
                        {prospectForm.nextFollowUpDate
                          ? `Scheduled: ${formatScheduledPreview(prospectForm.nextFollowUpDate, prospectForm.nextFollowUpTime, prospectForm.timeZoneMode, activeSchedulingTimeZone || undefined)}`
                          : "No next task scheduled yet"}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Next Task Date</p>
                      <DatePickerField
                        value={prospectForm.nextFollowUpDate}
                        onChange={(value) => setProspectForm({ ...prospectForm, nextFollowUpDate: value })}
                        triggerClassName="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Time (Optional)</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={prospectForm.hasSpecificTime ? "outline" : "secondary"}
                          className="h-8 px-3 text-xs"
                          onClick={() => setProspectForm((prev) => ({ ...prev, hasSpecificTime: false, nextFollowUpTime: "" }))}
                        >
                          Date Only
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={prospectForm.hasSpecificTime ? "secondary" : "outline"}
                          className="h-8 px-3 text-xs"
                          onClick={() => setProspectForm((prev) => ({ ...prev, hasSpecificTime: true }))}
                        >
                          Specific Time
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={prospectForm.timeZoneMode === "mine" ? "secondary" : "outline"}
                          className="h-8 px-3 text-xs"
                          onClick={() => setProspectForm((prev) => ({ ...prev, timeZoneMode: "mine" }))}
                        >
                          My Timezone
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={prospectForm.timeZoneMode === "client" ? "secondary" : "outline"}
                          className="h-8 px-3 text-xs"
                          onClick={() =>
                            setProspectForm((prev) => ({
                              ...prev,
                              timeZoneMode: "client",
                              clientTimeZone: inferredClientTimeZone || prev.clientTimeZone,
                            }))
                          }
                        >
                          Client Timezone
                        </Button>
                      </div>
                      {prospectForm.hasSpecificTime ? (
                        <>
                          <div className="flex flex-wrap gap-1.5">
                            {TIME_PRESETS.map((preset) => (
                              <Button
                                key={preset.value}
                                type="button"
                                size="sm"
                                variant={prospectForm.nextFollowUpTime === preset.value ? "secondary" : "outline"}
                                className="h-8 px-3 text-xs"
                                onClick={() => setProspectForm({ ...prospectForm, nextFollowUpTime: preset.value })}
                              >
                                {preset.label}
                              </Button>
                            ))}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              onClick={() => setProspectForm({ ...prospectForm, hasSpecificTime: false, nextFollowUpTime: "" })}
                            >
                              Clear Time
                            </Button>
                          </div>
                          <Input
                            type="time"
                            value={prospectForm.nextFollowUpTime}
                            onChange={(event) => setProspectForm({ ...prospectForm, nextFollowUpTime: event.target.value })}
                            className="h-11"
                          />
                        </>
                      ) : null}
                      <p className="text-[11px] text-muted-foreground">
                        Date-only tasks will sync by date only. Turn on Specific Time only when you want an exact hour.
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {prospectForm.timeZoneMode === "client"
                          ? activeSchedulingTimeZone
                            ? `Client timezone active: ${getTimeZoneLabel(activeSchedulingTimeZone)}. Delphi will convert this into your schedule timezone automatically.`
                            : "Client timezone selected. Add city and state so Delphi can infer the prospect timezone."
                          : `Using your timezone: ${getTimeZoneLabel(userTimeZone)}.`}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Last Contact (Internal)</p>
                      <DatePickerField
                        value={prospectForm.lastContact}
                        onChange={(value) => setProspectForm({ ...prospectForm, lastContact: value })}
                        triggerClassName="h-11"
                      />
                    </div>
                  </div>
                )}
                {currentOnboardKey === "contact" && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Input
                        type="email"
                        value={prospectForm.email}
                        onChange={(event) => {
                          setProspectForm({ ...prospectForm, email: event.target.value.toLowerCase() });
                        }}
                        className={`h-11 ${duplicateEmailError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        placeholder="Primary Email"
                      />
                    </div>
                    <div className="space-y-1">
                      <Input
                        type="email"
                        value={prospectForm.secondaryEmail}
                        onChange={(event) => {
                          setProspectForm({ ...prospectForm, secondaryEmail: event.target.value.toLowerCase() });
                        }}
                        className={`h-11 ${duplicateEmailError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        placeholder="Secondary Email (Optional)"
                      />
                      {duplicateEmailError ? (
                        <p className="text-xs font-medium text-destructive">{duplicateEmailError}</p>
                      ) : null}
                    </div>
                    <Input
                      value={prospectForm.cellPhone}
                      onChange={(event) => updateProspectPhone("cellPhone", event.target.value)}
                      onBlur={(event) => updateProspectPhone("cellPhone", event.target.value)}
                      className={`h-11 ${duplicatePhoneError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      placeholder="Cell Phone"
                    />
                    <Input
                      value={prospectForm.businessPhone}
                      onChange={(event) => updateProspectPhone("businessPhone", event.target.value)}
                      onBlur={(event) => updateProspectPhone("businessPhone", event.target.value)}
                      className={`h-11 ${duplicatePhoneError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      placeholder="Business Phone"
                    />
                    <Input
                      value={prospectForm.city}
                      onChange={(event) => setProspectForm({ ...prospectForm, city: toSmartTitleCaseLive(event.target.value) })}
                      onBlur={(event) => setProspectForm({ ...prospectForm, city: toSmartTitleCase(event.target.value) })}
                      className="h-11"
                      placeholder="City"
                    />
                    <Select
                      value={prospectForm.state || undefined}
                      onValueChange={(value) => setProspectForm({ ...prospectForm, state: value })}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="State" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map((stateName) => (
                          <SelectItem key={stateName} value={stateName}>
                            {stateName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={prospectForm.notionUrl}
                      onChange={(event) => setProspectForm({ ...prospectForm, notionUrl: event.target.value })}
                      onBlur={(event) => setProspectForm({ ...prospectForm, notionUrl: sanitizeWebsiteInput(event.target.value) })}
                      className={`h-11 md:col-span-2 ${duplicateWebsiteError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      placeholder="Website Link"
                    />
                    {duplicatePhoneError ? (
                      <p className="text-xs font-medium text-destructive md:col-span-2">{duplicatePhoneError}</p>
                    ) : null}
                    {duplicateWebsiteError ? (
                      <p className="text-xs font-medium text-destructive md:col-span-2">{duplicateWebsiteError}</p>
                    ) : null}
                  </div>
                )}
                {currentOnboardKey === "financial" && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      value={prospectForm.fee}
                      onChange={(event) => updateProspectMoney("fee", event.target.value)}
                      className="h-11"
                      placeholder="Fee"
                    />
                    <Input
                      value={prospectForm.mrr}
                      onChange={(event) => updateProspectMoney("mrr", event.target.value)}
                      className="h-11"
                      placeholder="MRR"
                    />
                  </div>
                )}
                {currentOnboardKey === "notes" && (
                  <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/8 p-4 shadow-[inset_0_1px_0_hsl(0_0%_100%/.45)] dark:border-primary/30 dark:bg-primary/10">
                    <p className="text-xs font-semibold tracking-[0.08em] text-primary/80">
                      Special Notes Or Lead Context
                    </p>
                    <Textarea
                      value={prospectForm.specialNotes}
                      onChange={(event) => setProspectForm({ ...prospectForm, specialNotes: event.target.value })}
                      className="min-h-[200px] resize-y text-[15px] leading-relaxed"
                      placeholder="Add important lead details, objections, preferences, timing, or anything you want visible on the card."
                    />
                  </div>
                )}

                <div className="mt-5 space-y-2">
                  {currentOnboardKey !== "contact" && duplicateEmailError ? (
                    <p className="text-sm font-medium text-destructive">{duplicateEmailError}</p>
                  ) : null}
                  {currentOnboardKey !== "contact" && duplicatePhoneError ? (
                    <p className="text-sm font-medium text-destructive">{duplicatePhoneError}</p>
                  ) : null}
                  {currentOnboardKey !== "contact" && duplicateWebsiteError ? (
                    <p className="text-sm font-medium text-destructive">{duplicateWebsiteError}</p>
                  ) : null}
                  <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setOnboardStep((step) => Math.max(0, step - 1))}
                    disabled={onboardStep === 0}
                  >
                    Back
                  </Button>

                  {onboardStep < onboardingSteps.length - 1 ? (
                    <Button
                      className="h-10 rounded-full px-6"
                      disabled={hasDuplicateConflict}
                      onClick={() => setOnboardStep((step) => Math.min(onboardingSteps.length - 1, step + 1))}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      className="h-10 rounded-full px-6"
                      disabled={hasDuplicateConflict}
                      onClick={handleSaveProspect}
                    >
                      Save Prospect
                    </Button>
                  )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="form-surface p-5">
                <div className="space-y-4">
                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">PROSPECT</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Input value={prospectForm.prospectName} onChange={(event) => setProspectForm({ ...prospectForm, prospectName: toSmartTitleCaseLive(event.target.value) })} onBlur={(event) => setProspectForm({ ...prospectForm, prospectName: toSmartTitleCase(event.target.value) })} placeholder="Prospect Name" className="h-11" />
                      <Input value={prospectForm.companyName} onChange={(event) => setProspectForm({ ...prospectForm, companyName: toSmartTitleCaseLive(event.target.value) })} onBlur={(event) => setProspectForm({ ...prospectForm, companyName: toSmartTitleCase(event.target.value) })} placeholder="Company Name" className="h-11" />
                      <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Role</p>
                        <Input
                          value={prospectForm.role}
                          placeholder="Role"
                          className="h-11"
                          onChange={(event) => {
                            const nextRole = toSmartTitleCaseLive(event.target.value);
                            setProspectForm((prev) => ({
                              ...prev,
                              role: nextRole,
                              industry: isRealtorRoleValue(nextRole) ? REALTOR_INDUSTRY : prev.industry,
                            }));
                          }}
                          onBlur={(event) => {
                            const nextRole = normalizeRoleLabel(event.target.value);
                            setProspectForm((prev) => ({
                              ...prev,
                              role: nextRole,
                              industry: isRealtorRoleValue(nextRole) ? REALTOR_INDUSTRY : prev.industry,
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Industry</p>
                        <Input
                          value={prospectForm.industry}
                          placeholder="Industry"
                          className="h-11"
                          disabled={isRealtorRoleValue(prospectForm.role)}
                          onChange={(event) => setProspectForm((prev) => ({ ...prev, industry: toSmartTitleCaseLive(event.target.value) }))}
                          onBlur={(event) => setProspectForm((prev) => ({ ...prev, industry: toSmartTitleCase(event.target.value) }))}
                        />
                        {isRealtorRoleValue(prospectForm.role) ? (
                          <p className="text-[11px] text-muted-foreground">Locked: Realtor always maps to Real Estate.</p>
                        ) : null}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">CONTACT INFO</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Input
                          type="email"
                          value={prospectForm.email}
                          onChange={(event) => {
                            setProspectForm({ ...prospectForm, email: event.target.value.toLowerCase() });
                          }}
                          placeholder="Primary Email"
                          className={`h-11 ${duplicateEmailError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Input
                          type="email"
                          value={prospectForm.secondaryEmail}
                          onChange={(event) => {
                            setProspectForm({ ...prospectForm, secondaryEmail: event.target.value.toLowerCase() });
                          }}
                          placeholder="Secondary Email (Optional)"
                          className={`h-11 ${duplicateEmailError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        />
                        {duplicateEmailError ? (
                          <p className="text-xs font-medium text-destructive">{duplicateEmailError}</p>
                        ) : null}
                      </div>
                      <Input
                        value={prospectForm.cellPhone}
                        onChange={(event) => updateProspectPhone("cellPhone", event.target.value)}
                        onBlur={(event) => updateProspectPhone("cellPhone", event.target.value)}
                        placeholder="Cell Phone"
                        className={`h-11 ${duplicatePhoneError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      />
                      <Input
                        value={prospectForm.businessPhone}
                        onChange={(event) => updateProspectPhone("businessPhone", event.target.value)}
                        onBlur={(event) => updateProspectPhone("businessPhone", event.target.value)}
                        placeholder="Business Phone"
                        className={`h-11 ${duplicatePhoneError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      />
                      <Input value={prospectForm.city} onChange={(event) => setProspectForm({ ...prospectForm, city: toSmartTitleCaseLive(event.target.value) })} onBlur={(event) => setProspectForm({ ...prospectForm, city: toSmartTitleCase(event.target.value) })} placeholder="City" className="h-11" />
                      <Select
                      value={prospectForm.state || undefined}
                      onValueChange={(value) => setProspectForm({ ...prospectForm, state: value })}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="State" />
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map((stateName) => (
                            <SelectItem key={stateName} value={stateName}>
                              {stateName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={prospectForm.notionUrl}
                        onChange={(event) => setProspectForm({ ...prospectForm, notionUrl: event.target.value })}
                        onBlur={(event) => setProspectForm({ ...prospectForm, notionUrl: sanitizeWebsiteInput(event.target.value) })}
                        placeholder="Website Link"
                        className={`h-11 md:col-span-2 ${duplicateWebsiteError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      />
                      {duplicatePhoneError ? (
                        <p className="text-xs font-medium text-destructive md:col-span-2">{duplicatePhoneError}</p>
                      ) : null}
                      {duplicateWebsiteError ? (
                        <p className="text-xs font-medium text-destructive md:col-span-2">{duplicateWebsiteError}</p>
                      ) : null}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">SOURCE + PRIORITY</p>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Source</p>
                        <Select
                          value={prospectForm.source || undefined}
                          onValueChange={(value) =>
                            setProspectForm((prev) => ({
                              ...prev,
                              source: value as ProspectSource,
                              instantlyList: prev.instantlyList,
                            }))
                          }
                        >
                          <SelectTrigger className="h-11"><SelectValue placeholder="Select source" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cold_email">Cold Email</SelectItem>
                            <SelectItem value="referral">Referral</SelectItem>
                            <SelectItem value="network">Network</SelectItem>
                            <SelectItem value="repeat">Repeat</SelectItem>
                            <SelectItem value="targeted">Targeted</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {prospectForm.source === "cold_email" ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Which List</p>
                          <Select value={prospectForm.instantlyList} onValueChange={handleInstantlyListSelect}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Choose list" /></SelectTrigger>
                            <SelectContent>
                              {instantlyLists.map((listName) => (
                                <SelectItem key={listName} value={listName}>
                                  {listName}
                                </SelectItem>
                              ))}
                              <SelectItem value="__create__">+ Create New List</SelectItem>
                            </SelectContent>
                          </Select>
                          {creatingInstantlyList ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={instantlyListDraft}
                                onChange={(event) => setInstantlyListDraft(event.target.value)}
                                onBlur={(event) => setInstantlyListDraft(toSmartTitleCase(event.target.value))}
                                placeholder="New list name"
                                className="h-10"
                              />
                              <Button type="button" variant="outline" onClick={handleCreateInstantlyList}>
                                Add
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Campaign</p>
                        <Select value={prospectForm.campaign || undefined} onValueChange={handleCampaignSelect}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Choose campaign" />
                          </SelectTrigger>
                          <SelectContent>
                            {campaignOptions.map((campaign) => (
                              <SelectItem key={campaign} value={campaign}>
                                {campaign}
                              </SelectItem>
                            ))}
                            <SelectItem value="__create_campaign__">+ Create New Campaign</SelectItem>
                          </SelectContent>
                        </Select>
                        {creatingCampaignOption ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={campaignOptionDraft}
                              onChange={(event) => setCampaignOptionDraft(event.target.value)}
                              onBlur={(event) => setCampaignOptionDraft(toSmartTitleCase(event.target.value))}
                              placeholder="New campaign"
                              className="h-10"
                            />
                            <Button type="button" variant="outline" onClick={handleCreateCampaignOption}>
                              Add
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Group</p>
                        <Select value={prospectForm.group || undefined} onValueChange={handleGroupSelect}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Choose group" />
                          </SelectTrigger>
                          <SelectContent>
                            {groupOptions.map((group) => (
                              <SelectItem key={group} value={group}>
                                {group}
                              </SelectItem>
                            ))}
                            <SelectItem value={CREATE_GROUP_VALUE}>+ Create New Group</SelectItem>
                          </SelectContent>
                        </Select>
                        {creatingGroupOption ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={groupOptionDraft}
                              onChange={(event) => setGroupOptionDraft(event.target.value)}
                              onBlur={(event) => setGroupOptionDraft(toSmartTitleCase(event.target.value))}
                              placeholder="New group"
                              className="h-10"
                            />
                            <Button type="button" variant="outline" onClick={handleCreateGroupOption}>
                              Add
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Interest Level</p>
                          <Select value={prospectForm.interestLevel || undefined} onValueChange={(value) => setProspectForm({ ...prospectForm, interestLevel: value as ProspectInterest })}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select level" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Website Type</p>
                          <Select value={prospectForm.planMode || undefined} onValueChange={(value) => setProspectForm({ ...prospectForm, planMode: value as ProspectPlanMode })}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Website type" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="custom">Custom</SelectItem>
                              <SelectItem value="template">Template</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Budget</p>
                          <Select value={prospectForm.budgetTier || undefined} onValueChange={(value) => setProspectForm({ ...prospectForm, budgetTier: value as ProspectBudgetTier })}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select budget" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="premium">Premium</SelectItem>
                              <SelectItem value="standard">Standard</SelectItem>
                              <SelectItem value="basic">Basic</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Response</p>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="outline" className="h-11 w-full justify-between px-3 text-sm font-normal">
                                <span className="truncate">{getResponseSummary(prospectForm.responses)}</span>
                                <ChevronDown className="h-4 w-4 opacity-70" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="min-w-[var(--radix-dropdown-menu-trigger-width)]">
                              {RESPONSE_OPTIONS.map((option) => (
                                <DropdownMenuCheckboxItem
                                  key={option}
                                  checked={prospectForm.responses.includes(option)}
                                  onCheckedChange={() => toggleResponseSelection(option)}
                                  onSelect={(event) => event.preventDefault()}
                                >
                                  {getAskedForLabel(option)}
                                </DropdownMenuCheckboxItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">NEXT TASK CONTROL</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => applyQuickFollowUp(getDateWithOffset(0), "09:00")}>Today 9AM</Button>
                        <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => applyQuickFollowUp(getDateWithOffset(1), "09:00")}>Tomorrow 9AM</Button>
                        <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => applyQuickFollowUp(getDateWithOffset(7), "13:00")}>Next Week 1PM</Button>
                        <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => applyQuickFollowUp(getNextWeekdayDate(1), "09:00")}>Next Monday</Button>
                      </div>
                    </div>
                    <div className="mb-3 inline-flex items-center rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-semibold text-foreground">
                      {prospectForm.nextFollowUpDate
                        ? `Scheduled: ${formatScheduledPreview(prospectForm.nextFollowUpDate, prospectForm.nextFollowUpTime, prospectForm.timeZoneMode, activeSchedulingTimeZone || undefined)}`
                        : "No next task scheduled yet"}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Status</p>
                          <Select
                            value={prospectForm.status || undefined}
                            onValueChange={(value) => setProspectForm({ ...prospectForm, status: value as ProspectStatus })}
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="interested">Interested</SelectItem>
                              <SelectItem value="follow_up">Follow Up</SelectItem>
                              <SelectItem value="booked">Booked</SelectItem>
                              <SelectItem value="verdict">Verdict</SelectItem>
                              <SelectItem value="no_response">No Response</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {prospectForm.status === "follow_up" ? (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Next Task Type</p>
                            <Select
                              value={prospectForm.followUpType || undefined}
                              onValueChange={(value) => setProspectForm({ ...prospectForm, followUpType: value as FollowUpType })}
                            >
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Next task type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="call">Call</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Next Task Date</p>
                          <DatePickerField
                            value={prospectForm.nextFollowUpDate}
                            onChange={(value) => setProspectForm({ ...prospectForm, nextFollowUpDate: value })}
                            triggerClassName="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Time (Optional)</p>
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant={prospectForm.hasSpecificTime ? "outline" : "secondary"}
                              className="h-8 px-3 text-xs"
                              onClick={() => setProspectForm((prev) => ({ ...prev, hasSpecificTime: false, nextFollowUpTime: "" }))}
                            >
                              Date Only
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={prospectForm.hasSpecificTime ? "secondary" : "outline"}
                              className="h-8 px-3 text-xs"
                              onClick={() => setProspectForm((prev) => ({ ...prev, hasSpecificTime: true }))}
                            >
                              Specific Time
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant={prospectForm.timeZoneMode === "mine" ? "secondary" : "outline"}
                              className="h-8 px-3 text-xs"
                              onClick={() => setProspectForm((prev) => ({ ...prev, timeZoneMode: "mine" }))}
                            >
                              My Timezone
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={prospectForm.timeZoneMode === "client" ? "secondary" : "outline"}
                              className="h-8 px-3 text-xs"
                              onClick={() =>
                                setProspectForm((prev) => ({
                                  ...prev,
                                  timeZoneMode: "client",
                                  clientTimeZone: inferredClientTimeZone || prev.clientTimeZone,
                                }))
                              }
                              >
                                Client Timezone
                              </Button>
                            </div>
                          {prospectForm.hasSpecificTime ? (
                            <>
                              <div className="flex flex-wrap gap-1.5">
                                {TIME_PRESETS.map((preset) => (
                                  <Button
                                    key={preset.value}
                                    type="button"
                                    size="sm"
                                    variant={prospectForm.nextFollowUpTime === preset.value ? "secondary" : "outline"}
                                    className="h-8 px-3 text-xs"
                                    onClick={() => setProspectForm({ ...prospectForm, nextFollowUpTime: preset.value })}
                                  >
                                    {preset.label}
                                  </Button>
                                ))}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => setProspectForm({ ...prospectForm, hasSpecificTime: false, nextFollowUpTime: "" })}
                                >
                                  Clear Time
                                </Button>
                              </div>
                              <Input
                                type="time"
                                value={prospectForm.nextFollowUpTime}
                                onChange={(event) => setProspectForm({ ...prospectForm, nextFollowUpTime: event.target.value })}
                                className="h-11"
                              />
                            </>
                          ) : null}
                          <p className="text-[11px] text-muted-foreground">
                            Date-only tasks will sync by date only. Turn on Specific Time only when you want an exact hour.
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {prospectForm.timeZoneMode === "client"
                              ? activeSchedulingTimeZone
                                ? `Client timezone active: ${getTimeZoneLabel(activeSchedulingTimeZone)}. Delphi will convert this into your schedule timezone automatically.`
                                : "Client timezone selected. Add city and state so Delphi can infer the prospect timezone."
                              : `Using your timezone: ${getTimeZoneLabel(userTimeZone)}.`}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => setProspectForm({ ...prospectForm, nextFollowUpTime: "09:00" })}>Morning</Button>
                            <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => setProspectForm({ ...prospectForm, nextFollowUpTime: "13:00" })}>Afternoon</Button>
                            <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => setProspectForm({ ...prospectForm, nextFollowUpTime: "17:00" })}>Evening</Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Last Contact (Internal)</p>
                          <DatePickerField
                            value={prospectForm.lastContact}
                            onChange={(value) => setProspectForm({ ...prospectForm, lastContact: value })}
                            triggerClassName="h-11"
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">FINANCIAL</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Input value={prospectForm.fee} onChange={(event) => updateProspectMoney("fee", event.target.value)} placeholder="Fee" className="h-11" />
                      <Input value={prospectForm.mrr} onChange={(event) => updateProspectMoney("mrr", event.target.value)} placeholder="MRR" className="h-11" />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                    <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">SPECIAL NOTES</p>
                    <Textarea
                      value={prospectForm.specialNotes}
                      onChange={(event) => setProspectForm({ ...prospectForm, specialNotes: event.target.value })}
                      className="min-h-[200px] resize-y text-[15px] leading-relaxed"
                      placeholder="Add special lead context, asks, blockers, or any notes you want pinned to this lead card."
                    />
                  </section>
                </div>
                <div className="mt-5 space-y-2">
                  <div className="flex justify-end">
                  <Button
                    className="h-10 rounded-full px-6"
                    disabled={hasDuplicateConflict}
                    onClick={handleSaveProspect}
                  >
                    Save Prospect
                  </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
