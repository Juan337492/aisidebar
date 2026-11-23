// Builds the companion and uploads it to a GitHub Release as aisidebar-companion.tgz.
// Users install it with: npm install -g https://github.com/Juan337492/aisidebar/releases/latest/download/aisidebar-companion.tgz
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts }).trim();
const { version } = JSON.parse(readFileSync("companion/package.json", "utf8"));
const tag = `companion-v${version}`;

const out = mkdtempSync(join(tmpdir(), "aisidebar-companion-"));
run("npm", ["run", "build", "-w", "companion"]);
const packed = JSON.parse(run("npm", ["pack", "-w", "companion", "--json", "--pack-destination", out]))[0].filename;
const asset = join(out, "aisidebar-companion.tgz");
copyFileSync(join(out, packed), asset);

const sha = run("git", ["rev-parse", "HEAD"]);
console.log(`Creating GitHub Release ${tag} at ${sha.slice(0, 7)}…`);
run("gh", [
  "release", "create", tag, asset,
  "--target", sha,
  "--title", `Companion v${version}`,
  "--notes",
  `Local helper for the AI Sidebar extension.\n\nInstall or update:\n\n\`\`\`bash\nnpm install -g https://github.com/Juan337492/aisidebar/releases/latest/download/aisidebar-companion.tgz\naisidebar-companion install\n\`\`\``,
  "--latest",
]);
console.log("Done:", run("gh", ["release", "view", tag, "--json", "url", "-q", ".url"]));
