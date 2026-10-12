import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// The sign-up confirmation email links here with a one-time ?code=. Swap it for a session, then continue.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=confirm`);
}

// Only same-site paths, so the link can't send people to another website.
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}
