// supabase/functions/scorecards-create-template/index.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// If you have these in functions/_shared, import them instead.
// import { corsHeaders } from "../_shared/cors.ts";
// import { json } from "../_shared/response.ts";

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

type SubskillInput = {
  name: string;
  description?: string | null;
  position?: number;
  /** REQUIRED: UUID of the canonical Skill this subskill maps to */
  skill_id: string;
};

type CategoryInput = {
  name: string;
  description?: string | null;
  position?: number;
  subskills: SubskillInput[];
};

type Body = {
  /** Used only when no Authorization: Bearer JWT is provided */
  createdBy?: string;
  org_id: string;
  sport_id?: string | null;
  name: string;
  description?: string | null;
  isActive?: boolean;
  categories: CategoryInput[];
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// UUID regex
const RE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "*";

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, origin);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(
      { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      500,
      origin,
    );
  }

  // Parse & auth mode
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400, origin);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const hasBearer = authHeader.toLowerCase().startsWith("bearer ");
  if (!hasBearer && (!body?.createdBy || !RE_UUID.test(body.createdBy))) {
    return json(
      { ok: false, error: "createdBy (UUID) is required without Authorization: Bearer" },
      400,
      origin,
    );
  }

  // Basic validation
  if (!body?.org_id || !RE_UUID.test(body.org_id)) {
    return json({ ok: false, error: "org_id (UUID) is required" }, 400, origin);
  }
  if (body?.sport_id && !RE_UUID.test(body.sport_id)) {
    return json({ ok: false, error: "sport_id must be a UUID if provided" }, 400, origin);
  }
  if (!body?.name || !body.name.trim()) {
    return json({ ok: false, error: "Template name is required" }, 400, origin);
  }
  if (!Array.isArray(body?.categories) || body.categories.length < 1) {
    return json({ ok: false, error: "At least one category is required" }, 400, origin);
  }

  // Normalize payload; enforce ONLY skill_id per subskill
  const categories = [];
  for (let i = 0; i < body.categories.length; i++) {
    const c = body.categories[i];
    if (!c?.name || !c.name.trim()) {
      return json({ ok: false, error: `Category[${i}]: name is required` }, 400, origin);
    }
    if (!Array.isArray(c.subskills) || c.subskills.length < 1) {
      return json({ ok: false, error: `Category[${i}]: at least one subskill is required` }, 400, origin);
    }

    const position = Number.isFinite(c.position) ? Number(c.position) : i + 1;
    const subskills = [];

    for (let j = 0; j < c.subskills.length; j++) {
      const s = c.subskills[j];
      if (!s?.name || !s.name.trim()) {
        return json({ ok: false, error: `Category[${i}] Subskill[${j}]: name is required` }, 400, origin);
      }
      if (!s?.skill_id || !RE_UUID.test(s.skill_id)) {
        return json(
          { ok: false, error: `Category[${i}] Subskill[${j}]: skill_id must be a UUID` },
          400,
          origin,
        );
      }
      const subPos = Number.isFinite(s.position) ? Number(s.position) : j + 1;
      subskills.push({
        name: s.name.trim(),
        description: s.description ?? null,
        position: subPos,
        skill_id: s.skill_id, // <-- ONLY this key is sent now
      });
    }

    categories.push({
      name: c.name.trim(),
      description: c.description ?? null,
      position,
      subskills,
    });
  }

  const payload = {
    org_id: body.org_id,
    sport_id: body.sport_id ?? null,
    name: body.name.trim(),
    description: body.description ?? null,
    isActive: body.isActive ?? true,
    categories,
  };

  // Build client
  const supabase = createClient(
    SUPABASE_URL,
    hasBearer && ANON_KEY ? ANON_KEY : SERVICE_ROLE,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      ...(hasBearer && ANON_KEY ? { global: { headers: { authorization: authHeader } } } : {}),
    },
  );

  // RPC args: use auth.uid() when JWT present; otherwise createdBy
  const rpcArgs: Record<string, unknown> = { p_template: payload };
  if (!(hasBearer && ANON_KEY)) rpcArgs.p_created_by = body.createdBy!;

  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "create_scorecard_template_tx",
    rpcArgs,
  );

  if (rpcErr || !rpcData?.length) {
    const m = rpcErr?.message ?? "RPC returned no data";
    const friendly =
      m.includes("FORBIDDEN") ? "You do not have permission for this organization." :
      m.includes("CATEGORY_NEEDS_ONE_SUBSKILL") ? "Each category must have at least one subskill." :
      m.includes("SUBSKILL_SKILL_REQUIRED") ? "Each subskill must include a valid skill_id." :
      m.includes("SUBSKILL_SKILL_NOT_IN_ORG_OR_SPORT") ? "One or more skills do not belong to this org/sport." :
      m.includes("AT_LEAST_ONE_CATEGORY_REQUIRED") ? "At least one category is required." :
      m.includes("NAME_REQUIRED") ? "Template name is required." :
      m.includes("ORG_REQUIRED") ? "org_id is required." :
      null;

    return json({ ok: false, error: friendly ?? `Failed to create template: ${m}` }, 500, origin);
  }

  const result = rpcData[0];
  return json({ ok: true, templateId: result.template_id }, 201, origin);
});
