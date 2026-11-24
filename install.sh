#!/usr/bin/env bash
# AI Sidebar: one-line setup for the companion app.
#
#   curl -fsSL https://raw.githubusercontent.com/Juan337492/aisidebar/main/install.sh | bash
#
# What it does:
#   1. Checks for Node.js 20+ (offers to install it with Homebrew on macOS).
#   2. Installs the AI Sidebar companion from the latest GitHub Release.
#   3. Starts it now and at every login (macOS LaunchAgent, or a systemd user service on Linux).
#   4. Checks which AI tools are installed (Claude Code, Antigravity, Codex, Ollama).
#
# It never asks for passwords and doesn't touch your projects.
set -euo pipefail

REPO="Juan337492/aisidebar"
# AISIDEBAR_TGZ lets CI test a locally built package instead of the published one.
TGZ="${AISIDEBAR_TGZ:-https://github.com/${REPO}/releases/latest/download/aisidebar-companion.tgz}"
RELEASES="https://github.com/${REPO}/releases/latest"
# Fallback install location when the global npm folder isn't writable without sudo.
LOCAL_PREFIX="${AISIDEBAR_PREFIX:-$HOME/.aisidebar/node}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

bold "AI Sidebar setup"
echo

# 1. Node.js -----------------------------------------------------------------
bold "1/4  Node.js"
if ! command -v node >/dev/null 2>&1; then
  if [ "$(uname)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    warn "Node.js not found. Installing it with Homebrew…"
    brew install node
  else
    fail "Node.js 20 or newer is required. Install it from https://nodejs.org, then run this again."
  fi
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js 20 or newer is required (you have $(node -v)). Update it from https://nodejs.org."
ok "Node.js $(node -v)"

# 2. Companion ---------------------------------------------------------------
echo
bold "2/4  Companion app"
if [ -z "${AISIDEBAR_PREFIX:-}" ] && npm install -g --silent --no-fund --no-audit "$TGZ" 2>/dev/null; then
  BIN="$(npm prefix -g)/bin/aisidebar-companion"
else
  # Global npm folder needs sudo (or a prefix was given): install into ~/.aisidebar/node instead.
  mkdir -p "$LOCAL_PREFIX"
  npm install -g --silent --no-fund --no-audit --prefix "$LOCAL_PREFIX" "$TGZ"
  BIN="$LOCAL_PREFIX/bin/aisidebar-companion"
fi
[ -x "$BIN" ] || fail "The companion didn't install correctly (expected $BIN)."
ok "Installed: $BIN"

# 3. Start it ------------------------------------------------------------------
echo
bold "3/4  Start the companion"
if [ "${AISIDEBAR_SKIP_SERVICE:-}" = "1" ]; then
  warn "Skipping auto-start (AISIDEBAR_SKIP_SERVICE=1)."
elif "$BIN" install >/dev/null; then
  ok "Running now, and it will start automatically when you log in."
else
  warn "Couldn't set up auto-start. Start it yourself with:"
  echo "      $BIN start"
fi

# 4. AI tools -----------------------------------------------------------------
echo
bold "4/4  AI tools (you need at least one)"
found_any=""
have_claude=""
for c in claude "$HOME/.local/bin/claude" "$HOME/.claude/local/claude"; do
  if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then have_claude=1; break; fi
done
if [ -n "$have_claude" ]; then ok "Claude Code found (for Claude)"; found_any=1
else warn "Claude Code not found. For Claude, install it: https://claude.com/product/claude-code"; fi

have_agy=""
if command -v agy >/dev/null 2>&1 || [ -x "$HOME/.local/bin/agy" ] || command -v antigravity >/dev/null 2>&1 || [ -d "$HOME/.t3/tools/antigravity-acp" ]; then have_agy=1; fi
if [ -n "$have_agy" ]; then ok "Antigravity found (for Gemini)"; found_any=1
else warn "Antigravity CLI not found (the desktop app isn't enough). For Gemini run: curl -fsSL https://antigravity.google/cli/install.sh | bash"; fi

if command -v codex >/dev/null 2>&1; then ok "Codex found (for ChatGPT)"; found_any=1
else warn "Codex not found (optional). For ChatGPT: npm install -g @openai/codex"; fi

if command -v ollama >/dev/null 2>&1; then ok "Ollama found (for local models)"; found_any=1
else warn "Ollama not found (optional). For free local models: https://ollama.com/download"; fi
[ -n "$found_any" ] || warn "Install at least one of the tools above to chat."

# Done --------------------------------------------------------------------------
echo
bold "Done! Last steps:"
cat <<EOF
  1. Get the browser extension (step-by-step guide: https://juan337492.github.io/aisidebar/)
     from ${RELEASES}
       • Chrome: download ai-sidebar-chrome.zip, unzip it, open chrome://extensions,
         turn on Developer mode, click "Load unpacked", and pick the unzipped folder.
       • Firefox: see the instructions on that page.
  2. Open the sidebar (toolbar icon, or Alt+Shift+A) and click Connect.
     Click Allow in the popup that appears.
  3. Sign in to Claude, Google or ChatGPT from the sidebar (Ollama needs no sign-in).
EOF
