import { Router } from "./router.ts";
import { listOrgUsersController } from "../controllers/users.controller.ts";

export function createUsersRouter(): Router {
  const router = new Router();

  router.add("GET", "list", listOrgUsersController);

  return router;
}
