import { sbAdmin } from "./supabase.ts";
import {
  EvaluationInput,
  EvaluationWithItems,
} from "../schemas/evaluations.ts";
import {
  EvaluationDetailDto,
   type EvaluationMatrixUpdateDto,
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

export async function applyEvaluationMatrixUpdateService(
  dto: EvaluationMatrixUpdateDto,
): Promise<EvaluationDetailDto> {
  if (!sbAdmin) {
    throw new Error("Supabase admin client is not configured");
  }

  const evaluationId = dto.evaluation_id;

  // 1) Optionally patch the evaluation header row
  const patch: Record<string, unknown> = {};
  if (dto.org_id !== undefined) patch.org_id = dto.org_id;
  if (dto.template_id !== undefined) patch.template_id = dto.template_id;
  if (dto.team_id !== undefined) patch.teams_id = dto.team_id;
  if (dto.coach_id !== undefined) patch.coach_id = dto.coach_id;
  if (dto.notes !== undefined) patch.notes = dto.notes;

  if (Object.keys(patch).length > 0) {
    const { error: headerError } = await sbAdmin
      .from("evaluations")
      .update(patch)
      .eq("id", evaluationId);

    if (headerError) {
      console.error(
        "[applyEvaluationMatrixUpdateService] header update error",
        headerError,
      );
      throw headerError;
    }
  }

  // 2) Apply item-level operations
  for (const op of dto.operations) {
    if (op.type === "remove_athlete") {
      const { error } = await sbAdmin
        .from("evaluation_items")
        .delete()
        .eq("evaluation_id", evaluationId)
        .eq("athlete_id", op.athlete_id);

      if (error) {
        console.error(
          "[applyEvaluationMatrixUpdateService] remove_athlete error",
          error,
        );
        throw error;
      }
      continue;
    }

    if (op.type === "upsert_rating") {
      // rating null => delete row for this (evaluation, athlete, subskill)
      if (
        op.rating === null ||
        op.rating === undefined ||
        Number.isNaN(Number(op.rating))
      ) {
        const { error } = await sbAdmin
          .from("evaluation_items")
          .delete()
          .eq("evaluation_id", evaluationId)
          .eq("athlete_id", op.athlete_id)
          .eq("subskill_id", op.subskill_id);

        if (error) {
          console.error(
            "[applyEvaluationMatrixUpdateService] delete rating error",
            error,
          );
          throw error;
        }
        continue;
      }

      const rating = Number(op.rating);

      // Check if item exists
      const { data: existing, error: selectError } = await sbAdmin
        .from("evaluation_items")
        .select("id")
        .eq("evaluation_id", evaluationId)
        .eq("athlete_id", op.athlete_id)
        .eq("subskill_id", op.subskill_id)
        .maybeSingle();

      if (selectError) {
        console.error(
          "[applyEvaluationMatrixUpdateService] select existing item error",
          selectError,
        );
        throw selectError;
      }

      if (existing) {
        // UPDATE existing
        const { error: updateError } = await sbAdmin
          .from("evaluation_items")
          .update({
            rating,
            comment: op.comments ?? null,
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error(
            "[applyEvaluationMatrixUpdateService] update rating error",
            updateError,
          );
          throw updateError;
        }
      } else {
        // INSERT new
        const { error: insertError } = await sbAdmin.from("evaluation_items").insert({
          evaluation_id: evaluationId,
          athlete_id: op.athlete_id,
          subskill_id: op.subskill_id,
          rating,
          comment: op.comments ?? null,
          recommended_skill_id: null,
        });

        if (insertError) {
          console.error(
            "[applyEvaluationMatrixUpdateService] insert rating error",
            insertError,
          );
          throw insertError;
        }
      }
    }
  }

  // 3) Return the fresh evaluation detail (same shape as GET /eval/:id)
  const updated = await getEvaluationById(evaluationId);
  if (!updated) {
    throw new Error("Evaluation not found after matrix update");
  }

  return updated;
}

