import {
  MailApiError,
  authorizedMailRequest,
  ensureMailTables,
  errorResponse,
  getMailDb,
} from "../_shared";

export const dynamic = "force-dynamic";

type Folder = {
  id: string;
  name?: string;
  folder_type?: number;
};

type FolderListData = {
  items?: Folder[];
};

type MessageListData = {
  items?: string[];
  page_token?: string;
  has_more?: boolean;
};

type MessageData = {
  message?: Record<string, unknown>;
} & Record<string, unknown>;

export async function POST(request: Request): Promise<Response> {
  let setCookie: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      pageToken?: string;
      folderIndex?: number;
      resume?: boolean;
      full?: boolean;
    };
    const db = getMailDb();
    await ensureMailTables(db);

    let pageToken = body.pageToken ?? "";
    let folderIndex = Math.max(0, body.folderIndex ?? 0);
    if (body.resume && !pageToken && body.folderIndex === undefined) {
      const state = await db
        .prepare(
          "SELECT page_token, folder_index FROM mail_sync_state WHERE mailbox_id = 'me'",
        )
        .first<{ page_token?: string; folder_index?: number }>();
      pageToken = state?.page_token ?? "";
      folderIndex = Math.max(0, state?.folder_index ?? 0);
    }

    const folderResult = await authorizedMailRequest<FolderListData>(
      request,
      "/mail/v1/user_mailboxes/me/folders",
    );
    setCookie = folderResult.setCookie;
    const folders = (folderResult.data?.items ?? []).filter(
      (folder): folder is Folder =>
        Boolean(folder && typeof folder.id === "string" && folder.id),
    );
    if (!folders.length) {
      throw new MailApiError(
        502,
        "飞书没有返回任何邮箱文件夹，请确认“查询邮箱文件夹”权限已发布并重新授权。",
      );
    }

    if (folderIndex >= folders.length) {
      folderIndex = 0;
      pageToken = "";
    }
    const folder = folders[folderIndex];
    const query = new URLSearchParams({
      page_size: "20",
      folder_id: folder.id,
    });
    if (pageToken) query.set("page_token", pageToken);

    const listed = await authorizedMailRequest<MessageListData>(
      request,
      `/mail/v1/user_mailboxes/me/messages?${query.toString()}`,
    );
    setCookie ??= listed.setCookie;
    const ids = Array.isArray(listed.data?.items) ? listed.data.items : [];

    const existing = ids.length
      ? await db
          .prepare(
            `SELECT message_id FROM email_messages WHERE message_id IN (${ids
              .map(() => "?")
              .join(",")})`,
          )
          .bind(...ids)
          .all<{ message_id: string }>()
      : { results: [] as { message_id: string }[] };
    const known = new Set(existing.results.map((row) => row.message_id));
    const pageAlreadyKnown =
      !body.full && ids.length > 0 && ids.every((id) => known.has(id));

    const messages = pageAlreadyKnown
      ? []
      : await mapWithConcurrency(ids, 1, async (id) => {
          const detail = await authorizedMailRequest<MessageData>(
            request,
            `/mail/v1/user_mailboxes/me/messages/${encodeURIComponent(id)}`,
          );
          setCookie ??= detail.setCookie;
          const normalized = normalizeMessage(id, detail.data, folder);
          await delay(160);
          return normalized;
        });

    const now = Date.now();
    if (messages.length) {
      await db.batch(
        messages.map((message) =>
          db
            .prepare(`
              INSERT INTO email_messages (
                message_id, thread_id, folder_id, folder_name, subject,
                sender_name, sender_email, recipients_json, sent_at, snippet,
                body_text, body_html, labels_json, direction, raw_json,
                imported_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(message_id) DO UPDATE SET
                thread_id = excluded.thread_id,
                folder_id = excluded.folder_id,
                folder_name = excluded.folder_name,
                subject = excluded.subject,
                sender_name = excluded.sender_name,
                sender_email = excluded.sender_email,
                recipients_json = excluded.recipients_json,
                sent_at = excluded.sent_at,
                snippet = excluded.snippet,
                body_text = excluded.body_text,
                body_html = excluded.body_html,
                labels_json = excluded.labels_json,
                direction = excluded.direction,
                raw_json = excluded.raw_json,
                updated_at = excluded.updated_at
            `)
            .bind(
              message.messageId,
              message.threadId,
              message.folderId,
              message.folderName,
              message.subject,
              message.senderName,
              message.senderEmail,
              JSON.stringify(message.recipients),
              message.sentAt,
              message.snippet,
              message.bodyText,
              message.bodyHtml,
              JSON.stringify(message.labels),
              message.direction,
              message.rawJson,
              now,
              now,
            ),
        ),
      );
    }

    const folderHasMore = Boolean(
      !pageAlreadyKnown && listed.data?.has_more && listed.data?.page_token,
    );
    const nextFolderIndex = folderHasMore ? folderIndex : folderIndex + 1;
    const hasMore = nextFolderIndex < folders.length;
    const nextPageToken = folderHasMore
      ? listed.data?.page_token ?? null
      : null;
    const total = await db
      .prepare("SELECT COUNT(*) AS count FROM email_messages")
      .first<{ count: number }>();
    const foldersCompleted = folderHasMore ? folderIndex : folderIndex + 1;

    await db
      .prepare(`
        INSERT INTO mail_sync_state (
          mailbox_id, page_token, folder_index, folder_id, folder_name,
          folders_total, folders_completed, total_imported, last_synced_at,
          status, last_error
        ) VALUES ('me', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(mailbox_id) DO UPDATE SET
          page_token = excluded.page_token,
          folder_index = excluded.folder_index,
          folder_id = excluded.folder_id,
          folder_name = excluded.folder_name,
          folders_total = excluded.folders_total,
          folders_completed = excluded.folders_completed,
          total_imported = excluded.total_imported,
          last_synced_at = excluded.last_synced_at,
          status = excluded.status,
          last_error = NULL
      `)
      .bind(
        nextPageToken,
        hasMore ? nextFolderIndex : 0,
        folder.id,
        folder.name ?? folder.id,
        folders.length,
        foldersCompleted,
        total?.count ?? 0,
        now,
        hasMore ? "running" : "idle",
      )
      .run();

    const headers = new Headers({ "Cache-Control": "no-store" });
    if (setCookie) headers.set("Set-Cookie", setCookie);
    return Response.json(
      {
        imported: messages.length,
        checked: ids.length,
        total: total?.count ?? 0,
        hasMore,
        pageToken: nextPageToken,
        folderIndex: hasMore ? nextFolderIndex : 0,
        folderName: folder.name ?? folder.id,
        foldersTotal: folders.length,
        foldersCompleted,
        complete: !hasMore,
        pageAlreadyKnown,
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof MailApiError) {
      try {
        const db = getMailDb();
        await ensureMailTables(db);
        await db
          .prepare(`
            INSERT INTO mail_sync_state (
              mailbox_id, status, last_error, total_imported
            ) VALUES ('me', 'error', ?, 0)
            ON CONFLICT(mailbox_id) DO UPDATE SET
              status = 'error', last_error = excluded.last_error
          `)
          .bind(error.message)
          .run();
      } catch {
        // Preserve the original Feishu error.
      }
    }
    return errorResponse(error);
  }
}

