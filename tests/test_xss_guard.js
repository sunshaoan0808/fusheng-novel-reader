/* XSS 防线回归闸门（2026-10-18，审计建议 4 的固化部分）
 *
 * 不追求「零裸插值」（605 处里大量是 icon()/md() 等已审安全出口与硬编码），
 * 而是钉住基线防劣化：总数、逐文件数、onclick 未用 jq 数、私复制转义函数
 * 都不允许增长。转义收敛后应只剩下降空间。
 *
 * 首次运行：node tests/test_xss_guard.js --update-baseline   （生成基线）
 * 之后运行：node tests/test_xss_guard.js                     （比对基线）
 *
 * 已知盲区（2026-10 记录，勿忘）: exprs() 把 ${} 里的反引号当字符串边界吞掉,
 * 嵌套模板字面量（`${cond ? `<b>${x}</b>` : ""}`）内层的插值不计入。
 * 两层含义: ① 计数是低估, 真实裸插值更多; ② 变异测试必须在外层模板上植,
 * 往嵌套模板里植多少都不会触发闸门（已实测）。
 * 补盲要重exprs递归+重钉全仓基线, 属独立任务, 不在本闸门范围里顺手做。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const BASELINE = path.join(__dirname, "fixtures", "xss_baseline.json");
const UPDATE = process.argv.includes("--update-baseline");

/* ── 扫描逻辑（与 probe-frontend/probe.js 同源，SAFE 增强：icon()/md() 是已审安全出口） ── */
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

function exprs(tpl) {
  const res = [];
  let i = 0;
  while (i < tpl.length) {
    const at = tpl.indexOf("${", i);
    if (at < 0) break;
    let j = at + 2, depth = 1, str = null;
    for (; j < tpl.length; j++) {
      const ch = tpl[j];
      if (str) { if (ch === "\\") { j++; continue; } if (ch === str) str = null; continue; }
      if (ch === "'" || ch === '"' || ch === "`") { str = ch; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (!depth) break; }
    }
    res.push(tpl.slice(at + 2, j));
    i = j + 1;
  }
  return res;
}
function tplAt(src, from, opts) {
  let i = from;
  const lim = Math.min(src.length, from + 400);
  while (i < lim && /\s/.test(src[i])) i++;
  const strict = !(opts && opts.allowArg);
  if (src[i] !== "`") {
    if (strict) return null;
    const comma = src.indexOf(",", i);
    if (comma < 0 || comma > lim) return null;
    i = comma + 1;
    while (i < lim && /\s/.test(src[i])) i++;
    if (src[i] !== "`") return null;
  }
  const start = i;
  let j = start + 1, depth = 0;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === "\\") { j++; continue; }
    if (ch === "$" && src[j + 1] === "{") { depth++; j++; continue; }
    if (ch === "}" && depth) { depth--; continue; }
    if (ch === "`" && !depth) return src.slice(start + 1, j);
  }
  return null;
}
/* 已审安全出口：esc 系转义 + icon()（硬编码 SVG）+ md()（inline 首行 esc）
 * + renderAnnotated()（distill_ui.js: esc(text) 全量转义后再做四态标注替换,
 *   替换串的 label/color 来自固定映射或正则约束的 [a-z0-9_-]+, title 再过一道 esc）。
 *   2026-10 P2 补外在行时新增 4 处 renderAnnotated 插值触发闸门 —— 包装器本身
 *   可证明安全, 正确的修法是把出口登记进来, 不是抬基线(抬基线=闸门报废)。 */
