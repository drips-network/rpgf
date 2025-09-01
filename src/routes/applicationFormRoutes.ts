import { Router } from "oak";
import * as c from "../controllers/applicationFormControllers.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.put("/api/round-drafts/:id/application-forms", enforceAuthenticationMiddleware, c.createApplicationFormController);
router.patch("/api/round-drafts/:id/application-forms/:id", enforceAuthenticationMiddleware, c.updateApplicationFormController);
router.delete("/api/round-drafts/:draftId/application-forms/:id", enforceAuthenticationMiddleware, c.deleteApplicationFormController);

export default router;
