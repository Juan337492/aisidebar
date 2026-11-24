import { defineBackground } from "wxt/utils/define-background";
import { browser, type Browser } from "wxt/browser";
import { pageAttachment, readTab } from "@/lib/page";
import { DEFAULT_ACTIONS, type QuickAction } from "@/lib/actions";
import { PENDING_KEY, type PendingAction } from "@/lib/pending";
import type { Attachment } from "@/lib/chats";

const isFirefox = import.meta.env.FIREFOX;
// Firefox-only API, missing from Chrome's typings.
const sidebarAction = (browser as unknown as { sidebarAction?: { toggle(): Promise<void>; open(): Promise<void> } }).sidebarAction;

const MENU_ASK = "aisidebar-ask";
const ACTION_PREFIX = "aisidebar-action:";

async function getActions(): Promise<QuickAction[]> {
  const r = await browser.storage.local.get("settings");
  return (r.settings as { actions?: QuickAction[] } | undefined)?.actions ?? DEFAULT_ACTIONS;
}

/** Right-click menu: "Ask AI Sidebar about…" plus your quick actions. Rebuilt when you edit them. */
async function buildMenus() {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({ id: MENU_ASK, title: "Ask AI Sidebar about “%s”", contexts: ["selection"] });
  for (const a of await getActions()) {
    if (!a.prompt.trim()) continue;
    browser.contextMenus.create({
      id: ACTION_PREFIX + a.id,
      title: a.context === "selection" ? `${a.title}: “%s”` : a.title,
      contexts: a.context === "selection" ? ["selection"] : ["page"],
    });
  }
}

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

  browser.storage.onChanged.addListener((changes, area) => {
    const c = changes.settings as { oldValue?: { actions?: unknown }; newValue?: { actions?: unknown } } | undefined;
    if (area === "local" && c && JSON.stringify(c.oldValue?.actions) !== JSON.stringify(c.newValue?.actions)) void buildMenus();
  });

  browser.runtime.onInstalled.addListener(() => {
    void buildMenus();
    // First run: open settings so the companion can be paired.
    browser.storage.local.get("settings").then((r) => {
      if (!r.settings) browser.runtime.openOptionsPage();
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    // Open first, while we still have the user gesture.
    openSidebar(tab);
    void (async () => {
      const id = String(info.menuItemId);
      const sel = (info.selectionText ?? "").trim();
      const now = Date.now();
      let action: PendingAction;
      if (id === MENU_ASK) {
        if (!sel) return;
        action = { id: crypto.randomUUID(), mode: "ask", attachments: [{ kind: "selection", text: sel, url: tab?.url, title: tab?.title }], createdAt: now };
      } else if (id.startsWith(ACTION_PREFIX)) {
        const a = (await getActions()).find((x) => ACTION_PREFIX + x.id === id);
        if (!a) return;
        const attachments: Attachment[] = [];
        if (a.context === "page") {
          if (!tab?.id) return;
          try {
            attachments.push(pageAttachment(await readTab(tab.id))); // allowed via activeTab
          } catch (e) {
            console.warn("Could not read page", e);
            return;
          }
        } else {
          if (!sel) return;
          attachments.push({ kind: "selection", text: sel, url: tab?.url, title: tab?.title });
        }
        action = { id: crypto.randomUUID(), mode: "send", text: a.prompt, attachments, createdAt: now };
      } else return;
      await browser.storage.local.set({ [PENDING_KEY]: action });
    })();
  });
});
