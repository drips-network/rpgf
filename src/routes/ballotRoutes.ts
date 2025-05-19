import { Router } from "oak";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as ballotController from "$app/controllers/ballotController.ts";

const router = new Router();

router.put('/api/rounds/:id/ballots', enforceAuthenticationMiddleware, ballotController.submitBallotController);
router.get('/api/rounds/:id/ballots', enforceAuthenticationMiddleware, ballotController.getBallotsController);

export default router;
