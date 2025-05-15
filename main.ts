import { Application } from "oak"; // Import Context as type
import authRoutes from "$app/routes/authRoutes.ts";
import { authMiddleware } from "$app/middleware/authMiddleware.ts";
import type { AuthenticatedUserState } from "$app/types/auth.ts";

// Define application state for typed context
export interface AppState {
  user?: AuthenticatedUserState;
}

const app = new Application<AppState>({ state: { user: undefined } });

app.use(authMiddleware);

app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Server listening on http://localhost:${port}`);
await app.listen({ port });
