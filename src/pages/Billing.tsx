import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, TrendingDown, CreditCard, Calendar, MoreHorizontal, Trash2 } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { useLocalStorageState } from "@/hooks/use-local-storage";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDateWritten } from "@/lib/date-format";
import { formatMoney, parseMoney } from "@/lib/money";

interface RecurringExpense {
  id: number;
  name: string;
  category: string;
  amount: string;
  frequency: string;
  nextBilling: string;
  status: "active" | "cancelled";
}

interface OneTimeExpense {
  id: number;
  name: string;
  category: string;
  amount: string;
  date: string;
  vendor: string;
}

const initialRecurringExpenses: RecurringExpense[] = [
  { id: 1, name: "AWS Hosting", category: "Infrastructure", amount: "$450", frequency: "Monthly", nextBilling: "2026-03-08", status: "active" },
  { id: 2, name: "Figma Team Plan", category: "Design Tools", amount: "$45", frequency: "Monthly", nextBilling: "2026-03-05", status: "active" },
  { id: 3, name: "GitHub Team", category: "Development", amount: "$210", frequency: "Monthly", nextBilling: "2026-03-10", status: "active" },
  { id: 4, name: "Instantly.ai", category: "Sales", amount: "$97", frequency: "Monthly", nextBilling: "2026-03-04", status: "active" },
  { id: 5, name: "OpenAI API", category: "AI Tools", amount: "$320", frequency: "Monthly", nextBilling: "2026-03-12", status: "active" },
  { id: 6, name: "Cloudflare Pro", category: "Infrastructure", amount: "$25", frequency: "Monthly", nextBilling: "2026-03-09", status: "active" },
  { id: 7, name: "Notion Plus", category: "Operations", amount: "$96", frequency: "Monthly", nextBilling: "2026-03-06", status: "active" },
  { id: 8, name: "Slack", category: "Operations", amount: "$87", frequency: "Monthly", nextBilling: "2026-03-07", status: "cancelled" },
];

const initialOneTimeExpenses: OneTimeExpense[] = [
  { id: 1, name: "Domain Registration", category: "Services", amount: "$150", date: "2026-02-10", vendor: "Namecheap" },
  { id: 2, name: "Stock Photos License", category: "Assets", amount: "$199", date: "2026-02-05", vendor: "Shutterstock" },
  { id: 3, name: "Template UI Kit", category: "Assets", amount: "$79", date: "2026-02-18", vendor: "UI8" },
  { id: 4, name: "Client Gift Package", category: "Client Success", amount: "$145", date: "2026-02-25", vendor: "Amazon" },
  { id: 5, name: "Contract Review", category: "Legal", amount: "$380", date: "2026-02-28", vendor: "Summit Legal" },
  { id: 6, name: "Laptop Dock", category: "Hardware", amount: "$229", date: "2026-03-01", vendor: "Apple" },
];

