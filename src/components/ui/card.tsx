import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "gamify-card relative isolate overflow-hidden rounded-[34px] border border-[var(--glass-stroke)] bg-[radial-gradient(circle_at_top_right,hsl(205_100%_72%/.14),transparent_28%),radial-gradient(circle_at_bottom_left,hsl(264_88%_79%/.12),transparent_34%),linear-gradient(180deg,hsl(220_28%_100%/.16),hsl(220_28%_100%/.045))] text-card-foreground shadow-[0_42px_120px_rgba(1,6,19,0.54),0_18px_54px_rgba(4,10,26,0.32),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-[32px] transition-[box-shadow,transform,border-color,background] duration-300 before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(145deg,rgba(255,255,255,0.16),transparent_24%,transparent_74%,rgba(255,255,255,0.06))] before:opacity-90 before:content-[''] hover:-translate-y-1.5 hover:border-[hsl(220_28%_100%/.24)] hover:shadow-[0_56px_140px_rgba(1,6,19,0.62),0_18px_60px_rgba(4,10,26,0.38),inset_0_1px_0_rgba(255,255,255,0.2),0_0_42px_rgba(125,175,255,0.16)]",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
