import { Router } from "oak";
import * as c from "../controllers/applicationFormControllers.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.get("/api/rounds/:roundId/application-forms", c.getApplicationFormsController);

router.get("/api/rounds/:roundId/categories/:categoryId/application-form", c.getApplicationFormByCategoryController);

router.put("/api/rounds/:roundId/application-forms", enforceAuthenticationMiddleware, c.createApplicationFormController);
router.patch("/api/rounds/:roundId/application-forms/:formId", enforceAuthenticationMiddleware, c.updateApplicationFormController);
router.delete("/api/rounds/:roundId/application-forms/:formId", enforceAuthenticationMiddleware, c.deleteApplicationFormController);

export default router;
