import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  imports: false,
  manifestVersion: 3,
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: ({ browser }) => ({
    name: "AI Sidebar",
    description: "Chat with Claude and Gemini next to any page, using your own subscriptions.",
    permissions: ["storage", "tabs", "scripting", "contextMenus", "activeTab"],
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
            id: "aisidebar@local",
            strict_min_version: "128.0",
            // Nothing leaves your machine except the chats you send to your own providers.
            data_collection_permissions: { required: ["none"] },
          },
        } }
      : {}),
  }),
});
