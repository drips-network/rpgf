import { Router } from "oak";
import * as c from "../controllers/applicationFormControllers.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.put("/api/rounds/:roundId/application-forms", enforceAuthenticationMiddleware, c.createApplicationFormController);
router.patch("/api/rounds/:roundId/application-forms/:id", enforceAuthenticationMiddleware, c.updateApplicationFormController);
router.delete("/api/rounds/:roundId/application-forms/:id", enforceAuthenticationMiddleware, c.deleteApplicationFormController);

export default router;
