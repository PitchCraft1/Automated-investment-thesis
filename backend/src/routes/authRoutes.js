import { Router } from "express";
import { authProviders, login, me, oauthFailure, oauthSuccess, register } from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { passport } from "../config/passport.js";
import { env } from "../config/env.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);
router.get("/providers", authProviders);

if (env.oauth.google.enabled) {
  router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
  router.get(
    "/google/callback",
    passport.authenticate("google", { failureRedirect: "/api/auth/oauth/failure", session: false }),
    oauthSuccess
  );
}

if (env.oauth.linkedin.enabled) {
  router.get("/linkedin", passport.authenticate("linkedin", { session: false, prompt: "login" }));
  router.get(
    "/linkedin/callback",
    passport.authenticate("linkedin", { failureRedirect: "/api/auth/oauth/failure", session: false }),
    oauthSuccess
  );
}

router.get("/oauth/failure", oauthFailure);

export default router;
