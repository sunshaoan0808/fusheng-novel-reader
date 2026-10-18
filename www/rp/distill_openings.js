/* 开场白生成 (2026-10-07): 对标 Python openings.py。
* 按人物档案 LLM 生成真开场白 (first_mes + alternate_greetings)。
* 每条 2-4 句，情境各异，不替玩家行动。
* 失败时返回空，不阻断。
*/
var DISTILL_OPENINGS = (function(){
"use strict";

async function generateOpenings(charName, profileFields, opts){
opts = opts || {};
var n = opts.n || 3;
var onProgress = opts.onProgress || function(){};
var shouldPause = opts.shouldPause || function(){ return false;};

// 档案文本
var md = profileText(profileFields, 6000);

if(!md.trim()) return [];

onProgress("生成开场白 " + charName + "...");
while(shouldPause()){
onProgress("已暂停…");
await new Promise(function(r){ setTimeout(r, 500);});
}

try{
var r = await DISTILL_LLM.chat([
{role: "system", content:
"你是角色扮演开场白写手。根据人物档案，为角色写 " + n + " 条开场白。\n" +
"要求：\n" +
"1. 每条 2-4 句，第一人称或第三人称叙述+对话\n" +
"2. 每条情境不同（初见/日常/冲突/独处等）\n" +
"3. 绝对不要替玩家行动，不要写玩家说什么做什么\n" +
"4. 符合人物性格和说话风格\n" +
"返回 JSON: {\"openings\": [{\"situation\": \"情境标签\", \"text\": \"开场白正文\"}]}"},
{role: "user", content: "" + charName + "\n\n\n" + md}
]);
var m = r.content.match(/\{[\s\S]*\}/);
if(!m) return [];
var obj = JSON.parse(m[0]);
return (obj.openings || []).slice(0, n).map(function(o){
return {situation: o.situation || "", text: o.text || ""};
}).filter(function(o){ return o.text;});
}catch(e){
onProgress("开场白生成失败: " + e.message);
return [];
}
}

/* 档案 → prompt 文本（剥掉四态标注、跳过分层对象） */
function profileText(fields, limit){
var md = Object.keys(fields || {}).map(function(k){
var v = fields[k];
/* early/mid/late 是分层对象，不是字段值。旧实现走 "" + v 会拼出字面的
   "[object Object]" 混进 prompt；这里直接跳过非字符串。 */
if(typeof v !== "string") return "";
v = v.replace(/\[(canon|ref|inference|unknown)(:[a-z0-9_\-]+)?\]/gi, "").trim();
return v ? (k + ": " + v) : "";
}).filter(Boolean).join("\n");
return md.slice(0, limit || 6000);
}

/* 多人一次生成。开场白最讲人物口吻，一次给太多人容易"串味"，
 * 所以默认 3 人一批，而且每个角色单独一个 profile 端口。 */
async function generateBatch(items, n){
var payload = {characters: items.map(function(it){
return {name: it.name, profile: profileText(it.fields, 1200)};
})};
payload.openings_per_character = n;
var r = await DISTILL_LLM.chat([
{role: "system", content:
"你是角色扮演开场白写手。给定多个角色的档案，为**每个角色**各写 " + n + " 条开场白。\n" +
"要求：\n" +
"1. 每个角色只用他自己的身份/性格/说话风格，严禁把别的角色的语气或台词混进来\n" +
"2. 每条 2-4 句，第一人称或第三人称叙述+对话\n" +
"3. 同一角色的几条情境要不同（初见/日常/冲突/独处等）\n" +
"4. 绝对不要替玩家行动，不要写玩家说什么做什么\n" +
"返回 JSON: {\"openings\":{\"角色名\":[{\"situation\": \"情境标签\", \"text\": \"开场白正文\"}]}}"},
{role: "user", content: JSON.stringify(payload)}
], {maxTokens: Math.min(6000, 400 + 700 * items.length)});
var s = String(r.content || "");
var a = s.indexOf("{"), b = s.lastIndexOf("}");
if(a < 0 || b <= a) return null;
var obj = null;
try{ obj = JSON.parse(s.slice(a, b + 1)); }catch(e){ return null; }
var map = obj && obj.openings;
if(!map || typeof map !== "object") return null;
var out = {};
items.forEach(function(it){
var v = map[it.name];
if(v == null){
Object.keys(map).forEach(function(k){
if(!v && k.replace(/[\s“”"'《》]/g, "") === it.name.replace(/[\s“”"'《》]/g, "")) v = map[k];
});
}
if(!Array.isArray(v)) return;
var list = v.slice(0, n).map(function(o){
if(typeof o === "string") return {situation: "", text: o};
return {situation: (o && o.situation) || "", text: (o && o.text) || ""};
}).filter(function(o){ return o.text; });
if(list.length) out[it.name] = list;
});
return out;
}

// 为多个角色生成：分批 + 并发。原来是一人一次串行，12 人就是 12 个来回。
async function generateAll(pkgId, charNames, opts){
opts = opts || {};
var onProgress = opts.onProgress || function(){};
var shouldPause = opts.shouldPause || function(){ return false;};
var shouldAbort = opts.shouldAbort || function(){ return false;};
var n = opts.n || 3;
var batchSize = Math.max(1, Math.min(parseInt(opts.batchSize, 10) || 3, 6));
var concurrency = Math.max(1, Math.min(parseInt(opts.concurrency, 10) || 3, 8));

var items = [];
charNames.forEach(function(name){
var card = DISTILL_PACKAGE.getCharacterCard(pkgId, name);
if(card) items.push({name: name, card: card, fields: card._distill || {}});
});
var total = items.length;
var doneTotal = 0, result = {};
async function gate(){
while(shouldPause() && !shouldAbort()){
onProgress(doneTotal, total, "已暂停…");
await new Promise(function(r){ setTimeout(r, 500);});
}
}

function save(name, card, openings){
if(!openings || !openings.length) return;
result[name] = openings;
try{
var all = DISTILL_PACKAGE.getData(pkgId, "openings") || {};
all[name] = openings;
DISTILL_PACKAGE.saveData(pkgId, "openings", all);
card.first_mes = openings[0].text;
card.alternate_greetings = openings.slice(1).map(function(o){ return o.text;});
DISTILL_PACKAGE.saveCharacterCard(pkgId, name, card);
}catch(e){}
}

var batches = [];
for(var i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));

async function runGroup(group){
await gate();
if(shouldAbort() || !group.length) return;
onProgress(doneTotal, total, "开场白 " + group.map(function(g){ return g.name; }).join("、"));
var map = null;
if(group.length > 1){
try{ map = await generateBatch(group, n); }catch(e){ map = null; }
}
var miss = [];
group.forEach(function(it){
var got = map && map[it.name];
if(got && got.length) save(it.name, it.card, got);
else miss.push(it);
});
// 批量漏了或者整批解析失败 → 单个补（每条只几百字，代价可控）
for(var k = 0; k < miss.length; k++){
if(shouldAbort()) break;
try{
var one = await generateOpenings(miss[k].name, miss[k].fields, {n: n, shouldPause: shouldPause});
if(one && one.length) save(miss[k].name, miss[k].card, one);
}catch(e){}
}
doneTotal += group.length;
}

var cursor = 0;
async function worker(){
while(!shouldAbort()){
var g = batches[cursor++];
if(!g) return;
await runGroup(g);
}
}
var pool = [];
for(var w = 0; w < Math.min(concurrency, batches.length); w++) pool.push(worker());
await Promise.all(pool);
return result;
}

// M3: 动态开场白
async function generateDynamic(pkgId, name, context){
  context = context || {};
  var card = DISTILL_PACKAGE.getCharacterCard(pkgId, name);
  if(!card || !card._distill) throw new Error("角色卡不存在");
  var d = card._distill;
  var ctxDesc = [];
  if(context.stage) ctxDesc.push("阶段:" + context.stage);
  if(context.persona) ctxDesc.push("用户身份:" + context.persona);
  try{
    var r = await DISTILL_LLM.chat([
      {role: "system", content: "你是" + name + "。\n身份:" + (d.core_identity||"") + "\n性格:" + (d.core_traits||"") + "\n" + (ctxDesc.length ? ctxDesc.join(";") + "\n" : "") + "生成一句开场白，第一人称50字内，只输出本身。"},
      {role: "user", content: "开场白"}
    ]);
    return r.content.trim();
  }catch(e){
    var all = {};
    try{ all = DISTILL_PACKAGE.getData(pkgId, "openings") || {}; }catch(e2){}
    var ops = all[name] || [];
    return ops.length ? ops[0].text : "";
  }
}

return {
generateOpenings: generateOpenings,
generateAll: generateAll,
generateDynamic: generateDynamic
};
})();
