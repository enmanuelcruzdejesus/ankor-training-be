import { Router } from "./router.ts";
import {
  createDrillController,
  createDrillMediaController,
  createDrillMediaUploadUrlController,
  getDrillMediaPlaybackController,
  listDrillsController,
  listDrillTagsController,
  listSegmentsController,
  getDrillByIdController,
} from "../controllers/drills.controller.ts";

export function createDrillsRouter(): Router {
  const router = new Router();

  router.add("POST", "", createDrillController);
  router.add("POST", "media/upload-url", createDrillMediaUploadUrlController);
  router.add("POST", "media", createDrillMediaController);
  router.add("GET", "media/:drill_id/play", getDrillMediaPlaybackController);
  router.add("GET", "list", listDrillsController);
  router.add("GET", "segments", listSegmentsController);
  router.add("GET", "tags", listDrillTagsController);
  router.add("GET", ":id", getDrillByIdController);

  return router;
}
