/* 浮生 · app 分段 14：章节进度、情景预设、叙事视角/人称
 * v41 从 app.js 原样迁出（原 app.js 第 4337–4551 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ============ 章节进度：角色只知道所选章节之前的事 ============ */
function chapterKey(){
  try{
    if(CHAT.mode==="group") return "nd_chapter_group_" + CHAT.runId + "_" + (CHAT.members||[]).slice().sort().join("_");
    if(CHAT.mode==="traverse") return "nd_chapter_trav_" + CHAT.travId;
    return "nd_chapter_" + CHAT.runId + "_" + (CHAT.name||"");
  }catch(e){ return "nd_chapter_misc"; }
}
function getChapterIdx(){
  try{
    var v = localStorage.getItem(chapterKey());
    return v === null ? -1 : parseInt(v);
  }catch(e){ return -1; }
}
function setChapterIdx(i){
  try{
    if(i < 0) localStorage.removeItem(chapterKey());
    else localStorage.setItem(chapterKey(), String(i));
  }catch(e){}
  updateChapterBadge();
}
function getSections(){
  try{
    var run = (window.__DATA__.runs || {})[CHAT.runId] || {};
    return run.sections || [];
  }catch(e){ return []; }
}
function updateChapterBadge(){
  try{
    var idx = getChapterIdx();
    var secs = getSections();
    var label = idx >= 0 && secs[idx] ? ("第" + (idx+1) + "章") : "";
    ["chapter_badge"].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.textContent = label;
    });
    /* 顶栏徽标 */
    var hb = document.getElementById("chapter_hbadge");
    if(hb){
      if(label && secs[idx]){
        hb.style.display = "";
        hb.textContent = "📖 " + label;
        hb.title = secs[idx].title || "";
      }else hb.style.display = "none";
    }
  }catch(e){}
}
 /* 章节入口 HTML (B9): 导入卡/custom 卡在 __DATA__.runs 里没有 run, getSections() 恒空 ——
    抽屉里就不该留一个必点空的入口(徽章 #chapter_badge 随按钮一起消失)。
    getSections 本体不动(无 run 就是无章节), 这里只判"这个作品有没有章节可展示"。 */
 function chapterEntryHTML(withBadge){
   if(!getSections().length) return "";
   return `<button class="ditem" onclick="toggleDrawer(false);chapterPicker()">${icon("bookmark")} 章节进度` +
     (withBadge ? `<span id="chapter_badge" style="margin-left:auto;font-size:calc(11px * var(--fs));color:var(--gold)"></span>` : "") +
     `</button>`;
 }
 window.chapterPicker = ()=>{
   var secs = getSections();
   if(!secs.length){ return; } /* 无章节: 入口已隐藏(B9), 静默返回, 不再弹误导 toast */
  var cur = getChapterIdx();
  var v = document.getElementById("view");
  var html = `<button class="back" onclick="setTab('chat');showChat()">${icon("back")} 返回聊天</button>
    <h2 class="sec">📖 章节进度</h2>
    <div style="font-size:calc(12px * var(--fs));color:var(--ink-faint);margin-bottom:12px;line-height:1.8">
      选择后，角色只知道该章节及之前发生的事，对之后剧情一无所知。<br>
      选"全部（无限制）"则角色拥有完整原著知识。
    </div>
    <div class="card" style="padding:6px">
      <button class="ditem" onclick="setChapterIdx(-1);chapterPicker()" style="width:100%">
        ${icon("bookmark")} 全部（无限制） ${cur<0?'<span style="margin-left:auto;color:var(--gold)">✓</span>':""}
      </button>
    </div>
    <div style="display:grid;gap:8px;margin-top:8px">` +
    secs.map(function(s, i){
      var active = i === cur;
      return `<div class="card card--tap${active?"":""}" onclick="setChapterIdx(${jq(i)});chapterPicker()"
        style="cursor:pointer;${active?"border-color:var(--gold-deep);background:rgba(212,162,78,.08)":""}">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:calc(12px * var(--fs));color:var(--gold);white-space:nowrap">第${i+1}章</span>
          <span style="font-size:calc(14px * var(--fs));flex:1">${esc(s.title||("章节"+(i+1)))}</span>
          ${active?'<span style="color:var(--gold)">✓</span>':""}
        </div>
        ${s.summary?`<div style="font-size:calc(11px * var(--fs));color:var(--ink-faint);margin-top:4px;line-height:1.6">${esc(s.summary.slice(0,120))}${s.summary.length>120?"…":""}</div>`:""}
      </div>`;
    }).join("") + `</div><div style="height:40px"></div>`;
  /* 保存返回动作 */
  /* v41: __backAction 是脚本顶层 let（不挂 window），以前写 window.__backAction 落到另一个属性上，
     系统返回键仍执行上一页的旧动作。改为直接读写词法绑定。 */
  window.__chapterBack = __backAction;
  __backAction = ()=>{ setTab("chat"); showChat(); };
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  v.innerHTML = html;
  window.scrollTo(0,0);
};
window.plotEditor = ()=>{
__backAction = ()=>plotGoBack();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
const label = CHAT.mode==="group" ? ("群聊 · " + (CHAT.members||[]).join("、")) : (CHAT.name||"");
const cur = activePlotOutline();
const bundled = bundledPlot();
const hasBundled = !!bundled;
titleEl.innerHTML = icon("book-open")+" 剧情线"; subEl.textContent = label + " · 原著剧情大纲，读者可自行编辑";
view.innerHTML = `<button class="back" onclick="plotGoBack()">${icon("back")} 返回</button>
<div class="field"><label>原著剧情大纲${hasBundled?"（来自蒸馏管线）":""}</label>
<textarea id="p_outline" oninput="tokCount('p_outline','p_tok')" style="width:100%;min-height:300px;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:10px">${esc(cur)}</textarea><div class="tokline" id="p_tok"></div></div>
${hasBundled?"":`<div class="hint">暂无该角色的原著大纲数据，可自行编写。</div>`}
<div class="btnrow"><button class="btn" onclick="plotSave()">保存大纲</button>
${hasBundled&&cur!==bundled?`<button class="btn ghost" onclick="plotRestore()">↺ 恢复原著大纲</button>`:""}
${cur?`<button class="btn danger" onclick="plotClearOutline()">清空</button>`:""}</div>`;
tokCount("p_outline","p_tok");
window.scrollTo(0,0);
};
window.plotGoBack = ()=>{ showChat(); };
window.plotSave = ()=>{
const g = $("#p_outline").value.trim();
const pg = getPlot()||{};
pg.outline = g; pg.updatedAt = Date.now();
savePlot(pg); plotGoBack();
};
window.plotRestore = ()=>{
const pg = getPlot()||{};
pg.outline = bundledPlot(); pg.updatedAt = Date.now();
savePlot(pg); plotEditor();
};
window.plotClearOutline = ()=>{
if(!confirm("清空当前剧情大纲？")) return;
savePlot({outline:"", updatedAt: Date.now()}); plotEditor();
};
/* ============ 情景预设 (对标星野: 哄睡/专属时光; 点选后成为本轮+后续的情景模式) ============ */
const SCENARIOS = [
{id:"sleep", icon:"🌙", name:"哄睡", starter:"夜深了，哄我睡觉吧。",
 instr:"【情景：哄睡】现在是深夜，用户想听你哄睡。用温柔、缓慢的语气，像讲睡前故事一样哄 TA 入睡；可以讲一小段温柔的故事、哼摇篮曲式的呓语；回复不要太长，氛围安静轻柔。"},
{id:"moment", icon:"🕯️", name:"专属时光", starter:"今晚只属于我们两个人。",
 instr:"【情景：专属时光】营造只属于你们两人的静谧时光：感官描写细腻、节奏放慢，专注彼此，不要引入第三个人或外部事件打扰。"},
{id:"tea", icon:"☕", name:"茶馆闲聊", starter:"在茶馆偶遇你，坐下来聊会儿天吧。",
 instr:"【情景：茶馆闲聊】轻松日常的闲聊氛围，像老友在茶馆偶遇：话题随意、语气松弛，可以聊见闻、打趣，不要搞宏大叙事。"},
{id:"rain", icon:"🌧️", name:"雨夜谈心", starter:"外面下着雨，陪我说说话。",
 instr:"【情景：雨夜谈心】雨夜氛围：情绪浓郁、适合谈心。多写环境和心境的呼应，引导用户说出心里话，语气真诚。"},
];
function scenarioInstr(){
if(!CHAT.scenario) return "";
const s = SCENARIOS.find(x=>x.id===CHAT.scenario);
return s ? s.instr : "";
}
function renderScenChips(){
const el = $("#scenbar");
if(!el) return;
/* 输入框聚焦时不重建, 避免打字被打断 */
const ae = document.activeElement;
if(ae && ae.id === "scenetext" && el.contains(ae)) return;
el.innerHTML = `<div class="scenrow" data-xfade>` + SCENARIOS.map(s=>
`<button class="scenchip ${CHAT.scenario===s.id?"on":""}" onclick="toggleScenario('${jq(s.id)}')">${s.icon}${s.name}</button>`).join("")
+ (CHAT.scenario ? `<button class="scenchip off" onclick="toggleScenario('')">✕</button>` : "")
+ `</div>`
+ `<input id="scenetext" class="scenetext" maxlength="160" placeholder="当前场景：地点/着装/活动（160字内）" value="${esc(getSceneText())}" oninput="setSceneText(this.value)" title="场景描述（160字内），注入权重最高">`;
}
/* S-7 高权重场景 (对标 Kindroid current_scene): 160 字符内, 按聊天存 */
function sceneKey(){ try{ return "nd_scene_" + chatHistKey(); }catch(e){ return "nd_scene_misc"; } }
/* v37 性能: 场景文本先写内存，落盘防抖 400ms——原先每个按键都同步 setItem。
 * 读取优先内存值，保证"刚输入就发送"也能带上最新内容。 */
