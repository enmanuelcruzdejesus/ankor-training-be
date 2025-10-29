// supabase/functions/auth-signup/index.ts
// Deno-only friendly: works with or without the Supabase CLI.
// Adds MOCK_SUPABASE mode for offline testing (no network).

/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Load .env from CWD when running locally with Deno
import "https://deno.land/std@0.224.0/dotenv/load.ts";

// Use esm.sh so we don't need a deno.json npm mapping
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

// -------- _shared imports (relative path from function folder) ----------
import { corsHeaders, allowOrigin } from "../_shared/cors.ts";
import { json, badRequest, conflict, serverError } from "../_shared/response.ts";
import { passwordSchema } from "../_shared/validation.ts";

// -------- Env + mock switch ----------
const MOCK = Deno.env.get("MOCK_SUPABASE") === "1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!MOCK && (!SUPABASE_URL || !SERVICE_KEY)) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabaseAdmin = MOCK
  ? null
  : createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// -------- Helpers ----------
const ALLOWED_POS = ["attack","midfield","defense","faceoff","goalie"] as const;
type AllowedPos = (typeof ALLOWED_POS)[number];

function normalizePosition(s: string): AllowedPos | "__invalid__" {
  const n = s.trim().toLowerCase().replace(/\s+/g, "");
  return (ALLOWED_POS as readonly string[]).includes(n) ? (n as AllowedPos) : "__invalid__";
}

// -------- Request schema (new signatures) ----------
const AthleteSchema = z.object({
  role: z.literal("athlete"),
  joinCode: z.string().trim().min(1, "Join code is required"),
  email: z.string().email("Valid email required"),
  password: passwordSchema,
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  cellNumber: z.string().optional(),
  graduationYear: z.number({ coerce: true }).int().min(1900).max(2100),
  positions: z.array(z.string()).nonempty("At least one position is required"),
  termsAccepted: z.literal(true),
  username: z.string().trim().min(3).max(50).optional(),
});

const CoachSchema = z.object({
  role: z.literal("coach"),
  joinCode: z.string().trim().min(1, "Join code is required"),
  email: z.string().email("Valid email required"),
  password: passwordSchema,
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  cellNumber: z.string().optional(),
  termsAccepted: z.literal(true),
  username: z.string().trim().min(3).max(50).optional(),
});

const ParentSchema = z.object({
  role: z.literal("parent"),
  joinCode: z.string().trim().min(1, "Join code is required"),
  email: z.string().email("Valid email required"),
  password: passwordSchema,
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  cellNumber: z.string().optional(),
  termsAccepted: z.literal(true),
  username: z.string().trim().min(3).max(50).optional(),
});

const SignUpSchema = z.discriminatedUnion("role", [AthleteSchema, CoachSchema, ParentSchema]);

