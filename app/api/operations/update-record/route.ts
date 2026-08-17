import {
  createFeishuClient,
  OperationsApiError,
  resolveBaseAppToken,
} from "../_shared";

export const dynamic = "force-dynamic";

type Change = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
};

type RecordData = {
  record?: {
    record_id?: string;
    fields?: Record<string, unknown>;
  };
};

const allowedFields = new Set([
  "合作进度", "当前阶段", "进度", "Status",
  "更新日期", "更新时间", "最后更新时间", "Update Date", "Last Updated",
  "最后收信日期", "最后回复日期", "Last Inbound",
  "最后发信日期", "最后跟进日期", "Last Outbound",
  "下一步", "下次操作", "Next Action",
]);

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      tableId?: string;
      recordId?: string;
      changes?: Change[];
      confirmed?: boolean;
    };
    if (!body.confirmed) {
      throw new OperationsApiError(400, "更新飞书总表前必须确认字段新旧值。");
    }
    const tableId = body.tableId?.trim() ?? "";
    const recordId = body.recordId?.trim() ?? "";
    const changes = (body.changes ?? []).slice(0, 20);
    if (!/^tbl[A-Za-z0-9]+$/.test(tableId) || !/^rec[A-Za-z0-9]+$/.test(recordId)) {
      throw new OperationsApiError(400, "多维表记录信息不完整。");
    }
    if (!changes.length || changes.some((change) => !isAllowedField(change.field))) {
      throw new OperationsApiError(400, "没有可安全写入的已确认字段。");
    }

    const client = await createFeishuClient(request);
    const appToken = await resolveBaseAppToken(client);
    const path = `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`;
    const current = await client.request<RecordData>(`${path}?automatic_fields=true`);
    const fields = current.record?.fields ?? {};
    for (const change of changes) {
      if (!sameValue(fields[change.field], change.oldValue)) {
        throw new OperationsApiError(
          409,
          `飞书字段“${change.field}”已发生变化，为避免覆盖他人更新，请重新分析后再确认。`,
        );
      }
    }
    const updateFields = Object.fromEntries(changes.map((change) => [
      change.field,
      normalizeFieldValue(change.field, change.newValue),
    ]));
    await client.request<RecordData>(path, {
      method: "PUT",
      body: JSON.stringify({ fields: updateFields }),
    });
    const verified = await client.request<RecordData>(`${path}?automatic_fields=true`);
    const verifiedFields = verified.record?.fields ?? {};
    const failed = Object.entries(updateFields).filter(
      ([field, value]) => !sameValue(verifiedFields[field], value),
    );
    if (failed.length) {
      throw new OperationsApiError(502, "飞书已接受更新，但字段验证未完成，请在总表中复核。");
    }
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (client.setCookie) headers.set("Set-Cookie", client.setCookie);
    return Response.json({ ok: true, recordId, fields: updateFields }, { headers });
  } catch (error) {
    if (error instanceof OperationsApiError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return Response.json({ error: "飞书表格更新失败，请稍后重试。" }, { status: 500 });
  }
}

function normalizeFieldValue(field: string, newValue: unknown): unknown {
  if (
    typeof newValue === "string" &&
    isUpdateDateField(field) &&
    /^\d{4}-\d{2}-\d{2}$/.test(newValue)
  ) {
    return Date.parse(`${newValue}T00:00:00+08:00`);
  }
  return newValue;
}

function isAllowedField(field: string): boolean {
  return (
    allowedFields.has(field) ||
    /^(?:合作.*进度|当前.*阶段|collaboration.*(?:progress|status))$/i.test(field.trim()) ||
    isUpdateDateField(field)
  );
}

function isUpdateDateField(field: string): boolean {
  return /^(?:更新.*(?:日期|时间)|最后更新.*|last.*updated?|update.*date)$/i.test(field.trim());
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
