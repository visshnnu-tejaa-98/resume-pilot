"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/stores/theme-store";

/** Mirrors the theme store onto <html data-theme>. Renders nothing. */
export function ThemeSync() {
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") delete root.dataset.theme;
    else root.dataset.theme = mode;
  }, [mode]);

  return null;
}
