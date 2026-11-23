/* 回归 (2026-11-22): 网关兜底 —— 空回复/错误提示不进模型上下文 + 报错自动重试一次。
 * 实测背景: 免费网关抖动时, 流式返回空内容被存成「(空回复)」当正文,
 * 429/503 的「⚠️ 出错了」也被当 assistant 发言喂回模型, 后续轮次越聊越歪;
 * 且一次瞬时故障就废一轮。本测试用脚本化假 fetch 钉住三件事:
 * (1) mapHistory 过滤 ghost/⚠️/(空回复); (2) 首试 429、重试成功 → 正常回复入档;
 * (3) 两次空回复 → 只留 ghost 提示, 上下文里没有假回复。 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

function sseResp(text){
  const enc = new TextEncoder();
  const payload = 'data: ' + JSON.stringify({choices:[{delta:{content:text},finish_reason:null}]}) + '\n\n'
    + 'data: ' + JSON.stringify({choices:[{delta:{},finish_reason:"stop"}]}) + '\n\n'
    + 'data: [DONE]\n\n';
  let sent = false;
  return { ok: true, status: 200, body: { getReader: () => ({ read: async () => {
    if (sent) return { done: true };
    sent = true;
    return { done: false, value: enc.encode(payload) };
  } }) } };
}
function emptyResp(){
  const enc = new TextEncoder();
  const payload = 'data: ' + JSON.stringify({choices:[{delta:{},finish_reason:"stop"}]}) + '\n\n'
    + 'data: [DONE]\n\n';
  let sent = false;
  return { ok: true, status: 200, body: { getReader: () => ({ read: async () => {
    if (sent) return { done: true };
    sent = true;
    return { done: false, value: enc.encode(payload) };
  } }) } };
}

function makeSandbox(script){
  const store = new Map();
  const sb = { console, JSON, Math, Date, Object, Array, String, Number, RegExp, Promise,
    parseInt, parseFloat, isFinite, isNaN, setTimeout, clearTimeout, setInterval, clearInterval,
    TextDecoder, TextEncoder, AbortController, URL, Map, Set, WeakMap, Symbol, Error, TypeError,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { userAgent: "test" }, location: { href: "http://localhost/" },
    fetch: async (url, opt) => {
      const b = opt && opt.body ? JSON.parse(opt.body) : {};
      if (b.stream) { const fn = script.shift(); return fn(); }
      /* 非流式(记忆/裁决等旁路): 给个无害短答 */
      return { ok: true, status: 200, json: async () => (
        { choices: [{ message: { content: "好的" }, finish_reason: "stop" }] }) };
    },
  };
  vm.createContext(sb); sb.window = sb; sb.globalThis = sb; sb.self = sb;
  const files = ["rp/escutil.js", "data.js", "data/run_qinganlu.js",
    "rp/lorebook.js", "rp/prompt.js", "rp/preset.js", "rp/persona.js",
    "rp/warn.js", "rp/memory.js", "rp/apex.js", "rp/tasks.js", "rp/ooc.js", "rp/chat.js"];
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(WWW, f), "utf8"), sb, { filename: f });
  vm.runInContext("globalThis.RP = RP;", sb);
  return sb;
}

const CFG = { base: "http://x/v1", key: "k", model: "m", maxContext: 8192, summaryModel: "" };
function sendOpts(history){
  return { cfg: CFG, history, temperature: 0.9, maxTokens: 2000,
    budget: { maxContext: 8192, response: 2000, preset: "classic" }, onToken: () => {} };
}

