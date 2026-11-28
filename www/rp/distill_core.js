/* App 端蒸馏核心 (2026-10-07 移植; 2026-11-28 升级为全套方案)。
 * 全套模式 (distill_prompt_full.js 在场时): 与 novel-distill 管线同源 ——
 * zaomeng+overlay 全套提示词、95 字段/24 组、出场门/占位词门禁/values 校验、
 * 字段级仲裁合并 (证据强度记账/冻结字段/冲突队列)、按角色串行增量链。
 * 旧简化模式 (18 字段批量 JSON) 保留为 legacy: batchProfiles:true 或无全套模块时走。
 * localStorage 断点续跑两种模式通用 (checkpoint 形状不变)。 */
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
  ["evidence", "关键证据原文引用 (最多3条)"],
  /* 外在集群: 官方 run 的 rp_cards 一直有这 10 个键(红楼梦/水浒/清安录都有),
   * 但本提示词历史上只产 8 字段 → 新书蒸馏出来的人物"没有外在",
   * 而 app 侧 prompt.js 早就登记渲染 —— 断层在这里, 不在渲染侧。
   * 顺序即提示词列举序, 也是批量 JSON 模板的键序(BATCH_FIELD_JSON 派生)。 */
  ["appearance_feature", "外貌特征 (长相/身形/年龄感; 随阶段有明显变化用分号分阶段列举)"],
  ["visual_identity", "视觉识别 (最具辨识度的整体形象, 一眼能认出的特点)"],
  ["physical_marks", "身体印记 (胎记/伤疤/纹印/残疾等, 没有就留空)"],
  ["voice_dressing", "声音着装 (嗓音/口音/常穿衣着服饰)"],
  ["signature_items", "随身物品 (标志性携带物, 如黛玉的花锄、宝钗的金锁)"],
  ["habit_action", "习惯动作 (反复出现的小动作与癖好, 如对镜泪透罗帕)"],
  ["carry_style", "举止风度 (体态/步态/待人接物的气度)"],
  ["others_impression", "他人印象 (书中他人对其外貌气质的评价或反应, 附 chunk_id)"],
  ["reputation", "外界评价 (名声/外号/口碑, 附 chunk_id)"],
  ["action_pattern", "行动模式 (典型行为方式与处事套路)"]
];
var PROFILE_FIELDS = FIELD_SPEC.map(function(f){ return f[0]; });
/* 全套字段: 核心字段集 (旧 18) 供质量门完整度打分与批量模式使用;
 * 全套模块在场时 PROFILE_FIELDS 升级为 95 字段 (解析/合并/落卡口径)。 */
var CORE_FIELDS = PROFILE_FIELDS.slice();
var FIELD_GROUPS = (typeof DISTILL_PROMPT_FULL !== "undefined" && DISTILL_PROMPT_FULL.groups) || null;
var FULL_MODE = !!FIELD_GROUPS;
if(FULL_MODE){
  PROFILE_FIELDS = [];
  FIELD_GROUPS.forEach(function(g){ g.fields.forEach(function(f){
    if(PROFILE_FIELDS.indexOf(f) < 0) PROFILE_FIELDS.push(f);
  }); });
}
/* 批量 JSON 模板的字符段从 FIELD_SPEC 派生: 历史上这里手抄了一遍 8 字段,
 * 提示词加字段而模板不加 → 模型按新口径产出也会被 parseBatch 当噪声丢掉。 */
