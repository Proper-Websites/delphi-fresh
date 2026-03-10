import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { CosmicField } from "./CosmicField";
import { AddAnythingDialog } from "./AddAnythingDialog";
import type { AppMode } from "@/types/app-mode";
import { useState } from "react";
import { applyStoredThemePreference, toggleLightDarkTheme } from "@/lib/theme";

interface DashboardLayoutProps {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
}

export type SidebarPosition = "left" | "right" | "top-dock";
const SIDEBAR_POSITION_KEY = "delphi_sidebar_position";

export function DashboardLayout({ appMode, setAppMode }: DashboardLayoutProps) {
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() => {
    const saved = localStorage.getItem(SIDEBAR_POSITION_KEY);
    if (saved === "left" || saved === "right" || saved === "top-dock") return saved;
    return "top-dock";
  });

  useEffect(() => {
    applyStoredThemePreference();
  }, []);

  useEffect(() => {
    const onSidebarPositionChange = (event: Event) => {
      const detail = (event as CustomEvent<SidebarPosition>).detail;
      if (detail === "left" || detail === "right" || detail === "top-dock") setSidebarPosition(detail);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SIDEBAR_POSITION_KEY || !event.newValue) return;
      if (event.newValue === "left" || event.newValue === "right" || event.newValue === "top-dock") {
        setSidebarPosition(event.newValue);
      }
    };
    const onThemeShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      const isThemeToggleShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        (event.code === "Digit1" || event.key === "1");

      if (isTypingTarget || !isThemeToggleShortcut) return;

      event.preventDefault();
      toggleLightDarkTheme();
    };
    window.addEventListener("delphi-sidebar-position-change", onSidebarPositionChange as EventListener);
    window.addEventListener("storage", onStorage);
    window.addEventListener("keydown", onThemeShortcut);
    return () => {
      window.removeEventListener("delphi-sidebar-position-change", onSidebarPositionChange as EventListener);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("keydown", onThemeShortcut);
    };
  }, []);

  return (
    <div className="app-shell app-atmosphere-page min-h-screen flex w-full bg-background relative">
      <CosmicField enabled />
      <div className="app-glass-overlay pointer-events-none absolute inset-0 z-[1]" />
      <Sidebar position={sidebarPosition} />
      <AddAnythingDialog />
      <main
        className={`tech-load-scope relative z-10 flex-1 overflow-auto transition-all duration-300 ${
          sidebarPosition === "left" ? "ml-[108px]" : sidebarPosition === "right" ? "mr-[108px]" : ""
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
