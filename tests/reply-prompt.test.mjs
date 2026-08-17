import assert from "node:assert/strict";
import test from "node:test";
import { buildReplyPrompt, fallbackReply } from "../lib/reply-prompt.ts";

const options = {
  creatorName: "Adriana Lee",
  creatorEmail: "adriana@example.com",
  category: "商业化红人",
  emailStage: "Draft Received / Review",
  tableStage: "内容待审核",
  scenario: "内容审核",
  tone: "warm",
  emotion: "balanced",
  length: "standard",
  language: "English",
};

const messages = [{
  direction: "inbound",
  subject: "Re: RANVOO collaboration",
  sentAt: Date.UTC(2026, 7, 17),
  bodyText: "The video draft is ready for your review.",
}];

test("reply prompt treats the Feishu table as source of truth", () => {
  const prompt = buildReplyPrompt(options, messages);
  assert.match(prompt, /Feishu master table status is "内容待审核"/);
  assert.match(prompt, /100-150 words/);
  assert.match(prompt, /The video draft is ready/);
  assert.match(prompt, /Do not invent price/);
});

test("fallback reply remains creator-specific and signed by Felicia", () => {
  const reply = fallbackReply(options, messages);
  assert.match(reply, /^Hi Adriana,/);
  assert.match(reply, /latest draft/i);
  assert.match(reply, /Best,\nFelicia$/);
});
