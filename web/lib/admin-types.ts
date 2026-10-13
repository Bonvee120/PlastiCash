// Shapes of the /admin responses (api/app/admin_schemas.py, api/app/pickup_schemas.py AdminPickupOut).
import type { Material, Pickup, PickupItem, Withdrawal } from "@/lib/types";

export type Role = "USER" | "COLLECTOR" | "ADMIN";

export type Stats = {
  month_start: string;
  kg_this_month: string;
  points_paid_kobo: number;
  pending_withdrawals: { count: number; amount_kobo: number };
  open_disputes: number;
  waiting_requests: number;
  raw_stock_kg: string;
  estimate_accuracy: { user_id: string; name: string; pickups: number; estimated_kg: string; actual_kg: string; accuracy: string }[];
  disputes_per_collector: { collector_id: string; name: string; weighed: number; disputes: number }[];
};

export type AdminPickup = Omit<Pickup, "collector_first_name" | "collector_position" | "qr_token"> & {
  estimate_sacks: string | null;
  request_photo_url: string | null;
  user_id: string;
  user_name: string;
  collector_id: string | null;
  collector_name: string | null;
  dispute_photo_url: string | null;
  resolved_kg: string | null;
  user_estimate_accuracy: string | null;
  items: PickupItem[];
};

export type Board = {
  pickups: AdminPickup[];
  area_totals: { area: string; requests: number; pooled: number; estimated_kg: string }[];
};

export type PriceVersion = {
  id: string;
  material: Material;
  price_kobo_per_kg: number;
  points_per_kg: string;
  kg_per_full_sack: string;
  items_per_kg: number | null;
  co2_kg_saved_per_kg: string;
  effective_from: string;
  set_by: string | null;
};

export type AdminWithdrawal = Withdrawal & { user_id: string; user_name: string; reviewed_at: string | null };

export type UserRow = {
  id: string;
  role: Role;
  account_type: "INDIVIDUAL" | "ORGANIZATION" | null;
  name: string;
  full_name: string;
  email: string;
  phone: string;
  area: string | null;
  is_active: boolean;
  verified_picker: boolean;
  balance_kobo: number;
  created_at: string;
};

export type BaleStatus = "IN_STORE" | "PROCESSED" | "SOLD";

export type Bale = {
  id: string;
  code: string;
  material: Material;
  weight_kg: string;
  status: BaleStatus;
  buyer: string | null;
  sale_price_kobo: number | null;
  created_at: string;
  processed_at: string | null;
  sold_at: string | null;
};

export type Stock = {
  materials: { material: Material; raw_in_kg: string; baled_kg: string; raw_stock_kg: string; loss_pct: string | null }[];
  raw_in_kg: string;
  baled_kg: string;
  raw_stock_kg: string;
  loss_pct: string | null;
  bales_by_status: Record<BaleStatus, number>;
  revenue_kobo: number;
  bales: Bale[];
};
