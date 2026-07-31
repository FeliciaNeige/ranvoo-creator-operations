import {
  ensureMailTables,
  errorResponse,
  getMailDb,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
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
    const query = search
      ? db
          .prepare(`
            SELECT
              message_id, thread_id, folder_id, folder_name, subject, sender_name, sender_email,
              recipients_json, sent_at, snippet, body_text, direction
            FROM email_messages
            WHERE subject LIKE ? ESCAPE '\\'
               OR sender_name LIKE ? ESCAPE '\\'
               OR sender_email LIKE ? ESCAPE '\\'
               OR body_text LIKE ? ESCAPE '\\'
            ORDER BY COALESCE(sent_at, imported_at) DESC
            LIMIT ? OFFSET ?
          `)
          .bind(pattern, pattern, pattern, pattern, limit, offset)
      : db
          .prepare(`
            SELECT
              message_id, thread_id, folder_id, folder_name, subject, sender_name, sender_email,
              recipients_json, sent_at, snippet, body_text, direction
            FROM email_messages
            ORDER BY COALESCE(sent_at, imported_at) DESC
            LIMIT ? OFFSET ?
          `)
          .bind(limit, offset);
    const countQuery = search
      ? db
          .prepare(`
            SELECT COUNT(*) AS count
            FROM email_messages
            WHERE subject LIKE ? ESCAPE '\\'
               OR sender_name LIKE ? ESCAPE '\\'
               OR sender_email LIKE ? ESCAPE '\\'
               OR body_text LIKE ? ESCAPE '\\'
          `)
          .bind(pattern, pattern, pattern, pattern)
      : db.prepare("SELECT COUNT(*) AS count FROM email_messages");
    const [messages, state, total] = await Promise.all([
      query.all(),
      db
        .prepare(
          "SELECT total_imported, last_synced_at, status, last_error, page_token, folder_index, folder_id, folder_name, folders_total, folders_completed FROM mail_sync_state WHERE mailbox_id = 'me'",
        )
        .first(),
      countQuery.first<{ count: number }>(),
    ]);
    return Response.json(
      {
        items: messages.results.map((row) => ({
          ...row,
          recipients: safeJson(row.recipients_json as string, []),
          recipients_json: undefined,
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
      { headers: { "Cache-Control": "no-store" } },
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
