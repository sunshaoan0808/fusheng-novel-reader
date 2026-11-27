/* 非流式默认超时验收（2026-11-27 第四轮模拟实锤）：网关连接僵死时
 * complete 曾无限挂起。现无外部信号时挂 300s 默认截止（cfg.timeoutMs
 * 可调），到点改报「接口超时」且诊断日志留痕；外部信号行为不变。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const rd = p => fs.readFileSync(WWW + p, "utf8");
const store = {};
const ctx = { console, setTimeout, clearTimeout, Promise, JSON, Math, Date, URL, TextDecoder, TextEncoder,
  AbortController, fetch: null,
  localStorage: { getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  window: {} };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(rd("/rp/ailog.js"), ctx);
vm.runInContext(rd("/rp/chat.js"), ctx);
const A = ctx.RP_AILOG, NET = vm.runInContext("RP_NET", ctx);
const CFG = { base: "https://gw.example/v1", key: "k", model: "m" };

(async () => {
  /* 僵死连接：fetch 只在被 abort 时才 reject（模拟真实 fetch） */
  ctx.fetch = (url, opts) => new Promise((resolve, reject) => {
    if(opts && opts.signal) opts.signal.addEventListener("abort",
      () => { const e = new Error("The operation was aborted"); e.name = "AbortError"; reject(e); });
  });
  const t0 = Date.now();
  let err = null;
  try { await NET.complete(Object.assign({}, CFG, { timeoutMs: 60 }), [{ role: "user", content: "q" }], 0.8); }
  catch (e) { err = e; }
  t("僵死连接被默认超时打断", !!err && Date.now() - t0 < 5000);
  t("报错是接口超时而非裸 AbortError", !!err && /接口超时/.test(err.message));
  const recs = A.exportObj().records;
  t("超时进诊断日志留痕", recs.length === 1 && /接口超时/.test(recs[0].error || ""));

  /* 外部信号取消：不被改写成超时 */
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 30);
  err = null;
  try { await NET.complete(CFG, [{ role: "user", content: "q" }], 0.8, null, { signal: ac.signal }); }
  catch (e) { err = e; }
  t("外部信号取消保持原样", !!err && !/接口超时/.test(err.message));

  /* 正常路径不受影响 */
  ctx.fetch = () => Promise.resolve({ ok: true, status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content: "正常回复" }, finish_reason: "stop" }] }) });
  const out = await NET.complete(Object.assign({}, CFG, { timeoutMs: 60000 }), [{ role: "user", content: "q" }], 0.8);
  t("正常回复照常返回", out === "正常回复");
  console.log("net_timeout: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL: 异常", e); process.exit(1); });
