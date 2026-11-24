import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  imports: false,
  manifestVersion: 3,
  vite: () => ({ plugins: [tailwindcss()] }),
  zip: {
    name: "ai-sidebar",
    // Mozilla rebuilds the add-on from source, so ship the whole workspace (root lockfile included).
    sourcesRoot: "..",
    excludeSources: ["**/node_modules/**", "**/.output/**", "**/.wxt/**", "**/dist/**", "**/*.tgz", "**/.env*", "docs/amo/screenshots/**"],
  },
  manifest: ({ browser }) => ({
    name: "AI Sidebar",
    description: "Chat with Claude, Gemini, ChatGPT or local models next to any page, using your own sign-ins.",
    homepage_url: "https://github.com/Juan337492/aisidebar",
    // unlimitedStorage: chat history (with shared pages and screenshots) can outgrow the 10 MB default.
    permissions: ["storage", "unlimitedStorage", "tabs", "scripting", "contextMenus", "activeTab"],
    // The local companion app. Page reading asks for <all_urls> only when you first use it.
    host_permissions: ["http://127.0.0.1/*", "http://localhost/*"],
    optional_host_permissions: ["<all_urls>"],
    action: { default_title: "Open AI Sidebar" },
    commands:
      browser === "firefox"
        ? { _execute_sidebar_action: { suggested_key: { default: "Alt+Shift+A" }, description: "Toggle AI Sidebar" } }
        : { _execute_action: { suggested_key: { default: "Alt+Shift+A" }, description: "Open AI Sidebar" } },
    ...(browser === "firefox"
      ? { browser_specific_settings: {
          gecko: {
            // Permanent AMO add-on ID. Never change it after the first upload.
            id: "{b3447934-d85a-43db-8f54-81bd4f331a8d}",
            // First version that understands data_collection_permissions.
            strict_min_version: "140.0",
            // Messages, and page text when you use "Use page" or the right-click menu, are sent through the local
            // companion to the AI provider you chose (Anthropic or Google). Nothing is sent to the developer.
            data_collection_permissions: { required: ["websiteContent"] },
          },
          // Desktop only in practice (Android has no sidebar); declared so the data permissions key validates.
          gecko_android: { strict_min_version: "142.0" },
        } }
      : {}),
  }),
});
