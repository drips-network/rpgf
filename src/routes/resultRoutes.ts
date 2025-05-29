import { Router } from "oak";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as resolutController from "$app/controllers/resultController.ts";

const router = new Router();

router.get('/api/rounds/:slug/results', enforceAuthenticationMiddleware, resolutController.getResultsController);

export default router;
