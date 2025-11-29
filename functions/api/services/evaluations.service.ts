import { sbAdmin } from "./supabase.ts";
import {
  EvaluationInput,
  EvaluationWithItems,
} from "../schemas/evaluations.ts";
import {
  EvaluationDetailDto,
  toEvaluationDetailDto,
} from "../dtos/evaluations.dto.ts";

export async function rpcBulkCreateEvaluations(args: {
  evaluations: EvaluationInput[];
}): Promise<{ data: EvaluationWithItems[] | null; error: unknown }> {
  const { data, error } = await sbAdmin!.rpc(
    "evaluations_bulk_create_tx",
    args,
  );

  if (error) {
    return { data: null, error };
  }

  const mapped: EvaluationWithItems[] | null = (data as any[] | null)?.map(
    (row: any) => {
      const {
        template_id,
        teams_id,
        evaluation_items,
        // keep everything else (id, org_id, coach_id, notes, created_at, sport_id, etc.)
        ...rest
      } = row;

      const mappedItems =
        (evaluation_items as any[] | undefined)?.map((item: any) => {
          const { subskill_id, comment, ...itemRest } = item;
          return {
            ...itemRest,
            // DB → TS schema mapping
            skill_id: subskill_id,
            comments: comment,
          };
        }) ?? [];

      return {
        ...rest,
        // DB → TS schema mapping
        scorecard_template_id: template_id,
        team_id: teams_id,
        evaluation_items: mappedItems,
      } as EvaluationWithItems;
    },
  ) ?? null;

  return {
    data: mapped,
    error: null,
  };
}


export async function listEvaluations(): Promise<{
  data: any[] | null;
  error: unknown;
}> {
  const { data, error } = await sbAdmin!
    .from('evaluations')
    .select(
      `
      id,
      org_id,
      template_id,
      teams_id,
      coach_id,
      notes,
      created_at,
      team:teams!inner (
        id,
        name
      ),
      template:scorecard_templates!inner (
        id,
        name
      )
    `,
    )
    .order('created_at', { ascending: false })

  if (error) {
    return { data: null, error }
  }

  const mapped = (data ?? []).map((row: any) => {
    const { template_id, team, template, ...rest } = row

    // ---- team name ----
    const team_name: string | null = team?.name ?? null

    // ---- template name ----
    const scorecard_template_name: string | null = template?.name ?? null

    return {
      ...rest,
      scorecard_template_id: template_id,
      scorecard_template_name,
      team_name,
    }
  })

  return { data: mapped, error: null }
}

export async function getEvaluationById(
  evaluationId: string,
): Promise<EvaluationDetailDto | null> {
  if (!sbAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  const { data, error } = await sbAdmin
    .from("evaluations")
    .select(
      `
      id,
      org_id,
      template_id,
      coach_id,
      teams_id,
      notes,
      created_at,
      teams:teams_id (
        id,
        name
      ),
      scorecard_templates:template_id (
        id,
        name,
        scorecard_categories (
          id,
          template_id,
          name,
          description,
          position
        )
      ),
      evaluation_items (
        id,
        evaluation_id,
        athlete_id,
        subskill_id,
        rating,
        comment,
        created_at,
        athletes:athlete_id (
          id,
          first_name,
          last_name
        )
      )
    `,
    )
    .eq("id", evaluationId)
    .maybeSingle();

  if (error) {
    console.error("[getEvaluationByIdService] Supabase error", error);
    throw error;
  }

  if (!data) {
    return null;
  }

  return toEvaluationDetailDto(data);
}
