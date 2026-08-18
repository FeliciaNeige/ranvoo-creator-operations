import {
  defaultRoutingConfig,
  type RoutingConfig,
  type RoutingRule,
} from "./routing-config.ts";

export type CollaborationCategory =
  | "UGC"
  | "牙医合作"
  | "商业化红人"
  | "未分类";

export type AnalysisUrgency =
  | "阻塞"
  | "今日到期"
  | "需要跟进"
  | "观察"
  | "终止候选";

export type AnalyzableEmail = {
  messageId: string;
  threadId?: string | null;
  subject: string;
  senderName?: string | null;
  senderEmail?: string | null;
  recipients: { name?: string; email: string }[];
  sentAt?: number | null;
  snippet?: string | null;
  bodyText?: string | null;
  direction: "inbound" | "outbound" | "unknown";
};

export type CreatorThreadAnalysis = {
  email: string;
  creatorName: string;
  category: CollaborationCategory;
  categoryLabel: string;
  sourceTable: string | null;
  preferredTable: string | null;
  targetTable: string | null;
  messageCount: number;
  threadCount: number;
  latestMessageId: string;
  latestSubject: string;
  latestAt: number | null;
  latestDirection: AnalyzableEmail["direction"];
  latestSummary: string;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
  silenceDays: number;
  stage: string;
  urgency: AnalysisUrgency;
  evidence: string[];
  nextAction: string;
  messageScenario: string;
  confidence: "高" | "中" | "低";
  proposedFields: {
    field: string;
    value: string | number | null;
    reason: string;
  }[];
  transferEligible: boolean;
};

export function analyzeCreatorThreads(
  messages: AnalyzableEmail[],
  now = Date.now(),
  routingConfig: RoutingConfig = defaultRoutingConfig,
): CreatorThreadAnalysis[] {
  const groups = new Map<string, AnalyzableEmail[]>();
  for (const message of messages) {
    const email = counterpartyEmail(message);
    if (!email) continue;
    const group = groups.get(email) ?? [];
    group.push(message);
    groups.set(email, group);
  }

  return [...groups.entries()]
    .map(([email, group]) => analyzeGroup(email, group, now, routingConfig))
    .sort((left, right) => {
      const urgencyOrder: Record<AnalysisUrgency, number> = {
        阻塞: 0,
        今日到期: 1,
        需要跟进: 2,
        观察: 3,
        终止候选: 4,
      };
      const urgencyDifference =
        urgencyOrder[left.urgency] - urgencyOrder[right.urgency];
      if (urgencyDifference !== 0) return urgencyDifference;
      return (right.latestAt ?? 0) - (left.latestAt ?? 0);
    });
}

