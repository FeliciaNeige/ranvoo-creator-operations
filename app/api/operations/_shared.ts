import {
  FEISHU_API_BASE,
  ensureFeishuSession,
} from "../auth/feishu/_shared";
import type { CreatorThreadAnalysis } from "../../../lib/creator-analysis";

type FeishuEnvelope<T> = {
  code?: number;
  msg?: string;
  data?: T;
};

type WikiNodeData = {
  node?: {
    obj_token?: string;
    obj_type?: string;
  };
};

type TableListData = {
  items?: { table_id: string; name: string }[];
  has_more?: boolean;
  page_token?: string;
};

type RecordListData = {
  items?: {
    record_id: string;
    fields?: Record<string, unknown>;
  }[];
  has_more?: boolean;
  page_token?: string;
};

type FieldListData = {
  items?: {
    field_id: string;
    field_name: string;
    type: number;
    ui_type?: string;
  }[];
  has_more?: boolean;
  page_token?: string;
};

export type BaseMatch = {
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
    reason: string;
  }[];
  unresolvedFields: string[];
  message?: string | null;
};

export class OperationsApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

export async function createFeishuClient(request: Request) {
  const auth = await ensureFeishuSession(request);
  if (!auth) {
    throw new OperationsApiError(401, "飞书授权已过期，请重新连接。");
  }
  return {
    setCookie: auth.setCookie,
    async request<T>(
      path: string,
      init: RequestInit = {},
    ): Promise<T> {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await fetch(`${FEISHU_API_BASE}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${auth.session.accessToken}`,
            "Content-Type": "application/json; charset=utf-8",
            ...(init.headers ?? {}),
          },
        });
        const text = await response.text();
        let body: FeishuEnvelope<T>;
        try {
          body = JSON.parse(text) as FeishuEnvelope<T>;
        } catch {
          throw new OperationsApiError(
            response.status || 502,
            "飞书接口临时返回了异常页面，请稍后重试。",
          );
        }
        const retryable = response.status === 429 ||
          body.code === 1254290 || body.code === 1255040;
        if (retryable && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** attempt));
          continue;
        }
        if (!response.ok || (typeof body.code === "number" && body.code !== 0)) {
          throw new OperationsApiError(
            response.status || 502,
            body.msg || "飞书接口暂时不可用。",
            body.code,
          );
        }
        return body.data as T;
      }
      throw new OperationsApiError(429, "飞书请求频率过高，请稍后重新分析。");
    },
  };
}

export async function matchAnalysesToBase(
  client: Awaited<ReturnType<typeof createFeishuClient>>,
  analyses: CreatorThreadAnalysis[],
): Promise<Map<string, BaseMatch>> {
  const appToken = await resolveBaseAppToken(client);

  const tables = await listAllTables(client, appToken);
  const requestedTableNames = new Set(
    analyses.map((analysis) => analysis.sourceTable).filter(Boolean),
  );
  const recordsByTable = new Map<
    string,
    {
      tableId: string;
      fieldNames: string[];
      records: {
        record_id: string;
        fields: Record<string, unknown>;
      }[];
    }
  >();

  await Promise.all(
    [...requestedTableNames].map(async (tableName) => {
      const table = tables.find((item) => item.name === tableName);
      if (!table) return;
      const fields = await listAllFields(client, appToken, table.table_id);
      recordsByTable.set(tableName as string, {
        tableId: table.table_id,
        fieldNames: fields.map((field) => field.field_name),
        records: await searchRecordsForEmails(
          client,
          appToken,
          table.table_id,
          analyses
            .filter((analysis) => analysis.sourceTable === tableName)
            .map((analysis) => analysis.email),
          fields,
        ),
      });
    }),
  );

  const result = new Map<string, BaseMatch>();
  for (const analysis of analyses) {
    const tableName = analysis.sourceTable;
    const table = tableName ? recordsByTable.get(tableName) : undefined;
    if (!tableName || !table) {
      result.set(
        analysis.email,
        unavailableMatch(tableName, table?.tableId ?? null),
      );
      continue;
    }
    const matches = table.records.filter((record) =>
      recordContainsEmail(record.fields, analysis.email),
    );
    if (matches.length === 0) {
      result.set(analysis.email, {
        status: "unmatched",
        tableName,
        tableId: table.tableId,
        recordId: null,
        duplicateRecordIds: [],
        currentStage: null,
        proposedChanges: [],
        unresolvedFields: [],
        message: `在 ${tableName} 中没有找到邮箱 ${analysis.email}`,
      });
      continue;
    }
    if (matches.length > 1) {
      result.set(analysis.email, {
        status: "duplicate",
        tableName,
        tableId: table.tableId,
        recordId: null,
        duplicateRecordIds: matches.map((record) => record.record_id),
        currentStage: null,
        proposedChanges: [],
        unresolvedFields: [],
        message: `在 ${tableName} 中找到 ${matches.length} 条同邮箱记录，需要人工确认`,
      });
      continue;
    }
    result.set(
      analysis.email,
      buildMatchedPreview(
        tableName,
        table.tableId,
        matches[0],
        analysis,
        table.fieldNames,
      ),
    );
  }
  return result;
}

