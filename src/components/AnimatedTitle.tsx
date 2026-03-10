import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface AnimatedTitleProps {
  text: string;
  className?: string;
}

export function AnimatedTitle({ text, className }: AnimatedTitleProps) {
  const chars = useMemo(() => text.split(""), [text]);

  return (
    <h1 className={cn("animated-title", className)} aria-label={text}>
      {chars.map((char, index) => (
        <span
          key={`${char}-${index}`}
          className="animated-title-letter"
          style={{ animationDelay: `${index * 0.04}s` }}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </h1>
  );
}
