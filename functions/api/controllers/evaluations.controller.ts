// src/controllers/evaluationsController.ts

import {
  EvaluationInput,
  EvaluationItemInput,
} from "../schemas/evaluations.ts";
import { rpcBulkCreateEvaluations } from "../services/evaluations.service.ts";
import {
  badRequest,
  created,
  internalError,
  methodNotAllowed,
} from "../utils/http.ts";

/**
 * Validate a single evaluation item
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

  // Optional: enforce rating range 1–5
  if (item.rating < 1 || item.rating > 5) {
    throw new Error(
      `evaluations[${evalIndex}].evaluation_items[${itemIndex}].rating must be between 1 and 5`,
    );
  }

  return {
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
 */
function parseEvaluation(raw: unknown, index: number): EvaluationInput {
  if (!raw || typeof raw !== "object") {
    throw new Error(`evaluations[${index}] must be an object`);
  }

  const obj = raw as Record<string, unknown>;

  const requiredFields: Array<keyof EvaluationInput> = [
    "org_id",
    "scorecard_template_id",
    "athlete_id",
    "coach_id",
    "evaluation_items",
  ];

  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null) {
      throw new Error(`evaluations[${index}].${field} is required`);
    }
  }

  if (!Array.isArray(obj.evaluation_items) || obj.evaluation_items.length === 0) {
    throw new Error(
      `evaluations[${index}].evaluation_items must be a non-empty array`,
    );
  }

  const items: EvaluationItemInput[] = obj.evaluation_items.map(
    (item: unknown, itemIndex: number) =>
      parseEvaluationItem(item, index, itemIndex),
  );

  return {
    org_id: String(obj.org_id),
    scorecard_template_id: String(obj.scorecard_template_id),
    athlete_id: String(obj.athlete_id),
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
 *       org_id,
 *       scorecard_template_id,
 *       athlete_id,
 *       coach_id,
 *       notes?,
 *       evaluation_items: [{ skill_id, rating, comments? }, ...]
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

    // Validate + normalize payload
    const evaluations: EvaluationInput[] = body.evaluations.map(
      (rawEval: unknown, index: number) => parseEvaluation(rawEval, index),
    );

    // 🔁 Call RPC service instead of direct inserts
    const { data, error } = await rpcBulkCreateEvaluations({ evaluations });

    if (error) {
      console.error("[bulkCreateEvaluationsController] rpc error", error);

      // Optional: you could inspect the error here and return 400 for FK violations, etc.
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
