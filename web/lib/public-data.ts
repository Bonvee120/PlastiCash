import { cacheLife, cacheTag } from "next/cache";

import type { CurrentPrice } from "@/lib/types";

// Public API data for the landing page and the guide: no cookies, no login, the same for everyone. Cached, so those
// pages are prerendered with prices already in the HTML (fast LCP) instead of waiting on the API per visit.
// A failed fetch is cached for seconds only, so an API hiccup at build time can't stick for an hour.

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export type Totals = { kg_recycled: string; points_paid_kobo: number; co2_kg: string; pickups: number };

async function publicGet<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(10_000) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function getCurrentPrices(): Promise<CurrentPrice[] | null> {
  "use cache";
  cacheTag("prices");
  const prices = await publicGet<CurrentPrice[]>("/prices/current");
  if (prices) cacheLife("minutes");
  else cacheLife("seconds");
  return prices;
}

export async function getImpactTotals(): Promise<Totals | null> {
  "use cache";
  cacheTag("impact-total");
  const totals = await publicGet<Totals>("/impact/total");
  if (totals) cacheLife("hours");
  else cacheLife("seconds");
  return totals;
}

// For logged-in pages that need prices to work (request form, weigh form): same cached data, error page if missing.
export async function pricesOrThrow(): Promise<CurrentPrice[]> {
  const prices = await getCurrentPrices();
  if (!prices) throw new Error("GET /prices/current failed");
  return prices;
}
