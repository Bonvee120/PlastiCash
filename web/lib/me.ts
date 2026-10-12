import { api } from "@/lib/api";

export type Role = "USER" | "COLLECTOR" | "ADMIN";

// GET /me response (api/app/schemas.py MeOut).
export type Me = {
  id: string;
  role: Role;
  account_type: "INDIVIDUAL" | "ORGANIZATION" | null;
  display_name: string;
  full_name: string;
  email: string;
  phone: string;
  address: string | null;
  area: string | null;
  org_name: string | null;
  org_type: string | null;
  cac_number: string | null;
  verified_picker: boolean;
  bank: { bank_name: string; account_name: string; account_number_last4: string } | null;
};

// Where each role lands. Area layouts send anyone with the wrong role to their own area (UX only;
// the API checks the role on every call).
export const ROLE_HOME: Record<Role, string> = {
  USER: "/app",
  COLLECTOR: "/collector",
  ADMIN: "/ops-portal",
};

export type MeState =
  | { kind: "ok"; me: Me }
  | { kind: "logged-out" }
  | { kind: "no-profile" }
  | { kind: "inactive"; message: string };

export async function loadMe(): Promise<MeState> {
  const result = await api<Me>("/me");
  if (result.ok) return { kind: "ok", me: result.data };
  if (result.status === 401) return { kind: "logged-out" };
  if (result.status === 404 && result.error.code === "PROFILE_NOT_FOUND") return { kind: "no-profile" };
  if (result.status === 403 && result.error.code === "ACCOUNT_INACTIVE") {
    return { kind: "inactive", message: result.error.message };
  }
  throw new Error(`GET /me failed: ${result.status} ${result.error.code}`);
}

// "Welcome, Chinaza" / "Welcome, Green Hills School"; just "Welcome" if there is no name (PRD U2).
export function greeting(me: Me) {
  return me.display_name ? `Welcome, ${me.display_name}` : "Welcome";
}
