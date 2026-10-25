/* 浮生 · app 分段 08：发现页/选人页 helpers、卡集、聊天外壳（退出/抽屉开合/滚动跟随/顶栏隐藏/导出）
 * v41 从 app.js 原样迁出（原 app.js 第 2096–2433 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ---- P1 发现页 helpers ---- */
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
/* P2 专辑轨道（发现页）：专辑横滑 + 新建/导入 */
function albumRailHTML(){
let albums = [];
try{ albums = RP_ALBUM.list(); }catch(e){}
let h = `<h2 class="sec">💿 我的专辑 <button class="btn ghost sm" style="margin-left:4px" onclick="albumCreate()">＋新建</button>`
+ `<button class="btn ghost sm" style="margin-left:4px" onclick="document.getElementById('albumFile').click()">导入</button></h2>`;
h += `<input type="file" id="albumFile" accept=".json" style="display:none" onchange="albumImportFile(this)">`;
h += `<div class="rail">`;
h += albums.map(a=>{
const cover = a.cards.length ? esc((a.cards[0].name || "?")[0]) : "💿";
return `<div class="railcard" onclick="albumPage('${jq(a.id)}')">`
+ `<div class="avatar">${cover}</div><div class="rn">${esc(a.name)}</div>`
+ `<div class="rk">${a.cards.length} 张</div></div>`;
}).join("");
h += `<div class="railcard" onclick="albumCreate()"><div class="avatar">＋</div><div class="rn">新建专辑</div><div class="rk"> </div></div>`;
return h + `</div>`;
}
window.albumCreate = ()=>{
const name = prompt("给专辑起个名字", "");
if(name == null) return;
let alb = null;
try{ alb = RP_ALBUM.create(name); }catch(e){ return; }
albumPage(alb.id);
};
window.albumPage = (id)=>{
__backAction = ()=>showChatPicker();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
let alb = null;
try{ alb = RP_ALBUM.get(id); }catch(e){}
if(!alb){ showChatPicker(); return; }
titleEl.textContent = "💿 " + alb.name;
subEl.textContent = `共 ${alb.cards.length} 张卡 · 纯本地`;
let grid = "";
if(alb.cards.length){
grid = `<div class="chargrid">` + alb.cards.map(c=>{
let sum = "";
try{ sum = charSumFor(c.runId, c.name) || ""; }catch(e){}
return charCardHTML({name: c.name, tag: c.novel || "", img: charImg(c.novel, c.name), sum: sum,
oncard: `chatWith('${jq(c.runId)}','${jq(c.name)}')`,
ops: `<button class="go" onclick="event.stopPropagation();chatWith('${jq(c.runId)}','${jq(c.name)}')">开聊</button>`
+ `<button onclick="event.stopPropagation();albumRemoveCard('${jq(id)}','${jq(c.runId)}','${jq(c.name)}')">移除</button>`});
}).join("") + `</div>`;
}else{
grid = `<div class="empty">还没有卡，点「加卡」装满它</div>`;
}
view.innerHTML = `<button class="back" onclick="showChatPicker()">${icon("back")} 返回发现</button>`
+ `<div class="btnrow"><button class="btn" onclick="albumPick('${jq(id)}')">＋ 加卡</button>`
+ `<button class="btn ghost" onclick="albumExport('${jq(id)}')">导出</button>`
+ `<button class="btn ghost" onclick="albumRename('${jq(id)}')">改名</button>`
+ `<button class="btn danger" onclick="albumDel('${jq(id)}')">删除</button></div>`
+ grid + `<div style="height:40px"></div>`;
try{ window.scrollTo(0,0); }catch(e){}
};
window.albumPick = (id)=>{
__backAction = ()=>albumPage(id);
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
let alb = null;
try{ alb = RP_ALBUM.get(id); }catch(e){}
if(!alb){ showChatPicker(); return; }
titleEl.textContent = "加卡到专辑"; subEl.textContent = `「${alb.name}」· 点 ＋ 加入`;
const cs = allChars();
const inMap = {};
alb.cards.forEach(c=>{ inMap[c.runId + "|" + c.name] = 1; });
view.innerHTML = `<button class="back" onclick="albumPage('${jq(id)}')">${icon("back")} 返回专辑</button>`
+ `<div class="chargrid">` + cs.map(c=>{
const has = inMap[c.runId + "|" + c.name];
let sum = "";
try{ sum = charSumFor(c.runId, c.name) || "点我直接开聊"; }catch(e){}
return charCardHTML({name: c.name, tag: c.novel, img: charImg(c.novel, c.name),
sum: has ? "已在专辑中" : sum,
oncard: has ? "" : `albumAdd('${jq(id)}','${jq(c.runId)}','${jq(c.name)}')`,
ops: has ? `<button disabled>已加入</button>`
: `<button class="go" onclick="event.stopPropagation();albumAdd('${jq(id)}','${jq(c.runId)}','${jq(c.name)}')">＋ 加入</button>`});
}).join("") + `</div><div style="height:40px"></div>`;
try{ window.scrollTo(0,0); }catch(e){}
};
window.albumAdd = (id, runId, name)=>{
let ok = false;
try{ ok = RP_ALBUM.addCard(id, runId, name); }catch(e){}
try{ rpToast(ok ? `已加入专辑` : `已经在专辑里了`); }catch(e){}
albumPick(id);
};
window.albumRemoveCard = (id, runId, name)=>{
try{ RP_ALBUM.removeCard(id, runId, name); }catch(e){}
albumPage(id);
};
window.albumRename = (id)=>{
let alb = null;
try{ alb = RP_ALBUM.get(id); }catch(e){}
if(!alb) return;
const name = prompt("专辑新名字", alb.name);
if(name == null) return;
try{ RP_ALBUM.rename(id, name); }catch(e){}
albumPage(id);
};
window.albumDel = (id)=>{
if(!confirm("删除这个专辑？（卡片本身不受影响）")) return;
try{ RP_ALBUM.remove(id); }catch(e){}
showChatPicker();
};
window.albumExport = (id)=>{
let data = null, alb = null;
try{ alb = RP_ALBUM.get(id); data = RP_ALBUM.exportData(id); }catch(e){}
if(!data) return;
downloadJson(`专辑-${alb.name}.json`, data);
try{ rpToast("专辑已导出"); }catch(e){}
};
window.albumImportFile = (input)=>{
const f = input.files && input.files[0];
if(!f) return;
const rd = new FileReader();
rd.onload = ()=>{
try{
const obj = JSON.parse(rd.result);
const r = RP_ALBUM.importData(obj);
try{ rpToast(`已导入专辑，收录 ${r.added} 张卡${r.skipped ? `（${r.skipped} 张跳过）` : ""}`); }catch(e){}
}catch(e){ alert("导入失败：不是有效的专辑文件"); }
input.value = "";
showChatPicker();
};
rd.readAsText(f);
};
/* 最近玩过：按最后活跃时间倒序，只取开过局的 */
function recentPlayed(cs, n){
try{
return cs.map(c=>{ let st = null; try{ st = RP_STATS.get(c.runId, c.name); }catch(e){}
return {c:c, last:(st && st.last) || 0, s:(st && st.s) || 0}; })
.filter(x=>x.s > 0).sort((a,b)=>b.last - a.last).slice(0, n || 8).map(x=>x.c);
}catch(e){ return []; }
}
/* 横滑轨道 */
function railHTML(title, cs){
return `<h2 class="sec">${title}</h2><div class="rail">` + cs.map(c=>{
return `<div class="railcard" onclick="chatWith('${jq(c.runId)}','${jq(c.name)}')">`
+ avatarHTML(c.runId, c.name)
+ `<div class="rn">${esc(c.name)}</div>`
+ `<div class="rk">${esc(c.novel || "")}</div></div>`;
}).join("") + `</div>`;
}
/* 角色标签（复用落地页 cardTags）：导入卡 novel/tags + role_tags */
function charTagsOf(runId, name){
try{
const card = (typeof RP !== "undefined" && RP.findCard) ? RP.findCard(runId, name) : null;
if(card) return cardTags(card);
}catch(e){}
return [];
}
function tagCountsOf(cs){
const m = {};
cs.forEach(c=>{ charTagsOf(c.runId, c.name).forEach(t=>{ m[t] = (m[t] || 0) + 1; }); });
return Object.keys(m).map(k=>({tag:k, n:m[k]})).sort((a,b)=>b.n - a.n).slice(0, 12);
}
function chipsHTML(counts, active, total){
let h = `<div class="chiprow"><button class="pickchip${!active ? " on" : ""}" onclick="pickTag('')">全部 ${total}</button>`;
counts.forEach(x=>{
h += `<button class="pickchip${active === x.tag ? " on" : ""}" onclick="pickTag('${jq(x.tag)}')">${esc(x.tag)} <span class="n">${x.n}</span></button>`;
});
return h + `</div>`;
}
window.PICKER_TAG = "";
window.pickTag = (t)=>{ window.PICKER_TAG = (window.PICKER_TAG === t ? "" : t); showChatPicker(); };
window.exitChat = ()=>{ SEARCH.active=false; SEARCH.q=""; SEARCH.hits=[]; SEARCH.cur=-1; showChatPicker(); };
window.exitChatTo = (n)=>{ document.body.classList.remove("chatmode","immersive"); setNav(n); };
window.toggleDrawer = (on)=>{
document.getElementById("drawer").classList.toggle("on", !!on);
document.getElementById("scrim").classList.toggle("on", !!on);
};
/* 聊天是否在底部附近: 流式/打字机/重渲染只在用户本来就看底部时才跟随,
   用户上滑看历史时不强制拽回底部, 避免持续抖动 */
