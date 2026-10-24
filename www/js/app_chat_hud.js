/* 浮生 · app 分段 12：上下文用量条、世界模拟 HUD/编辑器、消息评分、剧情选项卡
 * v41 从 app.js 原样迁出（原 app.js 第 3590–3822 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ============ 上下文用量常驻条 + 世界书触发可视化 (对标 Talkie/Janitor) ============ */
function renderCtxBar(){
const bar = document.getElementById("ctxbar");
if(!bar) return;
if(!LAST_STATS){ bar.style.display = "none"; return; }
const s = LAST_STATS;
const used = (s.sysTokens||0) + (s.histTokens||0);
const max = s.maxCtx || 8192;
const pct = Math.min(100, Math.round(used / max * 100));
const hits = (s.loreHits||[]).filter(Boolean);
/* 世界书触发标签: 有 hitDetails 时展示 probability/priority (Janitor 式), 否则退化为标题 */
const hitDet = (s.loreHitDetails||[]).filter(Boolean);
bar.style.display = "block";
bar.innerHTML = `<div class="ctxrow"><div class="ctxbar-bg"><div class="ctxbar-fg${pct>85?" hot":""}" style="width:${pct}%"></div></div>`
+ `<span class="ctxnum">上下文 ${used}/${max} · 历史${s.histKept||0}条</span>`
+ (hits.length ? `<span class="ctxfold" onclick="toggleCtxLore(event)">触发${hits.length}条 ▾</span>` : "")
+ `</div>`
+ (hits.length ? `<div class="ctxlore" id="ctxlore">${icon("book-open",14)} 触发：${hitDet.length
? hitDet.map(d=>`${esc(d.title)}<span style="opacity:.6;font-size:calc(11px * var(--fs))"> ${d.probability}%·P${d.priority}</span>`).join("、")
: hits.map(x=>esc(x)).join("、")}</div>` : "")
/* Tier2 #6: C.AI "Older messages will fade from Memory, but anything you save to Story Memory is kept safe." */
+ (pct > 90 ? `<div class="ctxwarn">旧消息会逐渐从记忆中褪色，但你置顶 / 存入事件簿的记忆会一直保留。</div>` : "");
/* 触发明细 5 秒后自动收起，点击徽标可展开/收起 */
if(hits.length){
  if(window.__ctxLoreTimer) clearTimeout(window.__ctxLoreTimer);
  window.__ctxLoreTimer = setTimeout(()=>{
    const l = document.getElementById("ctxlore");
    if(l && !l.classList.contains("folded")){
      l.classList.add("folded");
      const f = bar.querySelector(".ctxfold");
      if(f) f.textContent = `触发${hits.length}条 ▸`;
    }
  }, 5000);
}
}
window.toggleCtxLore = (ev)=>{
  if(ev && ev.stopPropagation) ev.stopPropagation();
  const l = document.getElementById("ctxlore");
  if(!l) return;
  l.classList.toggle("folded");
  const f = document.querySelector("#ctxbar .ctxfold");
  if(f){
    const n = (LAST_STATS && (LAST_STATS.loreHits||[]).filter(Boolean).length) || 0;
    f.textContent = l.classList.contains("folded") ? `触发${n}条 ▸` : `触发${n}条 ▾`;
  }
};
/* ============ 世界模拟 HUD：聊天页顶栏下常驻时间/天气/地点 ============ */
function simChatKey(){
  try{ return chatHistKey(); }catch(e){ return "misc"; }
}
/* 时序感知基准卡: 蒸馏 run 从 __DATA__.rp_cards[runId] 找; 找不到时 (imported/custom 等
   非蒸馏 runId, rp_cards 里根本没有这个键) 回落导入卡库 —— 否则导入卡的 tc 恒为 null,
   RP_TEMPORAL.defaultChapter 只能吃卡.fields.timeline_stage, 拿不到卡就永远走默认回目。 */
