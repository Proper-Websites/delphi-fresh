import { useState } from "react";
import { Plus, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskModal } from "@/components/TaskModal";

interface Task {
  id: string;
  name: string;
  department: string;
  priority: "high" | "medium" | "low";
  status: "not-started" | "in-progress" | "complete";
  date?: string;
}

const mockTasks: { next: Task[]; later: Task[]; noDate: Task[] } = {
  next: [
    { id: "1", name: "Redesign Homepage", department: "Development", priority: "high", status: "in-progress", date: "Nov 15" },
    { id: "2", name: "Client Presentation", department: "Sales", priority: "medium", status: "not-started", date: "Nov 18" },
    { id: "3", name: "API Integration", department: "Development", priority: "high", status: "in-progress", date: "Nov 20" },
    { id: "10", name: "Contract Follow-up", department: "Sales", priority: "high", status: "in-progress", date: "Nov 21" },
    { id: "11", name: "Retainer Handoff", department: "Subscriptions", priority: "medium", status: "not-started", date: "Nov 22" },
    { id: "12", name: "Analytics Setup", department: "Development", priority: "medium", status: "not-started", date: "Nov 23" },
  ],
  later: [
    { id: "4", name: "Marketing Campaign", department: "Marketing", priority: "low", status: "not-started", date: "Dec 1" },
    { id: "5", name: "Database Migration", department: "Development", priority: "medium", status: "not-started", date: "Dec 5" },
    { id: "6", name: "Team Workshop", department: "HR", priority: "low", status: "not-started", date: "Dec 10" },
    { id: "13", name: "Invoice Automation", department: "Admin", priority: "high", status: "not-started", date: "Dec 12" },
    { id: "14", name: "Client NPS Survey", department: "Subscriptions", priority: "low", status: "not-started", date: "Dec 14" },
    { id: "15", name: "Case Study Draft", department: "Sales", priority: "medium", status: "not-started", date: "Dec 16" },
  ],
  noDate: [
    { id: "7", name: "Documentation Update", department: "Development", priority: "low", status: "not-started" },
    { id: "8", name: "Brand Guidelines", department: "Marketing", priority: "medium", status: "not-started" },
    { id: "9", name: "Security Audit", department: "Development", priority: "high", status: "not-started" },
    { id: "16", name: "Tooling Cleanup", department: "Development", priority: "low", status: "not-started" },
    { id: "17", name: "Onboarding SOP Update", department: "Admin", priority: "medium", status: "not-started" },
    { id: "18", name: "Upsell Sequence", department: "Sales", priority: "high", status: "not-started" },
  ],
};

