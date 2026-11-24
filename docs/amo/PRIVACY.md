# AI Sidebar privacy policy

_Last updated: November 23, 2026_

AI Sidebar is a browser extension that lets you chat with AI models in your browser's sidebar, using your own accounts: Claude by Anthropic, Gemini by Google, ChatGPT by OpenAI (via
Codex), or local models that run entirely on your computer (via Ollama). This policy explains what data the extension handles.

## The short version

- The developer of AI Sidebar **does not collect, receive or store any of your data**. There are no analytics,
  tracking, ads or developer-run servers.
- Your messages, and page content you choose to share, go from your browser to the **companion app on your own
  computer**, and from there to the AI provider you picked (Anthropic, Google or OpenAI), or stay on your computer if you use a local model.

## What data is handled, and where it goes

| Data | When | Sent to |
|---|---|---|
| Messages you type | When you send a message | The companion app on your computer (`127.0.0.1`), which sends it to the provider you picked using its official tool (Claude Code, Antigravity or Codex), or to Ollama on your own computer |
| Text of the current web page (title, address, visible text) | Only when you turn on **Use page**, or choose **Summarize this page** / **Explain** / **Ask** from the right-click menu | Same as above |
| Selected text | Only when you use the right-click menu on a selection, a quick action, or **Use page** while text is highlighted | Same as above |
| Screenshots and pasted images | Only when you click the camera button or paste an image | Same as above |
| Other open tabs | Only a tab you pick from the **+** menu | Same as above |
| The latest AI Sidebar version number | About once a day | The companion asks GitHub (api.github.com) for the latest release, to show an update notice. Nothing about you is sent. |
| Chat history and settings | Always | Stored only in your browser's local extension storage, on your device |

AI Sidebar never reads pages in the background, and it asks for permission before it can read any page.

## Accounts and passwords

AI Sidebar never sees your passwords. When you sign in, you do it on Anthropic's or Google's own official sign-in
page. The command-line tools on your computer (Claude Code, Antigravity and Codex) store their own sign-in, as they do
when you use them directly.

## Third parties

When you send a message, the AI provider you chose processes it under its own privacy policy:

- Anthropic: https://www.anthropic.com/legal/privacy
- Google: https://policies.google.com/privacy
- OpenAI: https://openai.com/policies/privacy-policy

## Your controls

- Delete individual chats from the history, or all chats under **Settings → Delete all chats**.
- Remove page access at any time in your browser's extension settings.
- Uninstalling the extension deletes all of its local data.

## Contact

Questions or concerns: https://github.com/Juan337492/aisidebar/issues
