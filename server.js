import { randomInt } from "node:crypto";
import { readFile, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { WebSocket, WebSocketServer } from "ws";
import { Room } from "./operation.js";
import { createBottlesRouter } from "./apps/bottles/router.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ROOMS = 100;
const EMPTY_ROOM_MS = 600_000;

const WEB_ROOT = new URL("./web/", import.meta.url);
const PORTAL_ROOT = new URL("./portal/", import.meta.url);
const SHARED_ROOT = new URL("./shared/", import.meta.url);
const BOTTLES_ROOT = new URL("./apps/bottles/public/", import.meta.url);

const PAGES = new Map([
  ["/", {
    html: readFileSync(new URL("index.html", PORTAL_ROOT), "utf8"),
    title: "Solent Signal Bureau — Station PO1",
    siteName: "Solent Signal Bureau (Station PO1)",
    description: "1974 Portsmouth coastal monitoring outpost hosting The Shore (Message in a Bottle) and Frequency 74 (Lost in Transmission).",
    path: "/",
    imageAlt: "Solent Signal Bureau — Station PO1 emblem",
  }],
  ["/bottles", {
    html: readFileSync(new URL("index.html", BOTTLES_ROOT), "utf8"),
    title: "The Shore — Solent Signal Bureau (Station PO1)",
    siteName: "Solent Signal Bureau (Station PO1)",
    description: "An unreliable, tide-driven Message in a Bottle dispatch desk across the Solent. Beware SO14 contamination and ambitious Southsea seagulls.",
    path: "/bottles",
    imageAlt: "Solent Signal Bureau — The Shore",
  }],
  ["/transmission", {
    html: readFileSync(new URL("index.html", WEB_ROOT), "utf8"),
    title: "Lost in Transmission",
    siteName: "Lost in Transmission",
    description: "Two-player co-op spy game set in Kessel, 1974. Guide your agent through three cases over a word-tile radio while ECHO learns your words and jams the signal.",
    path: "/transmission",
    imageAlt: "Lost in Transmission logo",
  }],
]);

const ASSETS = new Map([
  // Lost in Transmission (web/)
  ["/game.js", [new URL("game.js", WEB_ROOT), "text/javascript; charset=utf-8"]],
  ["/screens.js", [new URL("screens.js", WEB_ROOT), "text/javascript; charset=utf-8"]],
  ["/radio.js", [new URL("radio.js", WEB_ROOT), "text/javascript; charset=utf-8"]],
  ["/style.css", [new URL("style.css", WEB_ROOT), "text/css; charset=utf-8"]],
  ["/logo.jpg", [new URL("logo.jpg", WEB_ROOT), "image/jpeg"]],
  ["/favicon.png", [new URL("favicon.png", WEB_ROOT), "image/png"]],
  ["/apple-touch-icon.png", [new URL("apple-touch-icon.png", WEB_ROOT), "image/png"]],
  ["/assets/art/player.png", [new URL("assets/art/player.png", WEB_ROOT), "image/png"]],
  ["/assets/fonts/SpecialElite-Regular.ttf", [new URL("assets/fonts/SpecialElite-Regular.ttf", WEB_ROOT), "font/ttf"]],
  ["/assets/fonts/IBMPlexMono-Regular.ttf", [new URL("assets/fonts/IBMPlexMono-Regular.ttf", WEB_ROOT), "font/ttf"]],
  ["/assets/fonts/IBMPlexMono-SemiBold.ttf", [new URL("assets/fonts/IBMPlexMono-SemiBold.ttf", WEB_ROOT), "font/ttf"]],
  // Shared Station PO1 assets
  ["/shared/bureau.css", [new URL("bureau.css", SHARED_ROOT), "text/css; charset=utf-8"]],
  ["/shared/header.js", [new URL("header.js", SHARED_ROOT), "text/javascript; charset=utf-8"]],
  // Portal Hub assets
  ["/portal/portal.css", [new URL("portal.css", PORTAL_ROOT), "text/css; charset=utf-8"]],
  ["/portal/portal.js", [new URL("portal.js", PORTAL_ROOT), "text/javascript; charset=utf-8"]],
  // The Shore (/bottles) assets
  ["/bottles/bottles.css", [new URL("bottles.css", BOTTLES_ROOT), "text/css; charset=utf-8"]],
  ["/bottles/bottles.js", [new URL("bottles.js", BOTTLES_ROOT), "text/javascript; charset=utf-8"]],
]);
const ESCAPES = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };

