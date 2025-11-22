import { sbAdmin } from "./supabase.ts";
import {
  EvaluationInput,
  EvaluationWithItems,
} from "../schemas/evaluations.ts";


export async function rpcBulkCreateEvaluations(args: {
  evaluations: EvaluationInput[];
}): Promise<{ data: EvaluationWithItems[] | null; error: unknown }> {
  const { data, error } = await sbAdmin!.rpc(
    "evaluations_bulk_create_tx",
    args,
  );

  return {
    data: data as EvaluationWithItems[] | null,
    error,
  };
}


export async function listEvaluations(): Promise<{
  data: any[] | null;
  error: unknown;
}> {
  const { data, error } = await sbAdmin!
    .from("evaluations")
    .select(`
      id,
      org_id,
      template_id,
      athlete_id,
      coach_id,
      notes,
      created_at,
      athlete:athletes (
        id,
        profile:profiles (
          first_name,
          last_name
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error };
  }

  const mapped = (data ?? []).map((row: any) => {
    const { template_id, athlete, ...rest } = row;

    let athlete_name: string | null = null;
    if (athlete && athlete.profile) {
      const { first_name, last_name } = athlete.profile;
      athlete_name = [first_name, last_name].filter(Boolean).join(" ") || null;
    }

    return {
      ...rest,
      scorecard_template_id: template_id,
      athlete_name,
    };
  });

  return { data: mapped, error: null };
}