const SAFE = /(esc|jq\(|jqJ\(|icon\(|md\(|renderAnnotated\(|encodeURI|toFixed|Number\(|parseInt\()/;

function scanP1() {
  let totalExpr = 0, safe = 0, numeric = 0, risky = 0;
  const byFile = {};
  files.forEach(f => {
    const src = read(f);
    const re = /\.(innerHTML|outerHTML)\s*(\+?=)|insertAdjacentHTML\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      const tpl = tplAt(src, m.index + m[0].length, {allowArg: /insertAdjacentHTML/.test(m[0])});
      if (!tpl) continue;
      exprs(tpl).forEach(e => {
        totalExpr++;
        const isSafe = SAFE.test(e);
        const numOnly = !isSafe && (/(^|[^.\w])(i|j|k|idx|index|n|len|length|count|num)$/.test(e.trim()) ||
          /^(Math\.|.*\.length$|.*\+\s*\d+$|\d+$)/.test(e.trim())) && !/["']/.test(e);
        if (isSafe) { safe++; }
        else if (numOnly) { numeric++; }
        else { risky++; byFile[rel(f)] = (byFile[rel(f)] || 0) + 1; }
      });
    }
  });
  return { totalExpr, safe, numeric, risky, byFile };
}
function scanP2() {
  let inline = 0, withTpl = 0, withJq = 0, withEsc = 0, noJq = 0;
  files.forEach(f => {
    const src = read(f);
    const re = /\bon(click|change|input|mouseover|blur|focus|keyup)\s*=\s*"/g;
    let m;
    while ((m = re.exec(src))) {
      inline++;
      const end = src.indexOf('"', m.index + m[0].length);
      const code = src.slice(m.index, end < 0 ? m.index + 200 : end);
      if (code.indexOf("${") < 0) continue;
      withTpl++;
      if (/jq\(|jqJ\(/.test(code)) withJq++;
      else if (/esc[H A]?\(/.test(code)) withEsc++;
      else noJq++;
    }
  });
  return { inline, withTpl, withJq, withEsc, noJq };
}
/* 私复制转义函数：无条件定义只允许在 escutil.js（唯一出口）。
 * 「全局优先 + 兜底」形态（var esc = (typeof escH...) ? escH : function...）
 * 是收敛后的标准写法，豁免——它浏览器里永远走全局，无分叉风险。
 * 注意：函数名与 var 之间必须有空白（function\s+ / var\s+），否则正则
 * 什么都匹配不到，闸门空转（2026-10-18 修复过这个坑）。 */
function scanPrivateEscape() {
  const allow = { "rp/escutil.js": 1 };
  const FALLBACK = /typeof[ \t]+(?:escH|jq|jqJ)|window\.(?:escH|jq|jqJ)/;
  const hits = [];
  files.forEach(f => {
    const src = read(f);
    const re = /^[ \t]*(?:function[ \t]+|(?:var|const|let)[ \t]+)(esc|escH|jq|jqJ|escapeHtml)[ \t]*[=(]/gm;
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split("\n").length;
      const lineSrc = src.split("\n")[line - 1];
      if (FALLBACK.test(lineSrc)) continue;
      if (!allow[rel(f)]) hits.push(rel(f) + ":" + line);
    }
  });
  return hits;
}

const now = {
  P1: scanP1(),
  P2: scanP2(),
  privateEscape: scanPrivateEscape(),
};

if (UPDATE) {
  const base = {
    note: "XSS 防线基线 2026-10-18（审计建议4 固化）。数量只许降不许升。",
    P1: { totalExpr: now.P1.totalExpr, safe: now.P1.safe, numeric: now.P1.numeric, risky: now.P1.risky, byFile: now.P1.byFile },
    P2: { inline: now.P2.inline, withTpl: now.P2.withTpl, withJq: now.P2.withJq, withEsc: now.P2.withEsc, noJq: now.P2.noJq },
    privateEscape: now.privateEscape,
  };
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(base, null, 2) + "\n");
  console.log("baseline written:", path.relative(process.cwd(), BASELINE));
  console.log("  P1 risky =", now.P1.risky, " P2 noJq =", now.P2.noJq, " privateEscape =", now.privateEscape.length);
  process.exit(0);
}

let base;
try { base = JSON.parse(fs.readFileSync(BASELINE, "utf8")); }
catch (e) { console.log("FAIL: 基线缺失，先跑 --update-baseline"); process.exit(1); }

let pass = 0, fail = 0;
const t = (n, c, detail) => { c ? pass++ : (fail++, console.log("FAIL:", n, detail || "")); };

/* P1：总量与逐文件都不许增长（基线没列的文件必须 0——新文件不许带入裸插值） */
t("P1 裸插值总数不增长", now.P1.risky <= base.P1.risky, `现在 ${now.P1.risky} / 基线 ${base.P1.risky}`);
for (const f of Object.keys(base.P1.byFile)) {
  const cur = now.P1.byFile[f] || 0;
  t("P1 " + f + " 不增长", cur <= base.P1.byFile[f], `现在 ${cur} / 基线 ${base.P1.byFile[f]}`);
}
const newRisky = Object.keys(now.P1.byFile).filter(f => !(f in base.P1.byFile) && now.P1.byFile[f] > 0);
t("P1 无新文件带入裸插值", newRisky.length === 0, newRisky.join(","));

/* P2：onclick 带插值未用 jq 的数不许增长 */
t("P2 未用 jq 的 onclick 插值不增长", now.P2.noJq <= base.P2.noJq, `现在 ${now.P2.noJq} / 基线 ${base.P2.noJq}`);

/* 私复制转义：收敛后只允许 0（escutil.js 是唯一出口；soul_warm 兜底形式已豁免） */
t("无私复制转义函数", now.privateEscape.length === 0, now.privateEscape.join(","));

/* escutil.js 三件套仍在（防被误删导致全盘退兜底） */
const eu = read(path.join(WWW, "rp", "escutil.js"));
t("escutil.js 导出 jq/jqJ/escH", /function jq\(/.test(eu) && /function jqJ\(/.test(eu) && /function escH\(/.test(eu));

console.log(`\nxss_guard: ${pass} pass, ${fail} fail`);
console.log(`  P1: 插值 ${now.P1.totalExpr}（转义 ${now.P1.safe} / 数字 ${now.P1.numeric} / 裸 ${now.P1.risky}，基线 ${base.P1.risky}）`);
console.log(`  P2: 内联 ${now.P2.inline}，带插值 ${now.P2.withTpl}，未用 jq ${now.P2.noJq}（基线 ${base.P2.noJq}）`);
process.exit(fail ? 1 : 0);
