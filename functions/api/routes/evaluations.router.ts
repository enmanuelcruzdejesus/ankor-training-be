// src/routes/evaluations.router.ts
import { Router } from "./router.ts";
import { bulkCreateEvaluationsController } from "../controllers/evaluations.controller.ts";

export function createEvaluationsRouter(): Router {
  const router = new Router();

  // POST /api/evaluations/bulk-create
  router.add("POST", "bulk-create", bulkCreateEvaluationsController);

  // Later you can add more:
  // router.add("GET", "list", handleEvaluationsList);
  // router.add("GET", ":id", handleEvaluationDetail);

  return router;
}
