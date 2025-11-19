import { ScorecardTemplateCreateSchema } from "../schemas/schemas.ts";
import { badRequest, json, serverError } from "../utils/responses.ts";
import { rpcCreateScorecardTemplate } from "../services/scorecards.ts";
import { ANON_KEY } from "../config/env.ts";

export async function handleScorecardsCreateTemplate(req: Request, origin: string | null) {
  if (req.method !== "POST") return badRequest("Method not allowed", origin);

  const raw = await req.json().catch(() => null);
  const parsed = ScorecardTemplateCreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return badRequest(msg, origin);
  }
  const body = parsed.data;

  const authHeader = req.headers.get("authorization") ?? "";
  const hasBearer = authHeader.toLowerCase().startsWith("bearer ");
  if (!hasBearer && !body.createdBy) {
    return badRequest("createdBy (UUID) is required without Authorization: Bearer", origin);
  }

  // Normalize category/subskill positions
  const categories = body.categories.map((c, i) => ({
    name: c.name.trim(),
    description: c.description ?? null,
    position: Number.isFinite(c.position as any) ? Number(c.position) : i + 1,
    subskills: c.subskills.map((s, j) => ({
      name: s.name.trim(),
      description: s.description ?? null,
      position: Number.isFinite(s.position as any) ? Number(s.position) : j + 1,
      skill_id: s.skill_id,
    })),
  }));

  const payload = {
    org_id: body.org_id,
    sport_id: body.sport_id ?? null,
    name: body.name.trim(),
    description: body.description ?? null,
    isActive: body.isActive ?? true,
    categories,
  };

  const rpcArgs: Record<string, unknown> = { p_template: payload };
  if (!(hasBearer && ANON_KEY)) rpcArgs.p_created_by = body.createdBy!;

  const { data: rpcData, error: rpcErr } = await rpcCreateScorecardTemplate(rpcArgs);
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

    return serverError(friendly ?? `Failed to create template: ${m}`, origin);
  }

  const result = rpcData[0];
  return json({ ok: true, templateId: result.template_id }, origin, 201);
}
