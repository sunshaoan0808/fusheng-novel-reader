/* 暗线与世界约束（2026-11-24 蒸馏全利用三期）：
 * 把此前只躺在书架页展示的 run 级蒸馏产物接进主聊天 prompt——
 * 未回收伏笔（按在场人物）、原著冲突、世界观组字段（守则适配/规则观/
 * 剧情限制）、判词（红楼 foretell）、当前段大纲、对照人物关系。
 * 纯规则、零 LLM；组装方式与画像/世界模拟一致：chat.js 在 buildMessages
 * 后把本段追加到 system 末尾。数据缺失静默跳过，绝不抛错。 */
var RP_WORLDLINE = (function(){
"use strict";

var TOTAL_CAP = 720;

function cut(s, n){
  s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function uniqNames(name, present){
  var out = [], seen = {};
  [name].concat(present || []).forEach(function(n){
    n = String(n || "").trim();
    if(n && !seen[n]){ seen[n] = 1; out.push(n); }
  });
  return out;
}
function hitNames(itemChars, names){
  if(!Array.isArray(itemChars)) return 0;
  var n = 0;
  itemChars.forEach(function(c){ if(names.indexOf(String(c || "").trim()) >= 0) n++; });
  return n;
}

/* 未回收伏笔：status open/partial（resolved 除外），人物命中多者优先，同分保持原序 */
function foreshadowLines(run, names){
  var fs = (run && run.foreshadowing) || [];
  var cand = [];
  fs.forEach(function(f, i){
    if(!f || f.status === "resolved") return;
    var hit = hitNames(f.characters, names);
    if(hit > 0 && f.hook) cand.push({f: f, hit: hit, i: i});
  });
  cand.sort(function(a, b){
    var sa = a.f.status === "open" ? 0 : 1, sb = b.f.status === "open" ? 0 : 1;
    if(sa !== sb) return sa - sb;
    if(b.hit !== a.hit) return b.hit - a.hit;
    return a.i - b.i;
  });
  return cand.slice(0, 4).map(function(c){ return "· 伏笔：" + cut(c.f.hook, 64); });
}

/* 原著冲突：双方都在场优先，其次单方在场 */
function conflictLines(run, names){
  var cs = (run && run.conflicts) || [];
  var cand = [];
  cs.forEach(function(c, i){
    if(!c || !c.title) return;
    var hit = hitNames(c.parties, names);
    if(hit > 0) cand.push({c: c, hit: hit, i: i});
  });
  cand.sort(function(a, b){ if(b.hit !== a.hit) return b.hit - a.hit; return a.i - b.i; });
  return cand.slice(0, 2).map(function(x){
    return "· 冲突：" + cut(x.c.title, 30) + (x.c.stakes ? "（利害：" + cut(x.c.stakes, 36) + "）" : "");
  });
}

/* 世界约束：世界观组三字段，按在场人物卡汇总（各取第一条非空） */
function constraintLines(cards){
  var defs = [["world_rule_fit", "守则适配"], ["rule_view", "规则观"], ["plot_restriction", "剧情限制"]];
  var out = [];
  defs.forEach(function(d){
    for(var i = 0; i < (cards || []).length; i++){
      var v = ((cards[i] && cards[i].fields) || {})[d[0]];
      if(v && String(v).trim()){ out.push("· " + d[1] + "：" + cut(v, 56)); break; }
    }
  });
  return out;
}

/* 判词/谶纬（红楼 foretell）：只取当前角色命中的第一条 */
function foretellLines(run, name){
  var items = (run && run.foretell && run.foretell.items) || [];
  for(var i = 0; i < items.length; i++){
    var it = items[i];
    if(it && Array.isArray(it.characters) && it.characters.indexOf(name) >= 0 && it.text)
      return ["· " + (it.type || "判词") + "（" + cut(it.title || "", 16) + "）：" + cut(it.text, 90)];
  }
  return [];
}

/* 对照人物：主角卡 foil_pairs 原文提到在场人物时才注入 */
function foilLines(card, names, name){
  var fp = ((card && card.fields) || {}).foil_pairs;
  if(!fp) return [];
  var s = String(fp);
  var others = names.filter(function(n){ return n !== name; });
  for(var i = 0; i < others.length; i++)
    if(s.indexOf(others[i]) >= 0) return ["· 对照关系：" + cut(s, 80)];
  return [];
}

/* 当前段大纲（sections 与 chapterIdx 同源，见 chat.js buildChapterInstr） */
function outlineLines(run, chapterIdx){
  var secs = (run && run.sections) || [];
  if(typeof chapterIdx !== "number" || chapterIdx < 0 || chapterIdx >= secs.length) return [];
  var out = [];
  if(secs[chapterIdx] && secs[chapterIdx].summary)
    out.push("· 当前段大纲：" + cut(secs[chapterIdx].summary, 100));
  if(secs[chapterIdx + 1] && secs[chapterIdx + 1].title)
    out.push("· 下一段：" + cut(secs[chapterIdx + 1].title, 24));
  return out;
}

/* 主入口：opts = {name, present:[], cards:[主角卡, ...在场卡], chapterIdx} */
function build(run, opts){
  try{
    opts = opts || {};
    var names = uniqNames(opts.name, opts.present);
    if(!run || !names.length) return "";
    var groups = [
      constraintLines(opts.cards || []),
      foreshadowLines(run, names),
      foretellLines(run, opts.name),
      conflictLines(run, names),
      foilLines((opts.cards || [])[0], names, opts.name),
      outlineLines(run, opts.chapterIdx),
    ];
    var lines = [], used = 0;
    groups.forEach(function(g){
      g.forEach(function(l){
        if(used + l.length + 1 <= TOTAL_CAP){ lines.push(l); used += l.length + 1; }
      });
    });
    if(!lines.length) return "";
    return "【暗线与世界约束】（来自原著蒸馏：叙述可呼应、埋线，但不可提前揭底、不可违背）\n" + lines.join("\n");
  }catch(e){ return ""; }
}

/* 导演用叙事定位（叙事功能组：本来就不是给角色本人的，是给编排者的） */
function narrativeBrief(card){
  try{
    var f = (card && card.fields) || {};
    var defs = [["theme_role", "主题"], ["story_role", "功能"], ["ensemble_role", "群像"], ["pre_intro", "登场前"]];
    var parts = [];
    defs.forEach(function(d){
      var v = f[d[0]];
      if(v && String(v).trim()) parts.push(d[1] + "：" + cut(v, 42));
    });
    return parts.join("；");
  }catch(e){ return ""; }
}

return {build: build, narrativeBrief: narrativeBrief,
  _foreshadowLines: foreshadowLines, _conflictLines: conflictLines,
  _constraintLines: constraintLines, _foretellLines: foretellLines};
})();
