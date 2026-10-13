"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useSyncExternalStore, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Light and dark themes (DESIGN_BRIEF.md §5, dark added 13 Oct 2026). next-themes sets <html data-theme> before the
// page paints (no flash), follows the device unless the user picks one, and remembers the choice in this browser.
// The two names are daisyUI's themes; design/theme.css keys the dark colours on data-theme="plasticash-dark".
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes
      attribute="data-theme"
      value={{ light: "plasticash", dark: "plasticash-dark" }}
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}

// The theme is only known in the browser; render nothing theme-specific on the server to avoid a mismatch.
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

// One button: switch between light and dark (in headers and sidebars).
export function ThemeToggle({ dark = false, className }: { dark?: boolean; className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const isDark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl transition-colors",
        dark ? "bg-white/10 text-white hover:bg-white/15" : "bg-muted text-ink hover:bg-mist",
        className,
      )}
    >
      {mounted ? isDark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden /> : <span className="size-[18px]" />}
    </button>
  );
}

// Three choices (Settings): follow the device, light or dark.
export function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const options = [
    { value: "system", label: "Device", icon: Monitor },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ] as const;
  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-2">
      {options.map(({ value, label, icon: Icon }) => {
        const on = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(value)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-semibold",
              on ? "border-2 border-primary bg-mist text-primary-ink" : "border-border bg-card text-slate-600",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
