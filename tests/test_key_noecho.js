const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const { APP_FILES: __APP_FILES, appSource: __appSource } = require("./lib_appsrc.js"); /* v41: app.js 拆分后按加载顺序取全部分段 */
/* v37 回归: API Key 不再回显到页面 DOM。
 * 以前设置页把 key 直接写进 <input value="...">，任何同源脚本/开发者工具都能读到明文；
 * 现在页面只显示"已保存"，输入框留空表示沿用旧 Key。 */

const appSrc = __appSource(WWW);

let pass = 0, fail = 0;
const t = (n, c)=>{ c ? pass++ : (fail++, console.log("FAIL:", n)); };

t("设置页不再用 esc(c.key) 回填输入框", !/id="c_key"[^>]*value="\$\{esc\(c\.key/.test(appSrc));
t("设置页 c_key 输入框 value 为空", /id="c_key"[^>]*value=""/.test(appSrc));
t("占位文案提示留空即不修改", /已保存（留空 = 不修改）/.test(appSrc));

/* _cfgFromUI: 输入框空 → 回落到已保存 Key；输入框有值 → 用新值 */
function extractFn(src, name){
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

function mkCtx(keyInput){
  const els = {c_base: {value: "https://api.example/v1"}, c_key: {value: keyInput}, c_model: {value: "m1"}, c_model_sel: {value: ""}};
  const cfg = {base: "https://api.example/v1", key: "sk-saved-123", model: "m1"};
  const ctx = {
    console,
    $: (sel)=> els[sel.slice(1)] || null,
    getCfg: ()=> cfg,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(extractFn(appSrc, "_cfgFromUI"), ctx);
  return {ctx, cfg};
}

const a = mkCtx("");
const cfgA = vm.runInContext("_cfgFromUI()", a.ctx);
t("留空时沿用已保存 Key", cfgA.key === "sk-saved-123");

const b = mkCtx("sk-new-456");
const cfgB = vm.runInContext("_cfgFromUI()", b.ctx);
t("填写时使用新 Key", cfgB.key === "sk-new-456");
t("地址与模型透传", cfgB.base === "https://api.example/v1" && cfgB.model === "m1");

/* 存储写入失败不能把流程打断（P2-14 收尾）：saveCfgUI 内必须捕获配额异常 */
t("saveCfgUI 写 Key 前有 http 明文告警", /http:\/\/.*API Key 将以明文在网络上传输/.test(appSrc));
t("saveNotifyCfg 有 try/catch", /const saveNotifyCfg = \(c\)=>\{ try\{/.test(appSrc));
t("存档重命名写失败有提示", /存储空间已满，存档名未保存/.test(appSrc));
t("世界设定写失败有提示", /存储空间已满，世界设定未保存/.test(appSrc));

console.log(`key-noecho: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
