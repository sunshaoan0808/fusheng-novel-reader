/* App 端关系抽取 (2026-10-07): 移植自 novel-distill/novel_distill/relations.py。
 * 规则层: 同句共现 + 前向3句内明确交互。LLM 丰富化: 核心角色对提炼关系。
 */
var DISTILL_RELATIONS = (function(){
"use strict";

/* "明确交互"判据: 原来 DIALOG_MARK 含单字 说/道/问/答/笑/应/叹，
 * 而"道"同时是"知道/道路/道理"——窗口里只要出现一个"道"字，
 * 任意两个共现人物就被记成一次明确交互，直接进 strong 档。
 * 实测 50k 字 12 条边全是 strong，三档失去区分力。
 * 现在只认多字言语动词、具体动作、或对话引号。 */
var QUOTE_MARK = /[“”"]/;
var SPEECH_VERB = /(说道|问道|答道|笑道|叫道|喊道|骂道|叹道|应道|斥道|低声道|大声道|开口道|回答|反问|插嘴|补充道|解释道|喃喃|嘀咕|低语)/;
var ACTION_MARK = /(拉住|抱住|推开|递给|搀|扶住|亲吻|拥抱|抓住|握住|拽住|揪住|拍了拍|摸了摸|对视|相视|点头|摇头)/;

function hasExplicitInteraction(text){
  if(!text) return false;
  return SPEECH_VERB.test(text) || ACTION_MARK.test(text) || QUOTE_MARK.test(text);
}

function sentencesOf(text){
  return text.split(/(?<=[。！？…])|(?<=\n)/).map(function(s){ return s.trim(); }).filter(Boolean);
}

function findMentions(sent, nameToCanon){
  var found = {};
  Object.keys(nameToCanon).forEach(function(surface){
    if(surface && sent.indexOf(surface) >= 0) found[nameToCanon[surface]] = true;
  });
  return Object.keys(found);
}

function extractPairs(chunks, characters, aliasMap, opts){
  opts = opts || {};
  var window = opts.forwardWindow || 3;
  var minCo = opts.minCooccur || 2;
  var minCh = opts.minChapters || 3;  // C2: ≥3 chunk 才算 strong

  var nameToCanon = {};
  Object.keys(aliasMap || {}).forEach(function(a){ nameToCanon[a] = aliasMap[a]; });
  characters.forEach(function(c){ if(!nameToCanon[c]) nameToCanon[c] = c; });
  var core = {};
  characters.forEach(function(c){ core[c] = true; });

  var pairHits = {};
  chunks.forEach(function(ch){
    var sents = sentencesOf(ch.text);
    var mentions = sents.map(function(s){ return findMentions(s, nameToCanon); });
    for(var i = 0; i < mentions.length; i++){
      var mi = mentions[i];
      // 同句共现
      var ms = mi.slice().sort();
      for(var x = 0; x < ms.length; x++){
        for(var y = x + 1; y < ms.length; y++){
          var key = ms[x] + "|" + ms[y];
          var e = pairHits[key] || (pairHits[key] = {count: 0, chapters: {}, evidence: []});
          e.count++;
          e.chapters[ch.id] = true;
          if(e.evidence.length < 6) e.evidence.push(sents[i].slice(0, 200));
        }
      }
      // 前向窗口: 明确交互才算
      for(var j = 1; j <= window; j++){
        if(i + j >= sents.length) break;
        var mj = mentions[i + j];
        if(!mi.length || !mj.length) continue;
        var winText = sents.slice(i, i + j + 1).join("");
        if(!hasExplicitInteraction(winText)) continue;
        mi.forEach(function(a){
          mj.forEach(function(b){
            if(a === b) return;
            var k = [a, b].sort().join("|");
            var e2 = pairHits[k] || (pairHits[k] = {count: 0, chapters: {}, evidence: []});
            e2.count++;
            e2.chapters[ch.id] = true;
            if(e2.evidence.length < 6) e2.evidence.push(winText.slice(0, 300));
          });
        });
      }
    }
  });

  // D2: 计算阶段边界 (按chunk位置三等分)
  var chunkIds = chunks.map(function(c){ return c.id; });
  var n = chunkIds.length;
  function stageOf(chunkId){
    var i = chunkIds.indexOf(chunkId);
    if(i < 0) return "unknown";
    if(i < n / 3) return "early";
    if(i < n * 2 / 3) return "mid";
    return "late";
  }

  var edges = [];
  Object.keys(pairHits).sort(function(a, b){ return pairHits[b].count - pairHits[a].count; }).forEach(function(key){
    var parts = key.split("|");
    var a = parts[0], b = parts[1];
    var e = pairHits[key];
    var bothCore = core[a] && core[b];
    if(!bothCore && e.count < minCo) return;
    var chaps = Object.keys(e.chapters).sort();
    // C2: 三档佐证 (dama-cyber: 单chunk孤证降级)
    var level = "isolated";
    if(chaps.length >= minCh) level = "strong";
    else if(chaps.length >= 2) level = "weak";
    edges.push({
      source_character: a,
      target_character: b,
      co_occurrence_count: e.count,
      valid_chapters: chaps.length ? [chaps[0], chaps[chaps.length - 1]] : [],
      corroboration: {chapters: chaps.length, level: level},
      _evidence: e.evidence,
      _both_core: bothCore,
      _isolated: level === "isolated",  // C2: 孤证标记
      // D2: 有效阶段
      valid_stages: (function(){
        var s = {};
        chaps.forEach(function(c){ s[stageOf(c)] = 1; });
        delete s.unknown;
        return Object.keys(s).sort();
      })()
    });
  });
  return edges;
}

var REL_SYS_ONE = "你是关系分析器。根据共现证据提炼人物关系。返回 JSON: {\"relation\": \"关系类型\", \"summary\": \"一句话总结\", \"affinity\": -10到10}";
var REL_SYS_BATCH = "你是关系分析器。为给定的每一对人物分别提炼关系。返回 JSON: {\"edges\":[{\"a\":\"甲\",\"b\":\"乙\",\"relation\":\"关系类型\",\"summary\":\"一句话总结\",\"affinity\":-10到10}]}。必须为每一对都给出结果，不要合并、不要遗漏。";

// 单条丰富（批量解析失败或只有一条时的兜底）
async function enrichOne(e){
  try{
    var r = await DISTILL_LLM.chat([
      {role: "system", content: REL_SYS_ONE},
      {role: "user", content: JSON.stringify({a: e.source_character, b: e.target_character, evidence: e._evidence.slice(0, 3)})}
    ]);
    var m = r.content.match(/\{[\s\S]*\}/);
    if(m){
      var d = JSON.parse(m[0]);
      e.relation = d.relation || "";
      e.summary = d.summary || "";
      e.affinity = d.affinity || 0;
    }
  }catch(err){}
  return e;
}

/* 一批边一次调用。66 条边原来是 66 次请求，每条的输入才 300 字——
 * 纯属把 RTT 和 system prompt 重复付了 66 遍。 */
async function enrichGroup(group){
  var payload = {pairs: group.map(function(e){
    return {a: e.source_character, b: e.target_character, evidence: (e._evidence || []).slice(0, 3)};
  })};
  var r;
  try{
    r = await DISTILL_LLM.chat([
      {role: "system", content: REL_SYS_BATCH},
      {role: "user", content: JSON.stringify(payload)}
    ], {maxTokens: Math.min(4000, 300 + 260 * group.length)});
  }catch(e){ return false; }
  var s = String(r.content || "");
  var a = s.indexOf("{"), b = s.lastIndexOf("}");
  if(a < 0 || b <= a) return false;
  var obj = null;
  try{ obj = JSON.parse(s.slice(a, b + 1)); }catch(e){ return false; }
  var list = obj && obj.edges;
  if(!Array.isArray(list)) return false;
  var byKey = {};
  list.forEach(function(it){
    if(!it || !it.a || !it.b) return;
    byKey[[it.a, it.b].sort().join("|")] = it;
  });
  var missing = 0;
  group.forEach(function(e){
    var k = [e.source_character, e.target_character].sort().join("|");
    var d = byKey[k];
    if(!d){ missing++; return; }
    e.relation = d.relation || "";
    e.summary = d.summary || "";
    e.affinity = d.affinity || 0;
  });
  return missing === 0;
}

async function enrichEdges(edges, onProgress, opts){
  // LLM 丰富化核心角色对
  opts = opts || {};
  var shouldPause = opts.shouldPause || function(){ return false; };
  var shouldAbort = opts.shouldAbort || function(){ return false; };
  var batchSize = Math.max(1, Math.min(parseInt(opts.batchSize, 10) || 8, 20));
  // 续跑时已丰富过的边不重复请求
  var pending = edges.filter(function(e){ return e._both_core && !e.relation; });
  var processed = 0;
  for(var i = 0; i < pending.length; i += batchSize){
    while(shouldPause() && !shouldAbort()){
      if(onProgress) onProgress(processed, pending.length, "已暂停…");
      await new Promise(function(r){ setTimeout(r, 500); });
    }
    if(shouldAbort()) break;
    var group = pending.slice(i, i + batchSize);
    if(onProgress) onProgress(processed, pending.length,
      "丰富关系 " + (i + 1) + "-" + (i + group.length) + "/" + pending.length);
    if(group.length === 1){
      await enrichOne(group[0]);
    }else if(!(await enrichGroup(group))){
      // 整批没解析出来（或漏了对），逐条兜底，宁可慢也不能留空
      for(var k = 0; k < group.length; k++){
        await enrichOne(group[k]);
        if(shouldAbort()) break;
      }
    }
    processed += group.length;
  }
  return edges;
}

return {
  extractPairs: extractPairs,
  enrichEdges: enrichEdges,
  sentencesOf: sentencesOf,
  hasExplicitInteraction: hasExplicitInteraction
};
})();
