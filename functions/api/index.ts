/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

import { Router } from "./router.ts";
import { corsHeaders } from "./utils/cors.ts";
import { notFound, serverError } from "./utils/responses.ts";

import { handleAuthSignup } from "./controllers/authControler.ts";
import { handleOrgSignup } from "./controllers/orgController.ts";
import { handleScorecardsCreateTemplate } from "./controllers/scorecardsController.ts";
import { handleSkillsList } from "./controllers/skillsController.ts";

const router = new Router();
// 🔁 New paths
router.add("POST", "auth/signup", handleAuthSignup);
router.add("POST", "org/signup", handleOrgSignup);
router.add("POST", "scorecard", handleScorecardsCreateTemplate);
router.add("GET",  "skills/list", handleSkillsList);

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "*";
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  try {
    // URL: /functions/v1/api/<subpath>
    const u = new URL(req.url);
    const parts = u.pathname.split("/"); // ["", "functions", "v1", "api", ...]
    const subpath = parts.slice(4).join("/"); // e.g. "auth/signup"

    const res = await router.handle(req.method, subpath, req);
    return res ?? notFound(`Not found: ${req.method} /${subpath || ""}`, origin);
  } catch (err) {
    return serverError(`Unexpected error: ${(err as Error)?.message ?? String(err)}`, origin);
  }
});
