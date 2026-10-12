// Formatting for money, weights and dates. Money: "2,450 pts (₦2,450)" everywhere (DESIGN_BRIEF.md §4).

const whole = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 });

export function pts(kobo: number): string {
  return `${whole.format(kobo / 100)} pts`;
}

export function naira(kobo: number): string {
  return `₦${whole.format(kobo / 100)}`;
}

export function money(kobo: number): string {
  return `${pts(kobo)} (${naira(kobo)})`;
}

export function kg(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return `${Number(value).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kg`;
}

const LAGOS = "Africa/Lagos";

export function day(iso: string | null | undefined): string {
  if (!iso) return "–";
  const date = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: LAGOS }).format(date);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: LAGOS,
  }).format(new Date(iso));
}

export const WINDOW_LABEL = { MORNING: "9 am to 12 pm", AFTERNOON: "12 pm to 4 pm" } as const;

// Short human reference for a pickup id, e.g. "PC-3F2A".
export function ref(id: string): string {
  return `PC-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}
