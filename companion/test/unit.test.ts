import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseModels } from "../src/providers/antigravity.ts";
import { parseCmdShim, spawnTarget } from "../src/process.ts";
import { normalizeUsage, validImages, systemPrompt, BASE_SYSTEM } from "../src/prompt.ts";
import { isNewer } from "../src/update.ts";
import { psq, systemdArg, windowsLauncherScript, xml } from "../src/escape.ts";
import { ollamaBaseUrl } from "../src/providers/ollama.ts";

test("parseModels groups effort variants into one model", () => {
  const out = parseModels(
    "gemini-4-neon-high\tGemini 4 Neon (High)\ngemini-4-neon-low\tGemini 4 Neon (Low)\ngemini-4-neon-xhigh\tGemini 4 Neon (XHigh)\nplain\tPlain Model\n\n",
  );
  assert.deepEqual(out, [
    { id: "gemini-4-neon", name: "Gemini 4 Neon", efforts: ["low", "high", "xhigh"], defaultEffort: "high" },
    { id: "plain", name: "Plain Model", efforts: [] },
  ]);
});

test("parseCmdShim finds the script in npm .cmd shims", () => {
  assert.equal(parseCmdShim('@ECHO off\r\n"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n'), "node_modules\\@openai\\codex\\bin\\codex.js");
  assert.equal(parseCmdShim('"%~dp0\\node_modules\\x\\cli.mjs" %*'), "node_modules\\x\\cli.mjs");
  assert.equal(parseCmdShim("@echo off\r\nsomething.exe %*"), undefined);
});

test("spawnTarget runs .js files with this Node", () => {
  assert.deepEqual(spawnTarget("/tmp/fake.mjs"), { cmd: process.execPath, args: ["/tmp/fake.mjs"] });
});

test("normalizeUsage handles each CLI's field names", () => {
  // Claude: cache tokens are counted separately
  assert.deepEqual(normalizeUsage({ input_tokens: 2, cache_read_input_tokens: 100, cache_creation_input_tokens: 900, output_tokens: 4 }), {
    inputTokens: 1002,
    outputTokens: 4,
  });
  // Antigravity/Codex: input already includes the cache
  assert.deepEqual(normalizeUsage({ input_tokens: 13126, cache_read_tokens: 7708, output_tokens: 146 }), { inputTokens: 13126, outputTokens: 146 });
  // Ollama
  assert.deepEqual(normalizeUsage({ prompt_eval_count: 50, eval_count: 7, done: true }), { inputTokens: 50, outputTokens: 7 });
  assert.equal(normalizeUsage(undefined), undefined);
  assert.equal(normalizeUsage({}), undefined);
});

test("validImages keeps only small base64 images", () => {
  const ok = { mediaType: "image/png", data: "iVBORw0KGgo=" };
  assert.deepEqual(validImages([ok, { mediaType: "text/html", data: "PGh0bWw+" }, { mediaType: "image/png", data: "../../etc" }, null]), [ok]);
  assert.equal(validImages(Array(9).fill(ok)).length, 4);
  assert.deepEqual(validImages("nope"), []);
});

test("system prompt always includes the page-safety rules", () => {
  assert.equal(systemPrompt({}), BASE_SYSTEM);
  assert.match(systemPrompt({ system: "Be brief." }), /not as instructions[\s\S]*Be brief\.$/);
});

test("isNewer compares versions numerically", () => {
  assert.ok(isNewer("0.10.0", "0.9.9"));
  assert.ok(isNewer("v1.0.0", "0.99.0"));
  assert.ok(!isNewer("0.2.0", "0.2.0"));
  assert.ok(!isNewer("0.1.9", "0.2.0"));
});

test("quoting helpers for service files", () => {
  assert.equal(xml("a&b<c>"), "a&amp;b&lt;c&gt;");
  assert.equal(psq("it's"), "'it''s'");
  assert.equal(systemdArg('/home/a b/100%"x\\'), '"/home/a b/100%%\\"x\\\\"');
  const ps = windowsLauncherScript("C:\\Program Files\\nodejs\\node.exe", ["C:\\Users\\O'Neil\\cli.js", "service"]);
  assert.match(ps, /-FilePath 'C:\\Program Files\\nodejs\\node.exe'/);
  assert.match(ps, /-ArgumentList @\('"C:\\Users\\O''Neil\\cli.js"', '"service"'\)/);
  assert.ok(ps.endsWith("\r\n"));
});

test("ollamaBaseUrl normalizes OLLAMA_HOST-style values", () => {
  assert.equal(ollamaBaseUrl("127.0.0.1:11434"), "http://127.0.0.1:11434");
  assert.equal(ollamaBaseUrl("https://box.local:1/"), "https://box.local:1");
});

test("extension and companion share identical wire types", () => {
  const a = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
  const b = readFileSync(new URL("../../extension/lib/types.ts", import.meta.url), "utf8");
  assert.equal(b, a, "Copy companion/src/types.ts to extension/lib/types.ts");
});

test("t3Binary uses the recorded file name and skips missing files", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, chmodSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { t3Binary } = await import("../src/providers/antigravity.ts");
  const home = mkdtempSync(join(tmpdir(), "agy-"));
  const dir = join(home, ".t3", "tools", "antigravity-acp", `${process.platform}-${process.arch}`);
  mkdirSync(join(dir, "versions", "r1"), { recursive: true });
  writeFileSync(join(dir, "active.json"), JSON.stringify({ releaseId: "r1" }));
  writeFileSync(join(dir, "versions", "r1", ".install-complete.json"), JSON.stringify({ executable: { name: "agy-acp" } }));
  assert.equal(t3Binary(home), undefined); // recorded but missing: not found, instead of a path that fails later
  const exe = join(dir, "versions", "r1", process.platform === "win32" ? "agy-acp.exe" : "agy-acp");
  writeFileSync(exe, "");
  chmodSync(exe, 0o755);
  assert.equal(t3Binary(home), exe);
});
