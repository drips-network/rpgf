import { Router } from "oak";
import * as c from "../controllers/roundVoterController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.get("/api/rounds/:slug/voters", enforceAuthenticationMiddleware, c.getRoundVotersController);
router.get("/api/round-drafts/:id/voters", enforceAuthenticationMiddleware, c.getRoundDraftVotersController);

router.patch("/api/round-drafts/:id/voters", enforceAuthenticationMiddleware, c.setRoundVotersController);

export default router;
