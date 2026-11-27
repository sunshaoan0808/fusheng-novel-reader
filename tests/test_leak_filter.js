/* 英文推理泄漏过滤验收（2026-11-27 用户拍板渲染层过滤）：样本取自两轮
 * 飞轮模拟的真实泄漏形态。原则：剥边缘泄漏行、中文/JSON/中间行绝不动、
 * 日志留原始、返回值干净。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const rd = p => fs.readFileSync(WWW + p, "utf8");

const store = {};
const ctx = { console, setTimeout, clearTimeout, Promise, JSON, Math, Date, URL, TextDecoder, TextEncoder,
  AbortController, fetch: null, document: undefined,
  localStorage: { getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  window: {} };
ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(rd("/rp/ailog.js"), ctx);
vm.runInContext(rd("/rp/chat.js"), ctx);
const A = ctx.RP_AILOG, NET = vm.runInContext("RP_NET", ctx), C = NET.cleanLeak;
t("过滤函数已暴露", typeof C === "function");

/* 1 尾部泄漏（模拟第一轮形态） */
const r1 = C("她垂下眼帘，指尖在杯沿轻轻一顿。「……好。」\nThe user says the character should agree. Let me write ~200-400 Chinese characters for this scene.");
t("尾部英文推理被剥", r1.includes("好") && !r1.includes("The user") && !r1.includes("Let me"));
/* 2 头部泄漏（模拟第二轮沉默局形态） */
const r2 = C("The user is silent, just looking out the window at the rain. Per rules: when the user is silent, describe the environment.\n雨丝斜织，茶烟袅袅。她没有说话，只把茶盏往你这边推了推。");
t("头部英文推理被剥", r2.startsWith("雨丝") && !r2.includes("Per rules"));
/* 3 整段泄漏（记录7/8形态）→ 空串，走上层空回复重试 */
const r3 = C("The user wants a quiet scene in the teahouse tonight.\nLet me write the reply in Chinese and keep it short.");
t("整段泄漏剥成空串", r3 === "");
/* 4 纯中文原样 */
const zh = "「请坐。」她抬眼，眸光在灯影里晃了晃。\n窗外雨声渐密，檐下水珠成线。";
t("纯中文回复不变", C(zh) === zh);
/* 5 尾部 JSON 受保护 */
const withJson = "这是分析结论，正文到此。\n{\"verdicts\":[{\"n\":1,\"verdict\":\"gone\"}]}";
t("尾部 JSON 不被剥", C(withJson) === withJson);
/* 6 中间的英文对白行不动 */
const mid = "她忽然用英文念了一句诗。\n\"Shall I compare thee to a summer's day?\"\n念完自己先笑了。";
t("中间英文行不动", C(mid) === mid);
/* 7 无元标记的纯英文长文：保守不动 */
const enOnly = "The rain had been falling since dawn, and the small teahouse by the river was quiet except for the sound of boiling water.";
t("无标记英文散文保守保留", C(enOnly) === enOnly);
/* 8 空回复标记与空值透传 */
t("空回复标记透传", C("(空回复)") === "(空回复)" && C("") === "" && C(null) === null);

/* 9 接缝：complete 返回干净版，日志记原始版 */
(async () => {
  ctx.fetch = () => Promise.resolve({ ok: true, status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content: "「好。」她点头。\nThe user asked for a short reply. Let me keep it brief and atmospheric now." }, finish_reason: "stop" }] }) });
  const cfg = { base: "https://gw.example/v1", key: "k", model: "m" };
  const out = await NET.complete(cfg, [{ role: "user", content: "q" }], 0.8);
  t("complete 返回已过滤", out.includes("好") && !out.includes("The user"));
  const recs = A.exportObj().records;
  t("诊断日志保留原始泄漏", recs.length === 1 && recs[0].reply.includes("The user asked"));
  /* 10 开关：cleanLeak=false 时原样返回 */
  const out2 = await NET.complete({ base: "https://gw.example/v1", key: "k", model: "m", cleanLeak: false },
    [{ role: "user", content: "q" }], 0.8);
  t("cleanLeak=false 原样返回", out2.includes("The user asked"));
  console.log("leak_filter: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL: 异常", e); process.exit(1); });
