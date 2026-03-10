import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AppMode } from "@/types/app-mode";
import { AnimatedTitle } from "./AnimatedTitle";
import { cn } from "@/lib/utils";

interface EntryLobbyProps {
  onEnter: (mode: AppMode) => void;
}

export function EntryLobby({ onEnter }: EntryLobbyProps) {
  const [panelCursor, setPanelCursor] = useState({ x: 0.5, y: 0.5, active: false });
  const [launchMode, setLaunchMode] = useState<AppMode | null>(null);
  const lobbyRootRef = useRef<HTMLDivElement | null>(null);
  const launchFallbackRef = useRef<number | null>(null);

  const stars = useMemo(
    () =>
      Array.from({ length: 620 }, (_, i) => {
        const depthRoll = Math.random();
        const layer = depthRoll > 0.78 ? "near" : depthRoll > 0.46 ? "mid" : "far";
        const size =
          layer === "near"
            ? 1.55 + Math.random() * 2.2
            : layer === "mid"
              ? 0.95 + Math.random() * 1.45
              : 0.45 + Math.random() * 0.95;
        const depth =
          layer === "near"
            ? 0.7 + Math.random() * 0.9
            : layer === "mid"
              ? 0.38 + Math.random() * 0.55
              : 0.14 + Math.random() * 0.34;
        const temperatureRoll = Math.random();
        const color =
          temperatureRoll > 0.92
            ? "hsl(36 100% 90% / 0.95)"
            : temperatureRoll > 0.7
              ? "hsl(196 100% 90% / 0.96)"
              : "hsl(0 0% 100% / 0.96)";
        return {
          id: i,
          left: Math.random() * 100,
          top: Math.random() * 100,
          size,
          depth,
          layer,
          color,
          glow: 0.22 + Math.random() * 0.66,
          twinkle: 1.7 + Math.random() * 4.2,
          delay: Math.random() * 5.2,
        };
      }),
    []
  );

  const shootingStars = useMemo(
    () =>
      Array.from({ length: 10 }, (_, id) => ({
        id,
        top: 6 + Math.random() * 46,
        left: 8 + Math.random() * 74,
        delay: Math.random() * 24,
        duration: 0.9 + Math.random() * 1.15,
        angle: -16 - Math.random() * 18,
        length: 110 + Math.random() * 120,
      })),
    []
  );

  const wormholeRays = useMemo(
    () =>
      Array.from({ length: 320 }, (_, id) => ({
        id,
        angle: Math.random() * 360,
        delay: Math.random() * 0.24,
        duration: 0.52 + Math.random() * 0.28,
        hue: 192 + Math.random() * 34,
        length: 360 + Math.random() * 1060,
        width: 1 + Math.random() * 2.6,
        blur: Math.random() * 0.8,
      })),
    []
  );

  useEffect(() => {
    let raf = 0;
    const onMove = (event: MouseEvent) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = event.clientX / window.innerWidth;
        const y = event.clientY / window.innerHeight;
        const offsetX = (x - 0.5) * 2 * 38;
        const offsetY = (y - 0.5) * 2 * 38;
        if (!lobbyRootRef.current) return;
        lobbyRootRef.current.style.setProperty("--lobby-offset-x", `${offsetX}px`);
        lobbyRootRef.current.style.setProperty("--lobby-offset-y", `${offsetY}px`);
        lobbyRootRef.current.style.setProperty("--lobby-offset-x-small", `${offsetX * 0.16}px`);
        lobbyRootRef.current.style.setProperty("--lobby-offset-y-small", `${offsetY * 0.16}px`);
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  const enterNow = (mode: AppMode) => {
    if (launchMode) return;
    setLaunchMode(mode);
  };

  const completeLaunch = () => {
    if (!launchMode) return;
    onEnter(launchMode);
  };

  useEffect(() => {
    const onCommandEnter = () => {
      enterNow("combined");
    };
    window.addEventListener("delphi-command-enter", onCommandEnter as EventListener);
    return () => window.removeEventListener("delphi-command-enter", onCommandEnter as EventListener);
  }, [launchMode]);

  useEffect(() => {
    if (!launchMode) return;
    launchFallbackRef.current = window.setTimeout(() => {
      completeLaunch();
    }, 920);
    return () => {
      if (launchFallbackRef.current !== null) {
        window.clearTimeout(launchFallbackRef.current);
        launchFallbackRef.current = null;
      }
    };
  }, [launchMode]);

  return (
    <div
      ref={lobbyRootRef}
      className="lobby-sky relative min-h-screen w-full overflow-hidden"
      style={
        {
          ["--lobby-offset-x" as string]: "0px",
          ["--lobby-offset-y" as string]: "0px",
          ["--lobby-offset-x-small" as string]: "0px",
          ["--lobby-offset-y-small" as string]: "0px",
        } as Record<string, string>
      }
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,hsl(205_88%_72%/.26),transparent_42%)]" />
      <div className="lobby-nebula lobby-nebula-a" />
      <div className="lobby-nebula lobby-nebula-b" />
      <div className="lobby-nebula lobby-nebula-c" />
      <div className="lobby-nebula lobby-nebula-d" />
      <div className="lobby-nebula lobby-nebula-e" />
      <div className="lobby-haze" />
      <div className="lobby-dust-cloud" />
      <div className="lobby-shooting-stars" aria-hidden>
        {shootingStars.map((star) => (
          <span
            key={star.id}
            className="lobby-shooting-star"
            style={{
              top: `${star.top}%`,
              left: `${star.left}%`,
              animationDelay: `${star.delay}s`,
              animationDuration: `${star.duration}s`,
              ["--shoot-angle" as string]: `${star.angle}deg`,
              ["--shoot-length" as string]: `${star.length}px`,
            }}
          />
        ))}
      </div>

      <div className={cn("lobby-starfield", launchMode && "lobby-starfield-warp")}>
        {stars.map((star) => (
          <span
            key={star.id}
            className={`lobby-star lobby-star-${star.layer}`}
            style={{
              left: `${star.left}%`,
              top: `${star.top}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              transform: "translate(calc(var(--lobby-offset-x) * var(--star-depth)), calc(var(--lobby-offset-y) * var(--star-depth)))",
              ["--star-depth" as string]: String(star.depth),
            }}
          >
            <span
              className="lobby-star-dot"
              style={{
                animationDelay: `${star.delay}s`,
                animationDuration: `${star.twinkle}s, ${star.twinkle * 1.82}s`,
                ["--star-color" as string]: star.color,
                ["--star-glow" as string]: `${star.glow}`,
              }}
            />
          </span>
        ))}
      </div>

      <div
        className="lobby-faint-constellations"
        style={{ transform: "translate(var(--lobby-offset-x-small), var(--lobby-offset-y-small))" }}
      >
        <svg viewBox="0 0 1000 700" className="lobby-faint-constellations-svg" aria-hidden>
          <g className="faint-constellation">
            <polyline points="694,114 650,170 600,230 560,305 540,390 580,490" className="faint-constellation-line" />
            <polyline points="650,170 705,210 770,250 780,330 750,430" className="faint-constellation-line" />
            <polyline points="620,256 666,266 714,278" className="faint-constellation-belt" />
            <circle cx="694" cy="114" r="1.7" className="faint-constellation-star" />
            <circle cx="650" cy="170" r="1.4" className="faint-constellation-star" />
            <circle cx="600" cy="230" r="1.4" className="faint-constellation-star" />
            <circle cx="560" cy="305" r="1.5" className="faint-constellation-star" />
            <circle cx="540" cy="390" r="1.6" className="faint-constellation-star" />
            <circle cx="580" cy="490" r="1.7" className="faint-constellation-star" />
            <circle cx="705" cy="210" r="1.4" className="faint-constellation-star" />
            <circle cx="770" cy="250" r="1.4" className="faint-constellation-star" />
            <circle cx="780" cy="330" r="1.3" className="faint-constellation-star" />
            <circle cx="750" cy="430" r="1.4" className="faint-constellation-star" />
            <circle cx="620" cy="256" r="1.8" className="faint-constellation-star" />
            <circle cx="666" cy="266" r="2" className="faint-constellation-star" />
            <circle cx="714" cy="278" r="1.8" className="faint-constellation-star" />
          </g>

          <g className="faint-constellation faint-constellation-shift">
            <polyline points="160,140 220,150 260,195 312,242 384,284 432,252 486,228" className="faint-constellation-line" />
            <circle cx="160" cy="140" r="1.8" className="faint-constellation-star" />
            <circle cx="220" cy="150" r="1.6" className="faint-constellation-star" />
            <circle cx="260" cy="195" r="1.5" className="faint-constellation-star" />
            <circle cx="312" cy="242" r="1.5" className="faint-constellation-star" />
            <circle cx="384" cy="284" r="1.6" className="faint-constellation-star" />
            <circle cx="432" cy="252" r="1.5" className="faint-constellation-star" />
            <circle cx="486" cy="228" r="1.7" className="faint-constellation-star" />
          </g>
        </svg>
      </div>

      {launchMode && (
        <div className="lobby-warp-overlay" aria-hidden>
          <div className="lobby-wormhole-vignette" />
          <div className="lobby-wormhole-core" />
          <div className="lobby-wormhole-bloom" />
          <div className="lobby-wormhole-radial">
            {wormholeRays.map((ray) => (
              <span
                key={ray.id}
                className="lobby-wormhole-ray"
                style={{
                  animationDelay: `${ray.delay}s`,
                  animationDuration: `${ray.duration}s`,
                  ["--ray-angle" as string]: `${ray.angle}deg`,
                  ["--ray-hue" as string]: `${ray.hue}`,
                  ["--ray-length" as string]: `${ray.length}px`,
                  ["--ray-width" as string]: `${ray.width}px`,
                  ["--ray-blur" as string]: `${ray.blur}px`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div
          className={cn(
            "lobby-panel relative w-full max-w-[85rem] overflow-hidden rounded-[2.75rem] px-8 py-8 text-center md:px-14 md:py-10 xl:px-20 xl:py-12",
            launchMode && "lobby-panel-warp"
          )}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;
            setPanelCursor({
              x: Math.max(0, Math.min(1, x)),
              y: Math.max(0, Math.min(1, y)),
              active: true,
            });
          }}
          onMouseLeave={() => setPanelCursor((prev) => ({ ...prev, active: false }))}
          style={
            {
              ["--lobby-cursor-x" as string]: `${panelCursor.x * 100}%`,
              ["--lobby-cursor-y" as string]: `${panelCursor.y * 100}%`,
              ["--lobby-cursor-alpha" as string]: panelCursor.active ? 1 : 0.45,
            } as Record<string, string | number>
          }
        >
          <div className="lobby-panel-glow" />
          <div className="lobby-panel-edge" />
          <div className="lobby-panel-rim" />
          <div className="lobby-panel-floor" />
          <div className="lobby-panel-cursor-glow" />
          <div className="lobby-panel-noise" />
          <div className="lobby-panel-swirl" />

          <div className="relative z-10 flex min-h-[32rem] flex-col justify-center pb-12 pt-2 md:min-h-[36rem] md:pb-14 xl:min-h-[39rem]">
            <div className="lobby-orb-wrap">
              <div className="lobby-orb-pedestal" />
              <img
                src="/crystal-sphere.svg"
                alt="Oracle sphere"
                className="lobby-orb-image"
              />
            </div>

            <p className="lobby-kicker mb-3">Delphi</p>
            <AnimatedTitle text="Welcome Back" className="lobby-title mb-5" />
            <p className="lobby-copy mx-auto mb-10 max-w-[56rem]">
              Enter your space to plan clearly, move gently, and run every part of Delphi from one calm place.
            </p>

            <Button
              onClick={() => enterNow("combined")}
              size="lg"
              disabled={Boolean(launchMode)}
              className="lobby-cta h-16 rounded-full px-14 text-[1.05rem] font-semibold tracking-[0.02em] text-white hover:text-white md:h-[4.65rem] md:min-w-[20rem]"
            >
              {launchMode ? "Launching..." : "LAUNCH"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => enterNow("personal")}
              disabled={Boolean(launchMode)}
              className="lobby-corner-label lobby-corner-label--left absolute bottom-0 left-0 h-auto px-0 py-0 hover:bg-transparent"
            >
              Personal
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => enterNow("business")}
              disabled={Boolean(launchMode)}
              className="lobby-corner-label lobby-corner-label--right absolute bottom-0 right-0 h-auto px-0 py-0 hover:bg-transparent"
            >
              Business
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
