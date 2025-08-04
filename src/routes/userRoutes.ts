import { Router } from "oak";
import * as userController from "$app/controllers/userController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.get("/api/users/me", enforceAuthenticationMiddleware, userController.getOwnUserDataController);

export default router;
