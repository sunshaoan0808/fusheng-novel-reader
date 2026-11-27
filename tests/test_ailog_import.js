/* 飞轮补全验收（2026-11-27）：导入诊断包 / 台账证据链接 / 待诊断提醒 / 管线包兼容。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const rd = p => fs.readFileSync(WWW + p, "utf8");

const store = {};
const ctx = { console, Date, JSON, Math, Promise, Set, Array, Object, String, Number,
  localStorage: { getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  window: {} };
vm.createContext(ctx);
vm.runInContext(rd("/rp/ailog.js"), ctx);
const A = ctx.RP_AILOG, hook = ctx.window.__aiLogHook;

async function main(){
  /* 导入管线包（tag=pipeline 的记录、空台账） */
  const pack = { app: "fusheng", kind: "ai-diag-log", build: "pipeline",
    records: [
      { ts: 1000, ms: 5, model: "m1", tag: "pipeline", messages: [{role: "user", content: "管线提示词"}], thinking: "管线思考", reply: "管线答复", finish: "stop", params: {t: 0.7, max: 100} },
      { ts: 1001, ms: 5, model: "m1", tag: "pipeline", messages: [{role: "user", content: "第二条"}], reply: "", error: "网关请求失败: x" }
    ],
    analyses: [{ ts: 2000, scope: "最近 2 条", text: "管线分析结论" }],
    issues: [{ ts: 1500, title: "管线问题", evidence: "证据", severity: "high", status: "fixed", srcIds: [] }] };
  const r = A.importObj(pack);
  t("导入计数", r.records === 2 && r.issues === 1 && r.analyses === 1);
  const sums = A.summaries();
  t("管线记录入环（最新在前）", sums.length === 2 && sums[0].tag === "pipeline" && sums[0].promptChars === 3);
  const got = A.get(sums[1].id);
  t("导入记录字段完整", got.thinking === "管线思考" && got.finish === "stop" && got.params.max === 100);
  const iss = A.loadIssues();
  t("台账导入保留状态", iss.length === 1 && iss[0].status === "fixed" && iss[0].severity === "high");
  t("分析导入留存", A.loadAnalyses().length === 1 && A.loadAnalyses()[0].text.includes("管线分析"));

  let threw = false;
  try{ A.importObj({kind: "other"}); }catch(e){ threw = true; }
  t("非诊断包拒绝", threw);

  /* 待诊断提醒：分析 ts=2000 之后的新记录才算 unseen */
  let hint = A.diagHint();
  t("提醒：无新增时 unseen=0", hint.unseen === 0 && hint.open === 1 && hint.openHigh === 0);
  hook({ ts: 3000, ms: 1, model: "m", messages: [], reply: "新" });
  A.addIssues([{title: "高危问题", evidence: "", severity: "high"}], 3001);
  hint = A.diagHint();
  t("提醒：新增与高危计数", hint.unseen === 1 && hint.openHigh === 1 && hint.open === 2);

  /* 证据链接：分析落的台账带本批记录 id */
  A.clear();
  hook({ ts: 5000, ms: 1, model: "m", messages: [{role: "user", content: "q"}], reply: "r" });
  const recId = A.summaries()[0].id;
  await A.analyze(() => Promise.resolve("结论\n```json\n[{\"title\":\"问题X\",\"evidence\":\"e\",\"severity\":\"mid\"}]\n```"), {}, 10);
  const iss2 = A.loadIssues().slice(-1)[0];
  t("台账带来源记录 id", !!iss2 && Array.isArray(iss2.srcIds) && iss2.srcIds.includes(recId));
  t("来源记录可取回", !!A.get(iss2.srcIds[0]));

  /* UI 接线（静态） */
  const app = rd("/js/app_ailog.js");
  t("导入按钮与处理器在", app.includes("aiLogImportFile") && app.includes("ailog_file") && app.includes("导入诊断包"));
  t("来源记录按钮在", app.includes("aiLogIssueSrc") && app.includes("来源记录"));
  t("日志页待诊断提醒在", app.includes("diagHint") && app.includes("还没诊断"));
  const appjs = rd("/app.js");
  t("设置页提醒在", appjs.includes("aiLogHintTxt") && appjs.includes("未诊断"));

  console.log("ailog_import: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log("FAIL: 异常", e); process.exit(1); });
