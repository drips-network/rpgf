/**
 * OpenAPI route definitions
 *
 * Route definitions are co-located with their respective router files.
 * This file imports all the router modules to ensure OpenAPI registration happens.
 */

// Import routers to trigger OpenAPI registration
import "$app/routes/healthRoutes.ts";
import "$app/routes/authRoutes.ts";
import "$app/routes/userRoutes.ts";
import "$app/routes/roundRoutes.ts";
import "$app/routes/applicationRoutes.ts";
import "$app/routes/applicationFormRoutes.ts";
import "$app/routes/applicationCategoryRoutes.ts";
import "$app/routes/ballotRoutes.ts";
import "$app/routes/resultRoutes.ts";
import "$app/routes/roundVoterRoutes.ts";
import "$app/routes/roundAdminRoutes.ts";
import "$app/routes/auditLogRoutes.ts";
import "$app/routes/kycRoutes.ts";
import "$app/routes/customDatasetRoutes.ts";
import "$app/routes/externalVoteRoutes.ts";
import "$app/routes/dangerousTestRoutes.ts";
