<img src="assets/icon.svg" width="64" height="64" alt="">

# AI Sidebar

Chat with **Claude**, **Gemini**, **ChatGPT** or **local models** in a sidebar next to any web page, in **Chrome, Edge
or Firefox** on **Mac, Windows or Linux**, using the accounts you already have (Claude Pro/Max, your Google account,
ChatGPT Plus/Pro) or free models on your own computer via Ollama. No API keys.

[![CI](https://github.com/Juan337492/aisidebar/actions/workflows/ci.yml/badge.svg)](https://github.com/Juan337492/aisidebar/actions/workflows/ci.yml)

![AI Sidebar summarizing a page](docs/amo/screenshots/1-summarize-page.png)

## Install

**Easiest: open the [install page](https://juan337492.github.io/aisidebar/).** It shows only the steps for your computer and browser.

**You need:** a Mac, Windows or Linux computer, and at least one of:
[Claude Code](https://claude.com/product/claude-code) (for Claude),
[Antigravity CLI](https://antigravity.google/download) (`agy`, for Gemini; the desktop app alone isn't enough),
[Codex](https://developers.openai.com/codex/cli) (for ChatGPT: `npm install -g @openai/codex`) or
[Ollama](https://ollama.com/download) (free local models, no account).

### 1. Set up the companion app

This installs a small helper app and starts it automatically at login. The helper is what lets the sidebar reach your
AI accounts. It also checks that Node.js and the AI tools are installed, and tells you what's missing.

**Windows:** download **[AI-Sidebar-Setup.cmd](https://github.com/Juan337492/aisidebar/releases/latest/download/AI-Sidebar-Setup.cmd)**
and double-click it. If Windows says it "protected your PC", click **More info → Run anyway** (the file just runs
[install.ps1](install.ps1)). Or paste this into **PowerShell**:

```powershell
irm https://raw.githubusercontent.com/Juan337492/aisidebar/main/install.ps1 | iex
```

**Mac:** download **[AI-Sidebar-Setup-mac.zip](https://github.com/Juan337492/aisidebar/releases/latest/download/AI-Sidebar-Setup-mac.zip)**,
open it, then right-click **AI-Sidebar-Setup.command** → **Open** (right-click is needed the first time because the file
isn't signed). Or paste this into **Terminal** ([read the script](install.sh) first if you like):

```bash
curl -fsSL https://raw.githubusercontent.com/Juan337492/aisidebar/main/install.sh | bash
```

### 2. Add the extension

Download it from the **[latest release](https://github.com/Juan337492/aisidebar/releases/latest)**:

- **Chrome, Edge, Brave or Arc:** download **[ai-sidebar-chrome.zip](https://github.com/Juan337492/aisidebar/releases/latest/download/ai-sidebar-chrome.zip)**
  and unzip it. Go to `chrome://extensions` (`edge://extensions` in Edge), turn on **Developer mode**, click
  **Load unpacked**, and choose the unzipped folder.
- **Firefox:** download **[ai-sidebar-firefox.zip](https://github.com/Juan337492/aisidebar/releases/latest/download/ai-sidebar-firefox.zip)**.
  Go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and choose the zip. Firefox removes
  it when it restarts. When a signed `ai-sidebar-firefox.xpi` is listed on the release page, use that instead for a
  permanent install: `about:addons` → ⚙️ → **Install Add-on From File…**

### 3. Connect and sign in

Click the AI Sidebar toolbar icon (or press **Alt+Shift+A**), then:
1. Click **Connect**, then confirm in the popup that appears (**Allow** on Mac and Linux, **Yes** on Windows).
2. Click **Sign in with Claude**, **Google** or **ChatGPT**, and log in on their official page. (Ollama needs no
   sign-in.)

That's it. Try **Use page** to ask about the page you're on, the camera button to ask about a screenshot, or
right-click selected text → **Explain**.

<details>
<summary>Linux</summary>

Use the Mac Terminal command. It sets up a systemd user service (or a desktop startup entry), and the Connect popup
uses `zenity` or `kdialog`. Without either, use **Settings → Manual setup** with the token from
`aisidebar-companion token`.
</details>

<details>
<summary>Updating</summary>

When a new version is out, the sidebar shows **Update companion** (one click) and a link to the new extension.
You can also run `aisidebar-companion update`, or run the installer again.
</details>

<details>
<summary>How it works</summary>

```
Browser extension (sidebar)  ──HTTP + token──▶  Companion (127.0.0.1:8765)  ──▶  claude CLI        (Claude subscription)
                                                                              ├─▶  antigravity CLI   (Google account)
                                                                              ├─▶  codex CLI         (ChatGPT account)
                                                                              └─▶  Ollama            (local models)
```

Browsers don't let extensions start programs, so the companion runs the official CLIs, which are already signed in to
your accounts. The extension only talks to the companion on your own computer.
</details>

## Signing in

Click **Sign in with Claude**, **Google** or **ChatGPT** in the sidebar (or in Settings → Providers). The provider's
**official sign-in page** opens in your browser, and you log in there with your usual account (password, email code,
2FA, SSO). The sidebar notices when you're done. The extension and companion never see your password: the CLIs keep
their own sign-in, exactly as when you run `claude auth login` yourself. **Sign out** and **Change account** sign that
CLI out on the whole computer, including other apps that use it.

On other platforms, or if you prefer, use **Manual setup** in Settings and paste the token from
`npm run companion:token`.

## Features

- Streaming chat with model and effort pickers (Claude Opus/Sonnet/Haiku, every Gemini model your account has, ChatGPT
  via Codex, and any Ollama model you've pulled)
- **Use page**: sends the current tab's text with your message (asks for page access the first time). It picks the
  article and skips menus and footers, reads **Google Docs/Sheets/Slides** through their text export, and reads
  **YouTube** descriptions and transcripts. An unchanged page is only sent once per chat.
- **Screenshots**: the camera button attaches what's on screen (great for charts and PDFs); you can also paste images
- **+** attaches any other open tab, for "compare these two pages"
- **Quick actions**: one-click prompts on the home screen and in the right-click menu (Summarize, Key takeaways,
  Explain, Translate, Draft a reply). Edit them or add your own in Settings.
- **Retry** an answer, **Edit** an earlier message, copy code blocks (with syntax highlighting), and see token usage
- Chat history with full-text search, pinning, renaming and **Markdown export**. Switching providers mid-chat carries
  the conversation over.
- T3-style provider settings: on/off toggle, sign-in status, account, CLI version, models, display name
- Light and dark themes, plus custom instructions

## Security

- New connections must be approved in a native dialog that names the extension asking. "Don't Allow" is the
  default, so pressing Enter while typing elsewhere can't approve it.
- The companion listens on `127.0.0.1` only. Every request needs the pairing token, and requests from web pages
  (non-extension `Origin`) or with an unexpected `Host` (DNS rebinding) are rejected.
- The CLIs run in an empty folder (`~/.aisidebar/workspace`). Claude runs with **no tools**, Antigravity in
  `--sandbox` mode and Codex in a read-only sandbox, so a chat can't edit your files. Every provider is told to treat
  page text as reference material, not instructions.
- Page text is only read when you turn on **Use page** or use the right-click menu.
- These CLIs are meant for your own personal use. Check each provider's terms before sharing this with other people.

## Development

```bash
npm install
npm run companion            # run the companion from source
npm run dev:firefox          # opens Firefox with the extension, hot reload
npm run dev                  # same for Chrome
npm run build                # production builds in extension/.output/
npm test                     # unit + server tests (Node 23.6+)
npm run typecheck
```

CI runs typecheck, tests and builds on macOS, Windows and Linux, and does a real install → auto-start → uninstall on
each.

To load a build by hand: **Chrome:** open `chrome://extensions`, turn on Developer mode, click Load unpacked, and
pick `extension/.output/chrome-mv3`. **Firefox:** open `about:debugging`, click Load Temporary Add-on, and pick
`extension/.output/firefox-mv3/manifest.json`.

### Releasing

Bump `version` in `extension/package.json` (and `companion/package.json` if it changed), then run `npm run release`.
That runs the tests, builds everything and publishes a GitHub Release with `aisidebar-companion.tgz`,
`ai-sidebar-chrome.zip`, `ai-sidebar-firefox.zip` and the Windows/Mac setup files, plus `ai-sidebar-firefox.xpi` if a Mozilla-signed build is in `extension/.output/signed/`
(make one with `web-ext sign --channel unlisted`). The download links and `install.sh` always use the latest release.

## Layout

```
companion/src/   server.ts (HTTP/NDJSON), providers/{claude,antigravity,codex,ollama}.ts, cli.ts (install/update), update.ts
extension/       WXT + React + Tailwind; entrypoints/{background,sidepanel,options}, components/, lib/
```
