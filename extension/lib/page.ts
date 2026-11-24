import { browser, type Browser } from "wxt/browser";
import { hashText } from "./prompt";
import type { Attachment } from "./chats";

export interface PageContext {
  title: string;
  url: string;
  text: string;
  selection?: string;
  truncated?: boolean;
  /** Where special text came from, e.g. "Google Docs export" or "YouTube transcript". */
  source?: string;
}

export const MAX_PAGE_CHARS = 120_000;

/**
 * Runs inside the page, so it must be self-contained (it is serialized into the tab).
 * Picks the readable part of the page and leaves out menus, sidebars, footers and cookie banners.
 * Google Docs/Sheets/Slides and YouTube get special handling, since their text isn't in the page.
 */
async function extract(max: number) {
  const selection = String(window.getSelection() ?? "").trim() || undefined;
  const result = (raw: string, source?: string) => {
    const text = raw.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return { title: document.title, url: location.href, text: text.slice(0, max), truncated: text.length > max, selection, source };
  };
  const host = location.hostname;
  const path = location.pathname;

  // Google Docs, Sheets and Slides draw on a canvas. Ask Google for a plain-text export, using your own session.
  const g = host === "docs.google.com" ? path.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/) : null;
  if (g) {
    const [, kind, id] = g;
    const gid = new URLSearchParams(location.hash.slice(1)).get("gid") ?? new URLSearchParams(location.search).get("gid");
    const url =
      kind === "document"
        ? `/document/d/${id}/export?format=txt`
        : kind === "spreadsheets"
          ? `/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${encodeURIComponent(gid)}` : ""}`
          : `/presentation/d/${id}/export/txt`;
    try {
      const r = await fetch(url, { credentials: "include" });
      const t = r.ok ? await r.text() : "";
      if (t.trim() && !/^\s*<!doctype html/i.test(t)) {
        return result(t, kind === "document" ? "Google Docs export" : kind === "spreadsheets" ? "Google Sheets export (this tab)" : "Google Slides export");
      }
    } catch {
      // fall through to the page text
    }
  }

  // YouTube: title, description and, when available, the transcript.
  if (/(^|\.)youtube\.com$/.test(host) && path === "/watch") {
    const desc = (document.querySelector("#description-inline-expander, #description") as HTMLElement | null)?.innerText ?? "";
    let transcript = "";
    try {
      const html = await (await fetch(location.href, { credentials: "include" })).text();
      const m = html.match(/"captionTracks":(\[.*?\])/);
      const tracks = m ? (JSON.parse(m[1]!) as { baseUrl: string; languageCode: string; kind?: string }[]) : [];
      const lang = (navigator.language || "en").slice(0, 2);
      const track =
        tracks.find((t) => t.languageCode.startsWith(lang) && t.kind !== "asr") ??
        tracks.find((t) => t.languageCode.startsWith(lang)) ??
        tracks[0];
      if (track) {
        const r = await fetch(track.baseUrl + "&fmt=json3", { credentials: "include" });
        const body = r.ok ? await r.text() : "";
        if (body) {
          const events = (JSON.parse(body).events ?? []) as { tStartMs?: number; segs?: { utf8: string }[] }[];
          transcript = events
            .filter((e) => e.segs)
            .map((e) => {
              const s = Math.floor((e.tStartMs ?? 0) / 1000);
              return `[${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}] ${e.segs!.map((x) => x.utf8).join("").trim()}`;
            })
            .filter((l) => !/\]\s*$/.test(l))
            .join("\n");
        }
      }
    } catch {
      // captions unavailable
    }
    if (!transcript) {
      // The transcript panel, if it's open.
      transcript = Array.from(document.querySelectorAll("ytd-transcript-segment-renderer"))
        .map((el) => (el as HTMLElement).innerText.replace(/\s*\n\s*/, " ").trim())
        .join("\n");
    }
    const parts = [`Video: ${document.title.replace(/ - YouTube$/, "")}`, desc && `Description:\n${desc}`];
    parts.push(
      transcript
        ? `Transcript:\n${transcript}`
        : "(No transcript could be read. If the video has one, open it with “Show transcript” under the description and try again.)",
    );
    return result(parts.filter(Boolean).join("\n\n"), transcript ? "YouTube transcript" : "YouTube page");
  }

  // Regular pages: the main content area, or the block with the most paragraph text.
  let root = (document.querySelector("article") ?? document.querySelector("main") ?? document.querySelector("[role=main]")) as HTMLElement | null;
  if (!root) {
    const score = new Map<HTMLElement, number>();
    document.querySelectorAll("p").forEach((p) => {
      const n = (p.textContent ?? "").trim().length;
      if (n < 40) return;
      const parent = p.parentElement;
      if (parent) score.set(parent, (score.get(parent) ?? 0) + n);
      const grand = parent?.parentElement;
      if (grand) score.set(grand, (score.get(grand) ?? 0) + n / 2);
    });
    let best: [HTMLElement | null, number] = [null, 0];
    score.forEach((v, el) => {
      if (v > best[1]) best = [el, v];
    });
    if (best[1] > 500) root = best[0];
  }
  let text = root?.innerText ?? "";
  if (text.trim().length < 200) {
    root = document.body;
    text = document.body?.innerText ?? "";
  }
  // Drop boilerplate inside the chosen area (menus, sidebars, footers, cookie banners).
  root
    ?.querySelectorAll(
      "nav, aside, footer, [role=navigation], [role=complementary], [role=contentinfo], [aria-hidden=true], [class*=cookie], [id*=cookie], [class*=newsletter]",
    )
    .forEach((el) => {
      const t = (el as HTMLElement).innerText?.trim();
      if (t && t.length < text.length / 2) text = text.replace(t, "");
    });
  return result(text);
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

const READABLE = /^(https?|file):/;
export const UNREADABLE_MESSAGE = "This page can't be read (browser pages and add-on stores are off-limits to extensions).";

export async function readTab(tabId: number): Promise<PageContext> {
  const [res] = await browser.scripting.executeScript({ target: { tabId }, func: extract, args: [MAX_PAGE_CHARS] });
  const page = res?.result as PageContext | undefined;
  if (!page) throw new Error("Couldn't read this page.");
  if (!page.text) throw new Error("This page has no readable text (it may be a PDF or an image). Try a screenshot instead.");
  return page;
}

export async function activeTab(): Promise<Browser.tabs.Tab | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function readActivePage(): Promise<PageContext> {
  const tab = await activeTab();
  if (!tab?.id || !tab.url || !READABLE.test(tab.url)) throw new Error(UNREADABLE_MESSAGE);
  return readTab(tab.id);
}

/** Other tabs in this window that can be attached. */
export async function readableTabs(): Promise<Browser.tabs.Tab[]> {
  const tabs = await browser.tabs.query({ currentWindow: true });
  return tabs.filter((t) => t.id !== undefined && t.url && READABLE.test(t.url));
}

export function pageAttachment(page: PageContext): Attachment {
  return {
    kind: "page",
    title: page.title,
    url: page.url,
    text: page.text,
    truncated: page.truncated,
    hash: hashText(`${page.url}\n${page.text}`),
  };
}

/** Screenshot of what's visible in the current tab, scaled down to keep it light. */
export async function captureScreenshot(): Promise<Attachment> {
  const tab = await activeTab();
  if (!tab?.url || !READABLE.test(tab.url)) throw new Error("Screenshots don't work on browser pages and add-on stores.");
  const raw = await browser.tabs.captureVisibleTab(tab.windowId!, { format: "png" });
  return { kind: "image", title: `Screenshot of ${tab.title || tab.url}`, url: tab.url, text: "", dataUrl: await shrinkImage(raw) };
}

/** Downscales an image (data URL or Blob) to at most `max` px on its longest side, as JPEG. */
export async function shrinkImage(src: string | Blob, max = 1600): Promise<string> {
  const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}
