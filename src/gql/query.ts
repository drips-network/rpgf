import request, { RequestDocument } from "graphql-request";
import { config } from "../../config.ts";

export default function query(document: RequestDocument, variables?: Record<string, unknown>) {
  return request(config.drips.gqlApiUrl, document, variables, {
    'Authorization': `Bearer ${config.drips.gqlApiKey ?? ""}`,
  });
}
