import { browser } from "wxt/browser";

export interface PageContext {
  title: string;
  url: string;
  text: string;
  selection?: string;
  truncated?: boolean;
}

export const MAX_PAGE_CHARS = 120_000;

/** Runs inside the page. Must be self-contained (it is serialized into the tab). */
function extract(max: number) {
  const pick =
    document.querySelector("article") ??
    document.querySelector("main") ??
    document.querySelector("[role=main]") ??
    document.body;
  const raw = ((pick as HTMLElement | null)?.innerText ?? document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim();
  return {
    title: document.title,
    url: location.href,
    text: raw.slice(0, max),
    truncated: raw.length > max,
    selection: String(window.getSelection() ?? "").trim() || undefined,
  };
}

/**
 * Ask for permission to read pages. Call this FIRST inside a click handler (before any await),
 * because browsers only allow permission prompts during a user gesture.
 */
export function requestPageAccess(): Promise<boolean> {
  return browser.permissions.request({ origins: ["<all_urls>"] });
}

export function hasPageAccess(): Promise<boolean> {
  return browser.permissions.contains({ origins: ["<all_urls>"] });
}

export async function readTab(tabId: number): Promise<PageContext> {
  const [res] = await browser.scripting.executeScript({ target: { tabId }, func: extract, args: [MAX_PAGE_CHARS] });
  if (!res?.result) throw new Error("Couldn't read this page.");
  return res.result as PageContext;
}

export async function readActivePage(): Promise<PageContext> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^(https?|file):/.test(tab.url)) {
    throw new Error("This page can't be read (browser pages and add-on stores are off-limits to extensions).");
  }
  return readTab(tab.id);
}
