import { Router } from "./router.ts";
import {
  handleScorecardsCreateTemplate,
  handleScorecardsList,
  handleScorecardCategoriesByTemplate,
  handleScorecardSubskillsByCategory
} from "../controllers/scorecard.controller.ts";

export function createScorecardsRouter(): Router {
  const router = new Router();

  // POST /api/scorecard
  router.add("POST", "", handleScorecardsCreateTemplate);

  // GET /api/scorecard/list
  router.add("GET", "list", handleScorecardsList);

   router.add("GET", "categories", handleScorecardCategoriesByTemplate);

  router.add("GET", "subskills", handleScorecardSubskillsByCategory);

  return router;
}
