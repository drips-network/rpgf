import { Application } from "oak";
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
import { authMiddleware } from "$app/middleware/authMiddleware.ts";
import type { AuthenticatedUserState } from "$app/types/auth.ts";
import { BadRequestError, NotFoundError } from "$app/errors/generic.ts";
import { AuthError, ExpiredJwtError } from "$app/errors/auth.ts";

export interface UnauthenticatedAppState {
  user: undefined;
}

export interface AuthenticatedAppState {
  user: AuthenticatedUserState;
}

export type AppState = UnauthenticatedAppState | AuthenticatedAppState;

const app = new Application<AppState>({ state: { user: undefined } });

if (Deno.env.get("CORS_ALLOW_ALL_ORIGINS") === "true") {
  console.warn("----------------------------------------------------------------------")
  console.warn("🔒 CORS DISABLED! 🔒");
  console.warn("The CORS_ALLOW_ALL_ORIGINS environment variable is set to true, which is a security risk in production environments.");
  console.warn("----------------------------------------------------------------------")
}

app.use((ctx, next) => {
  const origin = ctx.request.headers.get('Origin');
  const allowedOriginRegex = /^https:\/\/.*\.drips\.network$/;

  if (Deno.env.get("CORS_ALLOW_ALL_ORIGINS") === "true") {
    ctx.response.headers.set('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && allowedOriginRegex.test(origin)) {
    ctx.response.headers.set('Access-Control-Allow-Origin', origin);
  }

  ctx.response.headers.set('Access-Control-Allow-Credentials', 'true');
  ctx.response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Credentials');
  ctx.response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  return next();
});

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (e) {

    if (e instanceof BadRequestError) {
      ctx.response.status = 400;
      ctx.response.body = { error: e.message };
    } else if (e instanceof AuthError) {
      ctx.response.status = 401;
      ctx.response.body = { error: e.message };
    } else if (e instanceof NotFoundError) {
      ctx.response.status = 404;
      ctx.response.body = { error: e.message };
    } else if (e instanceof ExpiredJwtError) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Token expired" };
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal Server Error" };
      console.error("Internal Server Error:", e);
    }
  }
});

app.use(healthRoutes.routes());
app.use(healthRoutes.allowedMethods());

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

if (Deno.env.get("ENABLE_DANGEROUS_TEST_ROUTES") === "true") {
  console.warn("----------------------------------------------------------------------")
  console.warn("☠️⚠️☠️ DANGEROUS TEST ROUTES ENABLED! ☠️⚠️☠️");
  console.warn("The ENABLE_DANGEROUS_TEST_ROUTES environment variable MUST be set to false in production environments.");
  console.warn("----------------------------------------------------------------------")

  app.use(dangerousTestRoutes.routes());
  app.use(dangerousTestRoutes.allowedMethods());
}

if (import.meta.main) {
  const port = parseInt(Deno.env.get("PORT") || "8000");
  console.log(`Server listening on http://localhost:${port}`);
  await app.listen({ port, hostname: "[::]" });
}

export { app };
