import { Router } from "oak";
import * as roundController from "$app/controllers/roundController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.get("/api/rounds", roundController.getRoundsController);
router.get("/api/rounds/own", enforceAuthenticationMiddleware, roundController.getOwnRoundsController);
router.get("/api/rounds/:id", roundController.getRoundController);

router.get("/api/rounds/check-slug/:slug", roundController.checkSlugAvailabilityController);

router.put("/api/rounds", enforceAuthenticationMiddleware, roundController.createRoundController);
router.post("/api/rounds/:id/publish", enforceAuthenticationMiddleware, roundController.publishRoundController);
router.delete("/api/rounds/:id", enforceAuthenticationMiddleware, roundController.deleteRoundController);
router.patch("/api/rounds/:id", enforceAuthenticationMiddleware, roundController.patchRoundController);

router.patch("/api/rounds/:id/drip-lists", enforceAuthenticationMiddleware, roundController.linkDripListToRoundController);

export default router;
