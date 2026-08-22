"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import {
  htmlToPlainText,
  plainTextToHtml,
  sanitizeMailHtml,
} from "../lib/mail-compose";
import {
  defaultRoutingConfig,
  type RoutingConfig,
} from "../lib/routing-config";

type Urgency = "阻塞" | "今日到期" | "需要跟进" | "观察" | "终止候选";
type Category = "UGC" | "牙医合作" | "商业化红人" | "未分类";
type View = "dashboard" | "mail" | "creators" | "messages" | "settings";

type MailContextMenu = {
  x: number;
  y: number;
  creatorName: string;
  creatorEmail: string;
};

type AppearancePreferences = {
  font: "modern" | "rounded" | "serif";
  scale: number;
  accent: string;
  background: string;
};

type Creator = {
  id: number;
  name: string;
  handle: string;
  email: string;
  category: Category;
  categoryLabel?: string;
  subject: string;
  stage: string;
  silence: number;
  urgency: Urgency;
  latest: string;
  next: string;
  lastInbound: string;
  lastOutbound: string;
  draft: string;
  sourceMessageId?: string;
  updates: { field: string; from: string; to: string }[];
  transfer?: {
    source: string;
    target: string;
    trigger: string;
    match: string;
    fields: { field: string; value: string }[];
  };
  analysis?: {
    messageCount: number;
    threadCount: number;
    confidence: "高" | "中" | "低";
    evidence: string[];
    messageScenario: string;
    emailStage: string;
    tableStatus: "matching" | "matched" | "unmatched" | "duplicate" | "unavailable";
    tableName: string | null;
    tableId: string | null;
    recordId: string | null;
    tableStage: string | null;
    currentStageValue?: unknown;
    progressField?: string | null;
    updateDateField?: string | null;
    updateDateValue?: unknown;
    proposedChanges: {
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }[];
    unresolvedFields: string[];
    tableMessage: string | null;
  };
};

type AnalysisApiItem = {
  email: string;
  creatorName: string;
  category: Category;
  categoryLabel: string;
  sourceTable: string | null;
  preferredTable: string | null;
  targetTable: string | null;
  messageCount: number;
  threadCount: number;
  latestSubject: string;
  latestMessageId: string;
  latestAt: number | null;
  latestSummary: string;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
  silenceDays: number;
  stage: string;
  urgency: Urgency;
  evidence: string[];
  nextAction: string;
  messageScenario: string;
  confidence: "高" | "中" | "低";
  transferEligible: boolean;
  proposedFields: { field: string; value: string | number | null }[];
  tableMatch: {
    status: "matching" | "matched" | "unmatched" | "duplicate" | "unavailable";
    tableName: string | null;
    tableId: string | null;
    recordId: string | null;
    duplicateRecordIds: string[];
    currentStage: string | null;
    currentStageValue?: unknown;
    progressField?: string | null;
    updateDateField?: string | null;
    updateDateValue?: unknown;
    proposedChanges: {
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }[];
    unresolvedFields: string[];
    message?: string | null;
  };
};

type ImportedEmail = {
  message_id: string;
  thread_id?: string | null;
  folder_id?: string | null;
  folder_name?: string | null;
  subject: string;
  sender_name?: string | null;
  sender_email?: string | null;
  recipients?: { name?: string; email: string }[];
  sent_at?: number | null;
  snippet?: string | null;
  body_text?: string | null;
  direction: "inbound" | "outbound" | "unknown";
  counterparty_email?: string | null;
  message_count?: number;
  review_status?: "active" | "archive" | "trash";
};

type ReplyControls = {
  tone: "warm" | "professional" | "friendly" | "firm";
  emotion: "enthusiastic" | "balanced" | "restrained";
  length: "short" | "standard" | "detailed";
  language: "English" | "Spanish";
};

const defaultReplyControls: ReplyControls = {
  tone: "warm",
  emotion: "balanced",
  length: "standard",
  language: "English",
};

type MailSync = {
  total_imported: number;
  last_synced_at?: number | null;
  status: "idle" | "running" | "error";
  last_error?: string | null;
  page_token?: string | null;
  folder_index?: number;
  folder_id?: string | null;
  folder_name?: string | null;
  folders_total?: number;
  folders_completed?: number;
};

type MailSyncBatchResult = {
  imported?: number;
  total?: number;
  hasMore?: boolean;
  pageToken?: string | null;
  folderIndex?: number;
  folderName?: string;
  foldersTotal?: number;
  foldersCompleted?: number;
  checked?: number;
  error?: string;
};

const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const AUTO_SYNC_LOCK_KEY = "ranvoo-mail-sync-lock";
const AUTO_SYNC_LOCK_TTL_MS = 2 * 60 * 1000;
const ANALYSIS_LOCK_KEY = "ranvoo-analysis-lock";
const ANALYSIS_LOCK_TTL_MS = 2 * 60 * 1000;
const APPEARANCE_STORAGE_KEY = "ranvoo-appearance-preferences";
const defaultAppearance: AppearancePreferences = {
  font: "modern",
  scale: 1,
  accent: "#153d2e",
  background: "#f5f7f5",
};
const appearanceFonts: Record<AppearancePreferences["font"], string> = {
  modern: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  rounded: '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Songti SC", "STSong", serif',
};

const todayLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "Asia/Shanghai",
}).format(new Date());

const todayDateValue = (() => {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
})();

const collaborationStageOptions = [
  "已触达", "等待回复", "有兴趣", "洽谈", "已合作", "合同中", "待地址",
  "待发货", "运输中", "产品体验", "Brief 已发送", "内容制作中", "草稿审核",
  "修改中", "待发布", "已发布", "待付款", "已完成", "不合作", "终止合作",
  "Initial Outreach Sent", "Awaiting Creator Reply", "Interested / Requirements Pending",
  "Negotiating Scope or Price", "Collaboration Agreed", "Contract Pending",
  "Address Pending", "Sample Pending Shipment", "In Transit", "Delivered / Experience Period",
  "Brief Pending or Sent", "Content Pending", "Draft Received / Review", "Revision Pending",
  "Approved / Posting Pending", "Published", "Payment Pending", "Completed", "Declined",
  "Termination Candidate", "Terminated",
];

const seedCreators: Creator[] = [
  {
    id: 1,
    name: "Maya Collins",
    handle: "@mayacreates",
    email: "maya@example.com",
    category: "UGC",
    subject: "Re: 💸💸💸【Collab Invitation】: Paid UGC Collab with RANVOO",
    stage: "等待红人回复",
    silence: 4,
    urgency: "需要跟进",
    latest: "4天前已发送合作细节，红人尚未回复。",
    next: "用更容易回复的选项降低沟通门槛。",
    lastInbound: "Jul 24 · Interested, asked for details",
    lastOutbound: "Jul 26 · Sent deliverables and $15/video offer",
    draft:
      "Hi Maya,\n\nJust checking in on the AirJet X5 UGC collaboration. To make the next step easy, would you prefer to review the creative concepts first, or confirm the collaboration details by email?\n\nIf the timing isn’t right, feel free to let me know as well.\n\nBest,\nFelicia",
    updates: [
      { field: "合作进度", from: "已触达", to: "Follow-up #1" },
      { field: "更新日期", from: "Jul 26", to: todayLabel },
      { field: "最后跟进日期", from: "Jul 26", to: "Jul 30" },
      { field: "下次检查", from: "—", to: "Aug 2" },
    ],
  },
  {
    id: 2,
    name: "Dr. Elena Morris",
    handle: "@dr.elenasmiles",
    email: "elena@example.com",
    category: "牙医合作",
    subject: "Re: 【RANVOO Collab】Next-gen Electric Toothbrush",
    stage: "地址待确认",
    silence: 7,
    urgency: "今日到期",
    latest: "牙医已表示愿意体验产品，但未提供收件信息。",
    next: "补充同行反馈价值，并再次索取寄送信息。",
    lastInbound: "Jul 21 · Agreed to evaluate AirJet X5",
    lastOutbound: "Jul 23 · Requested shipping information",
    draft:
      "Hi Dr. Morris,\n\nA quick follow-up on the AirJet X5 evaluation unit. We’ve recently received encouraging feedback from dental professionals on comfort and hard-to-reach cleaning, and we’d still value your perspective.\n\nIf you’d like to move forward, could you share the best shipping address and phone number for delivery?\n\nBest,\nFelicia",
    updates: [
      { field: "合作进度", from: "样品体验", to: "地址待确认" },
      { field: "更新日期", from: "Jul 23", to: todayLabel },
      { field: "反馈跟进", from: "2", to: "3" },
      { field: "备注", from: "等待地址", to: "已发送地址跟进 #3" },
    ],
    transfer: {
      source: "专业人员👖",
      target: "🪥牙医合作",
      trigger: "已明确同意体验 AirJet X5 产品",
      match: "按邮箱和 Handle 查重：未发现目标记录，将新建",
      fields: [
        { field: "Handle", value: "@dr.elenasmiles" },
        { field: "联系方式", value: "elena@example.com" },
        { field: "合作进度", value: "地址待确认" },
        { field: "更新日期", value: todayLabel },
      ],
    },
  },
  {
    id: 3,
    name: "Sophie Laurent",
    handle: "@sophieliving",
    email: "sophie@example.com",
    category: "商业化红人",
    subject: "Re: 💸💸💸【Collab Invitation】: Paid Instagram Collab with RANVOO",
    stage: "价格谈判",
    silence: 1,
    urgency: "观察",
    latest: "红人报价高于预算，昨天已询问打包三次合作价格。",
    next: "等待对方更新报价，暂不跟进。",
    lastInbound: "Jul 29 · Shared Instagram Reel pricing",
    lastOutbound: "Jul 29 · Asked for 3-collaboration package rate",
    draft: "当前不建议发送邮件。等待红人在约定窗口内回复。",
    updates: [{ field: "下次检查", from: "—", to: "Aug 1" }],
  },
  {
    id: 4,
    name: "Nora Bennett",
    handle: "@noraandbaby",
    email: "nora@example.com",
    category: "商业化红人",
    subject: "Re: 【Collab Invitation】: Empowering Moms with Better Oral Care",
    stage: "长期未回复",
    silence: 33,
    urgency: "终止候选",
    latest: "已进行三轮有价值跟进，超过30天无回复。",
    next: "由你决定继续、暂停或发送礼貌收尾邮件。",
    lastInbound: "Jun 20 · Requested campaign information",
    lastOutbound: "Jun 27 · Follow-up #3 with revised offer",
    draft:
      "Hi Nora,\n\nI wanted to close the loop on our RANVOO collaboration invitation. We understand timing and priorities can change, so we’ll pause this opportunity for now.\n\nWe’d be happy to reconnect in the future if there’s a better fit.\n\nBest,\nFelicia",
    updates: [
      { field: "合作进度", from: "Follow-up #3", to: "终止候选" },
      { field: "更新日期", from: "Jun 27", to: todayLabel },
      { field: "备注", from: "等待回复", to: "33天无回复，待人工决定" },
    ],
  },
];

const messageTemplates = [
  { category: "UGC", title: "3天未回复 · 降低回复门槛", body: "提供两个易选选项，并允许对方说明时机不合适。" },
  { category: "牙医合作", title: "地址待确认 · 增加专业价值", body: "补充同行反馈价值，再次索取寄送信息。" },
  { category: "商业化红人", title: "价格谈判 · 组合合作", body: "询问多次合作打包价，不改变已确认的商业条款。" },
  { category: "终止候选", title: "30天未回复 · 礼貌收尾", body: "暂停当前机会并保留未来重启合作的空间。" },
];

const viewNames: Record<View, string> = {
  dashboard: "今日工作台",
  mail: "邮件线程",
  creators: "红人总览",
  messages: "话术中心",
  settings: "工作流设置",
};

const navItems: { id: View; icon: string }[] = [
  { id: "dashboard", icon: "⌁" },
  { id: "mail", icon: "✉" },
  { id: "creators", icon: "◎" },
  { id: "messages", icon: "▤" },
  { id: "settings", icon: "⚙" },
];

const filterItems = ["全部", "阻塞", "今日到期", "需要跟进", "观察", "终止候选"];

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("");
}

function formatMailDate(value?: number | null) {
  if (!value) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function defaultScheduledInput() {
  return shanghaiDateTimeInput(10);
}

function minimumScheduledInput() {
  return shanghaiDateTimeInput(5);
}

function shanghaiDateTimeInput(minutesFromNow: number) {
  return new Date(Date.now() + minutesFromNow * 60_000)
    .toLocaleString("sv-SE", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    })
    .slice(0, 16);
}

