export type EditableCreatorCategory = "UGC" | "牙医合作" | "商业化红人";

export type RoutingRule = {
  category: EditableCreatorCategory;
  label: string;
  sourceTable: string;
  subjectKeywords: string[];
  bodyKeywords: string[];
};

export type RoutingConfig = {
  rules: RoutingRule[];
};

export const defaultRoutingConfig: RoutingConfig = {
  rules: [
    {
      category: "UGC",
      label: "UGC 红人",
      sourceTable: "UGC👖",
      subjectKeywords: [
        "paid ugc collab with ranvoo",
        "felicia from wlive",
        "ugc creator",
        "ugc partnership",
      ],
      bodyKeywords: [],
    },
    {
      category: "牙医合作",
      label: "牙医 / 专业人员",
      sourceTable: "专业人员👖",
      subjectKeywords: [
        "next-gen electric toothbrush",
        "next-gen electric toothbrush for professionals to test",
        "ranvoo x dental advisor",
      ],
      bodyKeywords: [
        "dentist",
        "dental professional",
        "dental clinic",
        "dental hygienist",
        "dds",
        "dmd",
        "rdh",
        "牙医",
      ],
    },
    {
      category: "商业化红人",
      label: "商业化红人",
      sourceTable: "牙刷红人👖",
      subjectKeywords: [
        "paid instagram collab with ranvoo",
        "helping moms make self-care easier",
        "oral care experience during pregnancy",
        "empowering moms with better oral care",
      ],
      bodyKeywords: [
        "pregnancy creator",
        "postpartum creator",
        "parenting creator",
        "family lifestyle creator",
        "mom creator",
      ],
    },
  ],
};

export function normalizeRoutingConfig(value: unknown): RoutingConfig {
  const candidate = value as { rules?: unknown[] } | null;
  const incoming = Array.isArray(candidate?.rules) ? candidate.rules : [];
  const byCategory = new Map<EditableCreatorCategory, RoutingRule>();
  for (const raw of incoming.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<RoutingRule>;
    if (!isEditableCategory(item.category)) continue;
    byCategory.set(item.category, {
      category: item.category,
      label: cleanText(item.label, 40) || defaultRule(item.category).label,
      sourceTable:
        cleanText(item.sourceTable, 80) || defaultRule(item.category).sourceTable,
      subjectKeywords: cleanKeywords(item.subjectKeywords),
      bodyKeywords: cleanKeywords(item.bodyKeywords),
    });
  }
  return {
    rules: defaultRoutingConfig.rules.map(
      (fallback) => byCategory.get(fallback.category) ?? structuredClone(fallback),
    ),
  };
}

function defaultRule(category: EditableCreatorCategory): RoutingRule {
  return defaultRoutingConfig.rules.find((rule) => rule.category === category)!;
}

function isEditableCategory(value: unknown): value is EditableCreatorCategory {
  return value === "UGC" || value === "牙医合作" || value === "商业化红人";
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase().slice(0, 100))
    .filter(Boolean))].slice(0, 40);
}
