import { Application } from "oak";
import { config } from "./config.ts";
import authRoutes from "$app/routes/authRoutes.ts";
import roundRoutes from "$app/routes/roundRoutes.ts";
import applicationRoutes from "$app/routes/applicationRoutes.ts";
import applicationFormRoutes from "$app/routes/applicationFormRoutes.ts";
import applicationCategoryRoutes from "$app/routes/applicationCategoryRoutes.ts";
import ballotRoutes from "$app/routes/ballotRoutes.ts";
import resultRoutes from "$app/routes/resultRoutes.ts";
import healthRoutes from "$app/routes/healthRoutes.ts";
import userRoutes from "$app/routes/userRoutes.ts";
import roundVoterRoutes from "$app/routes/roundVoterRoutes.ts";
import roundAdminRoutes from "$app/routes/roundAdminRoutes.ts";
import dangerousTestRoutes from "$app/routes/dangerousTestRoutes.ts";
import auditLogRoutes from "$app/routes/auditLogRoutes.ts";
import kycRoutes from "$app/routes/kycRoutes.ts";
import customDatasetRoutes from "$app/routes/customDatasetRoutes.ts";
import docsRouter from "$app/openapi/docs.router.ts";
import externalVoteRoutes from "$app/routes/externalVoteRoutes.ts";
import { authMiddleware } from "$app/middleware/authMiddleware.ts";
import errorMiddleware from "$app/middleware/errorMiddleware.ts";
import type { AuthenticatedUserState } from "$app/types/auth.ts";
import { warmProviderRegistry } from "$app/ethereum/providerRegistry.ts";

export interface UnauthenticatedAppState {
  user: undefined;
}

export interface AuthenticatedAppState {
  user: AuthenticatedUserState;
}

export type AppState = UnauthenticatedAppState | AuthenticatedAppState;

const app = new Application<AppState>({ state: { user: undefined } });

app.use((ctx, next) => {
  const origin = ctx.request.headers.get("Origin");
  const allowedOriginRegex = /^https:\/\/([a-zA-Z0-9-]+\.)+drips\.network$/;

  if (config.cors.allowAllOrigins) {
    ctx.response.headers.set("Access-Control-Allow-Origin", origin || "*");
  } else if (!origin) {
    ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  } else if (origin && allowedOriginRegex.test(origin)) {
    ctx.response.headers.set("Access-Control-Allow-Origin", origin);
  }

  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  ctx.response.headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Credentials",
  );
  ctx.response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  );
  return next();
});

app.use(errorMiddleware);

app.use(healthRoutes.routes());
app.use(healthRoutes.allowedMethods());

app.use(docsRouter.routes());
app.use(docsRouter.allowedMethods());

app.use(externalVoteRoutes.routes());
app.use(externalVoteRoutes.allowedMethods());

app.use(authMiddleware);

app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());

app.use(roundRoutes.routes());
app.use(roundRoutes.allowedMethods());

app.use(roundVoterRoutes.routes());
app.use(roundVoterRoutes.allowedMethods());

app.use(roundAdminRoutes.routes());
app.use(roundAdminRoutes.allowedMethods());

app.use(applicationRoutes.routes());
app.use(applicationRoutes.allowedMethods());

app.use(applicationFormRoutes.routes());
app.use(applicationFormRoutes.allowedMethods());

app.use(applicationCategoryRoutes.routes());
app.use(applicationCategoryRoutes.allowedMethods());

app.use(ballotRoutes.routes());
app.use(ballotRoutes.allowedMethods());

app.use(resultRoutes.routes());
app.use(resultRoutes.allowedMethods());

app.use(userRoutes.routes());
app.use(userRoutes.allowedMethods());

app.use(auditLogRoutes.routes());
app.use(auditLogRoutes.allowedMethods());

app.use(kycRoutes.routes());
app.use(kycRoutes.allowedMethods());

app.use(customDatasetRoutes.routes());
app.use(customDatasetRoutes.allowedMethods());

if (config.testing.enableDangerousTestRoutes) {
  app.use(dangerousTestRoutes.routes());
  app.use(dangerousTestRoutes.allowedMethods());
}

if (import.meta.main) {
  const port = config.server.port;
  await warmProviderRegistry();
  console.log(`Server listening on http://localhost:${port}`);
  await app.listen({ port, hostname: "[::]" });
}

export { app };