const __sceneMem = {};   /* sceneKey -> 最新文本（按会话隔离，防止切角色串值） */
function getSceneText(){ const k = sceneKey(); if(__sceneMem[k] != null) return __sceneMem[k]; try{ return localStorage.getItem(k) || ""; }catch(e){ return ""; } }
const __sceneSave = debounce((k, s)=>{ try{ localStorage.setItem(k, s); }catch(e){} }, 400);
function setSceneText(v){ const k = sceneKey(); __sceneMem[k] = String(v == null ? "" : v).slice(0, 160); __sceneSave(k, __sceneMem[k]); }
window.toggleScenario = (id)=>{
if(!id || CHAT.scenario===id){ CHAT.scenario = null; renderScenChips(); return; }
CHAT.scenario = id;
const s = SCENARIOS.find(x=>x.id===id);
renderScenChips();
if(s && s.starter){
const inp = $("#chat_in");
if(inp){ inp.value = s.starter; sendChat(); }
}
};
window.clearChat = ()=>{
const label = CHAT.mode==="group" ? "这个群聊" : CHAT.name;
/* Tier2 #16: 星野 "设置·重启对话会清空记忆和关系，从头来过" — 明确告知后果 */
if(!confirm(`清空和${label}的聊天记录？\n会清空记忆和关系，从头来过。`)) return;
const hk = chatHistKey();
localStorage.removeItem(hk);
/* 大历史可能已搬进 IDB/文件层（MEM 镜像也要清，否则清完还显示旧记录） */
try{ if(typeof RP_STORE!=="undefined" && RP_STORE.removeItemAsync){ RP_STORE.removeItemAsync(hk).catch(()=>{}); } }catch(e){}
if(CHAT.mode==="single") RP_MEM.clear(CHAT.runId, CHAT.name);
renderChat();
};
/* ============ 叙事视角/人称 (默认: 玩家主视角+第二人称; 按会话持久化) ============ */
const POVS = [
{id:"player", icon:"👤", name:"以我为主", desc:"镜头跟随玩家"},
{id:"char", icon:"🎭", name:"以角色为主", desc:"深入角色内心"},
];
const PERSONS = [
{id:"second", icon:"你", name:"第二人称"},
{id:"first", icon:"我", name:"第一人称"},
{id:"third", icon:"他", name:"第三人称"},
];
const povStoreKey = ()=> `nd_pov_${CHAT.runId}_${CHAT.mode==="group"?"__group":CHAT.name}`;
function loadPov(){
let o = {};
try{ o = JSON.parse(localStorage.getItem(povStoreKey())) || {}; }catch(e){}
CHAT.pov = o.pov || "player";
CHAT.person = o.person || "second";
}
function savePov(){
try{ localStorage.setItem(povStoreKey(), JSON.stringify({pov: CHAT.pov||"player", person: CHAT.person||"second"})); }catch(e){}
}
function povChipsHTML(){
const pov = CHAT.pov || "player", person = CHAT.person || "second";
return `<div class="povsec"><div class="povlabel">${icon("eye",15)} 视角 · 故事围绕谁展开</div><div class="povrow">`
+ POVS.map(p=>`<button class="povchip ${pov===p.id?"on":""}" title="${p.desc}" onclick="setPov('${jq(p.id)}')">${p.id==="player"?icon("user"):p.icon}${p.name}</button>`).join("")
+ `</div><div class="povlabel">${icon("user",15)} 人称 · AI 怎么称呼你和 TA</div><div class="povrow">`
+ PERSONS.map(p=>`<button class="povchip ${person===p.id?"on":""}" onclick="setPerson('${jq(p.id)}')">${p.icon}·${p.name}</button>`).join("")
+ `</div></div>`;
}
window.setPov = (id)=>{ CHAT.pov = id; savePov(); toggleDrawer(false); showChat(); };
window.setPerson = (id)=>{ CHAT.person = id; savePov(); toggleDrawer(false); showChat(); };
