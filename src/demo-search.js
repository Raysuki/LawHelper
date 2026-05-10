#!/usr/bin/env node
import { ensureRuntimeDirs, appConfig, loadSelectorConfig } from "./config.js";
import { mapNaturalLanguageToParams } from "./nlu.js";
import { runWenshuSearch } from "./wenshu-client.js";

async function main() {
  const rawQuery = process.argv.slice(2).join(" ").trim() || "检索公司法中股东违反出资义务的文书";
  ensureRuntimeDirs();
  const selectors = loadSelectorConfig();
  const intent = await mapNaturalLanguageToParams(rawQuery, appConfig);
  const output = await runWenshuSearch(intent, { ...appConfig, headless: false }, selectors);

  console.log(`状态：${output.status}`);
  console.log(`结果页：${output.resultUrl || "未获取"}`);
  if (output.nextAction) {
    console.log(`提示：${output.nextAction}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
