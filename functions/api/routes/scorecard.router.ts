// src/routes/scorecards.router.ts
import { Router } from "./router.ts";
import {
  handleScorecardsCreateTemplate,
  handleScorecardsList,
} from "../controllers/scorecard.controller.ts";

export function createScorecardsRouter(): Router {
  const router = new Router();

  // POST /api/scorecard
  router.add("POST", "", handleScorecardsCreateTemplate);

  // GET /api/scorecard/list
  router.add("GET", "list", handleScorecardsList);

  return router;
}
