import { createClient } from "@/lib/supabase/server";

// ESG PDF download: the browser can't send the Supabase token on a plain link, so this handler fetches the PDF from
// FastAPI with the signed-in user's token and passes it through. FastAPI decides who may have it (organizations only).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of ["year", "month"]) {
    const value = searchParams.get(key);
    if (value && /^\d{1,4}$/.test(value)) query.set(key, value);
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return Response.json({ code: "UNAUTHORIZED", message: "Log in again.", details: {} }, { status: 401 });

  const upstream = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reports/esg?${query}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const headers = new Headers({ "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream" });
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) headers.set("Content-Disposition", disposition);
  headers.set("Cache-Control", "private, no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
