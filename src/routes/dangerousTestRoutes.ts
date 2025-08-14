/** These routes are only intended for use in E2E tests and MUST be disabled
 * in production environments. They're only loaded if ENABLE_DANGEROUS_TEST_ROUTES
 * is true in the environment.
 */

import { Router } from "oak";
import { dangerouslyForceRoundStateController, dangerouslyForceDeleteRoundController } from "$app/controllers/testController.ts";

const router = new Router();

if (Deno.env.get("ENABLE_DANGEROUS_TEST_ROUTES") === "true") {
  router.post(
    '/api/testing/force-round-state',
    dangerouslyForceRoundStateController,
  );
  
  router.post(
    '/api/testing/force-delete-round',
    dangerouslyForceDeleteRoundController,
  );
}

export default router;
