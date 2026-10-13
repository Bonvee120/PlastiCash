import { Menu, MessageCircle } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme";
import { HUB, WHATSAPP_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

// Public site chrome (DESIGN_BRIEF.md §6.1): logo, How it works, Prices, For organizations, Bottle guide, Log in and
// "Start earning" (amber). On a phone the links fold into a menu button. Links into the logged-in area don't prefetch.

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#prices", label: "Prices" },
  { href: "/#organizations", label: "For organizations" },
  { href: "/guide", label: "Bottle guide" },
];

export function SiteHeader({ dark = false }: { dark?: boolean }) {
  const linkTone = dark
    ? "text-[#BBF7D0] hover:text-white"
    : "text-slate-600 hover:text-primary";
  return (
    <header
      className={cn(
        "relative z-20",
        dark ? "text-white" : "border-b border-border bg-card",
      )}
    >
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-4 lg:px-[72px]">
        <Link href="/" aria-label="PlastiCash home">
          <Logo variant={dark ? "white" : "color"} size={34} />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn("text-sm font-semibold", linkTone)}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            prefetch={false}
            className={cn(
              "text-sm font-bold",
              dark ? "text-white" : "text-primary",
            )}
          >
            Log in
          </Link>
          <Link
            href="/signup"
            prefetch={false}
            className="d-btn d-btn-accent d-btn-sm"
          >
            Start earning
          </Link>
          <ThemeToggle dark={dark} />
        </nav>
        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle dark={dark} />
          <details className="group relative">
            <summary
              className={cn(
                "grid size-11 cursor-pointer list-none place-items-center rounded-xl [&::-webkit-details-marker]:hidden",
                dark ? "bg-white/10" : "bg-muted",
              )}
              aria-label="Menu"
            >
              <Menu className="size-5" aria-hidden />
            </summary>
            <nav
              aria-label="Main"
              className="absolute right-0 mt-2 flex w-60 flex-col gap-1 rounded-2xl border border-border bg-card p-2 text-ink shadow-lg"
            >
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-xl px-3 py-3 text-base font-semibold hover:bg-mist"
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/login"
                prefetch={false}
                className="rounded-xl px-3 py-3 text-base font-bold text-primary hover:bg-mist"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                prefetch={false}
                className="d-btn d-btn-accent mt-1"
              >
                Start earning
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-forest text-[#BBF7D0]">
      <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-12 sm:grid-cols-3 lg:px-[72px]">
        <div className="flex flex-col gap-3">
          <Logo variant="white" size={32} subline="by EcoCyclers" />
          <p className="text-sm">
            Plastic for cash in Enugu. Weighed in front of you, paid to your
            bank.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <b className="text-white">EcoCyclers hub</b>
          <span>{HUB.address}, Enugu</span>
          <span>{HUB.hours}</span>
          {WHATSAPP_URL && (
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-2 font-bold text-white"
            >
              <MessageCircle className="size-4" aria-hidden /> Chat on WhatsApp
            </a>
          )}
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <b className="text-white">PlastiCash</b>
          <Link href="/guide">Bottle guide</Link>
          <Link href="/signup" prefetch={false}>
            Create an account
          </Link>
          <Link href="/login" prefetch={false}>
            Log in
          </Link>
        </div>
      </div>
    </footer>
  );
}
