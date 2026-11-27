/* AI 诊断日志·蒸馏线验收（2026-11-27）：DISTILL_LLM 挂钩落记录
 * （成功带思考 / 失败带错误）+ 交叉审核模型存取与接线断言。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const rd = p => fs.readFileSync(WWW + p, "utf8");

async function main(){
  /* --- 蒸馏线落记录 --- */
  const store = { nd_distill_llm: JSON.stringify({baseUrl: "https://x/v1", key: "k", model: "dm1"}) };
  const records = [];
  let failMode = false;
  const ctx = { console, Date, JSON, Math, Promise, Set, Array, Object, String, Number, parseInt,
    setTimeout, clearTimeout, AbortController,
    localStorage: { getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    window: { __aiLogHook: (r)=>records.push(r) },
    fetch: async () => failMode
      ? { ok: false, status: 401, json: async()=>({}) }
      : { ok: true, status: 200, json: async()=>({ choices: [{ message: { content: "蒸馏答复", reasoning_content: "蒸馏思考" }, finish_reason: "stop" }] }) } };
  vm.createContext(ctx);
  vm.runInContext(rd("/rp/distill_llm.js"), ctx);
  t("DISTILL_LLM 已加载", !!ctx.DISTILL_LLM);
  const out = await ctx.DISTILL_LLM.chat([{role: "user", content: "正文一章"}]);
  t("蒸馏调用返回内容", out.content === "蒸馏答复" && out.model === "dm1");
  t("成功记录落盘（tag/思考/答复/模型）", records.length === 1 && records[0].tag === "distill"
    && records[0].thinking === "蒸馏思考" && records[0].reply === "蒸馏答复" && records[0].model === "dm1"
    && records[0].messages[0].content === "正文一章");
  t("finish_reason 入账", records[0].finish === "stop");
  failMode = true;
  let threw = false;
  try{ await ctx.DISTILL_LLM.chat([{role: "user", content: "x"}]); }catch(e){ threw = true; }
  t("失败仍上抛且落错误记录", threw && records.length === 2 && /401/.test(records[1].error || ""));

  /* --- 交叉审核模型存取 --- */
  const store2 = {};
  const ctx2 = { console, Date, JSON, Math, Promise, Set, Array, Object, String, Number,
    localStorage: { getItem: k => (k in store2 ? store2[k] : null),
      setItem: (k, v) => { store2[k] = String(v); }, removeItem: k => { delete store2[k]; } },
    window: {} };
  vm.createContext(ctx2);
  vm.runInContext(rd("/rp/ailog.js"), ctx2);
  const A = ctx2.RP_AILOG;
  t("审核模型默认空（跟随聊天模型）", A.getDiagModel() === "");
  A.setDiagModel("rev-model-x");
  t("审核模型可单独设置", A.getDiagModel() === "rev-model-x");
  A.setDiagModel("");
  t("审核模型可清空", A.getDiagModel() === "");

  /* --- 接线断言 --- */
  const app = rd("/js/app_ailog.js");
  t("分析走审核模型覆盖", app.includes("getDiagModel") && app.includes("Object.assign({}, cfg, {model: dm})") && app.includes("aiLogSetModel"));
  const dl = rd("/rp/distill_llm.js");
  t("蒸馏钩静态接线在", dl.includes("chatInner") && dl.includes("__dEmit") && dl.includes("reasoning_content"));

  console.log("ailog_distill: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log("FAIL: 异常", e); process.exit(1); });
