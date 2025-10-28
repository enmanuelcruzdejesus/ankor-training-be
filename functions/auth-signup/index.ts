// supabase/functions/auth-signup/index.ts
// Deno, TypeScript. Creates the auth user via Admin API, then completes DB work in a single RPC transaction.
// If DB work fails, it deletes the created auth user to avoid orphans.

// ✅ Use Edge runtime types (no std/http import needed)
/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// -------- _shared imports (relative path from function folder) ----------
import { corsHeaders, allowOrigin } from "../_shared/cors.ts";
import { json, badRequest, conflict, serverError } from "../_shared/response.ts";
import { passwordSchema, dateNotInFuture } from "../_shared/validation.ts";

// -------- Supabase Admin client (service role) ----------
import process from "node:process";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// -------- Request schema ----------
const SignUpSchema = z.object({
  joinCode: z.string().trim().min(1, "Join code is required"),
  role: z.enum(["athlete", "coach", "parent"]),
  email: z.string().email("Valid email required"),
  password: passwordSchema, // min 8, letters+numbers
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  username: z.string().trim().min(3).max(50), // stored in user_metadata (no DB constraint here)
  primary_position_id: z.string().uuid().optional(), // required for athletes
  height_cm: z.number().min(1).optional(), // >0 if provided
  weight_kg: z.number().min(1).optional(), // >0 if provided
  birthdate: z
    .string()
    .refine(dateNotInFuture, { message: "Birthdate cannot be in the future" })
    .optional(),
  notes: z.string().optional(),
  // optional for parent/coach:
  phone: z.string().optional(),
});

// -------- Handler ----------
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  // CORS preflight
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

    const {
      joinCode,
      role,
      email,
      password,
      firstName,
      lastName,
      username,
      primary_position_id,
      height_cm,
      weight_kg,
      birthdate,
      notes,
      phone,
    } = parsed.data;

    // Validate role-specific requirements
    if (role === "athlete" && !primary_position_id) {
      return badRequest("Primary position is required.", origin);
    }

    // Create auth user (unconfirmed -> let email verification flow handle confirmation)
    const full_name = `${firstName} ${lastName}`.trim();
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          username,
        },
        app_metadata: { role }, // useful for RLS
        email_confirm: false, // set to true to auto-confirm if you want to skip verification
      });

    if (createErr) {
      // Duplicate email handling
      if (String(createErr.message).toLowerCase().includes("user already registered")) {
        return conflict("Email already registered", origin);
      }
      return serverError(`Failed to create user: ${createErr.message}`, origin);
    }

    const userId = created.user?.id;
    if (!userId) {
      return serverError("User was not returned by Supabase", origin);
    }

    // Call the right RPC to finish the transactional work
    let rpcName = "";
    let rpcArgs: Record<string, unknown> = {};

    if (role === "athlete") {
      rpcName = "signup_register_athlete_with_code_tx";
      rpcArgs = {
        p_user_id: userId,
        p_code: joinCode,
        p_full_name: full_name,
        p_primary_position_id: primary_position_id,
        p_height_cm: height_cm ?? null,
        p_weight_kg: weight_kg ?? null,
        p_birthdate: birthdate ?? null,
        p_notes: notes ?? null,
      };
    } else if (role === "coach") {
      rpcName = "signup_register_coach_with_code_tx";
      rpcArgs = {
        p_user_id: userId,
        p_code: joinCode,
        p_full_name: full_name,
        p_email: email,
      };
    } else {
      // parent
      rpcName = "signup_register_parent_with_code_tx";
      rpcArgs = {
        p_user_id: userId,
        p_code: joinCode,
        p_full_name: full_name,
        p_email: email,
        p_phone: phone ?? null,
      };
    }

    const { data: txData, error: txErr } = await supabaseAdmin.rpc(rpcName, rpcArgs);
    if (txErr) {
      // Clean up the auth user if DB setup failed
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      const m = String(txErr.message);
      if (m.includes("INVALID_JOIN_CODE") || m.includes("EXPIRED_OR_USED_JOIN_CODE")) {
        return badRequest("Invalid or expired join code", origin);
      }
      if (m.includes("violates foreign key constraint") && role === "athlete") {
        return badRequest("Primary position is required.", origin);
      }
      return serverError(`Signup failed: ${m}`, origin);
    }

    // Success
    return json(
      {
        ok: true,
        user_id: userId,
        role,
        // txData contains org_id/team_id/(athlete_id|coach_id|guardian_id)
        ...((Array.isArray(txData) && txData[0]) ? txData[0] : {}),
        message: "Welcome to ANKOR! Redirecting to dashboard…",
      },
      origin,
      201,
    );
  } catch (err: unknown) {
    return serverError(`Unexpected error: ${(err as Error)?.message ?? String(err)}`, origin);
  }
});