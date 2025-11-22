// supabase/functions/_shared/controllers/scorecards.ts
import { ScorecardTemplateCreateSchema } from "../schemas/schemas.ts";
import { badRequest, json, serverError} from "../utils/responses.ts";
import { rpcCreateScorecardTemplate, listScorecardTemplates,listScorecardCategoriesByTemplate } from "../services/scorecards.service.ts";


// ---- Create Template ----
export async function handleScorecardsCreateTemplate(req: Request, origin: string | null) {
  if (req.method !== "POST") return badRequest("Method not allowed", origin);

  const raw = await req.json().catch(() => null);
  const parsed = ScorecardTemplateCreateSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return badRequest(msg, origin);
  }
  const body = parsed.data;

  // Auth mode: if no Bearer, createdBy is required
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
  // If you have a valid JWT (Bearer), SQL can use auth.uid(); otherwise use createdBy.
  if (!hasBearer) rpcArgs.p_created_by = body.createdBy!;

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

// ---- List Templates ----
export async function handleScorecardsList(req: Request, origin: string | null) {
  if (req.method !== "GET") return badRequest("Method not allowed", origin);

  const url = new URL(req.url);
  const org_id = (url.searchParams.get("org_id") ?? "").trim();
  const sport_id = (url.searchParams.get("sport_id") ?? "").trim() || undefined;
  const q = (url.searchParams.get("q") ?? "").trim() || undefined;

  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const limit = Math.min(Math.max(parseInt(limitRaw ?? "10", 10) || 10, 1), 200);
  const offset = Math.max(parseInt(offsetRaw ?? "0", 10) || 0, 0);

  if (!org_id) return badRequest("org_id (UUID) is required", origin);

  const { data, count, error } = await listScorecardTemplates({
    org_id,
    sport_id,
    q,
    limit,
    offset,
  });

  if (error) return serverError(error.message, origin);
  return json({ ok: true, count, items: data ?? [] }, origin, 200);
}

/**
 * GET /api/scorecard/categories?scorecard_template_id=<UUID>
 */
export async function handleScorecardCategoriesByTemplate(
  req: Request,
  origin: string | null,
) {
  if (req.method !== "GET") return badRequest("Method not allowed", origin);

  const url = new URL(req.url);
  const scorecard_template_id =
    (url.searchParams.get("scorecard_template_id") ?? "").trim();

  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? "100", 10) || 100, 1),
    500,
  );
  const offset = Math.max(parseInt(offsetRaw ?? "0", 10) || 0, 0);

  if (!scorecard_template_id) {
    return badRequest("scorecard_template_id (UUID) is required", origin);
  }

  const { data, count, error } = await listScorecardCategoriesByTemplate({
    scorecard_template_id,
    limit,
    offset,
  });

  if (error) return serverError(error.message, origin);

  return json({ ok: true, count, items: data ?? [] }, origin, 200);
}