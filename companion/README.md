# aisidebar-companion

Local helper for the **AI Sidebar** browser extension (Firefox and Chrome). It lets the sidebar chat with
**Claude** and **Gemini** using your own Claude and Google sign-ins instead of API keys.

Browsers don't let extensions start programs, so this small app runs the official command-line tools for the
sidebar:

- **Claude** → [Claude Code](https://claude.com/product/claude-code) (Claude Pro/Max subscription)
- **Gemini** → [Antigravity](https://antigravity.google/download) (Google account)

## Install

Requires Node.js 20 or newer.

```bash
npm install -g aisidebar-companion
aisidebar-companion install     # macOS: start now and at every login
# or run it in a terminal instead:
aisidebar-companion start
```

Then open AI Sidebar in your browser, click **Connect**, and click **Allow** in the popup. Use the **Sign in**
buttons to log in with your Claude or Google account on their official pages.

Other commands: `aisidebar-companion token` (show the URL and token for manual setup) and
`aisidebar-companion uninstall` (remove auto-start).

## Privacy and security

- Listens on `127.0.0.1` only. Requests from web pages are rejected, and every request needs a pairing token that
  you approve on your Mac.
- Never sees your passwords. Sign-in happens on Anthropic's and Google's own pages, and the CLIs keep their own
  credentials.
- Runs the CLIs in an empty folder (`~/.aisidebar/workspace`) with no file or shell tools, so chats can't touch
  your files.
- Sends nothing anywhere except your chats, which go to the provider you picked.

Source: https://github.com/Juan337492/aisidebar
