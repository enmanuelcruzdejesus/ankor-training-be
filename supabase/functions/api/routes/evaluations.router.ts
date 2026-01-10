import { Router } from "./router.ts";
import {
  bulkCreateEvaluationsController,
  handleEvaluationsList,
  handleEvaluationById,
  updateEvaluationMatrixController,
  handleSubmitEvaluation,
} from "../controllers/evaluations.controller.ts";
import {
  evaluationBulkOrgGuard,
  orgRoleGuardFromBody,
  orgRoleGuardFromQuery,
} from "../utils/guards.ts";

export function createEvaluationsRouter(): Router {
  const router = new Router();

  // POST /api/evaluations/bulk-create
  router.add(
    "POST",
    "bulk-create",
    bulkCreateEvaluationsController,
    [evaluationBulkOrgGuard(["coach"])],
  );
  router.add(
    "GET",
    "list",
    handleEvaluationsList,
    [orgRoleGuardFromQuery("org_id", ["coach"])],
  );
  router.add(
    "GET",
    "eval/:id",
    handleEvaluationById,
    [orgRoleGuardFromQuery("org_id", ["coach"])],
  );
  router.add(
    "PATCH",
    "eval/:id/matrix",
    updateEvaluationMatrixController,
    [orgRoleGuardFromBody("org_id", ["coach"])],
  ); 
  router.add(
    "POST",
    ":id",
    handleSubmitEvaluation,
    [orgRoleGuardFromQuery("org_id", ["coach"])],
  );


  return router;
}
