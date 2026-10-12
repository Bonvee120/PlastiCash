"use client";

import { uploadSignature } from "@/lib/actions";

const MAX_BYTES = 5 * 1024 * 1024; // TRD: max upload 5 MB

// Upload a photo straight from the browser to Cloudinary with a signature from our API (TRD §2).
// Returns the secure URL, which is all we store.
export async function uploadPhoto(file: File, purpose: "request" | "weigh" | "dispute"): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPG or PNG).");
  if (file.size > MAX_BYTES) throw new Error("That photo is over 5 MB. Take a new one or choose a smaller one.");
  const signed = await uploadSignature(purpose);
  if (!signed.ok) throw new Error(signed.error.message);
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signed.data.api_key);
  form.append("timestamp", signed.data.timestamp);
  form.append("folder", signed.data.folder);
  form.append("signature", signed.data.signature);
  const response = await fetch(signed.data.upload_url, { method: "POST", body: form });
  if (!response.ok) throw new Error("The photo didn't upload. Check your connection and try again.");
  const { secure_url } = (await response.json()) as { secure_url: string };
  return secure_url;
}

// Cloudinary delivery URL resized for the screen (f_auto,q_auto,w_<size>; light on data).
export function photo(url: string | null | undefined, width = 640): string | undefined {
  if (!url) return undefined;
  return url.includes("/upload/") ? url.replace("/upload/", `/upload/f_auto,q_auto,w_${width}/`) : url;
}