function analyzeGroup(
  email: string,
  messages: AnalyzableEmail[],
  now: number,
  routingConfig: RoutingConfig,
): CreatorThreadAnalysis {
  const ordered = [...messages].sort(
    (left, right) => (left.sentAt ?? 0) - (right.sentAt ?? 0),
  );
  const latest = ordered[ordered.length - 1];
  const inbound = ordered.filter((message) => message.direction === "inbound");
  const outbound = ordered.filter((message) => message.direction === "outbound");
  const latestInbound = inbound[inbound.length - 1];
  const latestOutbound = outbound[outbound.length - 1];
  const category = classifyCategory([...ordered].reverse(), routingConfig.rules);
  const matchedRule = category === "未分类"
    ? null
    : routingConfig.rules.find((rule) => rule.category === category) ?? null;
  const sourceTable = category === "未分类"
    ? null
    : matchedRule?.sourceTable ?? null;
  const preferredTable = category === "未分类"
    ? null
    : matchedRule?.preferredTable ?? null;
  const lastInboundAt = latestInbound?.sentAt ?? null;
  const lastOutboundAt = latestOutbound?.sentAt ?? null;
  const waitingForCreator =
    Boolean(lastOutboundAt) &&
    (!lastInboundAt || (lastOutboundAt ?? 0) > lastInboundAt);
  const silenceDays = waitingForCreator
    ? fullDays(now, lastOutboundAt)
    : 0;
  const recentText = ordered
    .slice(-6)
    .map(messageText)
    .join("\n")
    .toLowerCase();
  const latestText = messageText(latest).toLowerCase();
  const inferred = inferStage(
    recentText,
    latestText,
    latest.direction,
    waitingForCreator,
    silenceDays,
  );
  const creatorName =
    [...ordered]
      .reverse()
      .find(
        (message) =>
          message.direction === "inbound" && message.senderName?.trim(),
      )
      ?.senderName?.trim() ||
    latest.senderName?.trim() ||
    email.split("@")[0];
  const confidence =
    category === "未分类"
      ? "低"
      : inferred.matchedSignal
        ? "高"
        : "中";
  const transferEligible =
    inferred.stage === "Collaboration Agreed" ||
    (category === "牙医合作" &&
      /trial|evaluation|test|体验|试用/.test(recentText) &&
      /agree|confirm|move forward|happy to|愿意|同意/.test(recentText));

  const evidence = [
    `同一邮箱共 ${ordered.length} 封邮件、${new Set(ordered.map((message) => message.threadId).filter(Boolean)).size || 1} 个线程`,
    `最新邮件：${latest.subject}`,
    waitingForCreator
      ? `RANVOO 最后发出后已等待 ${silenceDays} 个完整自然日`
      : "最新一封为红人来信，需要 RANVOO 处理",
  ];
  if (inferred.signal) evidence.push(inferred.signal);

  return {
    email,
    creatorName,
    category,
    categoryLabel: matchedRule?.label ?? "类型待确认",
    sourceTable,
    preferredTable,
    targetTable: transferEligible ? preferredTable : null,
    messageCount: ordered.length,
    threadCount:
      new Set(ordered.map((message) => message.threadId).filter(Boolean)).size ||
      1,
    latestMessageId: latest.messageId,
    latestSubject: latest.subject,
    latestAt: latest.sentAt ?? null,
    latestDirection: latest.direction,
    latestSummary:
      latest.snippet?.trim() ||
      latest.bodyText?.replace(/\s+/g, " ").trim().slice(0, 260) ||
      "无可用正文摘要",
    lastInboundAt,
    lastOutboundAt,
    silenceDays,
    stage: inferred.stage,
    urgency: inferred.urgency,
    evidence,
    nextAction: inferred.nextAction,
    messageScenario: inferred.messageScenario,
    confidence,
    proposedFields: [
      {
        field: "合作进度",
        value: inferred.stage,
        reason: "由同一邮箱的最新邮件及历史上下文判断",
      },
      {
        field: "更新日期",
        value: shanghaiDate(now),
        reason: "仅在确认合作进度发生变化时一并更新",
      },
      {
        field: "最后收信日期",
        value: lastInboundAt,
        reason: "来自邮件时间",
      },
      {
        field: "最后发信日期",
        value: lastOutboundAt,
        reason: "来自邮件时间",
      },
      {
        field: "下一步",
        value: inferred.nextAction,
        reason: "由当前阶段和等待时间计算",
      },
    ],
    transferEligible,
  };
}

function counterpartyEmail(message: AnalyzableEmail): string | null {
  const candidate =
    message.direction === "inbound"
      ? message.senderEmail
      : message.recipients[0]?.email || message.senderEmail;
  if (!candidate) return null;
  const normalized = candidate.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : null;
}

function classifyCategory(
  messages: AnalyzableEmail[],
  rules: RoutingRule[],
): CollaborationCategory {
  // Precise subject routing always wins. Body keywords are only a fallback;
  // this prevents a commercial mom creator mentioning dental health from
  // being misclassified as a dental professional.
  for (const message of messages) {
    const subject = normalizeSubject(message.subject);
    for (const rule of rules) {
      if (rule.subjectKeywords.some((keyword) => subject.includes(keyword))) {
        return rule.category;
      }
    }
  }
  for (const message of messages) {
    const text = `${normalizeSubject(message.subject)} ${messageText(message).toLowerCase()}`;
    for (const rule of rules) {
      if (rule.bodyKeywords.some((keyword) => containsKeyword(text, keyword))) {
        return rule.category;
      }
    }
  }
  return "未分类";
}

