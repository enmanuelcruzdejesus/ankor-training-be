import { SignUpSchema } from "../schemas/schemas.ts";
import { json, badRequest, conflict, serverError } from "../utils/responses.ts";
import { sbAdmin } from "../services/supabase.ts";
import { rpcRegisterAthlete, rpcRegisterCoach, rpcRegisterParent } from "../services/signup.service..ts";

const ALLOWED_POS = ["attack", "midfield", "defense", "faceoff", "goalie"] as const;
type AllowedPos = (typeof ALLOWED_POS)[number];
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

export async function handleAuthSignup(req: Request, origin: string | null) {
  if (req.method !== "POST") return badRequest("Use POST", origin);

  const payload = await req.json().catch(() => null);
  const parsed = SignUpSchema.safeParse(payload);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return badRequest(msg, origin);
  }
  const base = parsed.data as any; // athlete | coach | parent

  // Create auth user
  const { data: created, error: createErr } = await sbAdmin!.auth.admin.createUser({
    email: base.email,
    password: base.password,
    user_metadata: {
      first_name: base.firstName,
      last_name: base.lastName,
      username: base.username ?? null,
      cell_number: base.cellNumber ?? null,
      join_code: base.joinCode,
      ...(base.role === "athlete" ? { graduation_year: base.graduationYear, positions: base.positions } : {}),
    },
    app_metadata: { role: base.role },
    email_confirm: false,
  });

  if (createErr) {
    const m = String(createErr.message).toLowerCase();
    if (m.includes("user already registered")) return conflict("Email already registered", origin);
    return serverError(`Failed to create user: ${createErr.message}`, origin);
  }
  const userId = created.user?.id;
  if (!userId) return serverError("User was not returned by Supabase", origin);

  let rpcName = "";
  let rpcArgs: Record<string, unknown> = {};
  try {
    if (base.role === "athlete") {
      const normalized = (base.positions as string[]).map((p) => normalize(p)) as string[];
      const invalid = normalized.filter((p) => !ALLOWED_POS.includes(p as AllowedPos));
      if (invalid.length) return badRequest("Invalid position value(s).", origin);

      rpcName = "signup_register_athlete_with_code_tx";
      rpcArgs = {
        p_user_id: userId,
        p_code: base.joinCode,
        p_first_name: base.firstName,
        p_last_name: base.lastName,
        p_email: base.email,
        p_graduation_year: base.graduationYear,
        p_cell_number: base.cellNumber ?? null,
        p_positions: normalized as AllowedPos[],
        p_terms_accepted: true,
      };
      var { data: txData, error: txErr } = await rpcRegisterAthlete(rpcArgs);
    } else if (base.role === "coach") {
      rpcName = "signup_register_coach_with_code_tx";
      rpcArgs = {
        p_user_id: userId,
        p_code: base.joinCode,
        p_first_name: base.firstName,
        p_last_name: base.lastName,
        p_email: base.email,
        p_cell_number: base.cellNumber ?? null,
        p_terms_accepted: true,
      };
      var { data: txData, error: txErr } = await rpcRegisterCoach(rpcArgs);
    } else {
      rpcName = "signup_register_parent_with_code_tx";
      rpcArgs = {
        p_user_id: userId,
        p_code: base.joinCode,
        p_first_name: base.firstName,
        p_last_name: base.lastName,
        p_email: base.email,
        p_cell_number: base.cellNumber ?? null,
        p_terms_accepted: true,
      };
      var { data: txData, error: txErr } = await rpcRegisterParent(rpcArgs);
    }

    if (txErr) throw txErr;

    const out = (Array.isArray(txData) && txData[0]) ? txData[0] : {};
    return json({ ok: true, user_id: userId, role: base.role, ...out, message: "Welcome to ANKOR!" }, origin, 201);
  } catch (e) {
    // rollback auth user
    await sbAdmin!.auth.admin.deleteUser(userId).catch(() => {});
    const m = String((e as any)?.message ?? e);
    if (m.includes("INVALID_JOIN_CODE") || m.includes("EXPIRED_OR_USED_JOIN_CODE"))
      return badRequest("Invalid or expired join code.", origin);
    if (m.includes("TERMS_REQUIRED")) return badRequest("You must accept the terms & conditions.", origin);
    if (m.includes("GRADUATION_YEAR_REQUIRED")) return badRequest("Graduation year is required.", origin);
    if (m.includes("POSITION_REQUIRED")) return badRequest("At least one position is required.", origin);
    if (m.includes("FIRST_NAME_REQUIRED")) return badRequest("First name is required.", origin);
    if (m.includes("LAST_NAME_REQUIRED")) return badRequest("Last name is required.", origin);
    if (m.includes("EMAIL_REQUIRED")) return badRequest("Valid email is required.", origin);
    return serverError(`Signup failed: ${m}`, origin);
  }
}
