import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the RANVOO operations dashboard", async () => {
  const [page, layout, readme, analysisRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
    readFile(new URL("app/api/operations/analyze/route.ts", root), "utf8"),
  ]);

  assert.match(page, /<strong>RANVOO<\/strong>/);
  assert.match(page, /<span>Creator Ops<\/span>/);
  assert.match(page, /确认/);
  assert.match(page, /UGC/);
  assert.match(page, /牙医合作/);
  assert.match(page, /商业化红人/);
  assert.match(page, /飞书总表状态/);
  assert.match(page, /总表匹配中/);
  assert.match(page, /creatorTypeLabel/);
  assert.match(analysisRoute, /phase === "email"/);
  assert.match(analysisRoute, /status: "matching"/);
  assert.match(layout, /RANVOO Creator Operations/);
  assert.match(readme, /ranvoo-creator-operations/);
});

test("bundles an installable Codex skill", async () => {
  const [skill, workflow, routing, messages] = await Promise.all([
    readFile(
      new URL("skills/ranvoo-creator-operations/SKILL.md", root),
      "utf8",
    ),
    readFile(
      new URL(
        "skills/ranvoo-creator-operations/references/workflow-and-priorities.md",
        root,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "skills/ranvoo-creator-operations/references/routing-and-data.md",
        root,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "skills/ranvoo-creator-operations/references/message-library.md",
        root,
      ),
      "utf8",
    ),
  ]);

  assert.match(skill, /^---\nname: ranvoo-creator-operations/m);
  assert.match(skill, /explicit confirmation/i);
  assert.match(workflow, /3 full days/);
  assert.match(workflow, /30 days/);
  assert.match(routing, /UGC collaboration/);
  assert.match(messages, /Commercial creator message library/);
});

test("mail sync retries transient failures and keeps each Worker batch small", async () => {
  const [page, shared, syncRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/mail/_shared.ts", root), "utf8"),
    readFile(new URL("app/api/mail/sync/route.ts", root), "utf8"),
  ]);

  assert.match(page, /requestMailSyncBatch/);
  assert.match(page, /正在自动重试/);
  assert.match(page, /将在1分钟后自动继续同步/);
  assert.match(shared, /createAuthorizedMailClient/);
  assert.match(shared, /AbortSignal\.timeout\(20_000\)/);
  assert.match(syncRoute, /const mailClient = await createAuthorizedMailClient\(request\)/);
  assert.match(syncRoute, /page_size: "3"/);
  assert.match(syncRoute, /mapWithConcurrency\(ids, 1/);
});

test("creator detail panel scrolls and historical messages expose the full body", async () => {
  const [page, styles, threadRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/api/mail/thread/route.ts", root), "utf8"),
  ]);

  assert.match(page, /展开完整正文/);
  assert.match(page, /<ImportedEmailBody value=\{fullBody\}/);
  assert.match(styles, /\.detail \{[^}]*max-height: calc\(100dvh - 48px\)[^}]*overflow-y: auto/);
  assert.match(styles, /\.historyFullBody \.importedBody/);
  assert.doesNotMatch(threadRoute, /body_text: row\.body_text\?\.slice/);
});

test("mail thread composer previews an editable collaboration progress update", async () => {
  const [page, matchRoute, updateRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/operations/_shared.ts", root), "utf8"),
    readFile(new URL("app/api/operations/update-record/route.ts", root), "utf8"),
  ]);

  assert.match(page, /发送后的合作进度/);
  assert.match(page, /disabled=\{!canChooseProgress \|\| mode === "schedule"\}/);
  assert.match(page, /你可以编辑发送后的目标进度/);
  assert.match(page, /mailTableChangePreview/);
  assert.match(page, /changes: tableChanges/);
  assert.match(page, /setConfirmed\(false\)/);
  assert.match(matchRoute, /currentStageValue/);
  assert.match(matchRoute, /updateDateValue/);
  assert.match(matchRoute, /fieldNames: fields\.map/);
  assert.match(matchRoute, /availableFieldNames\.includes/);
  assert.match(updateRoute, /isUpdateDateField\(field\)/);
  assert.match(updateRoute, /更新时间/);
});

test("mail thread separates inbox and sent accounts", async () => {
  const [page, styles, messagesRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/api/mail/messages/route.ts", root), "utf8"),
  ]);

  assert.match(page, /mailboxView/);
  assert.match(page, /aria-label="邮件箱分类"/);
  assert.match(page, /红人发来的邮件/);
  assert.match(page, /Felicia 发出的邮件/);
  assert.match(page, /mailbox=\$\{mailboxView\}/);
  assert.match(styles, /\.mailboxTabs/);
  assert.match(messagesRoute, /mailbox.*=== "sent"/);
  assert.match(messagesRoute, /direction = \?/);
});

test("mail items expose a confirmation-gated right-click delete menu", async () => {
  const [page, styles, actionRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/api/mail/action/route.ts", root), "utf8"),
  ]);

  assert.match(page, /onContextMenu/);
  assert.match(page, /删除邮件线程/);
  assert.match(page, /仅从工作台移除，保留飞书原件/);
  assert.match(page, /window\.confirm/);
  assert.match(styles, /\.mailContextMenu/);
  assert.match(actionRoute, /counterpartyEmail/);
  assert.match(actionRoute, /json_extract\(recipients_json/);
});

test("target-table transfer preview allows Felicia to edit collaboration progress", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(page, /aria-label="目标表合作进度"/);
  assert.match(page, /onTransferField\(item\.field, event\.target\.value\)/);
  assert.match(page, /setApproved\(false\)/);
  assert.match(styles, /editableTransferField input/);
});

test("uses preferred collaboration tables and exposes appearance controls", async () => {
  const [page, styles, routing, matchRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("lib/routing-config.ts", root), "utf8"),
    readFile(new URL("app/api/operations/_shared.ts", root), "utf8"),
  ]);

  assert.match(routing, /preferredTable: "UGC合作"/);
  assert.match(routing, /preferredTable: "🪥牙医合作"/);
  assert.match(routing, /preferredTable: "🪥合作红人（26年4月后"/);
  assert.match(matchRoute, /selected\.tableName === preferredName/);
  assert.match(matchRoute, /发送后也只更新该表/);
  assert.match(page, /页面显示与阅读偏好/);
  assert.match(page, /APPEARANCE_STORAGE_KEY/);
  assert.match(page, /优先合作表名称/);
  assert.match(page, /customDisplayScale/);
  assert.match(page, /appendRoutingKeywordLine/);
  assert.match(page, /＋另起一行/);
  assert.match(styles, /grid-template-columns: minmax\(330px,\.62fr\) minmax\(590px,1\.38fr\)/);
  assert.match(styles, /customDisplayScale \.mailWorkspaceGrid/);
  assert.match(styles, /routingKeywordFields/);
});
