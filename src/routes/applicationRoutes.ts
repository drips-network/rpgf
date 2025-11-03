import { Router } from "oak";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as applicationController from "$app/controllers/applicationController.ts";

const router = new Router();

router.put("/api/rounds/:roundId/applications", enforceAuthenticationMiddleware, applicationController.createAppplicationController);
router.post("/api/rounds/:roundId/applications/review", enforceAuthenticationMiddleware, applicationController.submitApplicationReviewController);
router.post("/api/rounds/:roundId/applications/:applicationId/add-attestation-uid", enforceAuthenticationMiddleware, applicationController.addApplicationAttestationController);
router.post("/api/rounds/:roundId/applications/:applicationId", enforceAuthenticationMiddleware, applicationController.updateApplicationController);
router.get("/api/rounds/:roundId/applications", applicationController.getApplicationsForRoundController);
router.get("/api/rounds/:roundId/applications/:applicationId", applicationController.getApplicationController);
router.get("/api/rounds/:roundId/applications/:applicationId/history", applicationController.getApplicationHistoryController);

export default router;
