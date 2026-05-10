import { SearchIntentSchema } from "./schema.js";

const courtLevelRules = [
  ["最高", "最高法院"],
  ["高院", "高级法院"],
  ["高级", "高级法院"],
  ["中院", "中级法院"],
  ["中级", "中级法院"],
  ["基层", "基层法院"]
];

const caseTypeRules = [
  ["民事", "民事"],
  ["刑事", "刑事"],
  ["行政", "行政"],
  ["执行", "执行"],
  ["国家赔偿", "国家赔偿"]
];

const causeNormalizer = [
  { pattern: /高校|学校|大学|学生|开除|处分|教育行政/, value: "教育行政管理" },
  { pattern: /劳动合同|解除|经济补偿|劳动争议|工伤|竞业限制/, value: "劳动争议" },
  { pattern: /交通事故|机动车|同等责任|道路交通/, value: "机动车交通事故责任纠纷" },
  { pattern: /股东.*出资|出资义务|抽逃出资|虚假出资/, value: "股东出资纠纷" },
  { pattern: /股权转让/, value: "股权转让纠纷" },
  { pattern: /借款|民间借贷/, value: "民间借贷纠纷" },
  { pattern: /侵权|1165/, value: "侵权责任纠纷" },
  { pattern: /买卖合同|购销合同/, value: "买卖合同纠纷" },
  { pattern: /租赁|房屋租赁/, value: "房屋租赁合同纠纷" }
];

const legalBasisRules = [
  { pattern: /(?:法律依据|适用|依据|涉及|法条).*(?:民法典|1165)|民法典第?\s*1165\s*条?/, value: "《中华人民共和国民法典》" },
  { pattern: /(?:法律依据|适用|依据|涉及|法条).*(?:劳动合同法)/, value: "《中华人民共和国劳动合同法》" },
  { pattern: /(?:法律依据|适用|依据|涉及|法条).*(?:教育法)/, value: "《中华人民共和国教育法》" },
  { pattern: /(?:法律依据|适用|依据|涉及|法条).*(?:高等教育法)/, value: "《中华人民共和国高等教育法》" },
  { pattern: /(?:法律依据|适用|依据|涉及|法条).*(?:行政诉讼法)/, value: "《中华人民共和国行政诉讼法》" },
  { pattern: /(?:法律依据|适用|依据|涉及|法条).*(?:公司法)/, value: "《中华人民共和国公司法》" },
  { pattern: /(?:法律依据|适用|依据|涉及|法条).*(?:刑法)/, value: "《中华人民共和国刑法》" }
];

