import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client: login, sign-up, logout and (later) Realtime only.
// All app data goes through the FastAPI backend.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
