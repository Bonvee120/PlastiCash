import {
  FileText,
  MessageCircle,
  Plus,
  Scale,
  Wallet as WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { NewRequestAlerts, PushToggle } from "@/components/ops/notifications";
import { Logo, LogoMark } from "@/components/brand/logo";
import {
  OpsNav,
  type OpsCounts,
  UserBottomNav,
  UserSidebarNav,
} from "@/components/layout/nav-link";
import { Skeleton } from "@/components/ui/skeleton";
import { api, get } from "@/lib/api";
import { money } from "@/lib/format";
import { greeting, type Me } from "@/lib/me";
import type { Wallet } from "@/lib/types";
import { HUB, WHATSAPP_URL } from "@/lib/site";

// Area shells from docs/DESIGN_BRIEF.md §6.

// "2,450 pts (₦2,450)" on cream, in the laptop top bar. Loads on its own so it never holds up the page.
async function BalanceChip() {
  const wallet = await get<Wallet>("/wallet?limit=1");
  return (
    <Link
      href="/app/wallet"
      className="tabular flex items-center gap-1.5 rounded-full bg-cream px-3 py-2 text-[13px] font-semibold text-[#92400E]"
    >
      <WalletIcon
        className="size-[15px] text-[#B45309]"
        strokeWidth={2.4}
        aria-hidden
      />
      {money(wallet.balance_kobo)}
    </Link>
  );
}

function initials(me: Me) {
  const name =
    me.account_type === "ORGANIZATION" && me.org_name
      ? me.org_name
      : me.full_name;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

function partOfDay() {
  const hour = Number(
    new Intl.DateTimeFormat("en-NG", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Africa/Lagos",
    }).format(new Date()),
  );
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}

function today() {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Lagos",
  }).format(new Date());
}

function Avatar({ me, size = 38 }: { me: Me; size?: number }) {
  const org = me.account_type === "ORGANIZATION";
  return (
    <span
      className={
        org
          ? "grid shrink-0 place-items-center rounded-full bg-forest font-display font-bold text-gold"
          : "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-amber font-display font-bold text-heading"
      }
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initials(me)}
    </span>
  );
}

// ----- User area (/app) -----