function temporalCardFor(runId, name){
  let tc = null;
  try{
    const rcards = ((window.__DATA__||{}).rp_cards||{})[runId]||[];
    tc = rcards.find(c=>c.name===(name||"")) || null;
  }catch(e){ tc = null; }
  if(!tc && typeof RP_CARDIMPORT!=="undefined"){
    try{ tc = RP_CARDIMPORT.find(name||"") || null; }catch(e){}
  }
  return tc;
}
function simHint(){
  var novel = "";
  try{ novel = (((window.__DATA__||{}).runs||{})[CHAT.runId]||{}).novel || ""; }catch(e){}
  if(CHAT.mode==="traverse"){
    try{ var t = (typeof RP_TRAVERSE!=="undefined") ? RP_TRAVERSE.get(CHAT.travId) : null;
      if(t && t.worldName) novel = t.worldName; }catch(e){}
  }
  return {novel: novel, worldName: novel};
}
function renderSimBar(){
  if(CHAT.mode==="traverse") return; /* 穿越用 wsbar 显示 */
  const head = document.getElementById("chathead");
  let bar = document.getElementById("simbar");
  if(typeof RP_WORLDSIM==="undefined" || !head) { if(bar) bar.style.display="none"; return; }
  if(!RP_WORLDSIM.enabled()){ if(bar) bar.style.display="none"; return; }
  if(!bar){
    bar = document.createElement("div");
    bar.id = "simbar"; bar.className = "simbar";
    bar.title = "世界模拟：点我调整时间/天气/地点";
    bar.addEventListener("click", ()=>simEditor());
    head.parentNode.insertBefore(bar, head.nextSibling);
  }
  bar.style.display = "flex";
  /* 导演标识：只显示风格，不剧透具体指令 */
  var dirChip = "";
  try{ if(typeof RP_DIRECTOR!=="undefined") dirChip = RP_DIRECTOR.briefHTML(simChatKey()); }catch(e){}
  /* 方向二：画像动态检索命中可见（点开展示本轮命中字段） */
  var portChip = "";
  try{
    const _lp = window.__lastPortrait;
    if(_lp && _lp.hits && _lp.hits.length && typeof RP_PORTRAIT!=="undefined")
      portChip = `<span class="simchip" onclick="event.stopPropagation();portraitDebug()" title="本轮画像动态检索命中字段">🎭 画像·${_lp.hits.length}</span>`;
  }catch(e){}
  /* Tier1 接线：立绘舞台 chips（在场角色+当前表情，随世界模拟条一起沉浸显隐） */
  var stageChip = "";
  try{ if(typeof RP_WIRING!=="undefined" && RP_WIRING.stageHTML) stageChip = RP_WIRING.stageHTML(); }catch(e){}
  bar.innerHTML = RP_WORLDSIM.briefHTML(simChatKey(), simHint()) + dirChip + portChip + stageChip + `<span class="simgo">›</span>`;
}
/* 画像命中调试弹窗（renderSimBar 的 simchip 入口） */
window.portraitDebug = ()=>{
  const bar = document.getElementById("simbar"); if(!bar || typeof RP_PORTRAIT==="undefined") return;
  const old = document.getElementById("portraitdbg"); if(old){ old.remove(); return; }
  const lp = window.__lastPortrait || {hits:[], banned:[]};
  const d = document.createElement("div");
  d.id = "portraitdbg"; d.className = "pdebug-pop";
  d.innerHTML = `<div class="pdebug-head">本轮画像命中（点击关闭）</div>` + RP_PORTRAIT.renderDebug(lp.hits, lp.banned);
  d.addEventListener("click", ()=>d.remove());
  bar.parentNode.insertBefore(d, bar.nextSibling);
};
/* ============ 世界模拟编辑器（手动调整时间/天气/地点） ============ */
window.simEditor = ()=>{
  if(typeof RP_WORLDSIM==="undefined"){ alert("世界模拟模块未加载"); return; }
  const key = simChatKey(), hint = simHint();
  const st = RP_WORLDSIM.ensure(key, hint);
  __backAction = ()=>showChat();
  document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
  titleEl.innerHTML = icon("clock") + " 世界模拟"; subEl.textContent = "";
  const p = RP_WORLDSIM.curPlace(st);
  const wxOpts = RP_WORLDSIM.WEATHER.map(w=>
    `<option value="${w.id}" ${st.wx===w.id?"selected":""}>${w.name}</option>`).join("");
  const placeRows = st.places.map(pl=>
    `<div class="kvline">${pl.id===st.cur?"★ ":""}${esc(pl.name)}${pl.mood?" · "+esc(pl.mood):""}`+
    (pl.id!==st.cur?` <button class="btn ghost sm" onclick="wsMoveTo('${jq(pl.name)}')">前往（+${st.travelMin||30}分钟）</button>`:"")+
    `</div>`).join("") || `<div class="meta">暂无地点</div>`;
  /* 时序感知：故事进度 S（回目） */
  let storyCh = 25, storyManual = false;
  try{
    if(typeof RP_TEMPORAL !== "undefined"){
      const tc = temporalCardFor(CHAT.runId, CHAT.name);
      const gs = RP_TEMPORAL.getS(key, tc);
      storyCh = gs.chapter; storyManual = gs.manual;
    }
  }catch(e){}
  const chOpts = Array.from({length:120},(_,i)=>`<option value="${i+1}" ${i+1===storyCh?"selected":""}>第${i+1}回</option>`).join("");
  view.innerHTML = `<button class="back" onclick="showChat()">${icon("back")} 返回</button>
  <div class="card"><h3>${icon("clock",15)} 时间</h3>
    <div class="kv" style="font-size:calc(17px * var(--fs));margin-bottom:8px">${esc(RP_WORLDSIM.fmtTime(st))}</div>
    <div class="btnrow">
      <button class="btn ghost" style="white-space:nowrap" onclick="wsAdjustTime(30)">+30分钟</button>
      <button class="btn ghost" style="white-space:nowrap" onclick="wsAdjustTime(120)">+2小时</button>
      <button class="btn ghost" style="white-space:nowrap" onclick="wsAdjustTime(1440)">+1天</button>
      <button class="btn ghost" style="white-space:nowrap" onclick="wsAdjustTime(-60)">-1小时</button>
    </div></div>
  <div class="card"><h3>${icon("ws_cloud",15)} 天气</h3>
    <div class="field"><label>当前：${esc(RP_WORLDSIM.weatherName(st.wx))}（${esc(RP_WORLDSIM.seasonName(st.m))}季）</label>
    <div class="modelrow"><select id="ws_wxsel">${wxOpts}</select>
    <button class="btn" onclick="wsSetWeather()">设为此天气</button></div></div></div>
  <div class="card"><h3>${icon("pin",15)} 地点 · 当前：${esc(p.name)}</h3>
    ${placeRows}
    <div class="field" style="margin-top:8px"><label>新增地点</label>
    <div class="modelrow"><input id="ws_newplace" placeholder="地点名，如：潇湘馆">
    <button class="btn ghost" onclick="wsAddPlace()">添加</button></div></div>
    <div class="hint">前往地点消耗 ${st.travelMin||30} 分钟（联动时间）。AI 也可在回复中用 ⟦地点=xxx⟧ 自行移动。</div></div>
  <div class="card"><h3>📖 故事进度</h3>
    <div class="kv" style="font-size:calc(15px * var(--fs));margin-bottom:8px">当前：第${storyCh}回${storyManual?"（手动设定）":"（按角色阶段默认·近似）"}</div>
    <div class="modelrow"><select id="ws_chsel">${chOpts}</select>
    <button class="btn" onclick="wsSetChapter()">设为此回</button></div>
    <div class="hint">时序感知只取此回之前的事件注入【往事】；之后的事角色一概不知，防"提前知道剧本"式穿帮。</div></div>`;
};
window.wsSetChapter = ()=>{
  const v = parseInt(document.getElementById("ws_chsel").value, 10);
  if(typeof RP_TEMPORAL!=="undefined") RP_TEMPORAL.setS(simChatKey(), v);
  simEditor();
};
window.wsAdjustTime = (min)=>{
  RP_WORLDSIM.adjustTime(simChatKey(), min, simHint()); simEditor();
};
window.wsSetWeather = ()=>{
  const v = parseInt(document.getElementById("ws_wxsel").value, 10);
  RP_WORLDSIM.setWeather(simChatKey(), v, simHint()); simEditor();
};
window.wsMoveTo = (name)=>{
  RP_WORLDSIM.moveTo(simChatKey(), name, "", simHint()); simEditor();
};
window.wsAddPlace = ()=>{
  const el = document.getElementById("ws_newplace");
  const name = (el.value||"").trim(); if(!name) return;
  RP_WORLDSIM.addPlace(simChatKey(), name, "", "", simHint()); simEditor();
};
/* ============ 单条消息评分 (对标 Talkie RatingFeedback, 本地存档) ============ */
window.rateMsg = (idx, v)=>{
const k = chatHistKey();
let h = null;
try{ h = getHist(k); }catch(e){ rpToast("聊天记录读取失败"); return; }
const m = h[idx]; if(!m) return;
m.rating = (m.rating===v) ? 0 : v;
saveHist(k, h); renderChat();
/* 点踩最新一条 AI 回复: 自动重生一条(旧版保留为 swipe 候选, 可左右切换对比)。
   穿越模式没有重生管线, 仅记录评分; 生成中不重复触发。 */
if(m.rating===-1 && m.role==="assistant"
&& (CHAT.mode==="single" || CHAT.mode==="group")
&& !document.querySelector(".chatbar .stopbtn")){
let lastAI = -1;
h.forEach((mm, i)=>{
const c = mm.content || "";
if(mm.role==="assistant" && c.indexOf("⚠️")!==0 && c.indexOf("【OOC")!==0 && c.indexOf("（已停止")!==0) lastAI = i;
});
if(idx===lastAI) regenMsg();
}
};
/* ============ 沉浸式剧情选项卡 (Ny 式 <small> N 选项, 原生实现; v21 支持 2-6 个) ============ */
function parseOptCard(text){
  var m = String(text||"").match(/<small>([\s\S]*?)<\/small>/i);
  if(!m) return null;
  var body = m[1];
  var parts = body.split(/[1-6]\uFE0F\u20E3/);
  if(parts.length < 3) return null;
  var tips = "";
  var tm = body.match(/tips:\s*"([\s\S]*?)"/i);
  if(tm) tips = tm[1].trim();
  var opts = parts.slice(1).map(function(x){
    return x.replace(/tips:\s*"[\s\S]*?"/i,"").trim();
  }).filter(function(x){ return !!x; });
  if(opts.length < 2) return null;
  return {intro: parts[0].trim(), options: opts, tips: tips, full: m[0]};
}
function optCardHTML(card, active, idx){
  var nums = ["壹","贰","叁","肆","伍","陆"];
  var btns = card.options.map(function(o, i){
    return active
      ? `<button class="optbtn" onclick="event.stopPropagation();pickOption(${jq(idx)},${jq(i)})"><span class="onum">${nums[i]||""}</span><span>${esc(o)}</span></button>`
      : `<div class="optbtn off"><span class="onum">${nums[i]||""}</span><span>${esc(o)}</span></div>`;
  }).join("");
  return `<div class="optcard">`
    + (card.intro ? `<div class="optintro">${esc(card.intro)}</div>` : "")
    + btns
    + (card.tips ? `<div class="opttips">\uD83D\uDCA1 ${esc(card.tips)}</div>` : "")
    + `</div>`;
}
