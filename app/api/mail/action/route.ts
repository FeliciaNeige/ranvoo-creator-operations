import { ensureMailTables, errorResponse, getMailDb, MailApiError } from "../_shared";
import { ensureFeishuSession } from "../../auth/feishu/_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await ensureFeishuSession(request);
    if (!auth) {
      throw new MailApiError(401, "飞书授权已过期，请重新连接。");
    }
    const body = await request.json() as {
      messageIds?: string[];
      action?: "archive" | "trash" | "restore";
      confirmed?: boolean;
    };
    if (!body.confirmed) throw new MailApiError(400, "归档或移入垃圾箱前必须确认。");
    const ids = [...new Set(body.messageIds?.filter(Boolean) ?? [])].slice(0, 300);
    if (!ids.length) throw new MailApiError(400, "没有选择邮件。");
    if (!body.action || !["archive", "trash", "restore"].includes(body.action)) {
      throw new MailApiError(400, "不支持的邮件操作。");
    }
    const db = getMailDb();
    await ensureMailTables(db);
    const status = body.action === "restore" ? "active" : body.action;
    const now = Date.now();
    const statements = ids.map((id) => db.prepare(`
      UPDATE email_messages
      SET review_status = ?, reviewed_at = ?, updated_at = ?
      WHERE message_id = ?
    `).bind(status, status === "active" ? null : now, now, id));
    await db.batch(statements);
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (auth.setCookie) headers.set("Set-Cookie", auth.setCookie);
    return Response.json({ ok: true, affected: ids.length, status }, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
