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

console.log("appear_stage: all pass");
