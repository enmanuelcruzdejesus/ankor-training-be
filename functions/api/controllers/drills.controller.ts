import {
  CreateDrillSchema,
  normalizeCreateDrillDto,
  DrillListFilterSchema,
} from "../dtos/drills.dto.ts";
import { createDrill, listDrills } from "../services/drills.service.ts";
import {
  badRequest,
  created,
  internalError,
  methodNotAllowed,
  json,
} from "../utils/http.ts";
import { RE_UUID } from "../utils/uuid.ts";

export async function createDrillController(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return badRequest("Invalid JSON payload");
  }

  const parsed = CreateDrillSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const dto = normalizeCreateDrillDto(parsed.data);

  const { data, error } = await createDrill(dto);

  if (error) {
    console.error("[createDrillController] rpc_create_drill error", error);
    return internalError(error, "Failed to create drill");
  }

  const drill =
    Array.isArray(data) && data.length === 1 ? data[0] : data ?? null;

  return created({ ok: true, drill });
}

function parseCommaList(
  value: string | null,
  validator: (s: string) => boolean,
): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && validator(s));
}

export async function listDrillsController(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const url = new URL(req.url);
  const org_id = (url.searchParams.get("org_id") ?? "").trim();
  if (!RE_UUID.test(org_id)) {
    return badRequest("org_id (UUID) is required");
  }

  const rawFilters = {
    org_id,
    name: (url.searchParams.get("name") ?? "").trim() || undefined,
    segment_ids: parseCommaList(url.searchParams.get("segment_ids"), (s) =>
      RE_UUID.test(s)
    ),
    min_age: url.searchParams.get("min_age"),
    max_age: url.searchParams.get("max_age"),
    min_players: url.searchParams.get("min_players"),
    max_players: url.searchParams.get("max_players"),
    skill_tag_ids: parseCommaList(url.searchParams.get("skill_tags"), (s) =>
      RE_UUID.test(s)
    ),
    limit: url.searchParams.get("limit"),
    offset: url.searchParams.get("offset"),
  };

  const parsed = DrillListFilterSchema.safeParse(rawFilters);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return badRequest(msg);
  }

  const filters = parsed.data;
  const { data, count, error } = await listDrills(filters);

  if (error) {
    console.error("[listDrillsController] list error", error);
    return internalError(error, "Failed to list drills");
  }

  return json(200, { ok: true, count, items: data });
}
