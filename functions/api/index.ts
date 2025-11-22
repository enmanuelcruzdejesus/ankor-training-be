/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

import { Router } from "./routes/router.ts";
import { corsHeaders } from "./utils/cors.ts";
import { notFound, serverError } from "./utils/responses.ts";

// Routers
import { createScorecardsRouter } from "./routes/scorecard.router.ts";
// ... other routers
import { createAuthRouter } from "./routes/auth.router.ts";
import { createOrgRouter } from "./routes/org.router.ts";
import { createSkillsRouter } from "./routes/skills.router.ts";
import { createEvaluationsRouter } from "./routes/evaluations.router.ts";
import { createTeamsRouter } from "./routes/teams.router.ts"; 

const router = new Router();

// Mount resource routers
router.use("auth", createAuthRouter());
router.use("org", createOrgRouter());
router.use("scorecard", createScorecardsRouter());
router.use("skills", createSkillsRouter());
router.use("teams", createTeamsRouter()); 
router.use("evaluations", createEvaluationsRouter());

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "*";

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  try {
    // URL: /functions/v1/api/<subpath>
    const u = new URL(req.url);
    const parts = u.pathname.split("/"); // ["", "functions", "v1", "api", ...]
    const subpath = parts.slice(4).join("/"); // e.g. "scorecard/list"

    const res = await router.handle(req.method, subpath, req, origin);
    return res ?? notFound(`Not found: ${req.method} /${subpath || ""}`, origin);
  } catch (err) {
    return serverError(
      `Unexpected error: ${(err as Error)?.message ?? String(err)}`,
      origin,
    );
  }
});
