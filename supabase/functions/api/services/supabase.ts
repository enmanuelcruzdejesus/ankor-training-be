import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MOCK, SUPABASE_URL, SERVICE_KEY } from "../config/env.ts";

export const sbAdmin: SupabaseClient | null = MOCK
  ? null
  : createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });