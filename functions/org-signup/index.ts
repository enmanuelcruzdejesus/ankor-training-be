// supabase/functions/org-signup/index.ts
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

type Body = {
  admin: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    password: string;
  };
  organization: {
    name: string;
    programGender: "girls" | "boys" | "coed";
  };
  teams?: Array<{ name: string }>;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "*";

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, origin);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400, origin);
  }

  // Basic validation (replace with your @shared/validation if you prefer)
  const admin = body?.admin;
  const org = body?.organization;
  const teams = body?.teams ?? [];
  if (!admin?.firstName || !admin?.lastName || !admin?.email || !admin?.password) {
    return json({ ok: false, error: "Missing admin fields" }, 400, origin);
  }
  if (!org?.name || !["girls", "boys", "coed"].includes(org.programGender)) {
    return json({ ok: false, error: "Invalid organization data" }, 400, origin);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Create Auth user
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: admin.email,
    password: admin.password,
    email_confirm: false,
    user_metadata: {
      first_name: admin.firstName,
      last_name: admin.lastName,
      role: "admin",
    },
  });
  if (createErr || !created?.user) {
    return json({ ok: false, error: `Could not create user: ${createErr?.message}` }, 400, origin);
  }

  const userId = created.user.id;

  // 2) Call transactional RPC (see SQL from earlier step)
  const teamNames = teams.map((t) => t?.name?.trim()).filter(Boolean);
  const { data: rpcData, error: rpcErr } = await supabase.rpc("signup_register_org_tx", {
    p_user_id: userId,
    p_first_name: admin.firstName,
    p_last_name: admin.lastName,
    p_email: admin.email,
    p_phone: admin.phone ?? null,
    p_org_name: org.name,
    p_program_gender: org.programGender,
    p_team_names: teamNames,
  });

  if (rpcErr || !rpcData?.length) {
    // Compensation: delete auth user to avoid orphaned accounts
    await supabase.auth.admin.deleteUser(userId);
    return json({ ok: false, error: `Signup failed: ${rpcErr?.message ?? "RPC returned no data"}` }, 500, origin);
  }

  const result = rpcData[0];
  return json({
    ok: true,
    userId,
    orgId: result.org_id,
    profileId: result.profile_id,
    teamIds: result.team_ids ?? [],
  }, 201, origin);
});