var BATCH_FIELD_JSON = FIELD_SPEC.map(function(f){ return '"' + f[0] + '":""'; }).join(",");

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
  if(FULL_MODE) return distillOneFull(chunk, character,
    (onProgress && typeof onProgress === "object") ? onProgress : {});
  // 摘录上限与分块上限保持一致 (DISTILL_CHUNK.MAX_CHARS): 块长超过上限时
  // 每块尾部会被永久丢弃, 且相邻块之间留下盲区——不报错, 只是"某情节没记住"。
  var cap = (typeof DISTILL_CHUNK !== "undefined" && DISTILL_CHUNK.MAX_CHARS) || 6000;
  var user = JSON.stringify({
    excerpt: chunk.text.slice(0, cap),
    chunk_id: chunk.id,
    character: character
  }, null, 1);
  /* 单发模式同样显式给上限: 字段扩到 18 个后 md 产出可达 2~3K token,
   * 不传 max_tokens 就跟着网关默认值(常见 1024/2048)被腰斩。 */
  var r = await DISTILL_LLM.chat([
    {role: "system", content: SYSTEM_PROMPT},
    {role: "user", content: user}
  ], {maxTokens: 6000});
  return {md: r.content, chunkId: chunk.id, character: character, stage: chunk.stage || "mid"};
}


/* ── 全套模式: 单人蒸馏 (管线同源请求形状) ─────────────────────────
 * system = zaomeng+overlay 全套提示词; user = REQUEST JSON
 * {excerpt, chunk_id, chunk_title, characters:[name], alias_map,
 *  update_mode: incremental|fresh, existing_profiles:{name: md}}。 */
async function distillOneFull(chunk, character, opts){
  opts = opts || {};
  var cap = (typeof DISTILL_CHUNK !== "undefined" && DISTILL_CHUNK.MAX_CHARS) || 6000;
  var req = {
    excerpt: chunk.text.slice(0, cap),
    chunk_id: chunk.id,
    chunk_title: chunk.title || "",
    characters: [character],
    alias_map: opts.aliasMap || {},
    update_mode: opts.existingMd ? "incremental" : "fresh"
  };
  if(opts.existingMd){
    req.existing_profiles = {};
    req.existing_profiles[character] = opts.existingMd;
  }
  var r = await DISTILL_LLM.chat([
    {role: "system", content: DISTILL_PROMPT_FULL.text},
    {role: "user", content: JSON.stringify(req, null, 1)}
  ], {maxTokens: 16000});
  return {md: r.content, chunkId: chunk.id, character: character, stage: chunk.stage || "mid", full: true};
}

/* 畸形字段行剥离: 字段名夹汉字 (如 inner_conflict_两难) 的行整行丢弃,
 * 不让它混进上一字段的值 (管线侧同名教训)。 */
function stripMalformedLines(md){
  return String(md || "").split("\n").filter(function(ln){
    return !/^\s*-\s*[A-Za-z_][A-Za-z0-9_]*[一-鿿]/.test(ln);
  }).join("\n");
}

/* 全套 md 解析: 先按 ## 角色名取节, 跳过 ### 冲突备注节,
 * 再逐行取字段 (容忍 **field**: 与 **field": 误写)。只收小写 snake_case 名。 */
