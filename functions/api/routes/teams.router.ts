// src/routes/teams.router.ts
import { Router } from "./router.ts";
import { handleTeamsWithAthletesList ,getTeamsController, handleAthletesByTeam } from "../controllers/teams.controller.ts";



export function createTeamsRouter(): Router {
  const router = new Router();

  // GET /api/teams/list-with-athletes
  router.add("GET", "list-with-athletes", handleTeamsWithAthletesList);
  router.add("GET", "list", getTeamsController);
  router.add("GET", "athletes-by-team", handleAthletesByTeam);


  return router;
}
