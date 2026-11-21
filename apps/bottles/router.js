import { BottleOcean } from "./drift.js";

const MAX_BODY_BYTES = 4096;

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        settled = true;
        reject({ statusCode: 413, message: "Request body too large (max 4 KB)." });
        request.resume();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        reject({ statusCode: 400, message: "Expected a JSON request body." });
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject({ statusCode: 400, message: "Expected a JSON object body." });
          return;
        }
        resolve(parsed);
      } catch {
        reject({ statusCode: 400, message: "Invalid JSON body." });
      }
    });

    request.on("error", () => {
      if (settled) return;
      settled = true;
      reject({ statusCode: 400, message: "Failed to read request body." });
    });
  });
}

export function createBottlesRouter(options = {}) {
  const ocean = options.ocean ?? new BottleOcean(options);

  async function handle(request, response, url) {
    const { pathname, searchParams } = url;

    if (pathname === "/api/bottles/throw") {
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed. Use POST." }, { Allow: "POST" });
        return true;
      }
      let body;
      try {
        body = await readJsonBody(request);
      } catch (err) {
        sendJson(response, err.statusCode ?? 400, { error: err.message ?? "Bad request." });
        return true;
      }

      const result = ocean.throwBottle(body);
      if (result.error) {
        sendJson(response, result.statusCode ?? 400, { error: result.error });
        return true;
      }
      sendJson(response, 201, result);
      return true;
    }

    if (pathname === "/api/bottles/beachcomber") {
      if (!["GET", "HEAD"].includes(request.method)) {
        sendJson(response, 405, { error: "Method not allowed. Use GET." }, { Allow: "GET, HEAD" });
        return true;
      }
      const excludeParam = searchParams.get("exclude") ?? "";
      const excludeIds = excludeParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 100);
      const bottle = ocean.beachcomb(excludeIds);
      if (!bottle) {
        sendJson(response, 404, {
          error: "The Solent shore is mysteriously empty right now. Check back after the next tide.",
          ocean: ocean.getStatus(),
        });
        return true;
      }
      sendJson(response, 200, { bottle, ocean: ocean.getStatus() });
      return true;
    }

    if (pathname === "/api/bottles/graveyard") {
      if (!["GET", "HEAD"].includes(request.method)) {
        sendJson(response, 405, { error: "Method not allowed. Use GET." }, { Allow: "GET, HEAD" });
        return true;
      }
      sendJson(response, 200, {
        obituaries: ocean.getGraveyard(10),
        ocean: ocean.getStatus(),
      });
      return true;
    }

    if (pathname === "/api/bottles/status") {
      if (!["GET", "HEAD"].includes(request.method)) {
        sendJson(response, 405, { error: "Method not allowed. Use GET." }, { Allow: "GET, HEAD" });
        return true;
      }
      sendJson(response, 200, { ocean: ocean.getStatus() });
      return true;
    }

    return false;
  }

  return { ocean, handle };
}
