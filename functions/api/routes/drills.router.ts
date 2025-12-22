import { Router } from "./router.ts";
import {
  createDrillController,
  listDrillsController,
  listDrillTagsController,
  listSegmentsController,
  getDrillByIdController,
} from "../controllers/drills.controller.ts";

export function createDrillsRouter(): Router {
  const router = new Router();

  router.add("POST", "", createDrillController);
  router.add("GET", "list", listDrillsController);
  router.add("GET", "segments", listSegmentsController);
  router.add("GET", "tags", listDrillTagsController);
  router.add("GET", "by-id", getDrillByIdController);

  return router;
}
