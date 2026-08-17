export type ReplyOptions = {
  creatorName: string;
  creatorEmail: string;
  category: string;
  emailStage: string;
  tableStage?: string | null;
  scenario: string;
  tone: "warm" | "professional" | "friendly" | "firm";
  emotion: "enthusiastic" | "balanced" | "restrained";
  length: "short" | "standard" | "detailed";
  language: "English" | "Spanish";
};

export type PromptMessage = {
  direction: "inbound" | "outbound" | "unknown";
  subject: string;
  sentAt: number | null;
  bodyText: string;
};

const toneLabels = {
  warm: "warm, encouraging, and empathetic",
  professional: "professional, natural, and confident",
  friendly: "friendly, conversational, and relaxed",
  firm: "clear, respectfully firm, and action-oriented",
};

const emotionLabels = {
  enthusiastic: "show genuine enthusiasm with expressive but credible emotion",
  balanced: "show moderate warmth and positive emotion without overdoing it",
  restrained: "keep emotion subtle, calm, and businesslike",
};

const lengthLabels = {
  short: "60-90 words",
  standard: "100-150 words",
  detailed: "160-220 words",
};

export function buildReplyPrompt(options: ReplyOptions, messages: PromptMessage[]): string {
  const recent = messages.slice(-8).map((message, index) => {
    const speaker = message.direction === "inbound" ? "Creator" : "RANVOO";
    return `[${index + 1}] ${speaker} | ${message.subject}\n${clip(message.bodyText, 1800)}`;
  }).join("\n\n");
  const tableInstruction = options.tableStage
    ? `The Feishu master table status is "${options.tableStage}". Treat it as the operational source of truth. If the newest email suggests a different stage, do not silently assume the change; write a reply that fits the confirmed table status and avoids inventing commitments.`
    : "No confirmed Feishu master-table status is available. Stay conservative and do not invent commitments.";

  return `You are Felicia Zhao, creator marketing manager at RANVOO. Draft one reply email to ${options.creatorName} (${options.creatorEmail}).

Collaboration category: ${options.category}
Email-derived stage: ${options.emailStage}
Message-library scenario: ${options.scenario}
${tableInstruction}

Writing controls:
- Language: ${options.language}
- Tone: ${toneLabels[options.tone]}
- Emotion: ${emotionLabels[options.emotion]}
- Target length: ${lengthLabels[options.length]}
- Natural US-brand language; warm, direct, and specific.
- Respond to the creator's latest meaningful message and preserve continuity.
- Do not invent price, deliverables, usage rights, dates, shipping status, links, codes, product claims, or approvals.
- If a fact is missing, ask one concise question or use a neutral placeholder in square brackets.
- If following up after silence, add a new useful angle or easier next step instead of repeating the old wording.
- Return only the email body. Start with a greeting and end with "Best,\nFelicia". No subject line, notes, markdown, or explanation.

Recent thread (oldest to newest):
${recent || "No readable thread content was found."}`;
}

export function fallbackReply(options: ReplyOptions, messages: PromptMessage[]): string {
  const firstName = options.creatorName.trim().split(/\s+/)[0] || "there";
  const latest = [...messages].reverse().find((message) => message.direction === "inbound");
  const context = clip(latest?.bodyText.replace(/\s+/g, " ").trim() ?? "", 180);
  const warmth = options.emotion === "enthusiastic"
    ? "We’re genuinely excited to keep this moving."
    : options.emotion === "restrained"
      ? "Thank you for the update."
      : "Thanks so much for the update.";
  const next = /draft|review/i.test(options.emailStage)
    ? "We’ll review the latest draft against the agreed brief and send you clear, consolidated feedback."
    : /awaiting|follow/i.test(`${options.emailStage} ${options.scenario}`)
      ? "Would you be open to sharing a quick update, or letting me know if there’s anything you need from our side?"
      : "Please let me know the best next step from your side, and I’ll make sure we keep everything straightforward."
  const reference = context ? `I’ve noted your latest message about “${context}”. ` : "";
  return `Hi ${firstName},\n\n${warmth} ${reference}${next}\n\nBest,\nFelicia`;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