function chatNearBottom(px){
const l = document.getElementById("chatlog");
if(!l) return true;
return (l.scrollHeight - l.scrollTop - l.clientHeight) < (px || 140);
}
/* P2-1: 程序化滚动抑制 —— 流式 token / 打字机 / renderChat 的 scrollTop 赋值会触发
   #chatlog 的 scroll 监听，与用户滚动无法区分，刚呼出的栏会被立刻藏回去。
   程序滚动前 markProgScroll() 打标记，120ms 抑制窗口内的 scroll 不触发隐藏。 */
let __progScrollAt = 0;
function markProgScroll(){ __progScrollAt = Date.now(); }
/* M3: 回到底部悬浮按钮（Talkie chat_page_with_bg_v2: 44x44dp, 右12/下20） */
function ensureToBottom(){
const wrap = document.querySelector(".chatwrap"); if(!wrap) return;
let b = document.getElementById("tobottom");
if(!b){
b = document.createElement("button");
b.id = "tobottom"; b.setAttribute("aria-label","回到底部"); b.textContent = "↓";
b.onclick = ()=>{ const l = document.getElementById("chatlog"); if(l) l.scrollTop = l.scrollHeight; };
wrap.appendChild(b);
}
}
function attachHeadHide(){
const log = document.getElementById("chatlog");
if(!log) return;
const head = document.getElementById("chathead");
const bar = document.querySelector(".chatbar");
const sim = document.getElementById("simbar");
const scen = document.getElementById("scenbar");
const ctx = document.getElementById("ctxbar");
const ws = document.getElementById("wsbar");
/* 点按式沉浸 (2026-10-09 v52)：正文全屏，点中间 toggles 顶底栏，滑动隐藏。
   二态切换，无跟手进度，无 transform 留白，无闪烁。 */
const bars = [head, sim, ctx, ws, scen].filter(Boolean);
let barsVisible = true;
function setBars(v){
  barsVisible = !!v;
  bars.forEach(el=>{ el.style.display = barsVisible ? "" : "none"; });
  if(bar) bar.style.display = barsVisible ? "" : "none";
  if(document.body && document.body.classList)
    document.body.classList.toggle("immersive", !barsVisible);
  /* 对外发布显隐态：P0-1 的键盘恢复要跨会话读它 */
  window.__barsVisible = barsVisible;
  try{ if(window.__immState) window.__immState.visible = barsVisible; }catch(e){}
}
/* v41 沉浸态细输入条：完整输入栏收起时，底部留一条半透明「说点什么…」，
   点它即唤回完整输入栏并聚焦输入框 —— 不再只能靠"点屏幕中间"这一条隐性路径。 */
try{
  const wrap = document.querySelector(".chatwrap");
  if(wrap && bar && !document.getElementById("immstrip")){
    const st = document.createElement("button");
    st.id = "immstrip"; st.className = "immstrip"; st.type = "button";
    st.setAttribute("aria-label", "展开输入栏");
    st.innerHTML = `<span class="immstrip-ph">说点什么…</span><span class="immstrip-go" aria-hidden="true">${icon("send",16)}</span>`;
    st.addEventListener("click", (e)=>{
      e.stopPropagation();
      setBars(true);
      setTimeout(()=>{ const i = document.getElementById("chat_in"); if(i && !i.disabled) i.focus(); }, 0);
    });
    wrap.appendChild(st);
  }
}catch(e){}
/* 初始：隐藏，进入全屏沉浸 */
setBars(false);
/* 动效预设（灵动/绚烂）：进场窗口内给消息挂级联浮现，1.6s 后摘除——
   只在进场时播一次，之后发消息/重渲染不重播（CSS 侧按 .entering 命中） */
try{
  log.classList.add("entering");
  setTimeout(()=>{ try{ log.classList.remove("entering"); }catch(e){} }, 1600);
}catch(e){}
/* 兼容旧测试钩子：__setHeadHidden(true)=隐藏，(false)=显示 */
window.__setHeadHidden = (hide)=>setBars(!hide);
/* P0-1 首屏死路：进入聊天三栏全收起，输入框/顶栏都不在屏上，唯一的恢复入口
   是"点屏幕中间"——既没有任何提示，键盘用户更是完全走不通。补三条路：
   (1) window.__showBars 供键盘/外部调用；(2) document 级 Escape 与可打印键
       自动唤回（全局只挂一次，避免每次进聊天重复叠加）；(3) 一次性居中引导。*/
window.__showBars = ()=>{ if(!barsVisible) setBars(true); };
if(!window.__immKeysBound){
  window.__immKeysBound = true;
  try{ document.addEventListener("keydown", (e)=>{
    if(!document.body.classList.contains("chatmode")) return;   /* 不在聊天页就别插手 */
    if(window.__barsVisible !== false) return;                  /* 栏本来就看得见 */
    const ae = document.activeElement;
    if(ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName||"")) return;   /* 已在输入框里打字：别抢 */
    const k = e.key || "";
    if(k !== "Escape" && k !== "Enter" && k !== " " && k.length !== 1) return;
    if(typeof window.__showBars === "function") window.__showBars();
    if(k.length === 1){ setTimeout(()=>{ const i=document.getElementById("chat_in"); if(i && !i.disabled) i.focus(); }, 0); }
  }); }catch(e){}
}
window.__immActive = true;
window.__barsVisible = barsVisible;
try{
  if(!localStorage.getItem("nd_immguide")){
    setTimeout(()=>{
      const _tip = ()=>{
      /* 用户自己先唤出来了：这次不打扰，也不写标志 —— 否则 TA 永远看不到了 */
      if(barsVisible) return false;
      const g = document.createElement("div");
      g.className = "immguide"; g.setAttribute("role","status");
      g.innerHTML = "点下方输入条或屏幕空白处<br>唤回完整输入栏";
      document.body.appendChild(g);
      try{ localStorage.setItem("nd_immguide", "1"); }catch(_){}
      setTimeout(()=>{ if(g.parentNode) g.remove(); }, 4600);
      };
      try{ (typeof window.rpTip==="function") ? window.rpTip(_tip, 4600) : _tip(); }catch(e){}
    }, 700);
  }
}catch(e){}
/* 点按中间呼出/隐藏：栏隐藏时，点中部任意位置（包括消息气泡）只呼出栏，
   不触发消息的编辑栏（capture 拦截 + 吞掉事件）；栏显示时点空白处隐藏栏。
   轻点判定：位移<12px、时长<400ms；中部区域为屏幕 20%~80%。 */
