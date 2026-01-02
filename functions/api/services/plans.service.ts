import { sbAdmin } from "./supabase.ts";
import type {
  CreatePlanInput,
  InvitedPlanDto,
  InvitedPlanListInput,
  PlanDto,
  PlanListFilterInput,
  PlanItemInput,
  UpdatePlanInput,
} from "../dtos/plans.dto.ts";

const PLAN_SELECT =
  "id, org_id, owner_user_id, name, description, visibility, status, tags, estimated_minutes, created_at, updated_at";

function mapPlanRow(row: any): PlanDto {
  return {
    id: row.id,
    org_id: row.org_id ?? null,
    owner_user_id: row.owner_user_id,
    name: row.name,
    description: row.description ?? null,
    visibility: row.visibility ?? "private",
    status: row.status ?? "draft",
    tags: Array.isArray(row.tags) ? row.tags : [],
    estimated_minutes: row.estimated_minutes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildPlanItemRows(
  plan_id: string,
  items: PlanItemInput[],
  startIndex = 0,
): Array<Record<string, unknown>> {
  return items.map((item, index) => ({
    plan_id,
    section_title: item.section_title ?? null,
    section_order: item.section_order ?? null,
    position: item.position ?? (startIndex + index),
    item_type: item.item_type ?? "drill",
    drill_id: item.drill_id ?? null,
    title: item.title ?? null,
    instructions: item.instructions ?? null,
    sets: item.sets ?? null,
    reps: item.reps ?? null,
    duration_seconds: item.duration_seconds ?? null,
    rest_seconds: item.rest_seconds ?? null,
    config: item.config ?? {},
  }));
}

export async function listPlansByType(
  filters: PlanListFilterInput,
): Promise<{ data: PlanDto[]; count: number; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: [], count: 0, error: new Error("Supabase client not initialized") };
  }

  const { type, user_id, limit, offset } = filters;
  const rangeTo = offset + (limit - 1);

  console.log("user_id:", user_id, "type:", type);

  let query = client
    .from("practice_plans")
    .select(PLAN_SELECT, { count: "exact" })
    .range(offset, rangeTo)
    .order("updated_at", { ascending: false });

  query = query.eq("type", type);
  if (type !== "prebuild") {
    query = query.eq("owner_user_id", user_id);
  }
  const { data, error, count } = await query;
  if (error) return { data: [], count: 0, error };

  const items = (data ?? []).map((row: any) => mapPlanRow(row));
  return { data: items, count: count ?? items.length, error: null };
}

export async function listInvitedPlans(
  filters: InvitedPlanListInput,
): Promise<{ data: InvitedPlanDto[]; count: number; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: [], count: 0, error: new Error("Supabase client not initialized") };
  }

  const { user_id, limit, offset } = filters;
  const rangeTo = offset + (limit - 1);

  const { data, error, count } = await client
    .from("practice_plans")
    .select(
      `${PLAN_SELECT}, practice_plan_members!inner(role, user_id, added_by, created_at)`,
      { count: "exact" },
    )
    .eq("practice_plan_members.user_id", user_id)
    .neq("owner_user_id", user_id)
    .range(offset, rangeTo)
    .order("updated_at", { ascending: false });

  if (error) return { data: [], count: 0, error };

  const items = (data ?? []).map((row: any) => {
    const base = mapPlanRow(row);
    const member = Array.isArray(row.practice_plan_members)
      ? row.practice_plan_members[0]
      : row.practice_plan_members;

    return {
      ...base,
      member_role: member?.role ?? "viewer",
      invited_at: member?.created_at ?? base.created_at,
      invited_by: member?.added_by ?? null,
    };
  });

  return { data: items, count: count ?? items.length, error: null };
}

export async function getPlanById(
  plan_id: string,
): Promise<{ data: PlanDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const { data, error } = await client
    .from("practice_plans")
    .select(PLAN_SELECT)
    .eq("id", plan_id)
    .maybeSingle();

  if (error) return { data: null, error };

  return { data: data ? mapPlanRow(data) : null, error: null };
}

