import { Router } from "oak";
import * as c from "../controllers/applicationCategoryController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.put("/api/rounds/:roundId/application-categories", enforceAuthenticationMiddleware, c.createApplicationCategoryController);
router.patch("/api/rounds/:roundId/application-categories/:categoryId", enforceAuthenticationMiddleware, c.updateApplicationCategoryController);
router.delete("/api/rounds/:roundId/application-categories/:categoryId", enforceAuthenticationMiddleware, c.deleteApplicationCategoryController);

export default router;
