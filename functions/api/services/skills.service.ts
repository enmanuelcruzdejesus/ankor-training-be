import { sbAdmin } from "./supabase.ts";
import {
  type CreateSkillInput,
  type CreateSkillMediaInput,
  type SkillDto,
  type SkillListFilterInput,
  type SkillMediaPlaybackDto,
  type SkillMediaRecordDto,
  type SkillMediaUploadInput,
  type SkillMediaUploadResult,
  type SkillTagDto,
  type SkillTagListFilterInput,
  type UpdateSkillInput,
} from "../dtos/skills.dto.ts";
import { SKILLS_MEDIA_BUCKET } from "../config/env.ts";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

function sanitizeFileName(name: string): string {
  const base = name.trim().split(/[\\/]/).pop() ?? "upload";
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe.length ? safe : "upload";
}

function inferExtension(fileName: string, contentType: string): string {
  const match = fileName.match(/\.([a-z0-9]{1,10})$/i);
  if (match) {
    return `.${match[1].toLowerCase()}`;
  }

  const mapped = EXTENSION_BY_CONTENT_TYPE[contentType.toLowerCase()];
  return mapped ?? ".bin";
}

function buildSkillMediaPath(input: {
  org_id: string;
  skill_id: string;
  file_name: string;
  content_type: string;
}): string {
  const safeName = sanitizeFileName(input.file_name);
  const extension = inferExtension(safeName, input.content_type);
  const fileId = crypto.randomUUID();
  return `orgs/${input.org_id}/skills/${input.skill_id}/${fileId}${extension}`;
}

function parseStorageObjectUrl(
  value: string,
): { bucket: string; path: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const prefix = "/storage/v1/object/";
  if (!url.pathname.startsWith(prefix)) return null;

  const rest = url.pathname.slice(prefix.length);
  const parts = rest.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const offset = (parts[0] === "public" || parts[0] === "sign") ? 1 : 0;
  if (parts.length - offset < 2) return null;

  const bucket = parts[offset];
  const path = parts.slice(offset + 1).join("/");
  return { bucket, path };
}

function resolveStorageRef(
  storage_path?: string | null,
  url?: string | null,
): { bucket: string; path: string } | null {
  const storageValue = storage_path?.trim();
  if (storageValue) {
    const parsedUrl = parseStorageObjectUrl(storageValue);
    if (parsedUrl) return parsedUrl;

    const normalized = storageValue.replace(/^\/+/, "");
    if (normalized.startsWith(`${SKILLS_MEDIA_BUCKET}/`)) {
      return {
        bucket: SKILLS_MEDIA_BUCKET,
        path: normalized.slice(SKILLS_MEDIA_BUCKET.length + 1),
      };
    }

    return { bucket: SKILLS_MEDIA_BUCKET, path: normalized };
  }

  const urlValue = url?.trim();
  if (urlValue) {
    const parsedUrl = parseStorageObjectUrl(urlValue);
    if (parsedUrl) return parsedUrl;
  }

  return null;
}

function getPublicUrl(
  client: NonNullable<typeof sbAdmin>,
  bucket: string,
  object_path: string,
): string | null {
  if (!bucket || !object_path) return null;
  const result = client.storage.from(bucket).getPublicUrl(object_path);
  return result.data?.publicUrl ?? null;
}

function mapSkillMediaRow(
  row: any,
  client: NonNullable<typeof sbAdmin>,
  skillId?: string,
): SkillMediaRecordDto {
  const storage_path = typeof row.storage_path === "string"
    ? row.storage_path
    : null;
  const rawUrl = typeof row.url === "string" ? row.url : null;
  const storageRef = resolveStorageRef(storage_path, rawUrl);
  const resolvedUrl = rawUrl ??
    (storageRef
      ? getPublicUrl(client, storageRef.bucket, storageRef.path)
      : null);
  const resolvedSkillId = typeof row.skill_id === "string"
    ? row.skill_id
    : skillId ?? "";
  const mediaType = typeof row.media_type === "string" ? row.media_type : "video";
  const id = typeof row.id === "string" ? row.id : "";

  return {
    id,
    skill_id: resolvedSkillId,
    type: mediaType,
    url: resolvedUrl,
    storage_path,
    title: typeof row.title === "string" ? row.title : null,
    description: typeof row.description === "string" ? row.description : null,
    thumbnail_url: typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
    position: Number.isFinite(row.sort_order) ? Number(row.sort_order) : null,
  };
}

function mapSkillRowToDto(
  row: any,
  client: NonNullable<typeof sbAdmin>,
): SkillDto {
  const rawMedia = Array.isArray(row?.skill_media)
    ? row.skill_media
    : [];

  const media = rawMedia
    .map((item: any) => mapSkillMediaRow(item, client, row.id))
    .sort((a, b) => {
      const aPos = a.position ?? Number.MAX_SAFE_INTEGER;
      const bPos = b.position ?? Number.MAX_SAFE_INTEGER;
      return aPos - bPos;
    });

  return {
    id: row.id,
    org_id: row.org_id ?? null,
    sport_id: row.sport_id ?? null,
    category: typeof row.category === "string" ? row.category : "",
    title: typeof row.title === "string" ? row.title : "",
    description: typeof row.description === "string" ? row.description : null,
    level: typeof row.level === "string" ? row.level : null,
    visibility: typeof row.visibility === "string" ? row.visibility : null,
    status: typeof row.status === "string" ? row.status : null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    media,
  };
}

