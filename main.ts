import { Application } from "oak"; // Import Context as type
import authRoutes from "$app/routes/authRoutes.ts";
import roundRoutes from "$app/routes/roundRoutes.ts";
import applicationRoutes from "$app/routes/applicationRoutes.ts";
import { authMiddleware } from "$app/middleware/authMiddleware.ts";
import type { AuthenticatedUserState } from "$app/types/auth.ts";
import { BadRequestError, NotFoundError } from "$app/errors/generic.ts";
import { AuthError } from "$app/errors/auth.ts";

export interface UnauthenticatedAppState {
  user: undefined;
}

export interface AuthenticatedAppState {
  user: AuthenticatedUserState;
}

export type AppState = UnauthenticatedAppState | AuthenticatedAppState;

const app = new Application<AppState>({ state: { user: undefined } });

app.use((ctx, next) => {
  ctx.response.headers.set('Access-Control-Allow-Origin', 'http://localhost:8080');
  ctx.response.headers.set('Access-Control-Allow-Credentials', 'true');
  ctx.response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  ctx.response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
    } else {
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal Server Error" };
      console.error("Internal Server Error:", e);
    }
  }
});

app.use(authMiddleware);

app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());

app.use(roundRoutes.routes());
app.use(roundRoutes.allowedMethods());

app.use(applicationRoutes.routes());
app.use(applicationRoutes.allowedMethods());

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Server listening on http://localhost:${port}`);
await app.listen({ port });
