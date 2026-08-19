type FeishuRecord = Record<string, unknown>;

/**
 * Feishu has returned both `draft_id` and `id` for draft creation across
 * different API versions. Some responses also wrap the identifier in a
 * `draft` object. Keep this deliberately narrow so another unrelated id can
 * never be mistaken for a draft that is safe to send.
 */
export function extractFeishuDraftId(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "";

  const direct = stringValue(record.draft_id) || stringValue(record.id);
  if (direct) return direct;

  return extractFeishuDraftId(record.draft);
}

function asRecord(value: unknown): FeishuRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as FeishuRecord
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
