// No React here: the background script imports this.

/** A one-click prompt, shown on the home screen and in the right-click menu. */
export interface QuickAction {
  id: string;
  title: string;
  prompt: string;
  /** "selection": works on highlighted text. "page": works on the whole page. */
  context: "selection" | "page";
}

export const DEFAULT_ACTIONS: QuickAction[] = [
  { id: "summarize", title: "Summarize this page", prompt: "Summarize this page.", context: "page" },
  { id: "takeaways", title: "Key takeaways", prompt: "List the key takeaways from this page as short bullet points.", context: "page" },
  { id: "explain", title: "Explain", prompt: "Explain this in plain English.", context: "selection" },
  { id: "translate", title: "Translate to English", prompt: "Translate this into English.", context: "selection" },
  { id: "reply", title: "Draft a reply", prompt: "Draft a short, friendly reply to this.", context: "selection" },
];