export async function resolveBaseAppToken(
  client: Awaited<ReturnType<typeof createFeishuClient>>,
): Promise<string> {
  const wikiToken =
    process.env.FEISHU_BASE_WIKI_TOKEN ??
    "Cvdnw4BuCio5A4k9vG9cBfbHn5c";
  const appToken =
    process.env.FEISHU_BASE_APP_TOKEN ??
    (
      await client.request<WikiNodeData>(
        `/wiki/v2/spaces/get_node?token=${encodeURIComponent(wikiToken)}`,
      )
    ).node?.obj_token;
  if (!appToken) {
    throw new OperationsApiError(
      502,
      "无法从知识库链接解析多维表 app_token。",
    );
  }
  return appToken;
}

function buildMatchedPreview(
  tableName: string,
  tableId: string,
  record: { record_id: string; fields: Record<string, unknown> },
  analysis: CreatorThreadAnalysis,
  availableFieldNames: string[],
): BaseMatch {
  const aliases: Record<string, string[]> = {
    合作进度: ["合作进度", "当前阶段", "进度", "Status"],
    更新日期: ["更新日期", "更新时间", "最后更新时间", "Update Date", "Last Updated"],
    最后收信日期: ["最后收信日期", "最后回复日期", "Last Inbound"],
    最后发信日期: ["最后发信日期", "最后跟进日期", "Last Outbound"],
    下一步: ["下一步", "下次操作", "Next Action"],
  };
  const proposedChanges: BaseMatch["proposedChanges"] = [];
  const unresolvedFields: string[] = [];
  const progressField = findSchemaField(
    aliases["合作进度"],
    availableFieldNames,
    /^(?:合作.*进度|当前.*阶段|collaboration.*(?:progress|status)|status)$/i,
  );
  const updateDateField = findSchemaField(
    aliases["更新日期"],
    availableFieldNames,
    /^(?:更新.*(?:日期|时间)|最后更新.*|(?:last.*updated?|update.*date))$/i,
  );
  const progressChanged = Boolean(
    progressField &&
      !sameValue(record.fields[progressField], analysis.stage),
  );

  for (const proposed of analysis.proposedFields) {
    if (proposed.field === "更新日期" && !progressChanged) continue;
    const actualField = (aliases[proposed.field] ?? [proposed.field]).find(
      (candidate) => availableFieldNames.includes(candidate),
    );
    if (!actualField) {
      unresolvedFields.push(proposed.field);
      continue;
    }
    const oldValue = record.fields[actualField];
    if (sameValue(oldValue, proposed.value)) continue;
    proposedChanges.push({
      field: actualField,
      oldValue,
      newValue: proposed.value,
      reason: proposed.reason,
    });
  }

  return {
    status: "matched",
    tableName,
    tableId,
    recordId: record.record_id,
    duplicateRecordIds: [],
    currentStage: stringField(
      record.fields["合作进度"] ??
        record.fields["当前阶段"] ??
        record.fields["进度"] ??
        record.fields["Status"],
    ),
    currentStageValue: progressField ? record.fields[progressField] : null,
    progressField: progressField ?? null,
    updateDateField: updateDateField ?? null,
    updateDateValue: updateDateField ? record.fields[updateDateField] : null,
    proposedChanges,
    unresolvedFields,
    message: `已按邮箱匹配到 ${tableName}`,
  };
}

function findSchemaField(
  aliases: string[],
  fieldNames: string[],
  fallback: RegExp,
): string | undefined {
  const normalize = (value: string) =>
    value.normalize("NFKC").replace(/[\s_（）()【】\[\]:：-]+/g, "").toLowerCase();
  const normalizedAliases = new Set(aliases.map(normalize));
  return (
    fieldNames.find((fieldName) => aliases.includes(fieldName)) ??
    fieldNames.find((fieldName) => normalizedAliases.has(normalize(fieldName))) ??
    fieldNames.find((fieldName) => fallback.test(fieldName.trim()))
  );
}