function embedTags(request, page) {
  const scheme = request.headers["x-forwarded-proto"] === "https" || request.headers["x-forwarded-for"]
    ? "https" : "http";
  const base = `${scheme}://${request.headers.host ?? "localhost"}`;
  const tags = {
    description: page.description,
    "og:type": "website",
    "og:site_name": page.siteName,
    "og:title": page.title,
    "og:description": page.description,
    "og:url": `${base}${page.path}`,
    "og:image": `${base}/logo.jpg`,
    "og:image:width": "512",
    "og:image:height": "512",
    "og:image:alt": page.imageAlt,
    "twitter:card": "summary_large_image",
  };
  return Object.entries(tags).map(([key, value]) => {
    const attribute = key.startsWith("og:") ? "property" : "name";
    const content = value.replace(/[&"<>]/g, (character) => ESCAPES[character]);
    return `<meta ${attribute}="${key}" content="${content}">`;
  }).join("\n  ");
}

function createRequestHandler(bottlesRouter) {
  return async function handleRequest(request, response) {
    let url;
    try {
      url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    } catch {
      response.writeHead(400).end();
      return;
    }

    if (url.pathname.startsWith("/api/bottles/")) {
      const handled = await bottlesRouter.handle(request, response, url);
      if (handled) return;
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Unknown bottles API endpoint." }));
      return;
    }

    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }

    const normalizedPath = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "/";
    const page = PAGES.get(normalizedPath);
    if (page) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      response.end(request.method === "HEAD" ? undefined : page.html.replace("<!-- LINK_PREVIEW -->", () => embedTags(request, page)));
      return;
    }

    const asset = ASSETS.get(url.pathname);
    if (asset) {
      const [fileUrl, type] = asset;
      readFile(fileUrl, (error, content) => {
        if (error) {
          response.writeHead(500).end();
          return;
        }
        const cache = type.startsWith("image/") || type.startsWith("font/") ? "public, max-age=86400" : "no-cache";
        response.writeHead(200, { "Content-Type": type, "Cache-Control": cache });
        response.end(request.method === "HEAD" ? undefined : content);
      });
      return;
    }

    response.writeHead(404).end();
  };
}

class Multiplayer {
  constructor(now) {
    this.now = now;
    this.rooms = new Map();
  }

