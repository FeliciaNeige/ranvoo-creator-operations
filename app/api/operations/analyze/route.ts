import { analyzeCreatorThreads, type AnalyzableEmail } from "../../../../lib/creator-analysis";
import { loadRoutingConfig } from "../../../../lib/routing-settings";
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
  counterparty_email: string;
  total_messages?: number;
  total_threads?: number;
};

type CreatorStatRow = {
  counterparty_email: string;
  total_messages: number;
  total_threads: number;
};

const ANALYSIS_PAGE_SIZE = 50;
const RECENT_MESSAGES_PER_CREATOR = 6;
const COUNTERPARTY_SQL = `
  LOWER(TRIM(
    CASE
      WHEN direction = 'inbound' THEN sender_email
      ELSE COALESCE(json_extract(recipients_json, '$[0].email'), sender_email)
    END
  ))
`;

export async function POST(request: Request): Promise<Response> {
  try {
    const searchParams = new URL(request.url).searchParams;
    const phase = searchParams.get("phase") ?? "full";
    const cursor = (searchParams.get("cursor") ?? "").trim().toLowerCase();
    const requestedLimit = Number(searchParams.get("limit") ?? ANALYSIS_PAGE_SIZE);
    const pageSize = Math.min(
      75,
      Math.max(10, Number.isFinite(requestedLimit) ? requestedLimit : ANALYSIS_PAGE_SIZE),
    );
    const db = getMailDb();
    await ensureMailTables(db);

    const statsResult = await db
      .prepare(`
        WITH normalized AS (
          SELECT
            ${COUNTERPARTY_SQL} AS counterparty_email,
            thread_id,
            message_id
          FROM email_messages
          WHERE review_status = 'active'
        )
        SELECT
          counterparty_email,
          COUNT(*) AS total_messages,
          COUNT(DISTINCT COALESCE(thread_id, message_id)) AS total_threads
        FROM normalized
        WHERE counterparty_email > ?
          AND counterparty_email LIKE '%@%.%'
        GROUP BY counterparty_email
        ORDER BY counterparty_email ASC
        LIMIT ?
      `)
      .bind(cursor, pageSize + 1)
      .all<CreatorStatRow>();
    const hasMore = statsResult.results.length > pageSize;
    const pageStats = statsResult.results.slice(0, pageSize);
    const pageEmails = pageStats.map((row) => row.counterparty_email);
    const nextCursor = hasMore
      ? pageEmails[pageEmails.length - 1] ?? null
      : null;

    if (!pageEmails.length) {
      return Response.json(
        {
          items: [],
          sourceEmailCount: 0,
          uniqueCreatorCount: 0,
          deduplicatedCount: 0,
          hasMore: false,
          nextCursor: null,
          baseError: null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const placeholders = pageEmails.map(() => "?").join(",");
    const rows = await db
      .prepare(`
        WITH normalized AS (
          SELECT
            message_id, thread_id, subject, sender_name, sender_email,
            recipients_json, sent_at, snippet,
            SUBSTR(body_text, 1, 1800) AS body_text,
            direction,
            COALESCE(sent_at, imported_at) AS sort_at,
            ${COUNTERPARTY_SQL} AS counterparty_email
          FROM email_messages
          WHERE review_status = 'active'
        ), ranked AS (
          SELECT
            *,
            ROW_NUMBER() OVER (
              PARTITION BY counterparty_email
              ORDER BY sort_at DESC, message_id DESC
            ) AS recent_rank
          FROM normalized
          WHERE counterparty_email IN (${placeholders})
        )
        SELECT
          message_id, thread_id, subject, sender_name, sender_email,
          recipients_json, sent_at, snippet, body_text, direction,
          counterparty_email
        FROM ranked
        WHERE recent_rank <= ?
        ORDER BY counterparty_email ASC, sort_at ASC
      `)
      .bind(...pageEmails, RECENT_MESSAGES_PER_CREATOR)
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
    const routingConfig = await loadRoutingConfig(db);
    const statsByEmail = new Map(
      pageStats.map((row) => [row.counterparty_email, row]),
    );
    const analyses = analyzeCreatorThreads(messages, Date.now(), routingConfig)
      .map((analysis) => {
        const stats = statsByEmail.get(analysis.email);
        if (!stats) return analysis;
        return {
          ...analysis,
          messageCount: stats.total_messages,
          threadCount: stats.total_threads || 1,
          evidence: [
            `同一邮箱共 ${stats.total_messages} 封邮件、${stats.total_threads || 1} 个线程（最近 ${Math.min(stats.total_messages, RECENT_MESSAGES_PER_CREATOR)} 封用于本次判断）`,
            ...analysis.evidence.slice(1),
          ],
        };
      });

    const totals = cursor
      ? null
      : await db
          .prepare(`
            WITH normalized AS (
              SELECT ${COUNTERPARTY_SQL} AS counterparty_email
              FROM email_messages
              WHERE review_status = 'active'
            )
            SELECT
              COUNT(*) AS source_email_count,
              COUNT(DISTINCT counterparty_email) AS unique_creator_count
            FROM normalized
            WHERE counterparty_email LIKE '%@%.%'
          `)
          .first<{ source_email_count: number; unique_creator_count: number }>();

    if (phase === "email") {
      const headers = new Headers({ "Cache-Control": "no-store" });
      return Response.json(
        {
          items: analyses.map((analysis) => ({
            ...analysis,
            tableMatch: {
              status: "matching",
              tableName: analysis.sourceTable,
              tableId: null,
              recordId: null,
              duplicateRecordIds: [],
              currentStage: null,
              proposedChanges: [],
              unresolvedFields: [],
              message: analysis.sourceTable
                ? `正在匹配 ${analysis.sourceTable}`
                : "未分类邮件需要先确认合作类型",
            },
          })),
          summary: summarize(analyses),
          sourceEmailCount: totals?.source_email_count ?? null,
          uniqueCreatorCount: totals?.unique_creator_count ?? null,
          deduplicatedCount: totals
            ? Math.max(0, totals.source_email_count - totals.unique_creator_count)
            : null,
          hasMore,
          nextCursor,
          baseError: null,
        },
        { headers },
      );
    }
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
              message: baseError || "多维表暂时无法读取",
            },
        })),
        summary: summarize(analyses),
        sourceEmailCount: totals?.source_email_count ?? null,
        uniqueCreatorCount: totals?.unique_creator_count ?? null,
        deduplicatedCount: totals
          ? Math.max(0, totals.source_email_count - totals.unique_creator_count)
          : null,
        hasMore,
        nextCursor,
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
