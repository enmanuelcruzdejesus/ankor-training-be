// src/routes/auth.router.ts
import { Router } from "./router.ts";
import { handleAuthSignup } from "../controllers/auth.controller.ts";

export function createAuthRouter(): Router {
  const router = new Router();

  // POST /api/auth/signup
  router.add("POST", "signup", handleAuthSignup);

  return router;
}
