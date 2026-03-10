import { useEffect, useRef, useState, type HTMLAttributes, type UIEvent } from "react";
import { cn } from "@/lib/utils";

type GlassScrollAreaProps = Omit<HTMLAttributes<HTMLDivElement>, "onScroll"> & {
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  activeMs?: number;
  containerClassName?: string;
};

export function GlassScrollArea({
  className,
  children,
  onScroll,
  activeMs = 1400,
  containerClassName,
  ...props
}: GlassScrollAreaProps) {
  const timeoutRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);

  const markActive = () => {
    setActive(true);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setActive(false);
      timeoutRef.current = null;
    }, activeMs);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    markActive();
    onScroll?.(event);
  };

  return (
    <div className={cn("relative h-full min-h-0", containerClassName)}>
      <div
        className={cn(
          "glass-scrollbar h-full min-h-0 overflow-auto overscroll-contain",
          active ? "scroll-active" : "",
          className
        )}
        onScroll={handleScroll}
        onWheel={() => {
          markActive();
        }}
        onTouchMove={() => {
          markActive();
        }}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}
