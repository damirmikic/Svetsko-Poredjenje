import { getOddsPayload } from "../../server.js";
import { json } from "../lib/json.js";

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const competitionId = event.queryStringParameters?.competition;
    return json(200, await getOddsPayload(competitionId));
  } catch (error) {
    return json(500, {
      error: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    });
  }
}
