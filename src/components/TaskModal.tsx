import { useState, useEffect } from "react";
import { X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { toSmartTitleCase, toSmartTitleCaseLive } from "@/lib/text-format";

const TASK_DRAFT_KEY = "delphi_task_draft_v1";

interface Task {
  id: string;
  name: string;
  department: string;
  priority: "crucial" | "high" | "medium" | "low";
  status: "not-started" | "in-progress" | "complete";
  required: boolean;
  date: string;
  startTime: string;
  endTime: string;
}

interface TaskModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
}

export function TaskModal({ task, isOpen, onClose, onSave }: TaskModalProps) {
  const { toast } = useToast();
  const [formMode, setFormMode] = useState<"onboard" | "all">("onboard");
  const [onboardStep, setOnboardStep] = useState(0);
  const [clearNextTaskDraftLoad, setClearNextTaskDraftLoad] = useState(false);
  const getDefaultFormData = () => ({
    name: "",
    department: "",
    priority: "medium" as Task["priority"],
    status: "not-started" as Task["status"],
    required: false,
    date: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    endTime: "10:00",
    notes: "",
  });
  const [formData, setFormData] = useState({
    ...getDefaultFormData(),
  });

  useEffect(() => {
    if (!isOpen) return;
    setFormMode("onboard");
    setOnboardStep(0);

    if (task) {
      setFormData({
        name: task.name,
        department: task.department,
        priority: task.priority,
        status: task.status,
        required: task.required,
        date: task.date,
        startTime: task.startTime,
        endTime: task.endTime,
        notes: "",
      });
    } else {
      if (clearNextTaskDraftLoad) {
        localStorage.removeItem(TASK_DRAFT_KEY);
        setClearNextTaskDraftLoad(false);
        setFormData(getDefaultFormData());
        return;
      }
      try {
        const raw = localStorage.getItem(TASK_DRAFT_KEY);
        if (!raw) {
          setFormData(getDefaultFormData());
          return;
        }
        const parsed = JSON.parse(raw) as Partial<typeof formData>;
        setFormData({
          ...getDefaultFormData(),
          ...parsed,
        });
      } catch {
        setFormData(getDefaultFormData());
      }
    }
  }, [task, isOpen, clearNextTaskDraftLoad]);

  useEffect(() => {
    if (!isOpen || task) return;

    const hasContent = Boolean(
      formData.name.trim() ||
        formData.department.trim() ||
        formData.notes.trim() ||
        formData.priority !== "medium" ||
        formData.status !== "not-started" ||
        formData.required
    );

    if (!hasContent) {
      localStorage.removeItem(TASK_DRAFT_KEY);
      return;
    }

    localStorage.setItem(TASK_DRAFT_KEY, JSON.stringify(formData));
  }, [formData, isOpen, task]);

  const handleSave = () => {
    const normalizedName = toSmartTitleCase(formData.name);
    const normalizedDepartment = toSmartTitleCase(formData.department);

    if (!normalizedName || !normalizedDepartment || !formData.date || !formData.startTime || !formData.endTime) {
      toast({
        title: "Missing Information",
        description: "Please fill in task name, department, date, and time",
        variant: "destructive",
      });
      return;
    }

    if (formData.endTime <= formData.startTime) {
      toast({
        title: "Invalid Time Range",
        description: "End time must be later than start time",
        variant: "destructive",
      });
      return;
    }

    const savedTask: Task = {
      id: task?.id || `task-${Date.now()}`,
      name: normalizedName,
      department: normalizedDepartment,
      priority: formData.priority,
      status: formData.status,
      required: formData.required,
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
    };

    onSave(savedTask);
    localStorage.removeItem(TASK_DRAFT_KEY);
    setClearNextTaskDraftLoad(true);
    toast({
      title: "Task Saved",
      description: `${normalizedName} has been ${task ? "updated" : "created"} successfully`,
    });
  };

  const onboardingSteps = ["Task Name", "Department", "Priority & Status", "Date & Time", "Notes"] as const;

  const canAdvanceOnboardStep = () => {
    if (onboardStep === 0) return formData.name.trim().length > 0;
    if (onboardStep === 1) return formData.department.trim().length > 0;
    if (onboardStep === 3) {
      if (!formData.date || !formData.startTime || !formData.endTime) return false;
      return formData.endTime > formData.startTime;
    }
    return true;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="form-dialog-shell sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            {task ? "Edit Task" : "Create New Task"}
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
                <Input
                  id="task-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: toSmartTitleCaseLive(e.target.value) })}
                  onBlur={(e) => setFormData({ ...formData, name: toSmartTitleCase(e.target.value) })}
                  className="bg-background border-border focus:border-primary transition-colors"
                />
              )}
              {onboardStep === 1 && (
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: toSmartTitleCaseLive(e.target.value) })}
                  onBlur={(e) => setFormData({ ...formData, department: toSmartTitleCase(e.target.value) })}
                  className="bg-background border-border focus:border-primary transition-colors"
                />
              )}
              {onboardStep === 2 && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="priority" className="text-sm font-semibold">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: Task["priority"]) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="crucial">CRUCIAL</SelectItem>
                        <SelectItem value="high">HIGH</SelectItem>
                        <SelectItem value="medium">MEDIUM</SelectItem>
                        <SelectItem value="low">LOW</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Core Matter</Label>
                    <label className="flex h-10 items-center gap-3 rounded-xl border border-border bg-background px-3">
                      <Checkbox
                        checked={formData.required}
                        onCheckedChange={(checked) => setFormData({ ...formData, required: checked === true })}
                      />
                      <span className="text-sm text-foreground">Show in Core Matter</span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-sm font-semibold">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: Task["status"]) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-started">Not Started</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="complete">Complete</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {onboardStep === 3 && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date" className="text-sm font-semibold">Date</Label>
                    <DatePickerField
                      id="date"
                      value={formData.date}
                      onChange={(value) => setFormData({ ...formData, date: value })}
                      triggerClassName="bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startTime" className="text-sm font-semibold">Start</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime" className="text-sm font-semibold">End</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                </div>
              )}
              {onboardStep === 4 && (
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="bg-background border-border focus:border-primary transition-colors min-h-[120px] resize-none"
                />
              )}

              <div className="mt-5 flex items-center justify-between">
                <Button variant="outline" onClick={() => setOnboardStep((step) => Math.max(0, step - 1))} disabled={onboardStep === 0}>
                  Back
                </Button>
                {onboardStep < onboardingSteps.length - 1 ? (
                  <Button
                    className="bg-gradient-to-r from-primary to-primary-glow hover:shadow-lg hover:shadow-primary/30"
                    onClick={() => setOnboardStep((step) => Math.min(onboardingSteps.length - 1, step + 1))}
                    disabled={!canAdvanceOnboardStep()}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    onClick={handleSave}
                    className="bg-gradient-to-r from-primary to-primary-glow hover:shadow-lg hover:shadow-primary/30"
                    disabled={!formData.name || !formData.department}
                  >
                    {task ? "Update Task" : "Create Task"}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="form-surface p-5">
              <div className="space-y-4">
                <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                  <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">TASK BASICS</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input
                      id="task-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: toSmartTitleCaseLive(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, name: toSmartTitleCase(e.target.value) })}
                      placeholder="Task Name"
                      className="h-11"
                    />
                    <Input
                      id="department"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: toSmartTitleCaseLive(e.target.value) })}
                      onBlur={(e) => setFormData({ ...formData, department: toSmartTitleCase(e.target.value) })}
                      placeholder="Department"
                      className="h-11"
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                  <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">PRIORITY + STATUS</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Select
                      value={formData.priority}
                      onValueChange={(value: Task["priority"]) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger className="h-11 bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="crucial">CRUCIAL</SelectItem>
                        <SelectItem value="high">HIGH</SelectItem>
                        <SelectItem value="medium">MEDIUM</SelectItem>
                        <SelectItem value="low">LOW</SelectItem>
                      </SelectContent>
                    </Select>

                    <label className="flex h-11 items-center gap-3 rounded-xl border border-border bg-background px-3">
                      <Checkbox
                        checked={formData.required}
                        onCheckedChange={(checked) => setFormData({ ...formData, required: checked === true })}
                      />
                      <span className="text-sm text-foreground">Show in Core Matter</span>
                    </label>

                    <Select
                      value={formData.status}
                      onValueChange={(value: Task["status"]) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger className="h-11 bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-started">Not Started</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="complete">Complete</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </section>

                <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                  <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">SCHEDULE</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <DatePickerField
                      id="date"
                      value={formData.date}
                      onChange={(value) => setFormData({ ...formData, date: value })}
                      triggerClassName="h-11 bg-background border-border focus:border-primary transition-colors"
                    />
                    <Input
                      id="startTime"
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="h-11 bg-background border-border focus:border-primary transition-colors"
                    />
                    <Input
                      id="endTime"
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="h-11 bg-background border-border focus:border-primary transition-colors"
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-border/65 bg-card/55 p-4">
                  <p className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground">NOTES</p>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="min-h-[100px] resize-none"
                    placeholder="Notes"
                  />
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
            className="bg-gradient-to-r from-primary to-primary-glow hover:shadow-lg hover:shadow-primary/30 hover:scale-105 transition-all duration-300"
          >
            {task ? "Update Task" : "Create Task"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
