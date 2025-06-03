import { Router } from "oak";
import { enforceAuthenticationMiddleware } from "../middleware/authMiddleware.ts";
import * as ballotController from "$app/controllers/ballotController.ts";

const router = new Router();

router.put('/api/rounds/:slug/ballots', enforceAuthenticationMiddleware, ballotController.submitBallotController);
router.patch('/api/rounds/:slug/ballots/own', enforceAuthenticationMiddleware, ballotController.patchBallotController);

router.get('/api/rounds/:slug/ballots/own', enforceAuthenticationMiddleware, ballotController.getOwnBallotController);
router.get('/api/rounds/:slug/ballots', enforceAuthenticationMiddleware, ballotController.getBallotsController);

export default router;
