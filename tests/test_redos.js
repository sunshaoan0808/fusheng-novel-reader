const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
/* v37 回归: 用户正则 ReDoS 防护。
 * 世界书触发键 / ST 正则脚本来自导入卡（不可信），灾难性回溯必须被静态拦截，
 * 且拦截要在毫秒级返回（不能先跑一遍再判断）。 */

function mkLoreCtx(){
  const store = {};
  const localStorage = {
    getItem: (k)=> (k in store ? store[k] : null),
    setItem: (k, v)=>{ store[k] = String(v); },
    removeItem: (k)=>{ delete store[k]; },
  };
  const ctx = {console, localStorage};
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(WWW + "/rp/lorebook.js", "utf8"), ctx, {filename: "lorebook.js"});
  return ctx;
}

let pass = 0, fail = 0;
const t = (n, c)=>{ c ? pass++ : (fail++, console.log("FAIL:", n)); };
const ctx = mkLoreCtx();
const run = (code)=> vm.runInContext(code, ctx);

const longText = "a".repeat(30000) + "!";

let t0 = Date.now();
const evil1 = run(`RP_LOREBOOK.keyMatches(${JSON.stringify("/(a+)+$/")}, ${JSON.stringify(longText)}, {})`);
const ms1 = Date.now() - t0;
t("嵌套量词正则不生效", evil1 === false);
t("嵌套量词毫秒级返回 (<100ms)", ms1 < 100);

t0 = Date.now();
const evil2 = run(`RP_LOREBOOK.keyMatches(${JSON.stringify("/(a|aa)+$/")}, ${JSON.stringify(longText)}, {})`);
const ms2 = Date.now() - t0;
t("重叠分支正则不生效", evil2 === false);
t("重叠分支毫秒级返回 (<100ms)", ms2 < 100);

t("连续量词正则不生效", run(`RP_LOREBOOK.keyMatches("/a{1,9}{1,9}b/", "aaaaab", {})`) === false);
t("正常正则仍命中", run(`RP_LOREBOOK.keyMatches("/黛玉/", "林黛玉进贾府", {})`) === true);
t("正常字面词仍命中", run(`RP_LOREBOOK.keyMatches("大观园", "昨天去了大观园散步", {})`) === true);
t("恒真空正则 // 被拒绝", run(`RP_LOREBOOK.keyMatches("//", "abc", {})`) === false);
t("超长模式被拒绝", run(`RP_LOREBOOK.keyMatches("/" + "a".repeat(300) + "/", "aaa", {})`) === false);
t("正常惰性量词不禁用", run(`RP_LOREBOOK.keyMatches("/林.{0,4}玉/", "林黛玉", {})`) === true);

/* ST 正则脚本执行点（chat.js applyRegex）：同一条恶意规则必须被跳过且不改文本 */
function extract(src, name){
  const re = new RegExp("(?:function\\s+" + name + "|(?:let|const|var)\\s+" + name + "\\s*=\\s*function)\\s*\\(");
  const m = src.match(re);
  if(!m) throw new Error("not found: " + name);
  let j = src.indexOf("{", m.index), depth = 0;
  for(let k = j; k < src.length; k++){
    if(src[k] === "{") depth++;
    else if(src[k] === "}"){ depth--; if(!depth) return src.slice(m.index, k + 1); }
  }
  throw new Error("unbalanced: " + name);
}
const chatSrc = fs.readFileSync(WWW + "/rp/chat.js", "utf8");
const c2 = {console};
c2.window = c2; c2.globalThis = c2;
vm.createContext(c2);
vm.runInContext(extract(chatSrc, "getRegex"), c2);
vm.runInContext(extract(chatSrc, "applyRegex"), c2);

/* 分块处理：超过 20000 字符的输入按块送正则（成本有上界），但正文一个字都不能少。
 * 曾经的实现是 slice(-20000) 只留末段——那不是兜底，是把长回复的开头直接删掉。 */
const huge = "a".repeat(50000) + "!";
const trunc = vm.runInContext(
  `applyRegex(${JSON.stringify(huge)}, [{find: "zzz", replace: ""}], 0)`, c2);
t("applyRegex 超长文本不被截断（长度守恒）", trunc.length === huge.length);
t("applyRegex 超长文本内容完全一致", trunc === huge);
t("applyRegex 超长文本首尾规则都生效",
  vm.runInContext(`(function(){
    var s = "HEAD" + "x".repeat(50000) + "TAIL";
    var o = applyRegex(s, [{find: "HEAD", replace: "H"}, {find: "TAIL", replace: "T"}], 0);
    return o.charAt(0) === "H" && o.charAt(o.length - 1) === "T" &&
      o.length === s.length - 6;
  })()`, c2) === true);

/* ST 正则脚本执行点（chat.js applyRegex）：同一条恶意规则必须被跳过且不改文本 */
const big = "a".repeat(9000) + "!";
t0 = Date.now();
const out = vm.runInContext(
  `applyRegex(${JSON.stringify(big)}, [{find: "(a+)+$", replace: ""}], 0)`, c2);
const ms3 = Date.now() - t0;
t("applyRegex 跳过 ReDoS 规则", out === big);
t("applyRegex 毫秒级返回 (<100ms)", ms3 < 100);

t("applyRegex 跳过重叠分支规则",
  vm.runInContext(`applyRegex(${JSON.stringify(big)}, [{find: "(a|aa)+$", replace: ""}], 0)`, c2) === big);

const okOut = vm.runInContext(
  `applyRegex("hello 世界", [{find: "世界", replace: "world"}], 0)`, c2);
t("applyRegex 正常替换仍工作", okOut === "hello world");

console.log(`redos: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
