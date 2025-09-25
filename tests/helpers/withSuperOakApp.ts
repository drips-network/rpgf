import { superoak } from "https://deno.land/x/superoak@5.0.0/src/superoak.ts";
import { app } from "../../main.ts";
import { SuperDeno } from "https://deno.land/x/superdeno@5.0.1/mod.ts";

export default async function withSuperOakApp<T extends unknown>(testFn: (request: SuperDeno) => Promise<T>): Promise<T> {
  const request = await superoak(app);
  return await testFn(request);
}
