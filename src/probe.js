#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { appConfig, ensureRuntimeDirs } from "./config.js";

function normalize(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

async function main() {
  ensureRuntimeDirs();
  const context = await chromium.launchPersistentContext(appConfig.userDataDir, {
    headless: appConfig.headless,
    viewport: { width: 1440, height: 960 }
  });
  const page = context.pages()[0] || (await context.newPage());
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(appConfig.artifactDir, `probe-${stamp}.png`);
  const htmlPath = path.join(appConfig.artifactDir, `probe-${stamp}.html`);
  const jsonPath = path.join(appConfig.artifactDir, `probe-${stamp}.json`);

  try {
    await page.goto(appConfig.wenshuBaseUrl, { waitUntil: "domcontentloaded", timeout: appConfig.timeoutMs });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(htmlPath, await page.content(), "utf8");

    const analysis = await page.evaluate(() => {
      const take = (items, limit = 50) => items.slice(0, limit);
      const texts = (selector) =>
        take(
          Array.from(document.querySelectorAll(selector)).map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || "").replace(/\s+/g, " ").trim(),
            className: el.className || "",
            id: el.id || "",
            placeholder: el.getAttribute("placeholder") || "",
            href: el.getAttribute("href") || ""
          }))
        );

      return {
        url: location.href,
        title: document.title,
        inputs: texts("input, textarea, select"),
        buttons: texts("button, a, span"),
        forms: take(
          Array.from(document.querySelectorAll("form")).map((el) => ({
            id: el.id || "",
            className: el.className || "",
            text: (el.textContent || "").replace(/\s+/g, " ").trim()
          }))
        ),
        bodyTextSnippet: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 2000)
      };
    });

    fs.writeFileSync(jsonPath, JSON.stringify(analysis, null, 2), "utf8");
    console.log(JSON.stringify({ screenshotPath, htmlPath, jsonPath, pageTitle: analysis.title, url: analysis.url }, null, 2));
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
