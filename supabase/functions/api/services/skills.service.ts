import { sbAdmin } from "./supabase.ts";

export async function listSkills(params: {
  org_id: string;
  sport_id?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const { org_id, sport_id, q, limit = 50, offset = 0 } = params;

  let query = sbAdmin!
    .from("skills")
    .select(
      "id, org_id, sport_id, category, title, description, level, visibility, status, created_at, updated_at",
      { count: "exact" }
    )
    .eq("org_id", org_id)
    .order("title", { ascending: true })
    .range(offset, offset + (limit - 1));

  if (sport_id) query = query.eq("sport_id", sport_id);
  if (q?.trim()) query = query.or(`title.ilike.%${q}%,category.ilike.%${q}%`);

  return await query;
}
