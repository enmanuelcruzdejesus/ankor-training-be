import { Router } from "./router.ts";
import {
  bulkCreateEvaluationsController,
  handleEvaluationsList,
} from "../controllers/evaluations.controller.ts";

export function createEvaluationsRouter(): Router {
  const router = new Router();

  // POST /api/evaluations/bulk-create
  router.add("POST", "bulk-create", bulkCreateEvaluationsController);

  // GET /api/evaluations/list
  router.add("GET", "list", handleEvaluationsList);

  return router;
}