  send(socket, data) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 128 * 1024) {
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(data));
  }

  notice(client, text) {
    this.send(client.socket, { type: "notice", text });
  }

  publish(room) {
    for (const [role, client] of room.peers) this.send(client.socket, room.snapshot(role));
  }

  join(client, room, role) {
    client.room = room;
    client.role = role;
    const token = room.connect(role, client);
    this.send(client.socket, { type: "joined", code: room.code, token });
    this.publish(room);
  }

  disconnect(client) {
    if (!client.room) return;
    const room = client.room;
    room.disconnect(client.role);
    client.room = null;
    client.role = null;
    this.publish(room);
  }

  closeRoom(client) {
    const room = client.room;
    if (!room) {
      this.send(client.socket, { type: "left" });
      return;
    }
    for (const player of room.peers.values()) {
      player.room = null;
      player.role = null;
      const message = player === client ? "" : "The other player closed the room.";
      this.send(player.socket, { type: "left", text: message });
    }
    this.rooms.delete(room.code);
  }

  createRoom(client) {
    if (this.rooms.size >= MAX_ROOMS) {
      this.notice(client, "All rooms are in use. Try again later.");
      return;
    }
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    } while (this.rooms.has(code));
    const room = new Room(code, this.now);
    this.rooms.set(code, room);
    this.join(client, room, "handler");
  }

  receive(client, data) {
    if (data.type === "leave") {
      this.closeRoom(client);
      return;
    }
    const room = client.room;
    if (room) {
      const expired = room.expireMission();
      const [changed, notice] = room.command(client.role, data);
      if (changed || expired) this.publish(room);
      if (notice) this.notice(client, notice);
      return;
    }
    if (data.type === "create") {
      this.createRoom(client);
      return;
    }

    const target = typeof data.code === "string" ? this.rooms.get(data.code.trim().toUpperCase()) : null;
    if (data.type === "join") {
      if (!target) this.notice(client, "Room code not found.");
      else if (target.tokens.has("agent")) this.notice(client, "Both roles are already assigned.");
      else this.join(client, target, "agent");
    } else if (data.type === "resume") {
      if (target && typeof data.token === "string") {
        for (const [role, token] of target.tokens) {
          if (data.token === token && !target.peers.has(role)) {
            this.join(client, target, role);
            return;
          }
        }
      }
      this.send(client.socket, { type: "resume_failed", text: "Could not reconnect to that room." });
    }
  }

  attach(socket) {
    const client = { socket, room: null, role: null };
    socket.on("message", (message, binary) => {
      if (binary) return;
      let data;
      try {
        data = JSON.parse(message.toString());
      } catch {
        return;
      }
      if (typeof data?.type === "string") this.receive(client, data);
    });
    socket.on("error", () => socket.terminate());
    socket.once("close", () => this.disconnect(client));
  }

  maintainRooms() {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      if (room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_MS) {
        this.rooms.delete(code);
      } else if (room.expireMission()) {
        this.publish(room);
      }
    }
  }
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host?.toLowerCase();
  } catch {
    return false;
  }
}

export function createGameServer(nowOrOptions = () => performance.now()) {
  const options = typeof nowOrOptions === "function" ? { now: nowOrOptions } : (nowOrOptions ?? {});
  const now = options.now ?? (() => performance.now());
  const multiplayer = new Multiplayer(now);
  const bottlesRouter = createBottlesRouter(options.bottles);
  const server = createServer(createRequestHandler(bottlesRouter));
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const responsive = new WeakSet();
  sockets.on("connection", (socket) => {
    multiplayer.attach(socket);
    responsive.add(socket);
    socket.on("pong", () => responsive.add(socket));
  });
  server.on("upgrade", (request, socket, head) => {
    const path = request.url.split("?", 1)[0];
    if (path !== "/ws" || !sameOrigin(request)) {
      const status = path !== "/ws" ? "404 Not Found" : "403 Forbidden";
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      return;
    }
    sockets.handleUpgrade(request, socket, head, (connection) => {
      sockets.emit("connection", connection);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (responsive.delete(socket)) socket.ping();
      else socket.terminate();
    }
  }, 20_000).unref();
  const maintenance = setInterval(() => multiplayer.maintainRooms(), 500).unref();
  server.once("close", () => {
    clearInterval(heartbeat);
    clearInterval(maintenance);
    sockets.close();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "8000" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log("Usage: node server.js [--host 127.0.0.1] [--port 8000]");
  } else {
    const port = Number(values.port);
    if (!/^\d+$/.test(values.port) || !Number.isInteger(port) || port > 65535) {
      throw new Error("Port must be an integer from 0 to 65535.");
    }
    const server = createGameServer();
    server.listen(port, values.host, () => {
      const hostname = values.host.includes(":") ? `[${values.host}]` : values.host;
      console.log(`Solent Signal Bureau (Station PO1) listening at http://${hostname}:${server.address().port}`);
    });
  }
}
