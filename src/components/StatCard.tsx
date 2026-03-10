import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
}

export function StatCard({ title, value, change, changeType = "neutral", icon: Icon, iconColor = "text-primary" }: StatCardProps) {
  return (
    <Card className="glass-hero-panel group relative overflow-hidden p-6 transition-all duration-300 hover:scale-[1.02] animate-fade-in-up">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-white/10 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-base font-medium text-[hsl(220_38%_52%)] dark:text-muted-foreground">{title}</p>
          <p className="text-4xl font-bold text-foreground transition-transform duration-300 group-hover:scale-[1.04]">{value}</p>
          {change && (
            <p className={cn(
              "text-base font-medium transition-all",
              changeType === "positive" && "text-[hsl(220_38%_50%)] dark:text-success",
              changeType === "negative" && "text-destructive",
              changeType === "neutral" && "text-[hsl(220_30%_54%)] dark:text-muted-foreground"
            )}>
              {change}
            </p>
          )}
        </div>
        <div className={cn("rounded-full border border-white/30 bg-white/20 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition-all duration-300 group-hover:bg-primary/10 group-hover:scale-105 dark:border-white/10 dark:bg-white/5", iconColor)}>
          <Icon className="h-7 w-7 transition-transform duration-300 group-hover:rotate-12" />
        </div>
      </div>
    </Card>
  );
}
