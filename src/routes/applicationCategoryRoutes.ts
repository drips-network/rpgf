import { Router } from "oak";
import * as c from "../controllers/applicationCategoryController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.put("/api/round-drafts/:id/application-categories", enforceAuthenticationMiddleware, c.createApplicationCategoryController);
router.patch("/api/round-drafts/:id/application-categories/:categoryId", enforceAuthenticationMiddleware, c.updateApplicationCategoryController);
router.delete("/api/round-drafts/:id/application-categories/:categoryId", enforceAuthenticationMiddleware, c.deleteApplicationCategoryController);

export default router;
