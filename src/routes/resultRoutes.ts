import { Router } from "oak";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as resolutController from "$app/controllers/resultController.ts";

const router = new Router();

router.post('/api/rounds/:roundId/results/recalculate', enforceAuthenticationMiddleware, resolutController.recalculateResultsController);
router.post('/api/rounds/:roundId/results/publish', enforceAuthenticationMiddleware, resolutController.publishResultsController);

router.get('/api/rounds/:roundId/results/drip-list-weights', enforceAuthenticationMiddleware, resolutController.getDripListWeightsController);

export default router;
