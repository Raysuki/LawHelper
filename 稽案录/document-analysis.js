import path from "node:path";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import * as CFB from "cfb";
import { htmlToText } from "html-to-text";
import iconv from "iconv-lite";

const wordExtractor = new WordExtractor();

const analysisFields = [
  "案件名称",
  "案号",
  "案件类型",
  "案由",
  "法院层级",
  "法院",
  "审判程序",
  "裁判日期",
  "文书类型",
  "公开类型",
  "案例等级",
  "当事人",
  "律师",
  "律所",
  "审判人员",
  "法律依据"
];

export async function extractTextFromUpload(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const kind = detectOfficeKind(file.buffer);

  if (kind === "zip-docx") {
    return extractDocxText(file.buffer);
  }

  if (kind === "ole-doc") {
    return extractOleWordText(file.buffer);
  }

  if (kind === "html") {
    return cleanHtmlText(decodeHtmlBuffer(file.buffer));
  }

  if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
    return file.buffer.toString("utf8").trim();
  }

  if (ext === ".doc" || ext === ".docx") {
    return extractPlainTextFallback(file.buffer);
  }

  throw new Error(`暂不支持 ${ext || "未知"} 文件。请上传 Word(.doc/.docx)、TXT 或 MD 文件。`);
}

function detectOfficeKind(buffer) {
  const header = buffer.subarray(0, 8);
  if (header[0] === 0x50 && header[1] === 0x4b) return "zip-docx";
  if (
    header[0] === 0xd0 &&
    header[1] === 0xcf &&
    header[2] === 0x11 &&
    header[3] === 0xe0 &&
    header[4] === 0xa1 &&
    header[5] === 0xb1 &&
    header[6] === 0x1a &&
    header[7] === 0xe1
  ) return "ole-doc";
  const leading = buffer.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  if (leading.startsWith("<html") || leading.startsWith("<!doctype") || leading.includes("<body")) return "html";
  return "plain";
}

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

async function extractOleWordText(buffer) {
  try {
    const result = await wordExtractor.extract(buffer);
    const body = result.getBody();
    const headers = result.getHeaders?.() || "";
    const footers = result.getFooters?.() || "";
    const text = [headers, body, footers].filter(Boolean).join("\n").trim();
    if (text) return text;
  } catch {
    // Some court downloads are OLE containers whose WordDocument stream is HTML.
  }

  const oleHtml = extractHtmlFromOle(buffer);
  if (oleHtml) return cleanHtmlText(oleHtml);

  const fallback = extractPlainTextFallback(buffer);
  if (fallback) return fallback;
  throw new Error("无法从该 Word 文档中提取文本。该文件可能损坏或使用了暂不支持的旧式封装。");
}

function extractHtmlFromOle(buffer) {
  const compound = CFB.read(buffer, { type: "buffer" });
  const candidates = compound.FileIndex
    .filter((entry) => entry.content?.length)
    .map((entry) => decodeHtmlBuffer(entry.content))
    .filter((content) => /<html|<!doctype|<body/i.test(content));
  return candidates[0] || "";
}

function decodeHtmlBuffer(buffer) {
  const asciiView = buffer.subarray(0, 2048).toString("latin1");
  const charset = asciiView.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]?.toLowerCase();
  if (charset && iconv.encodingExists(charset)) {
    return iconv.decode(buffer, charset);
  }
  const utf8 = buffer.toString("utf8");
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount > 5 || /FONT-FAMILY:\s*[ºË]/i.test(asciiView)) {
    return iconv.decode(buffer, "gb18030");
  }
  return utf8;
}

