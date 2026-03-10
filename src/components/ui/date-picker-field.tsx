import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateWritten } from "@/lib/date-format";
import { cn } from "@/lib/utils";

type DatePickerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
};

const parseDateKey = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
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

export function DatePickerField({
  value,
  onChange,
  placeholder = "Select date",
  id,
  className,
  triggerClassName,
  disabled = false,
}: DatePickerFieldProps) {
  return (
    <div className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-10 w-full justify-between rounded-xl bg-background/70 px-3 text-left font-medium",
              value
                ? "border-emerald-400/70 bg-[linear-gradient(180deg,hsl(146_62%_95%/.74),hsl(158_55%_91%/.58))] shadow-[inset_0_1px_0_hsl(0_0%_100%/.86),0_0_0_1px_hsl(153_55%_46%/.14),0_0_16px_hsl(153_55%_46%/.14)] focus-visible:ring-emerald-500/55 dark:border-emerald-300/45 dark:bg-[linear-gradient(180deg,hsl(153_38%_24%/.72),hsl(157_34%_18%/.58))] dark:shadow-[inset_0_1px_0_hsl(0_0%_100%/.1),0_0_0_1px_hsl(153_55%_46%/.2),0_0_18px_hsl(153_55%_46%/.16)]"
                : "",
              triggerClassName
            )}
          >
            <span className={value ? "text-foreground" : "text-muted-foreground"}>
              {value ? formatDateWritten(value) : placeholder}
            </span>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto rounded-2xl border border-white/45 bg-[linear-gradient(180deg,hsl(0_0%_100%/.92),hsl(0_0%_100%/.78))] p-2 shadow-[inset_0_1px_0_hsl(0_0%_100%/.88)] backdrop-blur-xl dark:border-white/18 dark:bg-[linear-gradient(180deg,hsl(220_30%_22%/.9),hsl(221_32%_15%/.84))]"
        >
          <Calendar
            mode="single"
            selected={parseDateKey(value)}
            onSelect={(date) => date && onChange(toDateKey(date))}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
