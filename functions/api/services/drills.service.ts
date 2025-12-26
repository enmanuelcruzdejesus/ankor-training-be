import { sbAdmin } from "./supabase.ts";
import {
  type CreateDrillDto,
  type CreateDrillMediaInput,
  type DrillListFilterInput,
  type DrillListItemDto,
  type DrillMediaUploadInput,
  DrillMediaDto,
} from "../dtos/drills.dto.ts";
import { DRILLS_MEDIA_BUCKET } from "../config/env.ts";

export type DrillSegmentDto = {
  id: string;
  name: string | null;
};

export type DrillTagDto = {
  id: string;
  name: string;
};

export type DrillMediaUploadResult = {
  bucket: string;
  path: string;
  signed_url: string;
  token: string;
  public_url: string;
};

export type DrillMediaRecordDto = {
  id: string;
  drill_id: string;
  type: string;
  url: string;
  title: string | null;
  thumbnail_url: string | null;
  position: number | null;
};

type RpcCreateDrillPayload = {
  p_drill: {
    org_id: string;
    segment_id: string | null;
    sport_id: string | null;
    name: string;
    description: string | null;
    instructions: string | null;
    difficulty: string | null;
    min_age: number | null;
    max_age: number | null;
    duration_seconds: number | null;
    created_by: string | null;
  };
  p_media: Array<{
    type: string;
    url: string;
    title: string | null;
    description: string | null;
    thumbnail_url: string | null;
    position: number | null;
  }>;
  p_skill_tags: string[];
};

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

function buildDrillMediaPath(input: {
  org_id: string;
  drill_id: string;
  file_name: string;
  content_type: string;
}): string {
  const safeName = sanitizeFileName(input.file_name);
  const extension = inferExtension(safeName, input.content_type);
  const fileId = crypto.randomUUID();
  return `orgs/${input.org_id}/drills/${input.drill_id}/${fileId}${extension}`;
}

export async function createDrillMediaUploadUrl(
  input: DrillMediaUploadInput,
): Promise<{ data: DrillMediaUploadResult | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const path = buildDrillMediaPath(input);
  const bucket = DRILLS_MEDIA_BUCKET;

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

export async function createDrillMedia(
  input: CreateDrillMediaInput,
): Promise<{ data: DrillMediaRecordDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const { drill_id, type, url, title, description, thumbnail_url } = input;
  let position = input.position ?? null;

  if (position === null || position === undefined) {
    const { data: lastRow, error: lastError } = await client
      .from("drill_media")
      .select("sort_order")
      .eq("drill_id", drill_id)
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

  const { data, error } = await client
    .from("drill_media")
    .insert({
      drill_id,
      media_type: type,
      url,
      title: title ?? null,
      thumbnail_url: thumbnail_url ?? null,
      sort_order: position ?? null,
    })
    .select("id, drill_id, media_type, url, title,thumbnail_url,sort_order")
    .single();

  if (error) {
    return { data: null, error };
  }

  return { data: mapDrillMediaRow(data), error: null };
}

export async function createDrill(dto: CreateDrillDto): Promise<{
  data: unknown;
  error: unknown;
}> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const payload: RpcCreateDrillPayload = {
    p_drill: {
      org_id: dto.org_id,
      segment_id: dto.segment_id ?? null,
      sport_id: dto.sport_id ?? null,
      name: dto.name.trim(),
      description: dto.description ?? null,
      instructions: dto.instructions ?? null,
      difficulty: dto.difficulty ?? null,
      min_age: dto.min_age ?? null,
      max_age: dto.max_age ?? null,
      duration_seconds: dto.duration_seconds ?? null,
      created_by: dto.created_by ?? null,
    },
    p_media: (dto.media ?? []).map((item) => ({
      type: item.type,
      url: item.url,
      title: item.title ?? null,
      description: item.description ?? null,
      thumbnail_url: item.thumbnail_url ?? null,
      position: item.position ?? null,
    })),
    p_skill_tags: (dto.skill_tags ?? []).map((tag) => tag.skill_id),
  };

  const { data, error } = await client.rpc("rpc_create_drill", payload);

  if (error) {
    return { data: null, error };
  }

  return { data: data ?? null, error: null };
}

export async function listSegments(): Promise<{
  data: DrillSegmentDto[];
  error: unknown;
}> {
  const client = sbAdmin;
  if (!client) {
    return { data: [], error: new Error("Supabase client not initialized") };
  }

  const { data, error } = await client
    .from("segments")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    return { data: [], error };
  }

  const segments: DrillSegmentDto[] = (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name ?? null,
  }));

  return { data: segments, error: null };
}

