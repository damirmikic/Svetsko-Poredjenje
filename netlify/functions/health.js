import { getHealthPayload } from "../../server.js";
import { json } from "../lib/json.js";

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  return json(200, getHealthPayload());
}
