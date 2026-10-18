/* 内联事件处理器普查（onclick 迁移事件委托的前置分析）
 * 用法：node tools/onclick_census.js            （ stdout 摘要 + 写 JSON 明细）
 *      node tools/onclick_census.js --full      （ 额外打印全部清单）
 *
 * 分类维度：
 *   事件类型 click/change/input/mouseover/blur/focus/keyup/其他
 *   静态（无 ${} 插值）/ 动态（有插值）
 *   动态的转义状态：jq/jqJ（双上下文，安全）/ escH（仅 HTML 层）/ 无转义（裸）
 *   handler 形态：单次调用 NS.fn(args) / 含 this 或 event / 多语句或复杂表达式
 *   插值表达式种类：jq(x) / jqJ(x) / escH(x) / 裸标识符 / 字面量 / 其他
 */
"use strict";
const fs = require("fs");
const path = require("path");

const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const OUT = path.join(__dirname, "..", "onclick_census.json");

function walk(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === "data" || d.name === "bg" || d.name === "fonts") return;
      walk(p, acc);
    } else if (/\.js$/.test(d.name)) acc.push(p);
  });
  return acc;
}
const files = walk(WWW, []).filter(f => path.basename(f) !== "data.js");
const read = f => fs.readFileSync(f, "utf8");
const rel = f => path.relative(WWW, f).replace(/\\/g, "/");

/* 取 on*="..." 的完整属性值。难点：模板字符串里 JS 层的引号（如
 * map(x=>"'" + jq(x) + "'")）不是属性定界符——朴素 indexOf('"') 会被
 * 提前截断导致误判。策略：跳过 ${...} 插值区（内部按 JS 字符串规则扫），
 * 属性结束引号判定为「后面跟 > / 空白 / /」的那个。 */
