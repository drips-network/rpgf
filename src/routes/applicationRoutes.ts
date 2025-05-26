import { Router } from "oak";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as applicationController from "$app/controllers/applicationController.ts";

const router = new Router();

router.put("/api/rounds/:slug/applications", enforceAuthenticationMiddleware, applicationController.createAppplicationController);
router.get("/api/rounds/:slug/applications", applicationController.getApplicationsForRoundController);

router.post("/api/rounds/:slug/applications/review", enforceAuthenticationMiddleware, applicationController.submitApplicationReviewController);

export default router;
