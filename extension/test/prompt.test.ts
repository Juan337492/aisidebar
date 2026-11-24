import { test } from "node:test";
import assert from "node:assert/strict";
import { hashText, markRepeats, renderTranscript, renderTurn, titleFrom } from "../lib/prompt.ts";
import type { Attachment, Message } from "../lib/chats.ts";

const page = (text: string): Attachment => ({ kind: "page", title: "T", url: "https://x/a", text, hash: hashText("https://x/a\n" + text) });
const msg = (role: "user" | "assistant", text: string, extra: Partial<Message> = {}): Message => ({ id: Math.random().toString(), role, text, createdAt: 0, ...extra });

test("renderTurn wraps pages and selections, skips images", () => {
  const out = renderTurn("Q?", [page("body"), { kind: "selection", text: "sel", url: "https://x/a" }, { kind: "image", text: "", dataUrl: "data:image/png;base64,AA" }]);
  assert.equal(out, '<page title="T" url="https://x/a">\nbody\n</page>\n\n<selection url="https://x/a">\nsel\n</selection>\n\nQ?');
});

test("attribute values are escaped", () => {
  assert.match(renderTurn("q", [{ ...page("b"), title: 'a"<b>' }]), /title="a&quot;&lt;b>"/);
});

test("the same unchanged page is only sent once per chat", () => {
  const history = [msg("user", "first", { attachments: [page("body")] }), msg("assistant", "answer")];
  const [again] = markRepeats(history, [page("body")]);
  assert.equal(again!.repeat, true);
  assert.equal(again!.text, "");
  assert.match(renderTurn("q", [again!]), /unchanged="true">\(Same page/);
  // Changed content is sent in full.
  const [changed] = markRepeats(history, [page("new body")]);
  assert.equal(changed!.repeat, undefined);
});

test("a page from a failed turn is sent again", () => {
  const history = [msg("user", "first", { attachments: [page("body")] }), msg("assistant", "", { error: "boom" })];
  assert.equal(markRepeats(history, [page("body")])[0]!.repeat, undefined);
});

test("transcript replays answered turns and notes images", () => {
  const history = [
    msg("user", "look", { attachments: [{ kind: "image", text: "", dataUrl: "x" }] }),
    msg("assistant", "a red square"),
    msg("user", "oops"),
    msg("assistant", "", { error: "failed" }),
  ];
  const t = renderTranscript(history);
  assert.match(t, /^<conversation_so_far>\nUser: look\n\[The user attached an image here; not shown again.\]\n\nAssistant: a red square\n\nUser: oops\n<\/conversation_so_far>/);
  assert.equal(renderTranscript([]), "");
});

test("titleFrom trims long titles", () => {
  assert.equal(titleFrom("  hi   there "), "hi there");
  assert.equal(titleFrom("x".repeat(80)).length, 58);
});
