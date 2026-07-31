import { analyzeCreatorThreads, type AnalyzableEmail } from "../../../../lib/creator-analysis";
import { ensureMailTables, errorResponse, getMailDb } from "../../mail/_shared";
import {
  OperationsApiError,
  createFeishuClient,
  matchAnalysesToBase,
} from "../_shared";

export const dynamic = "force-dynamic";

type EmailRow = {
  message_id: string;
  thread_id: string | null;
  subject: string;
  sender_name: string | null;
  sender_email: string | null;
  recipients_json: string;
  sent_at: number | null;
  snippet: string | null;
  body_text: string | null;
  direction: "inbound" | "outbound" | "unknown";
};

export async function POST(request: Request): Promise<Response> {
  try {
    const db = getMailDb();
    await ensureMailTables(db);
    const rows = await db
      .prepare(`
        SELECT
          message_id, thread_id, subject, sender_name, sender_email,
          recipients_json, sent_at, snippet, body_text, direction
        FROM email_messages
        ORDER BY COALESCE(sent_at, imported_at) ASC
        LIMIT 20000
      `)
      .all<EmailRow>();
    const messages: AnalyzableEmail[] = rows.results.map((row) => ({
      messageId: row.message_id,
      threadId: row.thread_id,
      subject: row.subject,
      senderName: row.sender_name,
      senderEmail: row.sender_email,
      recipients: safeJson(row.recipients_json, []),
      sentAt: row.sent_at,
      snippet: row.snippet,
      bodyText: row.body_text,
      direction: row.direction,
    }));
    const analyses = analyzeCreatorThreads(messages);
    const client = await createFeishuClient(request);
    let baseError: string | null = null;
    let matches = new Map();
    try {
      matches = await matchAnalysesToBase(client, analyses);
    } catch (error) {
      baseError =
        error instanceof Error
          ? error.message
          : "多维表暂时无法读取，邮箱分析结果已保留。";
    }

    const headers = new Headers({ "Cache-Control": "no-store" });
    if (client.setCookie) headers.set("Set-Cookie", client.setCookie);
    return Response.json(
      {
        items: analyses.map((analysis) => ({
          ...analysis,
          tableMatch:
            matches.get(analysis.email) ?? {
              status: "unavailable",
              tableName: analysis.sourceTable,
              tableId: null,
              recordId: null,
              duplicateRecordIds: [],
              currentStage: null,
              proposedChanges: [],
              unresolvedFields: [],
            },
        })),
        summary: summarize(analyses),
        sourceEmailCount: messages.length,
        uniqueCreatorCount: analyses.length,
        deduplicatedCount: Math.max(0, messages.length - analyses.length),
        baseError,
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof OperationsApiError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return errorResponse(error);
  }
}

function summarize(
  analyses: ReturnType<typeof analyzeCreatorThreads>,
) {
  const byCategory: Record<string, number> = {};
  const byUrgency: Record<string, number> = {};
  for (const analysis of analyses) {
    byCategory[analysis.category] = (byCategory[analysis.category] ?? 0) + 1;
    byUrgency[analysis.urgency] = (byUrgency[analysis.urgency] ?? 0) + 1;
  }
  return { byCategory, byUrgency };
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
