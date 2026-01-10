// src/routes/teams.router.ts
import { Router } from "./router.ts";
import { handleTeamsWithAthletesList ,getTeamsController, handleAthletesByTeam } from "../controllers/teams.controller.ts";
import { orgRoleGuardFromQuery } from "../utils/guards.ts";



export function createTeamsRouter(): Router {
  const router = new Router();

  // GET /api/teams/list-with-athletes
  router.add(
    "GET",
    "list-with-athletes",
    handleTeamsWithAthletesList,
    [orgRoleGuardFromQuery("org_id", ["coach"])],
  );
  router.add(
    "GET",
    "list",
    getTeamsController,
    [orgRoleGuardFromQuery("org_id", ["coach"])],
  );
  router.add(
    "GET",
    "athletes-by-team",
    handleAthletesByTeam,
    [orgRoleGuardFromQuery("org_id", ["coach"])],
  );


  return router;
}
