/* 飞轮第三档验收（2026-11-27）：⑦问题台账 ⑧参数入账 ⑨续写成条/流式中断半截 ⑩导出提醒。 */
const fs = require("fs"), vm = require("vm");
const { TextDecoder, TextEncoder } = require("util");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const rd = p => fs.readFileSync(WWW + p, "utf8");

function mkAilog(){
  const store = {};
  const ctx = { console, Date, JSON, Math, Promise, Set, Array, Object, String, Number,
    localStorage: { getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    window: {} };
  vm.createContext(ctx);
  vm.runInContext(rd("/rp/ailog.js"), ctx);
  return ctx;
}

async function main(){
  const c = mkAilog();
  const A = c.RP_AILOG, hook = c.window.__aiLogHook;

  /* ⑧ 参数 + 中断标记落盘 */
  hook({ ts: 1, ms: 1, model: "m", params: {t: 0.7, max: 2000}, partial: true, messages: [], reply: "半截" });
  const e0 = A.get(A.summaries()[0].id);
  t("⑧ 参数入账", e0.params && e0.params.t === 0.7 && e0.params.max === 2000);
  t("⑨ 中断标记入账", e0.partial === true);

  /* ⑦ 台账：分析结论的 JSON 块自动落条目 */
  hook({ ts: 2, ms: 1, model: "m", messages: [{role: "user", content: "q"}], reply: "r" });
  const analysisText = "总评：有问题。\n```json\n[{\"title\":\"代写主角\",\"evidence\":\"他伸手拿起杯子\",\"severity\":\"high\"},{\"title\":\"提示词重复段\",\"evidence\":\"…\",\"severity\":\"low\"}]\n```";
  await A.analyze(() => Promise.resolve(analysisText), {}, 10);
  let issues = A.loadIssues();
  t("⑦ 分析后自动落台账 2 条", issues.length === 2 && issues[0].title === "代写主角" && issues[0].severity === "high" && issues[0].status === "open");
  A.setIssueStatus(issues[0].id, "fixed");
  t("⑦ 状态可推进", A.loadIssues()[0].status === "fixed");
  /* 未闭环带入下一次分析复查 */
  let captured = null;
  await A.analyze((cfg, msgs) => { captured = msgs; return Promise.resolve("复查：仍存在。"); }, {}, 10);
  t("⑦ 未闭环问题带入复查", captured[1].content.includes("未闭环问题台账") && captured[1].content.includes("代写主角"));
  t("⑦ 无 JSON 块时不乱落条目", A.loadIssues().length === 2);
  A.setIssueStatus(issues[0].id, "verified");
  t("⑦ 已验证不再算未闭环", A.openIssues().length === 1);
  A.delIssue(issues[1].id);
  t("⑦ 条目可删", A.loadIssues().length === 1);
  t("⑦ 导出包含台账", A.exportObj().issues.length === 1);

  /* ⑨ 流式中断：抽真 RP_NET，reader 中途抛错，半截答复要落盘 */
  const src = rd("/rp/chat.js");
  const i0 = src.indexOf("const RP_NET"), i1 = src.indexOf("\n})();", i0);
  const iife = src.slice(i0, i1 + 5) + "\nwindow.RP_NET = RP_NET;";
  const records = [];
  const enc = new TextEncoder();
  let reads = 0;
  const ctx2 = { console, Date, JSON, Math, Promise, Set, Array, Object, String, Number, Error,
    setTimeout, clearTimeout, TextDecoder,
    window: { __aiLogHook: r => records.push(r) },
    fetch: async () => ({ ok: true, body: { getReader: () => ({ read: async () => {
      reads++;
      if(reads === 1) return { done: false, value: enc.encode("data: {\"choices\":[{\"delta\":{\"content\":\"半截答复\"}}]}\n\n") };
      throw new Error("连接中断");
    } }) } }) };
  vm.createContext(ctx2);
  vm.runInContext(iife, ctx2);
  let threw = false;
  try{ await ctx2.window.RP_NET.stream({base: "https://x/v1", key: "k", model: "m"}, [{role: "user", content: "q"}], {temperature: 0.8, maxTokens: 2000}, () => {}); }
  catch(e){ threw = true; }
  const sr = records[0];
  t("⑨ 流式中断仍上抛", threw);
  t("⑨ 半截答复落盘且带中断标记", !!sr && sr.reply === "半截答复" && sr.partial === true && /连接中断/.test(sr.error || ""));
  t("⑧ 流式参数入账", !!sr && sr.params && sr.params.t === 0.8 && sr.params.max === 2000);
  t("⑨ 续写单独成条（静态接线）", src.includes("tag: \"continue\"") && src.includes("sink.partial = full"));

  /* ⑩ 导出提醒（静态） */
  const app = rd("/js/app_ailog.js");
  t("⑩ 导出前有脱敏提醒确认", app.includes("等于完整聊天记录") && app.includes("aiLogExport"));
  t("台账 UI 接线在", app.includes("aiLogIssueNext") && app.includes("问题台账"));

  console.log("ailog_ledger: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log("FAIL: 异常", e); process.exit(1); });
