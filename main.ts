import { Application, Router, type Context } from "oak"; // Import Context as type
import authRoutes from "$app/routes/authRoutes.ts";
import { authMiddleware } from "$app/middleware/authMiddleware.ts";
import type { AuthenticatedUserState } from "$app/types/auth.ts";

// Define application state for typed context
export interface AppState {
  user?: AuthenticatedUserState;
}

const app = new Application<AppState>({ state: { user: undefined } }); // Use AppState
const router = new Router(); // This is the main app router, can be removed if all routes are modular

router.get("/", (ctx: Context<AppState>) => {
  ctx.response.body = "Welcome to Drips RetroPGF Server!";
});

app.use(authMiddleware);

// Use the auth routes
app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());

// Existing main router (if you want to keep the "/" route here)
app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Server listening on http://localhost:${port}`);
await app.listen({ port });