function parseFullProfile(md, character){
  var lines = stripMalformedLines(md).split("\n");
  var sections = [], cur = null;
  lines.forEach(function(ln){
    var h = ln.match(/^##\s+(.+)$/);
    if(h){ cur = {head: h[1], body: []}; sections.push(cur); }
    else if(cur) cur.body.push(ln);
  });
  var body = lines;
  if(sections.length){
    var pick = null;
    sections.forEach(function(sec){ if(!pick && sec.head.indexOf(character) >= 0) pick = sec; });
    if(!pick && sections.length === 1) pick = sections[0];
    if(pick) body = pick.body;
  }
  var fields = {}, curKey = null, curVal = [], skipSec = false;
  function flush(){ if(curKey) fields[curKey] = curVal.join("\n").trim(); }
  body.forEach(function(ln){
    var sec = ln.match(/^###\s+(.+)$/);
    if(sec){ flush(); curKey = null; curVal = []; skipSec = sec[1].indexOf("冲突备注") >= 0; return; }
    if(skipSec) return;
    var m = ln.match(/^\s*-\s*\*{0,2}([a-z][a-z0-9_]*)["”]?\*{0,2}\s*[:：]\s*(.*)$/);
    if(m){ flush(); curKey = m[1]; curVal = [m[2]]; }
    else if(curKey) curVal.push(ln);
  });
  flush();
  return fields;
}

/* ── 三道门 (移植管线 distill.py 门禁, 口径一致) ─────────────────── */
var PLACEHOLDER_TOKENS = ["未判定", "未知", "证据不足", "待判定", "不详"];
var VALUES_OK_RE = /^[^=；;]+=-?\d+\s*(?:[（(][^）)]*[）)])?\s*(?:[；;\/]\s*[^=；;]+=-?\d+\s*(?:[（(][^）)]*[）)])?\s*)*$/;
/* 返回第一个违规 {kind, field, value} 或 null。kind: placeholder|values。 */
function checkGates(fields){
  var keys = Object.keys(fields || {});
  for(var i = 0; i < keys.length; i++){
    var k = keys[i], v = String(fields[k] == null ? "" : fields[k]).trim();
    if(!v) continue;
    for(var j = 0; j < PLACEHOLDER_TOKENS.length; j++){
      if(v.indexOf(PLACEHOLDER_TOKENS[j]) === 0)
        return {kind: "placeholder", field: k, value: v.slice(0, 40)};
    }
    if(k === "values" && !VALUES_OK_RE.test(v))
      return {kind: "values", field: k, value: v.slice(0, 40)};
  }
  return null;
}
function countOccurrences(text, needle){
  if(!needle) return 0;
  var n = 0, i = 0;
  while((i = text.indexOf(needle, i)) >= 0){ n++; i += needle.length; }
  return n;
}
/* 出场门计数: 本名 + 全部别名 (≥2 字, 与 buildAliasIndex 同口径) 的出现次数 */
function countMentions(text, charName, aliasIndex){
  var n = countOccurrences(text, charName);
  var al = (aliasIndex && aliasIndex[charName]) || [];
  for(var i = 0; i < al.length; i++) n += countOccurrences(text, al[i]);
  return n;
}

/* ── 字段级仲裁合并 (移植管线 field_arbitration 的 A 型记账) ────────
 * 每字段记 {value, chunk, strength}: 整值逐字命中原文=2, 值内「」引文命中=1, 其余=0。
 * 冻结字段一旦以 strength 2 落座不再被覆盖; 同强度不同值 → 保旧值并记冲突队列。 */
var FROZEN_FIELDS = {core_identity: 1, gender: 1, world_belong: 1, identity_anchor: 1,
  background_imprint: 1, life_experience: 1, trauma_scar: 1, taboo_topics: 1, forbidden_behaviors: 1};
function anchorStrength(value, chunkText){
  if(!value || !chunkText) return 0;
  var flat = value.replace(/\[[^\]]*\]/g, "").trim();
  if(flat && chunkText.indexOf(flat) >= 0) return 2;
  var m, re = /「([^」]+)」/g;
  while((m = re.exec(value)) !== null){
    if(m[1].length >= 4 && chunkText.indexOf(m[1]) >= 0) return 1;
  }
  return 0;
}
function createStore(){ return {fields: {}, conflicts: []}; }
function applyToStore(store, fields, chunkId, chunkText){
  Object.keys(fields || {}).forEach(function(k){
    var v = String(fields[k] == null ? "" : fields[k]).trim();
    if(!v) return;
    var cur = store.fields[k];
    var s = anchorStrength(v, chunkText);
    if(!cur){ store.fields[k] = {value: v, chunk: chunkId, strength: s, first: chunkId, last: chunkId}; return; }
    if(cur.value === v){ cur.last = chunkId; return; }
    if(FROZEN_FIELDS[k] && cur.strength >= 2) return;
    if(s > cur.strength){ store.fields[k] = {value: v, chunk: chunkId, strength: s, first: cur.first, last: chunkId}; return; }
    if(s === cur.strength){
      store.conflicts.push({field: k, kept: cur.value, rejected: v, keptChunk: cur.chunk, chunk: chunkId});
    }
  });
}
function storeFields(store){
  var o = {};
  Object.keys(store.fields).forEach(function(k){ o[k] = store.fields[k].value; });
  return o;
}
/* 字段对象 -> 分组 md (existing_profiles 回灌用; 冲突队列不在字段内, 天然不回灌) */
function fieldsToMd(fields, name){
  var out = ["## " + name];
  if(FIELD_GROUPS){
    FIELD_GROUPS.forEach(function(g){
      var lines = [];
      g.fields.forEach(function(f){ if(fields[f]) lines.push("- " + f + ": " + fields[f]); });
      if(lines.length) out.push("### " + g.name + "\n" + lines.join("\n"));
    });
  }else{
    Object.keys(fields).forEach(function(f){ if(fields[f]) out.push("- " + f + ": " + fields[f]); });
  }
  return out.join("\n");
}

/* ── 全套蒸馏主流程 ───────────────────────────────────────────────
 * 按角色串行增量链 (链内块序即仲裁序, existing 回灌当前档案), 角色之间并发。
 * 出场 <min 跳过; 占位词/values 违规或空档案整块重摇一次, 再犯记 gateFailures 不落盘。 */
async function distillNovelFull(chunks, characters, opts){
  var onProgress = opts.onProgress || function(){};
  var checkpoint = opts.checkpoint || {};
  var shouldPause = opts.shouldPause || function(){ return false; };
  var shouldAbort = opts.shouldAbort || function(){ return false; };
  var aliasIndex = buildAliasIndex(opts.aliasMap);
  var aliasMap = opts.aliasMap || {};
  var minMentions = (opts.appearanceMin == null ? 3 : opts.appearanceMin);
  var concurrency = Math.max(1, Math.min(parseInt(opts.concurrency, 10) || 3, 8));
  var total = chunks.length * characters.length;
  var done = 0, aborted = false;
  async function waitPause(){
    while(shouldPause() && !shouldAbort()){
      onProgress(done, total, "已暂停…");
      await new Promise(function(r){ setTimeout(r, 500); });
    }
  }
  var stores = {}, details = {}, gateFailures = {}, chains = {};
  characters.forEach(function(ch){
    stores[ch] = {early: createStore(), mid: createStore(), late: createStore()};
    details[ch] = []; gateFailures[ch] = []; chains[ch] = [];
  });
  chunks.forEach(function(chunk){
    characters.forEach(function(ch){
      var key = chunk.id + "|" + ch;
      var saved = checkpoint[key];
      if(saved && typeof saved === "object" && saved.fields){
        chains[ch].push({kind: "restore", chunk: chunk, saved: saved});
      }else{
        var hit = minMentions <= 0 ? appearsIn(chunk.text, ch, aliasIndex)
                                   : countMentions(chunk.text, ch, aliasIndex) >= minMentions;
        chains[ch].push(hit ? {kind: "work", chunk: chunk, key: key} : {kind: "skip", chunk: chunk});
      }
    });
  });
  characters.forEach(function(ch){
    chains[ch].forEach(function(it){
      if(it.kind !== "restore") return;
      var st = it.saved.stage || it.chunk.stage || "mid";
      applyToStore(stores[ch][st] || stores[ch].mid, it.saved.fields, it.chunk.id, it.chunk.text);
      details[ch].push({fields: it.saved.fields, chunkId: it.chunk.id, md: "", stage: st, cached: true});
    });
  });
  async function runChain(ch){
    var items = chains[ch];
    for(var i = 0; i < items.length; i++){
      if(aborted) return;
      await waitPause();
      if(shouldAbort()){ aborted = true; return; }
      var it = items[i], chunk = it.chunk;
      var st = chunk.stage || "mid";
      var store = stores[ch][st] || stores[ch].mid;
      if(it.kind === "restore"){ done++; continue; }
      if(it.kind === "skip"){
        done++;
        onProgress(done, total, "跳过 " + ch + " @ " + chunk.id + " (出场不足)");
        continue;
      }
      onProgress(done, total, "蒸馏 " + ch + " @ " + chunk.id);
      var settled = false;
      for(var attempt = 0; attempt < 2 && !settled; attempt++){
        try{
          var hasExisting = Object.keys(store.fields).length > 0;
          var r = await distillOneFull(chunk, ch, {
            existingMd: hasExisting ? fieldsToMd(storeFields(store), ch) : "",
            aliasMap: aliasMap
          });
          var fields = parseFullProfile(r.md, ch);
          if(!Object.keys(fields).length){
            if(attempt === 0){ onProgress(done, total, "空档案, 重摇 " + ch + " @ " + chunk.id); continue; }
            gateFailures[ch].push({chunk: chunk.id, kind: "empty", field: ""});
            settled = true; break;
          }
          var vio = checkGates(fields);
          if(vio){
            if(attempt === 0){ onProgress(done, total, "门禁拦截(" + vio.kind + "), 重摇 " + ch + " @ " + chunk.id); continue; }
            gateFailures[ch].push({chunk: chunk.id, kind: vio.kind, field: vio.field});
            settled = true; break;
          }
          checkpoint[it.key] = {fields: fields, stage: st};
          if(opts.onCheckpoint) opts.onCheckpoint(checkpoint);
          applyToStore(store, fields, chunk.id, chunk.text);
          details[ch].push({fields: fields, chunkId: chunk.id, md: "", stage: st});
          settled = true;
        }catch(e){
          onProgress(done, total, "失败 " + ch + " @ " + chunk.id + ": " + e.message);
          settled = true;
        }
      }
      done++;
    }
  }
  var queue = characters.slice();
  async function worker(){
    while(!aborted){
      var ch = queue.shift();
      if(!ch) return;
      await runChain(ch);
    }
  }
  var pool = [];
  for(var w = 0; w < concurrency; w++) pool.push(worker());
  await Promise.all(pool);
  var final = {};
  characters.forEach(function(ch){
    var has = ["early", "mid", "late"].some(function(st){ return Object.keys(stores[ch][st].fields).length; });
    if(!has && !details[ch].length) return;
    var merged = {};
    ["early", "mid", "late"].forEach(function(st){ merged[st] = storeFields(stores[ch][st]); });
    PROFILE_FIELDS.concat(["brief_intro", "appearance", "relationships_summary", "key_events", "arc_summary"]).forEach(function(k){
      merged[k] = merged.late[k] || merged.mid[k] || merged.early[k] || "";
    });
    var conflicts = [];
    ["early", "mid", "late"].forEach(function(st){ conflicts = conflicts.concat(stores[ch][st].conflicts); });
    final[ch] = {fields: merged, chunks: details[ch].length, details: details[ch],
      conflicts: conflicts, gateFailures: gateFailures[ch]};
  });
  return final;
}

/* 批量模式: 一次调用产出该块出现的所有角色。
 * 原来同一段正文要按角色重复发 N 遍（N=角色数），输入里 90%+ 是重复正文。
 * withSummary=true 时同一次调用再顺带产出本块梗概，剧情阶段的 summarizeChunks
 * 会因为 checkpoint 里已有 sum_<id> 而直接复用，省掉整整一遍「每块一次」的调用。 */
var BATCH_SYSTEM_PROMPT = `你是小说人物档案蒸馏器。从小说正文片段中提取**给定人物列表**中每个人物的结构化档案。

## 输出格式 (严格 JSON, 不要代码块, 不要解释)
{"characters":{"人物名":{${BATCH_FIELD_JSON}}}}

## 规则
1. 只输出给定列表里的人物，不新增、不改名
2. 列表里每个人物都必须出现在 characters 里；正文没写的字段给空字符串
3. 每个事实后标注来源: [canon:chunk_id] 原文直证 / [ref:chunk_id] 旁证 / [inference:chunk_id] 合理推断 / [unknown] 无依据
4. 禁止编造原文没有的情节、人名、对话
5. core_traits 用逗号分隔最多 5 个词；typical_lines 最多 3 句且每句 40 字内
6. 外在字段(appearance_feature 起)只写原文有据的外形气质描写；没有就留空，不写"未知"、不套模板形容
`;

var BATCH_SYSTEM_PROMPT_WITH_SUMMARY = `你是小说剧情与人物档案蒸馏器。从小说正文片段中同时提取「本块剧情梗概」和**给定人物列表**中每个人物的结构化档案。

## 输出格式 (严格 JSON, 不要代码块, 不要解释)
{"summary":{"events":["事件"],"turning_points":["转折"],"hooks":[{"hook":"悬念"}]},
 "characters":{"人物名":{${BATCH_FIELD_JSON}}}}

## 规则
1. events 按发生顺序，3-6 条；turning_points 没有就给空数组；hooks 没有就给空数组
2. 只输出给定列表里的人物，不新增、不改名；列表为空时 characters 给 {}
3. 列表里每个人物都必须出现在 characters 里；正文没写的字段给空字符串
4. 每个事实后标注来源: [canon:chunk_id] 原文直证 / [ref:chunk_id] 旁证 / [inference:chunk_id] 合理推断
5. 禁止编造原文没有的情节、人名、对话
6. core_traits 用逗号分隔最多 5 个词；typical_lines 最多 3 句且每句 40 字内
7. 外在字段(appearance_feature 起)只写原文有据的外形气质描写；没有就留空，不写"未知"、不套模板形容
`;

async function distillMany(chunk, names, opts){
  opts = opts || {};
  var cap = (typeof DISTILL_CHUNK !== "undefined" && DISTILL_CHUNK.MAX_CHARS) || 6000;
  var user = JSON.stringify({
    excerpt: chunk.text.slice(0, cap),
    chunk_id: chunk.id,
    characters: names
  }, null, 1);
  var r = await DISTILL_LLM.chat([
    {role: "system", content: opts.withSummary ? BATCH_SYSTEM_PROMPT_WITH_SUMMARY : BATCH_SYSTEM_PROMPT},
    {role: "user", content: user}
  /* max_tokens: 字段从 8 扩到 18 (外在集群 10 个) 后按人头重算。
   * 800+500n 是 8 字段时代的账: 18 字段 + evidence/others_impression 这类长文本字段,
   * 单人约 1.5~2K token, 且 withSummary 还要再搭一份梗概 JSON。
   * 8000 上限不变 (网关硬顶), 人数多时靠调用方分批, 不靠无限加 token。 */
  ], {maxTokens: Math.min(8000, 1600 + 700 * names.length)});
  return {raw: r.content, chunkId: chunk.id, stage: chunk.stage || "mid"};
}

/* 从模型输出里抠 JSON 并归一成 {characters: {角色名: {字段}}, summary: {...}|null}。
 * 解析失败返回 null，由调用方回退到逐人调用——宁可慢，也不能整块静默丢档案。 */
function parseBatch(raw, names){
  var s = String(raw || "").replace(/```json/gi, "```").trim();
  var a = s.indexOf("{"), b = s.lastIndexOf("}");
  if(a < 0 || b <= a) return null;
  var obj = null;
  try{ obj = JSON.parse(s.slice(a, b + 1)); }catch(e){ return null; }
  var map = obj && obj.characters;
  if(!map || typeof map !== "object") map = {};
  var out = {};
  (names || []).forEach(function(name){
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
  var sm = obj && obj.summary && typeof obj.summary === "object" ? obj.summary : null;
  return {characters: out, summary: sm};
}

/* 归一化成 plot.summarizeChunks / buildOutline 期望的形状 */
function normalizeSummary(chunk, obj){
  obj = obj || {};
  var ev = Array.isArray(obj.events) ? obj.events : [];
  var tp = Array.isArray(obj.turning_points) ? obj.turning_points : [];
  var hk = Array.isArray(obj.hooks) ? obj.hooks : [];
  return {
    chunk_id: chunk.id,
    title: chunk.title || "",
    events: ev.map(function(x){ return String(x == null ? "" : x).trim(); }).filter(Boolean),
    turning_points: tp.map(function(x){ return String(x == null ? "" : x).trim(); }).filter(Boolean),
    hooks: hk.map(function(h){
      if(typeof h === "string") return {hook: h, setup_chunk: chunk.id};
      return {hook: String((h && h.hook) || "").trim(), setup_chunk: chunk.id};
    }).filter(function(h){ return h.hook; })
  };
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
  if(FULL_MODE && opts.fullScheme !== false && opts.batchProfiles !== true){
    return distillNovelFull(chunks, characters, opts);
  }
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
   * 批量模式下一块只排一个任务，一次产出该块的全部角色。
   * withSummary 时每块都要排一个任务（哪怕这块没有任何角色），
   * 因为剧情梗概也搭这次调用产出，剧情阶段就能整段复用。 */
  var batch = opts.batchProfiles !== false;
  var withSummary = batch && opts.withPlotSummary === true;
  var tasks = [];
  for(var ci = 0; ci < chunks.length; ci++){
    var chunk = chunks[ci];
    var workNames = [];
    var needSummary = withSummary && !checkpoint["sum_" + chunk.id];
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
    if(workNames.length || needSummary){
      tasks.push({kind: "batch", chunk: chunk, names: workNames, wantSummary: needSummary});
    }
  }
  /* 进度总量按任务重算：摘要-only 的任务也要算一格，否则进度条永远差一截到不了 100% */
  total = 0;
  tasks.forEach(function(t){
    total += (t.kind === "batch") ? Math.max(1, t.names.length) : 1;
  });

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
      onProgress(done, total, names.length
        ? "蒸馏 " + names.join("、") + " @ " + t.chunk.id
        : "梗概 " + t.chunk.id);
      var got = null, err = null;
      try{
        var br = await distillMany(t.chunk, names, {withSummary: !!t.wantSummary});
        got = parseBatch(br.raw, names);
      }catch(e){ err = e; }
      // 梗概先落 checkpoint：即使角色部分要回退，剧情阶段也不用重跑这块
      if(got && t.wantSummary && got.summary){
        checkpoint["sum_" + t.chunk.id] = {summary: normalizeSummary(t.chunk, got.summary)};
        if(opts.onCheckpoint) opts.onCheckpoint(checkpoint);
      }else if(t.wantSummary && !got){
        // 整批解析失败时，梗概交给剧情阶段自己补；这里不写脏数据
      }
      var missing = [];
      if(got){
        batchOk++;
        names.forEach(function(ch){
          if(got.characters[ch]) storeResult(t.chunk, ch, t.chunk.id + "|" + ch, got.characters[ch], t.chunk.stage || "mid");
          else missing.push(ch);
        });
      }else if(names.length){
        missing = names.slice();
        batchFallback++;
        onProgress(done, total, "批量解析失败，回退逐人 @" + t.chunk.id + (err ? "：" + err.message : ""));
      }
      for(var mi = 0; mi < missing.length; mi++){
        batchFallback++;
        await fallbackOne(t.chunk, missing[mi]);
      }
      done += Math.max(1, names.length);
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
  mergeProfiles: mergeProfiles,
  parseBatch: parseBatch,
  PROFILE_FIELDS: PROFILE_FIELDS,
  CORE_FIELDS: CORE_FIELDS,
  FIELD_GROUPS: FIELD_GROUPS,
  FULL_MODE: FULL_MODE,
  countMentions: countMentions,
  checkGates: checkGates,
  parseFullProfile: parseFullProfile,
  createStore: createStore,
  applyToStore: applyToStore,
  storeFields: storeFields,
  fieldsToMd: fieldsToMd,
  FIELD_SPEC: FIELD_SPEC,
  SYSTEM_PROMPT: SYSTEM_PROMPT,
  BATCH_SYSTEM_PROMPT: BATCH_SYSTEM_PROMPT,
  BATCH_SYSTEM_PROMPT_WITH_SUMMARY: BATCH_SYSTEM_PROMPT_WITH_SUMMARY
};
})();
