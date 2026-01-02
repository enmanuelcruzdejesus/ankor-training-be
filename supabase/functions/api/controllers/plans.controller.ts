import {
  CreatePlanSchema,
  GetPlanByIdSchema,
  InvitedPlanListSchema,
  PlanListFilterSchema,
  UpdatePlanSchema,
} from "../dtos/plans.dto.ts";
import {
  createPlan,
  getPlanById,
  listInvitedPlans,
  listPlansByType,
  updatePlan,
} from "../services/plans.service.ts";
import {
  badRequest,
  created,
  internalError,
  json,
  methodNotAllowed,
  notFound,
} from "../utils/http.ts";

function qp(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key);
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function listPlansController(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const url = new URL(req.url);
  const rawFilters = {
    type: (url.searchParams.get("type") ?? "").trim(),
    user_id: (url.searchParams.get("user_id") ?? "").trim() || undefined,
    limit: qp(url, "limit"),
    offset: qp(url, "offset"),
  };

  const parsed = PlanListFilterSchema.safeParse(rawFilters);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const { data, count, error } = await listPlansByType(parsed.data);
  if (error) {
    console.error("[listPlansController] list error", error);
    return internalError(error, "Failed to list plans");
  }

  return json(200, { ok: true, count, items: data });
}

export async function listInvitedPlansController(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const url = new URL(req.url);
  const rawFilters = {
    user_id: (url.searchParams.get("user_id") ?? "").trim(),
    limit: qp(url, "limit"),
    offset: qp(url, "offset"),
  };

  const parsed = InvitedPlanListSchema.safeParse(rawFilters);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const { data, count, error } = await listInvitedPlans(parsed.data);
  if (error) {
    console.error("[listInvitedPlansController] list error", error);
    return internalError(error, "Failed to list invited plans");
  }

  return json(200, { ok: true, count, items: data });
}

export async function getPlanByIdController(
  req: Request,
  _origin: string | null,
  params?: { id?: string },
): Promise<Response> {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const plan_id = params?.id;
  if (!plan_id) {
    return badRequest("Missing 'id' path parameter");
  }

  const parsed = GetPlanByIdSchema.safeParse({ plan_id });
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const { data, error } = await getPlanById(parsed.data.plan_id);
  if (error) {
    console.error("[getPlanByIdController] fetch error", error);
    return internalError(error, "Failed to fetch plan");
  }

  if (!data) {
    return notFound("Plan not found");
  }

  return json(200, { ok: true, plan: data });
}

export async function updatePlanController(
  req: Request,
  _origin: string | null,
  params?: { id?: string },
): Promise<Response> {
  if (req.method !== "PATCH") {
    return methodNotAllowed(["PATCH"]);
  }

  const plan_id = params?.id;
  if (!plan_id) {
    return badRequest("Missing 'id' path parameter");
  }

  const idParsed = GetPlanByIdSchema.safeParse({ plan_id });
  if (!idParsed.success) {
    const message = idParsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return badRequest("Invalid JSON payload");
  }

  const parsed = UpdatePlanSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const { data, error } = await updatePlan(plan_id, parsed.data);
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("not found")) {
      return notFound("Plan not found");
    }
    console.error("[updatePlanController] update error", error);
    return internalError(error, "Failed to update plan");
  }

  return json(200, { ok: true, plan: data });
}

export async function createPlanController(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return badRequest("Invalid JSON payload");
  }

  const parsed = CreatePlanSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const { data, error } = await createPlan(parsed.data);
  if (error) {
    console.error("[createPlanController] create error", error);
    return internalError(error, "Failed to create plan");
  }

  return created({ ok: true, plan: data });
}
