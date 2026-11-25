/* 送礼验收（2026-11-25）：喜好分类（心头好/心意/忌讳）、落账调用、
 * 一次性纸条消费、真实卡冒烟。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

const calls = [];
const ctx = {console, RP_WIRING: {applyFavorDelta: (r, n, d) => { calls.push([r, n, d]); return {delta: d, total: 50 + d}; }}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(WWW + "/rp/gift.js", "utf8"), ctx);
const G = vm.runInContext("RP_GIFT", ctx);

const card = {name: "某人", fields: {
  preference_like: "喜爱读书、品茗、赏花",
  dislike_hate: "厌恶脂粉喧闹与饮酒",
}};
const opts = G.optionsFor(card);
const byId = {}; opts.forEach(o => byId[o.id] = o);
t("目录 10 件", opts.length === 10);
t("诗集=心头好+8", byId.book.kind === "心头好" && byId.book.delta === 8);
t("香茶=心头好", byId.tea.kind === "心头好");
t("胭脂=忌讳-3", byId.rouge.kind === "忌讳" && byId.rouge.delta === -3);
t("佳酿=忌讳（厌恶饮酒）", byId.wine.kind === "忌讳");
t("折扇=心意+3", byId.fan.kind === "心意" && byId.fan.delta === 3);
t("心头好排最前", opts[0].kind === "心头好");
t("忌讳排最后", opts[opts.length - 1].kind === "忌讳");

const r = G.give("run1", "某人", "book", card);
t("送礼返回落账结果", r && r.total === 58 && r.delta === 8);
t("落账走 applyFavorDelta", calls.length === 1 && calls[0][2] === 8);
const note = G.consumeNote("run1", "某人");
t("纸条含礼物名与反应要求", note.includes("诗集书卷") && note.includes("反应"));
t("纸条只消费一次", G.consumeNote("run1", "某人") === "");

/* 真实卡冒烟：红楼全员都能生成礼物单且结构完整 */
const cards = JSON.parse(fs.readFileSync(WWW + "/data/rp_cards_honglou_full.json", "utf8"));
const arr = Array.isArray(cards) ? cards : Object.values(cards);
let smoke = 0;
for(const c of arr){
  const o = G.optionsFor(c);
  if(o.length === 10 && o.every(x => x.kind && typeof x.delta === "number")) smoke++;
}
t("红楼卡全部可生成礼物单", smoke === arr.length && arr.length > 0);

console.log("gift: " + pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
