import path from "node:path";

import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
const origin = (url: string | undefined) => (url ? new URL(url).origin : "");
const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);

// The browser talks only to our API, Supabase (login and Realtime) and Cloudinary (photo uploads). Scripts stay
// 'unsafe-inline' because Next's inline bootstrap scripts need a nonce otherwise, which would make every page dynamic.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    origin(process.env.NEXT_PUBLIC_API_URL),
    supabase,
    supabase.replace(/^http/, "ws"),
    "https://api.cloudinary.com",
    dev ? "ws:" : "",
  ].filter(Boolean).join(" "),
  "media-src 'self' blob: mediastream:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  dev ? "" : "upgrade-insecure-requests",
].filter(Boolean).join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera for photos and the QR scanner, location for the pickup map; nothing else.
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  // Browsers still ask for /favicon.ico; the icon is app/icon.svg (the PlastiCash mark).
  // The service worker must always be fresh, or a fix to it could take a day to reach browsers.
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: true }];
  },
  turbopack: {
    // Repo root, so web/ can import the shared design tokens in ../design/theme.css (DESIGN_BRIEF.md §16).
    root: path.join(__dirname, ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
