import { Router } from "oak";
import * as roundController from "$app/controllers/roundController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.put("/api/rounds", enforceAuthenticationMiddleware, roundController.createRoundController);
router.patch("/api/rounds/:id", enforceAuthenticationMiddleware, roundController.patchRoundController);
router.get("/api/rounds/:id", roundController.getRoundController);

export default router;
