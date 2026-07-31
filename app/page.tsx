"use client";

import { useEffect, useMemo, useState } from "react";

type Urgency = "阻塞" | "今日到期" | "需要跟进" | "观察" | "终止候选";
type Category = "UGC" | "牙医合作" | "商业化红人" | "未分类";
type View = "dashboard" | "mail" | "creators" | "messages" | "settings";

type Creator = {
  id: number;
  name: string;
  handle: string;
  email: string;
  category: Category;
  subject: string;
  stage: string;
  silence: number;
  urgency: Urgency;
  latest: string;
  next: string;
  lastInbound: string;
  lastOutbound: string;
  draft: string;
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
    tableStatus: "matched" | "unmatched" | "duplicate" | "unavailable";
    tableName: string | null;
    recordId: string | null;
    unresolvedFields: string[];
  };
};

type AnalysisApiItem = {
  email: string;
  creatorName: string;
  category: Category;
  sourceTable: string | null;
  targetTable: string | null;
  messageCount: number;
  threadCount: number;
  latestSubject: string;
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
    status: "matched" | "unmatched" | "duplicate" | "unavailable";
    tableName: string | null;
    recordId: string | null;
    duplicateRecordIds: string[];
    proposedChanges: {
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }[];
    unresolvedFields: string[];
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

const todayLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "Asia/Shanghai",
}).format(new Date());

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

