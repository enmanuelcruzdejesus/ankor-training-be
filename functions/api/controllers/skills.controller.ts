import {
  CreateSkillSchema,
  CreateSkillMediaSchema,
  GetSkillByIdSchema,
  SkillListFilterSchema,
  SkillMediaUploadSchema,
  SkillTagListFilterSchema,
  UpdateSkillSchema,
} from "../dtos/skills.dto.ts";
import {
  createSkill,
  createSkillMedia,
  createSkillMediaUploadUrl,
  getSkillMediaPlaybackUrl,
  getSkillById,
  listSkills,
  listSkillTags,
  updateSkill,
} from "../services/skills.service.ts";
import {
  badRequest,
  created,
  internalError,
  json,
  jsonResponse,
  methodNotAllowed,
  unauthorized,
} from "../utils/http.ts";
import type { RequestContext } from "../routes/router.ts";
import { RE_UUID } from "../utils/uuid.ts";

function qp(url: URL, key: string): string | undefined {
  const v = url.searchParams.get(key);
  const trimmed = v?.trim();
  return trimmed ? trimmed : undefined;
}

function isUploadContentTypeValid(type: string, contentType: string): boolean {
  const normalized = contentType.toLowerCase();

  if (type === "video") return normalized.startsWith("video/");
  if (type === "image") return normalized.startsWith("image/");
  if (type === "document") return normalized.startsWith("application/");
  return true;
}

export async function createSkillController(
  req: Request,
  _origin?: string | null,
  _params?: Record<string, string>,
  ctx?: RequestContext,
): Promise<Response> {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return badRequest("Invalid JSON payload");
  }

  const parsed = CreateSkillSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const userId = ctx?.user?.id;
  if (!userId) return unauthorized("Unauthorized");

  const { data, error } = await createSkill(parsed.data);
  if (error) {
    console.error("[createSkillController] error", error);
    return internalError(error, "Failed to create skill");
  }

  return created({ ok: true, skill: data });
}

export async function listSkillsController(
  req: Request,
  _origin?: string | null,
  _params?: Record<string, string>,
  ctx?: RequestContext,
): Promise<Response> {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const url = new URL(req.url);
  const org_id = (ctx?.org_id ?? url.searchParams.get("org_id") ?? "").trim();
  if (!RE_UUID.test(org_id)) {
    return badRequest("org_id (UUID) is required");
  }

  const rawFilters = {
    org_id,
    sport_id: qp(url, "sport_id"),
    q: qp(url, "q"),
    limit: qp(url, "limit"),
    offset: qp(url, "offset"),
  };

  const parsed = SkillListFilterSchema.safeParse(rawFilters);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return badRequest(msg);
  }

  const { data, count, error } = await listSkills(parsed.data);
  if (error) {
    console.error("[listSkillsController] list error", error);
    return internalError(error, "Failed to list skills");
  }

  return json(200, { ok: true, count, items: data });
}

export async function listSkillTagsController(
  req: Request,
  _origin?: string | null,
  _params?: Record<string, string>,
  ctx?: RequestContext,
): Promise<Response> {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const url = new URL(req.url);
  const org_id = (ctx?.org_id ?? url.searchParams.get("org_id") ?? "").trim();
  if (!RE_UUID.test(org_id)) {
    return badRequest("org_id (UUID) is required");
  }

  const rawFilters = {
    org_id,
    sport_id: qp(url, "sport_id"),
    q: qp(url, "q"),
    limit: qp(url, "limit"),
    offset: qp(url, "offset"),
  };

  const parsed = SkillTagListFilterSchema.safeParse(rawFilters);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return badRequest(msg);
  }

  const { data, count, error } = await listSkillTags(parsed.data);
  if (error) {
    console.error("[listSkillTagsController] list error", error);
    return internalError(error, "Failed to list skill tags");
  }

  return json(200, { ok: true, count, items: data });
}

export async function getSkillByIdController(
  req: Request,
  _origin: string | null,
  params?: { id?: string },
  ctx?: RequestContext,
): Promise<Response> {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const skill_id = params?.id;
  if (!skill_id) {
    return jsonResponse(
      { ok: false, error: "Missing 'id' path parameter" },
      { status: 400 },
    );
  }

  const parsed = GetSkillByIdSchema.safeParse({ skill_id });
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const url = new URL(req.url);
  const org_id = (ctx?.org_id ?? url.searchParams.get("org_id") ?? "").trim();
  if (!RE_UUID.test(org_id)) {
    return badRequest("org_id (UUID) is required");
  }

  const { data, error } = await getSkillById(parsed.data.skill_id, org_id);
  if (error) {
    console.error("[getSkillByIdController] error", error);
    return internalError(error, "Failed to fetch skill");
  }

  if (!data) {
    return jsonResponse({ ok: false, error: "Skill not found" }, { status: 404 });
  }

  return json(200, { ok: true, skill: data });
}

