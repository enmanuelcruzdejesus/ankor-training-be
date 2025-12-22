import { Router } from "./router.ts";
import {
  bulkCreateEvaluationsController,
  handleEvaluationsList,
  handleEvaluationById,
  updateEvaluationMatrixController,
  handleSubmitEvaluation,
} from "../controllers/evaluations.controller.ts";

export function createEvaluationsRouter(): Router {
  const router = new Router();

  // POST /api/evaluations/bulk-create
  router.add("POST", "bulk-create", bulkCreateEvaluationsController);
  router.add("GET", "list", handleEvaluationsList);
  router.add("GET", "eval/:id", handleEvaluationById);
  router.add("PATCH", "eval/:id/matrix", updateEvaluationMatrixController); 
  router.add("POST", ":id", handleSubmitEvaluation);


  return router;
}
