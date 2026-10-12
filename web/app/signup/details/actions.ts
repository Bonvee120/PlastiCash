"use server";

import { redirect } from "next/navigation";

import { api } from "@/lib/api";

const FIELDS = ["account_type", "full_name", "phone", "address", "area", "org_name", "org_type", "cac_number"] as const;
type Field = (typeof FIELDS)[number];

export type DetailsState = {
  // Bumped on every submit; the form uses it as its React key so it rebuilds with the values below
  // (React resets forms after an action, and <select> would otherwise lose its value).
  attempt: number;
  values: Partial<Record<Field, string>>;
  fieldErrors: Partial<Record<Field, string>>;
  message: string | null;
};

// Sign-up step 2: POST /me/profile through FastAPI. On success the user goes to their dashboard.
export async function createProfile(previous: DetailsState, formData: FormData): Promise<DetailsState> {
  const attempt = previous.attempt + 1;
  const values = Object.fromEntries(FIELDS.map((field) => [field, String(formData.get(field) ?? "").trim()])) as Record<
    Field,
    string
  >;
  const isOrganization = values.account_type === "ORGANIZATION";

  // Plain-language "required" messages here; the API checks everything again.
  const required: Field[] = ["full_name", "phone", "address", "area", ...(isOrganization ? (["org_name", "org_type"] as Field[]) : [])];
  const missing = Object.fromEntries(
    required.filter((field) => !values[field]).map((field) => [field, "Please fill this in."]),
  ) as DetailsState["fieldErrors"];
  if (Object.keys(missing).length > 0) {
    return { attempt, values, fieldErrors: missing, message: "Some details are missing." };
  }

  const result = await api("/me/profile", {
    method: "POST",
    body: {
      account_type: values.account_type,
      full_name: values.full_name,
      phone: values.phone,
      address: values.address,
      area: values.area,
      ...(isOrganization
        ? { org_name: values.org_name, org_type: values.org_type || null, cac_number: values.cac_number || null }
        : {}),
    },
  });

  if (result.ok || result.error.code === "PROFILE_EXISTS") redirect("/app");

  const fieldErrors: DetailsState["fieldErrors"] = {};
  if (result.error.code === "PHONE_TAKEN") fieldErrors.phone = result.error.message;
  for (const error of result.error.details?.errors ?? []) {
    if ((FIELDS as readonly string[]).includes(error.field)) fieldErrors[error.field as Field] ??= error.message;
  }
  const unplaced = (result.error.details?.errors ?? []).find((error) => !error.field)?.message;
  return { attempt, values, fieldErrors, message: unplaced ?? result.error.message };
}