(async () => {
  /* (1) mapHistory 过滤 */
  {
    const sb = makeSandbox([]);
    const h = [
      { role: "user", content: "你好" },
      { role: "assistant", content: "(空回复)" },
      { role: "assistant", content: "⚠️ 出错了：接口返回 429\n请检查设置" },
      { role: "assistant", content: "⚠️ 接口返回了空回复（已自动重试一次）。", ghost: true },
      { role: "assistant", content: "正经回复" },
    ];
    const m = sb.mapHistory(h);
    t("mapHistory 只剩 2 条", m.length === 2);
    t("mapHistory 保留正经回复", m.some(x => x.content === "正经回复"));
    t("mapHistory 滤掉空回复占位", !m.some(x => x.content === "(空回复)"));
  }
  /* (2) 429 后重试成功 */
  {
    const sb = makeSandbox([
      () => ({ ok: false, status: 429 }),
      () => sseResp("重试后的正经回复"),
    ]);
    const r = await sb.RP.send("qinganlu", "凌安", "你好", sendOpts([]));
    const last = r.history[r.history.length - 1];
    t("重试成功拿到回复", last.role === "assistant" && last.content.indexOf("重试后的正经回复") >= 0);
    t("历史上没有 ⚠️", !r.history.some(x => String(x.content).indexOf("⚠️") === 0));
  }
  /* (3) 两次空回复 → ghost 提示, 不入上下文 */
  {
    const sb = makeSandbox([() => emptyResp(), () => emptyResp()]);
    const r = await sb.RP.send("qinganlu", "凌安", "你好", sendOpts([]));
    const last = r.history[r.history.length - 1];
    t("空回复留 ghost 提示", last.ghost === true && String(last.content).indexOf("空回复") >= 0);
    const ctx = sb.mapHistory(r.history);
    t("上下文无假 assistant 发言", !ctx.some(x => x.role === "assistant"));
    t("用户消息仍在上下文", ctx.some(x => x.role === "user"));
  }
  /* (4) 2026-11-23: 存量设置迁移 —— 旧默认 respTokens 512 → 2000, 只动恰好 512 的 */
  {
    const coreSrc = fs.readFileSync(path.join(WWW, "js/app_chat_core.js"), "utf8");
    const loadCore = (store) => {
      const ls = { getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
      const ctx = { localStorage: ls, console, setTimeout, clearTimeout,
        document: { getElementById: () => null, querySelector: () => null, addEventListener: () => {} },
        navigator: {}, location: {} };
      ctx.window = ctx; vm.createContext(ctx);
      vm.runInContext(coreSrc, ctx);
      return ctx;
    };
    const s1 = { nd_rp_cfg_v1: JSON.stringify({ respTokens: 512, temperature: 0.8 }) };
    const c1 = loadCore(s1);
    t("存量 512 被迁移到 2000", JSON.parse(s1.nd_rp_cfg_v1).respTokens === 2000);
    t("迁移不碰其它字段", JSON.parse(s1.nd_rp_cfg_v1).temperature === 0.8);
    t("迁移后 getRpCfg 读到 2000", vm.runInContext("getRpCfg().respTokens", c1) === 2000);
    t("迁移标记写在配置内部", JSON.parse(s1.nd_rp_cfg_v1)._migResp2000 === 1);
    t("迁移不新增顶层 key", Object.keys(s1).length === 1);
    const s2 = { nd_rp_cfg_v1: JSON.stringify({ respTokens: 1024 }) };
    loadCore(s2);
    t("用户自设 1024 不动", JSON.parse(s2.nd_rp_cfg_v1).respTokens === 1024);
    const s3 = { nd_rp_cfg_v1: JSON.stringify({ respTokens: 512, _migResp2000: 1 }) };
    loadCore(s3);
    t("已迁移过的不再覆盖(手动改回 512 受尊重)", JSON.parse(s3.nd_rp_cfg_v1).respTokens === 512);
    const s4 = {};
    const c4 = loadCore(s4);
    t("无存量配置时默认就是 2000", vm.runInContext("getRpCfg().respTokens", c4) === 2000);
    t("无存量配置时不落任何盘", Object.keys(s4).length === 0);
  }
  /* (5) 2026-11-23: ghost 气泡「重试」按钮 —— 渲染分支 + 处理函数接线 */
  {
    const prefs = fs.readFileSync(path.join(WWW, "js/app_prefs.js"), "utf8");
    const plot = fs.readFileSync(path.join(WWW, "js/app_plotline.js"), "utf8");
    const css = fs.readFileSync(path.join(WWW, "style.css"), "utf8");
    t("renderChat 有 ghost 专属分支", /if\(m\.ghost\)\{[\s\S]{0,300}ghostbar/.test(prefs));
    t("ghost 气泡渲染重试按钮", prefs.indexOf("retryGhost(") >= 0);
    t("retryGhost 已定义", plot.indexOf("window.retryGhost") >= 0);
    t("retryGhost 截断到用户消息并走 sendChatText",
      /retryGhost[\s\S]{0,1600}slice\(0, uidx\)[\s\S]{0,400}sendChatText\(um\.content\)/.test(plot));
    t("retryGhost 有在飞互斥", /retryGhost[\s\S]{0,200}STREAMING/.test(plot));
    t("ghostbar 样式存在", css.indexOf(".ghostbar") >= 0);
  }
  console.log(`test_ghost_retry: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FATAL", e && e.stack || e); process.exit(1); });
