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
  init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<{
  data: T;
  setCookie?: string;
}> {
  const client = await createAuthorizedMailClient(request);
  const result = await client.request<T>(path, init);
  return { ...result, setCookie: client.setCookie };
}

export async function createAuthorizedMailClient(request: Request): Promise<{
  setCookie?: string;
  request<T>(
    path: string,
    init?: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown },
  ): Promise<{ data: T }>;
}> {
  const auth = await ensureFeishuSession(request);
  if (!auth) throw new MailApiError(401, "飞书授权已过期，请重新连接。");

  return {
    setCookie: auth.setCookie,
    async request<T>(
      path: string,
      init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {},
    ): Promise<{ data: T }> {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const response = await fetch(`${FEISHU_API_BASE}${path}`, {
            method: init.method ?? "GET",
            headers: {
              Authorization: `Bearer ${auth.session.accessToken}`,
              "Content-Type": "application/json; charset=utf-8",
            },
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
            signal: AbortSignal.timeout(20_000),
          });
          const raw = await response.text();
          let body: FeishuEnvelope<T> | null = null;
          try {
            body = raw ? JSON.parse(raw) as FeishuEnvelope<T> : null;
          } catch {
            body = null;
          }
          const rateLimited =
            response.status === 429 ||
            /frequency limit|rate limit|too many requests/i.test(body?.msg ?? "");
          const transient = rateLimited || response.status >= 500 || !body;
          if (transient && attempt < 4) {
            const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
            await delay(
              retryAfter > 0
                ? retryAfter * 1000
                : Math.min(5000, 500 * 2 ** attempt),
            );
            continue;
          }
          if (!body) {
            throw new MailApiError(502, "飞书邮箱服务出现短暂波动，请稍后继续同步。");
          }
          if (!response.ok || (typeof body.code === "number" && body.code !== 0)) {
            const message =
              body.code === 1230002
                ? "缺少所需的飞书邮箱权限，请发布新版应用后重新授权。"
                : body.msg || "飞书邮箱暂时无法读取。";
            throw new MailApiError(response.status || 502, message, body.code);
          }
          return { data: body.data as T };
        } catch (error) {
          if (error instanceof MailApiError) throw error;
          if (attempt < 4) {
            await delay(Math.min(5000, 500 * 2 ** attempt));
            continue;
          }
          throw new MailApiError(502, "飞书邮箱连接暂时不稳定，请稍后继续同步。");
        }
      }
      throw new MailApiError(429, "飞书请求频率过高，请稍后继续同步。");
    },
  };
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
    { error: "邮件功能暂时发生了意外错误，请稍后重试。" },
    { status: 500 },
  );
}

let mailTablesReady: Promise<void> | null = null;

export async function ensureMailTables(db: D1Database): Promise<void> {
  if (!mailTablesReady) {
    mailTablesReady = initializeMailTables(db).catch((error) => {
      mailTablesReady = null;
      throw error;
    });
  }
  return mailTablesReady;
}

async function initializeMailTables(db: D1Database): Promise<void> {
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
        attachments_json TEXT,
        direction TEXT NOT NULL DEFAULT 'unknown',
        review_status TEXT NOT NULL DEFAULT 'active',
        reviewed_at INTEGER,
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
    ["review_status", "review_status TEXT NOT NULL DEFAULT 'active'"],
    ["reviewed_at", "reviewed_at INTEGER"],
    ["attachments_json", "attachments_json TEXT"],
  ]);
  await ensureColumns(db, "mail_sync_state", [
    ["folder_index", "folder_index INTEGER NOT NULL DEFAULT 0"],
    ["folder_id", "folder_id TEXT"],
    ["folder_name", "folder_name TEXT"],
    ["folders_total", "folders_total INTEGER NOT NULL DEFAULT 0"],
    ["folders_completed", "folders_completed INTEGER NOT NULL DEFAULT 0"],
  ]);
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS email_messages_review_status_idx ON email_messages(review_status, sent_at DESC)",
    )
    .run();
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
