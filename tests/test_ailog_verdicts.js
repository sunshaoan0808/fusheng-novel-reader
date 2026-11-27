/* 台账自动闭环验收（2026-11-27 用户拍板改契约）：verdicts 结构化复查块
 * → analyze 自动推进状态（gone→verified、still 只记结论）。 */
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
  hook({ ts: 1, ms: 1, model: "m", messages: [{role: "user", content: "q"}], reply: "r" });
  A.addIssues([
    { title: "问题甲", evidence: "e1", severity: "high" },
    { title: "问题乙", evidence: "e2", severity: "mid" },
    { title: "问题丙", evidence: "e3", severity: "low" }
  ], 100);
  const ids0 = A.loadIssues().map(x => x.id);
  A.setIssueStatus(ids0[2], "fixed");

  let captured = null;
  const diagText = "复查结论正文。\n```verdicts\n[{\"n\":1,\"verdict\":\"gone\"},{\"n\":2,\"verdict\":\"still\"},{\"n\":3,\"verdict\":\"gone\"},{\"n\":99,\"verdict\":\"gone\"}]\n```";
  await A.analyze((c, msgs) => { captured = msgs; return Promise.resolve(diagText); }, {}, 10);
  t("材料带编号台账", captured[1].content.includes("未闭环问题台账") && captured[1].content.includes("1. [open] 问题甲") && captured[1].content.includes("3. [fixed] 问题丙"));
  t("诊断契约要求 verdicts 块", captured[0].content.includes("verdicts") && captured[0].content.includes("gone"));
  const after = A.loadIssues();
  t("gone 的 open 条目自动闭环", after[0].status === "verified" && after[0].lastVerdict === "gone" && !!after[0].lastVerdictTs);
  t("still 只记结论不动状态", after[1].status === "open" && after[1].lastVerdict === "still");
  t("gone 的 fixed 条目推进到 verified", after[2].status === "verified");
  const lr = A.getLastReview();
  t("复查统计正确（越界序号忽略）", lr && lr.closed === 2 && lr.still === 1);
  t("已闭环不再进未闭环清单", A.openIssues().length === 1 && A.openIssues()[0].title === "问题乙");

  /* 无 verdicts 块：状态不动（向后兼容） */
  await A.analyze(() => Promise.resolve("普通结论，没有结构化复查块"), {}, 10);
  t("无 verdicts 时状态不变", A.loadIssues()[1].status === "open" && A.getLastReview().closed === 0);
  /* 坏 JSON：不崩不误伤 */
  await A.analyze(() => Promise.resolve("```verdicts\n[{坏的]\n```"), {}, 10);
  t("坏 verdicts JSON 安全忽略", A.loadIssues()[1].status === "open");

  /* verdicts 写进 json 围栏也要认（第四轮实锤：模型跟问题清单学样） */
  const vj = A.parseVerdicts("正文\n```json\n[{\"title\":\"问题清单\",\"evidence\":\"e\",\"severity\":\"high\"}]\n```\n### verdicts\n```json\n[{\"n\":1,\"verdict\":\"gone\"},{\"n\":2,\"verdict\":\"still\"}]\n```");
  t("json 围栏里的 verdicts 被认出", vj.length === 2 && vj[0].verdict === "gone");
  t("问题清单不被误认成 verdicts", A.parseVerdicts("```json\n[{\"title\":\"x\",\"evidence\":\"e\",\"severity\":\"high\"}]\n```").length === 0);

  /* UI 接线（静态） */
  const app = rd("/js/app_ailog.js");
  t("台账卡显示复查结论", app.includes("lastVerdict") && app.includes("上次复查"));
  t("分析完成提示自动闭环数", app.includes("getLastReview") && app.includes("台账自动闭环"));

  console.log("ailog_verdicts: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log("FAIL: 异常", e); process.exit(1); });