function cleanHtmlText(html) {
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "a", options: { ignoreHref: true } }
    ]
  })
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractPlainTextFallback(buffer) {
  const utf8 = decodeHtmlBuffer(buffer);
  if (/<html|<!doctype|<body/i.test(utf8)) return cleanHtmlText(utf8);
  return utf8
    .replace(/\u0000/g, "")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function extractFirst(pattern, text, fallback = "未载明") {
  const match = text.match(pattern);
  return match?.[1]?.trim() || fallback;
}

function inferMeta(text, fallbackTitle) {
  const firstLines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const caseNo = extractFirst(/([（(]\d{4}[）)][^\n，。；;]{2,40}号)/, text);
  const court = firstLines.find((line) => /人民法院|知识产权法院|海事法院|互联网法院/.test(line)) || "未载明";
  const docType = firstLines.find((line) => /判决书|裁定书|决定书|调解书|通知书|支付令/.test(line)) || "未载明";
  const titleLine = firstLines.find((line) => line.length >= 6 && line.length <= 80 && /与|诉|纠纷|案/.test(line));
  const caseName = titleLine || fallbackTitle.replace(/\.[^.]+$/, "");
  const caseType = /行政/.test(text) ? "行政案件" : /刑事/.test(text) ? "刑事案件" : /赔偿/.test(text) ? "赔偿案件" : "民事案件";
  const procedure = /二审|终审|上诉/.test(text) ? "二审" : /再审/.test(text) ? "再审" : /执行/.test(text) ? "执行程序" : "一审";
  const date = extractFirst(/([二〇一二三四五六七八九零○0-9]{4}年[一二三四五六七八九十0-9]{1,2}月[一二三四五六七八九十0-9]{1,3}日)/, text);
  const cause = extractFirst(/(?:案由|纠纷[一]?案|因)([^，。；;\n]{2,24}纠纷)/, text, "未载明");

  return {
    案件名称: caseName,
    案号: caseNo,
    案件类型: caseType,
    案由: cause,
    法院层级: court.includes("最高") ? "最高人民法院" : court.includes("高级") ? "高级人民法院" : court.includes("中级") ? "中级人民法院" : "基层人民法院",
    法院: court,
    审判程序: procedure,
    裁判日期: date,
    文书类型: docType,
    公开类型: "公开文书",
    案例等级: "普通案例",
    当事人: extractFirst(/((?:原告|被告|上诉人|被上诉人|申请人|被申请人)[：:][\s\S]{0,240})/, text),
    律师: extractFirst(/(?:律师|委托诉讼代理人)[：:：]?\s*([^，。\n；;]{2,30})/, text, "无"),
    律所: extractFirst(/([^，。\n；;]{2,40}律师事务所)/, text, "无"),
    审判人员: extractFirst(/((?:审判长|审判员|人民陪审员|书记员)[：:][\s\S]{0,160})/, text),
    法律依据: extractFirst(/(依照[\s\S]{0,260}规定)/, text)
  };
}

function buildFallbackReport(meta, text) {
  const excerpt = text.slice(0, 260).replace(/\s+/g, " ");
  return [
    "**案件结构化分析报告**",
    "",
    "**一、基本案情**",
    excerpt ? `本文书显示，本案基本事实与程序信息主要载于原文首部及法院查明部分。案件名称为“${meta.案件名称}”，案号为“${meta.案号}”。因当前未连接 AI 或 AI 解析失败，以下内容为规则提取草稿，建议结合原文校正。` : "文书文本为空或无法提取。",
    "",
    "**二、诉讼请求／控辩意见**",
    "原告/上诉人主张：文书未载明或需人工校正。",
    "被告/被上诉人答辩：文书未载明或需人工校正。",
    "",
    "**三、争议焦点**",
    "1. 文书未载明或需结合“本院认为”部分人工提取。",
    "",
    "**四、法院认定事实**",
    "文书未载明或需人工校正。",
    "",
    "**五、裁判理由**",
    "文书未载明或需人工校正。",
    "",
    "**六、裁判结果**",
    "文书未载明或需人工校正。",
    "",
    "**七、案例独特性**",
    "文书未载明或需结合裁判理由、同类案件裁判规则进一步判断。"
  ].join("\n");
}

function buildPrompt(fileName, text) {
  return [
    "你是一名资深的法律案例分析专家，擅长将复杂的裁判文书转化为结构清晰、逻辑严谨的分析报告。你的分析必须忠实于原文，精准提炼，绝不编造。",
    "请严格输出 JSON，不要额外解释。JSON 结构：",
    "{ \"meta\": { \"案件名称\":\"\", \"案号\":\"\", \"案件类型\":\"\", \"案由\":\"\", \"法院层级\":\"\", \"法院\":\"\", \"审判程序\":\"\", \"裁判日期\":\"\", \"文书类型\":\"\", \"公开类型\":\"\", \"案例等级\":\"\", \"当事人\":\"\", \"律师\":\"\", \"律所\":\"\", \"审判人员\":\"\", \"法律依据\":\"\" }, \"reportMarkdown\":\"\" }",
    `meta 必须包含并只包含以下字段：${analysisFields.join("、")}。若未体现，写“未载明”或“无”。`,
    "reportMarkdown 不要输出“案件结构化分析报告”这个总标题，必须只按以下七个模块输出：**一、基本案情**、**二、诉讼请求／控辩意见**、**三、争议焦点**、**四、法院认定事实**、**五、裁判理由**、**六、裁判结果**、**七、案例独特性**。",
    "第七部分“案例独特性”须指出本案与同类案件相比的典型意义或特殊之处，可从法律问题新颖性/疑难性、裁判规则参考价值、特殊事实或证据形态、程序或实体处理方式、上级法院改判或裁判理念变化等方面概括。语言精炼，避免重复前文。",
    "核心规则：所有内容必须来源于判决书；涉及关键事实、法院观点时尽量引用原文关键表述；未载明则标注“文书未载明”；引用法条需写明法律全称及条文号。",
    `文件名：${fileName}`,
    "裁判文书原文：",
    text.slice(0, 26000)
  ].join("\n\n");
}

async function callOpenAiCompatibleAnalysis(fileName, text, config) {
  if (!config.aiApiKey) return null;
  const timeoutMs = Number(process.env.DOCUMENT_ANALYSIS_TIMEOUT_MS || 90_000);
  const response = await fetch(`${config.aiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.aiApiKey}`
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: config.aiModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你是严谨的中国裁判文书结构化分析助手，只输出 JSON。" },
        { role: "user", content: buildPrompt(fileName, text) }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`AI 文书解析失败：${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return content ? JSON.parse(content) : null;
}

export async function analyzeLegalDocument({ fileName, text, config }) {
  const fallbackMeta = inferMeta(text, fileName);
  try {
    const aiResult = await callOpenAiCompatibleAnalysis(fileName, text, config);
    const meta = { ...fallbackMeta, ...(aiResult?.meta || {}) };
    return {
      meta,
      reportMarkdown: aiResult?.reportMarkdown || buildFallbackReport(meta, text),
      usedAi: Boolean(aiResult?.reportMarkdown)
    };
  } catch (error) {
    const reason = error.name === "TimeoutError"
      ? `AI 解析超过 ${Math.round(Number(process.env.DOCUMENT_ANALYSIS_TIMEOUT_MS || 90_000) / 1000)} 秒未返回`
      : error.message;
    return {
      meta: fallbackMeta,
      reportMarkdown: `${buildFallbackReport(fallbackMeta, text)}\n\n> AI 解析失败，已生成规则提取草稿：${reason}`,
      usedAi: false
    };
  }
}
