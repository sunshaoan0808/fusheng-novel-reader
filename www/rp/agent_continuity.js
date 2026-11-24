/* Continuity Checker (2026-10-07): 借鉴 Marinara-Engine Continuity Checker。
* 检查回复中的逻辑矛盾：人物分身、时间线断裂、与已定事实矛盾、物品状态不一致。
* 发现问题时列 checklist，用户可选择修或保留。
* Post-Processing 阶段，LLM 驱动（比 OOC 正则更深一层）。
*/
var AGENT_CONTINUITY = (function(){
"use strict";

/* 检查单条回复的连续性 */
async function check(runId, name, reply, history, callChat, cfg){
try{
if(localStorage.getItem("nd_continuity_off") === "1") return {issues: []};
}catch(e){}

// 取前文关键事实（最近10轮摘要）
var context = history.slice(-10).map(function(m){
return (m.role === "user"? "用户": name) + ": " + (m.content || "").slice(0, 300);
}).join("\n");

/* 2026-11-24 蒸馏全利用四期: forbidden_behaviors 此前蒸出无人读，
 * 与 ooc_redline 并列作事后检查表（redline 管 prompt 前约束，这里管生成后核查）。 */
var redlineText = "";
try{
var _card = (typeof RP !== "undefined" && RP.findCard) ? RP.findCard(runId, name) : null;
var _f = (_card && _card.fields) || {};
var _lines = [];
if(_f.forbidden_behaviors) _lines.push(String(_f.forbidden_behaviors));
if(_f.ooc_redline) _lines.push(String(_f.ooc_redline));
if(_lines.length) redlineText = _lines.join("；").slice(0, 300);
}catch(e){}

try{
var r = await callChat(cfg, [
{role: "system", content:
"你是连续性检查员。检查是否与矛盾。\n" +
"检查项：\n" +
"1. 人物分身：同一人物同时出现在两个地方\n" +
"2. 时间矛盾：时间推进不合理（如刚说深夜又说正午）\n" +
"3. 事实矛盾：与前文已定的事实冲突（如前文说剑断了，现在又用剑）\n" +
"4. 状态矛盾：人物伤/死/离场后又若无其事出现\n" +
(redlineText? "5. 行为红线：回复中该角色是否做了其绝不会做的事。红线清单：" + redlineText + "\n": "") +
"只报告确凿矛盾，不要吹毛求疵。\n" +
"返回 JSON: {\"issues\": [{\"type\": \"分身/时间/事实/状态/红线\", \"desc\": \"具体矛盾描述\"}]}\n" +
"无问题返回 {\"issues\": []}。只返回 JSON。"},
{role: "user", content: "\n" + context + "\n\n\n" + reply.slice(0, 800)}
], 0.3);
var m = r.match(/\{[\s\S]*\}/);
if(!m) return {issues: []};
var result = JSON.parse(m[0]);
return {issues: Array.isArray(result.issues)? result.issues.slice(0, 3): []};
}catch(e){ return {issues: []};}
}

/* 自动修复：让模型重写矛盾处 */
async function fix(runId, name, reply, issues, history, callChat, cfg){
var issueDesc = issues.map(function(i){ return i.type + ": " + i.desc;}).join("; ");
try{
var r = await callChat(cfg, [
{role: "system", content: "你是" + name + "。重写下面的回复，修复这些连续性问题：" + issueDesc +
"。保持原意和文风，只改矛盾处。直接返回重写后的回复，不要解释。"},
{role: "user", content: reply.slice(0, 1000)}
], 0.7);
return r.trim();
}catch(e){ return reply;}
}

function setEnabled(on){
try{
if(on) localStorage.removeItem("nd_continuity_off");
else localStorage.setItem("nd_continuity_off", "1");
}catch(e){}
}
function isEnabled(){
try{ return localStorage.getItem("nd_continuity_off")!== "1";}
catch(e){ return true;}
}

return {
check: check,
fix: fix,
setEnabled: setEnabled,
isEnabled: isEnabled
};
})();
