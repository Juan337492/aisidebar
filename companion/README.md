# aisidebar-companion

Local helper for the **AI Sidebar** browser extension (Chrome, Edge and Firefox). It lets the sidebar chat with
**Claude**, **Gemini**, **ChatGPT** and **local models** using your own sign-ins instead of API keys.

Browsers don't let extensions start programs, so this small app runs the official tools for the sidebar:

- **Claude** → [Claude Code](https://claude.com/product/claude-code) (Claude Pro/Max subscription)
- **Gemini** → [Antigravity](https://antigravity.google/download) (Google account)
- **ChatGPT** → [Codex CLI](https://developers.openai.com/codex/cli) (ChatGPT Plus/Pro/Team)
- **Local models** → [Ollama](https://ollama.com/download) (no account; set `"ollamaUrl"` in `~/.aisidebar/config.json`
  if it isn't at `http://127.0.0.1:11434`)

## Install

Requires Node.js 20 or newer. Works on macOS, Windows and Linux.

```bash
npm install -g https://github.com/Juan337492/aisidebar/releases/latest/download/aisidebar-companion.tgz
aisidebar-companion install     # start now and at every login
# or run it in a terminal instead:
aisidebar-companion start
```

Auto-start uses a LaunchAgent on macOS, a hidden launcher in the per-user Run key on Windows, and a systemd user
service (or a desktop startup entry) on Linux. It restarts after a crash; logs go to `~/.aisidebar/companion.log`.

Then open AI Sidebar in your browser, click **Connect**, and approve the popup. Use the **Sign in** buttons to log in
on each provider's official page.

Other commands:

- `aisidebar-companion update`: install the latest release and restart (the sidebar has a one-click button for this)
- `aisidebar-companion token`: show the URL and token for manual setup
- `aisidebar-companion uninstall`: stop it and remove auto-start
- `aisidebar-companion version`

## Privacy and security

- Listens on `127.0.0.1` only. Requests from web pages are rejected, and every request needs a pairing token that
  you approve on your computer.
- Never sees your passwords. Sign-in happens on each provider's own page, and the CLIs keep their own credentials.
- Runs the CLIs in an empty folder (`~/.aisidebar/workspace`) without file-editing tools (Claude: no tools;
  Antigravity: sandbox; Codex: read-only sandbox), so chats can't change your files. Screenshots are written there
  briefly for CLIs that only accept image files, and deleted after each answer.
- Sends nothing anywhere except your chats, which go to the provider you picked, and a daily check of the latest
  release on GitHub (for the update notice).

Source: https://github.com/Juan337492/aisidebar