async function listAllTables(
  client: Awaited<ReturnType<typeof createFeishuClient>>,
  appToken: string,
) {
  const items: { table_id: string; name: string }[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const page = await client.request<TableListData>(
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables?${query.toString()}`,
    );
    items.push(...(page.items ?? []));
    pageToken = page.has_more ? page.page_token ?? "" : "";
  } while (pageToken);
  return items;
}

async function listAllRecords(
  client: Awaited<ReturnType<typeof createFeishuClient>>,
  appToken: string,
  tableId: string,
) {
  const items: {
    record_id: string;
    fields: Record<string, unknown>;
  }[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({
      page_size: "500",
      automatic_fields: "true",
    });
    if (pageToken) query.set("page_token", pageToken);
    const page = await client.request<RecordListData>(
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records?${query.toString()}`,
    );
    items.push(
      ...(page.items ?? []).map((item) => ({
        record_id: item.record_id,
        fields: item.fields ?? {},
      })),
    );
    pageToken = page.has_more ? page.page_token ?? "" : "";
  } while (pageToken && items.length < 20_000);
  return items;
}

async function searchRecordsForEmails(
  client: Awaited<ReturnType<typeof createFeishuClient>>,
  appToken: string,
  tableId: string,
  emails: string[],
  fields: NonNullable<FieldListData["items"]>,
) {
  if (!emails.length) return [];
  const emailFields = fields.filter((field) =>
    field.ui_type === "Email" ||
    /email|e-mail|邮箱|邮件|联系|contact/i.test(field.field_name),
  ).slice(0, 6);
  if (!emailFields.length) {
    return listAllRecords(client, appToken, tableId);
  }

  const records = new Map<string, { record_id: string; fields: Record<string, unknown> }>();
  const uniqueEmails = [...new Set(emails.map((email) => email.toLowerCase()))];
  const fieldsPerEmail = Math.max(1, emailFields.length);
  const chunkSize = Math.max(1, Math.min(20, Math.floor(45 / fieldsPerEmail)));
  for (let index = 0; index < uniqueEmails.length; index += chunkSize) {
    const chunk = uniqueEmails.slice(index, index + chunkSize);
    const conditions = chunk.flatMap((email) => emailFields.map((field) => ({
      field_name: field.field_name,
      operator: "contains",
      value: [email],
    })));
    let pageToken = "";
    do {
      const query = new URLSearchParams({ page_size: "500" });
      if (pageToken) query.set("page_token", pageToken);
      const page = await client.request<RecordListData>(
        `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/search?${query.toString()}`,
        {
          method: "POST",
          body: JSON.stringify({
            automatic_fields: true,
            filter: { conjunction: "or", conditions },
          }),
        },
      );
      for (const item of page.items ?? []) {
        records.set(item.record_id, {
          record_id: item.record_id,
          fields: item.fields ?? {},
        });
      }
      pageToken = page.has_more ? page.page_token ?? "" : "";
    } while (pageToken);
  }
  return [...records.values()];
}

async function listAllFields(
  client: Awaited<ReturnType<typeof createFeishuClient>>,
  appToken: string,
  tableId: string,
) {
  const items: NonNullable<FieldListData["items"]> = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (pageToken) query.set("page_token", pageToken);
    const page = await client.request<FieldListData>(
      `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields?${query.toString()}`,
    );
    items.push(...(page.items ?? []));
    pageToken = page.has_more ? page.page_token ?? "" : "";
  } while (pageToken);
  return items;
}

function recordContainsEmail(
  fields: Record<string, unknown>,
  email: string,
): boolean {
  const normalized = email.toLowerCase();
  return collectStrings(fields).some((value) => {
    const candidates =
      value.toLowerCase().match(/[^\s<>,;]+@[^\s<>,;]+/g) ?? [];
    return candidates.some(
      (candidate) =>
        candidate.replace(/[).]+$/, "").toLowerCase() === normalized,
    );
  });
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(
      collectStrings,
    );
  }
  return [];
}

function unavailableMatch(
  tableName: string | null,
  tableId: string | null,
): BaseMatch {
  return {
    status: "unavailable",
    tableName,
    tableId,
    recordId: null,
    duplicateRecordIds: [],
    currentStage: null,
    proposedChanges: [],
    unresolvedFields: [],
    message: tableName
      ? `没有找到名为“${tableName}”的来源表`
      : "邮件尚未归类，无法确定来源表",
  };
}

function stringField(value: unknown): string | null {
  if (typeof value === "string") return value;
  const strings = collectStrings(value);
  return strings[0] ?? null;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