export function UserShell({ me, children }: { me: Me; children: ReactNode }) {
  const org = me.account_type === "ORGANIZATION";
  return (
    <div className="flex min-h-svh flex-1 bg-canvas lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-svh flex-col gap-1 border-r border-border bg-white px-4 py-[22px] lg:flex">
        <Link
          href="/app"
          className="px-1.5 pb-[18px]"
          aria-label="PlastiCash home"
        >
          <Logo size={34} />
        </Link>
        <Link
          href="/app/request"
          className="d-btn d-btn-primary mt-1.5 mb-2.5 h-11 w-full"
        >
          <Plus className="size-[18px]" strokeWidth={2.6} aria-hidden />
          Request pickup
        </Link>
        <UserSidebarNav />
        <div className="mt-auto flex flex-col gap-1.5 rounded-2xl border border-[#BBF7D0] bg-mist p-3.5 text-[13px] text-primary-dark">
          {org ? (
            <>
              <b className="text-sm">Monthly ESG report</b>
              <span>Download your recycling report from Impact.</span>
              <Link
                href="/app/impact"
                className="flex items-center gap-1.5 font-bold text-primary"
              >
                <FileText
                  className="size-[15px]"
                  strokeWidth={2.4}
                  aria-hidden
                />{" "}
                Open Impact
              </Link>
            </>
          ) : (
            <>
              <b className="text-sm">Hub drop-off</b>
              <span>
                {HUB.address}, {HUB.hours}.
              </span>
              <Link href="/guide" prefetch={false} className="flex items-center gap-1.5 font-bold text-primary">
                <Scale className="size-[15px]" strokeWidth={2.4} aria-hidden /> How much is my plastic?
              </Link>
            </>
          )}
          {WHATSAPP_URL && (
            <a
              href={WHATSAPP_URL}
              className="flex items-center gap-1.5 font-bold text-primary"
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle
                className="size-[15px]"
                strokeWidth={2.4}
                aria-hidden
              />{" "}
              Chat on WhatsApp
            </a>
          )}
        </div>
        <div className="pt-3">
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Laptop top bar */}
        <header className="hidden items-center justify-between gap-5 border-b border-border bg-white px-8 py-[18px] lg:flex">
          <div>
            <h1 className="text-2xl font-bold">{greeting(me)}</h1>
            <p className="text-[13px] text-muted-foreground">
              {today()}
              {me.area ? ` · ${me.area}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Suspense fallback={<Skeleton className="h-9 w-44 rounded-full" />}>
              <BalanceChip />
            </Suspense>
            <Link
              href="/app/settings"
              className="flex items-center gap-2.5"
              aria-label="Your profile and settings"
            >
              <Avatar me={me} />
              <span>
                <b className="block text-sm">{me.full_name}</b>
                <small className="text-xs text-muted-foreground">
                  {org ? me.org_name : "Individual"}
                </small>
              </span>
            </Link>
          </div>
        </header>

        {/* Phone greeting row */}
        <header className="flex items-center justify-between px-4 pt-4 pb-2 lg:hidden">
          <Link
            href="/app/settings"
            className="flex items-center gap-3"
            aria-label="Your profile and settings"
          >
            <Avatar me={me} size={44} />
            <span>
              <span className="block text-[13px] text-muted-foreground">
                {partOfDay()}
              </span>
              <span className="block font-display text-xl font-bold tracking-[-0.02em] text-heading">
                {greeting(me)}
              </span>
            </span>
          </Link>
          <LogoutButton compact />
        </header>

        <div className="flex flex-1 flex-col pb-24 lg:pb-0">{children}</div>

        {/* Phone bottom nav */}
        <UserBottomNav />
      </div>
    </div>
  );
}

// ----- Collector area (/collector): phone only, forest header, no decoration (§6.3) -----

export function CollectorShell({
  me,
  children,
}: {
  me: Me;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-1 flex-col bg-canvas">
      <header className="flex items-center gap-3 bg-forest px-4 py-3.5 text-white">
        <LogoMark variant="white" size={36} />
        <div className="min-w-0 flex-1">
          <b className="block truncate font-display text-lg font-bold">
            {me.full_name}
          </b>
          <span className="eyebrow block truncate !text-[10px] text-[#86EFAC]">
            ID {me.id.slice(0, 4).toUpperCase()}
          </span>
        </div>
        <span className="rounded-full bg-leaf px-2.5 py-1 text-xs font-bold text-forest">
          ● Online
        </span>
        <LogoutButton compact dark />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

// ----- Ops portal (/ops-portal): desktop, 240 px forest sidebar (§6.4) -----

export function OpsShell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1 flex-col bg-canvas lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-1 bg-forest p-5 text-[#BBF7D0] lg:sticky lg:top-0 lg:h-svh">
        <Link
          href="/ops-portal"
          className="px-1 pb-6"
          aria-label="Ops portal home"
        >
          <Logo variant="white" size={30} subline="Ops portal" />
        </Link>
        <Suspense fallback={<OpsNav />}>
          <OpsNavWithCounts />
        </Suspense>
        {/* New request alerts: pop-up while the portal is open, and push on this device when switched on. */}
        <NewRequestAlerts />
        <div className="pt-4 lg:mt-auto lg:pt-6">
          <PushToggle dark />
        </div>
        <div className="hidden flex-col gap-3 pt-4 lg:flex">
          <p className="text-[13px] text-[#86EFAC]">{greeting(me)}</p>
          <LogoutButton dark />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

async function OpsNavWithCounts() {
  // One cheap query; the full /admin/stats is only for the overview page.
  const result = await api<OpsCounts>("/admin/counts");
  return result.ok ? <OpsNav counts={result.data} /> : <OpsNav />;
}

// ----- Placeholder for pages that later steps build -----

export function ComingSoon({
  title,
  step,
  children,
}: {
  title: string;
  step: number;
  children?: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col gap-2 p-4 lg:p-8">
      <h2 className="text-[26px] font-bold lg:text-2xl">{title}</h2>
      <p className="text-muted-foreground">
        {children ?? `This page is built in step ${step}.`}
      </p>
    </main>
  );
}
