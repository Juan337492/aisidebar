#!/usr/bin/env bash
# AI Sidebar: one-line setup for the companion app.
#
#   curl -fsSL https://raw.githubusercontent.com/Juan337492/aisidebar/main/install.sh | bash
#
# What it does:
#   1. Checks for Node.js 20+ (offers to install it with Homebrew on macOS).
#   2. Installs the AI Sidebar companion from the latest GitHub Release.
#   3. On macOS, starts it now and at every login.
#   4. Checks whether Claude Code and Antigravity are installed.
#
# It never asks for passwords and doesn't touch your projects.
set -euo pipefail

REPO="Juan337492/aisidebar"
TGZ="https://github.com/${REPO}/releases/latest/download/aisidebar-companion.tgz"
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
elif [ "$(uname)" = "Darwin" ]; then
  "$BIN" install >/dev/null
  ok "Running now, and it will start automatically when you log in."
else
  warn "Auto-start is macOS-only for now. Keep this running in a terminal:"
  echo "      $BIN start"
fi

# 4. AI tools -----------------------------------------------------------------
echo
bold "4/4  AI tools (you need at least one)"
have_claude=""
for c in claude "$HOME/.local/bin/claude" "$HOME/.claude/local/claude"; do
  if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then have_claude=1; break; fi
done
if [ -n "$have_claude" ]; then ok "Claude Code found (for Claude)"
else warn "Claude Code not found. For Claude, install it: https://claude.com/product/claude-code"; fi

have_agy=""
if command -v antigravity >/dev/null 2>&1 || command -v agy >/dev/null 2>&1 || [ -d "$HOME/.t3/tools/antigravity-acp" ]; then have_agy=1; fi
if [ -n "$have_agy" ]; then ok "Antigravity found (for Gemini)"
else warn "Antigravity not found. For Gemini, install it: https://antigravity.google/download"; fi

# Done --------------------------------------------------------------------------
echo
bold "Done! Last steps:"
cat <<EOF
  1. Get the browser extension: ${RELEASES}
       • Chrome: download ai-sidebar-chrome.zip, unzip it, open chrome://extensions,
         turn on Developer mode, click "Load unpacked", and pick the unzipped folder.
       • Firefox: see the instructions on that page.
  2. Open the sidebar (toolbar icon, or Alt+Shift+A) and click Connect.
     Click Allow in the popup on your Mac.
  3. Click "Sign in with Claude" or "Sign in with Google".
EOF
