import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { WORKSPACE_DIR } from "./config.ts";
import { childEnv, stripAnsi } from "./process.ts";

/** Minimal Agent Client Protocol (JSON-RPC over stdio) client — enough for sign-in and sign-out. */
export function startAcp(bin: string) {
  const child = spawn(bin, ["acp", "--disable-telemetry"], { cwd: WORKSPACE_DIR, env: childEnv(), stdio: ["pipe", "pipe", "pipe"] });
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  const lineListeners: ((line: string) => void)[] = [];
  let stderr = "";

  const send = (msg: object) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

  createInterface({ input: child.stdout }).on("line", (line) => {
    lineListeners.forEach((l) => l(line));
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.method && msg.id !== undefined) {
      // We don't offer file/terminal/permission features to the agent.
      send({ id: msg.id, error: { code: -32601, message: "Not supported by AI Sidebar" } });
    } else if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) p.reject(Object.assign(new Error(msg.error.message ?? "ACP error"), { code: msg.error.code }));
      else p.resolve(msg.result);
    }
  });
  child.stderr.on("data", (d) => {
    const t = d.toString();
    stderr = (stderr + t).slice(-2000);
    lineListeners.forEach((l) => l(t));
  });
  child.on("close", () => {
    const err = new Error(stripAnsi(stderr).trim().split("\n").pop() || "Antigravity exited unexpectedly.");
    pending.forEach((p) => p.reject(err));
    pending.clear();
  });
  child.on("error", (e) => {
    pending.forEach((p) => p.reject(e));
    pending.clear();
  });

  return {
    request(method: string, params: object = {}): Promise<any> {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ id, method, params });
      });
    },
    initialize() {
      return this.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "aisidebar-companion", version: "0.1.0" },
      });
    },
    onOutput(cb: (text: string) => void) {
      lineListeners.push(cb);
    },
    close() {
      child.stdin.end();
      child.kill("SIGTERM");
    },
  };
}
