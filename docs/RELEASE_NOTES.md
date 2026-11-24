## What's new

- **Fix: Gemini wasn't detected on Windows** after installing Antigravity. The companion now finds the Antigravity CLI (`agy`) where its installer puts it, and no longer shows a broken sign-in error.
- When the Antigravity CLI is missing, Settings and the installers now explain that the desktop app alone isn't enough and show the one-line install command.

Already on 0.3.0? Click **Update companion** in the sidebar. Coming from 0.2.x? Run the installer again once.

## Install in 3 steps

**Easiest:** follow the [install page](https://juan337492.github.io/aisidebar/), which shows only the steps for your computer and browser.

**1. Set up the companion app**

- **Windows:** download `AI-Sidebar-Setup.cmd` below and double-click it. If Windows says it "protected your PC", click **More info → Run anyway**.
- **Mac:** download `AI-Sidebar-Setup-mac.zip` below, open it, then right-click `AI-Sidebar-Setup.command` → **Open**. Or paste this into Terminal (also works on Linux):

```bash
curl -fsSL https://raw.githubusercontent.com/Juan337492/aisidebar/main/install.sh | bash
```

It installs the small helper app that connects the sidebar to your AI accounts, starts it automatically, and tells you which AI tools (Claude Code, Antigravity, Codex, Ollama) are missing.

Already installed? The sidebar shows **Update companion** — one click.

**2. Add the extension to your browser** (download it below, under **Assets**):

- **Chrome, Edge, Brave or Arc:** download `ai-sidebar-chrome.zip` and unzip it. Open `chrome://extensions` (`edge://extensions` in Edge), turn on **Developer mode**, click **Load unpacked**, and pick the unzipped folder.
- **Firefox:** if there's an `ai-sidebar-firefox.xpi` file below, download it, open `about:addons`, click the ⚙️ menu, choose **Install Add-on From File…** and pick it. Otherwise download `ai-sidebar-firefox.zip`, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick the zip. That way lasts until you restart Firefox.

**3. Connect and sign in.** Click the AI Sidebar toolbar icon (or press **Alt+Shift+A**), click **Connect**, confirm the popup (**Allow** on Mac/Linux, **Yes** on Windows), then sign in to Claude, Google or ChatGPT.

Install page: https://juan337492.github.io/aisidebar/ · Full guide: https://github.com/Juan337492/aisidebar#install
