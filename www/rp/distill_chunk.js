/* App 端分块 (2026-10-07): 移植自 novel-distill/novel_distill/chunker.py。
 * 按章节标题切分, 超长章节滑窗 (优先场景边界断开)。
 * 输出: [{id, title, text, chars}]
 */
var DISTILL_CHUNK = (function(){
"use strict";

var SCENE_PAT = /^(却说|话说|且说|诗曰|词曰|正是|话分两头)/;

/* 单块上限必须与"送入 LLM 的摘录上限"一致 (distill_core/distill_plot 的 slice)。
 * 原来 块长 8000 + 摘录 6000 → 每块尾部 2000 字永久丢失, 相邻块之间留下盲区,
 * 实测 20 万字只有 84% 进入模型。6000/600 时摘录不再截断, 覆盖率 100%。 */
var MAX_CHARS = 6000;
var DEFAULT_OVERLAP = 600;

function splitChapters(text, chapterPattern){
  var pat = new RegExp(chapterPattern);
  var chapters = [], curTitle = null, curLines = [];
  var lines = text.split("\n");
  for(var i = 0; i < lines.length; i++){
    var s = lines[i].trim();
    if(s && pat.test(s)){
      if(curLines.length || curTitle){
        chapters.push({title: curTitle || "序", body: curLines.join("\n")});
      }
      curTitle = s; curLines = [];
    }else{
      curLines.push(lines[i]);
    }
  }
  if(curLines.length || curTitle){
    chapters.push({title: curTitle || "序", body: curLines.join("\n")});
  }
  return chapters;
}

function sceneBreaks(text, start, end){
  var breaks = [];
  var seg = text.slice(start, end);
  // 空行分段
  var re = /\n\s*\n/g, m;
  while((m = re.exec(seg))){
    var pos = start + m.index + m[0].length;
    if(start < pos && pos < end) breaks.push(pos);
  }
  // 转场标记行
  var lines = seg.split("\n"), off = start;
  for(var i = 0; i < lines.length; i++){
    if(SCENE_PAT.test(lines[i].trim()) && off > start){
      breaks.push(off);
    }
    off += lines[i].length + 1;
  }
  return breaks.sort(function(a, b){ return a - b; });
}

function chunkText(text, maxChars, overlap){
  if(text.length <= maxChars) return [{text: text, cut: "single"}];
  var chunks = [], start = 0, prevStart = -1;
  while(start < text.length){
    var end = Math.min(start + maxChars, text.length);
    var cutKind = "hard";
    if(end < text.length){
      var sb = sceneBreaks(text, start, end).filter(function(b){
        return b > start + Math.floor(maxChars / 3);
      });
      if(sb.length){
        end = sb[sb.length - 1]; cutKind = "scene";
      }else{
        var cut = Math.max(
          text.lastIndexOf("。", end - 1),
          text.lastIndexOf("\n", end - 1),
          text.lastIndexOf("”", end - 1)
        );
        // 确保 cut 在 [start, end) 范围内
        if(cut < start) cut = -1;
        if(cut > start + Math.floor(maxChars / 2)){
          end = cut + 1; cutKind = "sentence";
        }
      }
    }
    chunks.push({text: text.slice(start, end), cut: cutKind});
    if(end >= text.length) break;
    prevStart = start;
    start = end - overlap;
    /* 断点可能落在 start+maxChars/3 之前(场景/句切失败时)，于是 end-overlap 可能
     * 不前进 —— overlap >= maxChars/3 时就是死循环。这里兜底保证每次至少前进
     * maxChars/3，参数再离谱也只是块变多，不会卡死。 */
    if(start - prevStart < 1) start = prevStart + Math.max(1, Math.floor(maxChars / 3));
  }
  return chunks;
}

function chunkNovel(text, opts){
  opts = opts || {};
  var maxChars = opts.maxChars || MAX_CHARS;
  var overlap = opts.overlap || DEFAULT_OVERLAP;
  var chapterPattern = opts.chapterPattern || "^第[一二三四五六七八九十百千零0-9]+[回章].*";
  var out = [];
  var chapters = splitChapters(text, chapterPattern);
  for(var i = 0; i < chapters.length; i++){
    var parts = chunkText(chapters[i].body, maxChars, overlap);
    for(var j = 0; j < parts.length; j++){
      var id = "ch" + String(i + 1).padStart(3, "0") + (parts.length > 1 ? "-" + (j + 1) : "");
      out.push({
        id: id,
        title: chapters[i].title + (parts.length > 1 ? "(" + (j + 1) + "/" + parts.length + ")" : ""),
        text: parts[j].text,
        chars: parts[j].text.length,
        cut: parts[j].cut
      });
    }
  }
  // 知情阶段: 按全书进度切 early/mid/late (防剧透)
  out.forEach(function(c, i){
    var ratio = out.length > 1 ? i / (out.length - 1) : 0;
    c.stage = ratio < 0.33 ? "early" : ratio < 0.66 ? "mid" : "late";
  });
  return out;
}

function stageLabel(s){
  return s === "early" ? "前期" : s === "mid" ? "中期" : "后期";
}

return {chunkNovel: chunkNovel, stageLabel: stageLabel, splitChapters: splitChapters, chunkText: chunkText,
  MAX_CHARS: MAX_CHARS, DEFAULT_OVERLAP: DEFAULT_OVERLAP};
})();
