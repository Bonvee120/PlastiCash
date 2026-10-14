"use server";

import { updateTag } from "next/cache";

import type { ActionResult } from "@/lib/actions";
import type { AdminPickup, AdminWithdrawal, Bale, PriceVersion, UserRow } from "@/lib/admin-types";
import { api } from "@/lib/api";
import type { ClimateEvent, HeroSlide, Post } from "@/lib/content-format";
import type { Material } from "@/lib/types";

// Ops portal writes. The API checks the ADMIN role on every one (CLAUDE.md rule 7).

async function call<T>(path: string, method: string, body?: unknown): Promise<ActionResult<T>> {
  const result = await api<T>(path, { method, body });
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
}

export async function assignPickup(id: string, collector_id: string, scheduled_date: string) {
  return call<AdminPickup>(`/admin/pickups/${id}/assign`, "POST", { collector_id, scheduled_date });
}

export async function adminCancelPickup(id: string, reason: string) {
  return call<AdminPickup>(`/admin/pickups/${id}/cancel`, "POST", { reason: reason || null });
}

export async function resolveDispute(id: string, items: { material: Material; net_kg: string }[], note: string) {
  return call<AdminPickup>(`/admin/pickups/${id}/resolve`, "POST", { items, note });
}

export async function addPrice(body: {
  material: Material;
  price_kobo_per_kg: number;
  kg_per_full_sack: string;
  items_per_kg: number | null;
  co2_kg_saved_per_kg: string;
}) {
  const result = await call<PriceVersion>("/admin/prices", "POST", body);
  if (result.ok) updateTag("prices"); // the landing page and guide show the new price right away
  return result;
}

export async function approveWithdrawal(id: string) {
  return call<AdminWithdrawal>(`/admin/withdrawals/${id}/approve`, "POST");
}

export async function rejectWithdrawal(id: string, reason: string) {
  return call<AdminWithdrawal>(`/admin/withdrawals/${id}/reject`, "POST", { reason });
}

export async function updateUser(id: string, body: { is_active?: boolean; verified_picker?: boolean; role?: string }) {
  return call<UserRow>(`/admin/users/${id}`, "PATCH", body);
}

export async function createCollector(body: { full_name: string; email: string; phone: string; area: string | null; password: string }) {
  return call<UserRow>("/admin/collectors", "POST", body);
}

export async function adjustBalance(user_id: string, amount_kobo: number, note: string) {
  return call<{ id: string }>("/admin/ledger/adjustments", "POST", { user_id, amount_kobo, note });
}

export async function createBale(material: Material, weight_kg: string) {
  return call<Bale>("/admin/bales", "POST", { material, weight_kg });
}

export async function processBale(id: string) {
  return call<Bale>(`/admin/bales/${id}/process`, "POST");
}

export async function sellBale(id: string, buyer: string, sale_price_kobo: number) {
  return call<Bale>(`/admin/bales/${id}/sell`, "POST", { buyer, sale_price_kobo });
}

// ----- Notifications for new pickup requests -----

export type NewRequest = { id: string; user_name: string; area: string | null; estimated_kg: string | null; pooled: boolean; created_at: string };

export async function pollNewRequests(after: string | null) {
  return call<{ cursor: string; items: NewRequest[] }>(
    `/admin/pickups/new${after ? `?after=${encodeURIComponent(after)}` : ""}`,
    "GET",
  );
}

export async function pushPublicKey() {
  return call<{ public_key: string | null }>("/push/public-key", "GET");
}

export async function savePushSubscription(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  return call<null>("/push/subscriptions", "POST", subscription);
}

export async function deletePushSubscription(endpoint: string) {
  return call<null>("/push/subscriptions", "DELETE", { endpoint });
}

export async function sendTestPush() {
  return call<{ sent: number }>("/push/test", "POST");
}

// ----- Content: blog, events, hero slides (each change refreshes the public pages that show it) -----

export type PostInput = { title: string; excerpt: string; byline: string | null; body_md: string; cover_url: string | null; publish: boolean };

export async function createPost(body: PostInput) {
  const result = await call<Post>("/admin/posts", "POST", body);
  if (result.ok) updateTag("blog");
  return result;
}

export async function updatePost(id: string, body: Partial<PostInput>) {
  const result = await call<Post>(`/admin/posts/${id}`, "PATCH", body);
  if (result.ok) updateTag("blog");
  return result;
}

export async function deletePost(id: string) {
  const result = await call<null>(`/admin/posts/${id}`, "DELETE");
  if (result.ok) updateTag("blog");
  return result;
}

export type EventInput = Omit<ClimateEvent, "id">;

export async function saveEvent(id: string | null, body: EventInput) {
  const result = id ? await call<ClimateEvent>(`/admin/events/${id}`, "PATCH", body) : await call<ClimateEvent>("/admin/events", "POST", body);
  if (result.ok) updateTag("events");
  return result;
}

export async function deleteEvent(id: string) {
  const result = await call<null>(`/admin/events/${id}`, "DELETE");
  if (result.ok) updateTag("events");
  return result;
}

export async function createSlide(body: { image_url: string; headline: string; subline: string | null; position: number }) {
  const result = await call<HeroSlide>("/admin/hero-slides", "POST", body);
  if (result.ok) updateTag("hero");
  return result;
}

export async function updateSlide(id: string, body: Partial<Omit<HeroSlide, "id">>) {
  const result = await call<HeroSlide>(`/admin/hero-slides/${id}`, "PATCH", body);
  if (result.ok) updateTag("hero");
  return result;
}

export async function deleteSlide(id: string) {
  const result = await call<null>(`/admin/hero-slides/${id}`, "DELETE");
  if (result.ok) updateTag("hero");
  return result;
}

