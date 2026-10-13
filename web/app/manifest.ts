import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION } from "@/lib/site";

// Lets phones add PlastiCash to the home screen with the brand colours (it is a web app, not a native one).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PlastiCash by EcoCyclers",
    short_name: "PlastiCash",
    description: SITE_DESCRIPTION,
    start_url: "/app",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#052E16",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
