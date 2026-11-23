import { defineBackground } from "wxt/utils/define-background";
import { browser, type Browser } from "wxt/browser";
import { readTab } from "@/lib/page";
import { PENDING_KEY, type PendingAction } from "@/lib/pending";
import type { Attachment } from "@/lib/chats";

const isFirefox = import.meta.env.FIREFOX;
// Firefox-only API, missing from Chrome's typings.
const sidebarAction = (browser as unknown as { sidebarAction?: { toggle(): Promise<void>; open(): Promise<void> } }).sidebarAction;

const MENU = {
  explain: "aisidebar-explain",
  ask: "aisidebar-ask",
  summarize: "aisidebar-summarize",
} as const;

/** Must be called synchronously from a user gesture (click / menu) to be allowed. */
function openSidebar(tab?: Browser.tabs.Tab) {
  if (isFirefox) return sidebarAction?.open();
  if (tab?.windowId !== undefined) return browser.sidePanel.open({ windowId: tab.windowId });
}

export default defineBackground(() => {
  if (isFirefox) {
    browser.action.onClicked.addListener(() => {
      sidebarAction?.toggle();
    });
  } else {
    browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  }

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: MENU.explain, title: "Explain “%s”", contexts: ["selection"] });
      browser.contextMenus.create({ id: MENU.ask, title: "Ask AI Sidebar about “%s”", contexts: ["selection"] });
      browser.contextMenus.create({ id: MENU.summarize, title: "Summarize this page", contexts: ["page"] });
    });
    // First run: open settings so the companion can be paired.
    browser.storage.local.get("settings").then((r) => {
      if (!r.settings) browser.runtime.openOptionsPage();
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    // Open first, while we still have the user gesture.
    openSidebar(tab);
    void (async () => {
      const attachments: Attachment[] = [];
      let action: PendingAction;
      if (info.menuItemId === MENU.summarize) {
        if (!tab?.id) return;
        try {
          const page = await readTab(tab.id); // allowed via activeTab
          attachments.push({ kind: "page", title: page.title, url: page.url, text: page.text, truncated: page.truncated });
        } catch (e) {
          console.warn("Could not read page", e);
          return;
        }
        action = { id: crypto.randomUUID(), mode: "send", text: "Summarize this page.", attachments, createdAt: Date.now() };
      } else {
        const sel = (info.selectionText ?? "").trim();
        if (!sel) return;
        attachments.push({ kind: "selection", text: sel, url: tab?.url, title: tab?.title });
        action =
          info.menuItemId === MENU.explain
            ? { id: crypto.randomUUID(), mode: "send", text: "Explain this in plain English.", attachments, createdAt: Date.now() }
            : { id: crypto.randomUUID(), mode: "ask", attachments, createdAt: Date.now() };
      }
      await browser.storage.local.set({ [PENDING_KEY]: action });
    })();
  });
});