export default function Billing() {
  const [recurringExpenses, setRecurringExpenses] = useLocalStorageState<RecurringExpense[]>(
    "delphi_billing_recurring_v2",
    initialRecurringExpenses
  );
  const [oneTimeExpenses, setOneTimeExpenses] = useLocalStorageState<OneTimeExpense[]>(
    "delphi_billing_onetime_v2",
    initialOneTimeExpenses
  );

  const metrics = useMemo(() => {
    const recurringTotal = recurringExpenses
      .filter((expense) => expense.status === "active")
      .reduce((sum, expense) => sum + parseMoney(expense.amount), 0);
    const oneTimeTotal = oneTimeExpenses.reduce((sum, expense) => sum + parseMoney(expense.amount), 0);
    const nextBilling = recurringExpenses
      .filter((expense) => expense.status === "active")
      .sort((a, b) => a.nextBilling.localeCompare(b.nextBilling))[0];

    return {
      recurringTotal,
      oneTimeTotal,
      spentTotal: recurringTotal + oneTimeTotal,
      nextBillingDate: nextBilling ? nextBilling.nextBilling : "N/A",
      nextBillingLabel: nextBilling ? `${formatDateWritten(nextBilling.nextBilling)} (${nextBilling.name})` : "N/A",
    };
  }, [oneTimeExpenses, recurringExpenses]);

  const handleAddRecurring = () => {
    const name = window.prompt("Recurring expense name:");
    if (!name) return;
    const amount = Number(window.prompt("Monthly amount (number only):", "0") || "0");
    const category = window.prompt("Category:", "General") || "General";

    setRecurringExpenses([
      ...recurringExpenses,
      {
        id: Date.now(),
        name,
        category,
        amount: formatMoney(amount),
        frequency: "Monthly",
        nextBilling: new Date().toISOString().split("T")[0],
        status: "active",
      },
    ]);
  };

  const handleAddOneTime = () => {
    const name = window.prompt("Expense name:");
    if (!name) return;
    const amount = Number(window.prompt("Amount (number only):", "0") || "0");
    const vendor = window.prompt("Vendor:", "Unknown") || "Unknown";
    const category = window.prompt("Category:", "General") || "General";

    setOneTimeExpenses([
      ...oneTimeExpenses,
      {
        id: Date.now(),
        name,
        category,
        amount: formatMoney(amount),
        date: new Date().toISOString().split("T")[0],
        vendor,
      },
    ]);
  };

  return (
    <div className="app-atmosphere-page app-light-page min-h-screen relative overflow-hidden">
      <div className="absolute top-24 right-12 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-32 left-12 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-float" style={{ animationDelay: "2s" }} />

      <div className="app-light-frame relative space-y-8">
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="app-light-title">Billing & Finances</h1>
            <p className="app-light-subtitle">Track company expenses and manage budgets</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAddRecurring} className="add-action h-11 rounded-full px-6 text-base font-semibold">
              + Recurring
            </Button>
            <Button onClick={handleAddOneTime} className="add-action h-11 rounded-full px-6 text-base font-semibold">
              + One-Time
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard title="Monthly Recurring" value={formatMoney(metrics.recurringTotal)} change="Active subscriptions" changeType="neutral" icon={CreditCard} />
          <StatCard title="This Month Spent" value={formatMoney(metrics.spentTotal)} change="Recurring + one-time" changeType="positive" icon={TrendingDown} />
          <StatCard title="One-Time Expenses" value={formatMoney(metrics.oneTimeTotal)} change="Current records" changeType="neutral" icon={DollarSign} />
          <StatCard
            title="Next Billing"
            value={formatDateWritten(metrics.nextBillingDate)}
            change={metrics.nextBillingLabel}
            changeType="neutral"
            icon={Calendar}
          />
        </div>

        <Tabs defaultValue="recurring" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="recurring">Recurring Expenses</TabsTrigger>
            <TabsTrigger value="onetime">One-Time Expenses</TabsTrigger>
          </TabsList>

          <TabsContent value="recurring" className="space-y-4">
            <Card className="p-6 animate-fade-in-up hover:shadow-xl transition-all duration-300 bg-card/80 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Monthly Subscriptions</h2>
                <span className="text-2xl font-bold text-foreground">{formatMoney(metrics.recurringTotal)}/mo</span>
              </div>

              <div className="space-y-3">
                {recurringExpenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="group liquid-cyan-hover flex items-center justify-between p-4 rounded-lg border border-border bg-card transition-all duration-300"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{expense.name}</p>
                      <p className="text-sm text-muted-foreground">{expense.category}</p>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="font-semibold text-foreground">{expense.amount}</p>
                        <p className="text-xs text-muted-foreground">{expense.frequency}</p>
                      </div>
                      <div className="text-right min-w-28">
                        <p className="text-sm text-muted-foreground">Next billing</p>
                        <p className="text-sm font-medium text-foreground">{formatDateWritten(expense.nextBilling)}</p>
                      </div>
                      <Badge variant={expense.status === "active" ? "outline" : "destructive"}>
                        {expense.status}
                      </Badge>
                      <Button
                        variant={expense.status === "active" ? "outline" : "default"}
                        size="sm"
                        onClick={() =>
                          setRecurringExpenses(
                            recurringExpenses.map((item) =>
                              item.id === expense.id
                                ? { ...item, status: item.status === "active" ? "cancelled" : "active" }
                                : item
                            )
                          )
                        }
                      >
                        {expense.status === "active" ? "Cancel" : "Reactivate"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="onetime" className="space-y-4">
            <Card className="p-6 animate-fade-in-up hover:shadow-xl transition-all duration-300 bg-card/80 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">One-Time Expenses</h2>
                <span className="text-2xl font-bold text-foreground">{formatMoney(metrics.oneTimeTotal)}</span>
              </div>

              <div className="space-y-3">
                {oneTimeExpenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="group liquid-cyan-hover flex items-center justify-between p-4 rounded-lg border border-border bg-card transition-all duration-300"
                  >
                    <div className="space-y-1 flex-1">
                      <p className="font-medium text-foreground">{expense.name}</p>
                      <p className="text-sm text-muted-foreground">{expense.category}</p>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="font-semibold text-foreground">{expense.amount}</p>
                        <p className="text-xs text-muted-foreground">{expense.vendor}</p>
                      </div>
                      <div className="text-right min-w-28">
                        <p className="text-sm text-muted-foreground">Date</p>
                        <p className="text-sm font-medium text-foreground">{formatDateWritten(expense.date)}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-9 w-9">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setOneTimeExpenses(oneTimeExpenses.filter((item) => item.id !== expense.id))}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
