"use client";

import { useMemo, useState } from "react";

type Creator = {
  id: number;
  name: string;
  handle: string;
  email: string;
  category: "UGC" | "牙医合作" | "商业化红人";
  subject: string;
  stage: string;
  silence: number;
  urgency: "阻塞" | "今日到期" | "需要跟进" | "观察" | "终止候选";
  latest: string;
  next: string;
  draft: string;
  updates: { field: string; from: string; to: string }[];
};

const creators: Creator[] = [
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
    draft:
      "Hi Maya,\n\nJust checking in on the AirJet X5 UGC collaboration. To make the next step easy, would you prefer to review the creative concepts first, or confirm the collaboration details by email?\n\nIf the timing isn’t right, feel free to let me know as well.\n\nBest,\nFelicia",
    updates: [
      { field: "合作进度", from: "已触达", to: "Follow-up #1" },
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
    draft:
      "Hi Dr. Morris,\n\nA quick follow-up on the AirJet X5 evaluation unit. We’ve recently received encouraging feedback from dental professionals on comfort and hard-to-reach cleaning, and we’d still value your perspective.\n\nIf you’d like to move forward, could you share the best shipping address and phone number for delivery?\n\nBest,\nFelicia",
    updates: [
      { field: "合作进度", from: "样品体验", to: "地址待确认" },
      { field: "反馈跟进", from: "2", to: "3" },
      { field: "备注", from: "等待地址", to: "已发送地址跟进 #3" },
    ],
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
    draft:
      "Hi Nora,\n\nI wanted to close the loop on our RANVOO collaboration invitation. We understand timing and priorities can change, so we’ll pause this opportunity for now.\n\nWe’d be happy to reconnect in the future if there’s a better fit.\n\nBest,\nFelicia",
    updates: [
      { field: "合作进度", from: "Follow-up #3", to: "终止候选" },
      { field: "备注", from: "等待回复", to: "33天无回复，待人工决定" },
    ],
  },
];

const filterItems = ["全部", "阻塞", "今日到期", "需要跟进", "观察", "终止候选"];

export default function Home() {
  const [filter, setFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState(1);
  const [approved, setApproved] = useState(false);
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);

  const visible = useMemo(
    () => creators.filter((c) => filter === "全部" || c.urgency === filter),
    [filter],
  );
  const selected = creators.find((c) => c.id === selectedId) ?? creators[0];

  function requestExecution() {
    if (!connected) {
      setNotice("请先完成飞书应用授权。当前演示模式不会发送邮件或修改真实表格。");
      return;
    }
    if (!approved) {
      setNotice("请先确认邮件正文和所有字段变更。");
      return;
    }
    setNotice("执行请求已提交。正式接入后，这里会显示发送与写回的逐项验证结果。");
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark">R</span>
          <div>
            <strong>RANVOO</strong>
            <span>Creator Ops</span>
          </div>
        </div>
        <nav>
          <button className="navItem active"><span>⌁</span> 今日工作台</button>
          <button className="navItem"><span>✉</span> 邮件线程</button>
          <button className="navItem"><span>◎</span> 红人总览</button>
          <button className="navItem"><span>▤</span> 话术中心</button>
          <button className="navItem"><span>⚙</span> 工作流设置</button>
        </nav>
        <div className="sideBottom">
          <div className="syncCard">
            <span className={`statusDot ${connected ? "online" : ""}`} />
            <div>
              <strong>{connected ? "飞书已连接" : "演示模式"}</strong>
              <p>{connected ? "邮箱与多维表格同步中" : "尚未配置飞书应用授权"}</p>
            </div>
          </div>
          <button
            className="connectButton"
            onClick={() => {
              setConnected(false);
              setNotice("需要在飞书开放平台创建企业自建应用，并配置邮箱与多维表格权限。");
            }}
          >
            连接飞书
          </button>
          <div className="profile">
            <span>FZ</span>
            <div><strong>Felicia Zhao</strong><small>RANVOO Team</small></div>
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">THURSDAY · JUL 30</p>
            <h1>今天需要处理什么？</h1>
            <p className="sub">已按紧急程度整理邮箱与合作记录。所有外部操作都需要你的确认。</p>
          </div>
          <div className="headerActions">
            <button className="ghost">↻ 重新分析</button>
            <button className="primary">＋ 新建任务</button>
          </div>
        </header>

        <section className="metrics">
          <article><span className="metricIcon red">!</span><div><strong>2</strong><p>今日必须处理</p></div><small>1项已逾期</small></article>
          <article><span className="metricIcon amber">↗</span><div><strong>1</strong><p>3天未回复</p></div><small>需换角度跟进</small></article>
          <article><span className="metricIcon blue">✉</span><div><strong>4</strong><p>待审核草稿</p></div><small>发送前需确认</small></article>
          <article><span className="metricIcon gray">⌛</span><div><strong>1</strong><p>终止候选</p></div><small>超过30天</small></article>
        </section>

        <section className="workspace">
          <div className="queue">
            <div className="sectionHead">
              <div><h2>今日任务队列</h2><p>点击任务查看判断依据与操作预览</p></div>
              <span>{visible.length} 项</span>
            </div>
            <div className="filters">
              {filterItems.map((item) => (
                <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>
              ))}
            </div>
            <div className="taskList">
              {visible.map((creator) => (
                <button
                  key={creator.id}
                  className={`taskCard ${selected.id === creator.id ? "current" : ""}`}
                  onClick={() => { setSelectedId(creator.id); setApproved(false); setNotice(""); }}
                >
                  <div className={`priorityPill p-${creator.urgency}`}>{creator.urgency}</div>
                  <div className="avatar">{creator.name.split(" ").map((x) => x[0]).join("")}</div>
                  <div className="taskMain">
                    <div className="taskTitle"><strong>{creator.name}</strong><span>{creator.category}</span></div>
                    <p>{creator.subject}</p>
                    <small>{creator.stage} · {creator.silence}天未收到回复</small>
                  </div>
                  <span className="chevron">›</span>
                </button>
              ))}
            </div>
          </div>

          <aside className="detail">
            <div className="detailTop">
              <div className="avatar large">{selected.name.split(" ").map((x) => x[0]).join("")}</div>
              <div><h2>{selected.name}</h2><p>{selected.handle} · {selected.email}</p></div>
              <span className={`priorityPill p-${selected.urgency}`}>{selected.urgency}</span>
            </div>

            <div className="route">
              <span>自动路由</span>
              <strong>{selected.category}</strong>
              <span className="confidence">高置信度</span>
            </div>

            <div className="analysisBlock">
              <label>判断依据</label>
              <p>{selected.latest}</p>
              <label>建议下一步</label>
              <p>{selected.next}</p>
            </div>

            <div className="draftBlock">
              <div className="blockHead"><label>邮件回复预览</label><button>编辑</button></div>
              <pre>{selected.draft}</pre>
            </div>

            <div className="updates">
              <label>飞书表格更新预览</label>
              {selected.updates.map((u) => (
                <div className="updateRow" key={u.field}>
                  <span>{u.field}</span><del>{u.from}</del><b>→</b><ins>{u.to}</ins>
                </div>
              ))}
            </div>

            <label className="confirm">
              <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
              <span>我已核对邮件正文及以上所有字段变更</span>
            </label>
            <button className="execute" onClick={requestExecution}>确认发送并同步表格</button>
            {notice && <p className="notice">{notice}</p>}
          </aside>
        </section>
      </section>
    </main>
  );
}
