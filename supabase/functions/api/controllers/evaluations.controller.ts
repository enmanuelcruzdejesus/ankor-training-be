import {
  EvaluationInput,
  EvaluationItemInput,
} from "../schemas/evaluations.ts";
import {
  rpcBulkCreateEvaluations,
  listEvaluations,
  getEvaluationById,
  applyEvaluationMatrixUpdateService,
  submitEvaluation,
} from "../services/evaluations.service.ts";
import {
  badRequest,
  created,
  internalError,
  methodNotAllowed,
  json,
} from "../utils/http.ts";
import {
  EvaluationDetailDto,
  type EvaluationMatrixUpdateDto,
} from "../dtos/evaluations.dto.ts";
import { jsonResponse } from "../utils/http.ts";
import type { RequestContext } from "../routes/router.ts";
import { RE_UUID } from "../utils/uuid.ts";

/**
 * Validate a single evaluation item
 * Now requires athlete_id on each item.
 */
function parseEvaluationItem(
  raw: unknown,
  evalIndex: number,
  itemIndex: number,
): EvaluationItemInput {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      `evaluations[${evalIndex}].evaluation_items[${itemIndex}] must be an object`,
    );
  }

  const item = raw as Record<string, unknown>;

  if (!item.athlete_id || typeof item.athlete_id !== "string") {
    throw new Error(
      `evaluations[${evalIndex}].evaluation_items[${itemIndex}].athlete_id is required (string)`,
    );
  }

  if (!item.skill_id || typeof item.skill_id !== "string") {
    throw new Error(
      `evaluations[${evalIndex}].evaluation_items[${itemIndex}].skill_id is required (string)`,
    );
  }

  if (typeof item.rating !== "number" || !Number.isFinite(item.rating)) {
    throw new Error(
      `evaluations[${evalIndex}].evaluation_items[${itemIndex}].rating must be a number`,
    );
  }

  // Optional: enforce rating range 1–5 (DB constraint was removed, we keep it in app layer)
  if (item.rating < 1 || item.rating > 5) {
    throw new Error(
      `evaluations[${evalIndex}].evaluation_items[${itemIndex}].rating must be between 1 and 5`,
    );
  }

  return {
    athlete_id: item.athlete_id,
    skill_id: item.skill_id,
    rating: item.rating,
    comments:
      item.comments === undefined || item.comments === null
        ? null
        : String(item.comments),
  };
}

/**
 * Validate a single evaluation
 *
 * Note:
 * - No athlete_id at this level anymore.
 * - Optional team_id.
 * - Athletes are per item via evaluation_items[].athlete_id.
 */
function parseEvaluation(raw: unknown, index: number): EvaluationInput {
  if (!raw || typeof raw !== "object") {
    throw new Error(`evaluations[${index}] must be an object`);
  }

  const obj = raw as Record<string, unknown>;

  const requiredFields: Array<keyof EvaluationInput> = [
    "org_id",
    "scorecard_template_id",
    "coach_id",
    "evaluation_items",
  ];

  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null) {
      throw new Error(`evaluations[${index}].${field} is required`);
    }
  }

  if (
    !Array.isArray(obj.evaluation_items) ||
    obj.evaluation_items.length === 0
  ) {
    throw new Error(
      `evaluations[${index}].evaluation_items must be a non-empty array`,
    );
  }

  const items: EvaluationItemInput[] = obj.evaluation_items.map(
    (item: unknown, itemIndex: number) =>
      parseEvaluationItem(item, index, itemIndex),
  );

  const team_id =
    obj.team_id === undefined || obj.team_id === null || obj.team_id === ""
      ? null
      : String(obj.team_id);

  return {
    org_id: String(obj.org_id),
    scorecard_template_id: String(obj.scorecard_template_id),
    team_id,
    coach_id: String(obj.coach_id),
    notes:
      obj.notes === undefined || obj.notes === null ? null : String(obj.notes),
    evaluation_items: items,
  };
}

/**
 * Controller: POST /api/evaluations/bulk-create
 */