export async function updateSkillController(
  req: Request,
  _origin: string | null,
  params?: { id?: string },
  ctx?: RequestContext,
): Promise<Response> {
  if (req.method !== "PATCH") {
    return methodNotAllowed(["PATCH"]);
  }

  const skill_id = params?.id;
  if (!skill_id) {
    return jsonResponse(
      { ok: false, error: "Missing 'id' path parameter" },
      { status: 400 },
    );
  }

  const idParsed = GetSkillByIdSchema.safeParse({ skill_id });
  if (!idParsed.success) {
    const message = idParsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return badRequest("Invalid JSON payload");
  }

  const parsed = UpdateSkillSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const hasPatch = Object.values(parsed.data).some((value) =>
    value !== undefined
  );
  if (!hasPatch) {
    return badRequest("No updates provided");
  }

  const url = new URL(req.url);
  const org_id = (ctx?.org_id ?? url.searchParams.get("org_id") ?? "").trim();
  if (!RE_UUID.test(org_id)) {
    return badRequest("org_id (UUID) is required");
  }

  const { data, error } = await updateSkill(skill_id, org_id, parsed.data);
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("not found")) {
      return jsonResponse({ ok: false, error: "Skill not found" }, { status: 404 });
    }
    return internalError(error, "Failed to update skill");
  }

  return json(200, { ok: true, skill: data });
}

export async function createSkillMediaUploadUrlController(
  req: Request,
  _origin?: string | null,
  _params?: Record<string, string>,
  _ctx?: RequestContext,
): Promise<Response> {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return badRequest("Invalid JSON payload");
  }

  const parsed = SkillMediaUploadSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const mediaType = parsed.data.type ?? parsed.data.media_type ?? "video";
  if (mediaType === "link") {
    return badRequest("type=link does not support uploads");
  }

  if (!isUploadContentTypeValid(mediaType, parsed.data.content_type)) {
    return badRequest(`content_type does not match media type '${mediaType}'`);
  }

  const { data, error } = await createSkillMediaUploadUrl({
    ...parsed.data,
    type: mediaType,
  });
  if (error || !data) {
    console.error("[createSkillMediaUploadUrlController] error", error);
    return internalError(error, "Failed to create upload URL");
  }

  const media = {
    type: mediaType,
    storage_path: data.path,
    url: data.public_url,
    title: parsed.data.title ?? null,
    description: parsed.data.description ?? null,
    thumbnail_url: parsed.data.thumbnail_url ?? null,
    position: parsed.data.position ?? null,
  };

  return created({ ok: true, upload: data, media });
}

export async function createSkillMediaController(
  req: Request,
  _origin?: string | null,
  _params?: Record<string, string>,
  _ctx?: RequestContext,
): Promise<Response> {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") {
    return badRequest("Invalid JSON payload");
  }

  const parsed = CreateSkillMediaSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const mediaType = parsed.data.type ?? parsed.data.media_type ?? "video";
  const { data, error } = await createSkillMedia({
    ...parsed.data,
    type: mediaType,
  });
  if (error) {
    console.error("[createSkillMediaController] error", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("not found")) {
      return jsonResponse({ ok: false, error: "Skill not found" }, { status: 404 });
    }
    return internalError(error, "Failed to create skill media");
  }

  return created({ ok: true, media: data });
}

export async function getSkillMediaPlaybackController(
  req: Request,
  _origin: string | null,
  params?: { skill_id?: string },
  ctx?: RequestContext,
): Promise<Response> {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const skill_id = params?.skill_id;
  if (!skill_id) {
    return jsonResponse(
      { ok: false, error: "Missing 'skill_id' path parameter" },
      { status: 400 },
    );
  }

  const parsed = GetSkillByIdSchema.safeParse({ skill_id });
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return badRequest(message);
  }

  const url = new URL(req.url);
  const org_id = (ctx?.org_id ?? url.searchParams.get("org_id") ?? "").trim();
  if (!RE_UUID.test(org_id)) {
    return badRequest("org_id (UUID) is required");
  }

  const rawExpires = url.searchParams.get("expires_in");
  const parsedExpires = rawExpires ? Number.parseInt(rawExpires, 10) : NaN;
  const expires_in = Number.isFinite(parsedExpires)
    ? Math.min(Math.max(parsedExpires, 60), 60 * 60 * 24)
    : 60 * 60;

  const { data, error } = await getSkillMediaPlaybackUrl(
    parsed.data.skill_id,
    org_id,
    expires_in,
  );
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("not found")) {
      return jsonResponse({ ok: false, error: "Skill media not found" }, { status: 404 });
    }
    return internalError(error, "Failed to create playback URL");
  }

  return json(200, {
    ok: true,
    media: data!.media,
    play_url: data!.play_url,
    expires_in: data!.expires_in,
  });
}
