import { Context } from "oak";

export function getHealthController(ctx: Context) {
  ctx.response.status = 200;
  ctx.response.body = { status: "ok" };
}
