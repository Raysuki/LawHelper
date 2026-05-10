import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { RetrievalOutputSchema } from "./schema.js";

async function saveDebugArtifacts(page, config, prefix) {
  const stamp = `${prefix}-${Date.now()}`;
  const htmlPath = path.join(config.artifactDir, `${stamp}.html`);
  const pngPath = path.join(config.artifactDir, `${stamp}.png`);
  await fs.promises.writeFile(htmlPath, await page.content(), "utf8").catch(() => {});
  await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});
  return { htmlPath, pngPath };
}

async function openBrowserSession(config) {
  if (config.browserMode === "cdp") {
    const browser = await chromium.connectOverCDP(config.chromeCdpUrl);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error("未连接到可用的 Chrome 上下文，请先运行 npm run chrome:start。");
    }
    return { browser, context, attached: true };
  }

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless,
    viewport: { width: 1440, height: 960 }
  });
  return { browser: null, context, attached: false };
}

async function firstVisible(page, selectors = [], timeout = 1500) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: "visible", timeout });
      return locator;
    } catch {
      // Try the next selector.
    }
  }
  return null;
}

async function detectCaptcha(page, selectors) {
  return Boolean(await firstVisible(page, selectors.captcha));
}

async function detectLoginPrompt(page, selectors) {
  return Boolean(await firstVisible(page, selectors.login));
}

async function detectLoggedIn(page, selectors) {
  return Boolean(await firstVisible(page, selectors.loggedIn, 1200));
}

async function waitForHumanResolution(page, config, selectors, reason) {
  const deadline = Date.now() + config.captchaWaitMinutes * 60_000;
  const markerFile = path.join(config.artifactDir, "human-in-the-loop.txt");
  fs.writeFileSync(
    markerFile,
    [
      `状态：${reason}`,
      "请在打开的浏览器中手动完成登录或验证码。",
      "完成后请保持浏览器页面打开，并删除本提示文件，脚本会继续等待。",
      markerFile
    ].join("\n"),
    "utf8"
  );

  while (Date.now() < deadline) {
    const captchaStillThere = await detectCaptcha(page, selectors);
    const loginStillThere = await detectLoginPrompt(page, selectors);
    const loggedIn = await detectLoggedIn(page, selectors);
    const markerExists = fs.existsSync(markerFile);
    if (!captchaStillThere && (!loginStillThere || loggedIn) && !markerExists) {
      return { resolved: true, markerFile };
    }
    await page.waitForTimeout(3000);
  }

  return { resolved: false, markerFile };
}

async function fillSearchForm(page, intent, selectors) {
  const advancedToggle = await firstVisible(page, [".advenced-search"], 3000);
  if (advancedToggle) {
    await advancedToggle.click().catch(() => {});
  }

  const advancedButton = await firstVisible(page, ["#searchBtn", "a#searchBtn"], 3000);
  if (advancedButton) {
    await page.evaluate((payload) => {
      const setInput = (id, value) => {
        const node = document.getElementById(id);
        if (!node) return;
        node.value = value || "";
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.dispatchEvent(new Event("change", { bubbles: true }));
      };

      const setDropdownByValue = (spanId, listId, expectedText, expectedValue) => {
        const span = document.getElementById(spanId);
        const list = document.getElementById(listId);
        if (!span || !list) return;
        const items = Array.from(list.querySelectorAll("li"));
        const match =
          items.find((item) => expectedValue && item.getAttribute("data-val") === expectedValue) ||
          items.find((item) => expectedText && (item.textContent || "").includes(expectedText));
        if (!match) return;
        span.setAttribute("data-val", match.getAttribute("data-val") || "");
        span.textContent = (match.textContent || "").trim();
      };

      const setCauseOfAction = (expectedText) => {
        if (!expectedText) return;
        const span = document.getElementById("s16");
        const tree = document.getElementById("ayTreeDiv");
        if (!span || !tree) return;
        const raw = tree.getAttribute("data-val");
        if (!raw) return;
        const nodes = JSON.parse(raw);
        const candidates = nodes
          .filter((node) => typeof node.text === "string" && node.text !== "请选择")
          .map((node) => ({
            ...node,
            score: node.text === expectedText ? 100 : node.text.includes(expectedText) ? 80 : expectedText.includes(node.text) ? 60 : 0
          }))
          .filter((node) => node.score > 0)
          .sort((a, b) => b.score - a.score || a.text.length - b.text.length);
        const best = candidates[0];
        if (!best) return;
        span.textContent = best.text;
        span.setAttribute("data-val", best.id || "");
        span.setAttribute("data-level", best.parent || "");
      };

      setInput("qbValue", payload.fullTextQuery);
      setInput("s1", payload.caseName);
      setInput("s7", payload.caseNo);
      setInput("s2", payload.courtName);
      setInput("s17", payload.partyName);
      setInput("flyj", payload.legalBasis);
      setInput("cprqStart", payload.dateStart);
      setInput("cprqEnd", payload.dateEnd);

      setDropdownByValue("s4", "gjjs_fycj", payload.courtLevelText, payload.courtLevelValue);
      setDropdownByValue("s8", "gjjs_ajlx", payload.caseTypeText, payload.caseTypeValue);
      setCauseOfAction(payload.causeOfAction);
    }, {
      fullTextQuery: intent.fullTextQuery || intent.rawQuery,
      caseName: intent.caseName || "",
      caseNo: intent.caseNo || "",
      courtName: intent.courtName || "",
      partyName: intent.partyRole || "",
      legalBasis: intent.legalBasis[0] || "",
      dateStart: intent.dateRange.start || "",
      dateEnd: intent.dateRange.end || "",
      causeOfAction: intent.causeOfAction || "",
      courtLevelText: intent.courtLevel === "未指定" ? "" : intent.courtLevel,
      courtLevelValue:
        intent.courtLevel === "最高法院" ? "1" :
        intent.courtLevel === "高级法院" ? "2" :
        intent.courtLevel === "中级法院" ? "3" :
        intent.courtLevel === "基层法院" ? "4" : "",
      caseTypeText:
        intent.caseType === "民事" ? "民事案件" :
        intent.caseType === "刑事" ? "刑事案件" :
        intent.caseType === "行政" ? "行政案件" :
        intent.caseType === "执行" ? "执行案件" :
        intent.caseType === "国家赔偿" ? "国家赔偿与司法救助案件" : "",
      caseTypeValue:
        intent.caseType === "民事" ? "03" :
        intent.caseType === "刑事" ? "02" :
        intent.caseType === "行政" ? "04" :
        intent.caseType === "执行" ? "10" :
        intent.caseType === "国家赔偿" ? "05" : ""
    });

    await advancedButton.click();
    return;
  }

  const input = await firstVisible(page, selectors.searchInput, 4000);
  if (!input) {
    throw new Error("未定位到检索输入框，请更新页面选择器。");
  }
  await input.fill(intent.fullTextQuery || intent.rawQuery);

  const button = await firstVisible(page, selectors.searchButton, 3000);
  if (!button) {
    throw new Error("未定位到检索按钮，请更新搜索按钮选择器。");
  }
  await button.click();
}

