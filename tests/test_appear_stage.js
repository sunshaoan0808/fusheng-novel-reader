"use strict";
/* P1-b 分阶段渲染回归: 外在/任意字段的阶段变体(两种数据形态)在 prompt 里的行形态。
 * 形态 A: 平铺键 "<字段>__early|mid|late" (官方 run 手拆数据)
 * 形态 B: 合并结构 fields.early[k] (蒸馏包 _distill, mergeProfiles 原生产物)
 * 断言钉住: 有变体→分阶段行; 单阶段且与扁平同→不重复; 无变体→原样。 */
const fs = require("fs");
const assert = require("assert");
function load(p){ return fs.readFileSync("./" + p, "utf8"); }

/* prompt.js 顶层是 const RP_PROMPT(不挂全局), 追加导出句再 eval */
eval(load("www/rp/prompt.js") + "\n;globalThis.RP_PROMPT = RP_PROMPT;");
const P = globalThis.RP_PROMPT;
const L = P.LABELS;

/* ---- 形态 A: 平铺 __early/__late ---- */
var cardA = { name: "测试", fields: {
  appearance_feature: "春晓之花；陵驿光头赤脚",
  appearance_feature__early: "春晓之花",
  appearance_feature__late: "陵驿光头赤脚",
  habit_action: "临别作揖"
} };
var segA = P.renderFields(cardA, P.LAYERS.appearance);
assert.ok(segA.indexOf("- 外貌（前期）：春晓之花") >= 0, "A: 前期行");
assert.ok(segA.indexOf("- 外貌（后期）：陵驿光头赤脚") >= 0, "A: 后期行");
assert.ok(segA.indexOf("春晓之花；陵驿光头赤脚") < 0, "A: 扁平混装行不再出现");
assert.ok(segA.indexOf("- 习惯动作：临别作揖") >= 0, "A: 无变体字段原样渲染");

/* ---- 形态 B: 蒸馏包合并结构 ---- */
var cardB = { name: "测试", fields: {
  core_identity: "测试官",
  early: { appearance_feature: "少年英气", speech_style: "快人快语" },
  mid:  { appearance_feature: "沉稳持重" },
  late: { appearance_feature: "沧桑瘦削" },
  appearance_feature: "少年英气；沉稳持重；沧桑瘦削"
} };
var segB = P.renderFields(cardB, P.LAYERS.appearance.concat(P.LAYERS.speech));
assert.ok(segB.indexOf("- 外貌（前期）：少年英气") >= 0, "B: 前期");
assert.ok(segB.indexOf("- 外貌（中期）：沉稳持重") >= 0, "B: 中期");
assert.ok(segB.indexOf("- 外貌（后期）：沧桑瘦削") >= 0, "B: 后期");
assert.ok(segB.indexOf("- 说话风格（前期）：快人快语") >= 0, "B: 非外貌层同样生效");

/* ---- 单阶段且与扁平相同 → 去重, 不加阶段标签 ---- */
var cardC = { name: "测试", fields: { appearance_feature: "只有一句话", appearance_feature__early: "只有一句话" } };
var segC = P.renderFields(cardC, ["appearance_feature"]);
assert.strictEqual(segC, "- 外貌：只有一句话", "C: 单阶段去重");

/* ---- 空变体不占位 ---- */
var cardD = { name: "测试", fields: { appearance_feature: "有值", appearance_feature__early: "", appearance_feature__late: "  " } };
var segD = P.renderFields(cardD, ["appearance_feature"]);
assert.strictEqual(segD, "- 外貌：有值", "D: 空变体被忽略");

/* ---- 端到端: 宝玉(真实数据)外貌段是分阶段行 ---- */
var src = load("www/data.js");
var D = JSON.parse(src.match(/window\.__DATA__=(\{.*\});?\s*$/s)[1]);
fs.readdirSync("www/data").filter(f => /^run_.*\.js$/.test(f)).sort().forEach(function (f) {
  var m = load("www/data/" + f).match(/window\.__DATA__\.rp_cards\["([^"]+)"\]=(\[[\s\S]*?\]);\s*$/m);
  if (m) D.rp_cards[m[1]] = JSON.parse(m[2]);
});
var baoyu = D.rp_cards.honglou_full.filter(c => c.name === "贾宝玉")[0];
var r = P.buildMessages(baoyu, { novel: "红楼梦", history: [] }, { maxContext: 8192 });
var sys = r.messages[0].content;
var apSeg = sys.slice(sys.indexOf("【外貌与举止】")).split("\n【")[0];
assert.ok(apSeg.indexOf("- 外貌（前期）：色如春晓之花，眉如墨画") >= 0, "E2E 宝玉前期行");
assert.ok(apSeg.indexOf("- 外貌（后期）：陵驿相见时光头赤脚") >= 0, "E2E 宝玉后期行");
assert.ok(apSeg.indexOf("色如春晓之花，眉如墨画；陵驿") < 0, "E2E 混装行不进 prompt");

