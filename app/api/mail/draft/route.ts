import { env } from "cloudflare:workers";
import { ensureFeishuSession } from "../../auth/feishu/_shared";
import { ensureMailTables, errorResponse, getMailDb, MailApiError } from "../_shared";
import { buildReplyPrompt, fallbackReply, type PromptMessage, type ReplyOptions } from "../../../../lib/reply-prompt";

export const dynamic = "force-dynamic";

type ThreadRow = {
  direction: "inbound" | "outbound" | "unknown";
  subject: string;
  sent_at: number | null;
  body_text: string | null;
  snippet: string | null;
};

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await ensureFeishuSession(request);
    if (!auth) {
      throw new MailApiError(401, "飞书授权已过期，请重新连接。");
    }
    const input = await request.json() as Partial<ReplyOptions>;
    const options = validateOptions(input);
    const db = getMailDb();
    await ensureMailTables(db);
    const rows = await db.prepare(`
      SELECT direction, subject, sent_at, body_text, snippet
      FROM email_messages
      WHERE lower(COALESCE(sender_email, '')) = ?
         OR lower(COALESCE(recipients_json, '')) LIKE ?
      ORDER BY COALESCE(sent_at, imported_at) ASC
      LIMIT 80
    `).bind(options.creatorEmail, `%${options.creatorEmail}%`).all<ThreadRow>();
    const messages: PromptMessage[] = rows.results.map((row) => ({
      direction: row.direction,
      subject: row.subject,
      sentAt: row.sent_at,
      bodyText: row.body_text || row.snippet || "",
    }));
    const prompt = buildReplyPrompt(options, messages);
    let reply = "";
    let provider: "workers-ai" | "fallback" = "workers-ai";
    try {
      const result: unknown = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          { role: "system", content: "You write accurate, natural creator-collaboration emails and follow all constraints." },
          { role: "user", content: prompt },
        ],
        max_tokens: options.length === "detailed" ? 420 : options.length === "short" ? 220 : 320,
        temperature: 0.55,
      });
      reply = extractReply(result);
      if (!reply) throw new Error("Empty AI response");
    } catch (error) {
      provider = "fallback";
      reply = fallbackReply(options, messages);
      console.error(JSON.stringify({ event: "reply_generation_fallback", reason: error instanceof Error ? error.message : "unknown" }));
    }
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (auth.setCookie) headers.set("Set-Cookie", auth.setCookie);
    return Response.json({ reply, prompt, provider }, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

function validateOptions(input: Partial<ReplyOptions>): ReplyOptions {
  const creatorEmail = input.creatorEmail?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(creatorEmail)) {
    throw new MailApiError(400, "缺少有效的红人邮箱地址。");
  }
  const tone = ["warm", "professional", "friendly", "firm"].includes(input.tone ?? "") ? input.tone! : "warm";
  const emotion = ["enthusiastic", "balanced", "restrained"].includes(input.emotion ?? "") ? input.emotion! : "balanced";
  const length = ["short", "standard", "detailed"].includes(input.length ?? "") ? input.length! : "standard";
  const language = input.language === "Spanish" ? "Spanish" : "English";
  return {
    creatorName: input.creatorName?.trim().slice(0, 120) || creatorEmail.split("@")[0],
    creatorEmail,
    category: input.category?.trim().slice(0, 80) || "Unclassified",
    emailStage: input.emailStage?.trim().slice(0, 120) || "Needs review",
    tableStage: input.tableStage?.trim().slice(0, 120) || null,
    scenario: input.scenario?.trim().slice(0, 160) || "Contextual reply",
    tone: tone as ReplyOptions["tone"],
    emotion: emotion as ReplyOptions["emotion"],
    length: length as ReplyOptions["length"],
    language,
  };
}

function extractReply(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.response === "string") return record.response.trim();
  if (typeof record.result === "string") return record.result.trim();
  return "";
}
