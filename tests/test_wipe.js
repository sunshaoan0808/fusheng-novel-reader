const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
/* v37 回归: 清空数据必须走统一执行器。
 * 只 localStorage.clear() 会留下 IndexedDB 整库与原生 ndblob 文件，
 * 与"不可恢复"的承诺相反。这里验证 __wipeAllData 真的调用了 RP_STORE.wipeAll，
 * 且 after / reload 两条收尾分支都按预期执行。 */

const appSrc = fs.readFileSync(WWW + "/app.js", "utf8");

let pass = 0, fail = 0;
const t = (n, c)=>{ c ? pass++ : (fail++, console.log("FAIL:", n)); };

t("统一执行器已定义", /window\.__wipeAllData\s*=\s*function/.test(appSrc));
t("PIN 清除路径调用统一执行器", /window\.__wipeAllData\(\{clearAll:true, reload:true\}\)/.test(appSrc));

/* 提取整条赋值表达式（函数体内无未配对花括号） */
function extractWipe(){
  const m = appSrc.match(/window\.__wipeAllData\s*=\s*function\s*\(opts\)\s*\{/);
  if(!m) throw new Error("not found");
  let j = appSrc.indexOf("{", m.index), depth = 0;
  for(let k = j; k < appSrc.length; k++){
    if(appSrc[k] === "{") depth++;
    else if(appSrc[k] === "}"){ depth--; if(!depth) return appSrc.slice(m.index, k + 1); }
  }
  throw new Error("unbalanced");
}

/* 模拟 localStorage：数据键作为可枚举自有属性，方法不可枚举，
   这样 Object.keys(localStorage) 才能像浏览器一样枚举到业务键。 */
function mkLS(init){
  const ls = Object.assign({}, init);
  const d = (name, value)=>{ Object.defineProperty(ls, name, {value: value, writable: true, configurable: true, enumerable: false}); };
  d("getItem", k => (Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null));
  d("setItem", (k, v) => { ls[k] = String(v); });
  d("removeItem", k => { delete ls[k]; });
  d("clear", () => { Object.keys(ls).forEach(k => delete ls[k]); });
  d("key", i => Object.keys(ls)[i] || null);
  Object.defineProperty(ls, "length", {get(){ return Object.keys(ls).length; }, enumerable: false, configurable: true});
  return ls;
}

const ls = mkLS({nd_chat_r1_a: "[]", nd_api_cfg_v1: "{}", other_key: "keep"});
let wiped = 0;
const ctx = {console, localStorage: ls, location: {reload(){ ctx.__reloaded = true; }}};
ctx.window = ctx; ctx.globalThis = ctx;
ctx.RP_STORE = {wipeAll: () => { wiped++; return Promise.resolve(); }};
vm.createContext(ctx);
vm.runInContext(extractWipe(), ctx);

const fn = ctx.__wipeAllData;
t("提取到可执行函数", typeof fn === "function");

fn({clearAll: false, after: ()=>{ ctx.__after = true; }});
setTimeout(()=>{
  t("调用了存储层 wipeAll", wiped === 1);
  t("只清 nd_ 业务键时保留其他键", ls.other_key === "keep" && !("nd_chat_r1_a" in ls));
  t("after 回调执行", ctx.__after === true);

  /* 无 after / reload 时不应擅自动手 */
  ls.nd_x = "1";
  fn({});
  t("空 opts 不清键", ls.nd_x === "1");
  t("空 opts 不 reload", ctx.__reloaded !== true);

  fn({clearAll: true, reload: true});
  setTimeout(()=>{
    t("clearAll 清空全部键", Object.keys(ls).length === 0);
    t("触发了 reload", ctx.__reloaded === true);
    t("reload 优先于 after", (()=>{ ctx.__after2 = false; fn({clearAll:true, reload:true, after:()=>{ ctx.__after2 = true; }}); return true; })());
    setTimeout(()=>{
      t("reload 时不再执行 after", ctx.__after2 === false);
      console.log(`wipe: ${pass} pass, ${fail} fail`);
      process.exit(fail ? 1 : 0);
    }, 20);
  }, 30);
}, 30);