/* ---- ST 预设路径: 外貌折进 charDesc, 分阶段行同在 ---- */
var stPreset = { id: "t", name: "t", prompts: [
  { identifier: "charDescription", name: "Char Desc", marker: true, role: "system", enabled: true },
  { identifier: "chatHistory", name: "Chat History", marker: true, role: "system", enabled: true }
]};
var r2 = P.buildMessages(baoyu, { novel: "红楼梦", history: [] }, { maxContext: 8192, stPreset: stPreset });
var sys2 = r2.messages.map(m => m.content).join("\n");
assert.ok(sys2.indexOf("【外貌与举止】") >= 0, "ST 路径外貌段在位");
assert.ok(sys2.indexOf("- 外貌（后期）：陵驿相见时光头赤脚") >= 0, "ST 路径分阶段行同在");

/* ---- E2E 生死轴: 贾母 appearance_feature 整字段是临终内容(post-only),
 *      标签必须保留(曾撞去重规则被吃); 鲁智深 signature_items 前后双行 ---- */
var jiamu = D.rp_cards.honglou_full.filter(c => c.name === "贾母")[0];
var rJ = P.buildMessages(jiamu, { novel: "红楼梦", history: [] }, { maxContext: 8192 });
var sysJ = rJ.messages[0].content;
var apSegJ = sysJ.slice(sysJ.indexOf("【外貌与举止】")).split("\n【")[0];
assert.ok(apSegJ.indexOf("- 外貌（身后）：临终坐起") >= 0, "E2E 贾母身后标签保留");
var luzhi = D.rp_cards.shuihu_full.filter(c => c.name === "鲁智深")[0];
var rL = P.buildMessages(luzhi, { novel: "水浒传", history: [] }, { maxContext: 8192 });
var sysL = rL.messages[0].content;
assert.ok(sysL.indexOf("- 随身物品（生前）：铁禅杖（随身步战器械") >= 0, "E2E 鲁智深生前行");
assert.ok(sysL.indexOf("- 随身物品（身后）：铁禅杖与皂布直裰：临终留六和寺供养") >= 0, "E2E 鲁智深身后行");

/* ---- 生死轴: __pre/__post 平铺键 ---- */
var cardE = { name: "测试", fields: {
  reputation: "生前德高望重；死后立祠享祭",
  reputation__pre: "生前德高望重",
  reputation__post: "死后立祠享祭"
} };
var segE = P.renderFields(cardE, ["reputation"]);
assert.ok(segE.indexOf("- 外界评价（生前）：生前德高望重") >= 0, "E: 生前行");
assert.ok(segE.indexOf("- 外界评价（身后）：死后立祠享祭") >= 0, "E: 身后行");
assert.ok(segE.indexOf("生前德高望重；死后立祠享祭") < 0, "E: 混装行不出现");

/* ---- 生死轴不走去重: 整字段即身后内容(贾母型)时, (身后)标签必须保留 ---- */
var cardF = { name: "测试", fields: {
  appearance_feature: "临终坐起；脸上发红",
  appearance_feature__post: "临终坐起；脸上发红"
} };
var segF = P.renderFields(cardF, ["appearance_feature"]);
assert.strictEqual(segF, "- 外貌（身后）：临终坐起；脸上发红",
  "F: post==flat 也保留阶段标签(去重规则对生死轴失效)");

/* ---- 生死轴合并结构(蒸馏包 fields.post[k]) ---- */
var cardG = { name: "测试", fields: {
  reputation: "生前被称贤良；死后遭仇家唾骂",
  pre: { reputation: "生前被称贤良" },
  post: { reputation: "死后遭仇家唾骂" }
} };
var segG = P.renderFields(cardG, ["reputation"]);
assert.ok(segG.indexOf("（生前）：生前被称贤良") >= 0, "G: 合并结构生前行");
assert.ok(segG.indexOf("（身后）：死后遭仇家唾骂") >= 0, "G: 合并结构身后行");

console.log("appear_stage: all pass");
