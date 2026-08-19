import {
  MailApiError,
  createAuthorizedMailClient,
  errorResponse,
} from "../_shared";
import {
  buildMailEml,
  htmlToPlainText,
  sanitizeMailHtml,
  toBase64Url,
} from "../../../../lib/mail-compose";
import { extractFeishuDraftId } from "../../../../lib/feishu-mail";

export const dynamic = "force-dynamic";

type FeishuRecord = Record<string, unknown>;

export async function POST(request: Request): Promise<Response> {
  let setCookie: string | undefined;
  try {
    const body = (await request.json()) as {
      to?: string;
      subject?: string;
      html?: string;
      plainText?: string;
      sourceMessageId?: string;
      sendAt?: number;
      confirmed?: boolean;
    };
    const to = (body.to ?? "").trim().toLowerCase();
    const subject = (body.subject ?? "").replace(/[\r\n]+/g, " ").trim();
    const html = sanitizeMailHtml(body.html ?? "");
    const plainText = (body.plainText ?? htmlToPlainText(html)).trim();
    if (!body.confirmed) throw new MailApiError(400, "发送前必须确认收件人、主题和正文。");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new MailApiError(400, "收件人邮箱格式不正确。");
    if (!subject) throw new MailApiError(400, "邮件主题不能为空。");
    if (!plainText || !html) throw new MailApiError(400, "邮件正文不能为空。");
    if (subject.length > 500 || html.length > 500_000) throw new MailApiError(400, "邮件内容过长，请缩短后再发送。");

    const sendAt = body.sendAt ? Number(body.sendAt) : undefined;
    if (sendAt && (!Number.isFinite(sendAt) || sendAt < Date.now() + 5 * 60_000)) {
      throw new MailApiError(400, "定时发送时间至少需要晚于当前时间5分钟。");
    }

    const mailClient = await createAuthorizedMailClient(request);
    setCookie = mailClient.setCookie;
    const profile = await mailClient.request<FeishuRecord>(
      "/mail/v1/user_mailboxes/me/profile",
    );
    const from = findEmail(profile.data);
    if (!from) throw new MailApiError(502, "无法读取当前飞书邮箱地址，请重新授权后再试。");

    let smtpMessageId = "";
    let references = "";
    if (body.sourceMessageId) {
      const original = await mailClient.request<FeishuRecord>(
        `/mail/v1/user_mailboxes/me/messages/${encodeURIComponent(body.sourceMessageId)}?format=plain_text_full`,
      );
      const record = asRecord(original.data.message) ?? original.data;
      smtpMessageId = stringValue(record.smtp_message_id);
      references = Array.isArray(record.references)
        ? record.references.map(String).join(" ")
        : stringValue(record.references);
    }

    const raw = toBase64Url(buildMailEml({
      from,
      to,
      subject,
      html,
      plainText,
      sourceMessageId: body.sourceMessageId,
      smtpMessageId,
      references,
    }));
    const created = await mailClient.request<FeishuRecord>(
      "/mail/v1/user_mailboxes/me/drafts",
      { method: "POST", body: { raw } },
    );
    const draftId = extractFeishuDraftId(created.data);
    if (!draftId) throw new MailApiError(502, "飞书草稿已创建，但未返回草稿编号；为避免重复发送，操作已停止。");

    const sent = await mailClient.request<FeishuRecord>(
      `/mail/v1/user_mailboxes/me/drafts/${encodeURIComponent(draftId)}/send`,
      {
        method: "POST",
        body: sendAt ? { send_time: String(Math.floor(sendAt / 1000)) } : {},
      },
    );
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (setCookie) headers.set("Set-Cookie", setCookie);
    return Response.json(
      {
        ok: true,
        scheduled: Boolean(sendAt),
        sendAt: sendAt ?? null,
        draftId,
        messageId: stringValue(sent.data.message_id) || null,
        threadId: stringValue(sent.data.thread_id) || null,
      },
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function findEmail(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "";
  for (const key of ["primary_email_address", "mail_address", "email", "primary_email"]) {
    const candidate = stringValue(record[key]);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return candidate;
  }
  for (const nested of Object.values(record)) {
    const candidate = findEmail(nested);
    if (candidate) return candidate;
  }
  return "";
}

function asRecord(value: unknown): FeishuRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as FeishuRecord
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