function attrValue(src, from) {
  const q = src[from];
  if (q !== '"' && q !== "'") return null;
  let i = from + 1, out = "";
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { out += src[i] + src[i + 1]; i += 2; continue; }
    if (ch === "$" && src[i + 1] === "{") {
      let j = i + 2, depth = 1, str = null;
      for (; j < src.length; j++) {
        const c = src[j];
        if (str) { if (c === "\\") { j++; continue; } if (c === str) str = null; continue; }
        if (c === "'" || c === '"' || c === "`") { str = c; continue; }
        if (c === "{") depth++;
        else if (c === "}") { depth--; if (!depth) break; }
      }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === q) {
      const next = src[i + 1];
      if (next === undefined || /[>\s/]/.test(next)) return out;
      out += ch; i++; continue;
    }
    out += ch; i++;
  }
  return null;
}
/* 提取 ${...} 插值表达式（模板串内外都可，按花括号配对） */
function interps(code) {
  const res = [];
  let i = 0;
  while (i < code.length) {
    const at = code.indexOf("${", i);
    if (at < 0) break;
    let j = at + 2, depth = 1, str = null;
    for (; j < code.length; j++) {
      const ch = code[j];
      if (str) { if (ch === "\\") { j++; continue; } if (ch === str) str = null; continue; }
      if (ch === "'" || ch === '"' || ch === "`") { str = ch; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (!depth) break; }
    }
    res.push(code.slice(at + 2, j));
    i = j + 1;
  }
  return res;
}
function exprKind(e) {
  const t = e.trim();
  if (/^jq\s*\(/.test(t)) return "jq";
  if (/^jqJ\s*\(/.test(t)) return "jqJ";
  if (/^escH\s*\(/.test(t)) return "escH";
  if (/^esc\s*\(/.test(t)) return "esc";
  if (/^(['"]).*\1$/.test(t)) return "literal";
  if (/^[\w$.]+$/.test(t)) return "bare";
  /* 复杂表达式内部已用 jq/jqJ 的（三元/ map 等），按已转义算 */
  if (/\bjq\s*\(|\bjqJ\s*\(/.test(t)) return "jq";
  return "complex";
}
function shapeOf(code) {
  const t = code.trim().replace(/;+\s*$/, "");
  if (/\bthis\b/.test(t) || /\bevent\b/.test(t)) return "usesThisOrEvent";
  /* 单次调用：NS.fn(a,b) / fn()——允许参数里嵌套括号与模板串 */
  let depth = 0, str = null, callIdx = -1;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (str) { if (ch === "\\") { i++; continue; } if (ch === str) str = null; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { str = ch; continue; }
    if (ch === "(") { if (depth === 0) callIdx = i; depth++; }
    else if (ch === ")") depth--;
    else if (depth === 0 && (ch === ";" || ch === "=" || ch === "+")) return "complex";
  }
  if (callIdx < 0) return "noCall";
  const head = t.slice(0, callIdx).trim();
  if (!/^[\w$.]+$/.test(head)) return "complex";
  return "singleCall";
}

const items = [];
const agg = {
  byEvent: {}, byKind: {}, byShape: {}, byEsc: {},
  total: 0, static: 0, dynamic: 0, escOk: 0, escHtmlOnly: 0, escNone: 0,
};
const EV = /^on(click|change|input|mouseover|blur|focus|keyup|keydown|submit|load|error)$/;

files.forEach(f => {
  const src = read(f);
  const re = /\bon(click|change|input|mouseover|blur|focus|keyup|keydown|submit|load|error)\s*=\s*(["'])/g;
  let m;
  while ((m = re.exec(src))) {
    const ev = m[1];
    const code = attrValue(src, m.index + m[0].length - 1);
    if (code == null) continue;
    const line = src.slice(0, m.index).split("\n").length;
    const ivs = interps(code);
    const dynamic = ivs.length > 0;
    let esc = "n/a";
    if (dynamic) {
      const kinds = ivs.map(exprKind);
      if (kinds.some(k => k === "jq" || k === "jqJ")) esc = "jq";
      else if (kinds.some(k => k === "escH" || k === "esc")) esc = "escH";
      else esc = "none";
    }
    const shape = shapeOf(code);
    const it = { file: rel(f), line, ev, dynamic, esc, shape, code: code.replace(/\s+/g, " ").slice(0, 160), ivs: ivs.map(e => e.trim().slice(0, 60)) };
    items.push(it);
    agg.total++;
    agg.byEvent[ev] = (agg.byEvent[ev] || 0) + 1;
    agg.byKind[it.ivs.length ? "dyn" : "static"] = (agg.byKind[it.ivs.length ? "dyn" : "static"] || 0) + 1;
    agg.byShape[shape] = (agg.byShape[shape] || 0) + 1;
    if (dynamic) {
      agg.dynamic++;
      agg.byEsc[esc] = (agg.byEsc[esc] || 0) + 1;
      if (esc === "jq") agg.escOk++;
      else if (esc === "escH") agg.escHtmlOnly++;
      else agg.escNone++;
    } else agg.static++;
  }
});

/* ---- 汇总输出 ---- */
const pct = n => (n / agg.total * 100).toFixed(1) + "%";
console.log("== 内联事件处理器普查 ==");
console.log(`总计 ${agg.total}：静态 ${agg.static}（${pct(agg.static)}） / 动态 ${agg.dynamic}（${pct(agg.dynamic)}）`);
console.log(`动态转义：jq/jqJ 安全 ${agg.escOk} / 仅 escH ${agg.escHtmlOnly} / 无转义 ${agg.escNone}`);
console.log(`形态：`, JSON.stringify(agg.byShape));
console.log(`事件：`, JSON.stringify(agg.byEvent));

console.log("\n== 迁移优先级 ==");
const migratable = items.filter(i => i.shape === "singleCall" && !i.dynamic);
console.log(`A. 静态单调用（零参数风险，纯机械迁移）：${migratable.length} 处`);
const dynSafe = items.filter(i => i.dynamic && i.esc === "jq" && i.shape === "singleCall");
console.log(`B. 动态已转义单调用（jq 就绪，迁移后 escap 逻辑进 data-* 取值）：${dynSafe.length} 处`);
const dynNone = items.filter(i => i.dynamic && i.esc === "none");
console.log(`C. 动态无转义（真正的 XSS 面，必须优先处理）：${dynNone.length} 处`);
const keep = items.filter(i => i.shape !== "singleCall");
console.log(`D. this/event 或复杂表达式（需逐个人工判断，不建议本批动）：${keep.length} 处`);

console.log("\n== C 类明细（动态无转义，优先） ==");
dynNone.forEach(i => console.log(`  ${i.file}:${i.line} [${i.ev}] ${i.code.slice(0, 110)}`));

console.log("\n== 逐文件统计（总数/动态/无转义） ==");
const byFile = {};
items.forEach(i => {
  const b = byFile[i.file] || (byFile[i.file] = { total: 0, dynamic: 0, none: 0, static: 0 });
  b.total++;
  if (i.dynamic) { b.dynamic++; if (i.esc === "none") b.none++; } else b.static++;
});
Object.keys(byFile).sort((a, b) => byFile[b].total - byFile[a].total).forEach(f => {
  const b = byFile[f];
  console.log(`  ${f}: ${b.total}（静态 ${b.static} / 动态 ${b.dynamic} / 无转义 ${b.none}）`);
});

fs.writeFileSync(OUT, JSON.stringify({ agg, items }, null, 2));
console.log("\n明细已写", path.relative(process.cwd(), OUT));

if (process.argv.includes("--full")) {
  console.log("\n== 全量清单 ==");
  items.forEach(i => console.log(`${i.file}:${i.line} [${i.ev}] ${i.dynamic ? "dyn/" + i.esc : "static"} ${i.shape} :: ${i.code.slice(0, 100)}`));
}
