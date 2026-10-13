// Public contact details shown in the app. Set in web/.env.local; the hub falls back to the brief's address.
export const HUB = {
  address: process.env.NEXT_PUBLIC_HUB_ADDRESS || "14 Ogui Road",
  hours: "Mon to Sat, 8 am to 5 pm",
};

const whatsapp = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
// wa.me link, or null if no number is set yet (the link is then hidden).
export const WHATSAPP_URL = whatsapp.length >= 10 ? `https://wa.me/${whatsapp}` : null;

// Public base URL for canonical links, the sitemap and social cards. Set NEXT_PUBLIC_SITE_URL on Vercel once a domain
// exists; until then Vercel's production URL is used, and localhost in development.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const SITE_DESCRIPTION =
  "Sell your plastic in Enugu by weight. A verified EcoCyclers collector weighs it in front of you, you confirm, and you withdraw to your bank. 1 point = ₦1.";
