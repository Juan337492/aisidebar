import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { Adapter, ChatRequest } from "./types.ts";
import type { Config } from "./config.ts";
import { claudeAdapter } from "./providers/claude.ts";
import { antigravityAdapter } from "./providers/antigravity.ts";

export const VERSION = "0.1.0";
const MAX_BODY = 2 * 1024 * 1024;

function isExtensionOrigin(origin: string | undefined): boolean {
  return !!origin && /^(chrome-extension|moz-extension|safari-web-extension):\/\/[\w.-]+$/.test(origin);
}

function tokenOk(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Request too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function startServer(cfg: Config) {
  const adapters: Adapter[] = [
    claudeAdapter(() => cfg.binaries.claude),
    antigravityAdapter(() => cfg.binaries.antigravity),
  ];
  const byId = new Map(adapters.map((a) => [a.id, a]));
  const allowedHosts = new Set([`127.0.0.1:${cfg.port}`, `localhost:${cfg.port}`]);

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    // Block DNS-rebinding and web pages: only loopback Host, and only extension (or no) Origin.
    if (!allowedHosts.has(req.headers.host ?? "")) return json(res, 403, { error: "Bad host" });
    if (origin && !isExtensionOrigin(origin)) return json(res, 403, { error: "Origin not allowed" });
    if (origin) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-headers", "authorization, content-type");
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader("vary", "origin");
    }
    if (req.method === "OPTIONS") return void res.writeHead(204).end();

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/health") return json(res, 200, { ok: true, name: "aisidebar-companion", version: VERSION });
    if (!tokenOk(req, cfg.token)) return json(res, 401, { error: "Missing or wrong pairing token" });

    try {
      if (req.method === "GET" && url.pathname === "/providers") {
        const force = url.searchParams.get("refresh") === "1";
        const list = await Promise.all(adapters.map((a) => a.status(force)));
        return json(res, 200, { providers: list });
      }

      if (req.method === "POST" && url.pathname === "/chat") {
        const body = JSON.parse(await readBody(req)) as ChatRequest;
        const adapter = byId.get(body.provider);
        if (!adapter) return json(res, 400, { error: `Unknown provider: ${body.provider}` });
        if (typeof body.prompt !== "string" || !body.prompt.trim()) return json(res, 400, { error: "Empty prompt" });

        const ac = new AbortController();
        res.on("close", () => {
          if (!res.writableFinished) ac.abort();
        });
        res.writeHead(200, {
          "content-type": "application/x-ndjson",
          "cache-control": "no-cache",
          "x-accel-buffering": "no",
        });
        const send = (ev: unknown) => res.write(JSON.stringify(ev) + "\n");
        try {
          for await (const ev of adapter.chat(body, ac.signal)) {
            if (ac.signal.aborted) break;
            send(ev);
          }
        } catch (e) {
          if (!ac.signal.aborted) send({ type: "error", message: e instanceof Error ? e.message : String(e) });
        }
        return void res.end();
      }

      return json(res, 404, { error: "Not found" });
    } catch (e) {
      if (!res.headersSent) json(res, 500, { error: e instanceof Error ? e.message : String(e) });
      else res.end();
    }
  });

  server.listen(cfg.port, "127.0.0.1");
  return server;
}
