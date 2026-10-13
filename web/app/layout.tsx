import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";

import { OfflineBanner } from "@/components/brand/offline-banner";
import { Toaster } from "@/components/ui/sonner";

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

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "PlastiCash by EcoCyclers",
  description: "Your plastic is money. Sell your plastic in Enugu by weight and get paid to your bank.",
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