async function ensureSkillOrg(
  skill_id: string,
  org_id: string,
): Promise<{ error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { error: new Error("Supabase client not initialized") };
  }

  const { data, error } = await client
    .from("skills")
    .select("id")
    .eq("id", skill_id)
    .eq("org_id", org_id)
    .maybeSingle();

  if (error) {
    return { error };
  }

  if (!data) {
    return { error: new Error("Skill not found") };
  }

  return { error: null };
}

export async function createSkillMediaUploadUrl(
  input: SkillMediaUploadInput,
): Promise<{ data: SkillMediaUploadResult | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const path = buildSkillMediaPath(input);
  const bucket = SKILLS_MEDIA_BUCKET;

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (error || !data?.signedUrl || !data.token) {
    return { data: null, error: error ?? new Error("Failed to create upload URL") };
  }

  const publicResult = client.storage.from(bucket).getPublicUrl(path);
  const public_url = publicResult.data?.publicUrl ?? "";

  return {
    data: {
      bucket,
      path,
      signed_url: data.signedUrl,
      token: data.token,
      public_url,
    },
    error: null,
  };
}

export async function createSkillMedia(
  input: CreateSkillMediaInput,
): Promise<{ data: SkillMediaRecordDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  let storage_path = typeof input.storage_path === "string"
    ? input.storage_path.trim()
    : "";
  const url = typeof input.url === "string" ? input.url.trim() : "";

  if (storage_path) {
    const parsedFromPath = parseStorageObjectUrl(storage_path);
    if (parsedFromPath) {
      storage_path = parsedFromPath.path;
    } else if (storage_path.startsWith(`${SKILLS_MEDIA_BUCKET}/`)) {
      storage_path = storage_path.slice(SKILLS_MEDIA_BUCKET.length + 1);
    }
  }

  if (!storage_path && url) {
    const parsed = parseStorageObjectUrl(url);
    if (parsed) {
      storage_path = parsed.path;
    }
  }

  if (!storage_path && !url) {
    return { data: null, error: new Error("storage_path or url is required") };
  }

  const { error: skillError } = await ensureSkillOrg(
    input.skill_id,
    input.org_id,
  );
  if (skillError) {
    return { data: null, error: skillError };
  }

  let position = input.position ?? null;

  if (position === null || position === undefined) {
    const { data: lastRow, error: lastError } = await client
      .from("skill_media")
      .select("sort_order")
      .eq("skill_id", input.skill_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastError) {
      return { data: null, error: lastError };
    }

    const lastOrder = typeof lastRow?.sort_order === "number"
      ? lastRow.sort_order
      : null;
    position = lastOrder !== null ? lastOrder + 1 : 1;
  }

  const mediaType = input.type ?? input.media_type ?? "video";
  const storageRef = resolveStorageRef(storage_path, url);
  const resolvedUrl = url
    ? url
    : storageRef
    ? getPublicUrl(client, storageRef.bucket, storageRef.path)
    : null;

  const { data, error } = await client
    .from("skill_media")
    .insert({
      skill_id: input.skill_id,
      media_type: mediaType,
      title: input.title ?? null,
      url: resolvedUrl,
      storage_path: storage_path || null,
      thumbnail_url: input.thumbnail_url ?? null,
      sort_order: position ?? 0,
    })
    .select("id, skill_id, media_type, title, url, storage_path, thumbnail_url, sort_order")
    .single();

  if (error) {
    return { data: null, error };
  }

  return { data: mapSkillMediaRow(data, client), error: null };
}

export async function getSkillMediaPlaybackUrl(
  skill_id: string,
  org_id: string,
  expires_in: number,
): Promise<{ data: SkillMediaPlaybackDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const { error: skillError } = await ensureSkillOrg(skill_id, org_id);
  if (skillError) {
    return { data: null, error: skillError };
  }

  const { data: row, error } = await client
    .from("skill_media")
    .select(
      "id, skill_id, media_type, title, url, storage_path, thumbnail_url, sort_order",
    )
    .eq("skill_id", skill_id)
    .eq("media_type", "video")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }

  if (!row) {
    return { data: null, error: new Error("Skill media not found") };
  }

  const media = mapSkillMediaRow(row, client, skill_id);
  const storageRef = resolveStorageRef(row.storage_path, row.url);

  if (!storageRef) {
    if (!media.url) {
      return { data: null, error: new Error("Skill media URL missing") };
    }
    return {
      data: {
        media,
        play_url: media.url,
        expires_in: null,
      },
      error: null,
    };
  }

  const { data: signed, error: signErr } = await client.storage
    .from(storageRef.bucket)
    .createSignedUrl(storageRef.path, expires_in);

  if (signErr || !signed?.signedUrl) {
    return { data: null, error: signErr ?? new Error("Failed to create signed URL") };
  }

  return {
    data: {
      media,
      play_url: signed.signedUrl,
      expires_in,
    },
    error: null,
  };
}

