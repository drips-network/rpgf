import { Router } from "oak";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as applicationController from "$app/controllers/applicationController.ts";

const router = new Router();

router.put("/api/rounds/:roundId/applications", enforceAuthenticationMiddleware, applicationController.createAppplicationController);
router.get("/api/rounds/:roundId/applications", applicationController.getApplicationsForRoundController);
router.get("/api/rounds/:roundId/applications/:applicationId", applicationController.getApplicationController);

router.post("/api/rounds/:roundId/applications/review", enforceAuthenticationMiddleware, applicationController.submitApplicationReviewController);

export default router;
