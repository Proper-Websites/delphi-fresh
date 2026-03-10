import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur-2xl transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]",
  {
    variants: {
      variant: {
        default: "border-[hsl(205_100%_72%/.24)] bg-[linear-gradient(180deg,hsl(205_100%_72%/.42),hsl(264_88%_79%/.28))] text-white shadow-[0_12px_28px_rgba(58,122,255,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-105",
        secondary: "border-[var(--glass-stroke-soft)] bg-[linear-gradient(180deg,hsl(220_28%_100%/.14),hsl(220_28%_100%/.05)),linear-gradient(150deg,hsl(205_100%_72%/.05),transparent_50%,hsl(264_88%_79%/.05))] text-secondary-foreground",
        destructive: "border-destructive/35 bg-[linear-gradient(180deg,hsl(var(--destructive)/0.9),hsl(var(--destructive)/0.72))] text-destructive-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/.35)] hover:brightness-105",
        outline: "border-[var(--glass-stroke-soft)] bg-[linear-gradient(180deg,hsl(220_28%_100%/.1),hsl(220_28%_100%/.04))] text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
