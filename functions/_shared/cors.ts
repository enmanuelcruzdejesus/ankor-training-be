export function allowOrigin(origin: string | null) {
  const allowed = (globalThis.Deno?.env.get("ALLOWED_ORIGINS") || "*")
    .split(",")
    .map(s => s.trim());
  if (!origin) return "*";
  return allowed.includes("*") || allowed.includes(origin) ? origin : "*";
}
export function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
}
