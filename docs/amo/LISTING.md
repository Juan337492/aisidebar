# addons.mozilla.org listing

Copy these into the AMO submission form.

## Name
AI Sidebar

## Add-on URL (slug)
ai-sidebar-chat

## Summary (250 characters max)
Chat with Claude and Gemini in your sidebar using your own Claude and Google accounts, with no API keys. Summarize pages, explain selected text, and keep your place while you read. Requires the free AI Sidebar companion app.

## Description
AI Sidebar keeps an AI assistant next to whatever you're reading, so you can ask questions without copying and pasting or switching tabs.

**Use the accounts you already have**
Sign in with your Claude account (Pro or Max) or your Google account. Sign-in happens on Anthropic's and Google's official pages. AI Sidebar never sees your password, and there are no API keys to manage.

**What you can do**
• Summarize long articles and documents
• Explain selected text in plain English (right-click → Explain)
• Ask about the page you're on: turn on "Use page" and ask anything
• Switch between Claude and Gemini models, and pick how hard they think
• Keep your chat history, search it, and pin favorites
• Light and dark themes, plus custom instructions

**How it works**
AI Sidebar uses a small free companion app on your computer. The app runs the official Claude Code and Antigravity tools, which are signed in to your accounts. Install it once:

npm install -g https://github.com/Juan337492/aisidebar/releases/latest/download/aisidebar-companion.tgz && aisidebar-companion install

Then click Connect in the sidebar and approve it on your computer. Full setup guide: https://github.com/Juan337492/aisidebar#setup

**Privacy**
No analytics, no tracking, no developer servers. Your messages, and page text only when you choose to share it, go to the companion on your own computer and then to the AI provider you picked. Chat history stays in your browser.

Requires: macOS (Windows and Linux supported with manual setup), Node.js 20+, Claude Code and/or Antigravity.

AI Sidebar is an independent project and is not affiliated with or endorsed by Anthropic or Google. Claude and Gemini are trademarks of their respective owners.

## Categories (Firefox)
- Other
- Search Tools

## Tags
ai, sidebar, claude, gemini, summarize, productivity

## Support
- Support site: https://github.com/Juan337492/aisidebar/issues
- Homepage: https://github.com/Juan337492/aisidebar

## License
MIT

## Privacy policy
Paste the contents of `docs/amo/PRIVACY.md`.

## Platforms
Firefox for desktop only. Leave Firefox for Android unchecked, because Android has no sidebar.

## Notes to reviewer
AI Sidebar is a sidebar chat UI. It talks only to a companion app on the user's own computer at http://127.0.0.1:8765 (source in `companion/`, distributed as a GitHub Release file). The companion runs the official Claude Code and Antigravity CLIs, which the user signs in to on Anthropic's and Google's own pages. The extension never handles credentials.

To test without installing anything: the sidebar loads and shows a "Install the companion" card. With the companion: `npm install -g https://github.com/Juan337492/aisidebar/releases/latest/download/aisidebar-companion.tgz && aisidebar-companion start`, then click Connect (macOS shows an approval dialog), or paste the token from `aisidebar-companion token` under Settings → Manual setup. Signing in needs a Claude or Google account.

Permissions:
- `<all_urls>` is optional and requested only when the user turns on "Use page", to read the current tab's text.
- `activeTab` + `scripting` read the page for the right-click "Summarize this page" item.
- `tabs` shows the current tab's title on the "Use page" chip.
- `contextMenus`: Explain / Ask / Summarize items.
- `storage`: chats and settings, kept locally.
- `http://127.0.0.1/*`, `http://localhost/*`: the user's own companion app.

The UNSAFE_VAR_ASSIGNMENT linter warnings come from bundled React DOM and react-markdown, not from add-on code. No remote code is loaded.

Build instructions are in SOURCE_CODE_REVIEW.md in the source archive.