export async function bulkCreateEvaluationsController(
  req: Request,
  _origin?: string | null,
  _params?: Record<string, string>,
  _ctx?: RequestContext,
): Promise<Response> {
  try {
    if (req.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const body = await req.json().catch(() => null);

    if (!body || !Array.isArray(body.evaluations)) {
      return badRequest("Body must contain an 'evaluations' array.");
    }

    // ✅ Validate + normalize payload into EvaluationInput[]
    const evaluations: EvaluationInput[] = body.evaluations.map(
      (rawEval: unknown, index: number) => parseEvaluation(rawEval, index),
    );

    // 🔁 Call RPC service (evaluations_bulk_create_tx)
    const { data, error } = await rpcBulkCreateEvaluations({ evaluations });

    if (error) {
      console.error("[bulkCreateEvaluationsController] rpc error", error);
      return internalError(error);
    }

    const createdEvaluations = (data ?? []) as unknown[];

    return created({
      ok: true,
      count: createdEvaluations.length,
      data: createdEvaluations,
    });
  } catch (err) {
    console.error("[bulkCreateEvaluationsController] error", err);
    return internalError(err);
  }
}

/**
 * GET /api/evaluations/list
 * Returns ONLY evaluations
 */
export async function handleEvaluationsList(
  req: Request,
  _origin?: string | null,
  _params?: Record<string, string>,
  ctx?: RequestContext,
): Promise<Response> {
  try {
    if (req.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const url = new URL(req.url);
    const org_id = (ctx?.org_id ?? url.searchParams.get("org_id") ?? "").trim();
    const { data, error } = await listEvaluations(org_id || undefined);

    if (error) {
      console.error("[handleEvaluationsList] list error", error);
      return internalError(error);
    }

    const evaluations = data ?? [];

    return json(200, {
      ok: true,
      count: evaluations.length,
      data: evaluations,
    });
  } catch (err) {
    console.error("[handleEvaluationsList] error", err);
    return internalError(err);
  }
}

// Handler for GET /api/evaluations/eval/:id
export async function handleEvaluationById(
  req: Request,
  params?: { id?: string },
  ctx?: RequestContext,
): Promise<Response> {
  let id = params?.id;

  if (!id) {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    id = segments[segments.length - 1];
  }

  if (!id) {
    return jsonResponse(
      { ok: false, error: "Missing 'id' path parameter" },
      { status: 400 },
    );
  }

  try {
    const url = new URL(req.url);
    const org_id = (ctx?.org_id ?? url.searchParams.get("org_id") ?? "").trim();
    if (!RE_UUID.test(org_id)) {
      return badRequest("org_id (UUID) is required");
    }

    const evaluation: EvaluationDetailDto | null = await getEvaluationById(id, org_id);

    if (!evaluation) {
      return jsonResponse(
        { ok: false, error: "Evaluation not found" },
        { status: 404 },
      );
    }

    return jsonResponse({ ok: true, evaluation }, { status: 200 });
  } catch (err) {
    console.error("[handleEvaluationById] Unexpected error", err);
    return jsonResponse(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function updateEvaluationMatrixController(
  req: Request,
  _origin?: string | null,
  _params?: Record<string, string>,
  _ctx?: RequestContext,
): Promise<Response> {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const evaluationId = segments[segments.length - 2]; // ✅ UUID before "matrix"

    if (!evaluationId) {
      return jsonResponse(
        { ok: false, error: "Missing evaluation id in path" },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => null)) as
      | EvaluationMatrixUpdateDto
      | null;

    if (!body || !Array.isArray(body.operations)) {
      return jsonResponse(
        { ok: false, error: "Body must include an 'operations' array" },
        { status: 400 },
      );
    }

    if (!body.org_id || typeof body.org_id !== "string" || !RE_UUID.test(body.org_id)) {
      return jsonResponse(
        { ok: false, error: "org_id (UUID) is required" },
        { status: 400 },
      );
    }

    if (body.operations.length === 0) {
      return jsonResponse(
        { ok: false, error: "'operations' array must not be empty" },
        { status: 400 },
      );
    }

    const payload: EvaluationMatrixUpdateDto = {
      ...body,
      evaluation_id: evaluationId,
    };

    const evaluation = await applyEvaluationMatrixUpdateService(payload);

    return jsonResponse({ ok: true, evaluation }, { status: 200 });
  } catch (err: any) {
    console.error("[updateEvaluationMatrixController] error", err);
    const message =
      typeof err?.message === "string" ? err.message : "Internal server error";
    return jsonResponse({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/evaluations/eval/:id/submit
 * Submits an evaluation (currently marks as completed; later can run more steps).
 */
export async function handleSubmitEvaluation(
  req: Request,
  params?: { id?: string },
  _ctx?: RequestContext,
): Promise<Response> {
  try {
    if (req.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    // Prefer params if your router provides them
    let id = params?.id;

    // Fallback: derive from URL
    if (!id) {
      const url = new URL(req.url);
      const segments = url.pathname.split("/").filter(Boolean);

      // If last segment is "submit", id is previous; otherwise last
      const last = segments[segments.length - 1];
      id = last === "submit" ? segments[segments.length - 2] : last;
    }

    if (!id) {
      return jsonResponse(
        { ok: false, error: "Missing 'id' path parameter" },
        { status: 400 },
      );
    }

    const url = new URL(req.url);
    const org_id = (url.searchParams.get("org_id") ?? "").trim();
    if (!RE_UUID.test(org_id)) {
      return jsonResponse(
        { ok: false, error: "org_id (UUID) is required" },
        { status: 400 },
      );
    }

    const result = await submitEvaluation(id, org_id);

    if (!result.ok) {
      const message =
        result.error instanceof Error
          ? result.error.message
          : "Failed to submit evaluation";

      if (message.toLowerCase().includes("not found")) {
        return jsonResponse({ ok: false, error: message }, { status: 404 });
      }

      return jsonResponse({ ok: false, error: message }, { status: 500 });
    }

    return jsonResponse(
      { ok: true, data: result.data },
      { status: 200 },
    );
  } catch (err) {
    console.error("[handleSubmitEvaluation] Unexpected error", err);
    return jsonResponse(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
