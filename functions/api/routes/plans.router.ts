import { Router } from "./router.ts";
import {
  createPlanController,
  getPlanByIdController,
  listInvitedPlansController,
  listPlansController,
  updatePlanController,
} from "../controllers/plans.controller.ts";

export function createPlansRouter(): Router {
  const router = new Router();

  router.add("GET", "list", listPlansController);
  router.add("GET", "invited", listInvitedPlansController);
  router.add("GET", ":id", getPlanByIdController);
  router.add("PATCH", ":id", updatePlanController);
  router.add("POST", "", createPlanController);

  return router;
}
