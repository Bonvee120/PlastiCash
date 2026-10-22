"use server";

import { api, type ApiErrorBody } from "@/lib/api";
import type { CollectorPickup, WeighItemIn, WeighResult } from "@/lib/types";

// Server actions shared by user screens. Every write goes through FastAPI with the user's token (CLAUDE.md rule 7).

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody };

async function call<T>(path: string, method: string, body?: unknown): Promise<ActionResult<T>> {
  const result = await api<T>(path, { method, body });
  return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
}

export type UploadSignature = {
  cloud_name: string;
  api_key: string;
  upload_url: string;
  allowed_formats: string;
  folder: string;
  timestamp: string;
  signature: string;
};

export type UploadPurpose = "request" | "weigh" | "dispute" | "blog" | "event" | "hero";

export async function uploadSignature(purpose: UploadPurpose) {
  return call<UploadSignature>("/uploads/signature", "POST", { purpose });
}

export async function createPickup(body: unknown) {
  return call<{ id: string; pooled: boolean }>("/pickups", "POST", body);
}

export async function cancelPickup(id: string, reason: string | null) {
  return call<{ id: string }>(`/pickups/${id}/cancel`, "POST", { reason });
}

export async function confirmPickup(id: string) {
  return call<{ id: string; total_amount_kobo: number }>(`/pickups/${id}/confirm`, "POST");
}

export async function disputePickup(id: string, body: { photo_url: string; claimed_kg: string; reason: string }) {
  return call<{ id: string }>(`/pickups/${id}/dispute`, "POST", body);
}

export async function requestWithdrawal(amount_kobo: number) {
  return call<{ id: string; amount_kobo: number }>("/withdrawals", "POST", { amount_kobo });
}

export async function resolveBank(bank_code: string, account_number: string) {
  return call<{ bank_name: string; account_name: string }>("/me/bank/resolve", "POST", { bank_code, account_number });
}

export async function saveBank(bank_code: string, account_number: string) {
  return call<{ bank: { bank_name: string; account_name: string; account_number_last4: string } }>("/me/bank", "POST", {
    bank_code,
    account_number,
  });
}

export async function updateProfile(body: Record<string, string>) {
  return call<{ display_name: string }>("/me", "PATCH", body);
}

// ----- Collector -----

export async function startTrip(id: string) {
  return call<CollectorPickup>(`/collector/pickups/${id}/start`, "POST");
}

export async function sendLocation(id: string, lat: number, lng: number) {
  return call<null>(`/collector/pickups/${id}/location`, "POST", { lat: lat.toFixed(6), lng: lng.toFixed(6) });
}

export async function scanQr(id: string, qr_token: string) {
  return call<CollectorPickup>(`/collector/pickups/${id}/scan`, "POST", { qr_token });
}

export async function weighPickup(id: string, photo_url: string, items: WeighItemIn[]) {
  return call<WeighResult>(`/collector/pickups/${id}/weigh`, "POST", { photo_url, items });
}

export async function confirmWithCode(id: string, code: string) {
  return call<CollectorPickup>(`/collector/pickups/${id}/otp`, "POST", { code });
}

export async function resendCode(id: string) {
  return call<WeighResult>(`/collector/pickups/${id}/resend-otp`, "POST");
}

export async function findCustomer(phone: string) {
  return call<{ id: string; name: string }>(`/collector/users/search?phone=${encodeURIComponent(phone)}`, "GET");
}

export async function walkIn(user_id: string, photo_url: string, items: WeighItemIn[]) {
  return call<WeighResult>("/collector/walk-ins", "POST", { user_id, photo_url, items });
}