export default function RoadMap() {
  const [activeView, setActiveView] = useState<"list" | "calendar" | "timeline">("list");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getPriorityColor = (priority: Task["priority"]) => {
    switch (priority) {
      case "high": return "bg-destructive/10 text-destructive border-destructive/20";
      case "medium": return "bg-warning/10 text-warning border-warning/20";
      case "low": return "bg-success/10 text-success border-success/20";
    }
  };

  const getPriorityIcon = (priority: Task["priority"]) => {
    const colors = {
      high: "text-destructive",
      medium: "text-warning",
      low: "text-success",
    };
    return <Circle className={`h-3 w-3 fill-current ${colors[priority]}`} />;
  };

  const getStatusStyle = (status: Task["status"]) => {
    switch (status) {
      case "complete": return "border-success text-success";
      case "in-progress": return "border-primary text-primary";
      case "not-started": return "border-muted-foreground/40 text-muted-foreground";
    }
  };

  const getStatusText = (status: Task["status"]) => {
    switch (status) {
      case "complete": return "Complete";
      case "in-progress": return "In Progress";
      case "not-started": return "Not Started";
    }
  };

  const TaskCard = ({ task }: { task: Task }) => (
    <div
      onClick={() => {
        setSelectedTask(task);
        setIsModalOpen(true);
      }}
      className="group liquid-cyan-hover bg-card/60 backdrop-blur-sm border border-border rounded-lg p-4 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-pointer animate-fade-in-up"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex items-center gap-2">
            {getPriorityIcon(task.priority)}
          </div>
          <div className="flex-1">
            <span className="font-medium text-foreground group-hover:text-primary transition-colors">
              {task.name}
            </span>
            <span className="text-muted-foreground ml-2">- {task.department}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className={`${getStatusStyle(task.status)} font-medium`}>
            {getStatusText(task.status)}
          </Badge>
          {task.date && (
            <span className="text-sm text-muted-foreground min-w-[60px] text-right">{task.date}</span>
          )}
        </div>
      </div>
    </div>
  );

  const TaskSection = ({ title, tasks, delay = 0 }: { title: string; tasks: Task[]; delay?: number }) => (
    <div className="mb-8 animate-fade-in-up" style={{ animationDelay: `${delay}s` }}>
      <h3 className="text-lg font-semibold text-primary mb-4">{title}</h3>
      <div className="space-y-3">
        {tasks.map((task, index) => (
          <div key={task.id} className="animate-fade-in-up" style={{ animationDelay: `${delay + index * 0.05}s` }}>
            <TaskCard task={task} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30 animate-float"></div>
      <div className="absolute top-20 -right-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-float"></div>
      <div className="absolute bottom-20 -left-20 w-96 h-96 bg-primary-glow/5 rounded-full blur-3xl animate-float" style={{ animationDelay: "2s" }}></div>

      <div className="relative z-10 p-8">
        {/* Header */}
        <div className="mb-8 animate-fade-in-up">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                Road Map
              </h1>
              <p className="text-muted-foreground mt-1">Plan, prioritize, and track upcoming work</p>
            </div>
            <Button 
              onClick={() => {
                setSelectedTask(null);
                setIsModalOpen(true);
              }}
              className="bg-gradient-to-r from-primary to-primary-glow hover:shadow-lg hover:shadow-primary/30 hover:scale-105 transition-all duration-300"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </div>
        </div>

        {/* Tabs and Priority Bar */}
        <div className="mb-8 flex items-center justify-between animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
          <div className="flex gap-2">
            {[
              { id: "list", label: "List View" },
              { id: "calendar", label: "Calendar View" },
              { id: "timeline", label: "Timeline View" },
            ].map((view) => (
              <Button
                key={view.id}
                onClick={() => setActiveView(view.id as any)}
                variant={activeView === view.id ? "default" : "outline"}
                className={
                  activeView === view.id
                    ? "bg-gradient-to-r from-primary to-primary-glow shadow-lg shadow-primary/30"
                    : "hover:bg-accent hover:scale-105"
                }
              >
                {view.label}
              </Button>
            ))}
          </div>

          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground mr-2">Priority:</span>
            <Badge className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20">
              <Circle className="h-3 w-3 fill-current mr-1" />
              High
            </Badge>
            <Badge className="bg-warning/10 text-warning border-warning/20 hover:bg-warning/20">
              <Circle className="h-3 w-3 fill-current mr-1" />
              Medium
            </Badge>
            <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/20">
              <Circle className="h-3 w-3 fill-current mr-1" />
              Low
            </Badge>
          </div>
        </div>

        {/* Task Sections */}
        <div className="max-w-6xl">
          <TaskSection title="Next" tasks={mockTasks.next} delay={0.2} />
          <TaskSection title="Later" tasks={mockTasks.later} delay={0.3} />
          <TaskSection title="No Date" tasks={mockTasks.noDate} delay={0.4} />
        </div>
      </div>

      <TaskModal
        task={selectedTask}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTask(null);
        }}
        onSave={(updatedTask) => {
          console.log("Task saved:", updatedTask);
          setIsModalOpen(false);
          setSelectedTask(null);
        }}
      />
    </div>
  );
}