// -------- Handler ----------
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(allowOrigin(origin)) });
  }

  try {
    if (req.method !== "POST") {
      return badRequest("Use POST", origin);
    }

    const payload = await req.json().catch(() => null);
    const parsed = SignUpSchema.safeParse(payload);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return badRequest(msg, origin);
    }

    const base = parsed.data as any; // one of AthleteSchema | CoachSchema | ParentSchema
    const { role, joinCode, email, password, firstName, lastName } = base;

    // ===== MOCK MODE =====
    if (MOCK) {
      const mockUserId = crypto.randomUUID();
      return json({
        ok: true,
        user_id: mockUserId,
        role,
        org_id: crypto.randomUUID(),
        team_id: crypto.randomUUID(),
        ...(role === "athlete"
          ? { athlete_id: crypto.randomUUID() }
          : role === "coach"
            ? { coach_id: crypto.randomUUID() }
            : { guardian_id: crypto.randomUUID() }),
        message: "(MOCK) Welcome to ANKOR! Redirecting to dashboard…",
      }, origin, 201);
    }

    // ===== REAL SUPABASE MODE =====
    const { data: created, error: createErr } =
      await supabaseAdmin!.auth.admin.createUser({
        email,
        password,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          username: base.username ?? null,
          cell_number: base.cellNumber ?? null,
          join_code: joinCode,
          ...(role === "athlete"
            ? { graduation_year: base.graduationYear, positions: base.positions }
            : {})
        },
        app_metadata: { role },
        email_confirm: false,
      });

    if (createErr) {
      if (String(createErr.message).toLowerCase().includes("user already registered")) {
        return conflict("Email already registered", origin);
      }
      return serverError(`Failed to create user: ${createErr.message}`, origin);
    }

    const userId = created.user?.id;
    if (!userId) return serverError("User was not returned by Supabase", origin);

    // ---- Build correct RPC call per the NEW SQL signatures ----
    let rpcName = "";
    let rpcArgs: Record<string, unknown> = {};

    if (role === "athlete") {
      // normalize & validate positions
      const normalized = (base.positions as string[]).map(normalizePosition);
      const invalid = normalized.filter((p) => p === "__invalid__");
      if (invalid.length > 0) {
        return badRequest("Invalid position value(s). Allowed: Attack, Midfield, Defense, Face Off, Goalie.", origin);
      }
      const positions = normalized as AllowedPos[];

      rpcName = "signup_register_athlete_with_code_tx";
      rpcArgs = {
        p_user_id: userId,
        p_code: joinCode,
        p_first_name: firstName,
        p_last_name: lastName,
        p_email: email,
        p_graduation_year: base.graduationYear,
        p_cell_number: base.cellNumber ?? null,
        p_positions: positions,          // -> public.lax_position[]
        p_terms_accepted: true
      };
    } else if (role === "coach") {
      rpcName = "signup_register_coach_with_code_tx";
      rpcArgs = {
        p_user_id: userId,
        p_code: joinCode,
        p_first_name: firstName,
        p_last_name: lastName,
        p_email: email,
        p_cell_number: base.cellNumber ?? null,
        p_terms_accepted: true
      };
    } else {
      rpcName = "signup_register_parent_with_code_tx";
      rpcArgs = {
        p_user_id: userId,
        p_code: joinCode,
        p_first_name: firstName,
        p_last_name: lastName,
        p_email: email,
        p_cell_number: base.cellNumber ?? null,
        p_terms_accepted: true
      };
    }

    const { data: txData, error: txErr } = await supabaseAdmin!.rpc(rpcName, rpcArgs);

    if (txErr) {
      // cleanup auth user if DB setup failed
      await supabaseAdmin!.auth.admin.deleteUser(userId).catch(() => {});
      const m = String(txErr.message);

      // Map common SQL exceptions to user-friendly messages
      if (m.includes("INVALID_JOIN_CODE") || m.includes("EXPIRED_OR_USED_JOIN_CODE")) {
        return badRequest("Invalid or expired join code.", origin);
      }
      if (m.includes("TERMS_REQUIRED")) {
        return badRequest("You must accept the terms & conditions.", origin);
      }
      if (m.includes("GRADUATION_YEAR_REQUIRED")) {
        return badRequest("Graduation year is required.", origin);
      }
      if (m.includes("POSITION_REQUIRED")) {
        return badRequest("At least one position is required.", origin);
      }
      if (m.includes("FIRST_NAME_REQUIRED")) {
        return badRequest("First name is required.", origin);
      }
      if (m.includes("LAST_NAME_REQUIRED")) {
        return badRequest("Last name is required.", origin);
      }
      if (m.includes("EMAIL_REQUIRED")) {
        return badRequest("Valid email is required.", origin);
      }

      return serverError(`Signup failed: ${m}`, origin);
    }

    const payloadOut = (Array.isArray(txData) && txData[0]) ? txData[0] : {};

    return json({
      ok: true,
      user_id: userId,
      role,
      ...payloadOut,
      message: "Welcome to ANKOR! Redirecting to dashboard…",
    }, origin, 201);

  } catch (err) {
    return serverError(`Unexpected error: ${(err as Error)?.message ?? String(err)}`, origin);
  }
});
