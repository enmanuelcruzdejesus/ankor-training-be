import { Router } from "./router.ts";
import {
  addSkillDrillsController,
  listSkillDrillsController,
  createSkillController,
  createSkillMediaController,
  createSkillMediaUploadUrlController,
  getSkillMediaPlaybackController,
  updateSkillController,
  listSkillsController,
  listSkillTagsController,
  getSkillByIdController,
} from "../controllers/skills.controller.ts";
import {
  orgRoleGuardFromBody,
  orgRoleGuardFromQuery,
} from "../utils/guards.ts";

export function createSkillsRouter(): Router {
  const router = new Router();

  router.add(
    "POST",
    "",
    createSkillController,
    [orgRoleGuardFromBody("org_id", ["coach"])],
  );
  router.add(
    "POST",
    "media/upload-url",
    createSkillMediaUploadUrlController,
    [orgRoleGuardFromBody("org_id", ["coach"])],
  );
  router.add(
    "POST",
    "media",
    createSkillMediaController,
    [orgRoleGuardFromBody("org_id", ["coach"])],
  );
  router.add(
    "GET",
    "media/:skill_id/play",
    getSkillMediaPlaybackController,
    [orgRoleGuardFromQuery("org_id", ["coach", "athlete"])],
  );
  router.add(
    "GET",
    "list",
    listSkillsController,
    [orgRoleGuardFromQuery("org_id", ["coach", "athlete"])],
  );
  router.add(
    "GET",
    "tags",
    listSkillTagsController,
    [orgRoleGuardFromQuery("org_id", ["coach", "athlete"])],
  );
  router.add(
    "PATCH",
    ":id",
    updateSkillController,
    [orgRoleGuardFromQuery("org_id", ["coach"])],
  );
  router.add(
    "POST",
    ":id/drills",
    addSkillDrillsController,
    [orgRoleGuardFromBody("org_id", ["coach"])],
  );
  router.add(
    "GET",
    ":id/drills",
    listSkillDrillsController,
    [orgRoleGuardFromQuery("org_id", ["coach", "athlete"])],
  );
  router.add(
    "GET",
    ":id",
    getSkillByIdController,
    [orgRoleGuardFromQuery("org_id", ["coach", "athlete"])],
  );

  return router;
}
