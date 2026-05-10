#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { appConfig, ensureRuntimeDirs } from "./config.js";

function quoteIfNeeded(value) {
  return value.includes(" ") ? `"${value}"` : value;
}

async function main() {
  ensureRuntimeDirs();

  if (!fs.existsSync(appConfig.chromeExecutable)) {
    throw new Error(`未找到 Chrome 可执行文件：${appConfig.chromeExecutable}`);
  }

  const args = [
    `--remote-debugging-port=${new URL(appConfig.chromeCdpUrl).port || "9222"}`,
    `--user-data-dir=${path.resolve(appConfig.userDataDir)}`,
    "--profile-directory=Default",
    appConfig.wenshuBaseUrl
  ];

  spawn(appConfig.chromeExecutable, args, {
    detached: true,
    stdio: "ignore"
  }).unref();

  console.log(
    [
      "已启动 LawHelper 专用 Chrome。",
      `Chrome：${quoteIfNeeded(appConfig.chromeExecutable)}`,
      `调试地址：${appConfig.chromeCdpUrl}`,
      `用户目录：${path.resolve(appConfig.userDataDir)}`,
      "请在这个窗口中登录中国裁判文书网，后续脚本会附加到该浏览器。"
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
