import { Application, Router, Context } from "oak";
import { load } from "std/dotenv";
import authRoutes from "$app/routes/authRoutes.ts";

// Load environment variables from .env file
// This should be one of the first things to ensure env vars are available globally.
await load({ export: true });

const app = new Application();
const router = new Router(); // This is the main app router, can be removed if all routes are modular

router.get("/", (ctx: Context) => {
  ctx.response.body = "Welcome to Drips RetroPGF Server!";
});

// Logger middleware
app.use(async (ctx: Context, next: () => Promise<unknown>) => {
  await next();
  const rt = ctx.response.headers.get("X-Response-Time");
  console.log(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
});

// Timing middleware
app.use(async (ctx: Context, next: () => Promise<unknown>) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
});

// Use the auth routes
app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());

// Existing main router (if you want to keep the "/" route here)
app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Server listening on http://localhost:${port}`);
await app.listen({ port });
