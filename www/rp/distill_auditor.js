/* 审计员 (2026-10-07): 借鉴 Talkie ai_novel_agent_auditor。
* 生成后自动审计：逻辑矛盾、人设冲突、与原文矛盾。
* 纯 LLM，一次调用审一个人。
*/
var DISTILL_AUDITOR = (function(){
"use strict";

async function audit(pkgId, charName, opts){
opts = opts || {};
var onProgress = opts.onProgress || function(){};

var card = DISTILL_PACKAGE.getCharacterCard(pkgId, charName);
if(!card ||!card._distill) throw new Error("角色卡不存在");

onProgress("审计 " + charName + "...");

// 档案文本 (去引用标注)
var md = Object.keys(card._distill).map(function(k){
var v = card._distill[k];
if(typeof v === "string") v = v.replace(/\[(canon|ref|inference|unknown)(:[a-z0-9_\-]+)?\]/gi, "");
// 跳过分阶段子对象
if(typeof v === "object") return "";
return k + ": " + (v || "");
}).filter(Boolean).join("\n").slice(0, 5000);

try{
var r = await DISTILL_LLM.chat([
{role: "system", content:
"你是人物档案审计员。检查档案中的逻辑问题。\n" +
"检查项：\n" +
"1. 内部矛盾：同一档案前后矛盾（如：前面说冷漠，后面说热情）\n" +
"2. 逻辑错误：年龄/身份/时间线不合理\n" +
"3. 过度推断：明显超出原文的臆测\n" +
"返回 JSON: {\"issues\": [{\"type\": \"contradiction|logic|overinfer\", \"field\": \"字段名\", \"desc\": \"问题描述\", \"severity\": \"high|medium|low\"}], \"pass\": true/false}\n" +
"没问题就返回空 issues。"},
{role: "user", content: "" + charName + "\n\n\n" + md}
]);
var m = r.content.match(/\{[\s\S]*\}/);
// 模型没按 JSON 返回 ≠ 审计通过。旧代码返回 pass:true, 于是"审计失败"在界面上显示成"✅ 全员通过"。
if(!m) return {issues: [], pass: null, status: "unparsed", error: "审计结果不是 JSON"};
var obj = JSON.parse(m[0]);
var result = {
issues: obj.issues || [],
pass: obj.pass!== false &&!(obj.issues || []).some(function(i){ return i.severity === "high";}),
status: "ok",
audited_at: Date.now()
};
// 存审计结果
try{
var all = DISTILL_PACKAGE.getData(pkgId, "audits") || {};
all[charName] = result;
DISTILL_PACKAGE.saveData(pkgId, "audits", all);
}catch(e){}
return result;
}catch(e){
// fail-open 会让"LLM 全挂"显示成"✅ 全员通过", 这里必须区分"通过"与"未完成"
return {issues: [], pass: null, status: "error", error: e.message};
}
}

async function auditAll(pkgId, charNames, opts){
opts = opts || {};
var onProgress = opts.onProgress || function(){};
var results = {};
/* 内层 audit() 的进度是纯字符串口径（"审计 X..."），与 UI 的 (i, n, msg) 三参口径不同：
 * opts 原样透传会让内层那句覆盖进度行、序号/总数印成 undefined（2026-11-02 截图）。
 * auditAll 自己已逐人报进度，转交时摘掉 onProgress。 */
var innerOpts = Object.assign({}, opts, {onProgress: function(){}});
for(var i = 0; i < charNames.length; i++){
onProgress(i + 1, charNames.length, "审计 " + charNames[i]);
results[charNames[i]] = await audit(pkgId, charNames[i], innerOpts);
}
return results;
}

/* 审计问题 → 改动单请求文本（纯函数，可测）。
 * 审计结果此前只写不读：审完关掉页面等于白审。UI 的「按此修订」按钮
 * 拿这段文本走 DISTILL_CHANGE.proposeChange 生成修订提案，用户确认后落卡。 */
function fixRequest(issue){
issue = issue || {};
var parts = ["修订审计发现的问题"];
var tag = [issue.type, issue.severity].filter(Boolean).join("/");
if(tag) parts[0] += "（" + tag + "）";
parts[0] += "：" + (issue.desc || "");
var req = parts[0];
if(issue.field) req += "（审计定位字段：" + issue.field + "）";
req += "。请只针对这一问题修订相关字段，消除矛盾或过度推断，保持档案其余设定与原文实证不变。";
return req;
}

return {
audit: audit,
auditAll: auditAll,
fixRequest: fixRequest
};
})();