function containsKeyword(text: string, keyword: string): boolean {
  if (!keyword) return false;
  if (/^[a-z0-9]+$/i.test(keyword)) {
    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text);
  }
  return text.includes(keyword);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferStage(
  recentText: string,
  latestText: string,
  latestDirection: AnalyzableEmail["direction"],
  waitingForCreator: boolean,
  silenceDays: number,
) {
  if (waitingForCreator && silenceDays >= 30) {
    return stageResult(
      "Termination Candidate",
      "终止候选",
      "准备礼貌收尾或最后一次提供新价值的跟进，需确认后执行。",
      "30天未回复 · 收尾选项",
      `已连续 ${silenceDays} 天未收到回复`,
    );
  }
  if (/not interested|decline|pass on|won't be able|不感兴趣|拒绝/.test(latestText)) {
    return stageResult(
      "Declined",
      "观察",
      "记录拒绝原因；如需回复，使用简短尊重的结束话术。",
      "红人拒绝",
      "最新来信包含明确拒绝表达",
    );
  }
  if (
    /payment|invoice|payment details|payment status|awaiting payment|付款|发票/.test(
      recentText,
    )
  ) {
    return stageResult(
      "Payment Pending",
      latestDirection === "inbound" ? "阻塞" : "观察",
      "核对付款、发票或收款信息并处理未决事项。",
      "付款阶段",
      "近期邮件涉及付款或发票",
    );
  }
  if (/published|posted|is live|live link|上线|已发布/.test(recentText)) {
    return stageResult(
      "Published",
      "观察",
      "核对链接、标签和交付要求，准备效果记录。",
      "发布后核对",
      "近期邮件包含已发布或上线证据",
    );
  }
  if (/revision|revise|changes requested|修改|返修/.test(recentText)) {
    return stageResult(
      "Revision Pending",
      latestDirection === "inbound" ? "阻塞" : "今日到期",
      "按反馈核对修改项和新的交付时间。",
      "内容修改",
      "近期邮件涉及修改或返修",
    );
  }
  if (/draft|preview|review this|初稿|审核/.test(recentText)) {
    return stageResult(
      "Draft Received / Review",
      "今日到期",
      "审核内容与 Brief，整理一次性反馈。",
      "内容审核",
      "近期邮件包含初稿或审核请求",
    );
  }
  if (/brief|creative concept|脚本|创意要求/.test(recentText)) {
    return stageResult(
      "Brief Pending or Sent",
      waitingForCreator && silenceDays >= 3 ? "需要跟进" : "观察",
      waitingForCreator
        ? "确认红人已收到 Brief，并提供更容易回复的下一步。"
        : "核对 Brief、交付项和时间线。",
      "Brief 阶段",
      "近期邮件涉及 Brief 或创意概念",
    );
  }
  if (/delivered|received the product|收到产品|已签收/.test(recentText)) {
    return stageResult(
      "Delivered / Experience Period",
      "观察",
      "按约定体验周期设置下一次检查日期。",
      "产品体验期",
      "近期邮件显示产品已经签收",
    );
  }
  if (/tracking|shipped|shipment|in transit|物流|已寄出/.test(recentText)) {
    return stageResult(
      "In Transit",
      "观察",
      "跟踪物流并在签收后进入体验或内容阶段。",
      "物流跟进",
      "近期邮件包含物流或寄送信息",
    );
  }
  if (/shipping address|address|phone number|收件|地址/.test(recentText)) {
    return stageResult(
      "Address Pending",
      waitingForCreator && silenceDays >= 3 ? "需要跟进" : "观察",
      "确认收件地址和联系电话；不要在表格备注中保存不必要的完整地址。",
      "地址待确认",
      "近期邮件正在收集寄送信息",
    );
  }
  if (
    /works for me|i agree|confirmed|let's move forward|happy to proceed|move forward|同意合作|确认合作/.test(
      latestText,
    )
  ) {
    return stageResult(
      "Collaboration Agreed",
      "阻塞",
      "核对合作条款并准备合同、寄样或 Brief；同时生成目标表建档预览。",
      "确定合作",
      "最新来信包含明确接受或确认合作",
    );
  }
  if (/rate|price|budget|fee|compensation|报价|预算|价格/.test(recentText)) {
    return stageResult(
      "Negotiating Scope or Price",
      latestDirection === "inbound" ? "阻塞" : "观察",
      "核对预算、交付数量和使用权，准备不改变已确认条款的回复。",
      "价格与范围谈判",
      "近期邮件涉及报价、预算或交付范围",
    );
  }
  if (waitingForCreator && silenceDays >= 3) {
    return stageResult(
      "Awaiting Creator Reply",
      "需要跟进",
      "换一个角度跟进，并提供新价值或更容易回复的选项。",
      "3天未回复 · 换角度跟进",
      `最后发信后已等待 ${silenceDays} 个完整自然日`,
    );
  }
  if (waitingForCreator) {
    return stageResult(
      "Awaiting Creator Reply",
      "观察",
      "继续等待；满3个完整自然日后再进入跟进队列。",
      "等待红人回复",
      `最后发信后等待 ${silenceDays} 天`,
    );
  }
  return stageResult(
    "Interested / Requirements Pending",
    latestDirection === "inbound" ? "阻塞" : "观察",
    "阅读最新问题或条件，补齐未确认的价格、交付、时间或使用权。",
    "兴趣与需求确认",
    latestDirection === "inbound"
      ? "最新一封是红人来信"
      : "缺少更具体的阶段信号",
    false,
  );
}

function stageResult(
  stage: string,
  urgency: AnalysisUrgency,
  nextAction: string,
  messageScenario: string,
  signal: string,
  matchedSignal = true,
) {
  return {
    stage,
    urgency,
    nextAction,
    messageScenario,
    signal,
    matchedSignal,
  };
}

function messageText(message: AnalyzableEmail): string {
  return `${message.subject}\n${message.bodyText ?? ""}\n${message.snippet ?? ""}`;
}

function normalizeSubject(value: string): string {
  return value
    .replace(/^(\s*(re|fw|fwd)\s*:\s*)+/gi, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function fullDays(now: number, value: number | null): number {
  if (!value) return 0;
  return Math.max(0, Math.floor((now - value) / 86_400_000));
}

function shanghaiDate(value: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