export async function updatePlan(
  plan_id: string,
  input: UpdatePlanInput,
): Promise<{ data: PlanDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const { add_items = [], remove_item_ids = [], ...rest } = input;
  const patch: Record<string, unknown> = {};

  if (rest.name !== undefined) patch.name = rest.name.trim();
  if (rest.description !== undefined) patch.description = rest.description ?? null;
  if (rest.visibility !== undefined) patch.visibility = rest.visibility;
  if (rest.status !== undefined) patch.status = rest.status;
  if (rest.tags !== undefined) patch.tags = rest.tags ?? [];
  if (rest.estimated_minutes !== undefined) {
    patch.estimated_minutes = rest.estimated_minutes ?? null;
  }
  if (rest.org_id !== undefined) patch.org_id = rest.org_id ?? null;

  let planRow: any | null = null;

  if (Object.keys(patch).length > 0) {
    const { data, error } = await client
      .from("practice_plans")
      .update(patch)
      .eq("id", plan_id)
      .select(PLAN_SELECT)
      .maybeSingle();

    if (error) return { data: null, error };
    if (!data) return { data: null, error: new Error("Plan not found") };
    planRow = data;
  } else {
    const { data, error } = await client
      .from("practice_plans")
      .select(PLAN_SELECT)
      .eq("id", plan_id)
      .maybeSingle();

    if (error) return { data: null, error };
    if (!data) return { data: null, error: new Error("Plan not found") };
    planRow = data;
  }

  if (remove_item_ids.length > 0) {
    const { error: removeError } = await client
      .from("practice_plan_items")
      .delete()
      .eq("plan_id", plan_id)
      .in("id", remove_item_ids);
    if (removeError) return { data: null, error: removeError };
  }

  if (add_items.length > 0) {
    let startIndex = 0;
    const needsPosition = add_items.some((item) =>
      item.position === null || item.position === undefined
    );

    if (needsPosition) {
      const { data: lastRow, error: lastError } = await client
        .from("practice_plan_items")
        .select("position")
        .eq("plan_id", plan_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastError) return { data: null, error: lastError };
      const lastPosition = typeof lastRow?.position === "number"
        ? lastRow.position
        : -1;
      startIndex = lastPosition + 1;
    }

    const rows = buildPlanItemRows(plan_id, add_items, startIndex);
    const { error: addError } = await client
      .from("practice_plan_items")
      .insert(rows);
    if (addError) return { data: null, error: addError };
  }

  return { data: planRow ? mapPlanRow(planRow) : null, error: null };
}

export async function createPlan(
  input: CreatePlanInput,
): Promise<{ data: PlanDto | null; error: unknown }> {
  const client = sbAdmin;
  if (!client) {
    return { data: null, error: new Error("Supabase client not initialized") };
  }

  const payload: Record<string, unknown> = {
    owner_user_id: input.owner_user_id,
    org_id: input.org_id ?? null,
    name: input.name.trim(),
    description: input.description ?? null,
    tags: input.tags ?? [],
    estimated_minutes: input.estimated_minutes ?? null,
  };

  if (input.visibility !== undefined) payload.visibility = input.visibility;
  if (input.status !== undefined) payload.status = input.status;

  const { data, error } = await client
    .from("practice_plans")
    .insert(payload)
    .select(PLAN_SELECT)
    .single();

  if (error) return { data: null, error };

  const plan = data ? mapPlanRow(data) : null;
  if (!plan) {
    return { data: null, error: new Error("Failed to create plan") };
  }

  const items = input.items ?? [];
  const rows = buildPlanItemRows(plan.id, items);

  if (rows.length === 0) {
    await client.from("practice_plans").delete().eq("id", plan.id);
    return { data: null, error: new Error("items is required") };
  }

  const { error: itemsError } = await client
    .from("practice_plan_items")
    .insert(rows);

  if (itemsError) {
    await client.from("practice_plans").delete().eq("id", plan.id);
    return { data: null, error: itemsError };
  }

  return { data: plan, error: null };
}
