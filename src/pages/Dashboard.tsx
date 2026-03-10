import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, CreditCard, AlertCircle, TrendingUp } from "lucide-react";
import { formatDateWritten } from "@/lib/date-format";

const subscriptions = [
  { id: 1, client: "TechCorp Solutions", plan: "Enterprise", mrr: "$2,499", status: "active", nextBilling: "2025-12-15" },
  { id: 2, client: "StartupHub", plan: "Pro", mrr: "$999", status: "active", nextBilling: "2025-12-20" },
  { id: 3, client: "Digital Ventures", plan: "Business", mrr: "$1,499", status: "active", nextBilling: "2025-12-18" },
  { id: 4, client: "CloudNine Inc", plan: "Enterprise", mrr: "$2,499", status: "payment_issue", nextBilling: "2025-11-30" },
  { id: 5, client: "Northgate Dental", plan: "Growth", mrr: "$1,800", status: "active", nextBilling: "2026-03-07" },
  { id: 6, client: "Harbor Property", plan: "Enterprise", mrr: "$2,750", status: "active", nextBilling: "2026-03-11" },
  { id: 7, client: "Summit Law", plan: "Pro", mrr: "$1,300", status: "active", nextBilling: "2026-03-09" },
  { id: 8, client: "Lumina Education", plan: "Business", mrr: "$1,450", status: "payment_issue", nextBilling: "2026-03-06" },
  { id: 9, client: "Forge Manufacturing", plan: "Pro", mrr: "$1,200", status: "active", nextBilling: "2026-03-08" },
  { id: 10, client: "Astra Labs", plan: "Enterprise", mrr: "$2,950", status: "active", nextBilling: "2026-03-10" },
];

const recentProjects = [
  { id: 1, name: "E-commerce Redesign", client: "TechCorp", status: "in_progress", progress: 75 },
  { id: 2, name: "Marketing Website", client: "StartupHub", status: "in_progress", progress: 45 },
  { id: 3, name: "Mobile App Landing", client: "Digital Ventures", status: "review", progress: 90 },
  { id: 4, name: "Dental Conversion Funnel", client: "Northgate Dental", status: "in_progress", progress: 62 },
  { id: 5, name: "Pricing Page Rebuild", client: "SignalFlow", status: "review", progress: 88 },
  { id: 6, name: "Lead Capture Suite", client: "Harbor Property", status: "in_progress", progress: 33 },
  { id: 7, name: "Member Portal Refresh", client: "Blue Summit Legal", status: "in_progress", progress: 54 },
];

export default function Dashboard() {
  return (
    <div className="app-atmosphere-page app-light-page min-h-screen relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute top-20 right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 left-20 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      
      <div className="app-light-frame relative space-y-8">
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="app-light-title">Dashboard</h1>
            <p className="app-light-subtitle">Welcome back! Here's your business overview.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Active Subscriptions"
            value="37"
            change="+5 this month"
            changeType="positive"
            icon={Users}
          />
          <StatCard
            title="Monthly Revenue"
            value="$68,920"
            change="+16.2% from last month"
            changeType="positive"
            icon={TrendingUp}
          />
          <StatCard
            title="Payment Issues"
            value="3"
            change="Needs attention"
            changeType="negative"
            icon={AlertCircle}
            iconColor="text-destructive"
          />
          <StatCard
            title="Active Projects"
            value="14"
            change="5 completing this week"
            changeType="neutral"
            icon={CreditCard}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 animate-fade-in-up hover:shadow-xl transition-all duration-300 bg-card/80 backdrop-blur-sm" style={{ animationDelay: '0.2s' }}>
            <h2 className="text-xl font-semibold mb-4 text-foreground">Subscription Overview</h2>
            <div className="space-y-3">
              {subscriptions.map((sub, index) => (
                <div
                  key={sub.id}
                  className="group liquid-cyan-hover flex items-center justify-between p-4 rounded-lg border border-border bg-card transition-all duration-300 hover:scale-[1.02] cursor-pointer animate-fade-in-up"
                  style={{ animationDelay: `${0.3 + index * 0.1}s` }}
                >
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{sub.client}</p>
                  <p className="text-sm text-muted-foreground">{sub.plan} Plan</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-semibold text-foreground">{sub.mrr}</p>
                    <p className="text-xs text-muted-foreground">Next: {formatDateWritten(sub.nextBilling)}</p>
                  </div>
                  <Badge
                    variant={sub.status === "active" ? "default" : "destructive"}
                  >
                    {sub.status === "active" ? "Active" : "Payment Issue"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

          <Card className="p-6 animate-fade-in-up hover:shadow-xl transition-all duration-300 bg-card/80 backdrop-blur-sm" style={{ animationDelay: '0.4s' }}>
            <h2 className="text-xl font-semibold mb-4 text-foreground">Recent Projects</h2>
            <div className="space-y-4">
              {recentProjects.map((project, index) => (
                <div key={project.id} className="liquid-cyan-hover space-y-2 p-4 rounded-lg border border-transparent transition-all duration-300 cursor-pointer animate-fade-in-up" style={{ animationDelay: `${0.5 + index * 0.1}s` }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{project.name}</p>
                    <p className="text-sm text-muted-foreground">{project.client}</p>
                  </div>
                  <Badge variant={project.status === "review" ? "secondary" : "outline"}>
                    {project.status === "in_progress" ? "In Progress" : "In Review"}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium text-foreground">{project.progress}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-primary to-primary-glow h-2 rounded-full transition-all duration-500 hover:shadow-glow"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
