/* AI 诊断日志（2026-11-26 用户立项：自主诊断飞轮）：
 * 传输层 RP_NET 每次调用（主聊天/导演/世界模拟/摘要等全部 complete/stream）
 * 把「发给 AI 的完整提示词 + 模型思考 + 答复」经 window.__aiLogHook 交到这里
 * 落盘。纯本地 localStorage，环形上限：最多 40 条且总字数不超过约 120 万字，
 * 超限从最旧开始淘汰。思考来源：reasoning_content 字段，或答复里内嵌的
 * <think> 段（落盘时拆出，答复存净文本；App 本身行为不变）。
 * 另带 AI 分析：buildDiagPrompt 把最近 N 条拼成诊断材料，analyze 交给
 * 调用方给的 complete 函数跑一遍，结论存 nd_ailog_analysis_v1（留 5 份）。 */
"use strict";
var RP_AILOG = (function(){
var KEY = "nd_ailog_v1", AKEY = "nd_ailog_analysis_v1", ONKEY = "nd_ailog_on";
/* 分环配额（2026-11-27 审计修复）：聊天类与蒸馏类各占各的环——早期共用
 * 一个环时，一轮蒸馏几十次调用会把聊天记录全部冲走，诊断时证据已没。 */
var MAX_CHAT = 30, MAX_DISTILL = 15, MAX_N = MAX_CHAT + MAX_DISTILL, MAX_CHARS = 1200000;
/* 版本戳：每条记录盖上构建版本+commit，修完打包后新旧记录可分辨。
 * build-info.json 在 www 根，懒抓一次；抓不到（开发环境）就留空。 */
var BV = "";
try{
  if(typeof fetch === "function")
    fetch("build-info.json").then(function(r){ return r.json(); })
      .then(function(j){ if(j) BV = (j.vname || "") + "/" + (j.commit || ""); })
      .catch(function(){});
}catch(e){}

function enabled(){
  try{ return localStorage.getItem(ONKEY) !== "0"; }catch(e){ return true; }
}
function setEnabled(on){
  try{ localStorage.setItem(ONKEY, on ? "1" : "0"); }catch(e){}
}
function load(){
  try{ var d = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(d) ? d : []; }
  catch(e){ return []; }
}
function save(list){
  try{ localStorage.setItem(KEY, JSON.stringify(list)); return true; }
  catch(e){
    /* 存储满：砍掉一半旧记录再试一次，还不行就静默放弃（日志不能拖垮聊天） */
    try{
      var half = list.slice(Math.floor(list.length / 2));
      localStorage.setItem(KEY, JSON.stringify(half));
      return true;
    }catch(e2){ return false; }
  }
}
function entryChars(e){
  var n = (e.reply || "").length + (e.thinking || "").length;
  (e.messages || []).forEach(function(m){ n += String(m.content || "").length; });
  return n;
}
/* 内嵌 <think>…</think> 拆分：返回 {thinking, reply} */
function splitThink(text){
  var s = String(text || "");
  var m = s.match(/<think>([\s\S]*?)<\/think>/);
  if(!m) return { thinking: "", reply: s };
  return { thinking: m[1].trim(), reply: s.replace(m[0], "").trim() };
}
var seq = 0;
function ingest(rec){
  if(!enabled() || !rec) return;
  try{
    var split = splitThink(rec.reply || "");
    var e = {
      id: "L" + Date.now().toString(36) + (seq++),
      ts: rec.ts || Date.now(),
      ms: rec.ms || 0,
      model: rec.model || "",
      bv: BV || "",
      stream: !!rec.stream,
      tag: rec.tag || "",
      finish: rec.finish || "",
      params: rec.params || null,
      partial: !!rec.partial,
      error: rec.error || "",
      messages: (rec.messages || []).map(function(m){
        return { role: m.role || "", content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) };
      }),
      thinking: rec.thinking || split.thinking || "",
      reply: split.reply
    };
    var list = load();
    list.push(e);
    /* 先按类淘汰各自超额的（最旧优先），再按总字数淘汰最旧 */
    var evictClass = function(cls, max){
      var n = 0, i;
      for(i = 0; i < list.length; i++) if((list[i].tag === "distill" ? "d" : "c") === cls) n++;
      for(i = 0; i < list.length && n > max;){
        if((list[i].tag === "distill" ? "d" : "c") === cls){ list.splice(i, 1); n--; }
        else i++;
      }
    };
    evictClass("c", MAX_CHAT);
    evictClass("d", MAX_DISTILL);
    var total = 0;
    list.forEach(function(x){ total += entryChars(x); });
    while(list.length > 1 && total > MAX_CHARS){
      total -= entryChars(list[0]);
      list.shift();
    }
    save(list);
  }catch(err){/* 日志失败绝不影响主流程 */}
}
function summaries(){
  return load().slice().reverse().map(function(e){
    var pc = 0;
    (e.messages || []).forEach(function(m){ pc += String(m.content || "").length; });
    return { id: e.id, ts: e.ts, ms: e.ms, model: e.model, stream: e.stream, tag: e.tag,
      finish: e.finish || "", bv: e.bv || "",
      error: e.error, promptChars: pc, replyChars: (e.reply || "").length,
      thinkChars: (e.thinking || "").length, msgs: (e.messages || []).length };
  });
}
function get(id){
  var list = load();
  for(var i = 0; i < list.length; i++) if(list[i].id === id) return list[i];
  return null;
}
function clear(){ try{ localStorage.removeItem(KEY); }catch(e){} }
function stats(){
  var list = load(), total = 0, cn = 0, dn = 0;
  list.forEach(function(x){ total += entryChars(x); if(x.tag === "distill") dn++; else cn++; });
  return { n: list.length, chars: total, chatN: cn, distillN: dn,
    maxN: MAX_N, maxChat: MAX_CHAT, maxDistill: MAX_DISTILL,
    maxChars: MAX_CHARS, enabled: enabled(), bv: BV };
}
function exportObj(){
  return { app: "fusheng", kind: "ai-diag-log", exportedAt: new Date().toISOString(),
    build: BV || "", records: load(), analyses: loadAnalyses(), issues: loadIssues() };
}

/* 导入诊断包（2026-11-27 补全）：管线 trace 转出的包、或另一台设备/旧包
 * 导出的包，都能并进本机飞轮——记录走分环淘汰、台账保留状态、分析留 5。 */
function importObj(obj){
  if(!obj || obj.kind !== "ai-diag-log") throw new Error("不是浮生诊断包");
  var rn = 0, an = 0;
  (obj.records || []).forEach(function(r){ ingest(r, true); rn++; });
  var inN = importIssues(obj.issues || []);
  if(obj.analyses && obj.analyses.length){
    var merged = loadAnalyses().concat(obj.analyses).sort(function(a, b){ return (a.ts || 0) - (b.ts || 0); }).slice(-5);
    try{ localStorage.setItem(AKEY, JSON.stringify(merged)); }catch(e){}
    an = obj.analyses.length;
  }
  return { records: rn, issues: inN, analyses: an };
}

/* 待诊断提醒：上次分析之后新增了多少条、台账还有多少未闭环/高危 */
function diagHint(){
  var ans = loadAnalyses();
  var lastTs = ans.length ? Math.max.apply(null, ans.map(function(a){ return a.ts || 0; })) : 0;
  var unseen = load().filter(function(e){ return (e.ts || 0) > lastTs; }).length;
  var open = openIssues();
  return { unseen: unseen, open: open.length,
    openHigh: open.filter(function(x){ return x.severity === "high" && x.status === "open"; }).length };
}

/* 导入诊断包（2026-11-27 补全）：管线 trace 转出的包、或另一台设备/旧包
 * 导出的包，都能并进本机飞轮——记录走分环淘汰、台账保留状态、分析留 5。 */
function importObj(obj){
  if(!obj || obj.kind !== "ai-diag-log") throw new Error("不是浮生诊断包");
  var rn = 0, an = 0;
  (obj.records || []).forEach(function(r){ ingest(r, true); rn++; });
  var inN = importIssues(obj.issues || []);
  if(obj.analyses && obj.analyses.length){
    var merged = loadAnalyses().concat(obj.analyses).sort(function(a, b){ return (a.ts || 0) - (b.ts || 0); }).slice(-5);
    try{ localStorage.setItem(AKEY, JSON.stringify(merged)); }catch(e){}
    an = obj.analyses.length;
  }
  return { records: rn, issues: inN, analyses: an };
}

/* 待诊断提醒：上次分析之后新增了多少条、台账还有多少未闭环/高危 */
function diagHint(){
  var ans = loadAnalyses();
  var lastTs = ans.length ? Math.max.apply(null, ans.map(function(a){ return a.ts || 0; })) : 0;
  var unseen = load().filter(function(e){ return (e.ts || 0) > lastTs; }).length;
  var open = openIssues();
  return { unseen: unseen, open: open.length,
    openHigh: open.filter(function(x){ return x.severity === "high" && x.status === "open"; }).length };
}
/* ---------- AI 分析 ---------- */
function loadAnalyses(){
  try{ var d = JSON.parse(localStorage.getItem(AKEY) || "[]"); return Array.isArray(d) ? d : []; }
  catch(e){ return []; }
}
function saveAnalysis(text, scope){
  var list = loadAnalyses();
  list.push({ ts: Date.now(), scope: scope || "", text: String(text || "") });
  while(list.length > 5) list.shift();
  try{ localStorage.setItem(AKEY, JSON.stringify(list)); }catch(e){}
  return list[list.length - 1];
}
var DIAG_SYS = "你是浮生（一款 AI 角色扮演 App）的诊断工程师。下面是 App 最近几次调用大模型的完整记录：发给模型的提示词、模型的思考过程、最终答复。请逐条诊断并给出可执行的改进结论，重点检查："
  + "1) 人设一致性：答复是否 OOC、是否违背角色卡与反 OOC 红线；"
  + "2) 视角与代写：旁白是否代写了主角（用户）的动作/表情/心理——这是硬伤；"
  + "3) 提示词健康：有无自相矛盾的指令、重复段落、明显冗余（估算可删字数）、关键约束被淹没；"
  + "4) 思考链异常：思考与答复脱节、思考里已发现的问题答复没落实；"
  + "5) 质量问题：截断、空回复、协议标记泄漏（如场景协议原文出现在正文）、语气漂移。"
  + "输出格式：先给总评（飞轮结论：整体健康度 + 最值得先修的 3 件事），再逐条列问题（注明第几条记录、证据原句、修法建议）。没有问题的维度明确说无。不要复述全部记录，只引关键证据。"
  + "注意：每条记录都标注了产出模型，可能来自不同模型（交叉审核）；若同类问题在某个模型上反复出现，点名指出是哪个模型。"
  + "若附带了「未闭环问题台账」，逐条复查每个问题在本次记录里是否仍然存在，明确写已消失/仍存在。"
  + "正文之后，另用一个 ```json 代码块输出问题清单（供 App 自动落台账）：数组元素为 {\"title\":\"一句话问题\",\"evidence\":\"证据原句\",\"severity\":\"high|mid|low\"}；没有发现问题就输出 []。";
function buildDiagMessages(records){
  var parts = [];
  records.forEach(function(e, i){
    var msgs = (e.messages || []).map(function(m){
      return "[" + (m.role || "?") + "] " + String(m.content || "");
    }).join("\n");
    parts.push("===== 记录 " + (i + 1) + "（" + new Date(e.ts).toLocaleString() + " · 模型 " + (e.model || "?")
      + (e.tag ? " · 场景 " + e.tag : "") + (e.finish ? " · 结束原因 " + e.finish : "")
      + (e.bv ? " · 版本 " + e.bv : "") + (e.error ? " · 出错：" + e.error : "") + "）=====\n"
      + "--- 提示词 ---\n" + msgs
      + "\n--- 思考 ---\n" + (e.thinking || "（无）")
      + "\n--- 答复 ---\n" + (e.reply || "（空）"));
  });
  return [ { role: "system", content: DIAG_SYS },
           { role: "user", content: parts.join("\n\n") } ];
}
/* 交叉审核（2026-11-27）：审核模型单独存，与聊天模型分开——
 * 用 A 模型审 B 模型的答复，避开自诊盲区。空 = 跟随当前聊天模型。 */
var MKEY = "nd_ailog_model";
function getDiagModel(){
  try{ return localStorage.getItem(MKEY) || ""; }catch(e){ return ""; }
}
function setDiagModel(m){
  try{
    if(m) localStorage.setItem(MKEY, String(m));
    else localStorage.removeItem(MKEY);
  }catch(e){}
}
/* ---------- 问题台账（2026-11-27 第三档）：分析结论里的问题落成可追踪
 * 条目，状态 open（待修）→ fixed（已修待验）→ verified（已验证）；
 * 未闭环的会在下一次分析时被带上让审核模型复查，飞轮的「验证」齿。 */
var IKEY = "nd_ailog_issues_v1";
function loadIssues(){
  try{ var d = JSON.parse(localStorage.getItem(IKEY) || "[]"); return Array.isArray(d) ? d : []; }
  catch(e){ return []; }
}
function saveIssues(list){
  try{ localStorage.setItem(IKEY, JSON.stringify(list.slice(-60))); }catch(e){}
}
var issueSeq = 0;
function addIssues(items, fromTs, srcIds){
  if(!items || !items.length) return 0;
  var list = loadIssues(), added = 0;
  items.forEach(function(it){
    if(!it || !it.title) return;
    list.push({ id: "I" + Date.now().toString(36) + (issueSeq++), ts: fromTs || Date.now(),
      title: String(it.title).slice(0, 120), evidence: String(it.evidence || "").slice(0, 300),
      severity: (it.severity === "high" || it.severity === "low") ? it.severity : "mid",
      status: "open", srcIds: (srcIds || []).slice(0, 20) });
    added++;
  });
  saveIssues(list);
  return added;
}
/* 导入诊断包时合并台账：保留对方的状态与来源，不重置成待修 */
function importIssues(items){
  if(!items || !items.length) return 0;
  var list = loadIssues(), added = 0;
  items.forEach(function(it){
    if(!it || !it.title) return;
    list.push({ id: "I" + Date.now().toString(36) + (issueSeq++), ts: it.ts || Date.now(),
      title: String(it.title).slice(0, 120), evidence: String(it.evidence || "").slice(0, 300),
      severity: (it.severity === "high" || it.severity === "low") ? it.severity : "mid",
      status: (it.status === "fixed" || it.status === "verified") ? it.status : "open",
      srcIds: Array.isArray(it.srcIds) ? it.srcIds.slice(0, 20) : [] });
    added++;
  });
  saveIssues(list);
  return added;
}
function setIssueStatus(id, status){
  var list = loadIssues();
  list.forEach(function(x){ if(x.id === id) x.status = status; });
  saveIssues(list);
}
function delIssue(id){
  saveIssues(loadIssues().filter(function(x){ return x.id !== id; }));
}
function openIssues(){
  return loadIssues().filter(function(x){ return x.status !== "verified"; });
}
function parseIssues(text){
  var m = String(text || "").match(/```json\s*([\s\S]*?)```/);
  if(!m) return [];
  try{ var arr = JSON.parse(m[1]); return Array.isArray(arr) ? arr : []; }
  catch(e){ return []; }
}

/* 首尾双截（2026-11-27 审计修复）：早期只留头部，把提示词末尾的压尾铁律
 * 和答复末尾的协议段全切了——审核最该看的两处恰恰在尾巴上。 */
function truncHT(s, head, tail){
  s = String(s || "");
  if(s.length <= head + tail) return s;
  return s.slice(0, head) + "\n…（中段省略 " + (s.length - head - tail) + " 字）…\n" + s.slice(s.length - tail);
}
function analyze(completeFn, cfg, n, ids){
  var all = load();
  var list, scope;
  if(ids && ids.length){
    list = all.filter(function(e){ return ids.indexOf(e.id) >= 0; });
    scope = "勾选 " + list.length + " 条";
  }else{
    list = all.slice(-(n || 10));
    scope = "最近 " + list.length + " 条";
  }
  if(!list.length) return Promise.reject(new Error("还没有记录，先去聊几句再来分析"));
  var trimmed = list.map(function(e){
    return { ts: e.ts, model: e.model, tag: e.tag, error: e.error, finish: e.finish || "", bv: e.bv || "",
      messages: (e.messages || []).map(function(m){
        return { role: m.role, content: truncHT(m.content, 4000, 2000) };
      }),
      thinking: truncHT(e.thinking, 1500, 500),
      reply: truncHT(e.reply, 2000, 1000) };
  });
  var msgs = buildDiagMessages(trimmed);
  var open = openIssues();
  if(open.length){
    msgs[1].content += "\n\n===== 未闭环问题台账（请逐条复查在本次记录中是否仍存在）=====\n"
      + open.map(function(x, i){ return (i + 1) + ". [" + x.status + "] " + x.title + (x.evidence ? "（证据：" + x.evidence + "）" : ""); }).join("\n");
  }
  return Promise.resolve(completeFn(cfg, msgs, 0.3)).then(function(text){
    saveAnalysis(text, scope);
    addIssues(parseIssues(text), Date.now(), list.map(function(e){ return e.id; }));
    return text;
  });
}

try{ window.__aiLogHook = function(rec){ ingest(rec); }; }catch(e){}

return { enabled: enabled, setEnabled: setEnabled, summaries: summaries, get: get,
  clear: clear, stats: stats, exportObj: exportObj, analyze: analyze,
  loadAnalyses: loadAnalyses, splitThink: splitThink, _ingest: ingest,
  getDiagModel: getDiagModel, setDiagModel: setDiagModel,
  loadIssues: loadIssues, setIssueStatus: setIssueStatus, delIssue: delIssue,
  openIssues: openIssues, addIssues: addIssues, parseIssues: parseIssues,
  importObj: importObj, diagHint: diagHint,
  MAX_N: MAX_N, MAX_CHARS: MAX_CHARS };
})();
