// Public contact details shown in the app. Set in web/.env.local; the hub falls back to the brief's address.
export const HUB = {
  address: process.env.NEXT_PUBLIC_HUB_ADDRESS || "14 Ogui Road",
  hours: "Mon to Sat, 8 am to 5 pm",
};

const whatsapp = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
// wa.me link, or null if no number is set yet (the link is then hidden).
export const WHATSAPP_URL = whatsapp.length >= 10 ? `https://wa.me/${whatsapp}` : null;
