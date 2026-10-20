/* RP_BEATS 剧本式正文模块测试：parseNarrativeRows / scriptBeats / lookAt / lastLook */
const BEATS = require("../www/rp/beats.js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

/* ---------- parseNarrativeRows ---------- */
var rows = BEATS.parseNarrativeRows(
  "- 谁: '旁白'    说: '她跑到窗边。'\n" +
  "- 谁: '林黛玉'  表情: '害羞'  动作: '揪着衣角'  说: '才、才没有呢'"
);
ok("parse 基本两条", rows.length === 2 && rows[0]["谁"] === "旁白" && rows[0]["说"] === "她跑到窗边。" &&
  rows[1]["谁"] === "林黛玉" && rows[1]["表情"] === "害羞" && rows[1]["动作"] === "揪着衣角" &&
  rows[1]["说"] === "才、才没有呢");

var rowsTag = BEATS.parseNarrativeRows(
  "标签外的散文不应被解析。\n<narrative>\n- 谁: '旁白' 说: '标签内。'\n</narrative>\n- 谁: '旁白' 说: '标签外列表也不取。'"
);
ok("parse 只取 narrative 标签内", rowsTag.length === 1 && rowsTag[0]["说"] === "标签内。");

var rowsQ = BEATS.parseNarrativeRows('- 谁: "旁白" 说: "双引号"');
ok("parse 双引号剥离", rowsQ.length === 1 && rowsQ[0]["谁"] === "旁白" && rowsQ[0]["说"] === "双引号");

var rowsFull = BEATS.parseNarrativeRows("- 谁：'旁白' 说：'全角冒号。'");
ok("parse 全角冒号", rowsFull.length === 1 && rowsFull[0]["谁"] === "旁白" && rowsFull[0]["说"] === "全角冒号。");

var rowsLead = BEATS.parseNarrativeRows("这是散文开头，没有列表。\n- 谁: '旁白' 说: '第一条。'");
ok("parse 标签前散文行被忽略", rowsLead.length === 1 && rowsLead[0]["说"] === "第一条。");

ok("parse 纯散文返回空数组", eq(BEATS.parseNarrativeRows("这是一段纯散文，没有列表。"), []));
ok("parse null 返回空数组", eq(BEATS.parseNarrativeRows(null), []));

/* ---------- scriptBeats 四种 kind ---------- */
var b1 = BEATS.scriptBeats([
  {"谁": "旁白", "说": "她跑到窗边。"},
  {"谁": "消息", "来自": "💻 系统", "说": "今晚有流星雨哦"},
  {"谁": "张三", "说": "你怎么了？"},
  {"谁": "林黛玉", "表情": "害羞", "动作": "揪着衣角", "说": "才、才没有呢"}
], "林黛玉");
ok("scriptBeats 四条全走", b1.length === 4);
ok("旁白 kind", b1[0].kind === "narr" && b1[0].text === "她跑到窗边。");
ok("消息 kind 带 source", b1[1].kind === "note" && b1[1].source === "💻 系统" && b1[1].text === "今晚有流星雨哦");
ok("玩家 kind", b1[2].kind === "you" && b1[2].text === "「你怎么了？」");
ok("角色 kind 与显示格式", b1[3].kind === "her" && b1[3].text === "（揪着衣角）「才、才没有呢」");
ok("角色 look 字段", b1[3].say === true && b1[3].look.expr === "害羞" && b1[3].look.act === "揪着衣角" &&
  b1[3].look.seed === "（揪着衣角）「才、才没有呢」");

var bThought = BEATS.scriptBeats([{"谁": "旁白", "说": "💭她心里想着他。"}], "林黛玉");
ok("旁白 💭 开头被跳过", bThought.length === 0);

var bEmpty = BEATS.scriptBeats([{"谁": "林黛玉", "表情": "害羞"}], "林黛玉");
ok("动作台词都空被跳过", bEmpty.length === 0);

var bQuoted = BEATS.scriptBeats([{"谁": "林黛玉", "说": "「才没有呢」"}], "林黛玉");
ok("模型自带「」去一层", bQuoted.length === 1 && bQuoted[0].text === "「才没有呢」");

var bNoWho = BEATS.scriptBeats([{"动作": "点头", "说": "嗯。"}], "林黛玉");
ok("谁为空但有内容算 her", bNoWho.length === 1 && bNoWho[0].kind === "her" && bNoWho[0].text === "（点头）「嗯。」");

var bActOnly = BEATS.scriptBeats([{"谁": "林黛玉", "动作": "摇头"}], "林黛玉");
ok("只有动作也成一句", bActOnly.length === 1 && bActOnly[0].text === "（摇头）" && bActOnly[0].say === false);

ok("scriptBeats 空输入返回真空数组", eq(BEATS.scriptBeats([], "林黛玉"), []));

/* ---------- lookAt ---------- */
var beats = BEATS.scriptBeats([
  {"谁": "旁白", "说": "雨下得很大。"},
  {"谁": "林黛玉", "表情": "害羞", "说": "才没有呢"},
  {"谁": "旁白", "说": "她转过身。"},
  {"谁": "我", "说": "你怎么了？"}
], "林黛玉");
ok("lookAt 本句是 her 取本句", BEATS.lookAt(beats, 1, "FALLBACK").expr === "害羞");
ok("lookAt 旁白往前取最近 her", BEATS.lookAt(beats, 2, "FALLBACK").expr === "害羞");
ok("lookAt 玩家句往前取最近 her", BEATS.lookAt(beats, 3, "FALLBACK").expr === "害羞");
var beatsHead = BEATS.scriptBeats([
  {"谁": "旁白", "说": "开头旁白。"},
  {"谁": "旁白", "说": "还是旁白。"},
  {"谁": "林黛玉", "表情": "平静", "说": "来了。"}
], "林黛玉");
ok("lookAt 开头全旁白往后取", BEATS.lookAt(beatsHead, 0, "FALLBACK").expr === "平静");
var beatsNone = BEATS.scriptBeats([{"谁": "旁白", "说": "只有旁白。"}], "林黛玉");
ok("lookAt 全轮无 her 返回 fallback", BEATS.lookAt(beatsNone, 0, "FALLBACK") === "FALLBACK");
ok("lookAt 空数组不崩", BEATS.lookAt([], 0, "FALLBACK") === "FALLBACK");

/* ---------- lastLook ---------- */
ok("lastLook 取最后 her", BEATS.lastLook(beats).expr === "害羞");
ok("lastLook 无 her 返回 null", BEATS.lastLook(beatsNone) === null);
ok("lastLook 空数组返回 null", BEATS.lastLook([]) === null);

/* ---------- 端到端：原文 -> beats ---------- */
var e2e = BEATS.scriptBeats(BEATS.parseNarrativeRows(
  "<narrative>\n- 谁: '旁白' 说: '雨。'\n- 谁: '林黛玉' 表情: '害羞' 动作: '揪着衣角' 说: '才没有呢'\n</narrative>"
), "林黛玉");
ok("端到端 parse+beats", e2e.length === 2 && e2e[0].kind === "narr" && e2e[1].kind === "her");

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
