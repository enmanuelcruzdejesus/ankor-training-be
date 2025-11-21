// src/services/evaluations.service.ts
import { sbAdmin } from "./supabase.ts";

export async function rpcBulkCreateEvaluations(args: Record<string, unknown>) {
  return await sbAdmin!.rpc("evaluations_bulk_create_tx", args);
}
