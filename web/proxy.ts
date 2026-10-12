import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// Next 16 renamed middleware.ts to proxy.ts (same behaviour). This is the session check the specs call middleware.ts.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except static files and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
