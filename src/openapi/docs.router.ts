import { Router } from "oak";
import { generateOpenAPIDocument } from "./registry.ts";
// Import routes to ensure they're registered
import "./routes.ts";

const docsRouter = new Router();

// Serve OpenAPI spec as JSON
docsRouter.get("/api/openapi.json", (ctx) => {
  const openApiDocument = generateOpenAPIDocument();
  ctx.response.headers.set("Content-Type", "application/json");
  ctx.response.body = openApiDocument;
});

// Serve Scalar UI
docsRouter.get("/api/docs", (ctx) => {
  const baseUrl = Deno.env.get("BASE_URL") || "http://localhost:8000";

  ctx.response.headers.set("Content-Type", "text/html");
  ctx.response.body = `
<!DOCTYPE html>
<html>
<head>
    <title>RPGF API Documentation</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
    <script
        id="api-reference"
        data-url="/api/openapi.json"
        data-configuration='${JSON.stringify({
    theme: "purple",
    layout: "modern",
    defaultHttpClient: {
      targetKey: "javascript",
      clientKey: "fetch",
      baseServerURL: baseUrl,
    },
    hiddenClients: [],
  })}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>
  `;
});

export default docsRouter;