async function ensureSearchableSession(page, config, selectors) {
  await page.goto(config.wenshuBaseUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.timeoutMs
  });
  await page.waitForTimeout(1500);

  const alreadyLoggedIn = await detectLoggedIn(page, selectors);
  const captchaDetected = await detectCaptcha(page, selectors);
  const loginDetected = await detectLoginPrompt(page, selectors);

  if (!alreadyLoggedIn && (captchaDetected || loginDetected)) {
    const human = await waitForHumanResolution(page, config, selectors, captchaDetected ? "captcha" : "login");
    if (!human.resolved) {
      return {
        ok: false,
        output: {
          status: "needs_human",
          nextAction: `请在浏览器中完成${captchaDetected ? "验证码" : "登录"}，删除提示文件后重试：${human.markerFile}`,
          notes: ["首页尚未进入可检索登录态。"]
        }
      };
    }
  }

  return { ok: true };
}

export async function runWenshuSearch(intent, config, selectors) {
  const session = await openBrowserSession(config);
  const { context } = session;
  const page = context.pages()[0] || (await context.newPage());
  const notes = [];

  try {
    const sessionState = await ensureSearchableSession(page, config, selectors);
    if (!sessionState.ok) {
      return RetrievalOutputSchema.parse({
        ...sessionState.output,
        intent,
        resultUrl: page.url()
      });
    }

    notes.push("已进入可检索会话，开始执行检索。");
    await fillSearchForm(page, intent, selectors);
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(5000);

    if (/181010CARHS5BS3C\/index\.html/i.test(page.url())) {
      const human = await waitForHumanResolution(page, config, selectors, "login-after-search");
      if (!human.resolved) {
        return RetrievalOutputSchema.parse({
          status: "needs_human",
          intent,
          resultUrl: page.url(),
          nextAction: `检索跳转到统一登录页，请在同一浏览器会话里完成授权后重试。提示文件：${human.markerFile}`,
          notes: [...notes, "检索请求触发统一登录回跳。"]
        });
      }
      notes.push("统一登录回跳已人工处理，准备重新检索。");
      await page.goto(config.wenshuBaseUrl, { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
      await page.waitForTimeout(1500);
      await fillSearchForm(page, intent, selectors);
      await page.waitForTimeout(5000);
    }

    if (await detectCaptcha(page, selectors)) {
      const human = await waitForHumanResolution(page, config, selectors, "captcha-after-search");
      if (!human.resolved) {
        return RetrievalOutputSchema.parse({
          status: "needs_human",
          intent,
          resultUrl: page.url(),
          nextAction: `检索后触发验证码，请手动完成并重试。提示文件：${human.markerFile}`,
          notes: [...notes, "检索阶段触发验证码。"]
        });
      }
      notes.push("检索阶段验证码已人工处理。");
    }

    return RetrievalOutputSchema.parse({
      status: "ok",
      intent,
      resultUrl: page.url(),
      nextAction: "已完成检索并停留在浏览器结果页。请在浏览器中手动打开文书或下载 Word 文件。",
      notes
    });
  } catch (error) {
    const debug = await saveDebugArtifacts(page, config, "search-error");
    return RetrievalOutputSchema.parse({
      status: "error",
      intent,
      resultUrl: page.url(),
      nextAction: `检索执行失败，请结合调试文件排查：${debug.htmlPath}，${debug.pngPath}`,
      notes: [...notes, error.message]
    });
  } finally {
    if (session.attached) {
      if (!config.keepAttachedBrowserOpen) {
        await page.close().catch(() => {});
        await session.browser?.close().catch(() => {});
      }
    } else {
      await context.close().catch(() => {});
    }
  }
}
