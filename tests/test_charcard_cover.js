/* 角色卡图主导重排回归 (2026-11-03)
 * 用户看选角页截图拍板：封面加高成主角，名字/统计压封面底部渐变，
 * 正文只留钩子+按钮，没钩子没按钮就不渲染正文（不留空黑）。
 * 钉住 charCardHTML 的新结构与 style.css 的关键规则。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const { APP_FILES: __APP_FILES } = require("./lib_appsrc.js");
const els = {};
function mkEl(){ return {innerHTML:"", textContent:"", value:"", classList:{add(){},remove(){},toggle(){}},
  querySelectorAll(){return [];}, addEventListener(){}, scrollTo(){}, style:{}}; }
const ls = (function(){ const m={}; return {
  getItem:k=>m[k]??null, setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];},
  key:i=>Object.keys(m)[i]||null, get length(){return Object.keys(m).length;}};})();
const document = {body: mkEl(), getElementById:id=>els[id]||(els[id]=mkEl()),
  querySelector:(sel)=>{const id=String(sel).replace("#","");return els[id]||(els[id]=mkEl());}, createElement:()=>mkEl()};
const DATA = {index:[{run_id:"r1",novel:"测试小说"}], runs:{r1:{run_id:"r1", novel:"测试小说", profiles:[]}}, rp_cards:{}};
const ctx = {localStorage: ls, document, console,
  alert(){}, confirm(){return true;}, prompt(){return null;}, setTimeout, clearTimeout};
ctx.window = ctx; ctx.globalThis = ctx; ctx.__DATA__ = DATA;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(WWW+"/icons.js","utf8"), ctx);
vm.runInContext(fs.readFileSync(WWW+"/rp/escutil.js","utf8"), ctx);
for(const __f of __APP_FILES(WWW)) vm.runInContext(fs.readFileSync(WWW + "/" + __f, "utf8"), ctx, {filename: __f});

let pass=0, fail=0;
const t=(n,c)=>{c?pass++:(fail++,console.log("FAIL:",n));};
const H = (expr)=> vm.runInContext(expr, ctx);

/* 1. 全量卡：名字与统计进封面 covermeta，正文只剩钩子+按钮 */
const h1 = H(`charCardHTML({name:"晴雯", tag:"红楼梦", img:"data/charimg/honglou/qingwen.jpg", sum:"心比天高，风流灵巧", stat:"开局3次 · 平均12轮/局", oncard:"go()", ops:"<button>开聊</button>"})`);
t("有 covermeta", h1.includes('class="covermeta"'));
t("名字在封面内（covermeta 在 charbody 之前）",
  h1.indexOf('class="covermeta"') >= 0 && h1.indexOf('<div class="n">晴雯</div>') > h1.indexOf('class="covermeta"')
  && (h1.indexOf('class="charbody"') < 0 || h1.indexOf('<div class="n">晴雯</div>') < h1.indexOf('class="charbody"')));
t("统计行在封面内", h1.indexOf("开局3次") > h1.indexOf('class="covermeta"') && h1.indexOf("开局3次") < h1.indexOf('class="charbody"'));
t("正文有钩子与按钮", h1.includes('class="charbody"') && h1.includes("心比天高") && h1.includes("开聊"));
t("正文不再有名字 div", !/<div class="charbody"><div class="n">/.test(h1) && !h1.includes('<div class="n">') || h1.indexOf('<div class="n">') < h1.indexOf('class="charbody"'));

/* 2. 极简卡：没钩子没按钮 → 不渲染正文，纯封面 */
const h2 = H(`charCardHTML({name:"秦钟", tag:"红楼梦", img:"x.jpg", oncard:"go()"})`);
t("极简卡无 charbody", !h2.includes('class="charbody"'));
t("极简卡仍有 covermeta+名字", h2.includes('class="covermeta"') && h2.includes("秦钟"));

/* 3. 无图卡：默认头像图照旧（test_ui24 已钉，这里防回归到字砖） */
const h3 = H(`charCardHTML({name:"陪读", tag:"导入角色卡", sum:"点我直接开聊"})`);
t("无图用默认头像", h3.includes('src="bg/avatar_default.jpg"'));

/* 4. CSS：封面加高 + covermeta 渐变在位 */
const css = fs.readFileSync(WWW + "/style.css", "utf8");
t("封面高度 186px", /\.charcover\{height:186px/.test(css));
t("covermeta 渐变规则", css.includes(".covermeta{") && css.includes("linear-gradient(180deg, rgba(10,8,4,0)"));
t("钩子收为 2 行", /\.charbody \.s\{[^}]*-webkit-line-clamp:2/.test(css));

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
