"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

// Ops portal sidebar. From lg it is the 240 px forest column, sticky and full height. On phones and tablets a forest
// bar with a menu button sits on top, and the same sidebar slides in from the left, top to bottom, over a dimmed
// page. It closes on a link tap (route change), the X, the backdrop or Escape. Closed, it is `invisible`, so its
// links are out of the tab order.
export function OpsSidebar({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const [shownPath, setShownPath] = useState(path);
  if (path !== shownPath) {
    setShownPath(path);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Keep the page behind the open menu from scrolling.
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-forest px-4 py-3 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="ops-sidebar"
          className="grid size-11 place-items-center rounded-xl bg-white/10"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Link href="/ops-portal" aria-label="Ops portal home">
          <Logo variant="white" size={28} subline="Ops portal" />
        </Link>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        id="ops-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-[280px] max-w-[85vw] flex-col gap-1 overflow-y-auto bg-forest p-5 text-[#BBF7D0] transition-[translate,visibility] duration-200",
          "lg:visible lg:sticky lg:top-0 lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:transition-none",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="absolute top-4 right-4 grid size-10 place-items-center rounded-xl bg-white/10 text-white lg:hidden"
        >
          <X className="size-5" aria-hidden />
        </button>
        {children}
      </aside>
    </>
  );
}
