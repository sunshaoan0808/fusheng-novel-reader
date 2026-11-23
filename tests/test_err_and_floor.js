"use strict";
/* 审计尾巴两件回归(2026-11-23 用户 GO):
 * (1) 报错文案按状态码分工: httpErr 在抛出点挂 .status; errTextFor 分 400/429/5xx/通用
 *     四套文案, 老错误从文案解析兜底; 四处发送路径统一走 errTextFor。
 * (2) 经典预设篇幅下限: classic 带 lengthFloor 时 post 压尾带【篇幅】(与叙事者第 9 条
 *     同口径); lite/immers 不带。 */
const fs = require("fs");
const vm = require("vm");
let pass = 0, fail = 0;
function t(name, cond){ if(cond) pass++; else { fail++; console.log("  FAIL " + name); } }
function load(p){ return fs.readFileSync(p, "utf8"); }

const chat = load("www/rp/chat.js");
const plot = load("www/js/app_plotline.js");
const promptSrc = load("www/rp/prompt.js");

/* ---- (1a) httpErr / errTextFor 行为: 抽函数实测 ---- */
const mHttp = chat.match(/function httpErr\(status\)\{[\s\S]*?\n\}/);
const mErr = chat.match(/function errTextFor\(err\)\{[\s\S]*?\n\}/);
t("httpErr 可抽取", !!mHttp);
t("errTextFor 可抽取", !!mErr);
if(mHttp && mErr){
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(mHttp[0] + "\n" + mErr[0] + "\nthis.__h = httpErr; this.__f = errTextFor;", ctx);
  const h = ctx.__h, f = ctx.__f;
  t("httpErr 挂 status", h(429).status === 429 && h(429).message === "接口返回 429");
  t("400 文案指向模型名", f(h(400)).indexOf("模型名") >= 0 && f(h(400)).indexOf("400") >= 0);
  t("429 文案是限流", f(h(429)).indexOf("限流") >= 0);
  t("503 文案是网关侧", f(h(503)).indexOf("网关") >= 0 && f(h(503)).indexOf("503") >= 0);
  t("500 文案是网关侧", f(h(500)).indexOf("不是你这边的问题") >= 0);
  t("404 走通用文案", f(h(404)).indexOf("请检查设置里的 API 地址") >= 0);
  t("原始信息保留", f(h(429)).indexOf("原始信息：接口返回 429") >= 0);
  t("老错误从文案解析 502", f(new Error("接口返回 502")).indexOf("网关") >= 0);
  t("老错误从文案解析 HTTP 429", f(new Error("HTTP 429")).indexOf("限流") >= 0);
  t("网络错误走通用文案", f(new Error("Failed to fetch")).indexOf("请检查设置里的 API 地址") >= 0);
  t("空错误不炸", typeof f(null) === "string" && f(null).indexOf("出错了") >= 0);
}

/* ---- (1b) 接线钉子 ---- */
t("四处抛出点全换 httpErr", (chat.match(/throw httpErr\(r\.status\)/g) || []).length === 4);
t("无裸 接口返回 抛错残留", chat.indexOf('throw new Error("接口返回 "') < 0);
t("三处 errNotice 走 errTextFor", (chat.match(/errNotice\(errTextFor\(/g) || []).length === 3);
t("RP 导出 errText", chat.indexOf("errText: errTextFor") >= 0);
t("群聊兜底走 RP.errText", plot.indexOf("RP.errText ? RP.errText(e)") >= 0);

/* ---- (2) 经典预设篇幅下限: buildMessages 真集成 ---- */
eval(promptSrc + "\n;globalThis.RP_PROMPT = RP_PROMPT;");
const P = globalThis.RP_PROMPT;
const card = { name: "杨蓉", fields: { core_identity: "测试人物" } };
const hist = [{ role: "user", content: "你好" }];
function hasFloor(budget){
  const b = P.buildMessages(card, { novel: "测试书", history: hist }, budget);
  return b.messages.some(m => String(m.content).indexOf("以 400 字上下为底线") >= 0);
}
t("classic 标记在位", P.PRESETS.classic.lengthFloor === true);
t("lite 无标记", !P.PRESETS.lite.lengthFloor);
t("默认(经典)带篇幅下限", hasFloor({ maxContext: 8192 }));
t("显式 classic 带下限", hasFloor({ maxContext: 8192, preset: "classic" }));
t("lite 不带下限", !hasFloor({ maxContext: 8192, preset: "lite" }));
t("immers 不带下限", !hasFloor({ maxContext: 8192, preset: "immers" }));
t("下限含防凑字条款", (()=>{
  const b = P.buildMessages(card, { novel: "测试书", history: hist }, { maxContext: 8192 });
  const post = b.messages[b.messages.length - 1];
  return post.content.indexOf("绝不靠替玩家行动") >= 0;
})());

console.log("test_err_and_floor: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
