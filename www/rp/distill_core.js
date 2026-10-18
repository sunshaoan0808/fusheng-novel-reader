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

/* 批量模式: 一次调用产出该块出现的所有角色。
 * 原来同一段正文要按角色重复发 N 遍（N=角色数），输入里 90%+ 是重复正文。 */
var BATCH_SYSTEM_PROMPT = `你是小说人物档案蒸馏器。从小说正文片段中提取**给定人物列表**中每个人物的结构化档案。

## 输出格式 (严格 JSON, 不要代码块, 不要解释)
{"characters":{"人物名":{"core_identity":"","core_traits":"","speech_style":"","typical_lines":"","background":"","soul_goal":"","key_bonds":"","evidence":""}}}

## 规则
1. 只输出给定列表里的人物，不新增、不改名
2. 列表里每个人物都必须出现在 characters 里；正文没写的字段给空字符串
3. 每个事实后标注来源: [canon:chunk_id] 原文直证 / [ref:chunk_id] 旁证 / [inference:chunk_id] 合理推断 / [unknown] 无依据
4. 禁止编造原文没有的情节、人名、对话
5. core_traits 用逗号分隔最多 5 个词；typical_lines 最多 3 句且每句 40 字内
`;

async function distillMany(chunk, names){
  var cap = (typeof DISTILL_CHUNK !== "undefined" && DISTILL_CHUNK.MAX_CHARS) || 6000;
  var user = JSON.stringify({
    excerpt: chunk.text.slice(0, cap),
    chunk_id: chunk.id,
    characters: names
  }, null, 1);
  var r = await DISTILL_LLM.chat([
    {role: "system", content: BATCH_SYSTEM_PROMPT},
    {role: "user", content: user}
  ], {maxTokens: Math.min(8000, 600 + 500 * names.length)});
  return {raw: r.content, chunkId: chunk.id, stage: chunk.stage || "mid"};
}

/* 从模型输出里抠 JSON 并归一成 {角色名: {字段: 字符串}}。
 * 解析失败返回 null，由调用方回退到逐人调用——宁可慢，也不能整块静默丢档案。 */
