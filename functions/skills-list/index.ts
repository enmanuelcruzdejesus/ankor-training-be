// supabase/functions/skills-list/index.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  };
}
const json = (body: unknown, status = 200, origin: string | null = "*") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });

// Simple UUID check
const RE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "*";

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405, origin);
  }

  // ---- Env guard (friendly error rather than throwing) ----
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(
      { ok: false, error: "Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      500,
      origin,
    );
  }

  // ---- Parse & validate query params ----
  const url = new URL(req.url);
  const org_id = url.searchParams.get("org_id") ?? "";
  const sport_id = url.searchParams.get("sport_id") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  if (!RE_UUID.test(org_id)) {
    return json({ ok: false, error: "org_id (UUID) is required" }, 400, origin);
  }
  if (sport_id && !RE_UUID.test(sport_id)) {
    return json({ ok: false, error: "sport_id must be a UUID if provided" }, 400, origin);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- Build query (service role bypasses RLS; we still filter by org) ----
  let query = supabase
    .from("skills")
    .select("id, org_id, sport_id, category, title, description, level, visibility, status, created_at, updated_at", { count: "exact" })
    .eq("org_id", org_id)
    .order("title", { ascending: true })
    .range(offset, offset + (limit - 1));

  if (sport_id) query = query.eq("sport_id", sport_id);
  if (q) {
    // title OR category case-insensitive
    query = query.or(`title.ilike.%${q}%,category.ilike.%${q}%`);
  }

  const { data, count, error } = await query;
  if (error) {
    return json({ ok: false, error: error.message }, 500, origin);
  }

  return json({ ok: true, count, items: data ?? [] }, 200, origin);
});
