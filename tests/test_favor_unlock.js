/* 好感等级解锁验收（2026-11-25，借鉴 Tipsy Heart Reveal）：
 * favorTier 档位/门、applyFavorDelta 钳制与落盘、画像亲近包门控、
 * 暗线段判词门控与心声行。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

/* ---- wiring: 真实 FavorEngine 组装 ---- */
const store = {};
global.localStorage = {
  getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem(k, v){ store[k] = String(v); },
  removeItem(k){ delete store[k]; }
};
global.createFavorEngine = require("../" + WWW + "/rp/status.js").createFavorEngine;
const W = require("../" + WWW + "/rp/wiring.js");

const t0 = W.favorTier("r1", "林黛玉");
t("初始档疏远、全门关", t0 && t0.value === 0 && t0.levelName === "疏远" && !t0.gates.inner && !t0.gates.deep && !t0.gates.voice);
const d1 = W.applyFavorDelta("r1", "林黛玉", 45);
t("送礼式 +45 落账", d1 && d1.total === 45 && W.favorOf("r1", "林黛玉") === 45);
const t1 = W.favorTier("r1", "林黛玉");
t("45 分开 inner 门", t1.gates.inner === true && t1.gates.deep === false && t1.levelName === "友善");
W.applyFavorDelta("r1", "林黛玉", 40);
const t2 = W.favorTier("r1", "林黛玉");
t("85 分全门开、档倾心", t2.value === 85 && t2.gates.deep && t2.gates.voice && t2.levelName === "倾心");
const d2 = W.applyFavorDelta("r1", "林黛玉", -200);
t("负向钳制到 0", d2.total === 0 && W.favorOf("r1", "林黛玉") === 0);

/* ---- portrait 亲近包门控 ---- */
const ctx = {console, setTimeout, clearTimeout};
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(WWW + "/rp/portrait.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync(WWW + "/rp/worldline.js", "utf8"), ctx);
const P = vm.runInContext("RP_PORTRAIT", ctx);
const WL = vm.runInContext("RP_WORLDLINE", ctx);
const card = {name: "某人", fields: {
  private_self: "独处时才显露的脆弱一面", disguise_switch: "人前人后两副面孔",
  self_cognition: "对自己看得透彻", inner_conflict: "情与理的拉扯",
}};
const TXT = "夜里独处，她向你坦白心里话";
const eAll = P.enrich(card, TXT, []);
t("无门时私密字段全出", eAll.text.includes("脆弱一面") && eAll.text.includes("看得透彻"));
const eNone = P.enrich(card, TXT, [], undefined, {inner: false, deep: false});
t("全门关时深层字段全拦", !eNone.text.includes("脆弱一面") && !eNone.text.includes("看得透彻") && !eNone.text.includes("两副面孔"));
const eInner = P.enrich(card, TXT, [], undefined, {inner: true, deep: false});
t("只开 inner: 认知出、私密拦", eInner.text.includes("看得透彻") && !eInner.text.includes("脆弱一面"));

/* ---- worldline 判词/心声门控（红楼真数据） ---- */
const run = JSON.parse(fs.readFileSync(WWW + "/data/honglou_full.json", "utf8"));
const cards = JSON.parse(fs.readFileSync(WWW + "/data/rp_cards_honglou_full.json", "utf8"));
const cArr = Array.isArray(cards) ? cards : Object.values(cards);
const daiyu = cArr.find(c => c.name === "林黛玉");
const base = {name: "林黛玉", present: ["林黛玉"], cards: [daiyu], chapterIdx: -1};
const wLocked = WL.build(run, Object.assign({}, base));
t("未解锁判词只给提示", wLocked.includes("暂不揭示") && !wLocked.includes("玉带林中挂"));
const wDeep = WL.build(run, Object.assign({}, base, {tier: {gates: {deep: true, voice: false}}}));
t("亲近解锁判词全文", wDeep.includes("玉带林中挂") && !wDeep.includes("心声"));
const wVoice = WL.build(run, Object.assign({}, base, {tier: {gates: {deep: true, voice: true}}}));
t("倾心解锁心声行", wVoice.includes("心声"));

console.log(`favor_unlock: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
