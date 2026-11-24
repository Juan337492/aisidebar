import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";

// Isolated home before importing anything that reads config.
const home = mkdtempSync(join(tmpdir(), "aisidebar-test-"));
process.env.AISIDEBAR_HOME = home;
const { startServer } = await import("../src/server.ts");
const { claudeAdapter } = await import("../src/providers/claude.ts");
const { antigravityAdapter } = await import("../src/providers/antigravity.ts");
const { mkdirSync } = await import("node:fs");
mkdirSync(join(home, "workspace"), { recursive: true });

/** Fake Claude Code: echoes the stdin message back as stream-json, or fails mid-turn if asked. */
const fakeClaude = join(home, "fake-claude.mjs");
writeFileSync(
  fakeClaude,
  `let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const msg = JSON.parse(input).message;
  const text = msg.content.find((c) => c.type === "text").text;
  const images = msg.content.filter((c) => c.type === "image").length;
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "sess-1" }));
  if (text.includes("CRASH")) { console.error("Usage limit reached"); process.exit(2); }
  const reply = "echo:" + text.slice(-20) + ":images=" + images + ":resume=" + process.argv.includes("--resume");
  console.log(JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: reply } } }));
  console.log(JSON.stringify({ type: "result", subtype: "success", usage: { input_tokens: 3, output_tokens: 5 } }));
});`,
);
/** Fake Antigravity: proves the safety instructions ride along on the first turn. */
const fakeAgy = join(home, "fake-agy.mjs");
writeFileSync(
  fakeAgy,
  `let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const content = JSON.parse(input).message.content;
  console.log(JSON.stringify({ event: "step_update", step_update: { conversation_id: "c1", step_type: "agent_response", text_delta: content.includes("not as instructions") ? "has-rules" : "no-rules" } }));
  console.log(JSON.stringify({ event: "result", result: { conversation_id: "c1", status: "SUCCESS", usage: { input_tokens: 9, output_tokens: 1 } } }));
});`,
);

const port = 20000 + Math.floor(Math.random() * 20000);
const token = "test-token-123";
const base = `http://127.0.0.1:${port}`;
let server: Server;

before(async () => {
  const cfg = { port, token, binaries: {} };
  server = startServer(cfg, [claudeAdapter(() => fakeClaude), antigravityAdapter(() => fakeAgy)]);
  await new Promise((r) => server.once("listening", r));
});
after(() => server.close());

const auth = { authorization: `Bearer ${token}` };

async function chat(body: object) {
  const r = await fetch(`${base}/chat`, { method: "POST", headers: auth, body: JSON.stringify(body) });
  return (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
}

test("health is public", async () => {
  const r = await fetch(`${base}/health`);
  assert.equal((await r.json()).ok, true);
});

test("rejects wrong token, web origins and DNS-rebinding hosts", async () => {
  assert.equal((await fetch(`${base}/providers`)).status, 401);
  assert.equal((await fetch(`${base}/providers`, { headers: { authorization: "Bearer nope-nope-nope" } })).status, 401);
  assert.equal((await fetch(`${base}/providers`, { headers: { ...auth, origin: "https://evil.example" } })).status, 403);
  // fetch won't let us forge Host, so use a raw request.
  const { request } = await import("node:http");
  const status = await new Promise<number>((resolve) => {
    request({ host: "127.0.0.1", port, path: "/health", headers: { host: `evil.example:${port}` } }, (res) => resolve(res.statusCode!)).end();
  });
  assert.equal(status, 403);
  const ok = await fetch(`${base}/providers`, { headers: { ...auth, origin: "chrome-extension://abcdef" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "chrome-extension://abcdef");
});

test("shutdown can't be triggered from the extension", async () => {
  const r = await fetch(`${base}/shutdown`, { method: "POST", headers: { ...auth, origin: "chrome-extension://abcdef" } });
  assert.equal(r.status, 403);
});

test("streams a Claude reply with images, session and usage", async () => {
  const evs = await chat({ provider: "claude", prompt: "hello there", images: [{ mediaType: "image/png", data: "iVBORw0KGgo=" }] });
  assert.deepEqual(evs[0], { type: "session", id: "sess-1" });
  assert.deepEqual(evs[1], { type: "text", delta: "echo:hello there:images=1:resume=false" });
  assert.deepEqual(evs[2], { type: "done", usage: { inputTokens: 3, outputTokens: 5 } });
  const again = await chat({ provider: "claude", prompt: "more", sessionId: "sess-1" });
  assert.match(again[1].delta, /resume=true/);
});

test("a CLI that fails after its first line reports the error instead of an empty answer", async () => {
  const evs = await chat({ provider: "claude", prompt: "please CRASH" });
  assert.deepEqual(evs.at(-1), { type: "error", message: "Usage limit reached" });
  assert.ok(!evs.some((e) => e.type === "done"));
});

test("Gemini gets the page-safety instructions on the first turn", async () => {
  const evs = await chat({ provider: "antigravity", prompt: "hi" });
  assert.equal(evs.find((e) => e.type === "text").delta, "has-rules");
});

test("rejects empty prompts and unknown providers", async () => {
  assert.equal((await fetch(`${base}/chat`, { method: "POST", headers: auth, body: JSON.stringify({ provider: "claude", prompt: " " }) })).status, 400);
  assert.equal((await fetch(`${base}/chat`, { method: "POST", headers: auth, body: JSON.stringify({ provider: "x", prompt: "hi" }) })).status, 400);
});