export async function listDrillTags(params: {
  org_id: string;
  sport_id?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: DrillTagDto[]; count: number; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: [], count: 0, error: new Error("Supabase client not initialized") };
  }

  const { org_id, sport_id, q, limit = 50, offset = 0 } = params;

  let query = client
    .from("drill_tags")
    .select("id, name ")
    .eq("org_id", org_id)
    .order("name", { ascending: true })
    .range(offset, offset + (limit - 1));

  if (sport_id) {
    query = query.eq("sport_id", sport_id);
  }

  if (q?.trim()) {
    query = query.or(`name.ilike.%${q}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return { data: [], count: 0, error };
  }

  const tags: DrillTagDto[] = (data ?? []).map((row: any) => ({
    id: row.id,
    name: typeof row.name === "string" ? row.name : "",
  }));

  return { data: tags, count: count ?? tags.length, error: null };
}

export async function listDrills(
  filters: DrillListFilterInput,
): Promise<{ data: DrillListItemDto[]; count: number; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: [], count: 0, error: new Error("Supabase client not initialized") };
  }

  const {
    org_id,
    name,
    segment_ids,
    min_age,
    max_age,
    min_players,
    max_players,
    skill_tag_ids, // (these are actually tag_ids now)
    limit,
    offset,
  } = filters;

  const rangeTo = offset + (limit - 1);

  // IMPORTANT:
  // - If filtering by tags, embed drill_tag_map with !inner so drills are filtered.
  // - If not filtering by tags, don't use !inner or you’ll exclude drills with no tags.
  const tagEmbed = (skill_tag_ids?.length ?? 0) > 0
    ? "drill_tag_map!inner(tag_id)"
    : "drill_tag_map(tag_id)";

  let query = client
    .from("drills")
    .select(
      `
        id,
        org_id,
        segment_id,
        name,
        description,
        difficulty,
        min_players,
        max_players,
        min_age,
        max_age,
        duration_min,
        visibility,
        is_archived,
        created_at,
        updated_at,
        segment:segments(id, name),
        drill_media(id, media_type, title, url, thumbnail_url, sort_order),
        drill_skills(skill_id),
        ${tagEmbed}
      `,
      { count: "exact" },
    )
    .eq("org_id", org_id)
    .range(offset, rangeTo)
    .order("created_at", { ascending: false });

  if (name) query = query.ilike("name", `%${name}%`);
  if (segment_ids?.length) query = query.in("segment_id", segment_ids);

  if (min_age !== null && min_age !== undefined) query = query.gte("min_age", min_age);
  if (max_age !== null && max_age !== undefined) query = query.lte("max_age", max_age);

  if (min_players !== null && min_players !== undefined) query = query.gte("min_players", min_players);
  if (max_players !== null && max_players !== undefined) query = query.lte("max_players", max_players);

  if (skill_tag_ids?.length) {
    query = query.in("drill_tag_map.tag_id", skill_tag_ids);
  }

  const { data, error, count } = await query;

  if (error) return { data: [], count: 0, error };

  const mapped: DrillListItemDto[] = (data ?? []).map((row: any) => mapDrillRowToDto(row));
  return { data: mapped, count: count ?? mapped.length, error: null };
}


function mapDrillRowToDto(row: any): DrillListItemDto {
  const media: DrillMediaDto[] = (row.drill_media ?? []).map((m: any) => ({
    type: m.media_type ?? "video",
    url: m.url,
    title: m.title ?? null,
    description: null,
    thumbnail_url: m.thumbnail_url ?? null,
    position: m.sort_order ?? null,
  }));

  const skill_tags: string[] = (row.drill_skills ?? [])
    .map((s: any) => s.skill_id)
    .filter(Boolean);

  return {
    id: row.id,
    org_id: row.org_id ?? null,
    segment_id: row.segment_id ?? null,
    name: row.name,
    description: row.description ?? null,
    difficulty: row.difficulty ?? null,
    min_players: row.min_players ?? null,
    max_players: row.max_players ?? null,
    min_age: row.min_age ?? null,
    max_age: row.max_age ?? null,
    duration_min: row.duration_min ?? null,
    visibility: row.visibility ?? null,
    is_archived: row.is_archived ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    segment: row.segment
      ? { id: row.segment.id, name: row.segment.name ?? null }
      : null,
    skill_tags,
    media,
  };
}

function mapDrillMediaRow(row: any): DrillMediaRecordDto {
  return {
    id: row.id,
    drill_id: row.drill_id,
    type: row.media_type ?? "video",
    url: row.url,
    title: row.title ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    position: row.sort_order ?? null,
  };
}

export async function getDrillById(drill_id: string): Promise<{
  data: unknown;
  error: unknown;
}> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const { data, error } = await client
    .from("drills")
    .select("*")
    .eq("id", drill_id)
    .single();

  if (error) {
    return { data: null, error };
  }

  return { data, error: null };
}
