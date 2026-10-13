import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";

import { OfflineBanner } from "@/components/brand/offline-banner";
import { Toaster } from "@/components/ui/sonner";

import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

import "./globals.css";

// Fonts (docs/DESIGN_BRIEF.md §5.4): display and balances, UI and body, numbers and codes.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// latin-ext too: it holds "₦" (U+20A6), which is on almost every screen in this font. With latin only, the browser
// found the latin-ext file late (after rendering the first ₦) and chained a second font download.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "PlastiCash by EcoCyclers", template: "%s · PlastiCash" },
  description: SITE_DESCRIPTION,
  applicationName: "PlastiCash",
  openGraph: {
    type: "website",
    siteName: "PlastiCash by EcoCyclers",
    locale: "en_NG",
    title: "PlastiCash: your plastic is money",
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "PlastiCash: your plastic is money", description: SITE_DESCRIPTION },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#052E16",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="plasticash"
      className={`${bricolage.variable} ${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <OfflineBanner />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
