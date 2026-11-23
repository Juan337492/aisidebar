# Building AI Sidebar from source (for addons.mozilla.org reviewers)

The add-on is written in TypeScript + React and bundled with [WXT](https://wxt.dev) (Vite). The uploaded add-on
is built directly from this source, with no extra steps or remote code.

## Requirements

- macOS, Linux or Windows
- **Node.js 22 or newer** (tested with Node 23.6) and **npm 10+**

## Build

From the root of this source archive:

```bash
npm ci
npm run build:firefox -w extension
```

The built add-on is in `extension/.output/firefox-mv3/`. It should match the uploaded package. To produce the same
zip, run `npm run zip:firefox -w extension` (output: `extension/.output/ai-sidebar-<version>-firefox.zip`).

## What's in the archive

- `extension/` is the add-on (sidebar, settings page, background script).
- `companion/` is a separate local helper app (published on npm as `aisidebar-companion`). It is **not** part of the
  add-on. It's included only because the repository is an npm workspace and `npm ci` needs it.

## Notes for review

- The add-on only makes network requests to `http://127.0.0.1` (the user's own companion app). That app runs the
  official Claude Code and Antigravity command-line tools, which talk to Anthropic and Google.
- Page text is read only when the user turns on "Use page" or uses the right-click menu. Reading pages uses the
  optional `<all_urls>` permission, requested at that moment.
- No remote code, analytics or tracking.
