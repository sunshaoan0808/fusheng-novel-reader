/* 浮生 · app 分段 01：核心：DOM 句柄与全局状态、系统返回键、esc、极简 markdown、顶层导航
 * v41 从 app.js 原样迁出（原 app.js 第 1–106 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* 浮生 v3: 产物浏览器 + 任务管理 + RP 聊天 (纯手机端, 数据内联) */
const $ = (s) => document.querySelector(s);
const view = $("#view"), titleEl = $("#title"), subEl = $("#sub"),
tabs = $("#tabs"), mainnav = $("#mainnav");
let INDEX = [], RUN = null, TAB = "chars", NAV = "product";

/* ---------- 系统返回键 ---------- */
/* 每个页面登记自己的"返回"动作; 顶层页面为 null(此时按返回键直接退出 App)。
   原生层 onBackPressed 会先调 window.__onBackPressed(), 返回 true 表示已消费。 */
let __backAction = null;
window.__onBackPressed = ()=>{
  try{
    const dr = document.getElementById("drawer");
    if(dr && dr.classList.contains("on")){ toggleDrawer(false); return true; }
    if(typeof __backAction === "function"){ __backAction(); return true; }
    /* v42：蒸馏/穿越/写卡归到「创作」下，顶层态按返回先回创作页，而不是直接退出 App */
    if(NAV === "distill" || NAV === "traverse" || NAV === "writer"){ setNav("create"); return true; }
  }catch(e){}
  return false;
};

/* P2-11: 转义收敛到 rp/escutil.js 的 escH()（index.html 最先加载 escutil；测试 vm 里同样先加载）。
   独立加载场景无 escH 时回退同款实现。不用 jq()：那是"HTML属性+JS字符串"双上下文，
   会把正文换行变成字面 \n、反斜杠加倍，只适用于 onclick 模板。 */
const esc = (typeof escH !== "undefined") ? escH : function(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");};

/* ---------- 极简 markdown ---------- */
function md(src){
const lines = String(src||"").split("\n");
let html = "", inList = false;
const inline = (t)=> esc(t)
.replace(/\*\*(.+?)\*\*/g,"<b>$1</b>")
.replace(/`(.+?)`/g,"<code>$1</code>");
for(const ln of lines){
const s = ln.trimEnd();
if(/^#{1,3}\s/.test(s)){
if(inList){html+="</ul>";inList=false;}
const lv = s.match(/^#+/)[0].length;
html += `<h${lv}>${inline(s.replace(/^#+\s*/,""))}</h${lv}>`;
}else if(/^>\s?/.test(s)){
if(inList){html+="</ul>";inList=false;}
html += `<blockquote>${inline(s.replace(/^>\s?/,""))}</blockquote>`;
}else if(/^[-*]\s/.test(s)){
if(!inList){html+="<ul>";inList=true;}
html += `<li>${inline(s.replace(/^[-*]\s/,""))}</li>`;
}else if(/^\d+[.)]\s/.test(s)){
if(!inList){html+="<ul>";inList=true;}
html += `<li>${inline(s.replace(/^\d+[.)]\s/,""))}</li>`;
}else if(s.trim()===""){
if(inList){html+="</ul>";inList=false;}
}else{
if(inList){html+="</ul>";inList=false;}
html += `<p>${inline(s)}</p>`;
}
}
if(inList) html+="</ul>";
return html;
}

/* ---------- 顶层导航 ---------- */
function setNav(n){
NAV = n;
try{ msgSheet(false); }catch(e){} /* L2: 切页时关消息菜单，背景压暗回 chat */
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
/* v42 底栏 4 栏：蒸馏/穿越/写卡 归「创作」，设置归「我的 · 设置」；老路由名照常可用，只是高亮落到所属栏 */
const _navTab = ({distill:"create", traverse:"create", writer:"create", tasks:"create", settings:"me"})[n] || n;
mainnav.querySelectorAll("button").forEach(b=>
b.classList.toggle("active", b.dataset.nav===_navTab));
try{ document.body.classList.toggle("nav-sub", n==="distill" || n==="traverse" || n==="writer"); }catch(e){}
window.scrollTo(0,0);
if(n==="product"){ tabs.classList.toggle("hidden",!RUN); RUN? setTab(TAB,true): showRuns();}
else if(n==="tasks"){ setNav("distill"); }
else if(n==="chat"){ tabs.classList.add("hidden"); (CHAT.name||CHAT.mode==="traverse"||CHAT.mode==="group") ? showChat() : showChatPicker(); }
else if(n==="traverse"){ tabs.classList.add("hidden"); showTraverse(); }
else if(n==="settings" || n==="me"){ tabs.classList.add("hidden"); showMe();}
else if(n==="create"){ tabs.classList.add("hidden"); showCreateHub();}
else if(n==="writer"){ tabs.classList.add("hidden"); showWriter();}
else if(n==="distill"){
  tabs.classList.add("hidden"); titleEl.textContent="蒸馏"; subEl.textContent="手机端独立蒸馏";
  /* 蒸馏模块按需加载（23 个文件）：首屏不再为它付下载与解析。
     重复进入时 ensureGroup 复用同一个 Promise，不会重复请求。 */
  if(typeof DISTILL_UI !== "undefined"){ DISTILL_UI.show(); }
  else{
    view.innerHTML = `<div class="empty">正在加载蒸馏模块…</div>`;
    RP_LAZY.ensureGroup("distill").then(function(){
      if(NAV === "distill") DISTILL_UI.show();
    }).catch(function(e){
      view.innerHTML = `<div class="empty">蒸馏模块加载失败<br><span style="font-size:calc(12px * var(--fs))">${escH(e.message)}</span><br><button class="btn" style="margin-top:12px" onclick="setNav('distill')">重试</button></div>`;
    });
  }
}
}
mainnav.querySelectorAll("button").forEach(b=>
b.addEventListener("click", ()=>setNav(b.dataset.nav)));

async function boot(){
const D = window.__DATA__;
if(!D ||!D.index){
view.innerHTML = `<div class="empty">数据未生成<br><span style="font-size:calc(12px * var(--fs))">请先运行 snapshot.py</span></div>`;
return;
}
INDEX = D.index;
showRuns();
/* data.js 拆包：空闲时预取第一个 run，最常见的「点第一本书」路径零等待 */
var _first = INDEX[0] && INDEX[0].run_id;
if(_first){
  var _prefetch = function(){ try{ RP_LAZY.ensureRun(_first); }catch(e){} };
  if(typeof requestIdleCallback === "function") requestIdleCallback(_prefetch);
  else setTimeout(_prefetch, 300);
}
}

