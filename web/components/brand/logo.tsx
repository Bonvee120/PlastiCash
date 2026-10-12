import { cn } from "@/lib/utils";

// Logo (docs/DESIGN_BRIEF.md §5.1): a PET bottle with the naira sign inside and two amber bars breaking out.
// Same geometry as design/logo/plasticash-mark*.svg. "color" for light backgrounds, "white" for dark ones.
const COLORS = {
  color: { tile: "#15803D", bottle: "#FFFFFF", naira: "#15803D", bars: "#F59E0B" },
  white: { tile: "#FFFFFF", bottle: "#15803D", naira: "#FFFFFF", bars: "#F59E0B" },
} as const;

type Variant = keyof typeof COLORS;

export function LogoMark({ variant = "color", size = 40, className }: { variant?: Variant; size?: number; className?: string }) {
  const c = COLORS[variant];
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <rect width="64" height="64" rx="18" fill={c.tile} />
      <rect x="26" y="7.5" width="12" height="6" rx="2" fill={c.bottle} />
      <path
        d="M27.5 15.5h9v3.2c0 1.6 1.1 2.6 2.6 3.7 2.4 1.7 4.9 3.9 4.9 8.1V50a6 6 0 0 1-6 6H26a6 6 0 0 1-6-6V30.5c0-4.2 2.5-6.4 4.9-8.1 1.5-1.1 2.6-2.1 2.6-3.7z"
        fill={c.bottle}
      />
      <path d="M26.5 50V31.5l11 18.5V31.5" stroke={c.naira} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="13" y="36.5" width="38" height="3.8" rx="1.9" fill={c.bars} />
      <rect x="13" y="43" width="38" height="3.8" rx="1.9" fill={c.bars} />
    </svg>
  );
}

// "PlastiCash": "Cash" is green on light backgrounds and gold on dark ones. Optional sub-line under it.
export function Logo({
  variant = "color",
  size = 36,
  subline,
  className,
}: {
  variant?: Variant;
  size?: number;
  subline?: "by EcoCyclers" | "Ops portal";
  className?: string;
}) {
  const dark = variant === "white";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark variant={variant} size={size} />
      <span className="flex flex-col leading-none">
        <span
          className={cn("font-display font-extrabold tracking-[-0.04em]", dark ? "text-white" : "text-heading")}
          style={{ fontSize: Math.round(size * 0.62) }}
        >
          Plasti<span className={dark ? "text-gold" : "text-primary"}>Cash</span>
        </span>
        {subline && (
          <span className={cn("eyebrow mt-1 !text-[9px]", dark ? "text-[#86EFAC]" : "text-primary")}>{subline}</span>
        )}
      </span>
      <span className="sr-only">PlastiCash</span>
    </span>
  );
}
