import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMailEml,
  htmlToPlainText,
  sanitizeMailHtml,
} from "../lib/mail-compose.ts";
import { extractFeishuDraftId } from "../lib/feishu-mail.ts";

test("mail html keeps supported formatting and removes unsafe content", () => {
  const html = sanitizeMailHtml(
    '<p onclick="steal()"><strong>Hello</strong> <mark>there</mark> ' +
      '<a href="javascript:alert(1)">bad</a><script>alert(1)</script></p>',
  );
  assert.match(html, /<strong>Hello<\/strong>/);
  assert.match(html, /<mark>there<\/mark>/);
  assert.doesNotMatch(html, /onclick|javascript:|script/i);
});

test("mail html converts to readable plain text fallback", () => {
  assert.equal(
    htmlToPlainText("<p>Hello</p><ul><li>First</li><li>Second</li></ul>"),
    "Hello\n• First\n• Second",
  );
});

test("EML includes rich and plain alternatives plus reply headers", () => {
  const eml = buildMailEml({
    from: "felicia@ranvoo.com",
    to: "creator@example.com",
    subject: "Re: 合作",
    html: "<p><strong>Hello</strong></p>",
    plainText: "Hello",
    sourceMessageId: "lark-message-id",
    smtpMessageId: "<smtp@example.com>",
    references: "<older@example.com>",
  });
  assert.match(eml, /Content-Type: multipart\/alternative/);
  assert.match(eml, /Content-Type: text\/html; charset=UTF-8/);
  assert.match(eml, /In-Reply-To: <smtp@example\.com>/);
  assert.match(eml, /X-LMS-Reply-To-Message-Id: lark-message-id/);
  assert.doesNotMatch(eml, /\r/);
});

test("Feishu draft id parser accepts current and legacy response shapes", () => {
  assert.equal(extractFeishuDraftId({ draft_id: "draft-one" }), "draft-one");
  assert.equal(extractFeishuDraftId({ id: "draft-two" }), "draft-two");
  assert.equal(
    extractFeishuDraftId({ draft: { draft_id: "draft-three" } }),
    "draft-three",
  );
  assert.equal(
    extractFeishuDraftId({ draft: { id: "draft-four" } }),
    "draft-four",
  );
  assert.equal(extractFeishuDraftId({ message_id: "not-a-draft" }), "");
});
