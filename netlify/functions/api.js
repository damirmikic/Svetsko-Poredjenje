import { getHealthPayload, getOddsPayload } from "../../server.js";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  };
}

function apiPath(event) {
  const rawPath = event.rawUrl ? new URL(event.rawUrl).pathname : event.path || "";
  return rawPath.replace(/^\/\.netlify\/functions\/api/, "/api");
}

export async function handler(event) {
  if (event.httpMethod && event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const pathname = apiPath(event);
    if (pathname === "/api/odds" || pathname.endsWith("/odds")) {
      return json(200, await getOddsPayload());
    }

    if (pathname === "/api/health" || pathname.endsWith("/health")) {
      return json(200, getHealthPayload());
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    return json(500, { error: error.message });
  }
}