export async function createSkill(
  input: CreateSkillInput,
): Promise<{ data: SkillDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const payload: Record<string, unknown> = {
    org_id: input.org_id,
    category: input.category.trim(),
    title: input.title.trim(),
  };

  if (input.sport_id !== undefined) payload.sport_id = input.sport_id ?? null;
  if (input.description !== undefined) payload.description = input.description ?? null;
  if (input.level !== undefined) payload.level = input.level ?? null;
  if (input.visibility !== undefined) payload.visibility = input.visibility ?? null;
  if (input.status !== undefined) payload.status = input.status ?? null;

  const { data, error } = await client
    .from("skills")
    .insert(payload)
    .select(
      "id, org_id, sport_id, category, title, description, level, visibility, status, created_at, updated_at",
    )
    .single();

  if (error) {
    return { data: null, error };
  }

  return { data: mapSkillRowToDto(data, client), error: null };
}

export async function updateSkill(
  skill_id: string,
  org_id: string,
  input: UpdateSkillInput,
): Promise<{ data: SkillDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const patch: Record<string, unknown> = {};
  if (input.sport_id !== undefined) patch.sport_id = input.sport_id;
  if (input.category !== undefined) patch.category = input.category;
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.level !== undefined) patch.level = input.level;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.status !== undefined) patch.status = input.status;

  if (Object.keys(patch).length > 0) {
    const { data, error } = await client
      .from("skills")
      .update(patch)
      .eq("id", skill_id)
      .eq("org_id", org_id)
      .select("id");

    if (error) {
      return { data: null, error };
    }

    if (!data || data.length === 0) {
      return { data: null, error: new Error("Skill not found") };
    }
  } else {
    const { data, error } = await client
      .from("skills")
      .select("id")
      .eq("id", skill_id)
      .eq("org_id", org_id);

    if (error) {
      return { data: null, error };
    }

    if (!data || data.length === 0) {
      return { data: null, error: new Error("Skill not found") };
    }
  }

  const { data, error } = await getSkillById(skill_id, org_id);
  if (error) {
    return { data: null, error };
  }

  return { data, error: null };
}

export async function listSkills(
  filters: SkillListFilterInput,
): Promise<{ data: SkillDto[]; count: number; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: [], count: 0, error: new Error("Supabase client not initialized") };
  }

  const { org_id, sport_id, q, limit = 50, offset = 0 } = filters;

  const rangeTo = offset + (limit - 1);

  let query = client
    .from("skills")
    .select(
      `
      id,
      org_id,
      sport_id,
      category,
      title,
      description,
      level,
      visibility,
      status,
      created_at,
      updated_at,
      skill_media(id, skill_id, media_type, title, url, storage_path, thumbnail_url, sort_order)
    `,
      { count: "exact" },
    )
    .eq("org_id", org_id)
    .order("title", { ascending: true })
    .range(offset, rangeTo);

  if (sport_id) query = query.eq("sport_id", sport_id);
  if (q?.trim()) query = query.or(`title.ilike.%${q}%,category.ilike.%${q}%`);

  const { data, error, count } = await query;

  if (error) {
    return { data: [], count: 0, error };
  }

  const mapped = (data ?? []).map((row: any) => mapSkillRowToDto(row, client));

  return { data: mapped, count: count ?? mapped.length, error: null };
}

export async function listSkillTags(
  filters: SkillTagListFilterInput,
): Promise<{ data: SkillTagDto[]; count: number; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: [], count: 0, error: new Error("Supabase client not initialized") };
  }

  const { org_id, sport_id, q, limit = 50, offset = 0 } = filters;

  let query = client
    .from("skill_tags")
    .select("tags!inner(id, name), skills!inner(org_id, sport_id)", { count: "exact" })
    .eq("skills.org_id", org_id)
    .range(offset, offset + (limit - 1));

  if (sport_id) {
    query = query.eq("skills.sport_id", sport_id);
  }

  if (q?.trim()) {
    query = query.ilike("tags.name", `%${q}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return { data: [], count: 0, error };
  }

  const tags: SkillTagDto[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const tag = row?.tags ?? null;
    const id = typeof tag?.id === "string" ? tag.id : "";
    const name = typeof tag?.name === "string" ? tag.name : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    tags.push({ id, name });
  }

  tags.sort((a, b) => a.name.localeCompare(b.name));

  return { data: tags, count: tags.length ?? count ?? 0, error: null };
}

export async function getSkillById(
  skill_id: string,
  org_id: string,
): Promise<{ data: SkillDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const { data, error } = await client
    .from("skills")
    .select(
      `
      id,
      org_id,
      sport_id,
      category,
      title,
      description,
      level,
      visibility,
      status,
      created_at,
      updated_at,
      skill_media(id, skill_id, media_type, title, url, storage_path, thumbnail_url, sort_order)
    `,
    )
    .eq("id", skill_id)
    .eq("org_id", org_id)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }

  return { data: data ? mapSkillRowToDto(data, client) : null, error: null };
}