let tsX=0, tsY=0, tsT=0;
log.addEventListener("touchstart", (e)=>{
  const t = e.touches[0];
  tsX = t.clientX; tsY = t.clientY; tsT = Date.now();
}, {passive:true});
function isTap(clientX, clientY){
  /* 移动端用 touchstart 记录的起点；桌面端直接视为 tap */
  if(tsT){
    const dx = clientX - tsX, dy = clientY - tsY;
    if(Math.hypot(dx, dy) > 12 || Date.now() - tsT > 400) return false;
  }
  const h = window.innerHeight;
  return clientY >= h*0.2 && clientY <= h*0.8;
}
/* 移动端：touchend 先行，呼出栏并立 flag 供 toggleTools 吞掉随后到来的 click */
log.addEventListener("touchend", (e)=>{
  const t = e.changedTouches[0];
  if(!isTap(t.clientX, t.clientY)) return;
  if(!barsVisible){
    setBars(true);
    window.__barsRevealTs = Date.now();
  }
}, {passive:true});
/* 桌面端 + 兜底：capture 阶段拦截，栏隐藏时吞掉消息的 click */
log.addEventListener("click", (e)=>{
  if(!isTap(e.clientX, e.clientY)) return;
  /* 避免 touchend 已处理后又触发一次 */
  if(Date.now() - tsT < 500 && tsT) return;
  if(!barsVisible){
    e.stopPropagation();
    e.preventDefault();
    setBars(true);
  }else if(e.target === log){
    setBars(false);
  }
}, true);
/* 滑动隐藏：栏显示时一旦滚动就藏（P2-1: 程序化滚动在抑制窗口内不触发隐藏） */
let lastST = log.scrollTop;
log.addEventListener("scroll", ()=>{
  const st = log.scrollTop;
  const progScroll = (Date.now() - __progScrollAt) < 120;
  if(!progScroll && Math.abs(st - lastST) > 8 && barsVisible){
    /* 输入框聚焦时不藏底栏（键盘弹起时） */
    const ae = document.activeElement;
    const typing = !!ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName || "");
    if(!typing) setBars(false);
  }
  lastST = st;
  const tb = document.getElementById("tobottom");
  if(tb){
    const dist = Math.max(0, (log.scrollHeight - log.clientHeight) - st);
    tb.classList.toggle("show", dist > 200);
  }
}, {passive:true});
ensureToBottom(); /* M3: 注入回到底部按钮（单聊/群聊/穿越共用） */
} /* attachHeadHide end */
window.exportChat = ()=>{
const h = getHistSafe(chatHistKey());
const txt = h.map(m=>`${m.role==="user"?"我":(CHAT.mode==="group"?(m.speaker||"?"):CHAT.name)}：${m.content}`).join("\n\n");
copyText(txt);
alert(`已复制 ${h.length} 条消息到剪贴板`);
};
