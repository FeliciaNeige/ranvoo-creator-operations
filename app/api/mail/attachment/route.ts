import { authorizedMailRequest, ensureMailTables, errorResponse, getMailDb, MailApiError } from "../_shared";

export const dynamic = "force-dynamic";

type Attachment = { id?: string; filename?: string };
type DownloadData = {
  download_urls?: { attachment_id?: string; download_url?: string }[];
  failed_ids?: string[];
};

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const messageId = url.searchParams.get("messageId")?.trim() ?? "";
    const attachmentId = url.searchParams.get("attachmentId")?.trim() ?? "";
    const requestedFilename = url.searchParams.get("filename")?.trim() ?? "附件";
    if (!messageId || !attachmentId) {
      throw new MailApiError(400, "缺少邮件或附件信息。");
    }

    const db = getMailDb();
    await ensureMailTables(db);
    const row = await db.prepare(
      "SELECT attachments_json FROM email_messages WHERE message_id = ?",
    ).bind(messageId).first<{ attachments_json: string | null }>();
    const attachments = safeJson<Attachment[]>(row?.attachments_json, []);
    const attachment = attachments.find((item) => item.id === attachmentId);
    if (!attachment) throw new MailApiError(404, "未找到这个邮件附件，请先完整重扫邮箱。");

    const result = await authorizedMailRequest<DownloadData>(
      request,
      `/mail/v1/user_mailboxes/me/messages/${encodeURIComponent(messageId)}/attachments/download_url?attachment_ids=${encodeURIComponent(attachmentId)}`,
    );
    const signedUrl = result.data.download_urls?.find(
      (item) => item.attachment_id === attachmentId,
    )?.download_url;
    if (!signedUrl || !/^https:\/\//i.test(signedUrl)) {
      throw new MailApiError(502, "飞书暂时没有返回可用的附件链接，请稍后重试。");
    }

    const filename = cleanFilename(attachment.filename || requestedFilename);
    if (url.searchParams.get("download") !== "1") {
      const headers = new Headers({
        Location: signedUrl,
        "Cache-Control": "no-store",
      });
      if (result.setCookie) headers.set("Set-Cookie", result.setCookie);
      return new Response(null, { status: 302, headers });
    }

    const file = await fetch(signedUrl, { signal: AbortSignal.timeout(30_000) });
    if (!file.ok || !file.body) {
      throw new MailApiError(502, "附件下载连接暂时不可用，请稍后重试。");
    }
    const headers = new Headers({
      "Content-Type": file.headers.get("Content-Type") || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    });
    const length = file.headers.get("Content-Length");
    if (length) headers.set("Content-Length", length);
    if (result.setCookie) headers.set("Set-Cookie", result.setCookie);
    return new Response(file.body, { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function cleanFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 180) || "附件";
}
