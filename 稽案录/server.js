import express from "express";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import multer from "multer";
import { ensureRuntimeDirs, appConfig, loadSelectorConfig } from "../src/config.js";
import { mapNaturalLanguageToParams } from "../src/nlu.js";
import { SearchIntentSchema } from "../src/schema.js";
import { runWenshuSearch } from "../src/wenshu-client.js";
import { addCasesToProject, deleteCase, readLibrary, renameCase } from "./storage.js";
import { analyzeLegalDocument, extractTextFromUpload } from "./document-analysis.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();
const port = Number(process.env.JIANLU_API_PORT || 3001);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 8 }
});

app.use(express.json({ limit: "2mb" }));

async function canReachChromeCdp() {
  try {
    const response = await fetch(new URL("/json/version", appConfig.chromeCdpUrl), {
      signal: AbortSignal.timeout(1500)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureChromeDebugSession() {
  if (appConfig.browserMode !== "cdp") {
    return { ok: true, started: false };
  }

  if (await canReachChromeCdp()) {
    return { ok: true, started: false };
  }

  if (!fs.existsSync(appConfig.chromeExecutable)) {
    return {
      ok: false,
      started: false,
      message: `未找到 Chrome 可执行文件：${appConfig.chromeExecutable}。请在 D:\\LawHelper\\.env 中设置 WENSHU_CHROME_EXECUTABLE。`
    };
  }

  ensureRuntimeDirs();
  const cdpPort = new URL(appConfig.chromeCdpUrl).port || "9222";
  spawn(appConfig.chromeExecutable, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${path.resolve(appConfig.userDataDir)}`,
    "--profile-directory=Default",
    appConfig.wenshuBaseUrl
  ], {
    detached: true,
    stdio: "ignore"
  }).unref();

  for (let index = 0; index < 10; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (await canReachChromeCdp()) {
      return { ok: true, started: true };
    }
  }

  return {
    ok: false,
    started: true,
    message: `已尝试启动 Chrome，但仍无法连接 ${appConfig.chromeCdpUrl}。请确认 Chrome 没有被安全软件拦截，并可手动运行 npm run chrome:start。`
  };
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/library", (_request, response) => {
  response.json(readLibrary());
});

app.post("/api/search/intent", async (request, response) => {
  const query = String(request.body?.query || "").trim();
  if (!query) {
    response.status(400).json({ error: "检索需求不能为空。" });
    return;
  }

  try {
    ensureRuntimeDirs();
    const intent = await mapNaturalLanguageToParams(query, appConfig);
    response.json({ intent });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "检索字段解析失败。"
    });
  }
});

app.post("/api/search/run", async (request, response) => {
  try {
    ensureRuntimeDirs();
    const intent = SearchIntentSchema.parse(request.body?.intent);
    const chrome = await ensureChromeDebugSession();
    if (!chrome.ok) {
      response.status(500).json({ error: chrome.message });
      return;
    }
    const selectors = loadSelectorConfig();
    const output = await runWenshuSearch(intent, appConfig, selectors);
    response.json({ output });
  } catch (error) {
    const message = error instanceof Error ? error.message : "检索执行失败。";
    if (message.includes("ECONNREFUSED") && message.includes("9222")) {
      response.status(500).json({
        error: "没有连接到可自动化控制的 Chrome。系统已配置为连接 127.0.0.1:9222，请先运行 npm run chrome:start，或重新点击开始检索让服务自动启动。"
      });
      return;
    }
    response.status(500).json({
      error: message
    });
  }
});

app.post("/api/documents/analyze", upload.array("files"), async (request, response) => {
  const projectId = String(request.body?.projectId || "g1");
  const manualText = String(request.body?.manualText || "").trim();
  const manualTitle = String(request.body?.manualTitle || "手动录入文书").trim();
  const files = request.files || [];

  if (files.length === 0 && !manualText) {
    response.status(400).json({ error: "请上传 Word/TXT/MD 文件，或粘贴文书文本。" });
    return;
  }

  try {
    response.setTimeout(Number(process.env.DOCUMENT_REQUEST_TIMEOUT_MS || 180_000));
    const sources = [];
    for (const file of files) {
      sources.push({
        fileName: file.originalname,
        text: await extractTextFromUpload(file)
      });
    }
    if (manualText) {
      sources.push({ fileName: manualTitle, text: manualText });
    }

    const now = new Date().toISOString();
    const cases = [];
    for (const source of sources) {
      const analysis = await analyzeLegalDocument({
        fileName: source.fileName,
        text: source.text,
        config: appConfig
      });
      const meta = analysis.meta;
      cases.push({
        id: `case-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        projectId,
        name: meta.案件名称 && meta.案件名称 !== "未载明" ? meta.案件名称 : source.fileName.replace(/\.[^.]+$/, ""),
        type: meta.案件类型 || "未载明",
        cause: meta.案由 || "未载明",
        court: meta.法院 || "未载明",
        date: meta.裁判日期 || "",
        labels: [meta.案由, meta.审判程序, analysis.usedAi ? "AI解析" : "规则草稿"].filter(Boolean).slice(0, 4),
        originalText: source.text,
        analysisReport: analysis.reportMarkdown,
        analysisMeta: meta,
        sourceFileName: source.fileName,
        updatedAt: now
      });
    }

    const library = addCasesToProject(projectId, cases);
    response.json({ cases, library });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "文书解析失败。"
    });
  }
});

app.delete("/api/cases/:caseId", (request, response) => {
  try {
    const library = deleteCase(request.params.caseId);
    response.json({ library });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "删除案例失败。"
    });
  }
});

app.patch("/api/cases/:caseId", (request, response) => {
  const name = String(request.body?.name || "").trim();
  if (!name) {
    response.status(400).json({ error: "案例名称不能为空。" });
    return;
  }

  try {
    const library = renameCase(request.params.caseId, name);
    response.json({ library });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "重命名案例失败。"
    });
  }
});

app.listen(port, () => {
  console.log(`Ji An Lu API listening on http://127.0.0.1:${port}`);
});
