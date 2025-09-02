import { Router } from "oak";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as ballotController from "$app/controllers/ballotController.ts";

const router = new Router();

router.put('/api/rounds/:roundId/ballots', enforceAuthenticationMiddleware, ballotController.submitBallotController);
router.patch('/api/rounds/:roundId/ballots/own', enforceAuthenticationMiddleware, ballotController.patchBallotController);

router.get('/api/rounds/:roundId/ballots/own', enforceAuthenticationMiddleware, ballotController.getOwnBallotController);
router.get('/api/rounds/:roundId/ballots', enforceAuthenticationMiddleware, ballotController.getBallotsController);
router.get('/api/rounds/:roundId/ballots/stats', enforceAuthenticationMiddleware, ballotController.getBallotStatsController);

export default router;