function toCreator(item: AnalysisApiItem, index: number): Creator {
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
    subject: item.latestSubject,
    stage: item.stage,
    silence: item.silenceDays,
    urgency: item.urgency,
    latest: item.evidence.join("；"),
    next: item.nextAction,
    lastInbound: formatMailDate(item.lastInboundAt),
    lastOutbound: formatMailDate(item.lastOutboundAt),
    draft: `【待生成：${item.messageScenario}】\n\n系统已完成线程判断。请先核对多维表匹配和真实商业条款，再从对应话术库生成最终回复。`,
    updates,
    transfer,
    analysis: {
      messageCount: item.messageCount,
      threadCount: item.threadCount,
      confidence: item.confidence,
      evidence: item.evidence,
      messageScenario: item.messageScenario,
      tableStatus: item.tableMatch.status,
      tableName: item.tableMatch.tableName,
      recordId: item.tableMatch.recordId,
      unresolvedFields: item.tableMatch.unresolvedFields,
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
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"new" | "connect" | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("UGC");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [importedEmails, setImportedEmails] = useState<ImportedEmail[]>([]);
  const [mailSync, setMailSync] = useState<MailSync>({
    total_imported: 0,
    status: "idle",
  });
  const [selectedMailId, setSelectedMailId] = useState("");
  const [mailLoading, setMailLoading] = useState(false);
  const [mailLoaded, setMailLoaded] = useState(false);
  const [mailTotal, setMailTotal] = useState(0);
  const [syncingMail, setSyncingMail] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [mailError, setMailError] = useState("");

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
    if (view !== "mail" || !connected) return;
    const timer = window.setTimeout(() => {
      void loadImportedMail(search, false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [view, connected, search]);

  const visible = useMemo(
    () => creators.filter((creator) =>
      (filter === "全部" || creator.urgency === filter) &&
      `${creator.name} ${creator.handle} ${creator.email} ${creator.subject}`.toLowerCase().includes(search.toLowerCase()),
    ),
    [creators, filter, search],
  );
  const selected = creators.find((creator) => creator.id === selectedId) ?? creators[0];

  function chooseCreator(id: number) {
    setSelectedId(id);
    setApproved(false);
    setNotice("");
    setEditing(false);
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
    setReanalyzing(true);
    setNotice("正在按邮箱归并邮件，并以最新邮件结合历史上下文判断进度…");
    try {
      const response = await fetch("/api/operations/analyze", {
        method: "POST",
        cache: "no-store",
      });
      const body = await response.json() as {
        items?: AnalysisApiItem[];
        sourceEmailCount?: number;
        uniqueCreatorCount?: number;
        deduplicatedCount?: number;
        baseError?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "邮箱分析失败。");
      }
      const items = body.items ?? [];
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
      setSelectedId(nextCreators[0].id);
      setFilter("全部");
      setReanalyzing(false);
      setNotice(
        `分析完成：${body.sourceEmailCount ?? 0} 封邮件合并为 ${
          body.uniqueCreatorCount ?? items.length
        } 个邮箱主记录，去除 ${
          body.deduplicatedCount ?? 0
        } 条重复任务。${
          body.baseError
            ? ` 邮箱判断已完成；多维表暂未匹配：${body.baseError}`
            : " 多维表匹配与字段变更预览已生成。"
        }`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "邮箱分析失败。");
    } finally {
      setReanalyzing(false);
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
    setSelectedId(id);
    setModal(null);
    setNewName("");
    setNewEmail("");
    setView("dashboard");
    setNotice("任务已加入本次演示队列。真实接入后，新记录仍需你确认才会写入飞书。");
  }

  function requestExecution() {
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
    setNotice("执行请求已提交，正在逐项验证邮件发送与表格写回。");
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
        `/api/mail/messages?limit=100&offset=${offset}&q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      const body = await response.json() as {
        items?: ImportedEmail[];
        total?: number;
        sync?: MailSync;
        error?: string;
      };
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

  async function syncAllMail(forceFull = false) {
    if (!connected || syncingMail) return;
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
        const response = await fetch("/api/mail/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageToken,
            folderIndex,
            resume:
              !forceFull &&
              batch === 0 &&
              mailSync.status === "running",
            full,
          }),
        });
        const result = await response.json() as {
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
        if (!response.ok) throw new Error(result.error || "邮件同步失败。");
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
      setMailError(message);
      setSyncProgress("");
    } finally {
      setSyncingMail(false);
    }
  }

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
  const selectedImported =
    importedEmails.find((email) => email.message_id === selectedMailId) ??
    importedEmails[0];

  return (
    <main className="shell">
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

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">RANVOO CREATOR OPERATIONS · {viewNames[view]}</p>
            <h1>{pageTitle}</h1>
            <p className="sub">读取与整理可以自动完成；发送邮件、更新表格和终止合作必须由你确认。</p>
          </div>
          <div className="headerActions">
            <button className="ghost" onClick={runAnalysis} disabled={reanalyzing}>{reanalyzing ? "分析中…" : "↻ 重新分析"}</button>
            <button className="primary" onClick={() => setModal("new")}>＋ 新建任务</button>
          </div>
        </header>

        {notice && <div className="globalNotice" role="status"><span>i</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}

        {view === "dashboard" && (
          <>
            <section className="metrics">
              <button onClick={() => setFilter("今日到期")}><span className="metricIcon red">!</span><div><strong>2</strong><p>今日必须处理</p></div><small>1项已逾期</small></button>
              <button onClick={() => setFilter("需要跟进")}><span className="metricIcon amber">↗</span><div><strong>1</strong><p>3天未回复</p></div><small>需换角度跟进</small></button>
              <button onClick={() => navigate("mail")}><span className="metricIcon blue">✉</span><div><strong>4</strong><p>待审核草稿</p></div><small>发送前需确认</small></button>
              <button onClick={() => setFilter("终止候选")}><span className="metricIcon gray">⌛</span><div><strong>1</strong><p>终止候选</p></div><small>超过30天</small></button>
            </section>
            <Workspace
              visible={visible} selected={selected} filter={filter} search={search}
              drafts={drafts} approved={approved} editing={editing}
              onFilter={setFilter} onSearch={setSearch} onChoose={chooseCreator}
              onApprove={setApproved} onEdit={setEditing}
              onDraft={(value) => setDrafts((items) => ({ ...items, [selected.id]: value }))}
              onExecute={requestExecution}
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
                    : "首次同步会分批迁移收件箱历史邮件，之后只检查收件箱新增内容。"}
                </p>
                {(syncProgress || mailError) && (
                  <small className={mailError ? "syncError" : ""}>
                    {mailError || syncProgress}
                  </small>
                )}
              </div>
              {connected ? (
                <div className="syncActions">
                  {mailSync.total_imported > 0 && !syncingMail && (
                    <button
                      className="secondaryAction"
                      onClick={() => void syncAllMail(true)}
                    >
                      完整重扫收件箱
                    </button>
                  )}
                  <button
                    onClick={() => void syncAllMail(false)}
                    disabled={syncingMail}
                  >
                    {syncingMail
                      ? "正在同步…"
                      : mailSync.status === "running"
                        ? "继续同步收件箱"
                        : mailSync.total_imported
                          ? "同步收件箱新邮件"
                          : "迁移收件箱"}
                  </button>
                </div>
              ) : (
                <button onClick={connectFeishu}>先连接飞书</button>
              )}
            </section>
            <section className="pageGrid">
              <div className="panel">
                <div className="panelHead">
                  <div>
                    <h2>{mailLoaded ? "已迁移邮件" : "相关邮件线程"}</h2>
                    <p>
                      {mailLoading
                        ? "正在读取…"
                        : mailLoaded
                          ? `已显示 ${importedEmails.length} / 共 ${mailTotal} 封`
                          : "可按发件人、主题或正文搜索"}
                    </p>
                  </div>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索邮件" />
                </div>
                <div className="mailList">
                  {importedEmails.length > 0
                    ? importedEmails.map((email) => (
                        <button
                          key={email.message_id}
                          className={selectedImported?.message_id === email.message_id ? "selectedMail" : ""}
                          onClick={() => setSelectedMailId(email.message_id)}
                        >
                          <span className="avatar">{initials(email.sender_name || email.sender_email || "邮件")}</span>
                          <span>
                            <strong>{email.sender_name || email.sender_email || "未知发件人"}</strong>
                            <b>{email.subject}</b>
                            <small>{formatMailDate(email.sent_at)}</small>
                          </span>
                          <em>{email.direction === "outbound" ? "已发送" : "收件"}</em>
                        </button>
                      ))
                    : connected && mailLoaded
                      ? (
                        <div className="emptyMail">
                          尚未迁移到真实邮件，请点击“迁移全部邮件”。
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
                <div className="panel threadPanel">
                  <span className="categoryTag">
                    {selectedImported.direction === "outbound" ? "已发送" : "收件箱"}
                  </span>
                  <h2>{selectedImported.sender_name || selectedImported.sender_email || "未知发件人"}</h2>
                  <p className="threadSubject">{selectedImported.subject}</p>
                  <div className="mailMeta">
                    <span><b>发件人</b>{selectedImported.sender_email || "—"}</span>
                    <span><b>时间</b>{formatMailDate(selectedImported.sent_at)}</span>
                  </div>
                  <div className="importedBody">
                    {selectedImported.body_text || selectedImported.snippet || "这封邮件没有可显示的纯文本正文。"}
                  </div>
                  <div className="threadDecision">
                    <strong>下一步：识别红人并匹配合作记录</strong>
                    <p>邮件已保存在网站中。自动判断和写回表格仍会遵守确认门槛。</p>
                    <button onClick={() => navigate("dashboard")}>进入红人跟进工作台 →</button>
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
            <article><span className="settingIcon">3</span><div><h2>跟进提醒</h2><p>最后一封发出邮件满3个完整自然日且无回复时进入“需要跟进”。</p></div><strong>已启用</strong></article>
            <article><span className="settingIcon">30</span><div><h2>终止候选</h2><p>超过30天无回复只标记为候选，不会自动终止或发送收尾邮件。</p></div><strong>需人工确认</strong></article>
            <article><span className="settingIcon">✓</span><div><h2>执行确认门槛</h2><p>发送前展示最终邮件、匹配记录和每个字段的新旧值。</p></div><strong>强制开启</strong></article>
            <article><span className="settingIcon">日</span><div><h2>更新日期联动</h2><p>合作进度发生变化时，将“更新日期”同步设为当天；仅查看或进度未变时不更新。</p></div><strong>已启用</strong></article>
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

function Workspace({
  visible, selected, filter, search, drafts, approved, editing,
  onFilter, onSearch, onChoose, onApprove, onEdit, onDraft, onExecute,
}: {
  visible: Creator[]; selected: Creator; filter: string; search: string;
  drafts: Record<number, string>; approved: boolean; editing: boolean;
  onFilter: (value: string) => void; onSearch: (value: string) => void;
  onChoose: (id: number) => void; onApprove: (value: boolean) => void;
  onEdit: (value: boolean) => void; onDraft: (value: string) => void; onExecute: () => void;
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
            <button key={creator.id} className={`taskCard ${selected.id === creator.id ? "current" : ""}`} onClick={() => onChoose(creator.id)}>
              <div className={`priorityPill p-${creator.urgency}`}>{creator.urgency}</div>
              <div className="avatar">{initials(creator.name)}</div>
              <div className="taskMain"><div className="taskTitle"><strong>{creator.name}</strong><span>{creator.category}</span></div><p>{creator.subject}</p><small>{creator.stage} · {creator.silence}天未收到回复</small></div>
              <span className="chevron">›</span>
            </button>
          ))}
        </div>
      </div>

      <aside className="detail">
        <div className="detailTop"><div className="avatar large">{initials(selected.name)}</div><div><h2>{selected.name}</h2><p>{selected.handle} · {selected.email}</p></div><span className={`priorityPill p-${selected.urgency}`}>{selected.urgency}</span></div>
        <div className="route"><span>自动路由</span><strong>{selected.category}</strong><span className="confidence">{selected.analysis?.confidence ?? "高"}置信度</span></div>
        {selected.analysis && (
          <div className="analysisMeta">
            <span><b>{selected.analysis.messageCount}</b>封邮件</span>
            <span><b>{selected.analysis.threadCount}</b>个线程</span>
            <span>
              <b>{selected.analysis.tableName ?? "待路由"}</b>
              {selected.analysis.tableStatus === "matched"
                ? "已匹配记录"
                : selected.analysis.tableStatus === "duplicate"
                  ? "同邮箱重复，禁止自动写入"
                  : selected.analysis.tableStatus === "unmatched"
                    ? "未找到同邮箱记录"
                    : "多维表待连接"}
            </span>
          </div>
        )}
        <div className="analysisBlock"><label>判断依据</label><p>{selected.latest}</p><label>建议下一步</label><p>{selected.next}</p></div>
        <div className="draftBlock">
          <div className="blockHead"><label>邮件回复预览</label><button onClick={() => onEdit(!editing)}>{editing ? "完成" : "编辑"}</button></div>
          {editing ? <textarea value={drafts[selected.id]} onChange={(event) => onDraft(event.target.value)} autoFocus /> : <pre>{drafts[selected.id]}</pre>}
        </div>
        <div className="updates"><label>飞书表格更新预览</label>{selected.updates.map((update) => <div className="updateRow" key={update.field}><span>{update.field}</span><del>{update.from}</del><b>→</b><ins>{update.to}</ins></div>)}</div>
        {selected.transfer && (
          <div className="transferPreview">
            <div className="transferTitle"><label>目标表建档预览</label><span>待确认</span></div>
            <div className="transferPath"><b>{selected.transfer.source}</b><i>→</i><b>{selected.transfer.target}</b></div>
            <p><strong>触发依据</strong>{selected.transfer.trigger}</p>
            <p><strong>查重结果</strong>{selected.transfer.match}</p>
            <div className="copyFields">{selected.transfer.fields.map((item) => <span key={item.field}><b>{item.field}</b>{item.value}</span>)}</div>
          </div>
        )}
        <label className="confirm"><input type="checkbox" checked={approved} onChange={(event) => onApprove(event.target.checked)} /><span>我已核对邮件正文及以上所有字段变更</span></label>
        <button className="execute" onClick={onExecute}>确认发送并同步表格</button>
        <p className="safetyNote">演示模式不会执行真实外部操作</p>
      </aside>
    </section>
  );
}
