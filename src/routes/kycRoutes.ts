import { Router } from "oak";
import * as c from "$app/controllers/kycController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.post("/api/kyc/applications/:applicationId/request", enforceAuthenticationMiddleware, c.createKycRequestForApplicationController);

router.get("/api/kyc/rounds/:roundId/requests", enforceAuthenticationMiddleware, c.getKycRequestsForRoundController);
router.get("/api/kyc/applications/:applicationId/request", enforceAuthenticationMiddleware, c.getKycRequestForApplicationController);

router.post("/api/kyc/applications/:applicationId/link-existing", enforceAuthenticationMiddleware, c.linkExistingKycToApplicationController);

router.post("/api/kyc/status-updated-webhook/fern", c.fernUpdateWebhookController);
router.post("/api/kyc/status-updated-webhook/treova", c.treovaUpdateWebhookController);

export default router;