function normalizeMessage(id: string, value: MessageData, folder: Folder) {
  const raw = (value?.message ?? value ?? {}) as Record<string, unknown>;
  const sender = firstAddress(raw.from ?? raw.sender);
  const recipients = [
    ...allAddresses(raw.to),
    ...allAddresses(raw.cc),
    ...allAddresses(raw.bcc),
  ];
  const sentAt = timestamp(
    raw.sent_date ??
      raw.sent_at ??
      raw.internal_date ??
      raw.created_time ??
      raw.create_time,
  );
  const folderIds = stringArray(raw.folder_ids ?? raw.folders);
  const labels = stringArray(raw.label_ids ?? raw.labels);
  const bodyText = stringValue(
    raw.body ?? raw.body_text ?? raw.text_body ?? raw.snippet,
  );
  const bodyHtml = stringValue(
    raw.mail_body_html ?? raw.body_html ?? raw.html_body,
  );
  const folderName = folder.name ?? folder.id;
  const direction = /sent|outbox|已发送|发件箱/i.test(
    `${folder.id} ${folderName}`,
  )
    ? "outbound"
    : "inbound";

  return {
    messageId: stringValue(raw.message_id) || id,
    threadId: stringValue(raw.thread_id) || null,
    folderId: folderIds[0] ?? stringValue(raw.folder_id) ?? folder.id,
    folderName,
    subject: stringValue(raw.subject) || "（无主题）",
    senderName: sender?.name ?? null,
    senderEmail: sender?.email ?? null,
    recipients,
    sentAt,
    snippet:
      stringValue(raw.snippet ?? raw.summary) ||
      bodyText?.replace(/\s+/g, " ").slice(0, 240) ||
      null,
    bodyText,
    bodyHtml,
    labels,
    direction,
    rawJson: JSON.stringify(raw),
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "string"
        ? item
        : stringValue((item as Record<string, unknown>)?.id),
    )
    .filter((item): item is string => Boolean(item));
}

function firstAddress(value: unknown) {
  return allAddresses(value)[0] ?? null;
}

function allAddresses(value: unknown): { name: string; email: string }[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items
    .map((item) => {
      if (typeof item === "string") return { name: "", email: item };
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const email =
        stringValue(entry.mail_address) ||
        stringValue(entry.email) ||
        stringValue(entry.address);
      if (!email) return null;
      return {
        name: stringValue(entry.name) ?? "",
        email,
      };
    })
    .filter(
      (item): item is { name: string; email: string } => item !== null,
    );
}

function timestamp(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
