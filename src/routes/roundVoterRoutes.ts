import { Router } from "oak";
import * as c from "../controllers/roundVoterController.ts";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";

const router = new Router();

router.get("/api/rounds/:roundId/voters", enforceAuthenticationMiddleware, c.getRoundVotersController);
router.patch("/api/rounds/:roundId/voters", enforceAuthenticationMiddleware, c.setRoundVotersController);

export default router;
