import { connection } from "next/server";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

// Server-side calls to the FastAPI backend with the signed-in user's Supabase access token.
// Every read and write of app data goes through FastAPI, which checks role and ownership.

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export type ApiErrorBody = {
  code: string;
  message: string;
  details: { errors?: { field: string; message: string }[] } & Record<string, unknown>;
};

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiErrorBody };

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  // Per-request work (session cookie, clock): tell Next not to prerender past this point.
  await connection();
  const supabase = await createClient();
  // The proxy has already verified the JWT for this request; getSession() only reads the token from the cookie.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return { ok: true, status: response.status, data: payload as T };
  return {
    ok: false,
    status: response.status,
    error: (payload as ApiErrorBody) ?? { code: "UNKNOWN", message: "Something went wrong.", details: {} },
  };
}

// GETs deduplicated within one server request (React cache): the layout's /me and a page's /me are one API call.
// Each call is a round trip to the API and on to the database, so duplicates cost real time.
export const apiGet = cache((path: string) => api<unknown>(path));

// For pages: the data or an error (caught by app/error.tsx with a friendly retry screen).
export async function get<T>(path: string): Promise<T> {
  const result = (await apiGet(path)) as ApiResult<T>;
  if (!result.ok) throw new Error(`GET ${path} failed: ${result.status} ${result.error.code}`);
  return result.data;
}
