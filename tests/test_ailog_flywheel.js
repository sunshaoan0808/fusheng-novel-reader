/* 飞轮审计修复验收（2026-11-27）：六条修复逐项验——
 * ①思考串话（真并发回归）②首尾双截 ③finish 入账 ④分环配额 ⑤版本戳字段 ⑥勾选分析。 */
const fs = require("fs"), vm = require("vm");
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
  /* ① 并发串话回归：抽 RP_NET 真代码，两个 complete 并发、乱序返回 */
  const src = rd("/rp/chat.js");
  const i0 = src.indexOf("const RP_NET");
  const i1 = src.indexOf("\n})();", i0);
  t("RP_NET 可抽取", i0 >= 0 && i1 > i0);
  const iife = src.slice(i0, i1 + 5) + "\nwindow.RP_NET = RP_NET;";
  const pending = [];
  const records = [];
  const ctx = { console, Date, JSON, Math, Promise, Set, Array, Object, String, Number, Error,
    setTimeout, clearTimeout, TextDecoder: class { decode(){ return ""; } },
    window: { __aiLogHook: r => records.push(r) },
    fetch: () => new Promise(res => pending.push(res)) };
  vm.createContext(ctx);
  vm.runInContext(iife, ctx);
  const NET = ctx.window.RP_NET;
  const cfg = { base: "https://x/v1", key: "k", model: "m" };
  const resp = (content, reason, finish) => ({ ok: true, json: async () => ({ choices: [{ message: { content, reasoning_content: reason }, finish_reason: finish }] }) });
  const pA = NET.complete(cfg, [{role: "user", content: "问A"}], 0.7);
  const pB = NET.complete(cfg, [{role: "user", content: "问B"}], 0.7);
  t("两个请求都已发出", pending.length === 2);
  pending[1](resp("答复B。", "思考B", "length"));      /* B 先回，且被截断→触发续写 */
  await new Promise(r => setTimeout(r, 10));
  pending[0](resp("答复A。", "思考A", "stop"));        /* A 后回 */
  await pA;
  t("续写请求已发出", pending.length === 3);
  pending[2](resp("续完。", "", "stop"));
  await pB;
  const rA = records.find(r => r.reply.includes("答复A"));
  const rB = records.find(r => r.reply.includes("答复B"));
  t("两条记录都在", !!rA && !!rB);
  t("思考不串话：A 的归 A", rA && rA.thinking === "思考A");
  t("思考不串话：B 的归 B", rB && rB.thinking === "思考B");
  t("③ finish 入账：A=stop", rA && rA.finish === "stop");
  t("③ finish 入账：B=length", rB && rB.finish === "length");

  /* ④ 分环配额 + ⑤ 字段 + ② 双截 + ⑥ 勾选（ailog 层） */
  const c2 = mkAilog();
  const A = c2.RP_AILOG, hook = c2.window.__aiLogHook;
  for(let i = 0; i < 30; i++) hook({ ts: i, ms: 1, model: "m", messages: [{role: "user", content: "c" + i}], reply: "r" });
  for(let i = 0; i < 20; i++) hook({ ts: 100 + i, ms: 1, model: "m", tag: "distill", messages: [{role: "user", content: "d" + i}], reply: "r" });
  let st = A.stats();
  t("④ 蒸馏灌入后聊天环仍满 30", st.chatN === 30);
  t("④ 蒸馏环封顶 15", st.distillN === 15);
  for(let i = 0; i < 10; i++) hook({ ts: 200 + i, ms: 1, model: "m", tag: "distill", messages: [{role: "user", content: "d2_" + i}], reply: "r" });
  st = A.stats();
  t("④ 再灌蒸馏也冲不走聊天", st.chatN === 30 && st.distillN === 15);

  hook({ ts: 999, ms: 1, model: "m", finish: "length", messages: [{role: "user", content: "q"}], reply: "r" });
  const s0 = A.summaries()[0];
  t("③ 摘要带 finish", s0.finish === "length");
  t("⑤ 记录带版本戳字段", "bv" in A.get(s0.id));

  A.clear();
  const HEAD = "头部铁律HEAD", TAIL = "压尾铁律TAIL";
  hook({ ts: 1, ms: 1, model: "m", messages: [{role: "system", content: HEAD + "x".repeat(9000) + TAIL}],
    thinking: "思", reply: "正文" + "y".repeat(4000) + "协议尾巴TAIL2" });
  hook({ ts: 2, ms: 1, model: "m", messages: [{role: "user", content: "别的"}], reply: "别的答复MARK2" });
  let captured = null;
  await A.analyze((c, msgs) => { captured = msgs; return Promise.resolve("结论"); }, {}, 10);
  const mat = captured[1].content;
  t("② 提示词头部保留", mat.includes(HEAD));
  t("② 提示词尾巴（压尾铁律）保留", mat.includes(TAIL) && mat.includes("中段省略"));
  t("② 答复尾巴（协议段）保留", mat.includes("协议尾巴TAIL2"));

  const target = A.summaries().find(s => s.ts === 2);
  captured = null;
  await A.analyze((c, msgs) => { captured = msgs; return Promise.resolve("结论2"); }, {}, 10, [target.id]);
  t("⑥ 勾选分析只含被勾选条", captured[1].content.includes("MARK2") && !captured[1].content.includes("协议尾巴TAIL2"));
  t("⑥ 分析范围标注勾选", A.loadAnalyses().slice(-1)[0].scope.includes("勾选"));

  console.log("ailog_flywheel: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log("FAIL: 异常", e); process.exit(1); });
