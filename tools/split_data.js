/* 把 www/data.js 的首屏大 JSON 按 run 拆成 data/run_<id>.js，并把 foreshadowing
 * 二级拆到 data/run_<id>_foreshadowing.js（2026-10-18）。
 *
 * 背景：data.js 曾把 3 个 run 的 profiles/worldbook/foreshadowing/rp_cards
 * 全量塞进首屏（2.9MB），而书架只需要 index。拆包后首屏只留 index，
 * run 数据由 rp/lazy.js 的 RP_LAZY.ensureRun(runId) 按需加载；
 * foreshadowing 全仓只有 showMore()（更多 tab）一个消费点，再拆一级，
 * 进书/进聊天不用为它付流量，点「更多」时 RP_LAZY.ensureRunFs 补拉。
 *
 * 用法：node tools/split_data.js          （在仓库根运行）
 * 行为：
 *   1) 大会版 data.js（含 runs）→ 直接拆；
 *   2) 已是瘦身版（runs 为空）→ 从现有 data/run_*.js 重组后再拆（可重入）。
 * 输出：data/run_<id>.js（无 foreshadowing）+ data/run_<id>_foreshadowing.js（仅 foreshadowing）
 *       + 瘦身重写 www/data.js。幂等；拼回后与源数据逐字段等价。
 * 注意：外部 snapshot.py 若重新生成大会版 data.js，需再跑一次本脚本。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const WWW = path.join(ROOT, "www");
const DATA_JS = path.join(WWW, "data.js");
const DATA_DIR = path.join(WWW, "data");

/* 二级拆字段：消费点唯一（showMore）且体量大，单独按需加载 */
const SPLIT_FIELDS = ["foreshadowing"];

function vmLoad(files) {
  const sb = { console };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of files) vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: path.basename(f) });
  return sb;
}

/* 组装完整 __DATA__：大会版直接用；瘦身版则拼 data.js + run 文件 + _fs 文件 */
const sb = vmLoad([DATA_JS]);
let D = sb.__DATA__;
if (!D || !Array.isArray(D.index) || !D.runs) {
  console.error("data.js 结构不符合预期（缺 index/runs），终止");
  process.exit(1);
}
let reassembled = false;
if (Object.keys(D.runs).length === 0) {
  const parts = [DATA_JS];
  for (const f of fs.readdirSync(DATA_DIR).sort()) {
    if (/^run_.*\.js$/.test(f)) parts.push(path.join(DATA_DIR, f));
  }
  const sb2 = vmLoad(parts);
  if (sb2.__DATA__ && Object.keys(sb2.__DATA__.runs || {}).length) {
    D = sb2.__DATA__;
    reassembled = true;
  } else {
    console.error("data.js 是瘦身版但 data/run_*.js 重组不出 runs，终止");
    process.exit(1);
  }
}

const today = new Date().toISOString().slice(0, 10);
const runIds = Object.keys(D.runs);
let written = 0;

for (const id of runIds) {
  const run = D.runs[id];
  const cards = (D.rp_cards || {})[id] || [];
  const novel = run.novel || id;
  const runOut = Object.assign({}, run);
  for (const f of SPLIT_FIELDS) delete runOut[f];
  const body =
`/* 《${novel}》蒸馏数据 · ${today} 从 data.js 拆出（tools/split_data.js）。
 * 由 RP_LAZY.ensureRun("${id}") 按需加载；伏笔字段在同目录 run_${id}_foreshadowing.js。
 * data.js 重新生成不会覆盖本文件。 */
window.__DATA__.runs[${JSON.stringify(id)}]=${JSON.stringify(runOut)};
window.__DATA__.rp_cards[${JSON.stringify(id)}]=${JSON.stringify(cards)};
`;
  fs.writeFileSync(path.join(DATA_DIR, "run_" + id + ".js"), body, "utf8");
  console.log("write", "data/run_" + id + ".js", (body.length / 1024).toFixed(1) + "KB");

  for (const f of SPLIT_FIELDS) {
    if (!(f in run)) continue;
    const fsBody =
`/* 《${novel}》${f} · ${today} 从 data.js 二级拆出（tools/split_data.js）。
 * 由 RP_LAZY.ensureRunFs("${id}") 按需加载（showMore 更多 tab 渲染前）。 */
window.__DATA__.runs[${JSON.stringify(id)}].${f}=${JSON.stringify(run[f])};
`;
    fs.writeFileSync(path.join(DATA_DIR, "run_" + id + "_" + f + ".js"), fsBody, "utf8");
    console.log("write", "data/run_" + id + "_" + f + ".js", (fsBody.length / 1024).toFixed(1) + "KB");
    written++;
  }
}

/* 瘦身 data.js：只留 index；runs/rp_cards 留空壳防止无兜底调用炸 TypeError */
const slim =
`/* 首屏索引（${today} 拆包）：runs/rp_cards 已移至 data/run_<id>.js 按需加载，
 * 入口 RP_LAZY.ensureRun(runId)（rp/lazy.js）；foreshadowing 二级拆至 run_<id>_foreshadowing.js
 * （RP_LAZY.ensureRunFs）。本文件由 tools/split_data.js 生成，
 * 外部 snapshot.py 若重新生成大会版，请再跑 node tools/split_data.js。 */
window.__DATA__={"index":${JSON.stringify(D.index)},"runs":{},"rp_cards":{}};
`;
fs.writeFileSync(DATA_JS, slim, "utf8");
console.log("slim data.js", (slim.length / 1024).toFixed(1) + "KB,", runIds.length, "runs",
  reassembled ? "(reassembled from run files)" : "");
