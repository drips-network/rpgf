import { Router } from "oak";
import * as healthController from "$app/controllers/healthController.ts";

const router = new Router();

router.get("/api/health", healthController.getHealthController);

export default router;
