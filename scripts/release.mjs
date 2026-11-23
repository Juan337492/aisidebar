// Builds everything and publishes one GitHub Release that people download from.
//
//   npm run release
//
// Assets (stable names, so .../releases/latest/download/<name> always works):
//   aisidebar-companion.tgz  companion app (used by install.sh)
//   ai-sidebar-chrome.zip    Chrome extension (Load unpacked)
//   ai-sidebar-firefox.xpi   Firefox extension, signed by Mozilla (if extension/.output/signed has one)
//   ai-sidebar-firefox.zip   Firefox extension, unsigned (temporary install)
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" }).trim();
const version = JSON.parse(readFileSync("extension/package.json", "utf8")).version;
const tag = `v${version}`;
const out = mkdtempSync(join(tmpdir(), "aisidebar-release-"));
const assets = [];
const add = (from, name) => {
  const to = join(out, name);
  copyFileSync(from, to);
  assets.push(to);
};

// Companion
run("npm", ["run", "build", "-w", "companion"]);
const tgz = JSON.parse(run("npm", ["pack", "-w", "companion", "--json", "--pack-destination", out]))[0].filename;
add(join(out, tgz), "aisidebar-companion.tgz");

// Extension
run("npm", ["run", "zip", "-w", "extension"]);
run("npm", ["run", "zip:firefox", "-w", "extension"]);
add(`extension/.output/ai-sidebar-${version}-chrome.zip`, "ai-sidebar-chrome.zip");
add(`extension/.output/ai-sidebar-${version}-firefox.zip`, "ai-sidebar-firefox.zip");
const signedDir = "extension/.output/signed";
const xpi = existsSync(signedDir) && readdirSync(signedDir).find((f) => f.endsWith(".xpi") && f.includes(version));
if (xpi) add(join(signedDir, xpi), "ai-sidebar-firefox.xpi");
else console.warn("No signed Firefox .xpi for this version; publishing the unsigned zip only.");

const notes = readFileSync("docs/RELEASE_NOTES.md", "utf8").replaceAll("{{version}}", version);
const sha = run("git", ["rev-parse", "HEAD"]);
console.log(`Creating GitHub Release ${tag} at ${sha.slice(0, 7)} with ${assets.length} files…`);
run("gh", ["release", "create", tag, ...assets, "--target", sha, "--title", `AI Sidebar ${version}`, "--notes", notes, "--latest"]);
console.log("Done:", run("gh", ["release", "view", tag, "--json", "url", "-q", ".url"]));
