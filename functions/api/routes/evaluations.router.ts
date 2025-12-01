import { Router } from "./router.ts";
import {
  bulkCreateEvaluationsController,
  handleEvaluationsList,
  handleEvaluationById,
  updateEvaluationMatrixController,
} from "../controllers/evaluations.controller.ts";

export function createEvaluationsRouter(): Router {
  const router = new Router();

  // POST /api/evaluations/bulk-create
  router.add("POST", "bulk-create", bulkCreateEvaluationsController);

  // GET /api/evaluations/list
  router.add("GET", "list", handleEvaluationsList);


  // NEW: GET /api/evaluations/eval/:id
  router.add("GET", "eval/:id", handleEvaluationById);

    // PATCH /api/evaluations/eval/:id/matrix
  router.add("PATCH", "eval/:id/matrix", updateEvaluationMatrixController); 


  return router;
}
