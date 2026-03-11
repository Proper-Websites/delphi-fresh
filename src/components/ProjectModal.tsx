import { useState, useEffect } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatDateWritten } from "@/lib/date-format";
import { normalizeMoneyInput } from "@/lib/money";
import { toSmartTitleCase, toSmartTitleCaseLive } from "@/lib/text-format";
import { formatPhoneNumber } from "@/lib/phone-format";
import { sanitizeWebsiteInput } from "@/lib/url-format";

export interface Project {
  id: number;
  name: string;
  client: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  commentingToolUrl: string;
  status: "in_progress" | "review" | "planning";
  stage: "rough_draft" | "final_draft" | "retrieve_info" | "finalize" | "launch";
  progress: number;
  budget: string;
  spent: string;
  deposit: string;
  startDate: string;
  deadline: string;
  team: string[];
  tasks: { total: number; completed: number };
}

const STAGE_TO_PROGRESS: Record<Project["stage"], number> = {
  rough_draft: 20,
  final_draft: 40,
  retrieve_info: 60,
  finalize: 80,
  launch: 100,
};

const STAGE_SEQUENCE: Array<{ key: Project["stage"]; label: string }> = [
  { key: "rough_draft", label: "Rough Draft" },
  { key: "final_draft", label: "Final Draft" },
  { key: "retrieve_info", label: "Retrieval" },
  { key: "finalize", label: "Finalize" },
  { key: "launch", label: "Launch" },
];

const inferStageFromProgress = (progress: number): Project["stage"] => {
  if (progress >= 90) return "launch";
  if (progress >= 70) return "finalize";
  if (progress >= 50) return "retrieve_info";
  if (progress >= 30) return "final_draft";
  return "rough_draft";
};

const normalizeProjectStage = (value: string | null | undefined, progressFallback = 0): Project["stage"] => {
  if (value === "rough_draft" || value === "final_draft" || value === "retrieve_info" || value === "finalize" || value === "launch") {
    return value;
  }
  // Backward compatibility for old stage values.
  if (value === "draft") return "rough_draft";
  if (value === "import") return "final_draft";
  return inferStageFromProgress(progressFallback);
};

const parseDateKey = (value: string) => {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 12, 0, 0);
};

const toDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface ProjectModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: Project) => void;
  onAutoSave?: (project: Project) => void;
}

