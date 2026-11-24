/* 蒸馏全利用二期验收（2026-11-24）：情境包扩编 + 命中埋点。
 * 新包交易谋划/亲近独处可触发且字段进注入文本；三包补字段在场；
 * enrich 后埋点计数 + debug 抽屉显示累计。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
const ctx = { console, localStorage, setTimeout, clearTimeout };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(WWW + "/rp/portrait.js", "utf8"), ctx, {filename: "portrait.js"});
const E = (card, text) => vm.runInContext("RP_PORTRAIT.enrich", ctx)(card, text, []);

const shuihu = JSON.parse(fs.readFileSync(WWW + "/data/rp_cards_shuihu_full.json", "utf8"));
const shArr = Array.isArray(shuihu) ? shuihu : Object.values(shuihu);
const full = shArr.find(c => c.fields.interest_claim && c.fields.private_self && c.fields.strengths && c.fields.preference_like && c.fields.life_experience);
t("水浒有全字段卡", !!full);

/* 交易谋划包 */
let r = E(full, "这笔交易你开个价钱，咱们商量商量条件");
t("交易情境命中 deal 包", r.hits.some(h => h.pack === "deal"));
t("deal 含利益诉求", r.text.indexOf("利益诉求") >= 0);
t("deal 含交易原则", r.text.indexOf("交易原则") >= 0);

/* 亲近独处包 */
r = E(full, "夜里没人时，我想跟你说句坦白的心里话");
t("独处情境命中 intimate 包", r.hits.some(h => h.pack === "intimate"));
t("intimate 含私密自我", r.text.indexOf("私密自我") >= 0);
t("intimate 含内心冲突", r.text.indexOf("内心冲突") >= 0);

/* social 补喜好 */
r = E(full, "初次见面，跟你聊聊");
t("social 含喜好", r.text.indexOf("喜好") >= 0);
t("social 含厌恶", r.text.indexOf("厌恶") >= 0);

/* conflict 补长处/短板/信念 */
r = E(full, "两人对峙，他出言挑衅，逼她动手");
t("conflict 含长处", r.text.indexOf("长处") >= 0);
t("conflict 含短板", r.text.indexOf("短板") >= 0);

/* memory 补人生经历 */
r = E(full, "你还记得当年小时候的事吗");
t("memory 含人生经历", r.text.indexOf("人生经历") >= 0);

/* 埋点：上面 5 轮有效命中后 rounds>=5，包计数在 */
const st = vm.runInContext("RP_PORTRAIT.hitStats()", ctx);
t("埋点 rounds>=5", !!st && st.rounds >= 5);
t("埋点含 deal 计数", !!st && (st.packs.deal || 0) >= 1);
t("埋点含 intimate 计数", !!st && (st.packs.intimate || 0) >= 1);
const dbg = vm.runInContext("RP_PORTRAIT.renderDebug", ctx)(r.hits, r.banned);
t("debug 抽屉显示累计命中", dbg.indexOf("累计命中") >= 0);

console.log(`fielduse_p2: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
