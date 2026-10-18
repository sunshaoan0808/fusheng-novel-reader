/* 把 www/data.js 的首屏大 JSON 按 run 拆成 data/run_<id>.js（2026-10-18）。
 *
 * 背景：data.js 曾把 3 个 run 的 profiles/worldbook/foreshadowing/rp_cards
 * 全量塞进首屏（2.9MB），而书架只需要 index。拆包后首屏只留 index，
 * run 数据由 rp/lazy.js 的 RP_LAZY.ensureRun(runId) 按需加载。
 *
 * 用法：node tools/split_data.js          （在仓库根运行）
 * 行为：读 www/data.js → 写 www/data/run_<id>.js × N → 瘦身重写 www/data.js。
 *       重复运行幂等；run 文件内容与源数据逐字段等价（拼回后可深度比对）。
 * 注意：外部 snapshot.py 若重新生成大会版 data.js，需再跑一次本脚本。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const WWW = path.join(ROOT, "www");
const DATA_JS = path.join(WWW, "data.js");
const DATA_DIR = path.join(WWW, "data");

/* 在 vm 里执行 data.js，拿 __DATA__（与 tests 的沙盒思路一致，避免 eval 全局污染） */
const vm = require("vm");
const sb = { console };
sb.window = sb;
vm.runInContext(fs.readFileSync(DATA_JS, "utf8"), vm.createContext(sb), { filename: "data.js" });
const D = sb.__DATA__;
if (!D || !Array.isArray(D.index) || !D.runs) {
  console.error("data.js 结构不符合预期（缺 index/runs），终止");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const runIds = Object.keys(D.runs);
let written = 0;

for (const id of runIds) {
  const run = D.runs[id];
  const cards = (D.rp_cards || {})[id] || [];
  const novel = run.novel || id;
  const body =
`/* 《${novel}》蒸馏数据 · ${today} 从 data.js 拆出（tools/split_data.js）。
 * 由 RP_LAZY.ensureRun("${id}") 按需加载；data.js 重新生成不会覆盖本文件。 */
window.__DATA__.runs[${JSON.stringify(id)}]=${JSON.stringify(run)};
window.__DATA__.rp_cards[${JSON.stringify(id)}]=${JSON.stringify(cards)};
`;
  const out = path.join(DATA_DIR, "run_" + id + ".js");
  fs.writeFileSync(out, body, "utf8");
  console.log("write", path.relative(ROOT, out), (body.length / 1024).toFixed(1) + "KB");
  written++;
}

/* 瘦身 data.js：只留 index；runs/rp_cards 留空壳防止无兜底调用炸 TypeError */
const slim =
`/* 首屏索引（${today} 拆包）：runs/rp_cards 已移至 data/run_<id>.js 按需加载，
 * 入口 RP_LAZY.ensureRun(runId)（rp/lazy.js）。本文件由 tools/split_data.js 生成，
 * 外部 snapshot.py 若重新生成大会版，请再跑 node tools/split_data.js。 */
window.__DATA__={"index":${JSON.stringify(D.index)},"runs":{},"rp_cards":{}};
`;
fs.writeFileSync(DATA_JS, slim, "utf8");
console.log("slim data.js", (slim.length / 1024).toFixed(1) + "KB,", written, "run files");
