import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "gamify-tap inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[20px] text-sm font-semibold tracking-[0.01em] ring-offset-background transition-all duration-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "glass-luminous text-[hsl(220_57%_10%)] hover:-translate-y-1 hover:brightness-110 hover:shadow-[0_32px_64px_rgba(37,118,255,0.34),0_0_42px_rgba(132,175,255,0.3),inset_0_1px_0_rgba(255,255,255,0.34)] dark:text-white dark:border-[hsl(220_100%_88%/.28)] dark:shadow-[0_26px_52px_rgba(18,77,255,0.36),0_0_28px_rgba(74,148,255,0.28),inset_0_1px_0_rgba(255,255,255,0.24)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-white/45 bg-[linear-gradient(180deg,hsl(0_0%_100%/.68),hsl(210_100%_97%/.4)),linear-gradient(145deg,hsl(205_100%_72%/.08),transparent_44%,hsl(264_88%_79%/.06))] text-[hsl(221_38%_34%)] backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_34px_rgba(53,108,196,0.12)] hover:-translate-y-1 hover:border-white/60 hover:bg-[linear-gradient(180deg,hsl(0_0%_100%/.78),hsl(210_100%_97%/.5)),linear-gradient(145deg,hsl(205_100%_72%/.1),transparent_44%,hsl(264_88%_79%/.08))] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_22px_42px_rgba(53,108,196,0.16)] dark:border-[hsl(225_92%_82%/.16)] dark:bg-[linear-gradient(180deg,hsl(0_0%_100%/.08),hsl(0_0%_100%/.02)),linear-gradient(145deg,hsl(219_100%_70%/.08),transparent_46%,hsl(269_72%_72%/.05))] dark:text-[hsl(220_100%_97%)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_22px_52px_rgba(1,6,24,0.56)] dark:hover:border-[hsl(219_100%_72%/.32)] dark:hover:bg-[linear-gradient(180deg,hsl(0_0%_100%/.1),hsl(0_0%_100%/.03)),linear-gradient(145deg,hsl(219_100%_70%/.1),transparent_46%,hsl(269_72%_72%/.06))] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_24px_56px_rgba(1,6,24,0.6),0_0_22px_rgba(66,123,255,0.18)]",
        secondary: "border border-white/42 bg-[linear-gradient(180deg,hsl(0_0%_100%/.56),hsl(210_100%_97%/.3)),linear-gradient(145deg,hsl(205_100%_72%/.06),transparent_46%,hsl(264_88%_79%/.05))] text-[hsl(221_38%_34%)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_14px_28px_rgba(53,108,196,0.1)] hover:-translate-y-1 hover:border-white/56 hover:bg-[linear-gradient(180deg,hsl(0_0%_100%/.66),hsl(210_100%_97%/.38)),linear-gradient(145deg,hsl(205_100%_72%/.08),transparent_46%,hsl(264_88%_79%/.06))] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_34px_rgba(53,108,196,0.12)] dark:border-[hsl(225_92%_82%/.14)] dark:bg-[linear-gradient(180deg,hsl(232_24%_28%/.56),hsl(232_24%_18%/.28)),linear-gradient(145deg,hsl(219_100%_70%/.07),transparent_48%,hsl(269_72%_72%/.05))] dark:text-[hsl(220_100%_96%)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_42px_rgba(1,6,24,0.52)] dark:hover:border-[hsl(219_100%_72%/.28)] dark:hover:bg-[linear-gradient(180deg,hsl(232_24%_30%/.62),hsl(232_24%_18%/.34)),linear-gradient(145deg,hsl(219_100%_70%/.09),transparent_48%,hsl(269_72%_72%/.06))] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_22px_48px_rgba(1,6,24,0.56),0_0_18px_rgba(66,123,255,0.14)]",
        ghost: "text-[hsl(221_38%_34%)] hover:border hover:border-white/42 hover:bg-[linear-gradient(180deg,hsl(0_0%_100%/.48),hsl(210_100%_97%/.24)),linear-gradient(145deg,hsl(205_100%_72%/.06),transparent_50%,hsl(264_88%_79%/.05))] hover:backdrop-blur-xl hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_12px_24px_rgba(53,108,196,0.08)] dark:text-[hsl(220_100%_95%)] dark:hover:border-[hsl(225_92%_82%/.14)] dark:hover:bg-[linear-gradient(180deg,hsl(0_0%_100%/.08),hsl(0_0%_100%/.02)),linear-gradient(145deg,hsl(219_100%_70%/.06),transparent_50%,hsl(269_72%_72%/.05))] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_18px_40px_rgba(1,6,24,0.48)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-2xl px-3",
        lg: "h-11 rounded-[20px] px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
