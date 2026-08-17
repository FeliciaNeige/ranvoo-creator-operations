import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCreatorThreads } from "../lib/creator-analysis.ts";

const day = 86_400_000;
const now = Date.UTC(2026, 6, 31, 4);

test("merges every thread from the same creator email and uses the latest message", () => {
  const result = analyzeCreatorThreads(
    [
      {
        messageId: "out-1",
        threadId: "thread-a",
        subject: "💸💸💸【Collab Invitation】: Paid UGC Collab with RANVOO",
        senderEmail: "felicia@ranvoo.com",
        recipients: [{ email: "creator@example.com" }],
        sentAt: now - 4 * day,
        bodyText: "Would you be interested?",
        direction: "outbound",
      },
      {
        messageId: "in-1",
        threadId: "thread-b",
        subject: "Re: Paid UGC Collab with RANVOO",
        senderName: "Maya",
        senderEmail: "CREATOR@example.com",
        recipients: [{ email: "felicia@ranvoo.com" }],
        sentAt: now - day,
        bodyText: "The details work for me. Let's move forward.",
        direction: "inbound",
      },
    ],
    now,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].email, "creator@example.com");
  assert.equal(result[0].messageCount, 2);
  assert.equal(result[0].threadCount, 2);
  assert.equal(result[0].stage, "Collaboration Agreed");
  assert.equal(result[0].transferEligible, true);
});

test("marks a creator for follow-up after three full days", () => {
  const [result] = analyzeCreatorThreads(
    [
      {
        messageId: "out-2",
        subject: "【RANVOO Collab】Next-gen Electric Toothbrush",
        recipients: [{ email: "dentist@example.com" }],
        sentAt: now - 3 * day,
        bodyText: "Could you share your thoughts?",
        direction: "outbound",
      },
    ],
    now,
  );
  assert.equal(result.urgency, "需要跟进");
  assert.equal(result.silenceDays, 3);
});

test("marks thirty days without a reply as a termination candidate", () => {
  const [result] = analyzeCreatorThreads(
    [
      {
        messageId: "out-3",
        subject: "Paid Instagram Collab with RANVOO",
        recipients: [{ email: "creator2@example.com" }],
        sentAt: now - 31 * day,
        bodyText: "Following up with one more option.",
        direction: "outbound",
      },
    ],
    now,
  );
  assert.equal(result.stage, "Termination Candidate");
  assert.equal(result.urgency, "终止候选");
});

test("commercial subject wins over dental words quoted in the email body", () => {
  const [result] = analyzeCreatorThreads(
    [
      {
        messageId: "commercial-1",
        subject: "Re: 💸💸💸【Collab Invitation】: Helping Moms Make Self-Care Easier 🤍",
        senderName: "Tany",
        senderEmail: "mom@example.com",
        recipients: [{ email: "felicia@ranvoo.com" }],
        sentAt: now,
        bodyText: "As a mom, I care about dental health and may ask my dentist for advice.",
        direction: "inbound",
      },
    ],
    now,
  );
  assert.equal(result.category, "商业化红人");
  assert.equal(result.categoryLabel, "商业化红人");
  assert.equal(result.sourceTable, "牙刷红人👖");
});
