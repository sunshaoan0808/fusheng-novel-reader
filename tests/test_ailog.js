/* AI 诊断日志验收（2026-11-26）：RP_AILOG 功能（落盘/思考拆分/环形淘汰/
 * 开关/分析拼装）+ 传输层挂钩静态断言。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const rd = p => fs.readFileSync(WWW + p, "utf8");

function mkCtx(){
  const store = {};
  const ctx = { console, Date, JSON, Math, Promise, Set, Array, Object, String, Number,
    localStorage: { getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    window: {} };
  ctx.window.localStorage = ctx.localStorage;
  vm.createContext(ctx);
  vm.runInContext(rd("/rp/ailog.js"), ctx);
  return ctx;
}
const ctx = mkCtx();
const A = ctx.RP_AILOG;
t("模块与 hook 已注册", !!A && typeof ctx.window.__aiLogHook === "function");
const hook = ctx.window.__aiLogHook;

/* 基本落盘 + reasoning 字段 */
hook({ ts: 1000, ms: 500, model: "m1", stream: false, messages: [{role: "system", content: "SYS"}, {role: "user", content: "你好"}], thinking: "我想想", reply: "答复一" });
let sums = A.summaries();
t("记录落盘且摘要正确", sums.length === 1 && sums[0].promptChars === 5 && sums[0].thinkChars === 3 && sums[0].replyChars === 3);
const e1 = A.get(sums[0].id);
t("详情含完整提示词", e1.messages.length === 2 && e1.messages[0].content === "SYS" && e1.thinking === "我想想");

/* <think> 内嵌拆分 */
hook({ ts: 2000, ms: 1, model: "m1", messages: [{role: "user", content: "q"}], reply: "<think>内心戏</think>正文" });
const e2 = A.get(A.summaries()[0].id);
t("think 段拆进思考、答复存净文本", e2.thinking === "内心戏" && e2.reply === "正文");

/* 错误记录 */
hook({ ts: 3000, ms: 1, model: "m1", messages: [], reply: "", error: "接口返回 429" });
t("错误记录在案", A.summaries()[0].error === "接口返回 429");

/* 开关 */
A.setEnabled(false);
hook({ ts: 4000, ms: 1, model: "m1", messages: [], reply: "不该记" });
t("关记录时不落盘", A.summaries().length === 3);
A.setEnabled(true);

/* 条数淘汰：灌到 45 条，只留 40，最旧的被淘 */
for(let i = 0; i < 45; i++) hook({ ts: 5000 + i, ms: 1, model: "m", messages: [{role: "user", content: "x" + i}], reply: "r" });
t("条数上限 40", A.summaries().length === 40);
t("最旧的已被淘汰", !A.get(e1.id));

/* 字数淘汰：单条巨型记录进来后总量不超上限 */
A.clear();
hook({ ts: 1, ms: 1, model: "m", messages: [{role: "user", content: "a".repeat(1000)}], reply: "r" });
hook({ ts: 2, ms: 1, model: "m", messages: [{role: "user", content: "b".repeat(A.MAX_CHARS)}], reply: "r" });
t("字数上限生效（总量不超限或只剩巨型条）", A.stats().chars <= A.MAX_CHARS || A.stats().n === 1);

/* 分析拼装 + 留存 */
A.clear();
hook({ ts: 9000, ms: 1, model: "m9", messages: [{role: "system", content: "人设"}, {role: "user", content: "在吗"}], thinking: "思考X", reply: "答复Y" });
let captured = null;
A.analyze((cfg, msgs) => { captured = msgs; return Promise.resolve("诊断结论Z"); }, {}, 10).then(text => {
  t("分析返回结论", text === "诊断结论Z");
  t("诊断材料含三段", captured && captured[1].content.includes("人设") && captured[1].content.includes("思考X") && captured[1].content.includes("答复Y"));
  t("诊断系统词含代写检查", captured[0].content.includes("代写"));
  t("结论已留存", A.loadAnalyses().length === 1);
  /* 导出包 */
  const ex = A.exportObj();
  t("导出包含记录与分析", ex.records.length === 1 && ex.analyses.length === 1 && ex.kind === "ai-diag-log");
  /* 传输层挂钩静态断言 */
  const chat = rd("/rp/chat.js");
  t("传输层三包装齐全", chat.includes("completeInner") && chat.includes("streamInner") && chat.includes("visionCompleteInner") && chat.includes("__aiEmit"));
  t("reasoning 双路捕获", chat.includes("reasoning_content") && chat.includes("__lastReason += rk"));
  const appjs = rd("/app.js");
  t("设置页有诊断入口", appjs.includes("showAiLog()") && appjs.includes("AI 诊断"));
  const idx = rd("/index.html");
  t("index 引入两个新文件", idx.includes("rp/ailog.js") && idx.includes("js/app_ailog.js"));
  console.log("ailog: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
}).catch(e => { console.log("FAIL: analyze 异常", e); process.exit(1); });