function shanghaiInputToTimestamp(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const timestamp = Date.parse(`${value}:00+08:00`);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function isValidScheduledTimestamp(value?: number): value is number {
  return Boolean(value && value >= Date.now() + 5 * 60_000);
}

function formatScheduledDate(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function splitEmailBody(value: string) {
  const text = value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
  const quotePatterns = [
    /\sOn\s(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b[\s\S]{0,260}?\bwrote:\s/i,
    /\s-{2,}\s*Original Message\s*-{2,}\s*/i,
    /\sFrom:\s+(?:"|<|[A-Z])/i,
  ];
  const quoteIndex = quotePatterns.reduce((earliest, pattern) => {
    const match = pattern.exec(text);
    if (!match || (match.index ?? 0) < 40) return earliest;
    return Math.min(earliest, match.index ?? earliest);
  }, Number.POSITIVE_INFINITY);
  const latest = Number.isFinite(quoteIndex)
    ? text.slice(0, quoteIndex).trim()
    : text;
  const history = Number.isFinite(quoteIndex)
    ? text.slice(quoteIndex).trim()
    : "";
  return {
    latest: formatEmailSection(latest, false),
    history: formatEmailSection(history, true),
  };
}

function formatEmailSection(value: string, history: boolean) {
  let text = value
    .replace(/[ \t]+/g, " ")
    .replace(/\s+(https?:\/\/)/gi, "\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  text = text.replace(
    /^((?:Hi|Hello|Dear)\s+[^,\n]{1,60},)\s+/i,
    "$1\n\n",
  );
  text = text.replace(
    /\s+((?:Best regards|Kind regards|Warm regards|Thank you|Sincerely|Regards|Thanks|Best),)\s+/gi,
    "\n\n$1\n",
  );
  if (history) {
    text = text
      .replace(/\s+(On\s[^\n]{1,260}?\bwrote:)\s/gi, "\n\n$1\n")
      .replace(/\s+(From:|Date:|Subject:|To:|Cc:)\s*/gi, "\n$1 ")
      .replace(/\n{3,}/g, "\n\n");
  }
  return text;
}

function linkedEmailText(value: string) {
  return value.split(/(https?:\/\/[^\s]+)/gi).map((part, index) =>
    /^https?:\/\//i.test(part) ? (
      <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function ImportedEmailBody({ value }: { value: string }) {
  const sections = splitEmailBody(value);
  return (
    <div className="importedBody">
      <div className="emailLatest">{linkedEmailText(sections.latest)}</div>
      {sections.history && (
        <details className="quotedEmailHistory">
          <summary>查看历史邮件内容</summary>
          <div className="emailHistory">{linkedEmailText(sections.history)}</div>
        </details>
      )}
    </div>
  );
}

function CompactEmailPreview({ value }: { value: string }) {
  const latest = splitEmailBody(value).latest.trim();
  const preview = latest.length > 420 ? `${latest.slice(0, 420).trimEnd()}…` : latest;
  return (
    <>
      <div className="latestMailPreview">{linkedEmailText(preview || "这封邮件没有可显示的纯文本正文。")}</div>
      <details className="fullMailDetails">
        <summary>展开完整邮件正文</summary>
        <ImportedEmailBody value={value} />
      </details>
    </>
  );
}

function toCreator(item: AnalysisApiItem, index: number): Creator {
  const tableStage = item.tableMatch.currentStage?.trim() || null;
  const stageConflict = Boolean(tableStage && tableStage !== item.stage);
  const tableIsClosed = Boolean(
    tableStage && /completed|declined|terminated|已完成|已拒绝|已终止|不合作/i.test(tableStage),
  );
  const matchedUpdates = item.tableMatch.proposedChanges.map((change) => ({
    field: change.field,
    from: displayFieldValue(change.oldValue),
    to: displayFieldValue(change.newValue),
  }));
  const updates = matchedUpdates.length
    ? matchedUpdates
    : [
        {
          field: "多维表匹配",
          from:
            item.tableMatch.status === "duplicate"
              ? "发现多条同邮箱记录"
              : item.tableMatch.status === "unmatched"
                ? "未找到同邮箱记录"
                : item.tableMatch.status === "unavailable"
                  ? "权限或表结构待确认"
                  : "当前字段无需变化",
          to:
            item.tableMatch.status === "matched"
              ? "无需更新"
              : "确认匹配后再生成写入预览",
        },
      ];
  const transfer =
    item.transferEligible && item.sourceTable && item.targetTable
      ? {
          source: item.sourceTable,
          target: item.targetTable,
          trigger: "最新邮件及历史上下文显示合作或产品试验已明确确认。",
          match: "执行前将按邮箱、Handle、主页链接依次查重。",
          fields: [
            { field: "联系方式", value: item.email },
            { field: "合作进度", value: item.stage },
            { field: "更新日期", value: todayLabel },
          ],
        }
      : undefined;
  return {
    id: 10_000 + index,
    name: item.creatorName,
    handle: "待从多维表匹配",
    email: item.email,
    category: item.category,
    categoryLabel: item.categoryLabel,
    subject: item.latestSubject,
    stage: tableStage ?? item.stage,
    silence: item.silenceDays,
    urgency: tableIsClosed ? "观察" : item.urgency,
    latest: `${stageConflict ? `状态差异：飞书总表为“${tableStage}”，邮件推断为“${item.stage}”；需人工确认后才能改表。` : tableStage ? `当前状态以飞书总表“${tableStage}”为准。` : ""}${item.evidence.join("；")}`,
    next: item.nextAction,
    lastInbound: formatMailDate(item.lastInboundAt),
    lastOutbound: formatMailDate(item.lastOutboundAt),
    draft: `【待生成：${item.messageScenario}】\n\n系统已完成线程判断。请先核对多维表匹配和真实商业条款，再从对应话术库生成最终回复。`,
    sourceMessageId: item.latestMessageId,
    updates,
    transfer,
    analysis: {
      messageCount: item.messageCount,
      threadCount: item.threadCount,
      confidence: item.confidence,
      evidence: item.evidence,
      messageScenario: item.messageScenario,
      emailStage: item.stage,
      tableStatus: item.tableMatch.status,
      tableName: item.tableMatch.tableName,
      tableId: item.tableMatch.tableId,
      recordId: item.tableMatch.recordId,
      tableStage,
      currentStageValue: item.tableMatch.currentStageValue,
      progressField: item.tableMatch.progressField,
      updateDateField: item.tableMatch.updateDateField,
      updateDateValue: item.tableMatch.updateDateValue,
      proposedChanges: item.tableMatch.proposedChanges,
      unresolvedFields: item.tableMatch.unresolvedFields,
      tableMessage: item.tableMatch.message ?? null,
    },
  };
}

function displayFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" && value > 1_000_000_000_000) {
    return formatMailDate(value);
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text();
  if (!text) {
    throw new Error(response.ok ? fallbackMessage : `服务暂时无响应（${response.status}），请稍后重试。`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const looksLikeHtml = /<!doctype|<html/i.test(text);
    throw new Error(
      looksLikeHtml
        ? "Cloudflare 刚才返回了临时错误页，已保留现有进度，请稍后继续。"
        : fallbackMessage,
    );
  }
}

async function requestMailSyncBatch(
  payload: Record<string, unknown>,
  onRetry: (attempt: number) => void,
): Promise<MailSyncBatchResult> {
  let lastError: Error = new Error("邮件同步失败。");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch("/api/mail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await readJsonResponse<MailSyncBatchResult>(
        response,
        "邮件同步失败。",
      );
      if (response.ok) return result;
      const error = new Error(result.error || "邮件同步失败。");
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error("邮件同步失败。");
      if (!isTransientSyncError(normalized)) throw normalized;
      lastError = normalized;
    }
    if (attempt < 3) {
      onRetry(attempt + 1);
      await new Promise((resolve) => window.setTimeout(resolve, 800 * 2 ** attempt));
    }
  }
  throw lastError;
}

function isTransientSyncError(error: Error): boolean {
  return /Cloudflare|临时|暂时|波动|无响应|超时|timeout|network|failed to fetch|fetch failed/i.test(
    error.message,
  ) || error.name === "TimeoutError" || error.name === "AbortError";
}

function counterpartyEmail(email: ImportedEmail): string {
  if (email.counterparty_email) return email.counterparty_email.toLowerCase();
  return email.direction === "inbound"
    ? email.sender_email?.toLowerCase() ?? ""
    : email.recipients?.[0]?.email?.toLowerCase() ?? email.sender_email?.toLowerCase() ?? "";
}

function tableStageLabel(creator?: Creator): string {
  if (!creator?.analysis) return "总表匹配中…";
  if (creator.category === "未分类") return "待确认类型";
  if (creator.analysis.tableStatus === "matching") return "总表匹配中…";
  if (creator.analysis.tableStatus === "matched") {
    return creator.analysis.tableStage || "总表状态为空";
  }
  if (creator.analysis.tableStatus === "unmatched") return "总表未匹配";
  if (creator.analysis.tableStatus === "duplicate") return "总表重复记录";
  return "总表读取失败";
}

function creatorTypeLabel(category?: Category, customLabel?: string): string {
  if (customLabel?.trim()) return customLabel;
  if (category === "UGC") return "UGC 红人";
  if (category === "牙医合作") return "牙医 / 专业人员";
  if (category === "商业化红人") return "商业化红人";
  return "类型待确认";
}

export default function Home() {
  const [creators, setCreators] = useState(seedCreators);
  const [view, setView] = useState<View>("dashboard");
  const [filter, setFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState(1);
  const [approved, setApproved] = useState(false);
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);
  const [feishuConfigured, setFeishuConfigured] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, string>>(
    Object.fromEntries(seedCreators.map((creator) => [creator.id, creator.draft])),
  );
  const [draftHtmls, setDraftHtmls] = useState<Record<number, string>>(
    Object.fromEntries(
      seedCreators.map((creator) => [creator.id, plainTextToHtml(creator.draft)]),
    ),
  );
  const [editing, setEditing] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<"now" | "schedule">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sendingMail, setSendingMail] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"new" | "connect" | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("UGC");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [analysisLoaded, setAnalysisLoaded] = useState(false);
  const [routingConfig, setRoutingConfig] = useState<RoutingConfig>(() =>
    structuredClone(defaultRoutingConfig),
  );
  const [routingLoaded, setRoutingLoaded] = useState(false);
  const [routingSaving, setRoutingSaving] = useState(false);
  const [appearance, setAppearance] = useState<AppearancePreferences>(defaultAppearance);
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  const [importedEmails, setImportedEmails] = useState<ImportedEmail[]>([]);
  const [mailSync, setMailSync] = useState<MailSync>({
    total_imported: 0,
    status: "idle",
  });
  const [selectedMailId, setSelectedMailId] = useState("");
  const [mailboxView, setMailboxView] = useState<"inbox" | "sent">("inbox");
  const [mailLoading, setMailLoading] = useState(false);
  const [mailLoaded, setMailLoaded] = useState(false);
  const [mailTotal, setMailTotal] = useState(0);
  const [syncingMail, setSyncingMail] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [mailError, setMailError] = useState("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [threadEmails, setThreadEmails] = useState<ImportedEmail[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [mailContextMenu, setMailContextMenu] = useState<MailContextMenu | null>(null);
  const syncAllMailRef = useRef<(forceFull?: boolean) => Promise<void>>(
    async () => {},
  );
  const syncRetryTimerRef = useRef<number | null>(null);
  const analysisOwnerRef = useRef(
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const mailThreadPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/feishu/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((status: { configured?: boolean; connected?: boolean }) => {
        if (cancelled) return;
        setFeishuConfigured(Boolean(status.configured));
        setConnected(Boolean(status.connected));
      })
      .catch(() => {
        if (!cancelled) setConnected(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingConnection(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const restorePreference = window.setTimeout(() => {
      const saved = window.localStorage.getItem("ranvoo-auto-mail-sync");
      if (saved !== null) setAutoSyncEnabled(saved === "true");
    }, 0);
    return () => window.clearTimeout(restorePreference);
  }, []);

  useEffect(() => {
    const restoreAppearance = window.setTimeout(() => {
      const saved = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (saved) {
        try {
          const candidate = JSON.parse(saved) as Partial<AppearancePreferences>;
          setAppearance({
            font: candidate.font && candidate.font in appearanceFonts
              ? candidate.font
              : defaultAppearance.font,
            scale: typeof candidate.scale === "number"
              ? Math.min(1.25, Math.max(0.85, candidate.scale))
              : defaultAppearance.scale,
            accent: /^#[0-9a-f]{6}$/i.test(candidate.accent ?? "")
              ? candidate.accent!
              : defaultAppearance.accent,
            background: /^#[0-9a-f]{6}$/i.test(candidate.background ?? "")
              ? candidate.background!
              : defaultAppearance.background,
          });
        } catch {
          setAppearance(defaultAppearance);
        }
      }
      setAppearanceLoaded(true);
    }, 0);
    return () => window.clearTimeout(restoreAppearance);
  }, []);

  useEffect(() => {
    if (!appearanceLoaded) return;
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  }, [appearance, appearanceLoaded]);

  useEffect(() => {
    window.localStorage.setItem(
      "ranvoo-auto-mail-sync",
      String(autoSyncEnabled),
    );
  }, [autoSyncEnabled]);

  useEffect(() => {
    const closeMenu = () => setMailContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (view !== "mail" || !connected) return;
    const timer = window.setTimeout(() => {
      void loadImportedMail(search, false);
    }, 250);
    return () => window.clearTimeout(timer);
    // 搜索和页面切换时刷新；加载函数保持使用当前分页状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, connected, search, mailboxView]);

  useEffect(() => {
    if ((view !== "mail" && view !== "dashboard") || !connected || analysisLoaded || reanalyzing) return;
    void runAnalysis();
    // 今日工作台与邮件页首次进入时自动加载分类和飞书总表标签。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, connected, analysisLoaded, reanalyzing]);

  useEffect(() => {
    if (view !== "settings" || !connected || routingLoaded) return;
    void loadRoutingSettings();
  }, [view, connected, routingLoaded]);

  const visible = useMemo(
    () => creators.filter((creator) =>
      (filter === "全部" || creator.urgency === filter) &&
      `${creator.name} ${creator.handle} ${creator.email} ${creator.subject}`.toLowerCase().includes(search.toLowerCase()),
    ),
    [creators, filter, search],
  );
  const urgencyCounts = useMemo(() => Object.fromEntries(
    filterItems.slice(1).map((urgency) => [urgency, creators.filter((creator) => creator.urgency === urgency).length]),
  ) as Record<Urgency, number>, [creators]);
  const selected = creators.find((creator) => creator.id === selectedId) ?? creators[0];
  const selectedImported =
    importedEmails.find((email) => email.message_id === selectedMailId) ??
    importedEmails[0];
  const creatorsByEmail = useMemo(
    () => new Map(creators.map((creator) => [creator.email.toLowerCase(), creator])),
    [creators],
  );
  const selectedMailEmail = selectedImported ? counterpartyEmail(selectedImported) : "";
  const selectedMailCreator = creatorsByEmail.get(selectedMailEmail);
  const selectedMailDisplayName = selectedMailCreator?.name || (
    selectedImported?.direction === "outbound"
      ? selectedImported.recipients?.[0]?.name || selectedMailEmail
      : selectedImported?.sender_name || selectedMailEmail || "未知红人"
  );

  useEffect(() => {
    if (!connected || !selected?.email) return;
    void loadThread(selected.email);
  }, [connected, selected?.email]);

  useEffect(() => {
    if (view !== "mail" || !selectedImported) return;
    mailThreadPanelRef.current?.scrollTo({ top: 0, behavior: "auto" });
    const email = counterpartyEmail(selectedImported);
    if (email) void loadThread(email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedImported?.message_id]);

  function chooseCreator(id: number) {
    setSelectedId(id);
    setApproved(false);
    setNotice("");
    setEditing(false);
    setDeliveryMode("now");
    setScheduledAt("");
  }

  function openMailContextMenu(
    event: ReactMouseEvent,
    creatorName: string,
    creatorEmail: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (!creatorEmail) return;
    setMailContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 118),
      creatorName,
      creatorEmail,
    });
  }

  function navigate(nextView: View) {
    setView(nextView);
    setNotice("");
    setEditing(false);
  }

  async function runAnalysis() {
    if (!connected) {
      setNotice("请先连接飞书并完成邮件迁移，再运行真实邮箱分析。");
      return;
    }
    const owner = analysisOwnerRef.current;
    try {
      const existing = JSON.parse(
        window.localStorage.getItem(ANALYSIS_LOCK_KEY) || "null",
      ) as { owner?: string; expiresAt?: number } | null;
      if (
        existing?.owner &&
        existing.owner !== owner &&
        (existing.expiresAt ?? 0) > Date.now()
      ) {
        setNotice("另一个已打开的工作台页面正在分析。为避免重复占用资源，请保留一个页面，稍后再试。");
        return;
      }
    } catch {
      window.localStorage.removeItem(ANALYSIS_LOCK_KEY);
    }
    window.localStorage.setItem(
      ANALYSIS_LOCK_KEY,
      JSON.stringify({ owner, expiresAt: Date.now() + ANALYSIS_LOCK_TTL_MS }),
    );
    const lockHeartbeat = window.setInterval(() => {
      window.localStorage.setItem(
        ANALYSIS_LOCK_KEY,
        JSON.stringify({ owner, expiresAt: Date.now() + ANALYSIS_LOCK_TTL_MS }),
      );
    }, 20_000);

    setReanalyzing(true);
    setNotice("正在读取邮件：合作类型会先显示，随后继续匹配飞书总表进度…");
    try {
      const fetchAnalysisPages = async (phase: "email" | "base") => {
        let cursor = "";
        let hasMore = true;
        let page = 0;
        let allItems: AnalysisApiItem[] = [];
        let firstMeta: {
          sourceEmailCount?: number | null;
          uniqueCreatorCount?: number | null;
          deduplicatedCount?: number | null;
        } = {};
        let baseError: string | null = null;
        while (hasMore && page < 100) {
          const params = new URLSearchParams({ phase, limit: "50" });
          if (cursor) params.set("cursor", cursor);
          const response = await fetch(`/api/operations/analyze?${params}`, {
            method: "POST",
            cache: "no-store",
            signal: AbortSignal.timeout(60_000),
          });
          const body = await readJsonResponse<{
            items?: AnalysisApiItem[];
            sourceEmailCount?: number | null;
            uniqueCreatorCount?: number | null;
            deduplicatedCount?: number | null;
            hasMore?: boolean;
            nextCursor?: string | null;
            baseError?: string | null;
            error?: string;
          }>(response, phase === "email" ? "邮箱分析失败。" : "飞书总表匹配失败。");
          if (!response.ok) throw new Error(body.error || (phase === "email" ? "邮箱分析失败。" : "飞书总表匹配失败。"));
          if (page === 0) {
            firstMeta = body;
          }
          allItems = allItems.concat(body.items ?? []);
          baseError = body.baseError || baseError;
          hasMore = Boolean(body.hasMore && body.nextCursor);
          cursor = body.nextCursor ?? "";
          page += 1;
          setNotice(
            phase === "email"
              ? `正在分批读取邮件，已整理 ${allItems.length}${firstMeta.uniqueCreatorCount ? ` / ${firstMeta.uniqueCreatorCount}` : ""} 个邮箱账号…`
              : `正在分批匹配飞书总表，已完成 ${allItems.length}${firstMeta.uniqueCreatorCount ? ` / ${firstMeta.uniqueCreatorCount}` : ""} 个邮箱账号…`,
          );
        }
        return { ...firstMeta, items: allItems, baseError };
      };

      const emailBody = await fetchAnalysisPages("email") as {
        items?: AnalysisApiItem[];
        sourceEmailCount?: number | null;
        uniqueCreatorCount?: number | null;
        deduplicatedCount?: number | null;
        baseError?: string | null;
      };
      const items = emailBody.items ?? [];
      if (!items.length) {
        setNotice("没有可分析的真实邮件，请先进入“邮件线程”迁移邮箱内容。");
        return;
      }
      const nextCreators = items.map(toCreator);
      setCreators(nextCreators);
      setDrafts(
        Object.fromEntries(
          nextCreators.map((creator) => [creator.id, creator.draft]),
        ),
      );
      setDraftHtmls(
        Object.fromEntries(
          nextCreators.map((creator) => [
            creator.id,
            plainTextToHtml(creator.draft),
          ]),
        ),
      );
      setSelectedId(nextCreators[0].id);
      setFilter("全部");
      setAnalysisLoaded(true);
      setNotice(
        `邮件分类已显示：${emailBody.sourceEmailCount ?? 0} 封邮件合并为 ${
          emailBody.uniqueCreatorCount ?? items.length
        } 个邮箱账号。正在匹配飞书总表，请稍候…`,
      );

      try {
        const baseBody = await fetchAnalysisPages("base") as {
          items?: AnalysisApiItem[];
          sourceEmailCount?: number | null;
          uniqueCreatorCount?: number | null;
          deduplicatedCount?: number | null;
          baseError?: string | null;
        };
        const matchedCreators = (baseBody.items ?? []).map(toCreator);
        if (matchedCreators.length) setCreators(matchedCreators);
        setNotice(
          baseBody.baseError
            ? `邮件类型已完成；飞书总表匹配失败：${baseBody.baseError}`
            : `分析完成：${baseBody.uniqueCreatorCount ?? matchedCreators.length} 个邮箱账号已显示合作类型与总表进度。`,
        );
      } catch (baseError) {
        const message = baseError instanceof DOMException && baseError.name === "TimeoutError"
          ? "匹配超过60秒，已停止等待。请稍后点“重新分析”，邮件类型仍可正常查看。"
          : baseError instanceof Error
            ? baseError.message
            : "飞书总表暂时无法读取。";
        setCreators((current) => current.map((creator) => creator.analysis
          ? {
              ...creator,
              analysis: {
                ...creator.analysis,
                tableStatus: "unavailable",
                tableMessage: message,
              },
            }
          : creator));
        setNotice(`邮件类型已完成；飞书总表匹配失败：${message}`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "邮箱分析失败。");
    } finally {
      window.clearInterval(lockHeartbeat);
      try {
        const existing = JSON.parse(
          window.localStorage.getItem(ANALYSIS_LOCK_KEY) || "null",
        ) as { owner?: string } | null;
        if (existing?.owner === owner) {
          window.localStorage.removeItem(ANALYSIS_LOCK_KEY);
        }
      } catch {
        window.localStorage.removeItem(ANALYSIS_LOCK_KEY);
      }
      setReanalyzing(false);
    }
  }

  async function loadRoutingSettings() {
    try {
      const response = await fetch("/api/settings/routing", { cache: "no-store" });
      const body = await readJsonResponse<{ config?: RoutingConfig; error?: string }>(
        response,
        "分类规则读取失败。",
      );
      if (!response.ok) throw new Error(body.error || "分类规则读取失败。");
      if (body.config) setRoutingConfig(body.config);
      setRoutingLoaded(true);
    } catch (error) {
      setRoutingLoaded(true);
      setNotice(error instanceof Error ? error.message : "分类规则读取失败。");
    }
  }

  function updateRoutingRule(
    index: number,
    field: "label" | "sourceTable" | "preferredTable" | "subjectKeywords" | "bodyKeywords",
    value: string,
  ) {
    setRoutingConfig((current) => ({
      rules: current.rules.map((rule, ruleIndex) => ruleIndex === index
        ? {
            ...rule,
            [field]: field.endsWith("Keywords")
              ? value.split("\n")
              : value,
          }
        : rule),
    }));
  }

  function appendRoutingKeywordLine(
    index: number,
    field: "subjectKeywords" | "bodyKeywords",
  ) {
    const current = routingConfig.rules[index]?.[field].join("\n") ?? "";
    updateRoutingRule(index, field, `${current}\n`);
  }

  async function saveRoutingSettings() {
    setRoutingSaving(true);
    setNotice("正在保存分类规则…");
    try {
      const response = await fetch("/api/settings/routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: routingConfig }),
      });
      const body = await readJsonResponse<{ config?: RoutingConfig; error?: string }>(
        response,
        "分类规则保存失败。",
      );
      if (!response.ok) throw new Error(body.error || "分类规则保存失败。");
      if (body.config) setRoutingConfig(body.config);
      setAnalysisLoaded(false);
      setNotice("分类规则已保存。返回今日工作台或邮件线程后会自动按新规则重新分析。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "分类规则保存失败。");
    } finally {
      setRoutingSaving(false);
    }
  }

  function createTask() {
    if (!newName.trim() || !newEmail.trim()) return;
    const id = Math.max(...creators.map((creator) => creator.id)) + 1;
    const creator: Creator = {
      id,
      name: newName.trim(),
      handle: "待补充",
      email: newEmail.trim(),
      category: newCategory,
      subject: newCategory === "牙医合作"
        ? "【RANVOO Collab】Next-gen Electric Toothbrush"
        : newCategory === "UGC"
          ? "💸💸💸【Collab Invitation】: Paid UGC Collab with RANVOO"
          : "💸💸💸【Collab Invitation】: Paid Instagram Collab with RANVOO",
      stage: "新建 / 待分类",
      silence: 0,
      urgency: "阻塞",
      latest: "手动创建的任务，尚未匹配真实邮件线程与飞书记录。",
      next: "先匹配邮件、社媒账号和飞书记录，再生成对外话术。",
      lastInbound: "—",
      lastOutbound: "—",
      draft: "请先完成线程与记录匹配，再生成邮件草稿。",
      updates: [
        { field: "合作进度", from: "—", to: "新建 / 待分类" },
        { field: "更新日期", from: "—", to: todayLabel },
      ],
    };
    setCreators((items) => [creator, ...items]);
    setDrafts((items) => ({ ...items, [id]: creator.draft }));
    setDraftHtmls((items) => ({
      ...items,
      [id]: plainTextToHtml(creator.draft),
    }));
    setSelectedId(id);
    setModal(null);
    setNewName("");
    setNewEmail("");
    setView("dashboard");
    setNotice("任务已加入本次演示队列。真实接入后，新记录仍需你确认才会写入飞书。");
  }

  async function requestExecution() {
    if (!connected) {
      setNotice(selected.transfer
        ? `当前为演示模式：已生成邮件、源表更新和“${selected.transfer.target}”建档预览，但不会执行真实操作。`
        : "当前为演示模式：已生成执行预览，但不会发送邮件或修改真实表格。请先配置飞书授权。");
      return;
    }
    if (!approved) {
      setNotice("请先确认邮件正文和所有字段变更。");
      return;
    }
    const html = sanitizeMailHtml(draftHtmls[selected.id] ?? "");
    const plainText = htmlToPlainText(html);
    if (!plainText) {
      setNotice("邮件正文不能为空。");
      return;
    }
    let sendAt: number | undefined;
    if (deliveryMode === "schedule") {
      sendAt = shanghaiInputToTimestamp(scheduledAt);
      if (!isValidScheduledTimestamp(sendAt)) {
        setNotice("请选择至少晚于当前时间5分钟的定时发送时间。");
        return;
      }
    }
    setSendingMail(true);
    setNotice(deliveryMode === "schedule" ? "正在提交定时邮件…" : "正在发送邮件…");
    try {
      const response = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selected.email,
          subject: selected.subject,
          html,
          plainText,
          sourceMessageId: selected.sourceMessageId,
          sendAt,
          confirmed: true,
        }),
      });
      const result = await readJsonResponse<{
        error?: string;
        scheduled?: boolean;
        sendAt?: number | null;
      }>(response, "邮件操作失败。");
      if (!response.ok) throw new Error(result.error || "邮件操作失败。");
      setApproved(false);
      setEditing(false);
      if (result.scheduled && result.sendAt) {
        setNotice(
          `定时邮件已提交，将于 ${formatScheduledDate(result.sendAt)} 发送。为避免提前改变合作进度，多维表将在邮件实际发出后再更新。`,
        );
        return;
      }

      const analysis = selected.analysis;
      const canUpdateTable = Boolean(
        analysis?.tableStatus === "matched" &&
        analysis.tableId &&
        analysis.recordId &&
        analysis.proposedChanges.length,
      );
      if (!canUpdateTable || !analysis?.tableId || !analysis.recordId) {
        setNotice(
          analysis?.tableStatus === "matched"
            ? "邮件已发送；多维表当前没有需要修改的字段。"
            : "邮件已发送；当前未唯一匹配到多维表记录，因此没有自动改表。",
        );
        return;
      }

      setNotice("邮件已发送，正在按已确认的新旧值更新飞书多维表…");
      try {
        const tableResponse = await fetch("/api/operations/update-record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableId: analysis.tableId,
            recordId: analysis.recordId,
            changes: analysis.proposedChanges,
            confirmed: true,
          }),
        });
        const tableResult = await readJsonResponse<{ error?: string }>(
          tableResponse,
          "多维表更新失败。",
        );
        if (!tableResponse.ok) {
          throw new Error(tableResult.error || "多维表更新失败。");
        }
        setAnalysisLoaded(false);
        setNotice("邮件已发送，飞书多维表也已按预览内容更新并完成校验。");
      } catch (tableError) {
        setNotice(
          `邮件已经成功发送，但多维表没有更新：${
            tableError instanceof Error ? tableError.message : "请重新分析后再处理。"
          } 请勿重复发送邮件。`,
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "邮件操作失败。");
    } finally {
      setSendingMail(false);
    }
  }

  function connectFeishu() {
    window.location.assign("/api/auth/feishu/start");
  }

  async function loadImportedMail(query = "", append = false) {
    setMailLoading(true);
    setMailError("");
    try {
      const offset = append ? importedEmails.length : 0;
      const response = await fetch(
        `/api/mail/messages?limit=100&offset=${offset}&q=${encodeURIComponent(query)}&mailbox=${mailboxView}`,
        { cache: "no-store" },
      );
      const body = await readJsonResponse<{
        items?: ImportedEmail[];
        total?: number;
        sync?: MailSync;
        error?: string;
      }>(response, "邮件列表读取失败。");
      if (!response.ok) throw new Error(body.error || "邮件列表读取失败。");
      const items = body.items ?? [];
      const nextItems = append
        ? [
            ...importedEmails,
            ...items.filter(
              (item) =>
                !importedEmails.some(
                  (existing) => existing.message_id === item.message_id,
                ),
            ),
          ]
        : items;
      setImportedEmails(nextItems);
      setMailTotal(body.total ?? nextItems.length);
      setMailLoaded(true);
      setMailSync(body.sync ?? { total_imported: body.total ?? 0, status: "idle" });
      setSelectedMailId((current) =>
        current && nextItems.some((item) => item.message_id === current)
          ? current
          : nextItems[0]?.message_id ?? "",
      );
    } catch (error) {
      setMailError(error instanceof Error ? error.message : "邮件列表读取失败。");
    } finally {
      setMailLoading(false);
    }
  }

  async function loadThread(email: string) {
    if (!email) return;
    setThreadLoading(true);
    try {
      const response = await fetch(`/api/mail/thread?email=${encodeURIComponent(email)}`, { cache: "no-store" });
      const body = await readJsonResponse<{ items?: ImportedEmail[]; error?: string }>(response, "历史邮件读取失败。");
      if (!response.ok) throw new Error(body.error || "历史邮件读取失败。");
      setThreadEmails(body.items ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "历史邮件读取失败。");
    } finally {
      setThreadLoading(false);
    }
  }

  async function changeMailDisposition(
    messageIds: string[],
    action: "archive" | "trash",
    creatorName: string,
    creatorEmail: string,
    wholeThread = false,
  ) {
    const verb = action === "archive" ? "归档" : "移到工作台垃圾箱";
    const confirmed = window.confirm(
      `${verb}“${creatorName}”的${wholeThread ? "整个邮件线程" : ` ${messageIds.length} 封邮件`}？\n\n这只会将邮件从本网站的待处理列表移出，不会删除飞书邮箱原件。`,
    );
    if (!confirmed) return;
    try {
      const response = await fetch("/api/mail/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageIds,
          counterpartyEmail: wholeThread ? creatorEmail : undefined,
          action,
          confirmed: true,
        }),
      });
      const body = await readJsonResponse<{ affected?: number; error?: string }>(response, "邮件整理失败。");
      if (!response.ok) throw new Error(body.error || "邮件整理失败。");
      setImportedEmails((items) => items.filter((item) => wholeThread
        ? counterpartyEmail(item) !== creatorEmail.toLowerCase()
        : !messageIds.includes(item.message_id)));
      setCreators((items) => items.filter((item) => item.email.toLowerCase() !== creatorEmail.toLowerCase()));
      setThreadEmails([]);
      setSelectedMailId("");
      setNotice(`已${verb} ${body.affected ?? messageIds.length} 封邮件；飞书邮箱原件未受影响。`);
      if (view === "mail") await loadImportedMail(search, false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "邮件整理失败。");
    }
  }

  async function syncAllMail(forceFull = false) {
    if (!connected || syncingMail) return;
    if (syncRetryTimerRef.current !== null) {
      window.clearTimeout(syncRetryTimerRef.current);
      syncRetryTimerRef.current = null;
    }
    const lockOwner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const readLock = () => {
      try {
        return JSON.parse(
          window.localStorage.getItem(AUTO_SYNC_LOCK_KEY) ?? "null",
        ) as { owner?: string; expiresAt?: number } | null;
      } catch {
        return null;
      }
    };
    const activeLock = readLock();
    if (
      activeLock?.owner &&
      activeLock.owner !== lockOwner &&
      (activeLock.expiresAt ?? 0) > Date.now()
    ) {
      setSyncProgress("另一个已打开的工作台页面正在同步，请保持该页面打开。");
      return;
    }
    const refreshLock = () => {
      window.localStorage.setItem(
        AUTO_SYNC_LOCK_KEY,
        JSON.stringify({
          owner: lockOwner,
          expiresAt: Date.now() + AUTO_SYNC_LOCK_TTL_MS,
        }),
      );
    };
    refreshLock();
    if (readLock()?.owner !== lockOwner) return;
    const lockHeartbeat = window.setInterval(
      refreshLock,
      AUTO_SYNC_LOCK_TTL_MS / 2,
    );
    setSyncingMail(true);
    setMailError("");
    let pageToken = !forceFull && mailSync.status === "running"
      ? mailSync.page_token ?? ""
      : "";
    let folderIndex = !forceFull && mailSync.status === "running"
      ? mailSync.folder_index ?? 0
      : 0;
    let processed = 0;
    let checked = 0;
    const full = forceFull || mailSync.total_imported === 0;
    try {
      for (let batch = 0; batch < 2000; batch += 1) {
        const resumeFromServer =
          !forceFull &&
          batch === 0 &&
          mailSync.status === "running";
        const result = await requestMailSyncBatch(
          {
            ...(resumeFromServer ? {} : { pageToken, folderIndex }),
            resume: resumeFromServer,
            full,
          },
          (attempt) => setSyncProgress(
            `连接短暂波动，正在自动重试（${attempt}/3），同步进度不会丢失…`,
          ),
        );
        processed += result.imported ?? 0;
        checked += result.checked ?? 0;
        setSyncProgress(
          `正在迁移 ${result.folderName ?? "邮箱文件夹"}（${
            result.foldersCompleted ?? 0
          }/${result.foldersTotal ?? 0}）· 已检查 ${checked} 封 · 网站现有 ${
            result.total ?? 0
          } 封…`,
        );
        if (!result.hasMore) break;
        pageToken = result.pageToken ?? "";
        folderIndex = result.folderIndex ?? folderIndex;
      }
      await loadImportedMail(search, false);
      setSyncProgress(
        processed > 0
          ? `同步完成：本次新增或更新 ${processed} 封邮件。`
          : `同步完成：已检查全部文件夹，没有发现新邮件。`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "邮件同步失败。";
      if (error instanceof Error && isTransientSyncError(error) && autoSyncEnabled) {
        setMailError("");
        setSyncProgress("连接短暂波动，进度已保存，将在1分钟后自动继续同步。");
        syncRetryTimerRef.current = window.setTimeout(() => {
          syncRetryTimerRef.current = null;
          void syncAllMailRef.current(false);
        }, 60_000);
      } else {
        setMailError(message);
        setSyncProgress("");
        if (/授权已过期/.test(message)) setConnected(false);
      }
    } finally {
      window.clearInterval(lockHeartbeat);
      if (readLock()?.owner === lockOwner) {
        window.localStorage.removeItem(AUTO_SYNC_LOCK_KEY);
      }
      setSyncingMail(false);
    }
  }

  useEffect(() => {
    syncAllMailRef.current = syncAllMail;
  });

  useEffect(() => () => {
    if (syncRetryTimerRef.current !== null) {
      window.clearTimeout(syncRetryTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!connected || !autoSyncEnabled) return;

    const checkForNewMail = () => {
      if (document.visibilityState === "visible") {
        void syncAllMailRef.current(false);
      }
    };
    const initialCheck = window.setTimeout(checkForNewMail, 2000);
    const interval = window.setInterval(
      checkForNewMail,
      AUTO_SYNC_INTERVAL_MS,
    );
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [connected, autoSyncEnabled]);

  async function disconnectFeishu() {
    await fetch("/api/auth/feishu/disconnect", { method: "POST" });
    setConnected(false);
    setNotice("飞书账号已从当前浏览器断开。");
  }

  const pageTitle =
    view === "dashboard" ? "今天需要处理什么？" :
    view === "mail" ? "邮件线程与跟进判断" :
    view === "creators" ? "红人合作总览" :
    view === "messages" ? "达人建联话术中心" : "工作流与安全设置";
  const shellStyle = {
    "--green": appearance.accent,
    "--green-2": `color-mix(in srgb, ${appearance.accent} 82%, white)`,
    "--paper": appearance.background,
    "--ui-font-family": appearanceFonts[appearance.font],
    "--ui-scale": appearance.scale,
  } as CSSProperties;
  const contentScaleStyle = {
    zoom: appearance.scale,
    width: `${100 / appearance.scale}%`,
    minHeight: `${100 / appearance.scale}vh`,
  } as CSSProperties;
  return (
    <main
      className={`shell ${appearance.scale === 1 ? "" : "customDisplayScale"}`}
      style={shellStyle}
    >
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("dashboard")} aria-label="返回今日工作台">
          <span className="brandMark">R</span>
          <span className="brandWords"><strong>RANVOO</strong><span>Creator Ops</span></span>
        </button>
        <nav aria-label="主导航">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`navItem ${view === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
            >
              <span>{item.icon}</span>{viewNames[item.id]}
            </button>
          ))}
        </nav>
        <div className="sideBottom">
          <div className="syncCard">
            <span className={`statusDot ${connected ? "online" : ""}`} />
            <div>
              <strong>{connected ? "飞书已连接" : checkingConnection ? "正在检查连接" : "演示模式"}</strong>
              <p>{connected ? "已取得用户授权" : feishuConfigured ? "应用已配置，等待账号授权" : "尚未配置飞书应用授权"}</p>
            </div>
          </div>
          <button
            className="connectButton"
            onClick={connected ? disconnectFeishu : connectFeishu}
            disabled={checkingConnection || (!feishuConfigured && !connected)}
          >
            {connected ? "断开飞书" : checkingConnection ? "检查中…" : "连接飞书"}
          </button>
          <div className="profile"><span>FZ</span><div><strong>Felicia Zhao</strong><small>RANVOO Team</small></div></div>
        </div>
      </aside>

      <section className="content" style={contentScaleStyle}>
        <header className="topbar">
          <div>
            <p className="eyebrow">RANVOO CREATOR OPERATIONS · {viewNames[view]}</p>
            <h1>{pageTitle}</h1>
            <p className="sub">读取与整理可以自动完成；发送邮件、更新表格和终止合作必须由你确认。</p>
          </div>
          <div className="headerActions">
            <button className="ghost" onClick={() => void runAnalysis()} disabled={reanalyzing}>{reanalyzing ? "匹配总表中…" : "↻ 重新分析"}</button>
            <button className="primary" onClick={() => setModal("new")}>＋ 新建任务</button>
          </div>
        </header>

        {notice && <div className="globalNotice" role="status"><span>i</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}

        {view === "dashboard" && (
          <>
            <section className="metrics">
              <button onClick={() => setFilter("今日到期")}><span className="metricIcon red">!</span><div><strong>{urgencyCounts["今日到期"] + urgencyCounts["阻塞"]}</strong><p>今日必须处理</p></div><small>包含阻塞与到期</small></button>
              <button onClick={() => setFilter("需要跟进")}><span className="metricIcon amber">↗</span><div><strong>{urgencyCounts["需要跟进"]}</strong><p>3天未回复</p></div><small>需换角度跟进</small></button>
              <button onClick={() => navigate("mail")}><span className="metricIcon blue">✉</span><div><strong>{creators.length}</strong><p>已分析邮箱</p></div><small>可生成个性化草稿</small></button>
              <button onClick={() => setFilter("终止候选")}><span className="metricIcon gray">⌛</span><div><strong>{urgencyCounts["终止候选"]}</strong><p>终止候选</p></div><small>超过30天</small></button>
            </section>
            <Workspace
              visible={visible} selected={selected} filter={filter} search={search}
              drafts={drafts} draftHtmls={draftHtmls} approved={approved} editing={editing}
              deliveryMode={deliveryMode} scheduledAt={scheduledAt} sendingMail={sendingMail}
              history={threadEmails} historyLoading={threadLoading}
              onFilter={setFilter} onSearch={setSearch} onChoose={chooseCreator}
              onApprove={setApproved} onEdit={setEditing}
              onDraft={(value) => {
                const clean = sanitizeMailHtml(value);
                setDraftHtmls((items) => ({ ...items, [selected.id]: clean }));
                setDrafts((items) => ({
                  ...items,
                  [selected.id]: htmlToPlainText(clean),
                }));
                setApproved(false);
              }}
              onDeliveryMode={(value) => {
                setDeliveryMode(value);
                if (value === "schedule" && !scheduledAt) {
                  setScheduledAt(defaultScheduledInput());
                }
                setApproved(false);
              }}
              onScheduledAt={(value) => {
                setScheduledAt(value);
                setApproved(false);
              }}
              onTransferField={(field, value) => {
                setCreators((items) => items.map((creator) =>
                  creator.id === selected.id && creator.transfer
                    ? {
                        ...creator,
                        transfer: {
                          ...creator.transfer,
                          fields: creator.transfer.fields.map((item) =>
                            item.field === field ? { ...item, value } : item,
                          ),
                        },
                      }
                    : creator,
                ));
                setApproved(false);
              }}
              onExecute={requestExecution}
              onDisposition={(action) => void changeMailDisposition(
                threadEmails.map((email) => email.message_id),
                action,
                selected.name,
                selected.email,
              )}
              onOpenContextMenu={(event, creator) => openMailContextMenu(
                event,
                creator.name,
                creator.email,
              )}
              onNotice={setNotice}
            />
          </>
        )}

        {view === "mail" && (
          <>
            <section className="mailSyncBar">
              <div className="mailSyncIcon">↻</div>
              <div>
                <strong>飞书邮箱同步</strong>
                <p>
                  {mailSync.total_imported > 0
                    ? `已迁移 ${mailSync.total_imported} 封 · ${
                        mailSync.last_synced_at
                          ? `上次同步 ${formatMailDate(mailSync.last_synced_at)}`
                          : "等待下次同步"
                      }`
                    : "首次同步会分批迁移历史邮件，之后只检查新增内容。"}
                </p>
                {(syncProgress || mailError) && (
                  <small className={mailError ? "syncError" : ""}>
                    {mailError || syncProgress}
                  </small>
                )}
              </div>
              {connected ? (
                <div className="syncActions">
                  <label className="autoSyncToggle">
                    <input
                      type="checkbox"
                      checked={autoSyncEnabled}
                      onChange={(event) => setAutoSyncEnabled(event.target.checked)}
                    />
                    <span>
                      自动同步
                      <b>每 10 分钟</b>
                    </span>
                  </label>
                  {mailSync.total_imported > 0 && !syncingMail && (
                    <button
                      className="secondaryAction"
                      onClick={() => void syncAllMail(true)}
                    >
                      完整重扫
                    </button>
                  )}
                  <button
                    onClick={() => void syncAllMail(false)}
                    disabled={syncingMail}
                  >
                    {syncingMail
                      ? "正在同步…"
                      : mailSync.status === "running"
                        ? "继续同步"
                        : mailSync.total_imported
                          ? "同步新邮件"
                          : "迁移全部邮件"}
                  </button>
                </div>
              ) : (
                <button onClick={connectFeishu}>先连接飞书</button>
              )}
            </section>
            <section className="pageGrid mailWorkspaceGrid">
              <div className="panel mailListPanel">
                <div className="panelHead">
                  <div>
                    <h2>{mailboxView === "inbox" ? "收件箱" : "已发送"}</h2>
                    <p>
                      {mailLoading
                        ? "正在读取…"
                        : mailLoaded
                          ? `已显示 ${importedEmails.length} / 共 ${mailTotal} 个邮件账号`
                          : "每个邮箱只显示最新一封，可搜索全部历史"}
                    </p>
                  </div>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索邮件" />
                </div>
                <div className="mailboxTabs" role="tablist" aria-label="邮件箱分类">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mailboxView === "inbox"}
                    className={mailboxView === "inbox" ? "active" : ""}
                    onClick={() => {
                      setMailboxView("inbox");
                      setImportedEmails([]);
                      setSelectedMailId("");
                    }}
                  >
                    <span>收件箱</span>
                    <small>红人发来的邮件</small>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mailboxView === "sent"}
                    className={mailboxView === "sent" ? "active" : ""}
                    onClick={() => {
                      setMailboxView("sent");
                      setImportedEmails([]);
                      setSelectedMailId("");
                    }}
                  >
                    <span>已发送</span>
                    <small>Felicia 发出的邮件</small>
                  </button>
                </div>
                <div className="mailList">
                  {importedEmails.length > 0
                    ? importedEmails.map((email) => {
                        const emailAddress = counterpartyEmail(email);
                        const creator = creatorsByEmail.get(emailAddress);
                        const displayName = creator?.name || (email.direction === "outbound"
                          ? email.recipients?.[0]?.name || emailAddress
                          : email.sender_name || emailAddress || "未知红人");
                        return (
                        <button
                          key={email.message_id}
                          className={selectedImported?.message_id === email.message_id ? "selectedMail" : ""}
                          onClick={() => setSelectedMailId(email.message_id)}
                          onContextMenu={(event) => openMailContextMenu(event, displayName, emailAddress)}
                          title="右键可删除邮件线程"
                        >
                          <span className="avatar">{initials(displayName)}</span>
                          <span>
                            <strong>{displayName}</strong>
                            <b>{email.subject}</b>
                            <small>{formatMailDate(email.sent_at)} · 本分类同邮箱 {email.message_count ?? 1} 封</small>
                          </span>
                          <span className="mailTagStack">
                            <em className={`creatorTypeTag type-${creator?.category ?? "未分类"}`}>{creatorTypeLabel(creator?.category, creator?.categoryLabel)}</em>
                            <em className={`mailStageTag status-${creator?.analysis?.tableStatus ?? "matching"}`}>{tableStageLabel(creator)}</em>
                          </span>
                        </button>
                      );})
                    : connected && mailLoaded
                      ? (
                        <div className="emptyMail">
                          {mailboxView === "inbox"
                            ? "收件箱暂时没有已迁移的邮件。"
                            : "已发送中暂时没有已迁移的邮件。"}
                        </div>
                      )
                      : visible.map((creator) => (
                        <button key={creator.id} className={selected.id === creator.id ? "selectedMail" : ""} onClick={() => chooseCreator(creator.id)}>
                          <span className="avatar">{initials(creator.name)}</span>
                          <span><strong>{creator.name}</strong><b>{creator.subject}</b><small>{creator.lastOutbound}</small></span>
                          <em>{creator.silence}天</em>
                        </button>
                      ))}
                </div>
                {importedEmails.length < mailTotal && (
                  <button
                    className="loadMore"
                    disabled={mailLoading}
                    onClick={() => void loadImportedMail(search, true)}
                  >
                    {mailLoading ? "正在加载…" : "加载更多邮件"}
                  </button>
                )}
              </div>
              {selectedImported ? (
                <div className="panel threadPanel" ref={mailThreadPanelRef}>
                  <div className="mailAccountHeader">
                    <span className="avatar">FZ</span>
                    <div><b>当前邮件账户 · {mailboxView === "inbox" ? "收件箱" : "已发送"}</b><strong>Felicia · 飞书邮箱</strong><small>{connected ? "已连接，可在本页预览与回复" : "未连接"}</small></div>
                  </div>
                  <div className="threadBadges">
                    <span className={`categoryTag type-${selectedMailCreator?.category ?? "未分类"}`}>
                      {creatorTypeLabel(selectedMailCreator?.category, selectedMailCreator?.categoryLabel)}
                    </span>
                    <span className={`categoryTag stageTag status-${selectedMailCreator?.analysis?.tableStatus ?? "matching"}`}>
                      {tableStageLabel(selectedMailCreator)}
                    </span>
                  </div>
                  <h2>{selectedMailDisplayName}</h2>
                  <p className="threadSubject">{selectedImported.subject}</p>
                  <div className="mailMeta">
                    <span><b>对方邮箱</b>{selectedMailEmail || "—"}</span>
                    <span><b>时间</b>{formatMailDate(selectedImported.sent_at)}</span>
                  </div>
                  <div className="mailWorkflowBridge">
                    <span><b>飞书总表匹配</b>{selectedMailCreator?.analysis?.tableMessage || tableStageLabel(selectedMailCreator)}</span>
                    <button onClick={() => {
                      if (selectedMailCreator) chooseCreator(selectedMailCreator.id);
                      navigate("dashboard");
                    }}>转到今日工作台处理 →</button>
                  </div>
                  <CompactEmailPreview
                    value={selectedImported.body_text || selectedImported.snippet || "这封邮件没有可显示的纯文本正文。"}
                  />
                  {selectedMailEmail && (
                    <MailReplyComposer
                      key={[
                        selectedImported.message_id,
                        selectedMailCreator?.analysis?.recordId,
                        selectedMailCreator?.analysis?.tableStage,
                        selectedMailCreator?.analysis?.progressField,
                        selectedMailCreator?.analysis?.updateDateField,
                      ].join(":")}
                      email={selectedImported}
                      recipientEmail={selectedMailEmail}
                      connected={connected}
                      creator={selectedMailCreator}
                      onNotice={setNotice}
                      onTableUpdated={() => setAnalysisLoaded(false)}
                    />
                  )}
                  <ThreadHistory messages={threadEmails} loading={threadLoading} />
                  <div className="mailDispositionTools">
                    <b>人工判断无需处理？</b>
                    <button type="button" onClick={() => void changeMailDisposition(threadEmails.map((email) => email.message_id), "archive", selectedMailDisplayName, selectedMailEmail)}>归档线程</button>
                    <button type="button" className="dangerGhost" onClick={() => void changeMailDisposition(threadEmails.map((email) => email.message_id), "trash", selectedMailDisplayName, selectedMailEmail)}>移到工作台垃圾箱</button>
                  </div>
                </div>
              ) : (
                <div className="panel threadPanel">
                  <span className="categoryTag">{selected.category}</span>
                  <h2>{selected.name}</h2><p className="threadSubject">{selected.subject}</p>
                  <div className="message incoming"><small>最近来信</small><p>{selected.lastInbound}</p></div>
                  <div className="message outgoing"><small>最近发出</small><p>{selected.lastOutbound}</p></div>
                  <div className="threadDecision"><strong>当前判断：{selected.stage}</strong><p>{selected.latest}</p><button onClick={() => navigate("dashboard")}>查看回复与表格变更预览 →</button></div>
                </div>
              )}
            </section>
          </>
        )}

        {view === "creators" && (
          <section className="panel">
            <div className="panelHead"><div><h2>全部红人记录</h2><p>演示数据 · 可按合作类型和阶段查看</p></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索红人" /></div>
            <div className="creatorTable">
              <div className="tableRow tableHeader"><span>红人</span><span>合作类型</span><span>当前阶段</span><span>未回复</span><span>优先级</span></div>
              {visible.map((creator) => (
                <button className="tableRow" key={creator.id} onClick={() => { chooseCreator(creator.id); navigate("dashboard"); }}>
                  <span className="creatorCell"><i className="avatar">{initials(creator.name)}</i><span><strong>{creator.name}</strong><small>{creator.handle}</small></span></span>
                  <span>{creator.category}</span><span>{creator.stage}</span><span>{creator.silence} 天</span><span className={`tablePill p-${creator.urgency}`}>{creator.urgency}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {view === "messages" && (
          <section className="templateGrid">
            {messageTemplates.map((template) => (
              <article key={template.title}>
                <span>{template.category}</span><h2>{template.title}</h2><p>{template.body}</p>
                <div><small>使用原则</small><ul><li>承接红人的最新回复</li><li>不虚构价格、权益或进度</li><li>每次跟进必须提供新价值</li></ul></div>
                <button onClick={() => { setNotice(`已选择“${template.title}”。请在具体红人线程中根据真实上下文改写。`); navigate("dashboard"); }}>用于当前任务</button>
              </article>
            ))}
          </section>
        )}

        {view === "settings" && (
          <section className="settingsGrid">
            <section className="appearanceSettingsPanel">
              <div className="appearanceSettingsHead">
                <span className="settingIcon">Aa</span>
                <div>
                  <h2>页面显示与阅读偏好</h2>
                  <p>调整字体、整体显示大小和主题颜色；设置只保存在当前浏览器。</p>
                </div>
                <button type="button" onClick={() => setAppearance(defaultAppearance)}>恢复默认</button>
              </div>
              <div className="appearanceControls">
                <label>页面字体
                  <select value={appearance.font} onChange={(event) => setAppearance((current) => ({
                    ...current,
                    font: event.target.value as AppearancePreferences["font"],
                  }))}>
                    <option value="modern">清晰现代</option>
                    <option value="rounded">柔和圆体</option>
                    <option value="serif">经典衬线</option>
                  </select>
                </label>
                <label>显示大小 <b>{Math.round(appearance.scale * 100)}%</b>
                  <input type="range" min="85" max="125" step="5" value={Math.round(appearance.scale * 100)} onChange={(event) => setAppearance((current) => ({
                    ...current,
                    scale: Number(event.target.value) / 100,
                  }))} />
                </label>
                <label>主色
                  <span className="colorControl"><input type="color" value={appearance.accent} onChange={(event) => setAppearance((current) => ({ ...current, accent: event.target.value }))} /><code>{appearance.accent}</code></span>
                </label>
                <label>页面底色
                  <span className="colorControl"><input type="color" value={appearance.background} onChange={(event) => setAppearance((current) => ({ ...current, background: event.target.value }))} /><code>{appearance.background}</code></span>
                </label>
              </div>
            </section>
            <section className="routingSettingsPanel">
              <div className="routingSettingsHead">
                <div>
                  <span className="settingIcon">类</span>
                  <div>
                    <h2>红人类型与总表路由参数</h2>
                    <p>标题关键词优先于正文关键词。每行填写一个关键词；保存后会重新分析全部邮箱。</p>
                  </div>
                </div>
                <div className="routingActions">
                  <button type="button" onClick={() => setRoutingConfig(structuredClone(defaultRoutingConfig))}>恢复默认</button>
                  <button type="button" className="primary" disabled={!connected || routingSaving} onClick={() => void saveRoutingSettings()}>
                    {routingSaving ? "保存中…" : "保存并重新分析"}
                  </button>
                </div>
              </div>
              <div className="routingRuleGrid">
                {routingConfig.rules.map((rule, index) => (
                  <article className="routingRuleCard" key={rule.category}>
                    <div className="routingRuleCardHead">
                      <strong>{rule.category}</strong>
                      <small>每行一个关键词，允许先留空；保存时自动去重和清理空行。</small>
                    </div>
                    <div className="routingTableFields">
                      <label>网页显示名称
                        <input value={rule.label} onChange={(event) => updateRoutingRule(index, "label", event.target.value)} />
                      </label>
                      <label>对应来源表名称
                        <input value={rule.sourceTable} onChange={(event) => updateRoutingRule(index, "sourceTable", event.target.value)} />
                      </label>
                      <label>优先合作表名称
                        <input value={rule.preferredTable} onChange={(event) => updateRoutingRule(index, "preferredTable", event.target.value)} />
                      </label>
                    </div>
                    <div className="routingKeywordFields">
                      <label>邮件标题关键词（优先）
                        <textarea rows={7} value={rule.subjectKeywords.join("\n")} onChange={(event) => updateRoutingRule(index, "subjectKeywords", event.target.value)} />
                        <span className="keywordEditorFoot">
                          <small>{rule.subjectKeywords.filter((item) => item.trim()).length} 条关键词</small>
                          <button type="button" onClick={() => appendRoutingKeywordLine(index, "subjectKeywords")}>＋另起一行</button>
                        </span>
                      </label>
                      <label>正文/职业关键词（兜底）
                        <textarea rows={7} value={rule.bodyKeywords.join("\n")} onChange={(event) => updateRoutingRule(index, "bodyKeywords", event.target.value)} />
                        <span className="keywordEditorFoot">
                          <small>{rule.bodyKeywords.filter((item) => item.trim()).length} 条关键词</small>
                          <button type="button" onClick={() => appendRoutingKeywordLine(index, "bodyKeywords")}>＋另起一行</button>
                        </span>
                      </label>
                    </div>
                  </article>
                ))}
              </div>
              <p className="routingHelp">同邮箱同时出现在来源表与优先合作表时，以优先合作表的合作进度为准，发送后也只更新优先合作表。新增称呼或细分类型时，可修改显示名称、两张表名和关键词。</p>
            </section>
            <article><span className="settingIcon">3</span><div><h2>跟进提醒</h2><p>最后一封发出邮件满3个完整自然日且无回复时进入“需要跟进”。</p></div><strong>已启用</strong></article>
            <article><span className="settingIcon">30</span><div><h2>终止候选</h2><p>超过30天无回复只标记为候选，不会自动终止或发送收尾邮件。</p></div><strong>需人工确认</strong></article>
            <article><span className="settingIcon">✓</span><div><h2>执行确认门槛</h2><p>发送前展示最终邮件、匹配记录和每个字段的新旧值。</p></div><strong>强制开启</strong></article>
            <article><span className="settingIcon">日</span><div><h2>更新日期联动</h2><p>合作进度发生变化时，将“更新日期”同步设为当天；仅查看或进度未变时不更新。</p></div><strong>已启用</strong></article>
            <article><span className="settingIcon">AI</span><div><h2>个性化智能回复</h2><p>同一邮箱的最新8封邮件、合作类型和飞书总表状态共同生成 Prompt；支持语气、情绪、字数和语言选择。</p></div><strong>只生成草稿</strong></article>
            <article><span className="settingIcon">▣</span><div><h2>工作台归档</h2><p>人工判断无需处理时，可将整个邮件线程从待处理队列归档或移到工作台垃圾箱；不删除飞书原邮件。</p></div><strong>需确认</strong></article>
            <article className="transferSetting">
              <span className="settingIcon">→</span>
              <div>
                <h2>阶段触发建档</h2>
                <p>达到确定合作或产品试验后，查重并预览目标表记录；确认前不新增。</p>
                <div className="ruleLines">
                  <span><b>UGC👖</b> → UGC合作</span>
                  <span><b>牙刷红人👖</b> → 🪥合作红人（26年4月后</span>
                  <span><b>专业人员👖</b> → 🪥牙医合作</span>
                </div>
              </div>
              <strong>需人工确认</strong>
            </article>
            <article>
              <span className="settingIcon">飞</span>
              <div>
                <h2>飞书连接</h2>
                <p>{connected ? "当前浏览器已完成飞书用户授权。" : feishuConfigured ? "企业自建应用已配置，可以开始用户授权。" : "企业自建应用尚未完成配置。"}</p>
              </div>
              {connected
                ? <button onClick={disconnectFeishu}>断开连接</button>
                : <button onClick={connectFeishu} disabled={!feishuConfigured || checkingConnection}>授权连接</button>}
            </article>
          </section>
        )}
      </section>

      {mailContextMenu && (
        <div
          className="mailContextMenu"
          role="menu"
          aria-label={`${mailContextMenu.creatorName}邮件操作`}
          style={{ left: mailContextMenu.x, top: mailContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <strong>{mailContextMenu.creatorName}</strong>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const target = mailContextMenu;
              setMailContextMenu(null);
              void changeMailDisposition(
                [],
                "trash",
                target.creatorName,
                target.creatorEmail,
                true,
              );
            }}
          >
            删除邮件线程
          </button>
          <small>仅从工作台移除，保留飞书原件</small>
        </div>
      )}

      {modal && (
        <div className="modalBackdrop" role="presentation" onMouseDown={() => setModal(null)}>
          <section className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modalClose" onClick={() => setModal(null)} aria-label="关闭">×</button>
            {modal === "new" ? (
              <>
                <p className="eyebrow">NEW TASK</p><h2>新建达人跟进任务</h2><p>先创建演示任务；真实飞书写入仍需单独确认。</p>
                <label>红人姓名<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="例如：Emma Wilson" /></label>
                <label>邮箱<input value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="creator@example.com" type="email" /></label>
                <label>合作类型<select value={newCategory} onChange={(event) => setNewCategory(event.target.value as Category)}><option>UGC</option><option>牙医合作</option><option>商业化红人</option></select></label>
                <button className="primary modalAction" disabled={!newName.trim() || !newEmail.trim()} onClick={createTask}>加入任务队列</button>
              </>
            ) : (
              <>
                <p className="eyebrow">FEISHU CONNECTION</p><h2>{feishuConfigured ? "飞书应用已配置" : "连接飞书前需要完成"}</h2>
                {feishuConfigured
                  ? <p>应用权限、回调地址和加密凭证已经准备好。点击下方按钮后，在飞书页面确认授权即可。</p>
                  : <ol><li>在飞书开放平台创建企业自建应用</li><li>配置邮箱读取/回复和多维表格读写权限</li><li>发布应用版本并由企业管理员审批</li><li>安全配置 App ID 与 App Secret，不写入代码仓库</li></ol>}
                <div className="safetyBox">接入后依然不会自动发送或更新。每一批操作都必须先展示预览并由 Felicia 明确确认。</div>
                <button className="primary modalAction" onClick={feishuConfigured ? connectFeishu : () => setModal(null)}>
                  {feishuConfigured ? "使用飞书授权" : "我知道了"}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function ThreadHistory({ messages, loading }: { messages: ImportedEmail[]; loading: boolean }) {
  return (
    <details className="threadHistory" open>
      <summary>历史邮件 <span>{loading ? "读取中…" : `${messages.length} 封`}</span></summary>
      <div className="threadTimeline">
        {messages.length ? messages.map((message) => {
          const fullBody = message.body_text || message.snippet || "无可显示内容";
          const compact = (message.snippet || fullBody).replace(/\s+/g, " ").trim();
          const preview = compact.length > 220
            ? `${compact.slice(0, 220).trimEnd()}…`
            : compact;
          return (
            <details
              key={message.message_id}
              className={`historyMessage ${message.direction === "outbound" ? "outbound" : "inbound"}`}
            >
              <summary>
                <span className="historyMessageMeta">
                  <b>{message.direction === "outbound" ? "Felicia" : message.sender_name || message.sender_email || "红人"}</b>
                  <time>{formatMailDate(message.sent_at)}</time>
                </span>
                <strong>{message.subject}</strong>
                <span className="historyPreview">{preview}</span>
                <span className="historyExpand">展开完整正文</span>
              </summary>
              <div className="historyFullBody">
                <ImportedEmailBody value={fullBody} />
              </div>
            </details>
          );
        }) : <p className="emptyHistory">{loading ? "正在读取历史邮件…" : "暂无历史邮件。"}</p>}
      </div>
    </details>
  );
}

function SmartReplyGenerator({
  creatorName, creatorEmail, category, emailStage, tableStage, scenario,
  onGenerated, onNotice,
}: {
  creatorName: string;
  creatorEmail: string;
  category: string;
  emailStage: string;
  tableStage?: string | null;
  scenario: string;
  onGenerated: (reply: string) => void;
  onNotice: (value: string) => void;
}) {
  const [controls, setControls] = useState<ReplyControls>(defaultReplyControls);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");

  async function generate() {
    setGenerating(true);
    onNotice("正在结合该红人的历史邮件和飞书总表状态生成回复…");
    try {
      const response = await fetch("/api/mail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorName, creatorEmail, category, emailStage, tableStage,
          scenario, ...controls,
        }),
      });
      const body = await readJsonResponse<{ reply?: string; prompt?: string; provider?: string; error?: string }>(response, "智能回复生成失败。");
      if (!response.ok || !body.reply) throw new Error(body.error || "智能回复生成失败。");
      setPrompt(body.prompt ?? "");
      onGenerated(body.reply);
      onNotice(body.provider === "fallback" ? "已生成安全回复草稿（AI 暂时不可用，已使用上下文规则）。" : "已根据该红人的历史邮件与飞书状态生成个性化回复。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "智能回复生成失败。");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="smartReplyBox">
      <div className="replyControls">
        <label>语气<select value={controls.tone} onChange={(event) => setControls({ ...controls, tone: event.target.value as ReplyControls["tone"] })}><option value="warm">温暖鼓励</option><option value="professional">专业自然</option><option value="friendly">轻松亲切</option><option value="firm">坚定推进</option></select></label>
        <label>情绪<select value={controls.emotion} onChange={(event) => setControls({ ...controls, emotion: event.target.value as ReplyControls["emotion"] })}><option value="enthusiastic">高热情</option><option value="balanced">适度热情</option><option value="restrained">克制</option></select></label>
        <label>字数<select value={controls.length} onChange={(event) => setControls({ ...controls, length: event.target.value as ReplyControls["length"] })}><option value="short">简短 60–90</option><option value="standard">标准 100–150</option><option value="detailed">详细 160–220</option></select></label>
        <label>语言<select value={controls.language} onChange={(event) => setControls({ ...controls, language: event.target.value as ReplyControls["language"] })}><option>English</option><option>Spanish</option></select></label>
      </div>
      <button type="button" className="generateReply" onClick={() => void generate()} disabled={generating || !creatorEmail}>{generating ? "正在生成…" : "✦ 生成智能回复"}</button>
      {prompt && <details className="promptPreview"><summary>查看本次内部 Prompt</summary><pre>{prompt}</pre></details>}
    </section>
  );
}

function Workspace({
  visible, selected, filter, search, drafts, draftHtmls, approved, editing,
  deliveryMode, scheduledAt, sendingMail,
  history, historyLoading,
  onFilter, onSearch, onChoose, onApprove, onEdit, onDraft,
  onDeliveryMode, onScheduledAt, onExecute, onDisposition, onNotice,
  onTransferField, onOpenContextMenu,
}: {
  visible: Creator[]; selected: Creator; filter: string; search: string;
  drafts: Record<number, string>; draftHtmls: Record<number, string>;
  approved: boolean; editing: boolean;
  deliveryMode: "now" | "schedule"; scheduledAt: string; sendingMail: boolean;
  history: ImportedEmail[]; historyLoading: boolean;
  onFilter: (value: string) => void; onSearch: (value: string) => void;
  onChoose: (id: number) => void; onApprove: (value: boolean) => void;
  onEdit: (value: boolean) => void; onDraft: (value: string) => void;
  onDeliveryMode: (value: "now" | "schedule") => void;
  onScheduledAt: (value: string) => void; onExecute: () => void;
  onTransferField: (field: string, value: string) => void;
  onDisposition: (action: "archive" | "trash") => void;
  onOpenContextMenu: (event: ReactMouseEvent, creator: Creator) => void;
  onNotice: (value: string) => void;
}) {
  return (
    <section className="workspace">
      <div className="queue">
        <div className="sectionHead"><div><h2>今日任务队列</h2><p>点击任务查看判断依据与操作预览</p></div><span>{visible.length} 项</span></div>
        <div className="queueTools">
          <div className="filters">{filterItems.map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => onFilter(item)}>{item}</button>)}</div>
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索" aria-label="搜索任务" />
        </div>
        <div className="taskList">
          {visible.length === 0 && <div className="emptyState"><strong>没有匹配的任务</strong><p>清除搜索或切换筛选条件。</p></div>}
          {visible.map((creator) => (
            <button
              key={creator.id}
              className={`taskCard ${selected.id === creator.id ? "current" : ""}`}
              onClick={() => onChoose(creator.id)}
              onContextMenu={(event) => onOpenContextMenu(event, creator)}
              title="右键可删除邮件线程"
            >
              <div className={`priorityPill p-${creator.urgency}`}>{creator.urgency}</div>
              <div className="avatar">{initials(creator.name)}</div>
              <div className="taskMain">
                <div className="taskTitle"><strong>{creator.name}</strong></div>
                <div className="taskBadges">
                  <span className={`creatorTypeTag type-${creator.category}`}>{creatorTypeLabel(creator.category, creator.categoryLabel)}</span>
                  <span className={`creatorProgressTag status-${creator.analysis?.tableStatus ?? "matching"}`}>{tableStageLabel(creator)}</span>
                </div>
                <p>{creator.subject}</p>
                <small>{creator.urgency} · {creator.silence}天未收到回复</small>
              </div>
              <span className="chevron">›</span>
            </button>
          ))}
        </div>
      </div>

      <aside className="detail">
        <div className="detailTop"><div className="avatar large">{initials(selected.name)}</div><div><h2>{selected.name}</h2><p>{selected.handle} · {selected.email}</p></div><span className={`priorityPill p-${selected.urgency}`}>{selected.urgency}</span></div>
        <div className="route"><span>合作类型</span><strong>{creatorTypeLabel(selected.category, selected.categoryLabel)}</strong><span className="confidence">{selected.analysis?.confidence ?? "高"}置信度</span></div>
        <div className="statusSource">
          <span className={`status-${selected.analysis?.tableStatus ?? "matching"}`}><b>飞书总表状态</b>{tableStageLabel(selected)}</span>
          <span><b>时间提醒</b>{selected.urgency} · {selected.silence}天</span>
        </div>
        {selected.analysis?.tableMessage && (
          <p className={`baseMatchDetail statusText-${selected.analysis.tableStatus}`}>
            {selected.analysis.tableMessage}
          </p>
        )}
        {selected.analysis && (
          <div className="analysisMeta">
            <span><b>{selected.analysis.messageCount}</b>封邮件</span>
            <span><b>{selected.analysis.threadCount}</b>个线程</span>
            <span>
              <b>{selected.analysis.tableName ?? "待路由"}</b>
              {selected.analysis.tableStatus === "matching"
                ? "正在读取并匹配总表"
                : selected.analysis.tableStatus === "matched"
                ? "已匹配记录"
                : selected.analysis.tableStatus === "duplicate"
                  ? "同邮箱重复，禁止自动写入"
                  : selected.analysis.tableStatus === "unmatched"
                    ? "未找到同邮箱记录"
                    : selected.analysis.tableMessage || "多维表待连接"}
            </span>
          </div>
        )}
        <div className="analysisBlock"><label>判断依据</label><p>{selected.latest}</p><label>建议下一步</label><p>{selected.next}</p></div>
        <ThreadHistory messages={history} loading={historyLoading} />
        <div className="draftBlock">
          <div className="blockHead"><label>邮件回复预览</label><button onClick={() => onEdit(!editing)}>{editing ? "完成" : "编辑"}</button></div>
          <SmartReplyGenerator
            key={selected.id}
            creatorName={selected.name}
            creatorEmail={selected.email}
            category={selected.category}
            emailStage={selected.analysis?.emailStage ?? selected.stage}
            tableStage={selected.analysis?.tableStage}
            scenario={selected.analysis?.messageScenario ?? selected.next}
            onGenerated={(reply) => { onDraft(plainTextToHtml(reply)); onEdit(true); }}
            onNotice={onNotice}
          />
          {editing ? (
            <RichTextEditor
              value={draftHtmls[selected.id] ?? plainTextToHtml(drafts[selected.id] ?? "")}
              onChange={onDraft}
            />
          ) : (
            <div
              className="richDraftPreview"
              dangerouslySetInnerHTML={{
                __html: sanitizeMailHtml(
                  draftHtmls[selected.id] ?? plainTextToHtml(drafts[selected.id] ?? ""),
                ),
              }}
            />
          )}
        </div>
        <div className="deliveryBlock">
          <label>发送时间</label>
          <div className="deliveryChoices">
            <button
              type="button"
              className={deliveryMode === "now" ? "selected" : ""}
              onClick={() => onDeliveryMode("now")}
            >立即发送</button>
            <button
              type="button"
              className={deliveryMode === "schedule" ? "selected" : ""}
              onClick={() => onDeliveryMode("schedule")}
            >定时发送</button>
          </div>
          {deliveryMode === "schedule" && (
            <div className="schedulePicker">
              <input
                type="datetime-local"
                value={scheduledAt}
                min={minimumScheduledInput()}
                onChange={(event) => onScheduledAt(event.target.value)}
                aria-label="定时发送时间（北京时间）"
              />
              <small>北京时间，至少提前5分钟；提交后由飞书服务器按时发送。</small>
            </div>
          )}
        </div>
        <div className="updates"><label>飞书表格更新预览</label>{selected.updates.map((update) => <div className="updateRow" key={update.field}><span>{update.field}</span><del>{update.from}</del><b>→</b><ins>{update.to}</ins></div>)}</div>
        {selected.transfer && (
          <div className="transferPreview">
            <div className="transferTitle"><label>目标表建档预览</label><span>待确认</span></div>
            <div className="transferPath"><b>{selected.transfer.source}</b><i>→</i><b>{selected.transfer.target}</b></div>
            <p><strong>触发依据</strong>{selected.transfer.trigger}</p>
            <p><strong>查重结果</strong>{selected.transfer.match}</p>
            <div className="copyFields">
              {selected.transfer.fields.map((item) => item.field === "合作进度" ? (
                <label className="editableTransferField" key={item.field}>
                  <b>{item.field}</b>
                  <input
                    type="text"
                    list={`transfer-stages-${selected.id}`}
                    value={item.value}
                    onChange={(event) => onTransferField(item.field, event.target.value)}
                    aria-label="目标表合作进度"
                    placeholder="输入或选择合作进度"
                  />
                  <small>可输入自定义状态，也可从列表选择</small>
                  <datalist id={`transfer-stages-${selected.id}`}>
                    {collaborationStageOptions.map((stage) => (
                      <option key={stage} value={stage} />
                    ))}
                  </datalist>
                </label>
              ) : (
                <span key={item.field}><b>{item.field}</b>{item.value}</span>
              ))}
            </div>
          </div>
        )}
        <label className="confirm"><input type="checkbox" checked={approved} onChange={(event) => onApprove(event.target.checked)} /><span>我已核对邮件正文及以上所有字段变更</span></label>
        <button className="execute" onClick={onExecute} disabled={sendingMail}>
          {sendingMail
            ? "正在提交…"
            : deliveryMode === "schedule"
              ? "确认并定时发送"
              : "确认并立即发送"}
        </button>
        <p className="safetyNote">立即发送成功后，将按上方已确认的新旧值同步更新飞书总表；定时邮件不会提前改表</p>
        <div className="noActionTools">
          <span>人工判断无需处理</span>
          <button type="button" onClick={() => onDisposition("archive")} disabled={!history.length}>归档线程</button>
          <button type="button" className="dangerGhost" onClick={() => onDisposition("trash")} disabled={!history.length}>移到工作台垃圾箱</button>
        </div>
      </aside>
    </section>
  );
}

function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  function run(command: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(sanitizeMailHtml(editorRef.current?.innerHTML ?? ""));
  }

  function addLink() {
    const url = window.prompt("请输入链接地址（https://…）");
    if (!url) return;
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    run("createLink", normalized);
  }

  const controls = [
    { label: "B", title: "加粗", command: "bold" },
    { label: "I", title: "斜体", command: "italic" },
    { label: "U", title: "下划线", command: "underline" },
    { label: "▰", title: "黄色高亮", command: "hiliteColor", value: "#fff0a8" },
    { label: "• 列表", title: "项目符号列表", command: "insertUnorderedList" },
    { label: "1. 列表", title: "编号列表", command: "insertOrderedList" },
  ];

  return (
    <div className="richEditorShell">
      <div className="richToolbar" role="toolbar" aria-label="邮件格式工具">
        {controls.map((control) => (
          <button
            key={control.title}
            type="button"
            title={control.title}
            aria-label={control.title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(control.command, control.value)}
          >{control.label}</button>
        ))}
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={addLink}>链接</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => run("removeFormat")}>清除格式</button>
      </div>
      <div
        ref={editorRef}
        className="richEditor"
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => onChange(sanitizeMailHtml(event.currentTarget.innerHTML))}
        aria-label="邮件正文编辑器"
      />
    </div>
  );
}

function MailReplyComposer({
  email,
  recipientEmail,
  connected,
  creator,
  onNotice,
  onTableUpdated,
}: {
  email: ImportedEmail;
  recipientEmail: string;
  connected: boolean;
  creator?: Creator;
  onNotice: (value: string) => void;
  onTableUpdated: () => void;
}) {
  const firstName = creator?.name?.trim().split(/\s+/)[0] || email.sender_name?.trim().split(/\s+/)[0] || "there";
  const [open, setOpen] = useState(true);
  const [html, setHtml] = useState(
    `<p>Hi ${firstName},</p><p><br></p><p>Best,<br>Felicia</p>`,
  );
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [sendAtInput, setSendAtInput] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [syncTable, setSyncTable] = useState(true);
  const [progressValue, setProgressValue] = useState(
    creator?.analysis?.tableStage || creator?.analysis?.emailStage || "",
  );
  const [submitting, setSubmitting] = useState(false);
  const subject = /^\s*re:/i.test(email.subject)
    ? email.subject
    : `Re: ${email.subject}`;
  const tableAnalysis = creator?.analysis;
  const canUpdateTableRecord = Boolean(
    tableAnalysis?.tableStatus === "matched" &&
    tableAnalysis.tableId &&
    tableAnalysis.recordId,
  );
  const canChooseProgress = Boolean(canUpdateTableRecord);
  const canSyncProgress = Boolean(
    canUpdateTableRecord &&
    tableAnalysis?.progressField &&
    tableAnalysis.updateDateField,
  );
  const normalizedProgress = progressValue.trim();
  const progressChanged = Boolean(
    canSyncProgress &&
    normalizedProgress &&
    normalizedProgress !== (tableAnalysis?.tableStage ?? ""),
  );
  const protectedFields = new Set([
    tableAnalysis?.progressField,
    tableAnalysis?.updateDateField,
  ].filter((field): field is string => Boolean(field)));
  const tableChanges = [
    ...(progressChanged && tableAnalysis?.progressField
      ? [{
          field: tableAnalysis.progressField,
          oldValue: tableAnalysis.currentStageValue ?? tableAnalysis.tableStage,
          newValue: normalizedProgress,
          reason: "由 Felicia 在邮件发送前手动确认合作进度",
        }]
      : []),
    ...(progressChanged && tableAnalysis?.updateDateField
      ? [{
          field: tableAnalysis.updateDateField,
          oldValue: tableAnalysis.updateDateValue ?? null,
          newValue: todayDateValue,
          reason: "合作进度变化时同步更新当天日期",
        }]
      : []),
    ...(tableAnalysis?.proposedChanges ?? []).filter(
      (change) => !protectedFields.has(change.field),
    ),
  ];
  const canUpdateTable = canUpdateTableRecord && tableChanges.length > 0;

  async function sendReply() {
    if (!connected) {
      onNotice("请先连接飞书，再发送邮件。");
      return;
    }
    if (!confirmed) {
      onNotice("请先核对收件人、主题、正文和发送时间并勾选确认。");
      return;
    }
    const cleanHtml = sanitizeMailHtml(html);
    const plainText = htmlToPlainText(cleanHtml);
    if (!plainText) {
      onNotice("邮件正文不能为空。");
      return;
    }
    let sendAt: number | undefined;
    if (mode === "schedule") {
      sendAt = shanghaiInputToTimestamp(sendAtInput);
      if (!isValidScheduledTimestamp(sendAt)) {
        onNotice("请选择至少晚于当前时间5分钟的定时发送时间。");
        return;
      }
    }
    setSubmitting(true);
    onNotice(mode === "schedule" ? "正在提交定时回复…" : "正在发送回复…");
    try {
      const response = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail,
          subject,
          html: cleanHtml,
          plainText,
          sourceMessageId: email.message_id,
          sendAt,
          confirmed: true,
        }),
      });
      const result = await readJsonResponse<{
        error?: string;
        scheduled?: boolean;
        sendAt?: number | null;
      }>(response, "邮件操作失败。");
      if (!response.ok) throw new Error(result.error || "邮件操作失败。");
      setConfirmed(false);
      if (result.scheduled && result.sendAt) {
        setOpen(false);
        onNotice(
          `定时回复已提交，将于 ${formatScheduledDate(result.sendAt)} 发送。为避免提前改变合作进度，多维表暂未更新。`,
        );
        return;
      }
      if (
        syncTable &&
        canUpdateTable &&
        tableAnalysis?.tableId &&
        tableAnalysis.recordId
      ) {
        onNotice("回复已发送，正在同步更新飞书多维表…");
        try {
          const tableResponse = await fetch("/api/operations/update-record", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId: tableAnalysis.tableId,
              recordId: tableAnalysis.recordId,
              changes: tableChanges,
              confirmed: true,
            }),
          });
          const tableResult = await readJsonResponse<{ error?: string }>(
            tableResponse,
            "多维表更新失败。",
          );
          if (!tableResponse.ok) throw new Error(tableResult.error || "多维表更新失败。");
          onTableUpdated();
          setOpen(false);
          onNotice("回复已发送，飞书多维表也已按预览内容更新并校验完成。");
          return;
        } catch (tableError) {
          setOpen(false);
          onNotice(
            `回复已经成功发送，但多维表没有更新：${
              tableError instanceof Error ? tableError.message : "请重新分析后再处理。"
            } 请勿重复发送邮件。`,
          );
          return;
        }
      }
      setOpen(false);
      onNotice(
        canUpdateTable
          ? "回复已发送；你选择了不同时更新多维表。"
          : "回复已发送；当前没有可安全写入的唯一多维表记录。",
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "邮件操作失败。");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button className="openReplyComposer" type="button" onClick={() => setOpen(true)}>
        ↩ 回复这封邮件
      </button>
    );
  }

  return (
    <section className="mailReplyComposer">
      <div className="replyComposerHead">
        <div><strong>邮件回复预览</strong><small>收件人：{recipientEmail}</small></div>
        <button type="button" onClick={() => setOpen(false)}>收起</button>
      </div>
      <div className="replySubject"><b>主题</b><span>{subject}</span></div>
      <SmartReplyGenerator
        creatorName={creator?.name || email.sender_name || email.sender_email || "Creator"}
        creatorEmail={recipientEmail}
        category={creator?.category || "未分类"}
        emailStage={creator?.analysis?.emailStage || creator?.stage || "Needs review"}
        tableStage={creator?.analysis?.tableStage}
        scenario={creator?.analysis?.messageScenario || creator?.next || "Contextual reply"}
        onGenerated={(reply) => { setHtml(plainTextToHtml(reply)); setConfirmed(false); }}
        onNotice={onNotice}
      />
      <RichTextEditor
        value={html}
        onChange={(value) => {
          setHtml(value);
          setConfirmed(false);
        }}
      />
      <div className="inlineTableUpdate">
        <label>
          <input
            type="checkbox"
            checked={syncTable && canUpdateTable}
            disabled={!canUpdateTable || mode === "schedule"}
            onChange={(event) => { setSyncTable(event.target.checked); setConfirmed(false); }}
          />
          <span>
            <b>发送后同步更新飞书总表</b>
            {canUpdateTableRecord
              ? tableChanges.length
                ? `已匹配 ${tableAnalysis?.tableName ?? "总表"}，共 ${tableChanges.length} 个字段待更新`
                : `已匹配 ${tableAnalysis?.tableName ?? "总表"}，当前没有字段变化`
              : "尚未唯一匹配到记录，需转到今日工作台核对"}
          </span>
        </label>
      </div>
      <div className="mailTableProgressEditor">
        <div className="mailTableProgressHead">
          <span><b>合作进度</b>发送成功后写入对应多维表</span>
          <small>当前：{tableAnalysis?.tableStage || "空"}</small>
        </div>
        <label>
          <span>发送后的合作进度</span>
          <input
            type="text"
            list={`collaboration-stages-${email.message_id}`}
            value={progressValue}
            disabled={!canChooseProgress || mode === "schedule"}
            onChange={(event) => {
              setProgressValue(event.target.value);
              setSyncTable(true);
              setConfirmed(false);
            }}
            placeholder="输入或选择合作进度"
          />
          <datalist id={`collaboration-stages-${email.message_id}`}>
            {collaborationStageOptions.map((stage) => <option key={stage} value={stage} />)}
          </datalist>
        </label>
        {!canUpdateTableRecord && <p>只有唯一匹配到飞书记录后才能修改合作进度。</p>}
        {canUpdateTableRecord && !canSyncProgress && (
          <p>
            你可以编辑发送后的目标进度；但当前未识别到
            {!tableAnalysis?.progressField && !tableAnalysis?.updateDateField
              ? "“合作进度”和“更新日期”"
              : !tableAnalysis?.progressField
                ? "“合作进度”"
                : "“更新日期”"}
            字段，所以本次发送不会自动写入多维表。
          </p>
        )}
        {mode === "schedule" && <p>定时邮件不会提前修改合作进度；切换为“立即发送”后可同步更新。</p>}
        {syncTable && tableChanges.length > 0 && mode === "now" && (
          <div className="mailTableChangePreview">
            <b>飞书表格更新预览</b>
            {tableChanges.map((change) => (
              <div key={change.field}>
                <span>{change.field}</span>
                <del>{displayFieldValue(change.oldValue)}</del>
                <i>→</i>
                <ins>{displayFieldValue(change.newValue)}</ins>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="deliveryBlock compactDelivery">
        <div className="deliveryChoices">
          <button type="button" className={mode === "now" ? "selected" : ""} onClick={() => { setMode("now"); setConfirmed(false); }}>立即发送</button>
          <button type="button" className={mode === "schedule" ? "selected" : ""} onClick={() => { setMode("schedule"); setSendAtInput((current) => current || defaultScheduledInput()); setConfirmed(false); }}>定时发送</button>
        </div>
        {mode === "schedule" && (
          <div className="schedulePicker">
            <input type="datetime-local" value={sendAtInput} min={minimumScheduledInput()} onChange={(event) => { setSendAtInput(event.target.value); setConfirmed(false); }} />
            <small>北京时间，至少提前5分钟。</small>
          </div>
        )}
      </div>
      <label className="confirm replyConfirm">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>我已核对收件人、主题、正文、发送时间及上方多维表操作</span>
      </label>
      <button className="execute" type="button" disabled={submitting} onClick={() => void sendReply()}>
        {submitting ? "正在提交…" : mode === "schedule" ? "确认并定时发送" : "确认并立即发送"}
      </button>
    </section>
  );
}
