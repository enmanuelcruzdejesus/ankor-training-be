import { sbAdmin } from "./supabase.ts";
import {
  type CreateDrillDto,
  type DrillListFilterInput,
  type DrillListItemDto,
  DrillMediaDto,
} from "../dtos/drills.dto.ts";

export type DrillSegmentDto = {
  id: string;
  name: string | null;
};

export type DrillTagDto = {
  id: string;
  title: string;
  category: string | null;
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
    .from("skills")
    .select("id, title, category", { count: "exact" })
    .eq("org_id", org_id)
    .order("title", { ascending: true })
    .range(offset, offset + (limit - 1));

  if (sport_id) {
    query = query.eq("sport_id", sport_id);
  }

  if (q?.trim()) {
    query = query.or(`title.ilike.%${q}%,category.ilike.%${q}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return { data: [], count: 0, error };
  }

  const tags: DrillTagDto[] = (data ?? []).map((row: any) => ({
    id: row.id,
    title: typeof row.title === "string" ? row.title : "",
    category: row.category ?? null,
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
    skill_tag_ids,
    limit,
    offset,
  } = filters;

  const rangeTo = offset + (limit - 1);

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
        drill_skills(skill_id)
      `,
      { count: "exact" },
    )
    .eq("org_id", org_id)
    .range(offset, rangeTo)
    .order("created_at", { ascending: false });

  if (name) {
    query = query.ilike("name", `%${name}%`);
  }

  if (segment_ids && segment_ids.length > 0) {
    query = query.in("segment_id", segment_ids);
  }

  if (min_age !== null && min_age !== undefined) {
    query = query.gte("min_age", min_age);
  }

  if (max_age !== null && max_age !== undefined) {
    query = query.lte("max_age", max_age);
  }

  if (min_players !== null && min_players !== undefined) {
    query = query.gte("min_players", min_players);
  }

  if (max_players !== null && max_players !== undefined) {
    query = query.lte("max_players", max_players);
  }

  if (skill_tag_ids && skill_tag_ids.length > 0) {
    query = query.in("drill_skills.skill_id", skill_tag_ids);
  }

  const { data, error, count } = await query;

  if (error) {
    return { data: [], count: 0, error };
  }

  const mapped: DrillListItemDto[] = (data ?? []).map((row: any) =>
    mapDrillRowToDto(row),
  );

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
