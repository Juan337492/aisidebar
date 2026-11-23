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

## Setup

1. **Install the extension** from Firefox Add-ons (or see [Development](#development) to load it yourself).
2. **Install the tools you want to use:**
   - [Claude Code](https://claude.com/product/claude-code) for Claude (Pro/Max subscription)
   - [Antigravity](https://antigravity.google/download) for Gemini (Google account)
3. **Install the companion** (needs [Node.js](https://nodejs.org) 20+):
   ```bash
   npm install -g https://github.com/Juan337492/aisidebar/releases/latest/download/aisidebar-companion.tgz
   aisidebar-companion install     # macOS: start now and at every login
   ```
   On Windows or Linux, run `aisidebar-companion start` instead and keep it open.
4. **Connect:** open the sidebar (toolbar icon or **Alt+Shift+A**), click **Connect**, and click **Allow** in the
   popup. On Windows or Linux, paste the token from `aisidebar-companion token` under Settings → Manual setup.
5. **Sign in** with the Sign in buttons.

## Signing in

Click **Sign in with Claude** or **Sign in with Google** in the sidebar (or in Settings → Providers). The provider's
**official sign-in page** opens in your browser, and you log in there with your usual account (password, email code,
2FA, SSO). The sidebar notices when you're done. The extension and companion never see your password: the CLIs keep
their own sign-in, exactly as when you run `claude auth login` yourself. **Sign out** and **Change account** sign that
CLI out on the whole computer, including other apps that use it.

On other platforms, or if you prefer, use **Manual setup** in Settings and paste the token from
`npm run companion:token`.

## Features

- Streaming chat with model and effort pickers (Claude Opus/Sonnet/Haiku, plus every Gemini model your account has)
- **Use page**: sends the current tab's text with your message (asks for page access the first time)
- Right-click a selection to **Explain** it or **Ask AI Sidebar** about it; right-click a page to **Summarize this page**
- Chat history with search and pinning. Switching providers mid-chat carries the conversation over.
- T3-style provider settings: on/off toggle, sign-in status, account, CLI version, models, display name
- Light and dark themes, plus custom instructions

## Security

- New connections must be approved in a native macOS dialog that names the extension asking.
- The companion listens on `127.0.0.1` only. Every request needs the pairing token, and requests from web pages
  (non-extension `Origin`) or with an unexpected `Host` (DNS rebinding) are rejected.
- The CLIs run in an empty folder (`~/.aisidebar/workspace`). Claude runs with **no tools** and Antigravity runs in
  `--sandbox` mode, so a chat can't edit your files.
- Page text is only read when you turn on **Use page** or use the right-click menu.
- These CLIs are meant for your own personal use. Check each provider's terms before sharing this with other people.

## Development

```bash
npm install
npm run companion            # run the companion from source
npm run dev:firefox          # opens Firefox with the extension, hot reload
npm run dev                  # same for Chrome
npm run build                # production builds in extension/.output/
```

To load a build by hand: **Chrome:** open `chrome://extensions`, turn on Developer mode, click Load unpacked, and
pick `extension/.output/chrome-mv3`. **Firefox:** open `about:debugging`, click Load Temporary Add-on, and pick
`extension/.output/firefox-mv3/manifest.json`.

### Releasing

- **Companion:** bump `version` in `companion/package.json`, then `npm run release:companion`. This builds it and
  uploads `aisidebar-companion.tgz` to a new GitHub Release, which the install command always fetches as "latest".
- **Firefox:** `npm run zip:firefox`, then upload `extension/.output/ai-sidebar-<version>-firefox.zip` and the
  `-sources.zip` on addons.mozilla.org, or run `npm run submit:firefox` (see `docs/amo/`). Bump `version` in
  `extension/package.json` before each release.

## Layout

```
companion/src/   server.ts (HTTP/NDJSON), providers/claude.ts, providers/antigravity.ts, cli.ts
extension/       WXT + React + Tailwind; entrypoints/{background,sidepanel,options}, components/, lib/
```
