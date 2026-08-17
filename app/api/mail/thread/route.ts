import { ensureMailTables, errorResponse, getMailDb, MailApiError } from "../_shared";
import { ensureFeishuSession } from "../../auth/feishu/_shared";

export const dynamic = "force-dynamic";

type ThreadRow = {
  message_id: string;
  thread_id: string | null;
  folder_id: string | null;
  folder_name: string | null;
  subject: string;
  sender_name: string | null;
  sender_email: string | null;
  recipients_json: string;
  sent_at: number | null;
  snippet: string | null;
  body_text: string | null;
  direction: "inbound" | "outbound" | "unknown";
  review_status: string;
};

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await ensureFeishuSession(request);
    if (!auth) throw new MailApiError(401, "飞书授权已过期，请重新连接。");
    const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new MailApiError(400, "缺少有效的红人邮箱地址。");
    }
    const db = getMailDb();
    await ensureMailTables(db);
    const rows = await db.prepare(`
      SELECT message_id, thread_id, folder_id, folder_name, subject, sender_name,
             sender_email, recipients_json, sent_at, snippet, body_text, direction,
             review_status
      FROM email_messages
      WHERE lower(COALESCE(sender_email, '')) = ?
         OR lower(COALESCE(recipients_json, '')) LIKE ?
      ORDER BY COALESCE(sent_at, imported_at) ASC
      LIMIT 300
    `).bind(email, `%${email.replace(/[%_]/g, "\\$&")}%`).all<ThreadRow>();

    const headers = new Headers({ "Cache-Control": "no-store" });
    if (auth.setCookie) headers.set("Set-Cookie", auth.setCookie);
    return Response.json({
      items: rows.results.map((row) => ({
        ...row,
        recipients: safeJson(row.recipients_json, []),
        recipients_json: undefined,
        body_text: row.body_text?.slice(0, 8000) ?? null,
      })),
    }, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