export function ProjectModal({ project, isOpen, onClose, onSave, onAutoSave }: ProjectModalProps) {
  const { toast } = useToast();
  const [formMode, setFormMode] = useState<"onboard" | "all">("onboard");
  const [onboardStep, setOnboardStep] = useState(0);
  const [formData, setFormData] = useState({
    name: "",
    client: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    websiteUrl: "",
    commentingToolUrl: "",
    status: "planning" as Project["status"],
    stage: "rough_draft" as Project["stage"],
    progress: 0,
    budget: "",
    spent: "",
    deposit: "",
    startDate: "",
    deadline: "",
  });
  const ctaButtonClass =
    "text-white bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400 hover:brightness-110 hover:shadow-lg hover:shadow-blue-500/30 transition-all";
  const ctaButtonDisabledClass =
    "disabled:bg-muted disabled:text-muted-foreground disabled:from-transparent disabled:via-transparent disabled:to-transparent disabled:shadow-none disabled:hover:brightness-100";

  useEffect(() => {
    if (!isOpen) return;
    setFormMode(project ? "all" : "onboard");
    setOnboardStep(0);
  }, [isOpen, project?.id]);

  useEffect(() => {
    if (!isOpen) return;
    if (project) {
      setFormData({
        name: project.name,
        client: project.client,
        contactName: project.contactName ?? "",
        contactEmail: project.contactEmail ?? "",
        contactPhone: formatPhoneNumber(project.contactPhone ?? ""),
        websiteUrl: project.websiteUrl ?? "",
        commentingToolUrl: project.commentingToolUrl ?? "",
        status: project.status,
        stage: normalizeProjectStage(project.stage, project.progress),
        progress: STAGE_TO_PROGRESS[normalizeProjectStage(project.stage, project.progress)],
        budget: normalizeMoneyInput(project.budget),
        spent: normalizeMoneyInput(project.spent),
        deposit: normalizeMoneyInput(project.deposit),
        startDate: project.startDate,
        deadline: project.deadline,
      });
    } else {
      setFormData({
        name: "",
        client: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        websiteUrl: "",
        commentingToolUrl: "",
        status: "planning" as Project["status"],
        stage: "rough_draft" as Project["stage"],
        progress: 0,
        budget: "",
        spent: "",
        deposit: "",
        startDate: "",
        deadline: "",
      });
    }
  }, [isOpen, project]);

  const handleSave = () => {
    const normalizedName = toSmartTitleCase(formData.name);
    const normalizedClient = toSmartTitleCase(formData.client);
    if (!normalizedName || !normalizedClient) {
      toast({
        title: "Missing Information",
        description: "Please fill in project name and client",
        variant: "destructive",
      });
      return;
    }

    const savedProject: Project = {
      id: project?.id || Date.now(),
      name: normalizedName,
      client: normalizedClient,
      contactName: toSmartTitleCase(formData.contactName),
      contactEmail: formData.contactEmail.trim().toLowerCase(),
      contactPhone: formatPhoneNumber(formData.contactPhone),
      websiteUrl: sanitizeWebsiteInput(formData.websiteUrl),
      commentingToolUrl: sanitizeWebsiteInput(formData.commentingToolUrl),
      status: formData.status,
      stage: formData.stage,
      progress: STAGE_TO_PROGRESS[formData.stage],
      budget: formData.budget,
      spent: formData.spent,
      deposit: formData.deposit,
      startDate: formData.startDate,
      deadline: formData.deadline,
      team: project?.team ?? [],
      tasks: {
        total: project?.tasks.total ?? 0,
        completed: project?.tasks.completed ?? 0,
      },
    };

    onSave(savedProject);
    toast({
      title: "Project Saved",
      description: `${normalizedName} has been ${project ? "updated" : "created"} successfully`,
    });
  };

  useEffect(() => {
    if (!isOpen || !project || !onAutoSave) return;
    const normalizedName = toSmartTitleCase(formData.name);
    const normalizedClient = toSmartTitleCase(formData.client);
    if (!normalizedName || !normalizedClient) return;

    const timeout = window.setTimeout(() => {
      onAutoSave({
        id: project.id,
        name: normalizedName,
        client: normalizedClient,
        contactName: toSmartTitleCase(formData.contactName),
        contactEmail: formData.contactEmail.trim().toLowerCase(),
        contactPhone: formatPhoneNumber(formData.contactPhone),
        websiteUrl: sanitizeWebsiteInput(formData.websiteUrl),
        commentingToolUrl: sanitizeWebsiteInput(formData.commentingToolUrl),
        status: formData.status,
        stage: formData.stage,
        progress: STAGE_TO_PROGRESS[formData.stage],
        budget: formData.budget,
        spent: formData.spent,
        deposit: formData.deposit,
        startDate: formData.startDate,
        deadline: formData.deadline,
        team: project.team ?? [],
        tasks: project.tasks ?? { total: 0, completed: 0 },
      });
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [isOpen, project, onAutoSave, formData]);

  const onboardingSteps = ["Project Basics", "Contact Info", "Status & Stage", "Fee, MRR & Deposit", "Timeline", "Links"] as const;
  const canAdvanceOnboardStep = () => {
    if (onboardStep === 0) return formData.name.trim().length > 0 && formData.client.trim().length > 0;
    return true;
  };
  const activeStageIndex = STAGE_SEQUENCE.findIndex((stage) => stage.key === formData.stage);
  const renderStageMilestoneMap = () => (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Phase Map</Label>
      <div className="rounded-xl border border-border/60 bg-background/55 p-3">
        <div className="flex items-center">
          {STAGE_SEQUENCE.map((stage, index) => {
            const isComplete = index <= activeStageIndex;
            const isCurrent = index === activeStageIndex;
            return (
              <div key={stage.key} className="flex min-w-0 flex-1 items-center">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={`h-3.5 w-3.5 rounded-full border transition-all ${
                      isComplete
                        ? "border-cyan-300 bg-cyan-300 shadow-[0_0_10px_hsl(195_100%_70%/.65)]"
                        : "border-border bg-transparent"
                    } ${isCurrent ? "ring-2 ring-cyan-300/45" : ""}`}
                  />
                  <span
                    className={`text-[10px] leading-tight text-center ${
                      isComplete ? "text-foreground font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
                {index < STAGE_SEQUENCE.length - 1 ? (
                  <span
                    className={`mx-2 h-[2px] flex-1 rounded-full transition-all ${
                      index < activeStageIndex ? "bg-cyan-300/80" : "bg-border/70"
                    }`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="development-readable-scope form-dialog-shell sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            {project ? "Edit Project" : "Create New Project"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4 relative">
          <div className="absolute right-0 top-0 z-10">
            <Tabs value={formMode} onValueChange={(value) => setFormMode(value as "onboard" | "all")}>
              <TabsList className="form-mode-tabs">
                <TabsTrigger value="onboard" className="h-6 rounded-full px-3 text-[11px] font-semibold">Guided</TabsTrigger>
                <TabsTrigger value="all" className="h-6 rounded-full px-3 text-[11px] font-semibold">Full Form</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {formMode === "onboard" ? (
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
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="project-name" className="text-sm font-semibold">Project Name</Label>
                    <Input
                      id="project-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: toSmartTitleCaseLive(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, name: toSmartTitleCase(e.target.value) })}
                      className="bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client" className="text-sm font-semibold">Client Name</Label>
                    <Input
                      id="client"
                      value={formData.client}
                      onChange={(e) => setFormData({ ...formData, client: toSmartTitleCaseLive(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, client: toSmartTitleCase(e.target.value) })}
                      className="bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              )}
              {onboardStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact-name" className="text-sm font-semibold">Contact Name</Label>
                    <Input
                      id="contact-name"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: toSmartTitleCaseLive(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, contactName: toSmartTitleCase(e.target.value) })}
                      className="bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contact-email" className="text-sm font-semibold">Contact Email</Label>
                      <Input
                        id="contact-email"
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                        onBlur={(e) => setFormData({ ...formData, contactEmail: e.target.value.trim().toLowerCase() })}
                        className="bg-background border-border focus:border-primary transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-phone" className="text-sm font-semibold">Contact Phone</Label>
                      <Input
                        id="contact-phone"
                        value={formData.contactPhone}
                        onChange={(e) => setFormData({ ...formData, contactPhone: formatPhoneNumber(e.target.value) })}
                        onBlur={(e) => setFormData({ ...formData, contactPhone: formatPhoneNumber(e.target.value) })}
                        className="bg-background border-border focus:border-primary transition-colors"
                      />
                    </div>
                  </div>
                </div>
              )}
              {onboardStep === 2 && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-sm font-semibold">Status</Label>
                    <Select value={formData.status} onValueChange={(value: Project["status"]) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="review">In Review</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stage" className="text-sm font-semibold">Stage</Label>
                    <Select value={formData.stage} onValueChange={(value: Project["stage"]) => setFormData({ ...formData, stage: value, progress: STAGE_TO_PROGRESS[value] })}>
                      <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rough_draft">Rough Draft</SelectItem>
                        <SelectItem value="final_draft">Final Draft</SelectItem>
                        <SelectItem value="retrieve_info">Retrieval</SelectItem>
                        <SelectItem value="finalize">Finalize</SelectItem>
                        <SelectItem value="launch">Launch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="text-sm font-semibold">Auto Progress (%)</Label>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                      {STAGE_TO_PROGRESS[formData.stage]}%
                    </div>
                  </div>
                  <div className="col-span-2">
                    {renderStageMilestoneMap()}
                  </div>
                </div>
              )}
              {onboardStep === 3 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="budget" className="text-sm font-semibold">Fee</Label>
                    <Input
                      id="budget"
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: normalizeMoneyInput(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, budget: normalizeMoneyInput(e.target.value) })}
                      inputMode="decimal"
                      className="bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="spent" className="text-sm font-semibold">MRR</Label>
                    <Input
                      id="spent"
                      value={formData.spent}
                      onChange={(e) => setFormData({ ...formData, spent: normalizeMoneyInput(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, spent: normalizeMoneyInput(e.target.value) })}
                      inputMode="decimal"
                      className="bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deposit" className="text-sm font-semibold">Deposit</Label>
                    <Input
                      id="deposit"
                      value={formData.deposit}
                      onChange={(e) => setFormData({ ...formData, deposit: normalizeMoneyInput(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, deposit: normalizeMoneyInput(e.target.value) })}
                      inputMode="decimal"
                      className="bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              )}
              {onboardStep === 4 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startDate" className="text-sm font-semibold">Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="startDate"
                            type="button"
                            variant="outline"
                            className="h-10 w-full justify-between rounded-xl bg-background/70 px-3 text-left font-medium"
                          >
                            <span>{formData.startDate ? formatDateWritten(formData.startDate) : "Select start date"}</span>
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-auto rounded-2xl border border-white/45 bg-[linear-gradient(180deg,hsl(0_0%_100%/.92),hsl(0_0%_100%/.78))] p-2 shadow-[inset_0_1px_0_hsl(0_0%_100%/.88)] backdrop-blur-xl dark:border-white/18 dark:bg-[linear-gradient(180deg,hsl(220_30%_22%/.9),hsl(221_32%_15%/.84))]"
                        >
                          <Calendar
                            mode="single"
                            selected={parseDateKey(formData.startDate)}
                            onSelect={(date) => date && setFormData({ ...formData, startDate: toDateKey(date) })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deadline" className="text-sm font-semibold">Deadline</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="deadline"
                            type="button"
                            variant="outline"
                            className="h-10 w-full justify-between rounded-xl bg-background/70 px-3 text-left font-medium"
                          >
                            <span>{formData.deadline ? formatDateWritten(formData.deadline) : "Select deadline"}</span>
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-auto rounded-2xl border border-white/45 bg-[linear-gradient(180deg,hsl(0_0%_100%/.92),hsl(0_0%_100%/.78))] p-2 shadow-[inset_0_1px_0_hsl(0_0%_100%/.88)] backdrop-blur-xl dark:border-white/18 dark:bg-[linear-gradient(180deg,hsl(220_30%_22%/.9),hsl(221_32%_15%/.84))]"
                        >
                          <Calendar
                            mode="single"
                            selected={parseDateKey(formData.deadline)}
                            onSelect={(date) => date && setFormData({ ...formData, deadline: toDateKey(date) })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </div>
              )}
              {onboardStep === 5 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="website-url" className="text-sm font-semibold">Website</Label>
                    <Input
                      id="website-url"
                      type="url"
                      value={formData.websiteUrl}
                      onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                      onBlur={(e) => setFormData({ ...formData, websiteUrl: sanitizeWebsiteInput(e.target.value) })}
                      className="bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="commenting-tool-url" className="text-sm font-semibold">Commenting Tool</Label>
                    <Input
                      id="commenting-tool-url"
                      type="url"
                      value={formData.commentingToolUrl}
                      onChange={(e) => setFormData({ ...formData, commentingToolUrl: e.target.value })}
                      onBlur={(e) => setFormData({ ...formData, commentingToolUrl: sanitizeWebsiteInput(e.target.value) })}
                      className="bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              )}

              <div className="mt-5 flex items-center justify-between">
                <Button variant="outline" onClick={() => setOnboardStep((step) => Math.max(0, step - 1))} disabled={onboardStep === 0}>
                  Back
                </Button>
                {onboardStep < onboardingSteps.length - 1 ? (
                  <Button
                    className={`${ctaButtonClass} ${ctaButtonDisabledClass}`}
                    onClick={() => setOnboardStep((step) => Math.min(onboardingSteps.length - 1, step + 1))}
                    disabled={!canAdvanceOnboardStep()}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    onClick={handleSave}
                    className={`${ctaButtonClass} ${ctaButtonDisabledClass}`}
                    disabled={!formData.name || !formData.client}
                  >
                    {project ? "Update Project" : "Create Project"}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="form-surface p-5">
              <div className="space-y-4">
                <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                  <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">PROJECT / CLIENT</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      id="project-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: toSmartTitleCaseLive(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, name: toSmartTitleCase(e.target.value) })}
                      placeholder="Project Name"
                      className="h-11"
                    />
                    <Input
                      id="client"
                      value={formData.client}
                      onChange={(e) => setFormData({ ...formData, client: toSmartTitleCaseLive(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, client: toSmartTitleCase(e.target.value) })}
                      placeholder="Client Name"
                      className="h-11"
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                  <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">CONTACT INFO</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input
                      id="contact-name-full"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: toSmartTitleCaseLive(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, contactName: toSmartTitleCase(e.target.value) })}
                      placeholder="Contact Name"
                      className="h-11"
                    />
                    <Input
                      id="contact-email-full"
                      type="email"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                      onBlur={(e) => setFormData({ ...formData, contactEmail: e.target.value.trim().toLowerCase() })}
                      placeholder="Contact Email"
                      className="h-11"
                    />
                    <Input
                      id="contact-phone-full"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: formatPhoneNumber(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, contactPhone: formatPhoneNumber(e.target.value) })}
                      placeholder="Contact Phone"
                      className="h-11"
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                  <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">STATUS + STAGE</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Select
                      value={formData.status}
                      onValueChange={(value: Project["status"]) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger className="h-11 bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="review">In Review</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={formData.stage}
                      onValueChange={(value: Project["stage"]) => setFormData({ ...formData, stage: value, progress: STAGE_TO_PROGRESS[value] })}
                    >
                      <SelectTrigger className="h-11 bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rough_draft">Rough Draft</SelectItem>
                        <SelectItem value="final_draft">Final Draft</SelectItem>
                        <SelectItem value="retrieve_info">Retrieval</SelectItem>
                        <SelectItem value="finalize">Finalize</SelectItem>
                        <SelectItem value="launch">Launch</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="md:col-span-2 space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Auto Progress (%)</p>
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                        {STAGE_TO_PROGRESS[formData.stage]}%
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      {renderStageMilestoneMap()}
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                  <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">FINANCIAL</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input
                      id="budget"
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: normalizeMoneyInput(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, budget: normalizeMoneyInput(e.target.value) })}
                      inputMode="decimal"
                      placeholder="Fee"
                      className="h-11"
                    />
                    <Input
                      id="spent"
                      value={formData.spent}
                      onChange={(e) => setFormData({ ...formData, spent: normalizeMoneyInput(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, spent: normalizeMoneyInput(e.target.value) })}
                      inputMode="decimal"
                      placeholder="MRR"
                      className="h-11"
                    />
                    <Input
                      id="deposit"
                      value={formData.deposit}
                      onChange={(e) => setFormData({ ...formData, deposit: normalizeMoneyInput(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, deposit: normalizeMoneyInput(e.target.value) })}
                      inputMode="decimal"
                      placeholder="Deposit"
                      className="h-11"
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                  <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">TIMELINE</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Start Date</p>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="startDate"
                            type="button"
                            variant="outline"
                            className="h-11 w-full justify-between rounded-xl bg-background/70 px-3 text-left font-medium"
                          >
                            <span>{formData.startDate ? formatDateWritten(formData.startDate) : "Select start date"}</span>
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-auto rounded-2xl border border-white/45 bg-[linear-gradient(180deg,hsl(0_0%_100%/.92),hsl(0_0%_100%/.78))] p-2 shadow-[inset_0_1px_0_hsl(0_0%_100%/.88)] backdrop-blur-xl dark:border-white/18 dark:bg-[linear-gradient(180deg,hsl(220_30%_22%/.9),hsl(221_32%_15%/.84))]"
                        >
                          <Calendar
                            mode="single"
                            selected={parseDateKey(formData.startDate)}
                            onSelect={(date) => date && setFormData({ ...formData, startDate: toDateKey(date) })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">Deadline</p>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            id="deadline"
                            type="button"
                            variant="outline"
                            className="h-11 w-full justify-between rounded-xl bg-background/70 px-3 text-left font-medium"
                          >
                            <span>{formData.deadline ? formatDateWritten(formData.deadline) : "Select deadline"}</span>
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-auto rounded-2xl border border-white/45 bg-[linear-gradient(180deg,hsl(0_0%_100%/.92),hsl(0_0%_100%/.78))] p-2 shadow-[inset_0_1px_0_hsl(0_0%_100%/.88)] backdrop-blur-xl dark:border-white/18 dark:bg-[linear-gradient(180deg,hsl(220_30%_22%/.9),hsl(221_32%_15%/.84))]"
                        >
                          <Calendar
                            mode="single"
                            selected={parseDateKey(formData.deadline)}
                            onSelect={(date) => date && setFormData({ ...formData, deadline: toDateKey(date) })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                  <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">LINKS</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      id="website-url-full"
                      type="url"
                      value={formData.websiteUrl}
                      onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                      onBlur={(e) => setFormData({ ...formData, websiteUrl: sanitizeWebsiteInput(e.target.value) })}
                      placeholder="Website"
                      className="h-11"
                    />
                    <Input
                      id="commenting-tool-url-full"
                      type="url"
                      value={formData.commentingToolUrl}
                      onChange={(e) => setFormData({ ...formData, commentingToolUrl: e.target.value })}
                      onBlur={(e) => setFormData({ ...formData, commentingToolUrl: sanitizeWebsiteInput(e.target.value) })}
                      placeholder="Commenting Tool"
                      className="h-11"
                    />
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className={`${ctaButtonClass} ${ctaButtonDisabledClass} hover:scale-105 duration-300`}
          >
            {project ? "Update Project" : "Create Project"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
