import { Router } from "oak";
import {
  createCustomDatasetController,
  deleteCustomDatasetController,
  downloadCustomDatasetController,
  listCustomDatasetsController,
  updateCustomDatasetController,
  uploadCustomDatasetController,
} from "$app/controllers/customDatasetController.ts";
import { enforceAuthenticationMiddleware } from "$app/middleware/authMiddleware.ts";

const router = new Router();

router.get(
  "/api/rounds/:roundId/custom-datasets",
  listCustomDatasetsController
);
router.put(
  "/api/rounds/:roundId/custom-datasets",
  enforceAuthenticationMiddleware,
  createCustomDatasetController
);
router.patch(
  "/api/rounds/:roundId/custom-datasets/:datasetId",
  enforceAuthenticationMiddleware,
  updateCustomDatasetController
);
router.delete(
  "/api/rounds/:roundId/custom-datasets/:datasetId",
  enforceAuthenticationMiddleware,
  deleteCustomDatasetController
);
router.post(
  "/api/rounds/:roundId/custom-datasets/:datasetId/upload",
  enforceAuthenticationMiddleware,
  uploadCustomDatasetController
);
router.get(
  "/api/rounds/:roundId/custom-datasets/:datasetId/data.csv",
  enforceAuthenticationMiddleware,
  downloadCustomDatasetController
);

export default router;
