import { Router } from "oak";
import * as c from "../controllers/roundAdminController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.get("/api/rounds/:roundId/admins", enforceAuthenticationMiddleware, c.getRoundAdminsController);
router.patch("/api/rounds/:roundId/admins", enforceAuthenticationMiddleware, c.setRoundAdminsController);

export default router;
