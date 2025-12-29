export const MOCK = Deno.env.get("MOCK_SUPABASE") === "1";

export const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
export const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
export const DRILLS_MEDIA_BUCKET = Deno.env.get("DRILLS_MEDIA_BUCKET") ?? "drill-media";

if (!MOCK && (!SUPABASE_URL || !SERVICE_KEY)) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}