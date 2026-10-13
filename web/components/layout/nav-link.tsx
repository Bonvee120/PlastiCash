"use client";

import {
  AlertTriangle,
  Boxes,
  House,
  LayoutDashboard,
  Leaf,
  List,
  Plus,
  SlidersHorizontal,
  Tag,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: LucideIcon; count?: number; alert?: boolean };

function useActive(href: string, exact: boolean) {
  const path = usePathname();
  return exact ? path === href : path === href || path.startsWith(`${href}/`);
}

// User sidebar item (laptop): active item is mint with green text (DESIGN_BRIEF §6.2).
export function SidebarLink({ item, exact = false }: { item: NavItem; exact?: boolean }) {
  const active = useActive(item.href, exact);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-[11px] text-sm font-semibold",
        active ? "bg-mint font-bold text-primary" : "text-slate-600 hover:bg-mist",
      )}
    >
      <Icon className="size-[19px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
      {item.label}
    </Link>
  );
}

// Ops sidebar item (forest, DESIGN_BRIEF §6.4): active is a light wash with a gold icon; counts as pills.
export function OpsLink({ item, exact = false }: { item: NavItem; exact?: boolean }) {
  const active = useActive(item.href, exact);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-xl px-3 py-[11px] text-sm font-semibold whitespace-nowrap",
        active ? "bg-white/10 font-bold text-white" : "text-[#BBF7D0] hover:bg-white/5",
      )}
    >
      <Icon className={cn("size-[18px]", active ? "text-gold" : "text-[#86EFAC]")} aria-hidden />
      {item.label}
      {item.count !== undefined && (
        <span
          className={cn(
            "tabular ml-auto rounded-full px-2 py-px text-[11px] font-semibold text-white",
            item.alert ? "bg-danger" : "bg-primary",
          )}
        >
          {item.count}
        </span>
      )}
    </Link>
  );
}

// Phone bottom nav item; the middle "Request" item is a raised green square (DESIGN_BRIEF §6.2).
export function BottomNavLink({ item, raised = false, exact = false }: { item: NavItem; raised?: boolean; exact?: boolean }) {
  const active = useActive(item.href, exact);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-[62px] flex-col items-center gap-1 text-[11px] font-medium",
        active || raised ? "font-bold text-primary" : "text-slate-400",
      )}
    >
      {raised ? (
        <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#16A34A] to-primary-dark shadow-primary">
          <Icon className="size-6 text-white" strokeWidth={2.6} aria-hidden />
        </span>
      ) : (
        <span className={cn("grid place-items-center rounded-full px-4 py-1", active && "bg-mint")}>
          <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
        </span>
      )}
      {item.label}
    </Link>
  );
}

// The nav lists live here (client side): icon components can't be passed from server components.

const USER_NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: House },
  { href: "/app/pickups", label: "Pickups", icon: List },
  { href: "/app/wallet", label: "Wallet", icon: Wallet },
  { href: "/app/impact", label: "Impact", icon: Leaf },
  { href: "/app/settings", label: "Settings", icon: SlidersHorizontal },
];

const OPS_NAV: NavItem[] = [
  { href: "/ops-portal", label: "Overview", icon: LayoutDashboard },
  { href: "/ops-portal/pickups", label: "Pickups", icon: Truck },
  { href: "/ops-portal/disputes", label: "Disputes", icon: AlertTriangle },
  { href: "/ops-portal/withdrawals", label: "Withdrawals", icon: Wallet },
  { href: "/ops-portal/prices", label: "Prices", icon: Tag },
  { href: "/ops-portal/users", label: "Users and collectors", icon: Users },
  { href: "/ops-portal/stock", label: "Stock and bales", icon: Boxes },
];

export function UserSidebarNav() {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {USER_NAV.map((item) => (
        <SidebarLink key={item.href} item={item} exact={item.href === "/app"} />
      ))}
    </nav>
  );
}

export function UserBottomNav() {
  const [home, pickups, wallet, impact] = USER_NAV as [NavItem, NavItem, NavItem, NavItem];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between border-t border-border bg-card px-3 pt-2.5 pb-5 lg:hidden"
    >
      <BottomNavLink item={home} exact />
      <BottomNavLink item={{ href: "/app/request", label: "Request", icon: Plus }} raised />
      <BottomNavLink item={pickups} />
      <BottomNavLink item={wallet} />
      <BottomNavLink item={impact} />
    </nav>
  );
}

export type OpsCounts = { pickups: number; disputes: number; withdrawals: number };

// Pickups (waiting requests), Disputes (red when any are open) and Withdrawals (pending) carry counts (§6.4).
export function OpsNav({ counts }: { counts?: OpsCounts }) {
  const withCounts = OPS_NAV.map((item) => {
    if (!counts) return item;
    if (item.href === "/ops-portal/pickups") return { ...item, count: counts.pickups };
    if (item.href === "/ops-portal/disputes") return { ...item, count: counts.disputes, alert: counts.disputes > 0 };
    if (item.href === "/ops-portal/withdrawals") return { ...item, count: counts.withdrawals };
    return item;
  });
  return (
    <nav aria-label="Ops portal" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {withCounts.map((item) => (
        <OpsLink key={item.href} item={item} exact={item.href === "/ops-portal"} />
      ))}
    </nav>
  );
}
