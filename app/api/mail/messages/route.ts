import {
  ensureMailTables,
  errorResponse,
  getMailDb,
  MailApiError,
} from "../_shared";
import { ensureFeishuSession } from "../../auth/feishu/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await ensureFeishuSession(request);
    if (!auth) throw new MailApiError(401, "飞书授权已过期，请重新连接。");
    const db = getMailDb();
    await ensureMailTables(db);
    const url = new URL(request.url);
    const search = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
    );
    const rawOffset = Number(url.searchParams.get("offset") ?? 0);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;
    const pattern = `%${search.replace(/[%_]/g, "\\$&")}%`;
    const counterparty = `CASE
      WHEN direction = 'outbound'
        THEN lower(COALESCE(json_extract(recipients_json, '$[0].email'), ''))
      ELSE lower(COALESCE(sender_email, ''))
    END`;
    const query = search
      ? db.prepare(`
          WITH matched_accounts AS (
            SELECT DISTINCT ${counterparty} AS counterparty_email
            FROM email_messages
            WHERE review_status = 'active' AND (
                 subject LIKE ? ESCAPE '\\'
              OR sender_name LIKE ? ESCAPE '\\'
              OR sender_email LIKE ? ESCAPE '\\'
              OR body_text LIKE ? ESCAPE '\\'
            )
          ), ranked AS (
            SELECT
              message_id, thread_id, folder_id, folder_name, subject, sender_name, sender_email,
              recipients_json, sent_at, snippet, body_text, direction,
              ${counterparty} AS counterparty_email,
              COUNT(*) OVER (PARTITION BY ${counterparty}) AS message_count,
              ROW_NUMBER() OVER (
                PARTITION BY ${counterparty}
                ORDER BY COALESCE(sent_at, imported_at) DESC
              ) AS row_number
            FROM email_messages
            WHERE review_status = 'active' AND ${counterparty} != ''
          )
          SELECT * FROM ranked
          WHERE row_number = 1
            AND counterparty_email IN (SELECT counterparty_email FROM matched_accounts)
          ORDER BY COALESCE(sent_at, 0) DESC
          LIMIT ? OFFSET ?
        `).bind(pattern, pattern, pattern, pattern, limit, offset)
      : db.prepare(`
          WITH ranked AS (
            SELECT
              message_id, thread_id, folder_id, folder_name, subject, sender_name, sender_email,
              recipients_json, sent_at, snippet, body_text, direction,
              ${counterparty} AS counterparty_email,
              COUNT(*) OVER (PARTITION BY ${counterparty}) AS message_count,
              ROW_NUMBER() OVER (
                PARTITION BY ${counterparty}
                ORDER BY COALESCE(sent_at, imported_at) DESC
              ) AS row_number
            FROM email_messages
            WHERE review_status = 'active' AND ${counterparty} != ''
          )
          SELECT * FROM ranked
          WHERE row_number = 1
          ORDER BY COALESCE(sent_at, 0) DESC
          LIMIT ? OFFSET ?
        `).bind(limit, offset);
    const countQuery = search
      ? db.prepare(`
          SELECT COUNT(DISTINCT ${counterparty}) AS count
          FROM email_messages
          WHERE review_status = 'active' AND ${counterparty} != '' AND (
               subject LIKE ? ESCAPE '\\'
            OR sender_name LIKE ? ESCAPE '\\'
            OR sender_email LIKE ? ESCAPE '\\'
            OR body_text LIKE ? ESCAPE '\\'
          )
        `).bind(pattern, pattern, pattern, pattern)
      : db.prepare(`
          SELECT COUNT(DISTINCT ${counterparty}) AS count
          FROM email_messages
          WHERE review_status = 'active' AND ${counterparty} != ''
        `);
    const [messages, state, total] = await Promise.all([
      query.all(),
      db
        .prepare(
          "SELECT total_imported, last_synced_at, status, last_error, page_token, folder_index, folder_id, folder_name, folders_total, folders_completed FROM mail_sync_state WHERE mailbox_id = 'me'",
        )
        .first(),
      countQuery.first<{ count: number }>(),
    ]);
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (auth.setCookie) headers.set("Set-Cookie", auth.setCookie);
    return Response.json(
      {
        items: messages.results.map((row) => ({
          message_id: row.message_id,
          thread_id: row.thread_id,
          folder_id: row.folder_id,
          folder_name: row.folder_name,
          subject: row.subject,
          sender_name: row.sender_name,
          sender_email: row.sender_email,
          sent_at: row.sent_at,
          snippet: row.snippet,
          direction: row.direction,
          counterparty_email: row.counterparty_email,
          message_count: row.message_count,
          recipients: safeJson(row.recipients_json as string, []),
          body_text:
            typeof row.body_text === "string"
              ? row.body_text.slice(0, 5000)
              : null,
        })),
        total: total?.count ?? 0,
        sync: state ?? {
          total_imported: 0,
          last_synced_at: null,
          status: "idle",
          last_error: null,
          page_token: null,
        },
      },
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
