<img src="assets/icon.svg" width="64" height="64" alt="">

# AI Sidebar

A browser sidebar for **Chrome and Firefox** that chats with **Claude** and **Gemini** using your existing
subscriptions (Claude Pro/Max, and your Google account through Antigravity). It doesn't need API keys.

```
Browser extension (sidebar)  ──HTTP + token──▶  Companion (127.0.0.1:8765)  ──▶  claude CLI        (Claude subscription)
                                                                              └─▶  antigravity CLI   (Google account)
```

Browsers don't let extensions start programs, so a small **companion** app on your Mac runs the official CLIs,
which are already signed in to your accounts. The extension only talks to that companion.

## Requirements

- Node 23.6+
- **Claude Code** installed and signed in (`claude` → log in with your Claude account)
- **Antigravity** CLI signed in with Google. It's found automatically on `PATH` (`antigravity`/`agy`) or in
  T3 Code's tools folder. To use another location, set `binaries.antigravity` in `~/.aisidebar/config.json`.

## Setup

```bash
npm install
npm run companion            # prints the URL + pairing token
# or start it at login (macOS):
npm run companion:install
```

### Chrome
1. `npm run build` → creates `extension/.output/chrome-mv3`
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick that folder.
3. Click the toolbar icon (or press **Alt+Shift+A**). Then go to Settings, paste the token, and click **Save and connect**.

### Firefox
1. `npm run build` → creates `extension/.output/firefox-mv3`
2. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and pick `manifest.json` in that folder.
   For a permanent install, sign it as an unlisted add-on on addons.mozilla.org with `npm run zip`.
3. Toggle the sidebar with the toolbar icon or **Alt+Shift+A**.

For development with hot reload, run `npm run dev` (Chrome) or `npm run dev:firefox`.

## Features

- Streaming chat with model and effort pickers (Claude Opus/Sonnet/Haiku, plus every Gemini model your account has)
- **Use page**: sends the current tab's text with your message (asks for page access the first time)
- Right-click a selection to **Explain** it or **Ask AI Sidebar** about it; right-click a page to **Summarize this page**
- Chat history with search and pinning. Switching providers mid-chat carries the conversation over.
- T3-style provider settings: on/off toggle, sign-in status, account, CLI version, models, display name
- Light and dark themes, plus custom instructions

## Security

- The companion listens on `127.0.0.1` only. Every request needs the pairing token, and requests from web pages
  (non-extension `Origin`) or with an unexpected `Host` (DNS rebinding) are rejected.
- The CLIs run in an empty folder (`~/.aisidebar/workspace`). Claude runs with **no tools** and Antigravity runs in
  `--sandbox` mode, so a chat can't edit your files.
- Page text is only read when you turn on **Use page** or use the right-click menu.
- These CLIs are meant for your own personal use. Check each provider's terms before sharing this with other people.

## Layout

```
companion/src/   server.ts (HTTP/NDJSON), providers/claude.ts, providers/antigravity.ts, cli.ts
extension/       WXT + React + Tailwind; entrypoints/{background,sidepanel,options}, components/, lib/
```
