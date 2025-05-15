import { Router } from "oak";
import * as authController from "$app/controllers/authController.ts";

const router = new Router();

// Prefix all auth routes with /api/auth
router.get("/api/auth/nonce", authController.getNonceController);
router.post("/api/auth/verify", authController.verifySignatureController);

export default router;
