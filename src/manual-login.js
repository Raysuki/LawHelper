#!/usr/bin/env node
import { chromium } from "playwright";
import { appConfig, ensureRuntimeDirs } from "./config.js";

async function main() {
  ensureRuntimeDirs();
  if (appConfig.browserMode === "cdp") {
    console.log("当前推荐模式是 cdp，请改用 npm run chrome:start 后在打开的 Chrome 中登录。");
    return;
  }
  const context = await chromium.launchPersistentContext(appConfig.userDataDir, {
    headless: false,
    viewport: { width: 1440, height: 960 }
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(appConfig.wenshuBaseUrl, { waitUntil: "domcontentloaded", timeout: appConfig.timeoutMs });
  console.log("文书网浏览器已打开。请在该窗口中完成登录或验证码，完成后直接关闭浏览器窗口即可。");
  context.on("close", () => process.exit(0));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
