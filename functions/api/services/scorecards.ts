import { sbAdmin } from "./supabase.ts";

export async function rpcCreateScorecardTemplate(payload: {
  p_template: unknown;
  p_created_by?: string;
}) {
  return await sbAdmin!.rpc("create_scorecard_template_tx", payload);
}