function parseBatch(raw, names){
  var s = String(raw || "").replace(/```json/gi, "```").trim();
  var a = s.indexOf("{"), b = s.lastIndexOf("}");
  if(a < 0 || b <= a) return null;
  var obj = null;
  try{ obj = JSON.parse(s.slice(a, b + 1)); }catch(e){ return null; }
  var map = obj && obj.characters ? obj.characters : null;
  if(!map || typeof map !== "object") return null;
  var out = {};
  names.forEach(function(name){
    var v = map[name];
    if(v == null && name.indexOf(" ") < 0){
      // 模型偶尔会加书名号/引号或空白，做一次宽松匹配
      Object.keys(map).forEach(function(k){
        if(!v && k.replace(/[\s“”"'《》]/g, "") === name.replace(/[\s“”"'《》]/g, "")) v = map[k];
      });
    }
    if(v == null) return;
    if(typeof v === "string"){
      // 有的模型会把整个档案写成字符串，尝试再解析一次
      var t = v.indexOf("{"), u = v.lastIndexOf("}");
      if(t >= 0 && u > t){ try{ v = JSON.parse(v.slice(t, u + 1)); }catch(e2){ v = {core_identity: v}; } }
      else v = {core_identity: v};
    }
    var fields = {};
    PROFILE_FIELDS.forEach(function(k){
      var val = v[k];
      if(val == null) return;
      if(Array.isArray(val)) val = val.join("\n");
      else if(typeof val === "object") val = "";
      fields[k] = String(val).trim();
    });
    if(Object.keys(fields).length) out[name] = fields;
  });
  return out;
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
  var shouldAbort = opts.shouldAbort || function(){ return false; };
  var aliasIndex = buildAliasIndex(opts.aliasMap);
  async function waitPause(){
    while(shouldPause() && !shouldAbort()){
      onProgress(done, total, "已暂停…");
      await new Promise(function(r){ setTimeout(r, 500); });
    }
  }
  var results = {};
  var total = chunks.length * characters.length;
  var done = 0;
  var aborted = false;
  /* 并发: 之前是严格串行 for…await，6000 次调用排一队，网络 RTT 全部叠加。
   * 默认 3 路（对多数网关安全），可用 opts.concurrency 覆盖，上限 8。 */
  var concurrency = Math.max(1, Math.min(parseInt(opts.concurrency, 10) || 3, 8));

  /* 任务摊平: 续跑命中 / 未出现 / 真正要调用 三种都变成任务，
   * 这样进度条依然是"一条一条往前走"，不会在开头一次性跳掉几百条。
   * 批量模式下一块只排一个任务，一次产出该块的全部角色。 */
  var batch = opts.batchProfiles !== false;
  var tasks = [];
  for(var ci = 0; ci < chunks.length; ci++){
    var chunk = chunks[ci];
    var workNames = [];
    for(var hi = 0; hi < characters.length; hi++){
      var ch = characters[hi];
      if(!ch || chunk.text == null) continue;
      var key = chunk.id + "|" + ch;
      var saved = checkpoint[key];
      if(saved && typeof saved === "object" && saved.fields){
        tasks.push({kind: "restore", chunk: chunk, ch: ch, saved: saved});
      }else if(!appearsIn(chunk.text, ch, aliasIndex)){
        tasks.push({kind: "skip", chunk: chunk, ch: ch});
      }else if(batch){
        workNames.push(ch);
      }else{
        tasks.push({kind: "work", chunk: chunk, ch: ch, key: key});
      }
    }
    if(workNames.length) tasks.push({kind: "batch", chunk: chunk, names: workNames});
  }

  function storeResult(chunk, ch, key, fields, stage){
    if(!results[ch]) results[ch] = [];
    results[ch].push({fields: fields, chunkId: chunk.id, md: "", stage: stage});
    checkpoint[key] = {fields: fields, stage: stage};
    if(opts.onCheckpoint) opts.onCheckpoint(checkpoint);
  }

  var batchOk = 0, batchFallback = 0;

  // 逐个补跑（批量里漏掉的角色，或整批解析失败时的兜底）
  async function fallbackOne(chunk, ch){
    var key = chunk.id + "|" + ch;
    if(checkpoint[key]) return;
    try{
      var r = await distillOne(chunk, ch);
      storeResult(chunk, ch, key, parseProfile(r.md), r.stage);
    }catch(e){ /* 单人也失败：留空，由合并阶段跳过 */ }
  }

  async function runTask(t){
    if(t.kind === "restore"){
      if(!results[t.ch]) results[t.ch] = [];
      results[t.ch].push({fields: t.saved.fields, chunkId: t.chunk.id, md: "",
        stage: t.saved.stage || t.chunk.stage || "mid", cached: true});
      done++;
      return;
    }
    if(t.kind === "skip"){
      done++;
      onProgress(done, total, "跳过 " + t.ch + " @ " + t.chunk.id + " (未出现)");
      return;
    }
    if(t.kind === "batch"){
      var names = t.names;
      onProgress(done, total, "蒸馏 " + names.join("、") + " @ " + t.chunk.id);
      var got = null, err = null;
      try{
        var br = await distillMany(t.chunk, names);
        got = parseBatch(br.raw, names);
      }catch(e){ err = e; }
      var missing = [];
      if(got){
        batchOk++;
        names.forEach(function(ch){
          if(got[ch]) storeResult(t.chunk, ch, t.chunk.id + "|" + ch, got[ch], t.chunk.stage || "mid");
          else missing.push(ch);
        });
      }else{
        missing = names.slice();
        batchFallback++;
        onProgress(done, total, "批量解析失败，回退逐人 @" + t.chunk.id + (err ? "：" + err.message : ""));
      }
      for(var mi = 0; mi < missing.length; mi++){
        batchFallback++;
        await fallbackOne(t.chunk, missing[mi]);
      }
      done += names.length;
      return;
    }
    onProgress(done, total, "蒸馏 " + t.ch + " @ " + t.chunk.id);
    try{
      var r2 = await distillOne(t.chunk, t.ch);
      storeResult(t.chunk, t.ch, t.key, parseProfile(r2.md), r2.stage);
    }catch(e){
      onProgress(done, total, "失败 " + t.ch + " @ " + t.chunk.id + ": " + e.message);
    }
    done++;
  }

  var cursor = 0;
  async function worker(){
    while(!aborted){
      await waitPause();
      if(shouldAbort()){ aborted = true; return; }
      var t = tasks[cursor++];
      if(!t) return;
      await runTask(t);
    }
  }
  var pool = [];
  for(var w = 0; w < concurrency; w++) pool.push(worker());
  await Promise.all(pool);
  if(batch && (batchOk || batchFallback)){
    onProgress(done, total, "画像完成：批量 " + batchOk + " 块" +
      (batchFallback ? "，回退 " + batchFallback + " 次" : ""));
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
