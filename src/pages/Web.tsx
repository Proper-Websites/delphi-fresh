import { Card } from "@/components/ui/card";
import { ArrowRight, Users, Mail, FileText, CheckCircle, XCircle, DollarSign, Calendar } from "lucide-react";

const flowNodes = [
  {
    id: 1,
    stage: "Prospect",
    icon: Users,
    branches: [
      { label: "Cold Outreach", next: 2 },
      { label: "Referral", next: 3 },
      { label: "Inbound Lead", next: 3 },
    ],
  },
  {
    id: 2,
    stage: "Follow-up",
    icon: Mail,
    branches: [
      { label: "Interested", next: 3 },
      { label: "Not Interested", next: null },
      { label: "No Response", next: 2 },
    ],
  },
  {
    id: 3,
    stage: "Discovery Call",
    icon: Calendar,
    branches: [
      { label: "Good Fit", next: 4 },
      { label: "Not Ready", next: 2 },
      { label: "Wrong Fit", next: null },
    ],
  },
  {
    id: 4,
    stage: "Proposal",
    icon: FileText,
    branches: [
      { label: "Accepted", next: 5 },
      { label: "Negotiation", next: 4 },
      { label: "Declined", next: null },
    ],
  },
  {
    id: 5,
    stage: "Contract Signed",
    icon: CheckCircle,
    branches: [
      { label: "One-time Project", next: 6 },
      { label: "Retainer Client", next: 7 },
    ],
  },
  {
    id: 6,
    stage: "Project Delivery",
    icon: DollarSign,
    branches: [
      { label: "Completed", next: 8 },
      { label: "Revision Needed", next: 6 },
    ],
  },
  {
    id: 7,
    stage: "Ongoing Retainer",
    icon: DollarSign,
    branches: [
      { label: "Active", next: 7 },
      { label: "Renewal", next: 5 },
      { label: "Cancelled", next: null },
    ],
  },
  {
    id: 8,
    stage: "Final Payment",
    icon: CheckCircle,
    branches: [
      { label: "Paid", next: null },
      { label: "Follow-up", next: 8 },
    ],
  },
];

export default function Web() {
  return (
    <div className="app-atmosphere-page app-light-page min-h-screen relative overflow-hidden">
      <div className="absolute top-24 right-12 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-32 left-12 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      
      <div className="app-light-frame relative space-y-8">
        <div className="animate-fade-in-up">
          <h1 className="app-light-title">Business Flow Web</h1>
          <p className="app-light-subtitle">Visual map of the entire company journey from prospect to payment</p>
        </div>

        <div className="relative">
          <div className="flex overflow-x-auto pb-8 gap-8 snap-x snap-mandatory">
            {flowNodes.map((node, index) => {
              const Icon = node.icon;
              return (
                <div
                  key={node.id}
                  className="flex-shrink-0 snap-center animate-fade-in-up"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <Card className="w-72 p-6 bg-card/80 backdrop-blur-sm hover:shadow-xl transition-all duration-300 border-primary/20 liquid-cyan-hover">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 rounded-lg bg-gradient-to-br from-primary to-primary-glow">
                        <Icon className="h-6 w-6 text-primary-foreground" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{node.stage}</h3>
                        <p className="text-xs text-muted-foreground">Stage {node.id}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {node.branches.map((branch, idx) => (
                        <div
                          key={idx}
                          className="liquid-cyan-hover flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10 transition-all cursor-pointer group"
                        >
                          <span className="text-sm font-medium text-foreground">{branch.label}</span>
                          {branch.next ? (
                            <ArrowRight className="h-4 w-4 text-primary group-hover:translate-x-1 transition-transform" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>

                    {index < flowNodes.length - 1 && (
                      <div className="absolute -right-4 top-1/2 -translate-y-1/2 z-10">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg">
                          <ArrowRight className="h-5 w-5 text-primary-foreground" />
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>
        </div>

        <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
          <h2 className="text-xl font-semibold mb-4 text-foreground">Journey Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-card">
              <p className="text-2xl font-bold text-primary">8</p>
              <p className="text-sm text-muted-foreground">Total Stages</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-card">
              <p className="text-2xl font-bold text-primary">~20</p>
              <p className="text-sm text-muted-foreground">Decision Points</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-card">
              <p className="text-2xl font-bold text-primary">2</p>
              <p className="text-sm text-muted-foreground">Revenue Streams</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-card">
              <p className="text-2xl font-bold text-primary">65%</p>
              <p className="text-sm text-muted-foreground">Avg Conversion</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
