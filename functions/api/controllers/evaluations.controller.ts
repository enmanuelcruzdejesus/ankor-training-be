import {
  EvaluationInput,
  EvaluationItemInput,
} from "../schemas/evaluations.ts";
import {
  rpcBulkCreateEvaluations,
  listEvaluations,
} from "../services/evaluations.service.ts";
import {
  badRequest,
  created,
  internalError,
  methodNotAllowed,
  json,
} from "../utils/http.ts";

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
 *
 * Body:
 * {
 *   "evaluations": [
 *     {
 *       org_id: string;
 *       scorecard_template_id: string;
 *       team_id?: string | null;
 *       coach_id: string;
 *       notes?: string | null;
 *       evaluation_items: [
 *         {
 *           athlete_id: string;
 *           skill_id: string;
 *           rating: number;
 *           comments?: string | null;
 *         },
 *         ...
 *       ];
 *     },
 *     ...
 *   ]
 * }
 */
export async function bulkCreateEvaluationsController(
  req: Request,
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
): Promise<Response> {
  try {
    if (req.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const { data, error } = await listEvaluations();

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
