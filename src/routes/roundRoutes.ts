import { Router } from "oak";
import * as roundController from "$app/controllers/roundController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.get("/api/rounds", roundController.getRoundsController);
router.get("/api/rounds/:slug", roundController.getRoundController);

router.get("/api/rounds/check-slug/:slug", roundController.checkSlugAvailabilityController);

router.put("/api/round-drafts/", enforceAuthenticationMiddleware, roundController.createRoundDraftController);
router.get("/api/round-drafts", enforceAuthenticationMiddleware, roundController.getRoundDraftsController);
router.get("/api/round-drafts/:id", enforceAuthenticationMiddleware, roundController.getRoundDraftController);
router.post("/api/round-drafts/:id/publish", enforceAuthenticationMiddleware, roundController.publishRoundDraftController);
router.delete("/api/round-drafts/:id", enforceAuthenticationMiddleware, roundController.deleteRoundDraftController);
router.patch("/api/round-drafts/:id", enforceAuthenticationMiddleware, roundController.patchRoundDraftController);

router.post("/api/round-drafts/:id/publish", enforceAuthenticationMiddleware, roundController.publishRoundDraftController);

router.patch("/api/rounds/:slug", enforceAuthenticationMiddleware, roundController.patchRoundController);
router.delete("/api/rounds/:slug", enforceAuthenticationMiddleware, roundController.deleteRoundController);

export default router;
