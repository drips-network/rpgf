import { Router } from "oak";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as auditLogController from "$app/controllers/auditLogController.ts";

const router = new Router();

router.get("/api/rounds/:roundId/audit-logs", enforceAuthenticationMiddleware, auditLogController.getAuditLogsForRoundController);

export default router;
