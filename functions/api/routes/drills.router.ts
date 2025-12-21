import { Router } from "./router.ts";
import {
  createDrillController,
  listDrillsController,
} from "../controllers/drills.controller.ts";

export function createDrillsRouter(): Router {
  const router = new Router();

  router.add("POST", "", createDrillController);
  router.add("GET", "list", listDrillsController);

  return router;
}
