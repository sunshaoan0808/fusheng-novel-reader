/* RP_BEATS：把「剧本式」正文拆成一条一条的 beat。
* 一条剧本式正文形如：
*   - 谁: '旁白'    说: '她跑到窗边，望着外面的雨。'
*   - 谁: '林黛玉'  表情: '害羞'  动作: '揪着衣角'  说: '才、才没有呢'
*   - 谁: '消息'    来自: '💻 系统'  说: '今晚有流星雨哦'
* parseNarrativeRows 拆出字段行；scriptBeats 把行分类成旁白/消息/玩家/角色四种 beat；
* lookAt / lastLook 判定角色此刻的样子（配立绘）。纯逻辑，不碰 DOM。
*/
const RP_BEATS = (function(){
"use strict";

/* 正文里认识的字段名 */
var FIELD_KEYS = ["谁", "说", "表情", "动作", "来自"];

/* 动作自带的首尾括号：剥掉时认这些配对 */
var BRACKET = {"（":"）", "(":")", "【":"】", "[":"]", "「":"」", "『":"』", "《":"》"};

function isSpace(c){ return c === " " || c === "\t" || c === "\r" || c === "\n"; }

/* 值统一成去首尾空白的字符串：数字转字符串，null/undefined 当空串 */
function toStr(v){
  if(v === null || v === undefined) return "";
  if(typeof v === "number") return String(v);
  return String(v).replace(/^\s+|\s+$/g, "");
}

/* 去掉值首尾各一层单引号或双引号 */
function unquote(v){
  var s = toStr(v);
  if(s.length >= 2){
    var a = s.charAt(0), b = s.charAt(s.length - 1);
    if((a === "'" && b === "'") || (a === '"' && b === '"')){
      s = s.slice(1, s.length - 1).replace(/^\s+|\s+$/g, "");
    }
  }
  return s;
}

/* 模型自己给台词加的「」：只去最外一层 */
function uncorner(v){
  var s = toStr(v);
  if(s.length >= 2 && s.charAt(0) === "「" && s.charAt(s.length - 1) === "」"){
    s = s.slice(1, s.length - 1).replace(/^\s+|\s+$/g, "");
  }
  return s;
}

/* 动作自带的首尾括号：先剥掉，显示时再由本模块包回去 */
function unbracket(v){
  var s = toStr(v);
  if(s.length >= 2){
    var a = s.charAt(0), b = s.charAt(s.length - 1);
    if(BRACKET[a] && BRACKET[a] === b){
      s = s.slice(1, s.length - 1).replace(/^\s+|\s+$/g, "");
    }
  }
  return s;
}

/* 一行拆成若干 key/value：值可带引号，引号里的冒号不算分隔符 */
function parseFields(s){
  var pairs = [];
  var i = 0, n = s.length;
  while(i < n){
    while(i < n && isSpace(s.charAt(i))) i++;
    if(i >= n) break;
    var ks = i;
    while(i < n && !isSpace(s.charAt(i)) && s.charAt(i) !== ":" && s.charAt(i) !== "：") i++;
    var key = s.slice(ks, i);
    var j = i;
    while(j < n && isSpace(s.charAt(j))) j++;
    if(j >= n || (s.charAt(j) !== ":" && s.charAt(j) !== "：")){
      i = (j < n) ? j : n;
      continue;
    }
    i = j + 1;
    while(i < n && isSpace(s.charAt(i))) i++;
    var vs = i, val = "";
    if(i < n && (s.charAt(i) === "'" || s.charAt(i) === '"')){
      var q = s.charAt(i);
      var end = s.indexOf(q, i + 1);
      if(end < 0){ val = s.slice(i); i = n; }
      else { val = s.slice(i, end + 1); i = end + 1; }
    } else {
      while(i < n){
        if(isSpace(s.charAt(i)) && /^\s+[^\s:：]+\s*[:：]/.test(s.slice(i))) break;
        i++;
      }
      val = s.slice(vs, i);
    }
    if(key) pairs.push([key, val]);
  }
  return pairs;
}

/* 正文 -> 字段行数组。拆不出条目就返回空数组，调用方据此回落普通渲染 */
function parseNarrativeRows(text){
  var rows = [];
  if(text === null || text === undefined) return rows;
  var s = String(text);
  var m = s.match(/<narrative>([\s\S]*?)<\/narrative>/i);
  if(m) s = m[1];
  var lines = s.split(/\r?\n/);
  var cur = null;
  for(var i = 0; i < lines.length; i++){
    var line = lines[i];
    if(!line || !line.trim()) continue;
    var rest = null;
    var lead = line.match(/^\s*[-－]\s*谁\s*[:：]/);
    if(lead){
      if(cur) rows.push(cur);
      cur = {};
      rest = "谁:" + line.slice(lead[0].length);
    } else if(!cur){
      continue;
    } else {
      rest = line.replace(/^\s*[-－]\s*/, "");
    }
    var pairs = parseFields(rest);
    for(var j = 0; j < pairs.length; j++){
      if(FIELD_KEYS.indexOf(pairs[j][0]) >= 0) cur[pairs[j][0]] = unquote(pairs[j][1]);
    }
  }
  if(cur) rows.push(cur);
  return rows;
}

/* 字段行 -> beat 数组，顺序就是正文里写的顺序 */
function scriptBeats(rows, charName){
  var beats = [];
  if(!rows || !rows.length) return beats;
  var name = toStr(charName);
  for(var i = 0; i < rows.length; i++){
    var row = rows[i];
    if(!row) continue;
    var speaker = toStr(row["谁"]);
    var line = uncorner(row["说"]);
    var expr = toStr(row["表情"]);
    var act = unbracket(row["动作"]);
    if(speaker === "旁白"){
      if(!line) continue;
      if(line.indexOf("💭") === 0) continue; /* 💭 是代理对，charAt(0) 取不到整字 */
      beats.push({kind: "narr", text: line});
      continue;
    }
    if(speaker === "消息"){
      if(!line) continue;
      beats.push({kind: "note", source: toStr(row["来自"]), text: line});
      continue;
    }
    if(!act && !line) continue;
    var text = "";
    if(act) text += "（" + act + "）";
    if(line) text += "「" + line + "」";
    if(speaker && speaker !== name){
      beats.push({kind: "you", text: text});
    } else {
      beats.push({kind: "her", text: text, say: !!line, look: {expr: expr, act: act, seed: text}});
    }
  }
  return beats;
}

/* 第 idx 句时角色是什么样子：先看本句，再往前找，再往后找 */
function lookAt(beats, idx, fallback){
  if(!beats || !beats.length) return fallback;
  var i = (typeof idx === "number" && isFinite(idx)) ? Math.floor(idx) : 0;
  var b = beats[i];
  if(b && b.kind === "her") return b.look;
  for(var j = i - 1; j >= 0; j--){
    if(beats[j] && beats[j].kind === "her") return beats[j].look;
  }
  for(var k = i + 1; k < beats.length; k++){
    if(beats[k] && beats[k].kind === "her") return beats[k].look;
  }
  return fallback;
}

/* 这一轮角色最后一句的样子 */
function lastLook(beats){
  if(!beats || !beats.length) return null;
  for(var i = beats.length - 1; i >= 0; i--){
    if(beats[i] && beats[i].kind === "her") return beats[i].look;
  }
  return null;
}

return {scriptBeats: scriptBeats, lookAt: lookAt, lastLook: lastLook, parseNarrativeRows: parseNarrativeRows};
})();
if(typeof module !== "undefined" && module.exports) module.exports = RP_BEATS;
