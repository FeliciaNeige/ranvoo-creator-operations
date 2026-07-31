import { env } from "cloudflare:workers";
import {
  FEISHU_API_BASE,
  ensureFeishuSession,
} from "../auth/feishu/_shared";

type FeishuEnvelope<T> = {
  code?: number;
  msg?: string;
  data?: T;
};

export async function authorizedMailRequest<T>(
  request: Request,
  path: string,
): Promise<{
  data: T;
  setCookie?: string;
}> {
  const auth = await ensureFeishuSession(request);
  if (!auth) throw new MailApiError(401, "飞书授权已过期，请重新连接。");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${FEISHU_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${auth.session.accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
    const body = (await response.json()) as FeishuEnvelope<T>;
    const rateLimited =
      response.status === 429 ||
      /frequency limit|rate limit|too many requests/i.test(body.msg ?? "");
    if (rateLimited && attempt < 4) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
      await delay(
        retryAfter > 0
          ? retryAfter * 1000
          : Math.min(4000, 400 * 2 ** attempt),
      );
      continue;
    }
    if (!response.ok || (typeof body.code === "number" && body.code !== 0)) {
      const message =
        body.code === 1230002
          ? "缺少飞书邮箱读取权限，请发布新版应用后重新授权。"
          : body.msg || "飞书邮箱暂时无法读取。";
      throw new MailApiError(response.status || 502, message, body.code);
    }
    return { data: body.data as T, setCookie: auth.setCookie };
  }
  throw new MailApiError(429, "飞书请求频率过高，请稍后继续同步。");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function getMailDb(): D1Database {
  if (!env.DB) throw new MailApiError(503, "邮件存储尚未完成配置。");
  return env.DB;
}

export class MailApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof MailApiError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return Response.json(
    { error: "同步邮件时发生了意外错误，请稍后重试。" },
    { status: 500 },
  );
}

export async function ensureMailTables(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS email_messages (
        message_id TEXT PRIMARY KEY NOT NULL,
        thread_id TEXT,
        folder_id TEXT,
        folder_name TEXT,
        subject TEXT NOT NULL DEFAULT '（无主题）',
        sender_name TEXT,
        sender_email TEXT,
        recipients_json TEXT NOT NULL DEFAULT '[]',
        sent_at INTEGER,
        snippet TEXT,
        body_text TEXT,
        body_html TEXT,
        labels_json TEXT NOT NULL DEFAULT '[]',
        direction TEXT NOT NULL DEFAULT 'unknown',
        raw_json TEXT,
        imported_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS mail_sync_state (
        mailbox_id TEXT PRIMARY KEY NOT NULL,
        page_token TEXT,
        folder_index INTEGER NOT NULL DEFAULT 0,
        folder_id TEXT,
        folder_name TEXT,
        folders_total INTEGER NOT NULL DEFAULT 0,
        folders_completed INTEGER NOT NULL DEFAULT 0,
        total_imported INTEGER NOT NULL DEFAULT 0,
        last_synced_at INTEGER,
        status TEXT NOT NULL DEFAULT 'idle',
        last_error TEXT
      )
    `),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS email_messages_sent_at_idx ON email_messages(sent_at DESC)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS email_messages_thread_id_idx ON email_messages(thread_id)",
    ),
  ]);

  await ensureColumns(db, "email_messages", [
    ["folder_name", "folder_name TEXT"],
  ]);
  await ensureColumns(db, "mail_sync_state", [
    ["folder_index", "folder_index INTEGER NOT NULL DEFAULT 0"],
    ["folder_id", "folder_id TEXT"],
    ["folder_name", "folder_name TEXT"],
    ["folders_total", "folders_total INTEGER NOT NULL DEFAULT 0"],
    ["folders_completed", "folders_completed INTEGER NOT NULL DEFAULT 0"],
  ]);
}

async function ensureColumns(
  db: D1Database,
  table: "email_messages" | "mail_sync_state",
  columns: [string, string][],
): Promise<void> {
  const info = await db
    .prepare(`PRAGMA table_info(${table})`)
    .all<{ name: string }>();
  const existing = new Set(info.results.map((column) => column.name));
  for (const [name, definition] of columns) {
    if (!existing.has(name)) {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
    }
  }
}
