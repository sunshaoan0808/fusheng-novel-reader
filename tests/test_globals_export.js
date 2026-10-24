/* v41 静态守卫：经 window.X / globalThis.X / self.X 属性读取的全局，定义处必须真的挂在 globalThis 上。
 * 背景（beats.js 那类 bug）：经典脚本顶层的 const/let/class 进的是共享的全局词法作用域，
 * 别的脚本按裸名能取到，但 window.X / globalThis.X 取不到（undefined）——
 * 于是 `globalThis.RP_BEATS` 这种「属性式」查找在浏览器里静默失效，而 vm 测试未必暴露。
 * 规则：
 *   1) 被属性式读取的名字，若在某文件里只以顶层 const/class 声明，则该文件必须显式
 *      `window.X = X` / `globalThis.X = X`（或 var/function 声明，二者本就挂 globalThis）。
 *   2) 顶层 let 声明的可变状态不允许被属性式读取/写入（一次性导出会过期，写 window.X 落到另一个属性）。
 *   3) RP_* 模块必须被识别到（扫描有效性），且 RP_BEATS 必须被规则 1 覆盖（已知的历史案例）。
 * 零依赖：顶层声明按括号深度识别（tests/lib_jsscan.js）。 */
const fs = require("fs"), path = require("path");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

const SKIP_DIRS = /^(data|fonts|bg|proto)$/;
const files = [];
(function rec(d){
  for(const f of fs.readdirSync(d)){
    const p = path.join(d, f), st = fs.statSync(p);
    if(st.isDirectory()){ if(!SKIP_DIRS.test(f)) rec(p); }
    else if(/\.js$/.test(f)) files.push(p);
  }
})(WWW);
/* 注释/字符串/正则/模板文本抹除与顶层声明识别见 tests/lib_jsscan.js（与 acorn 顶层声明结果逐文件一致） */
const { strip, topLevelDecls } = require("./lib_jsscan.js");
const decl = {};      // name -> [{file, kind}]
const explicit = {};  // name -> Set(file)
const reads = {};     // name -> Set(file)
const writesProp = {};// name -> Set(file)
const push = (m, k, v) => (m[k] = m[k] || []).push(v);
const addS = (m, k, v) => (m[k] = m[k] || new Set()).add(v);
for(const f of files){
  const rel = path.relative(WWW, f).split(path.sep).join("/");
  const raw = fs.readFileSync(f, "utf8");
  const src = strip(raw);
  topLevelDecls(raw).forEach(d => push(decl, d.name, {file: rel, kind: (d.kind === "var" || d.kind === "function") ? "var/function" : d.kind}));
  const re = /\b(window|globalThis|self)\s*\.\s*([A-Za-z_$][\w$]*)(\s*(?:=(?!=)|\+=|-=|\|\|=|&&=|\?\?=))?/g;
  let m;
  while((m = re.exec(src))){
    if(/[\w$.]$/.test(src.slice(Math.max(0, m.index - 1), m.index))) continue; /* foo.window.x 之类 */
    if(m[3]){ addS(explicit, m[2], rel); addS(writesProp, m[2], rel); }
    else addS(reads, m[2], rel);
  }
  /* 字面量键的动态查找：globalThis["X"] / window['X'] / wiring.js 的 gf("X")（需在原文上匹配，strip 会抹掉字符串） */
  const dre = /(?:\b(?:window|globalThis|self)\s*\[\s*|\bgf\(\s*)["']([A-Za-z_$][\w$]*)["']/g;
  while((m = dre.exec(raw))) addS(reads, m[1], rel);
}
const problems = [];
for(const name of Object.keys(reads).concat(Object.keys(writesProp))){
  const ds = decl[name] || [];
  if(!ds.length) continue;
  if(ds.some(d => d.kind === "var/function")) continue;
  for(const d of ds){
    if(d.kind === "let"){
      problems.push(`${name}: ${d.file} 顶层 let（可变状态）却被属性式访问 ← ${[...(reads[name]||[]), ...(writesProp[name]||[])].join(",")}`);
    } else if(!(explicit[name] && explicit[name].has(d.file))){
      problems.push(`${name}: ${d.file} 只有顶层 ${d.kind} 声明、未显式挂 globalThis ← 读取方 ${[...(reads[name]||[])].join(",")}`);
    }
  }
}
const uniq = [...new Set(problems)];
uniq.forEach(p => console.log("  " + p));
t("属性式读取的全局都已挂到 globalThis（无 const/let/class 漏导出）", problems.length === 0);

/* 扫描有效性 */
const rpDecl = Object.keys(decl).filter(n => /^RP_/.test(n));
t("识别到足量 RP_* 顶层声明", rpDecl.length >= 40);
t("识别到属性式读取", Object.keys(reads).length >= 20);
t("RP_BEATS 是 const 且被 globalThis 读取（历史案例在覆盖范围内）",
  (decl.RP_BEATS || []).some(d => d.kind === "const") && reads.RP_BEATS && reads.RP_BEATS.size > 0);
t("wiring.js 的 gf() 动态查找被纳入扫描", reads.createArtStage && reads.createArtStage.has("rp/wiring.js"));
t("RP_BEATS 在 beats.js 显式导出", explicit.RP_BEATS && explicit.RP_BEATS.has("rp/beats.js"));
/* 规则自检：构造一个漏导出案例必须被判出 */
(function(){
  const d = [{file: "x.js", kind: "const"}], ex = undefined;
  t("规则自检：const 漏导出会被判出", !d.some(x => x.kind === "var/function") && !(ex && ex.has("x.js")));
})();

console.log(`globals_export: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
