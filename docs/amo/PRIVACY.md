# AI Sidebar privacy policy

_Last updated: November 22, 2026_

AI Sidebar is a browser extension that lets you chat with AI models (Claude by Anthropic, and Gemini by Google)
in your browser's sidebar, using your own accounts. This policy explains what data the extension handles.

## The short version

- The developer of AI Sidebar **does not collect, receive or store any of your data**. There are no analytics,
  tracking, ads or developer-run servers.
- Your messages, and page content you choose to share, go from your browser to the **companion app on your own
  computer**, and from there to the AI provider you picked (Anthropic or Google).

## What data is handled, and where it goes

| Data | When | Sent to |
|---|---|---|
| Messages you type | When you send a message | The companion app on your computer (`127.0.0.1`), which sends it to Anthropic (Claude) or Google (Gemini) using the official Claude Code or Antigravity tools |
| Text of the current web page (title, address, visible text) | Only when you turn on **Use page**, or choose **Summarize this page** / **Explain** / **Ask** from the right-click menu | Same as above |
| Selected text | Only when you use the right-click menu on a selection | Same as above |
| Chat history and settings | Always | Stored only in your browser's local extension storage, on your device |

AI Sidebar never reads pages in the background, and it asks for permission before it can read any page.

## Accounts and passwords

AI Sidebar never sees your passwords. When you sign in, you do it on Anthropic's or Google's own official sign-in
page. The command-line tools on your computer (Claude Code and Antigravity) store their own sign-in, as they do
when you use them directly.

## Third parties

When you send a message, the AI provider you chose processes it under its own privacy policy:

- Anthropic: https://www.anthropic.com/legal/privacy
- Google: https://policies.google.com/privacy

## Your controls

- Delete individual chats from the history, or all chats under **Settings → Delete all chats**.
- Remove page access at any time in your browser's extension settings.
- Uninstalling the extension deletes all of its local data.

## Contact

Questions or concerns: https://github.com/Juan337492/aisidebar/issues
