import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config();

const cwd = projectRoot;

function resolveFromCwd(value, fallback) {
  return path.resolve(cwd, value || fallback);
}

export const appConfig = {
  cwd,
  aiApiKey: process.env.DEEPSEEK_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "",
  aiBaseUrl: process.env.DEEPSEEK_BASE_URL || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1",
  aiModel: process.env.DEEPSEEK_MODEL || process.env.AI_MODEL || process.env.OPENAI_MODEL || "deepseek-v4-flash",
  wenshuBaseUrl: process.env.WENSHU_BASE_URL || "https://wenshu.court.gov.cn",
  browserMode: process.env.WENSHU_BROWSER_MODE || "cdp",
  keepAttachedBrowserOpen: String(process.env.WENSHU_KEEP_ATTACHED_BROWSER_OPEN || "true").toLowerCase() !== "false",
  chromeCdpUrl: process.env.WENSHU_CHROME_CDP_URL || "http://127.0.0.1:9222",
  chromeExecutable:
    process.env.WENSHU_CHROME_EXECUTABLE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  userDataDir: resolveFromCwd(process.env.WENSHU_USER_DATA_DIR, ".wenshu/browser-profile"),
  headless: String(process.env.WENSHU_HEADLESS || "false").toLowerCase() === "true",
  timeoutMs: Number(process.env.WENSHU_TIMEOUT_MS || 30000),
  maxResults: Number(process.env.WENSHU_MAX_RESULTS || 5),
  hitlMode: process.env.WENSHU_HITL_MODE || "manual",
  captchaWaitMinutes: Number(process.env.WENSHU_CAPTCHA_WAIT_MINUTES || 10),
  artifactDir: resolveFromCwd(process.env.WENSHU_ARTIFACT_DIR, "artifacts"),
  selectorFile: resolveFromCwd(process.env.WENSHU_SELECTOR_FILE, "config/selectors.example.json")
};

appConfig.openAiApiKey = appConfig.aiApiKey;
appConfig.openAiBaseUrl = appConfig.aiBaseUrl;
appConfig.openAiModel = appConfig.aiModel;

export function ensureRuntimeDirs() {
  for (const dir of [appConfig.userDataDir, appConfig.artifactDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadSelectorConfig() {
  if (!fs.existsSync(appConfig.selectorFile)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(appConfig.selectorFile, "utf8"));
}
