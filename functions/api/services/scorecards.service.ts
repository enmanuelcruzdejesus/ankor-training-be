import { sbAdmin } from "./supabase.ts";

export type ScorecardTemplateRow = {
  id: string;
  org_id: string | null;
  sport_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function rpcCreateScorecardTemplate(payload: {
  p_template: unknown;
  p_created_by?: string;
}) {
  return await sbAdmin!.rpc("create_scorecard_template_tx", payload);
}

export async function listScorecardTemplates(params: {
  org_id: string;             // required
  sport_id?: string | null;   // optional
  q?: string;                 // optional (search name/description)
  limit?: number;             // default 10, max 200
  offset?: number;            // default 0
}) {
  const limit = Number.isFinite(params.limit as number)
    ? Math.min(Math.max(Number(params.limit), 1), 200)
    : 10;

  const offset = Number.isFinite(params.offset as number)
    ? Math.max(Number(params.offset), 0)
    : 0;

  let query = sbAdmin!
    .from("scorecard_templates")
    .select(
      "id, org_id, sport_id, name, description, is_active, created_by, created_at, updated_at",
      { count: "exact" }
    )
    .eq("org_id", params.org_id)
    .order("updated_at", { ascending: false })
    .range(offset, offset + (limit - 1));

  if (params.sport_id) query = query.eq("sport_id", params.sport_id);
  if (params.q?.trim()) {
    const q = params.q.trim();
    // Case-insensitive search on name OR description
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  }

  return await query; // { data, count, error }
}
