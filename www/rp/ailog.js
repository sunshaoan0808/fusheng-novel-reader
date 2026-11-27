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
var MAX_N = 40, MAX_CHARS = 1200000;

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
      stream: !!rec.stream,
      tag: rec.tag || "",
      finish: rec.finish || "",
      error: rec.error || "",
      messages: (rec.messages || []).map(function(m){
        return { role: m.role || "", content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) };
      }),
      thinking: rec.thinking || split.thinking || "",
      reply: split.reply
    };
    var list = load();
    list.push(e);
    var total = 0;
    list.forEach(function(x){ total += entryChars(x); });
    while(list.length > 1 && (list.length > MAX_N || total > MAX_CHARS)){
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
  var list = load(), total = 0;
  list.forEach(function(x){ total += entryChars(x); });
  return { n: list.length, chars: total, maxN: MAX_N, maxChars: MAX_CHARS, enabled: enabled() };
}
function exportObj(){
  return { app: "fusheng", kind: "ai-diag-log", exportedAt: new Date().toISOString(),
    records: load(), analyses: loadAnalyses() };
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
  + "注意：每条记录都标注了产出模型，可能来自不同模型（交叉审核）；若同类问题在某个模型上反复出现，点名指出是哪个模型。";
function buildDiagMessages(records){
  var parts = [];
  records.forEach(function(e, i){
    var msgs = (e.messages || []).map(function(m){
      return "[" + (m.role || "?") + "] " + String(m.content || "");
    }).join("\n");
    parts.push("===== 记录 " + (i + 1) + "（" + new Date(e.ts).toLocaleString() + " · 模型 " + (e.model || "?")
      + (e.tag ? " · 场景 " + e.tag : "") + (e.error ? " · 出错：" + e.error : "") + "）=====\n"
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
function analyze(completeFn, cfg, n){
  var list = load().slice(-(n || 10));
  if(!list.length) return Promise.reject(new Error("还没有记录，先去聊几句再来分析"));
  /* 诊断材料太长会把分析调用本身撑爆：单条提示词截到 6000 字、答复 3000、思考 2000 */
  var trimmed = list.map(function(e){
    return { ts: e.ts, model: e.model, tag: e.tag, error: e.error,
      messages: (e.messages || []).map(function(m){
        var c = String(m.content || "");
        return { role: m.role, content: c.length > 6000 ? c.slice(0, 6000) + "…（已截断）" : c };
      }),
      thinking: (e.thinking || "").slice(0, 2000),
      reply: (e.reply || "").slice(0, 3000) };
  });
  return Promise.resolve(completeFn(cfg, buildDiagMessages(trimmed), 0.3)).then(function(text){
    saveAnalysis(text, "最近 " + list.length + " 条");
    return text;
  });
}

try{ window.__aiLogHook = function(rec){ ingest(rec); }; }catch(e){}

return { enabled: enabled, setEnabled: setEnabled, summaries: summaries, get: get,
  clear: clear, stats: stats, exportObj: exportObj, analyze: analyze,
  loadAnalyses: loadAnalyses, splitThink: splitThink, _ingest: ingest,
  getDiagModel: getDiagModel, setDiagModel: setDiagModel,
  MAX_N: MAX_N, MAX_CHARS: MAX_CHARS };
})();
