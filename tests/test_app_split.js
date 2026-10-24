/* v41 app.js 拆分守卫：
 *   1) index.html 中 js/app_*.js 紧挨在 app.js 之前、连续、按「分段 NN」编号递增（顺序即原 app.js 内先后，
 *      经典脚本跨文件共享全局词法作用域，顺序错了会出 TDZ / 未定义）；
 *   2) 每个分段可独立编译；
 *   3) 跨文件不得重复声明顶层 const/let/class（运行时是 SyntaxError，整段脚本不执行）；
 *      顶层 function 跨文件重名只允许拆分前就存在的 copyText（两处定义，后者生效——拆分前后最终生效的都是后者）；
 *   4) 全部分段 + app.js 在桩环境里按序载入不抛错（载入期无前向引用）。 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const { APP_FILES } = require("./lib_appsrc.js");
const { topLevelDecls } = require("./lib_jsscan.js");
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

const html = fs.readFileSync(path.join(WWW, "index.html"), "utf8");
const srcs = []; html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, s) => { srcs.push(s); return m; });
const ai = srcs.indexOf("app.js");
const parts = srcs.filter(s => /^js\/app_[a-z_]+\.js$/.test(s));
t("app.js 在 index.html 中恰好一次", srcs.filter(s => s === "app.js").length === 1);
t("js/app_*.js 连续且紧挨 app.js 之前", parts.length === 0 || srcs.slice(ai - parts.length, ai).join() === parts.join());
t("APP_FILES 与 index.html 一致", JSON.stringify(APP_FILES(WWW)) === JSON.stringify(parts.concat(["app.js"])));
const nums = parts.map(p => { const m = fs.readFileSync(path.join(WWW, p), "utf8").match(/^\/\* 浮生 · app 分段 (\d+)：/); return m ? +m[1] : -1; });
t("分段头编号 01..N 连续递增", nums.every((n, i) => n === i + 1));

const files = APP_FILES(WWW);
const topDecl = {}; // name -> [{file, kind}]
for(const f of files){
  const src = fs.readFileSync(path.join(WWW, f), "utf8");
  let ok = true; try{ new vm.Script(src, {filename: f}); }catch(e){ ok = false; console.log("  ", f, e.message); }
  t(f + " 可编译", ok);
  topLevelDecls(src).forEach(d => (topDecl[d.name] = topDecl[d.name] || []).push({f, k: d.kind}));
}
const lexDup = Object.entries(topDecl).filter(([n, ds]) => ds.some(d => d.k !== "function" && d.k !== "var") && ds.length > 1);
t("跨文件无重复顶层 const/let/class", lexDup.length === 0);
lexDup.forEach(([n, ds]) => console.log("   lexical dup:", n, ds.map(d => d.f + ":" + d.k).join(",")));
const KNOWN_FN_DUP = new Set(["copyText"]);
const fnDup = Object.entries(topDecl).filter(([n, ds]) => ds.length > 1 && ds.every(d => d.k === "function")
  && new Set(ds.map(d => d.f)).size > 1 && !KNOWN_FN_DUP.has(n));
t("跨文件无新增的重名顶层 function", fnDup.length === 0);
fnDup.forEach(([n, ds]) => console.log("   function dup:", n, ds.map(d => d.f).join(",")));

/* 载入期冒烟：桩 DOM 下按 index.html 顺序载入（依赖的 rp/* 先行），任何载入期前向引用都会在这里抛 */
function mkEl(){ return {innerHTML: "", textContent: "", value: "", style: {}, dataset: {},
  classList: {add(){}, remove(){}, toggle(){}, contains(){ return false; }},
  querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(){}, removeEventListener(){},
  appendChild(){}, remove(){}, setAttribute(){}, getAttribute(){ return null; }, closest(){ return null; },
  insertAdjacentHTML(){}, scrollTo(){}, focus(){}}; }
const els = {};
const ls = (function(){ const m = {}; return {getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
  removeItem: k => { delete m[k]; }, key: i => Object.keys(m)[i] || null, get length(){ return Object.keys(m).length; }}; })();
const document = {body: mkEl(), head: mkEl(), documentElement: mkEl(), addEventListener(){},
  getElementById: id => els[id] || (els[id] = mkEl()),
  querySelector: s => { const mm = String(s).match(/^#([\w-]+)$/); return mm ? (els[mm[1]] || (els[mm[1]] = mkEl())) : null; },
  querySelectorAll: () => [], createElement: () => mkEl()};
const ctx = {localStorage: ls, document, console: {log(){}, warn(){}, error(){}, info(){}}, alert(){}, confirm(){ return false; },
  prompt(){ return null; }, setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
  requestAnimationFrame: () => 0, fetch: () => Promise.reject(new Error("no net")), navigator: {userAgent: "node"},
  addEventListener(){}, scrollTo(){}, Image: function(){ return mkEl(); }};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const pre = ["data.js", "icons.js", "rp/escutil.js", "rp/prompt.js", "rp/persona.js", "rp/memory.js", "rp/tasks.js",
  "rp/cardwriter.js", "rp/ooc.js", "rp/chat.js", "rp/aifill.js", "rp/group.js", "rp/cardexport.js", "rp/cardimport.js",
  "rp/traverse.js", "rp/traverse2.js"];
let loadErr = null, at = "";
for(const f of pre.concat(files)){
  try{ vm.runInContext(fs.readFileSync(path.join(WWW, f), "utf8"), ctx, {filename: f}); }
  catch(e){ loadErr = e; at = f; break; }
}
t("全部分段 + app.js 按序载入不抛错" + (loadErr ? "（" + at + ": " + loadErr.message + "）" : ""), !loadErr);
t("核心全局在载入后可用", vm.runInContext("typeof setNav === 'function' && typeof showChat === 'function' && typeof esc === 'function' && typeof view !== 'undefined'", ctx));

const appLines = fs.readFileSync(path.join(WWW, "app.js"), "utf8").split("\n").length;
t("app.js 保持在 3000 行以内（新功能请放进对应 js/app_*.js 分段）（现 " + appLines + "）", appLines < 3000);
t("js/INDEX.md 列出了全部分段", (function(){ const ix = fs.readFileSync(path.join(WWW, "js", "INDEX.md"), "utf8");
  return parts.every(p => ix.indexOf("`" + p + "`") >= 0); })());

console.log(`app_split: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
