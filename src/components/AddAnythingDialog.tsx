import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, RefreshCw, Terminal, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type AddTarget = {
  key: "task" | "prospect" | "project" | "client";
  title: string;
  subtitle: string;
  icon: typeof ClipboardList;
  href: string;
};

const addTargets: AddTarget[] = [
  {
    key: "task",
    title: "Task",
    subtitle: "Add to My Work",
    icon: ClipboardList,
    href: "/my-work?tab=list&add=task",
  },
  {
    key: "prospect",
    title: "Prospect",
    subtitle: "Add to Sales",
    icon: TrendingUp,
    href: "/sales?add=prospect",
  },
  {
    key: "project",
    title: "Project",
    subtitle: "Add to Development",
    icon: Terminal,
    href: "/development?add=project",
  },
  {
    key: "client",
    title: "Client",
    subtitle: "Add to Subscriptions",
    icon: RefreshCw,
    href: "/subscriptions?add=client",
  },
];

export function AddAnythingDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "d";
      if (!isShortcut) return;
      event.preventDefault();
      setOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl overflow-hidden border border-white/40 bg-[linear-gradient(180deg,hsl(0_0%_100%/.8),hsl(0_0%_100%/.62))] p-7 shadow-[inset_0_1px_0_hsl(0_0%_100%/.9),0_24px_42px_-30px_hsl(210_72%_34%/.38)] backdrop-blur-2xl dark:border-[hsl(198_84%_75%/.24)] dark:bg-[linear-gradient(180deg,hsl(219_33%_20%/.9),hsl(220_35%_14%/.78))] dark:shadow-[inset_0_1px_0_hsl(0_0%_100%/.14),0_34px_58px_-32px_hsl(223_52%_8%/.86)]">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
          style={{
            background:
              "radial-gradient(circle at 20% 14%, hsl(193 100% 74% / 0.2) 0%, transparent 38%), radial-gradient(circle at 84% 88%, hsl(214 95% 62% / 0.14) 0%, transparent 42%)",
          }}
        />
        <DialogHeader>
          <DialogTitle className="text-3xl font-semibold tracking-tight">Add Anything</DialogTitle>
          <p className="text-sm uppercase tracking-[0.14em] text-muted-foreground">Quick capture • Cmd/Ctrl + D</p>
        </DialogHeader>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {addTargets.map((target) => (
            <Button
              key={target.key}
              variant="ghost"
              className="group h-auto justify-start rounded-2xl border border-white/36 bg-[linear-gradient(180deg,hsl(0_0%_100%/.62),hsl(0_0%_100%/.42))] p-6 text-left shadow-[inset_0_1px_0_hsl(0_0%_100%/.82)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-[1px] hover:border-[hsl(202_82%_68%/.7)] hover:bg-[linear-gradient(180deg,hsl(193_100%_88%/.44),hsl(214_95%_84%/.34))] hover:shadow-[inset_0_1px_0_hsl(0_0%_100%/.88),0_0_18px_hsl(199_100%_72%/.28)] dark:border-white/15 dark:bg-[linear-gradient(180deg,hsl(220_28%_24%/.7),hsl(221_30%_16%/.58))] dark:hover:border-[hsl(202_75%_66%/.62)] dark:hover:bg-[linear-gradient(180deg,hsl(197_100%_72%/.2),hsl(214_95%_62%/.18))] dark:hover:shadow-[0_0_18px_hsl(199_100%_72%/.3)]"
              onClick={() => {
                navigate(target.href);
                setOpen(false);
              }}
            >
              <span className="mr-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/55 bg-[linear-gradient(180deg,hsl(0_0%_100%/.62),hsl(0_0%_100%/.38))] shadow-[inset_0_1px_0_hsl(0_0%_100%/.9)] transition-all duration-300 group-hover:border-[hsl(199_85%_66%/.75)] group-hover:bg-[linear-gradient(180deg,hsl(194_100%_88%/.6),hsl(214_95%_84%/.4))] dark:border-white/20 dark:bg-[linear-gradient(180deg,hsl(220_34%_26%/.78),hsl(220_30%_18%/.56))] dark:group-hover:border-[hsl(199_82%_68%/.62)] dark:group-hover:bg-[linear-gradient(180deg,hsl(197_100%_72%/.26),hsl(214_95%_62%/.2))]">
                <target.icon className="h-5 w-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-lg font-semibold tracking-tight">{target.title}</span>
                <span className="text-base text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80 dark:group-hover:text-white/78">
                  {target.subtitle}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
