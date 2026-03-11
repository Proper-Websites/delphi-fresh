import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  const currentValue = props.value ?? props.defaultValue;
  const hasValue =
    typeof currentValue === "number"
      ? Number.isFinite(currentValue)
      : typeof currentValue === "string"
        ? currentValue.trim().length > 0
        : false;

  return (
    <textarea
      className={cn(
        "flex min-h-[100px] w-full rounded-[22px] border border-[hsl(214_40%_80%/.58)] bg-[linear-gradient(180deg,hsl(0_0%_100%/.62),hsl(210_100%_97%/.34))] px-4 py-3 text-sm text-[hsl(220_16%_20%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_10px_22px_rgba(53,108,196,0.08)] backdrop-blur-xl ring-offset-background placeholder:text-[hsl(219_18%_52%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[var(--glass-stroke-soft)] dark:bg-[linear-gradient(180deg,hsl(220_28%_100%/.12),hsl(220_28%_100%/.05))] dark:text-foreground dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_28px_rgba(2,8,23,0.18)] dark:placeholder:text-muted-foreground",
        hasValue
          ? "border-[hsl(205_100%_72%/.36)] bg-[linear-gradient(180deg,hsl(0_0%_100%/.72),hsl(210_100%_97%/.4))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(123,173,255,0.12),0_0_22px_rgba(123,173,255,0.14)] focus-visible:ring-[hsl(205_100%_72%/.42)] dark:bg-[linear-gradient(180deg,hsl(220_28%_100%/.16),hsl(220_28%_100%/.06))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(123,173,255,0.12),0_0_22px_rgba(123,173,255,0.14)]"
          : "",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
