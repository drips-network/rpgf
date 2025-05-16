import { Router } from "oak";
import * as roundController from "$app/controllers/roundController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.get("/api/rounds", roundController.getRoundsController);
router.get("/api/rounds/:id", roundController.getRoundController);

router.put("/api/rounds", enforceAuthenticationMiddleware, roundController.createRoundController);
router.patch("/api/rounds/:id", enforceAuthenticationMiddleware, roundController.patchRoundController);
router.delete("/api/rounds/:id", enforceAuthenticationMiddleware, roundController.deleteRoundController);

export default router;
