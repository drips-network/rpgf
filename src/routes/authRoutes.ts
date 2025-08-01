import { Router } from "oak";
import * as authController from "$app/controllers/authController.ts";

const router = new Router();

router.get("/api/auth/nonce", authController.getNonceController);
router.post("/api/auth/login", authController.logInController);
router.post("/api/auth/refresh-access-token", authController.refreshAccessTokenController);
router.post("/api/auth/logout", authController.logoutController);

export default router;
