import { Router } from "oak";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as resolutController from "$app/controllers/resultController.ts";

const router = new Router();

router.post('/api/rounds/:slug/results/recalculate', enforceAuthenticationMiddleware, resolutController.recalculateResultsController);
router.post('/api/rounds/:slug/results/publish', enforceAuthenticationMiddleware, resolutController.publishResultsController);

export default router;
