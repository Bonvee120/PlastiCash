// Shapes of the FastAPI responses the web app uses (api/app/schemas.py, api/app/pickup_schemas.py).
// Money is integer kobo plus `points` (1 point = ₦1) as a decimal string; kg are decimal strings.

export type Material = "PET" | "PLASTIC" | "SACHET" | "CAN" | "TIN";
export type PickupStatus =
  | "REQUESTED"
  | "ASSIGNED"
  | "EN_ROUTE"
  | "AWAITING_CONFIRMATION"
  | "DISPUTED"
  | "COMPLETED"
  | "CANCELLED";

export type CurrentPrice = {
  material: Material;
  price_kobo_per_kg: number;
  points_per_kg: string;
  kg_per_full_sack: string;
  items_per_kg: number | null;
  co2_kg_saved_per_kg: string;
};

export type EstimateItem = { material: Material; sacks?: string; item_count?: number };
export type Estimate = {
  items: { material: Material; kg: string; amount_kobo: number; points: string }[];
  total_kg: string;
  amount_kobo: number;
  points: string;
  door_min_kg: number;
  meets_door_minimum: boolean;
  kg_to_minimum: string;
};

export type PickupItem = {
  material: Material;
  gross_kg: string;
  deduction_kg: string;
  deduction_reason: string | null;
  net_kg: string;
  price_kobo_per_kg: number;
  amount_kobo: number;
  points: string;
};

export type Pickup = {
  id: string;
  status: PickupStatus;
  channel: "DOOR" | "HUB";
  area: string | null;
  address: string | null;
  lat: string | null;
  lng: string | null;
  preferred_date: string | null;
  preferred_window: "MORNING" | "AFTERNOON" | null;
  scheduled_date: string | null;
  pooled: boolean;
  estimated_kg: string | null;
  estimate_note: string | null;
  items: PickupItem[];
  total_net_kg: string | null;
  total_amount_kobo: number | null;
  points: string | null;
  under_minimum: boolean;
  weigh_photo_url: string | null;
  weighed_at: string | null;
  auto_confirm_at: string | null;
  confirmed_at: string | null;
  confirmed_via: "APP" | "OTP" | "AUTO" | "ADMIN" | null;
  dispute_claimed_kg: string | null;
  dispute_reason: string | null;
  resolution_note: string | null;
  cancelled_reason: string | null;
  created_at: string;
  collector_first_name: string | null;
  collector_position: { lat: string; lng: string; at: string | null } | null;
  qr_token: string | null;
};

export type LedgerEntry = {
  id: string;
  type: "PICKUP_CREDIT" | "WITHDRAWAL_HOLD" | "WITHDRAWAL_REVERSAL" | "ADJUSTMENT";
  amount_kobo: number;
  points: string;
  pickup_id: string | null;
  withdrawal_id: string | null;
  note: string | null;
  created_at: string;
};

export type Wallet = { balance_kobo: number; points: string; entries: LedgerEntry[]; total_entries: number };

export type Withdrawal = {
  id: string;
  amount_kobo: number;
  points: string;
  status: "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "REJECTED";
  bank_name: string;
  account_name: string;
  account_number_last4: string;
  failure_reason: string | null;
  created_at: string;
  paid_at: string | null;
};

export type Impact = {
  total_kg: string;
  co2_kg: string;
  pickups: number;
  earned_kobo: number;
  earned_points: string;
  by_material: { material: Material; kg: string; co2_kg: string }[];
};

export const MATERIALS: { value: Material; label: string; hint: string }[] = [
  { value: "PET", label: "PET bottles", hint: "Water and soft-drink bottles" },
  { value: "PLASTIC", label: "Hard plastic", hint: "Containers, buckets, chairs" },
  { value: "SACHET", label: "Sachets and nylon", hint: "Pure-water sachets, bags" },
  { value: "CAN", label: "Cans", hint: "Drink cans (aluminium)" },
  { value: "TIN", label: "Tins", hint: "Tomato and milk tins" },
];

export const materialLabel = (m: Material) => MATERIALS.find((x) => x.value === m)?.label ?? m;

// GET /collector/pickups[/id] (CollectorPickupOut): the customer's first name only, never their phone (rule 8).
export type CollectorPickup = Omit<Pickup, "collector_first_name" | "collector_position" | "qr_token"> & {
  estimate_sacks: string | null;
  request_photo_url: string | null;
  customer_name: string;
  qr_scanned: boolean;
  otp_locked: boolean;
};
export type WeighResult = { pickup: CollectorPickup; sms_sent: boolean };
export type WeighItemIn = { material: Material; gross_kg: string; deduction_kg: string; deduction_reason: string | null };
