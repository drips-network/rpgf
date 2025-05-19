import request, { RequestDocument } from "graphql-request";

const GQL_URL = Deno.env.get("DRIPS_GQL_API_URL");
const GQL_API_KEY = Deno.env.get("DRIPS_GQL_API_KEY");

export default function query(document: RequestDocument, variables?: Record<string, unknown>) {
  if (!GQL_URL) {
    throw new Error("GQL_URL is not defined");
  }

  return request(GQL_URL, document, variables, {
    'Authorization': `Bearer ${GQL_API_KEY}`,
  });
}
