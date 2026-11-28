/* 世界书生成 (2026-10-07): 借鉴 TavernWeave + dama-cyber。
* 从小说正文提取世界观规则、重要场景、势力组织。
* 每条规则 7 字段 (dama-cyber): 规则/代价/限制/例外/剧情用途/升级路径/冲突钩子
* 冲突钩子天然链接到关系边。
*/
var DISTILL_WORLDBOOK = (function(){
"use strict";

// 从 chunk 梗概中提取世界书条目
async function extractWorldbook(summaries, characters, opts){
opts = opts || {};
var onProgress = opts.onProgress || function(){};
var shouldPause = opts.shouldPause || function(){ return false;};

// 合并所有梗概的文本，取关键信息 (events 已结构化, 取 event 文本兼容旧字符串)
var allText = summaries.map(function(s){
return "" + (s.events || []).map(function(e){ return typeof e === "string" ? e : ((e && e.event) || ""); }).join("；");
}).join("\n").slice(0, 12000);

onProgress(0, 1, "提取世界观...");
while(shouldPause()){
onProgress(0, 1, "已暂停…");
await new Promise(function(r){ setTimeout(r, 500);});
}

try{
var r = await DISTILL_LLM.chat([
{role: "system", content:
"你是小说世界观提取器。从剧情梗概中提取世界书条目。\n" +
"返回 JSON: {\n" +
" \"rules\": [{\"name\": \"规则名\", \"rule\": \"规则内容\", \"cost\": \"代价\", \"limit\": \"限制\", \"exception\": \"例外\", \"plot_use\": \"剧情用途\", \"conflict_hook\": \"哪个角色会因此产生冲突\", \"source\": \"来源chunk\"}],\n" +
" \"locations\": [{\"name\": \"地名\", \"desc\": \"描述\", \"source\": \"来源chunk\"}],\n" +
" \"factions\": [{\"name\": \"势力名\", \"desc\": \"描述\", \"members\": [\"成员\"], \"source\": \"来源chunk\"}]\n" +
"}\n" +
"只提取文本中明确提到或强烈暗示的，不要编造。没有就不返回空数组。"},
{role: "user", content: JSON.stringify({
characters: characters,
summaries: allText
})}
]);
var m = r.content.match(/\{[\s\S]*\}/);
if(!m) throw new Error("格式错误");
var obj = JSON.parse(m[0]);
return {
rules: obj.rules || [],
locations: obj.locations || [],
factions: obj.factions || [],
built: Date.now()
};
}catch(e){
onProgress(0, 1, "世界书提取失败: " + e.message);
return {rules: [], locations: [], factions: [], built: Date.now(), error: e.message};
}
}

// 世界书条目转 SillyTavern lorebook 格式 (复用)
// C6: Lorebook 触发条件 (Character.AI)
// 条目可按事件/地点/配角触发：trigger: {events:[], locations:[], characters:[]}
function matchTrigger(entry, context){
  context = context || {};
  var t = entry.trigger || {};
  // 无触发条件 = 常驻
  if(!t.events && !t.locations && !t.characters) return true;
  if(t.events && t.events.length){
    var hit = (context.events || []).some(function(e){
      return t.events.some(function(te){ return e.indexOf(te) >= 0 || te.indexOf(e) >= 0; });
    });
    if(!hit) return false;
  }
  if(t.locations && t.locations.length){
    var hit2 = (context.locations || []).some(function(l){
      return t.locations.indexOf(l) >= 0;
    });
    if(!hit2) return false;
  }
  if(t.characters && t.characters.length){
    var hit3 = (context.characters || []).some(function(c){
      return t.characters.indexOf(c) >= 0;
    });
    if(!hit3) return false;
  }
  return true;
}

function toLorebook(worldbook){
var entries = [];
(worldbook.rules || []).forEach(function(r, i){
entries.push({
key: [r.name],
content: r.rule +
(r.cost? "\n代价: " + r.cost: "") +
(r.limit? "\n限制: " + r.limit: "") +
(r.exception? "\n例外: " + r.exception: ""),
comment: r.name + (r.source? " [" + r.source + "]": "")
});
});
(worldbook.locations || []).forEach(function(l){
entries.push({
key: [l.name].concat(l.aliases || []),
content: l.desc +
(l.region? "\n所属: " + l.region: "") +
(l.controller? "\n归属: " + l.controller: "") +
(l.access? "\n出入: " + l.access: ""),
comment: l.name + (l.source? " [" + l.source + "]": "")
});
});
(worldbook.items || []).forEach(function(it){
entries.push({
key: [it.name].concat(it.aliases || []),
content: it.desc +
(it.rules? "\n规则: " + it.rules: "") +
(it.owner_chain && it.owner_chain.length? "\n持有人: " + it.owner_chain.join(" → "): "") +
(it.status? "\n现状: " + it.status: ""),
comment: it.name + (it.source? " [" + it.source + "]": "")
});
});
(worldbook.factions || []).forEach(function(f){
entries.push({
key: [f.name].concat(f.members || []),
content: f.desc,
comment: f.name + (f.source? " [" + f.source + "]": "")
});
});
return entries;
}

/* ── 地点志 + 关键物品册 (2026-11-28 蒸馏补强二期) ──────────────────
 * 旧 locations 是从梗概二手单次抽的 (输入截断 12k, 字段只有 name/desc)。
 * 新路径: 逐块从原文抽候选 (每条带逐字引文), 全书确定性合并——
 * 引文必须真在原文里 (证据门, 与角色发现同套路), 无证不入册。 */
var ENTITY_SYS = "你是小说世界实体抽取器。从这一段原文中抽取【关键地点】与【关键物品】。关键地点 = 有名字、反复出现或对剧情重要的场所; 关键物品 = 有名字或有特殊意义、被人物持有/争夺/使用的具体物件 (普通日用品不要)。每条必须给 evidence: 一句逐字摘自原文的引文 (不超过50字), 证明它确实存在且描写属实。返回 JSON: {\"locations\": [{\"name\": \"地名\", \"aliases\": [\"别称\"], \"desc\": \"环境/特征描写（一句话）\", \"region\": \"所属大区域（无则空）\", \"controller\": \"归属势力或人物（无则空）\", \"access\": \"出入条件或限制（无则空）\", \"evidence\": \"引文\"}], \"items\": [{\"name\": \"物品名\", \"desc\": \"形制描写（一句话）\", \"owner\": \"当前持有人（无则空）\", \"rules\": \"能力或禁忌（无则空）\", \"status\": \"完好/损毁/遗失/被夺/下落不明（判断不了写完好）\", \"evidence\": \"引文\"}]}。没有就返回空数组。只输出 JSON, 不要多余文字。";

function parseEntityJson(content){
  var m = String(content || "").match(/\{[\s\S]*\}/);
  if(!m) return null;
  try{ return JSON.parse(m[0]); }catch(e){ return null; }
}

async function extractEntitiesFromChunk(chunk, opts){
  opts = opts || {};
  var r = await DISTILL_LLM.chat([
    {role: "system", content: ENTITY_SYS},
    {role: "user", content: JSON.stringify({chunk_id: chunk.id, text: chunk.text})}
  ]);
  var obj = parseEntityJson(r.content) || {};
  return {chunk_id: chunk.id, locations: obj.locations || [], items: obj.items || []};
}

/* 确定性合并: 按名/别名归组; 证据门先行 (引文不在原文的候选直接丢)。 */
function mergeEntities(perChunk, fullText){
  var normText = (fullText || "").replace(/\s+/g, "");
  function evOk(ev){
    var e = String(ev || "").replace(/\s+/g, "");
    return !!e && normText.indexOf(e) >= 0;
  }
  var locs = [], locByKey = {};
  var items = [], itemByKey = {};
  function findGroup(list, byKey, name, aliases){
    if(byKey[name]) return byKey[name];
    for(var i = 0; i < list.length; i++){
      var g = list[i];
      if(g.aliases.indexOf(name) >= 0) return g;
      if((aliases || []).indexOf(g.name) >= 0) return g;
    }
    return null;
  }
  (perChunk || []).forEach(function(pc){
    (pc.locations || []).forEach(function(l){
      if(!l || !l.name || !evOk(l.evidence)) return;
      var g = findGroup(locs, locByKey, l.name, l.aliases);
      if(!g){
        g = {name: l.name, aliases: [], desc: "", region: "", controller: "", access: "",
             first_chunk: pc.chunk_id, freq: 0, source: pc.chunk_id};
        locs.push(g); locByKey[g.name] = g;
      }
      if(l.name !== g.name && g.aliases.indexOf(l.name) < 0) g.aliases.push(l.name);
      (l.aliases || []).forEach(function(a){ if(a && a !== g.name && g.aliases.indexOf(a) < 0) g.aliases.push(a); });
      if(l.desc && l.desc.length > (g.desc || "").length) g.desc = l.desc;
      if(!g.region && l.region) g.region = l.region;
      if(!g.controller && l.controller) g.controller = l.controller;
      if(!g.access && l.access) g.access = l.access;
      g.freq++;
    });
    (pc.items || []).forEach(function(it){
      if(!it || !it.name || !evOk(it.evidence)) return;
      var g = findGroup(items, itemByKey, it.name, it.aliases);
      if(!g){
        g = {name: it.name, aliases: [], desc: "", owner_chain: [], rules: "",
             status: "完好", first_chunk: pc.chunk_id, freq: 0, source: pc.chunk_id};
        items.push(g); itemByKey[g.name] = g;
      }
      if(it.name !== g.name && g.aliases.indexOf(it.name) < 0) g.aliases.push(it.name);
      (it.aliases || []).forEach(function(a){ if(a && a !== g.name && g.aliases.indexOf(a) < 0) g.aliases.push(a); });
      if(it.desc && it.desc.length > (g.desc || "").length) g.desc = it.desc;
      if(!g.rules && it.rules) g.rules = it.rules;
      if(it.owner && g.owner_chain[g.owner_chain.length - 1] !== it.owner) g.owner_chain.push(it.owner);
      if(it.status) g.status = it.status;
      g.freq++;
    });
  });
  return {locations: locs, items: items};
}

/* 完整版世界书: 规则/势力走旧梗概路径, 地点/物品走逐块原文+证据门合并。
 * 实体抽取整体失败时回落旧 locations, 不让世界书阶段归零。 */
async function extractWorldbookFull(summaries, characters, chunks, opts){
  opts = opts || {};
  var onProgress = opts.onProgress || function(){};
  var base = await extractWorldbook(summaries, characters, opts);
  if(!chunks || !chunks.length) return base;
  try{
    var perChunk = [];
    for(var i = 0; i < chunks.length; i++){
      if(opts.shouldAbort && opts.shouldAbort()) break;
      while(opts.shouldPause && opts.shouldPause())
        await new Promise(function(r){ setTimeout(r, 500); });
      onProgress("地点/物品抽取 " + (i + 1) + "/" + chunks.length);
      try{ perChunk.push(await extractEntitiesFromChunk(chunks[i], opts)); }
      catch(e){ perChunk.push({chunk_id: chunks[i].id, locations: [], items: []}); }
    }
    var fullText = chunks.map(function(c){ return c.text || ""; }).join("\n");
    var merged = mergeEntities(perChunk, fullText);
    if(merged.locations.length) base.locations = merged.locations;
    base.items = merged.items;
  }catch(e){
    base.items = base.items || [];
  }
  return base;
}

return {
extractWorldbook: extractWorldbook,
extractWorldbookFull: extractWorldbookFull,
extractEntitiesFromChunk: extractEntitiesFromChunk,
mergeEntities: mergeEntities,
toLorebook: toLorebook,
matchTrigger: matchTrigger
};
})();