const stopPhrases = [
  "请你帮我",
  "帮我",
  "请帮我",
  "请你",
  "找一些",
  "找一批",
  "找出",
  "查一下",
  "查找",
  "查询",
  "检索",
  "搜索",
  "找到",
  "关于",
  "有关",
  "相关",
  "我想",
  "想看",
  "看看",
  "案例",
  "案件",
  "案子",
  "文书",
  "判决",
  "裁定",
  "裁判文书"
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRawQuery(rawQuery) {
  return rawQuery
    .replace(/[，。、“”‘’；：？?!.！,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripStopPhrases(rawQuery) {
  return stopPhrases
    .reduce((text, phrase) => text.replace(new RegExp(escapeRegExp(phrase), "g"), " "), rawQuery)
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(rawQuery) {
  const normalized = stripStopPhrases(normalizeRawQuery(rawQuery));
  const candidates = [];
  const phrasePatterns = [
    /民法典第?\s*\d+\s*条?/g,
    /民法典/g,
    /高校|学校|大学|学生|作弊|开除|处分|行政诉讼/g,
    /劳动合同|解除|经济补偿|劳动争议/g,
    /交通事故|同等责任|机动车/g,
    /股东未履行出资义务/g,
    /未履行出资义务/g,
    /股东(?:违反)?出资义务/g,
    /股东/g,
    /出资义务|抽逃出资|虚假出资|股权转让/g,
    /民事一审|民事二审|一审|二审/g,
    /民间借贷|侵权责任|买卖合同/g
  ];

  for (const pattern of phrasePatterns) {
    candidates.push(...(normalized.match(pattern) || []));
  }

  for (const chunk of normalized.split(/\s+/)) {
    if (chunk && chunk.length >= 2) {
      candidates.push(chunk);
    }
  }

  const seen = new Set();
  return candidates
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      if (item.length > 16) return false;
      if (stopPhrases.includes(item) || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 8);
}

function buildFullTextQuery(rawQuery, causeOfAction, legalBasis) {
  if (causeOfAction === "股东出资纠纷") {
    const terms = ["出资义务", "股东"];
    if (/未履行出资义务|未履行.*出资义务/.test(rawQuery)) {
      terms.push("股东未履行出资义务");
    }
    if (/民事一审|一审/.test(rawQuery)) {
      terms.push("民事一审");
    }
    if (/民事二审|二审/.test(rawQuery)) {
      terms.push("民事二审");
    }
    return [...new Set(terms)].join(" ");
  }

  const keywords = extractKeywords(rawQuery);
  const expanded = [...keywords];

  if (causeOfAction === "教育行政管理") {
    expanded.push("高校", "学生", "开除", "行政诉讼");
  }
  if (causeOfAction === "劳动争议") {
    expanded.push("劳动合同", "解除", "经济补偿");
  }
  return [...new Set(expanded)].slice(0, 8).join(" ").trim();
}

function asksForLegalBasis(rawQuery) {
  return /法律依据|适用.*法|依据.*法|涉及.*法|法条|第\s*\d+\s*条/.test(rawQuery);
}

function asksForPartyField(rawQuery) {
  return /当事人|原告|被告|上诉人|被上诉人|申请人|被申请人/.test(rawQuery);
}

function shouldKeepRuleBasedFullText(heuristic) {
  return heuristic.causeOfAction === "股东出资纠纷" && /出资义务|股东/.test(heuristic.rawQuery);
}

export function buildNluPrompt(rawQuery) {
  return [
    "你是法律检索参数解析器。请把用户的自然语言检索需求拆成结构化 JSON。",
    "字段必须包含：keywords, fullTextQuery, causeOfAction, legalBasis, courtLevel, caseType, region, dateRange, partyRole, requestedCount, sortBy, ambiguities, searchPlan, recommendedAdvancedFields。",
    "枚举限制：courtLevel 只能是 基层法院/中级法院/高级法院/最高法院/未指定；caseType 只能是 民事/刑事/行政/执行/国家赔偿/未指定；sortBy 只能是 相关度/裁判日期。",
    "要求：",
    "1. 优先映射到中国裁判文书网高级检索字段。",
    "2. fullTextQuery 必须是关键词组合，不要直接复述整句用户输入。",
    "3. 案由不确定时可留空，不要编造。",
    "4. searchPlan 给出 2-4 条可执行检索策略。",
    "5. 只输出 JSON，不要额外解释。",
    `用户输入：${rawQuery}`
  ].join("\n");
}

async function callOpenAiCompatibleApi(rawQuery, config) {
  if (!config.aiApiKey) {
    return null;
  }

  const response = await fetch(`${config.aiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.aiApiKey}`
    },
    body: JSON.stringify({
      model: config.aiModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你擅长把中国法律检索需求映射到裁判文书网高级检索字段。"
        },
        {
          role: "user",
          content: buildNluPrompt(rawQuery)
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`LLM mapping failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return content ? JSON.parse(content) : null;
}

function heuristicMapping(rawQuery) {
  const requestedCountMatch = rawQuery.match(/(\d+)\s*(个|件|篇|条)/);
  const courtLevel = courtLevelRules.find(([hint]) => rawQuery.includes(hint))?.[1] || "未指定";
  const caseType =
    caseTypeRules.find(([hint]) => rawQuery.includes(hint))?.[1] ||
    (/(高校|学校|教育行政|行政诉讼)/.test(rawQuery) ? "行政" : "民事");
  const causeOfAction = causeNormalizer.find((item) => item.pattern.test(rawQuery))?.value || "";
  const legalBasis = asksForLegalBasis(rawQuery)
    ? [...new Set(legalBasisRules.filter((item) => item.pattern.test(rawQuery)).map((item) => item.value))]
    : [];
  const keywords = extractKeywords(rawQuery);
  const fullTextQuery = buildFullTextQuery(rawQuery, causeOfAction, legalBasis);

  const ambiguities = [];
  if (!causeOfAction) {
    ambiguities.push("未明确标准案由，建议先用全文检索再缩小范围。");
  }
  if (courtLevel === "未指定") {
    ambiguities.push("未指定法院层级，默认全量法院。");
  }

  return {
    rawQuery,
    keywords,
    fullTextQuery,
    causeOfAction,
    caseName: "",
    caseNo: "",
    courtName: "",
    legalBasis,
    courtLevel,
    caseType,
    region: "",
    dateRange: { start: "", end: "" },
    partyRole: "",
    requestedCount: requestedCountMatch ? Number(requestedCountMatch[1]) : 5,
    sortBy: rawQuery.includes("最新") || rawQuery.includes("近五年") ? "裁判日期" : "相关度",
    ambiguities,
    searchPlan: [
      "先将自然语言拆成高级检索字段，而不是整句直接搜索。",
      "优先使用全文关键词与案件类型；只有用户明确要求时才填写当事人、法律依据等窄条件。",
      "检索完成后停留在结果页，由用户在浏览器中继续阅读、下载或导入文书。"
    ],
    recommendedAdvancedFields: [
      fullTextQuery ? "全文检索" : "",
      caseType !== "未指定" ? "案件类型" : "",
      courtLevel !== "未指定" ? "法院层级" : "",
      legalBasis.length > 0 ? "法律依据" : ""
    ].filter(Boolean)
  };
}

function mergeWithHeuristic(heuristic, llmResult) {
  if (!llmResult) {
    return heuristic;
  }

  const llmFullTextQuery = String(llmResult.fullTextQuery || "").trim();
  const rejectRawSentence =
    shouldKeepRuleBasedFullText(heuristic) ||
    !llmFullTextQuery ||
    llmFullTextQuery === heuristic.rawQuery ||
    llmFullTextQuery.length > Math.max(18, heuristic.rawQuery.length - 2);

  const legalBasis =
    asksForLegalBasis(heuristic.rawQuery) && Array.isArray(llmResult.legalBasis) && llmResult.legalBasis.length > 0
      ? llmResult.legalBasis
      : heuristic.legalBasis;
  const partyRole = asksForPartyField(heuristic.rawQuery) ? llmResult.partyRole || heuristic.partyRole : "";

  const recommendedAdvancedFields =
    Array.isArray(llmResult.recommendedAdvancedFields) && llmResult.recommendedAdvancedFields.length > 0
      ? llmResult.recommendedAdvancedFields
      : heuristic.recommendedAdvancedFields;

  return {
    ...heuristic,
    ...llmResult,
    rawQuery: heuristic.rawQuery,
    keywords: Array.isArray(llmResult.keywords) && llmResult.keywords.length > 0 ? llmResult.keywords : heuristic.keywords,
    fullTextQuery: rejectRawSentence ? heuristic.fullTextQuery : llmFullTextQuery,
    causeOfAction: llmResult.causeOfAction || heuristic.causeOfAction,
    legalBasis,
    partyRole,
    courtLevel: llmResult.courtLevel || heuristic.courtLevel,
    caseType: llmResult.caseType || heuristic.caseType,
    ambiguities: Array.isArray(llmResult.ambiguities) ? llmResult.ambiguities : heuristic.ambiguities,
    searchPlan: Array.isArray(llmResult.searchPlan) && llmResult.searchPlan.length > 0 ? llmResult.searchPlan : heuristic.searchPlan,
    recommendedAdvancedFields: recommendedAdvancedFields.filter((field) => {
      if (field === "法律依据" && legalBasis.length === 0) return false;
      if (field === "当事人" && !partyRole) return false;
      return true;
    })
  };
}

export async function mapNaturalLanguageToParams(rawQuery, config) {
  const heuristic = heuristicMapping(rawQuery);

  try {
    const llmResult = await callOpenAiCompatibleApi(rawQuery, config);
    return SearchIntentSchema.parse(mergeWithHeuristic(heuristic, llmResult));
  } catch (error) {
    return SearchIntentSchema.parse({
      ...heuristic,
      ambiguities: [...heuristic.ambiguities, `AI 映射失败，已回退到规则解析：${error.message}`]
    });
  }
}
