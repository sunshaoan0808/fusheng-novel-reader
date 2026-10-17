/* App 端蒸馏核心 (2026-10-07): 移植自 novel-distill。
 * 流程: chunks -> 每人物每块蒸馏 -> 合并档案。
 * 为手机优化: 简化字段, 流式进度, localStorage 断点续跑。
 */
var DISTILL_CORE = (function(){
"use strict";

/* 画像字段唯一来源: 提示词、合并、质量门三处都从这里取,
 * 避免"提示词产出 8 个字段、质量门按 17 个算完整度"这类口径漂移。 */
var FIELD_SPEC = [
  ["core_identity", "一句话身份定位"],
  ["core_traits", "核心性格特征 (逗号分隔, 最多5个)"],
  ["speech_style", "说话方式描述"],
  ["typical_lines", "典型台词 (最多3句, 每句40字内)"],
  ["background", "背景经历摘要"],
  ["soul_goal", "核心追求"],
  ["key_bonds", "关键人物关系 (逗号分隔)"],
  ["evidence", "关键证据原文引用 (最多3条)"]
];
var PROFILE_FIELDS = FIELD_SPEC.map(function(f){ return f[0]; });

var SYSTEM_PROMPT = `你是小说人物档案蒸馏器。从小说正文片段中提取指定人物的结构化档案。

## 输出格式 (Markdown)
${FIELD_SPEC.map(function(f){ return "- " + f[0] + ": " + f[1]; }).join("\n")}

## 来源标注 (四态, 借鉴 TavernWeave)
每个事实后必须标注来源状态:
- [canon:chunk_id] 原文有直接证据 (如: "黛玉葬花" [canon:ch003])
- [ref:chunk_id] 间接/旁证 (他人转述、侧面描写)
- [inference:chunk_id] 基于原文的合理推断 (需有依据, 不能凭空编)
- [unknown] 原文无依据, 不写内容, 字段留空

## 规则
1. 优先写 [canon], 其次 [ref], 谨慎用 [inference]
2. 证据不足的字段留空, 不写"未知"等占位词
3. 禁止编造原文没有的情节、人名、对话
4. 引用核验只能证明原句存在, 不能自动证明结论正确 —— 推断要保守
`;

async function distillOne(chunk, character, onProgress){
  // 摘录上限与分块上限保持一致 (DISTILL_CHUNK.MAX_CHARS): 块长超过上限时
  // 每块尾部会被永久丢弃, 且相邻块之间留下盲区——不报错, 只是"某情节没记住"。
  var cap = (typeof DISTILL_CHUNK !== "undefined" && DISTILL_CHUNK.MAX_CHARS) || 6000;
  var user = JSON.stringify({
    excerpt: chunk.text.slice(0, cap),
    chunk_id: chunk.id,
    character: character
  }, null, 1);
  var r = await DISTILL_LLM.chat([
    {role: "system", content: SYSTEM_PROMPT},
    {role: "user", content: user}
  ]);
  return {md: r.content, chunkId: chunk.id, character: character, stage: chunk.stage || "mid"};
}

function parseProfile(md){
  // 简单解析 md 为字段对象
  var fields = {};
  var lines = md.split("\n");
  var curKey = null, curVal = [];
  for(var i = 0; i < lines.length; i++){
    var m = lines[i].match(/^-\s*\*\*([a-z_]+)\*\*:\s*(.*)$/) ||
            lines[i].match(/^-\s*([a-z_]+):\s*(.*)$/);
    if(m){
      if(curKey) fields[curKey] = curVal.join("\n").trim();
      curKey = m[1]; curVal = [m[2]];
    }else if(curKey){
      curVal.push(lines[i]);
    }
  }
  if(curKey) fields[curKey] = curVal.join("\n").trim();
  return fields;
}

function mergeProfiles(profileList){
  // 合并多块的档案: 按阶段分组, 每阶段取最长非空值 (防剧透)
  var merged = {};
  var byStage = {early: [], mid: [], late: []};
  profileList.forEach(function(p){
    var st = p.stage || "mid";
    if(byStage[st]) byStage[st].push(p);
  });
  var keys = PROFILE_FIELDS.concat(["brief_intro", "appearance", "relationships_summary",
    "key_events", "arc_summary", "age", "gender", "height", "ethnicity",
    "likes", "dislikes", "interests", "fears"]);
  ["early", "mid", "late"].forEach(function(st){
    merged[st] = {};
    keys.forEach(function(k){
      var best = "";
      byStage[st].forEach(function(p){
        var v = (p.fields[k] || "").trim();
        if(v.length > best.length) best = v;
      });
      merged[st][k] = best;
    });
  });
  // 兼容: 顶层为全量合并 (取 late)
  keys.forEach(function(k){ merged[k] = merged.late[k] || merged.mid[k] || merged.early[k] || ""; });
  return merged;
}

/* 命中判据: 正名 或 该正名的任一别名 出现在正文。
 * 中文小说正文大量用简称("黛玉"而非"林黛玉"), 只按正名 indexOf 会整章跳过。
 * 单字别名一律忽略——"玉""林"这类在全书中出现率太高, 会造成误命中。 */
function buildAliasIndex(aliasMap){
  var idx = {};
  Object.keys(aliasMap || {}).forEach(function(alias){
    var canon = aliasMap[alias];
    if(!alias || !canon || alias === canon) return;
    if(alias.length < 2) return;
    if(!idx[canon]) idx[canon] = [];
    if(idx[canon].indexOf(alias) < 0) idx[canon].push(alias);
  });
  return idx;
}

function appearsIn(text, charName, aliasIndex){
  if(text.indexOf(charName) >= 0) return true;
  var al = aliasIndex[charName];
  if(!al) return false;
  for(var i = 0; i < al.length; i++){
    if(text.indexOf(al[i]) >= 0) return true;
  }
  return false;
}

async function distillNovel(chunks, characters, opts){
  opts = opts || {};
  var onProgress = opts.onProgress || function(){};
  var checkpoint = opts.checkpoint || {};
  var shouldPause = opts.shouldPause || function(){ return false; };
  var aliasIndex = buildAliasIndex(opts.aliasMap);
  async function waitPause(){
    while(shouldPause()){
      onProgress(done, total, "已暂停…");
      await new Promise(function(r){ setTimeout(r, 500); });
    }
  }
  var results = {};
  var total = chunks.length * characters.length;
  var done = 0;

  for(var ci = 0; ci < chunks.length; ci++){
    var chunk = chunks[ci];
    for(var hi = 0; hi < characters.length; hi++){
      await waitPause();
      var ch = characters[hi];
      var key = chunk.id + "|" + ch;
      if(checkpoint[key]){
        done++;
        continue;
      }
      // 只蒸馏本块出现的人物 (正名或其别名出现在正文)
      if(!appearsIn(chunk.text, ch, aliasIndex)){
        done++;
        onProgress(done, total, "跳过 " + ch + " @ " + chunk.id + " (未出现)");
        continue;
      }
      onProgress(done, total, "蒸馏 " + ch + " @ " + chunk.id);
      try{
        var r = await distillOne(chunk, ch);
        var fields = parseProfile(r.md);
        if(!results[ch]) results[ch] = [];
        results[ch].push({fields: fields, chunkId: chunk.id, md: r.md, stage: r.stage});
        checkpoint[key] = true;
        if(opts.onCheckpoint) opts.onCheckpoint(checkpoint);
      }catch(e){
        onProgress(done, total, "失败 " + ch + " @ " + chunk.id + ": " + e.message);
      }
      done++;
    }
  }

  // 合并
  var final = {};
  characters.forEach(function(ch){
    if(results[ch] && results[ch].length){
      final[ch] = {
        fields: mergeProfiles(results[ch]),
        chunks: results[ch].length,
        details: results[ch]
      };
    }
  });
  return final;
}

return {
  distillOne: distillOne,
  distillNovel: distillNovel,
  parseProfile: parseProfile,
  buildAliasIndex: buildAliasIndex,
  appearsIn: appearsIn,
  PROFILE_FIELDS: PROFILE_FIELDS,
  SYSTEM_PROMPT: SYSTEM_PROMPT
};
})();
