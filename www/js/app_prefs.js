/* 浮生 · app 分段 11：成就、字号缩放、PIN 应用锁、聊天记录搜索、打字机效果
 * v41 从 app.js 原样迁出（原 app.js 第 3079–3589 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ============ P1-6: 轻量本地成就 ============ */
window.achvUnlock = (id)=>{
if(typeof RP_ACHV==="undefined") return;
if(RP_ACHV.unlock(id)) achvToast(id);
};
let ACHV_TOAST_TIMER = null;
let RP_TOAST_TIMER = null;
/* v41 新手提示排队：首次提示（沉浸引导 / 消息操作 / 🧠 命中…）一次只出一条，
   上一条显示完（dur）再隔 400ms 出下一条，避免几条提示叠在一起。fn 返回 false 表示本条作废、立即放行下一条。 */
window.rpTip = (function(){
  const Q = []; let busy = false;
  function next(){
    const it = Q.shift();
    if(!it){ busy = false; return; }
    busy = true;
    let shown = true;
    try{ shown = it.fn() !== false; }catch(e){ shown = false; }
    setTimeout(next, shown ? it.dur + 400 : 0);
  }
  return function(fn, dur){ Q.push({fn:fn, dur:dur||2800}); if(!busy) next(); };
})();
/* 通用轻提示: 失败/解析失败时 toast 提示, 不中断流程 */
window.rpToast = (msg)=>{
let el = document.getElementById("rpToast");
if(!el){ el = document.createElement("div"); el.id = "rpToast"; el.className = "achv-toast"; document.body.appendChild(el); }
el.textContent = msg;
el.classList.add("show");
if(RP_TOAST_TIMER) clearTimeout(RP_TOAST_TIMER);
RP_TOAST_TIMER = setTimeout(()=>el.classList.remove("show"), 2600);
};
function achvToast(id){
const def = RP_ACHV.DEFS.find(d=>d.id===id); if(!def) return;
let el = document.getElementById("achvToast");
if(!el){ el = document.createElement("div"); el.id = "achvToast"; el.className = "achv-toast"; document.body.appendChild(el); }
el.innerHTML = `${icon("check",14)} 成就解锁: <b>${esc(def.name)}</b><br><span class="dim">${esc(def.desc)}</span>`;
el.classList.add("show");
if(ACHV_TOAST_TIMER) clearTimeout(ACHV_TOAST_TIMER);
ACHV_TOAST_TIMER = setTimeout(()=>el.classList.remove("show"), 2600);
}
/* P2 命名主题切换 */
window.setThemeUI = (id)=>{
try{ if(typeof RP_THEME !== "undefined") RP_THEME.apply(id); }catch(e){}
showSettings();
};
function themeCardsHTML(){
try{
if(typeof RP_THEME === "undefined") return "";
const cur = RP_THEME.get();
const card = t=>`
<div class="themecard${cur===t.id?" on":""}" onclick="setThemeUI('${jq(t.id)}')">
<div class="dots"><span class="dot" style="background:${t.vars["--bg"]}"></span><span class="dot" style="background:${t.vars["--gold"]}"></span><span class="dot" style="background:${t.vars["--ink"]}"></span></div>
<div class="tname">${esc(t.name)}</div><div class="tdesc">${esc(t.desc)}</div></div>`;
const dark = RP_THEME.THEMES.filter(t=>!t.light), light = RP_THEME.THEMES.filter(t=>t.light);
let h = `<div class="themesub">夜间</div><div class="themerow">` + dark.map(card).join("") + `</div>`
+ `<div class="themesub">日间</div><div class="themerow">` + light.map(card).join("") + `</div>`;
/* 我的主题：用户命名的自定义主题（色板基底 + 壁纸 + 字体快照） */
const customs = RP_THEME.listCustom ? RP_THEME.listCustom() : [];
if(customs.length){
  const ccard = c=>{
    const b = RP_THEME.def(c.base);
    return `<div class="themecard${cur===c.id?" on":""}" onclick="setThemeUI('${jq(c.id)}')">
<div class="dots"><span class="dot" style="background:${b.vars["--bg"]}"></span><span class="dot" style="background:${b.vars["--gold"]}"></span><span class="dot" style="background:${b.vars["--ink"]}"></span></div>
<div class="tname">${esc(c.name)}<span style="float:right;color:var(--ink-faint);padding:0 2px" onclick="event.stopPropagation();delCustomThemeUI('${jq(c.id)}')">✕</span></div>
<div class="tdesc">自定义 · ${esc(b.name)}色板 · 壁纸：${esc(RP_THEME.wallpaperLabel(c.wp))}</div></div>`;
  };
  h += `<div class="themesub">我的主题</div><div class="themerow">` + customs.map(ccard).join("") + `</div>`;
}
h += `<div class="btnrow" style="margin-top:10px"><button class="btn ghost" onclick="saveCustomThemeUI()">＋ 把当前外观存为主题</button></div>
<div class="kv" style="margin-top:6px">把现在的色板、壁纸（跟随主题或你的自定义图）和字体一起命名保存，以后一键切回。</div>`;
return h;
}catch(e){ return ""; }
}
/* 保存当前外观为自定义主题：快照 = 基底色板 + 当前生效壁纸 + 当前字体组 */
window.saveCustomThemeUI = async ()=>{
try{
if(typeof RP_THEME === "undefined" || typeof uiPrompt === "undefined") return;
const name = await uiPrompt("存为自定义主题", "给这套外观起个名字：", "");
if(name === null) return;
const nm = String(name || "").trim();
if(!nm){ alert("名字不能为空"); return; }
const curDef = RP_THEME.def(RP_THEME.get());
const snap = { base: curDef.custom ? curDef.base : curDef.id,
               wp: RP_THEME.effectiveWp(),
               font: RP_THEME.getFont ? RP_THEME.getFont() : "" };
RP_THEME.saveCustom(nm, snap);
showSettings();
}catch(e){}
};
/* ---------- 动效（预设组 × 速度档，RP_MOTION） ---------- */
function motionCardsHTML(){
try{
if(typeof RP_MOTION === "undefined") return "";
const cur = RP_MOTION.get();
const pcard = p=>`<div class="themecard${cur.preset===p.id?" on":""}" onclick="setMotionUI('${jq(p.id)}')">
<div class="tname">${esc(p.name)}</div><div class="tdesc">${esc(p.desc)}</div></div>`;
const sbtn = s=>`<button class="btn ${cur.speed===s.id?"":"ghost"}" onclick="setMotionSpeedUI('${jq(s.id)}')">${esc(s.name)}</button>`;
return `<div class="themesub">风格</div><div class="themerow">` + RP_MOTION.PRESETS.map(pcard).join("") + `</div>`
+ `<div class="themesub">速度</div><div class="btnrow">` + RP_MOTION.SPEEDS.map(sbtn).join("") + `</div>`
+ `<div class="kv" style="margin-top:6px">速度对全部动效统一生效（页面切换、消息浮现、抽屉滑出、背景呼吸）。</div>`;
}catch(e){ return ""; }
}
function refreshMotionBox(){
const b = document.getElementById("motionbox");
if(b) b.innerHTML = motionCardsHTML();
}
window.setMotionUI = (id)=>{
try{ if(typeof RP_MOTION !== "undefined") RP_MOTION.setPreset(id); }catch(e){}
refreshMotionBox();
};
window.setMotionSpeedUI = (id)=>{
try{ if(typeof RP_MOTION !== "undefined") RP_MOTION.setSpeed(id); }catch(e){}
refreshMotionBox();
};
window.delCustomThemeUI = async (id)=>{
try{
if(typeof RP_THEME === "undefined") return;
if(typeof uiConfirm !== "undefined" && !(await uiConfirm("删除这个自定义主题？", ""))) return;
const wasActive = RP_THEME.get() === id;
RP_THEME.removeCustom(id);
if(wasActive) RP_THEME.apply("moye");
showSettings();
}catch(e){}
};
/* 字体组切换（内置开源字体，rp/theme.js RP_FONT；预览用该组标题字体渲染） */
window.setFontUI = (id)=>{
try{ if(typeof RP_FONT !== "undefined") RP_FONT.apply(id); }catch(e){}
showSettings();
};
function fontCardsHTML(){
try{
if(typeof RP_FONT === "undefined") return "";
const cur = RP_FONT.get();
return `<div class="themerow" style="margin-top:8px">` + RP_FONT.SETS.map(f=>`
<div class="themecard${cur===f.id?" on":""}" onclick="setFontUI('${jq(f.id)}')">
<div class="fprev" style="font-family:${f.serif.replace(/"/g,"'")}">浮生夜话</div>
<div class="tname">${esc(f.name)}</div><div class="tdesc">${esc(f.desc)}</div></div>`).join("") + `</div>`;
}catch(e){ return ""; }
}
/* ============ 字号缩放（P0-28：--fs 文本倍率） ============
   旧实现是 documentElement.style.zoom，zoom 会把布局视口一起等比缩小
   （360px 视口在 1.3 档下有效宽度仅 277px，底栏"蒸馏"折成两行），
   且 position:fixed / env() 各引擎行为不一致。改为只缩 font-size：
   所有字号写成 calc(Npx * var(--fs))，布局盒子（padding/高度/宽度）不动。*/
const FONT_SCALES = [1, 1.15, 1.3];
function getFontScale(){
  let v = 1;
  try{ v = parseFloat(localStorage.getItem("nd_font_scale")); }catch(e){}
  return FONT_SCALES.indexOf(v) >= 0 ? v : 1;   /* 只认设置页给的档位，脏值回落 1 */
}
function applyFontScale(){ try{ document.documentElement.style.setProperty("--fs", String(getFontScale())); }catch(e){} }
window.setFontScale = (v)=>{
  try{ localStorage.setItem("nd_font_scale", String(v)); }catch(e){}
  applyFontScale(); showSettings();
};
function fontScaleCardsHTML(){
  const fs = getFontScale();
  const opts = [[1,"标准"],[1.15,"大"],[1.3,"特大"]];   /* 与 FONT_SCALES 同档 */
  return `<div class="chiprow" data-xfade style="margin-top:8px">` + opts.map(o=>
    `<button class="pickchip${fs===o[0]?" on":""}" onclick="setFontScale(${jq(o[0])})">${o[1]}</button>`).join("") + `</div>`;
}
/* 选人页快捷条：签到 + 成就（把藏在设置里的游玩入口浮上来） */
function dailyStripHTML(){
  try{
    const hasCk = typeof RP_CHECKIN!=="undefined", hasAc = typeof RP_ACHV!=="undefined";
    if(!hasCk && !hasAc) return "";
    const done = hasCk && RP_CHECKIN.hasToday();
    const st = hasCk ? RP_CHECKIN.streak() : 0;
    const ac = hasAc ? `${RP_ACHV.count()}/${RP_ACHV.DEFS.length}` : "";
    return `<div class="dailystrip">`
      + (hasCk ? `<button class="ds${done?" done":""}" onclick="checkinQuick()">${done?"📅 今日已签到 ✓":"📅 签到"+(st?` · 连${st}天`:"")}</button>` : "")
      + (hasAc ? `<button class="ds" onclick="showAchv('picker')">🏆 成就 ${ac} ›</button>` : "")
      + `</div>`;
  }catch(e){ return ""; }
}
window.checkinQuick = ()=>{
  try{
    const r = RP_CHECKIN.checkin();
    if(r && r.isNew) rpToast(`签到成功，已连续 ${r.streak} 天`);
  }catch(e){}
  showChatPicker();
};
/* P2 每日签到 */
window.CHECKIN_M = 0;
function checkinCardHTML(){
if(typeof RP_CHECKIN === "undefined") return "";
const now = new Date();
const off = window.CHECKIN_M || 0;
const base = new Date(now.getFullYear(), now.getMonth() + off, 1);
const y = base.getFullYear(), m = base.getMonth();
const cells = RP_CHECKIN.monthCells(y, m);
const signed = RP_CHECKIN.signedSet(y, m);
const done = RP_CHECKIN.hasToday();
const st = RP_CHECKIN.streak(), tot = RP_CHECKIN.total();
let cal = `<div class="calhead"><button class="btn ghost sm" onclick="checkinMonth(-1)">‹ 上月</button>`
+ `<b>${y} 年 ${m + 1} 月</b><button class="btn ghost sm" onclick="checkinMonth(1)">下月 ›</button></div>`;
cal += `<div class="calgrid">` + ["一","二","三","四","五","六","日"].map(w=>`<div class="calcell wk">${w}</div>`).join("") + `</div>`;
cal += `<div class="calgrid">` + cells.map(d=>{
if(d == null) return `<div class="calcell pad"></div>`;
const cls = "calcell" + (signed[d] ? " signed" : "") + (off === 0 && d === now.getDate() ? " today" : "");
return `<div class="${cls}">${d}</div>`;
}).join("") + `</div>`;
return `<div class="setcard"><h3>${icon("calendar",15)} 每日签到</h3>`
+ `<div class="kv">连续签到 <b style="color:var(--gold)">${st}</b> 天 · 累计 ${tot} 天${done ? " · 今日已签到" : ""}</div>`
+ `<div class="btnrow" style="margin-top:8px"><button class="btn"${done ? " disabled" : ""} onclick="checkinUI()">${done ? "今日已签到 ✓" : "签到"}</button></div>`
+ cal + `<div class="hint">纯本地纪念，无货币无奖励。</div></div>`;
}
window.checkinUI = ()=>{
let r = null;
try{ r = RP_CHECKIN.checkin(); }catch(e){}
if(r && r.isNew){ try{ rpToast(`签到成功，已连续 ${r.streak} 天`); }catch(e){} }
showSettings();
};
window.checkinMonth = (d)=>{ window.CHECKIN_M = (window.CHECKIN_M || 0) + d; showSettings(); };
window.showAchv = (from)=>{
window._achvFrom = (from==="picker") ? "picker" : "settings";
const backFn = window._achvFrom==="picker" ? "showChatPicker()" : "showSettings()";
__backAction = ()=>{ if(window._achvFrom==="picker") showChatPicker(); else showSettings(); };
titleEl.textContent = "成就"; subEl.textContent = `已解锁 ${RP_ACHV.count()}/${RP_ACHV.DEFS.length}`;
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
view.innerHTML = `<button class="back" onclick="${backFn}">${icon("back")} 返回${window._achvFrom==="picker"?"选人":"设置"}</button>
<div class="hint">本地记录, 无数值无排行, 纯粹纪念。</div>`
+ RP_ACHV.list().map(a=>`<div class="card ${a.unlocked?"":"dimmed"}"><div class="row"><div class="avatar">${icon(a.icon,20)}</div>
<div><div class="name">${esc(a.name)} ${a.unlocked?"":`<span class="badge">未解锁</span>`}</div>
<div class="kv">${esc(a.desc)}${a.unlocked&&a.ts?` · ${new Date(a.ts).toLocaleDateString("zh-CN")}`:""}</div></div></div></div>`).join("")
+ `<div style="height:40px"></div>`;
window.scrollTo(0,0);
};

/* ============ P1-7: 纯前端 PIN 应用锁 ============ */
window.pinUnlockScreen = ()=>{
return new Promise((resolve)=>{
if(typeof RP_PIN==="undefined" || !RP_PIN.has()){ resolve(true); return; }
const ov = document.createElement("div");
ov.id = "pinlock"; ov.className = "pinlock";
let digits = "";
const dots = ()=> [0,1,2,3].map(i=>`<span class="pdot${i<digits.length?" on":""}"></span>`).join("");
const render = ()=>{
ov.innerHTML = `<div class="pin-box">
<div class="pin-title">${icon("check",18)} 应用已锁定</div>
<div class="pin-dots">${dots()}</div>
<div class="pin-pad">${[1,2,3,4,5,6,7,8,9,"",0,"del"].map(k=>
k==="" ? `<span></span>`
: k==="del" ? `<button class="pkey" data-k="del">⌫</button>`
: `<button class="pkey" data-k="${k}">${k}</button>`).join("")}</div>
<div class="pin-msg" id="pinMsg"></div>
<div class="pin-warn">忘记 PIN 只能清除全部数据, 没有找回途径</div>
<button class="pin-wipe" id="pinWipe">清除全部数据</button>
</div>`;
ov.querySelectorAll(".pkey").forEach(b=>b.addEventListener("click", ()=>press(b.getAttribute("data-k"))));
const w = ov.querySelector("#pinWipe"); if(w) w.addEventListener("click", wipe);
};
const msg = (t)=>{ const m = ov.querySelector("#pinMsg"); if(m) m.textContent = t; };
const press = async (k)=>{
if(RP_PIN.lockRemain() > 0) return;
if(k==="del"){ digits = digits.slice(0,-1); render(); return; }
if(digits.length >= 4) return;
digits += k;
if(digits.length < 4){ render(); return; }
render();
const ok = await RP_PIN.verify(digits);
if(ok){ RP_PIN.resetFails(); document.body.classList.remove("pinlocked"); ov.remove(); resolve(true); return; }
const r = RP_PIN.fail();
digits = "";
if(r.locked){ msg("连续错误 5 次, 锁定 1 分钟"); lockCount(); }
else { msg(`PIN 错误, 还剩 ${r.left} 次机会`); render(); }
};
const lockCount = ()=>{
const remain = RP_PIN.lockRemain();
if(remain <= 0){ msg(""); render(); return; }
msg(`已锁定, ${Math.ceil(remain/1000)} 秒后重试`);
setTimeout(lockCount, 1000);
};
const wipe = ()=>{
if(!confirm("确定清除全部数据吗？\n所有聊天记录、记忆、角色卡、存档都会被删除, 不可恢复！")) return;
if(!confirm("最后确认: 真的要清空一切吗？")) return;
/* 必须走统一执行器：只 localStorage.clear() 会留下 IDB 整库和原生 ndblob 文件，
 * 重启后数据"隐身"但仍可被恢复，与"不可恢复"承诺不符。 */
if(typeof window.__wipeAllData === "function"){
  window.__wipeAllData({clearAll:true, reload:true});
}else{
  try{ localStorage.clear(); }catch(e){}
  location.reload();
}
};
document.body.appendChild(ov);
document.body.classList.add("pinlocked");
render();
if(RP_PIN.lockRemain() > 0) lockCount();
});
};
function renderPinSettings(){
const box = document.getElementById("pinset"); if(!box) return;
if(typeof RP_PIN==="undefined"){ box.innerHTML = `<div class="hint">PIN 模块未加载</div>`; return; }
if(!RP_PIN.has()){
box.innerHTML = `<div class="field"><label>设置 4 位数字 PIN</label>
<div class="pinrow"><input id="pin_new1" type="password" inputmode="numeric" maxlength="4" placeholder="••••">
<input id="pin_new2" type="password" inputmode="numeric" maxlength="4" placeholder="再输一次"></div></div>
<div class="btnrow"><button class="btn" onclick="pinSet()">设置 PIN 锁</button></div>
<div class="hint">忘记 PIN 只能清除全部数据, 没有找回途径。</div>`;
}else{
box.innerHTML = `<div class="kv">应用锁已开启${RP_PIN.lockRemain()>0?" · 当前锁定中":""}</div>
<div class="btnrow" style="margin-top:8px"><button class="btn ghost" onclick="pinChangeUI()">修改 PIN</button>
<button class="btn ghost" onclick="pinRemoveUI()">关闭应用锁</button></div>
<div id="pinchange" style="margin-top:8px"></div>`;
}
}
window.pinSet = async ()=>{
const a = (document.getElementById("pin_new1").value||"").trim();
const b = (document.getElementById("pin_new2").value||"").trim();
if(a !== b){ alert("两次输入不一致"); return; }
try{ await RP_PIN.set(a); alert("应用锁已开启"); renderPinSettings(); }
catch(e){ alert(e.message); }
};
window.pinChangeUI = ()=>{
const box = document.getElementById("pinchange"); if(!box) return;
box.innerHTML = `<div class="field"><label>旧 PIN</label>
<input id="pin_old" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="width:90px"></div>
<div class="field"><label>新 PIN</label>
<div class="pinrow"><input id="pin_ch1" type="password" inputmode="numeric" maxlength="4" placeholder="••••">
<input id="pin_ch2" type="password" inputmode="numeric" maxlength="4" placeholder="再输一次"></div></div>
<div class="btnrow"><button class="btn" onclick="pinChangeDo()">确认修改</button></div>`;
};
window.pinChangeDo = async ()=>{
const old = (document.getElementById("pin_old").value||"").trim();
const a = (document.getElementById("pin_ch1").value||"").trim();
const b = (document.getElementById("pin_ch2").value||"").trim();
if(!(await RP_PIN.verify(old))){ alert("旧 PIN 不正确"); return; }
if(a !== b){ alert("两次输入不一致"); return; }
try{ await RP_PIN.set(a); alert("PIN 已修改"); renderPinSettings(); }
catch(e){ alert(e.message); }
};
window.pinRemoveUI = async ()=>{
const old = prompt("输入当前 PIN 以关闭应用锁:");
if(old === null) return;
if(await RP_PIN.verify(old)){ RP_PIN.clear(); alert("应用锁已关闭"); renderPinSettings(); }
else alert("PIN 不正确");
};

/* ============ P1-4: 聊天记录搜索(单聊/群聊/穿越通用, 大小写不敏感, 关键词高亮, n/总数, 上下跳转) ============ */
let SEARCH = {active:false, q:"", hits:[], cur:-1};
window.toggleChatSearch = (force)=>{
SEARCH.active = force!=null ? !!force : !SEARCH.active;
if(!SEARCH.active){ SEARCH.q=""; SEARCH.hits=[]; SEARCH.cur=-1; }
renderChatSearch();
if(SEARCH.active){ const i = document.getElementById("cs_input"); if(i) i.focus(); }
else renderChat();
};
function searchHits(){
const h = getHistSafe(chatHistKey());
const q = SEARCH.q.trim().toLowerCase();
SEARCH.hits = [];
if(!q) return;
for(let i=0;i<h.length;i++){
const m = h[i];
const txt = ((m.speaker?m.speaker+"：":"") + String(m.content||"")).toLowerCase();
if(txt.indexOf(q)>=0) SEARCH.hits.push(i);
}
}
function hlSearchRaw(text){ // 先在原文里插占位符, md() 之后再还原成 <mark>(避免破坏 HTML 标签)
if(!SEARCH.active || !SEARCH.q.trim()) return text;
try{
const q = SEARCH.q.trim().replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
return String(text).replace(new RegExp(q,"gi"), m=>"\u0001"+m+"\u0002");
}catch(e){ return text; }
}
function hlRestore(html){
if(!SEARCH.active || !SEARCH.q.trim()) return html;
return String(html).split("\u0001").join("<mark>").split("\u0002").join("</mark>");
}
window.chatSearchInput = (v)=>{
SEARCH.q = v;
searchHits();
SEARCH.cur = SEARCH.hits.length ? 0 : -1;
renderChat();
updateSearchBar();
if(SEARCH.cur>=0) scrollToHit();
};
window.chatSearchGo = (dir)=>{
if(!SEARCH.hits.length) return;
SEARCH.cur = (SEARCH.cur + dir + SEARCH.hits.length) % SEARCH.hits.length;
renderChat();
updateSearchBar();
scrollToHit();
};
function scrollToHit(){
const idx = SEARCH.hits[SEARCH.cur];
if(idx==null) return;
const el = document.getElementById("smsg-"+idx);
if(el && el.scrollIntoView){ markProgScroll(); el.scrollIntoView({block:"center"}); }
}
function updateSearchBar(){
const n = document.getElementById("cs_num");
if(n) n.textContent = (SEARCH.cur>=0?SEARCH.cur+1:0) + "/" + SEARCH.hits.length;
}
function renderChatSearch(){
const bar = document.getElementById("chatsearch");
if(!bar) return;
if(!SEARCH.active){ bar.innerHTML = ""; return; }
if(bar.innerHTML.indexOf("cs_input")>=0) return; // 输入中不重建, 保住焦点
bar.innerHTML = `<div class="csbar">`
+ `<input id="cs_input" placeholder="搜索聊天记录" value="${esc(SEARCH.q)}" oninput="chatSearchInput(this.value)">`
+ `<span class="cs-num" id="cs_num">0/0</span>`
+ `<button onclick="chatSearchGo(-1)" title="上一个">‹</button>`
+ `<button onclick="chatSearchGo(1)" title="下一个">›</button>`
+ `<button onclick="toggleChatSearch(false)" title="关闭">${icon("x",14)}</button></div>`;
}
/* ============ P2: 打字机效果（AI 回复逐字呈现，可打断） ============ */
let TW = {timer:null, key:"", idx:-1, mid:""};
function twStop(){ if(TW.timer){ clearInterval(TW.timer); TW.timer = null; } }
/* 立即打断完成：停掉定时器并整页重渲染出全文 */
window.twFinish = ()=>{ if(!TW.timer) return; twStop(); renderChat(); };
function twStart(idx, bodyText, cardHTML, mid){
const log = $("#chatlog"); if(!log) return;
const frames = (typeof RP_TYPEWRITER!=="undefined") ? RP_TYPEWRITER.progressFrames(bodyText) : [bodyText];
/* P1-P2: 长回复的每帧都 md() 全文等于把 markdown 解析跑了 ~110 遍（O(n²) 主因）。
 * 超过 1200 字时动画阶段改用 textContent 纯文本推进，播完（done）再一次性 md 出成品；
 * 视觉上只差动画期间的粗体/斜体，换来的是常数级帧成本。搜索高亮态保持原路径。 */
const twPlain = String(bodyText||"").length > 1200;
let fi = 0;
TW.idx = idx;
TW.mid = mid || "";
/* 首帧立即置空+光标，避免 45ms 后才改造成的全文闪烁 */
const el0 = document.getElementById("smsg-"+idx);
if(el0){ const b0 = el0.querySelector(".bubble"); if(b0) b0.innerHTML = `<span class="twcur"></span>`; }
TW.timer = setInterval(()=>{
fi++;
const done = fi >= frames.length;
const el = document.getElementById("smsg-"+idx);
/* P2-3: idx 漂移（播放中插入/删除消息）——元素没了，或该位置已被别的消息顶替：
   停掉定时器并整页重渲染，从历史补出剩余全文，不许永久停在半截/光标帧 */
if(!el || (TW.mid && el.dataset && el.dataset.mid !== TW.mid)){ twStop(); renderChat(); return; }
const bub = el.querySelector(".bubble");
if(bub){
const partial = frames[Math.min(fi, frames.length-1)];
if(twPlain && !done && !SEARCH.active){
  bub.textContent = partial;
  bub.insertAdjacentHTML("beforeend", `<span class="twcur"></span>`);
}else{
const _ph = hlRestore(md(hlSearchRaw(partial)));
bub.innerHTML = (bub.classList.contains("segd") ? chatSegHTML(_ph) : _ph) + (done?cardHTML:`<span class="twcur"></span>`);
}
}
if(chatNearBottom()){ markProgScroll(); log.scrollTop = log.scrollHeight; }
if(done){ twStop(); renderChat(); /* M4: 播完重渲染，长消息挂上折叠结构 */ }
}, 45);
}
/* v37 性能: 渲染签名——数据未变时跳过全量重建。
 * 发一条消息的流程会调 renderChat 3+ 次（用户消息入库后 / AI 入库后 / finally），
 * 其中多次传入的是同一份历史；原先每次都 md() 逐条解析 + 整体替换 innerHTML。 */
let __chatRenderSig = null;
function chatRenderSig(k, h){
const parts = [k, CHAT.mode||"", SEARCH.active ? (SEARCH.q||"") : "", (SEARCH.cur|0)];
for(let i=0;i<h.length;i++){
const m = h[i] || {};
parts.push(m.mid||m.id||i, (m.content||"").length, m.rating||0,
(m.memHits?m.memHits.length:0), (m.loreHits?m.loreHits.length:0),
(m.candidates?m.candidates.length:0), m.ci||0, m.mtype||"", m.speaker||"");
}
return parts.join("|");
}
function renderChat(forceBottom){
twStop(); /* 新渲染进来（发消息/切tab/新回复）先停掉旧动画 */
const _k = chatHistKey();
const h = getHistSafe(_k);
const log = $("#chatlog");
if(!log) return;
const _sig = chatRenderSig(_k, h);
/* 切角色/重进聊天会重建 #chatlog（DOM 为空但签名仍是旧的），此时必须强制重绘 */
const _domFresh = !log.firstChild;
if(_sig === __chatRenderSig && !(_domFresh && h.length)){
  /* 数据未变：跳过整页重建（重复调用收敛为一次），仅按需保持滚动位置 */
  if(forceBottom){ try{ log.scrollTop = log.scrollHeight; }catch(e){} }
  return;
}
__chatRenderSig = _sig;
/* 用户上滑看历史时不强制回底(防抖动); 发出新消息等场景由调用方传 true */
const stick = !!forceBottom || chatNearBottom();
renderChatSearch();
if(SEARCH.active && SEARCH.q.trim()){ // 新消息进来时重算命中
searchHits();
if(SEARCH.cur>=SEARCH.hits.length) SEARCH.cur = SEARCH.hits.length-1;
updateSearchBar();
}
let lastAI = -1;
h.forEach((m, i)=>{
if(m.role==="assistant" && m.content.indexOf("⚠️")!==0
&& m.content.indexOf("【OOC")!==0 && m.content.indexOf("（已停止")!==0) lastAI = i;
});
/* v37: 命中集合每次渲染只建一次，避免每条消息 indexOf 线性查找 */
const __hitSet = SEARCH.active ? new Set(SEARCH.hits) : null;
log.innerHTML = h.map((m, idx)=>{
/* 推剧情触发注记：居中显示，不占气泡 */
if(m.pushNote){
  return `<div class="pushnote">${icon("clapperboard",13)} 剧情推进</div>`;
}
const mtype = m.mtype || (m.role==="user" ? "player" : "char");
const who = m.role==="user"
? (mtype==="narr" ? icon("scroll")+" 旁白" : (mtype==="npc" ? (m.speaker||"我") : travPlayerName()))
: (CHAT.mode==="group"?(m.speaker||"?"):(CHAT.mode==="traverse"?"世界":CHAT.name));
const showWho = CHAT.mode==="group" || m.role==="assistant"; /* S6→v42: 群聊保留说话人姓名行；v42 起 AI 消息一律带头像+名牌（「人」在场） */
const whoHTML = m.role==="assistant" ? chatWhoHTML(who) : `<div class="who">${esc(who)}</div>`;
let extra = "";
const rateBtns = m.role==="assistant"
? `<button class="${m.rating===1?"on":""}" onclick="event.stopPropagation();rateMsg(${jq(idx)},1)" aria-label="赞" aria-pressed="${m.rating===1?"true":"false"}">${icon("thumb-up",15)}</button>`
+ `<button class="${m.rating===-1?"on":""}" onclick="event.stopPropagation();rateMsg(${jq(idx)},-1)" aria-label="踩" aria-pressed="${m.rating===-1?"true":"false"}">${icon("thumb-down",15)}</button>` : "";
/* S-4 召回指示器：本条 AI 回复注入了记忆/世界书时，气泡工具条出现 🧠 角标 */
const memBtn = (m.role==="assistant" && ((m.memHits&&m.memHits.length)||(m.loreHits&&m.loreHits.length)))
? `<button onclick="event.stopPropagation();toggleMemHits(${jq(idx)})" title="这次想起了什么" aria-label="这次想起了什么">${icon("brain",15)}</button>` : "";
/* 🧠 命中透明度：第一次出现时解释一次含义 */
if(memBtn){ try{
  if(!localStorage.getItem("nd_memhit_tip")){
    localStorage.setItem("nd_memhit_tip", "1");
    setTimeout(()=>{ const _tip = ()=>{ rpToast("🧠 表示这条回复参考了记忆 / 世界书，点它查看明细"); };
      try{ (typeof window.rpTip==="function") ? window.rpTip(_tip, 2600) : _tip(); }catch(e){} }, 1200);
  }
}catch(e){} }
if(m.role==="assistant" && idx===lastAI){
if(m.candidates && m.candidates.length>1){
extra += `<div class="swipe" onclick="event.stopPropagation()"><button onclick="swipeMsg(${jq(idx)},-1)">‹</button>`
+ `<span>${(m.ci||0)+1}/${m.candidates.length}</span>`
+ `<button onclick="swipeMsg(${jq(idx)},1)">›</button></div>`;
}
/* P0: 穿越模式的 regenMsg 是坏的（CHAT.runId 为空），改走 regenMsgAt */
const regenBtn = CHAT.mode==="traverse"
? `<button onclick="event.stopPropagation();regenMsgAt(${jq(idx)})">↻ 重生</button>`
: `<button onclick="event.stopPropagation();regenMsg()">↻ 重生</button>`;
extra += `<div class="msgtools">` + rateBtns + memBtn
+ voiceBubbleHTML(idx, m)
+ (repickInfo() ? `<button onclick="event.stopPropagation();repickOption()" title="回到上一个决策点重新选择">↩ 重选</button>` : "")
+ `<button onclick="event.stopPropagation();editMsg(${jq(idx)})">编辑</button>`
+ `<button onclick="event.stopPropagation();copyMsg(${jq(idx)})">复制</button>`
+ regenBtn
+ `<button onclick="event.stopPropagation();delMsg(${jq(idx)})">删除</button></div>`;
} else {
extra = `<div class="msgtools">` + rateBtns + memBtn
+ (m.role==="assistant"?voiceBubbleHTML(idx,m):"")
+ (m.role==="assistant" ? `<button onclick="event.stopPropagation();regenMsgAt(${jq(idx)})" title="重生这条（会删掉它后面的消息）">↻ 重生</button>` : "")
+ `<button onclick="event.stopPropagation();editMsg(${jq(idx)})">编辑</button>`
+ `<button onclick="event.stopPropagation();copyMsg(${jq(idx)})">复制</button>`
+ `<button onclick="event.stopPropagation();delMsg(${jq(idx)})">删除</button></div>`;
}
let body = m.content, cardHTML = "";
if(m.role==="assistant"){
const oc = parseOptCard(m.content);
if(oc){ body = m.content.replace(oc.full, "").trim(); cardHTML = optCardHTML(oc, idx===lastAI, idx); }
}
const isHit = !!__hitSet && __hitSet.has(idx);
const isCur = isHit && SEARCH.hits[SEARCH.cur]===idx;
/* v42: AI 消息按旁白/对白分排（见 js/app_ui.js chatSegHTML） */
const segOn = chatSegEligible(m);
const _mdh = hlRestore(md(hlSearchRaw(body)));
const rendered = (segOn ? chatSegHTML(_mdh) : _mdh) + cardHTML;
/* M4: 长文本折叠（Talkie FoldTextView，阈值 600 字） */
const needFold = body.length > 600;
const bubbleInner = needFold
? `<div class="foldbody">${rendered}</div><button class="foldtoggle" onclick="event.stopPropagation();foldToggle(this)">展开全文</button>`
: rendered;
/* Soul 冲突徽章 */
const conflictBadge = (m._conflicts && m._conflicts.length && !m._conflictResolved && typeof RP_SOUL_CFG !== "undefined")
? RP_SOUL_CFG.conflictBadgeHTML(m._conflicts, idx) : "";
/* Tier1 接线结算条：好感变化 / CG / 判定等结构化结果挂在气泡下方 */
const wireHTML = (m.role==="assistant" && m.wire && typeof RP_WIRING!=="undefined" && RP_WIRING.wireHTML) ? RP_WIRING.wireHTML(m.wire) : "";
return `<div class="msg ${m.role==="user"?"me":""}${mtype==="narr"?" narr":""}${mtype==="npc"?" npc":""}${isCur?" curhit":""}" id="smsg-${idx}" data-mid="${esc(m.mid||m.id||"")}" onclick="toggleTools(event,${jq(idx)})" oncontextmenu="event.preventDefault();msgMenu(${jq(idx)});return false;" ontouchstart="msgPressStart(event,${jq(idx)})" ontouchend="msgPressEnd()" ontouchmove="msgPressEnd()">`
+ `<div class="msgcol">${showWho?whoHTML:""}<div class="bubble${segOn?" segd":""}${needFold?" foldable collapsed":""}">${bubbleInner}${conflictBadge}</div>${wireHTML}${extra}</div>`
+ `</div>`;
}).join("") || `<div class="empty">还没有对话，打个招呼吧<br><span style="font-size:calc(12px * var(--fs))">试试：你是谁？</span></div>`;
renderCtxBar();
try{ if(CHAT.mode==="group") paintChatPortrait(); }catch(e){} /* v42: 群聊立绘跟随最近发言者 */
if(stick){ markProgScroll(); log.scrollTop = log.scrollHeight; }
renderWsBar();
renderSimBar();
/* P2 打字机：只对"最新一条 AI 消息"做逐字动画；重渲染旧消息不重复播 */
try{
if(lastAI>=0){
const key = chatHistKey()+"|"+h.length+"|"+(h[lastAI].ts||h[lastAI].content.length);
if(lastAI===h.length-1 && TW.key!==key && typeof RP_TYPEWRITER!=="undefined" && RP_TYPEWRITER.shouldAnimate()){
TW.key = key;
const m = h[lastAI];
const oc0 = parseOptCard(m.content);
const body0 = oc0 ? m.content.replace(oc0.full,"").trim() : m.content;
twStart(lastAI, body0, oc0 ? optCardHTML(oc0, true, lastAI) : "", h[lastAI].mid || h[lastAI].id || "");
}else{
TW.key = key;
}
}
}catch(e){}
/* v42-10: 流式中且还没有 live 气泡 → 末尾补上等待态（innerHTML 重建会冲掉它） */
try{ showPenWait(); }catch(e){}
}
/* S-4 召回指示器 (对标 Kindroid 紫色脑图标): 点 🧠 展开"这次想起了什么" */
window.toggleMemHits = (idx)=>{
const h = getHistSafe(chatHistKey()); const m = h[idx]; if(!m) return;
const box = document.getElementById("smsg-"+idx); if(!box) return;
const old = box.querySelector(".mmhits");
if(old){ old.remove(); return; }
const rows = [];
(m.memHits||[]).forEach(x=>rows.push(`<div>🧠 ${esc(x.label)}${x.items?` <span class="dim">×${x.items}</span>`:""} <span class="dim">· 记忆</span></div>`));
(m.loreHits||[]).forEach(t=>rows.push(`<div>📖 ${esc(t)} <span class="dim">· 世界书</span></div>`));
if(!rows.length) return;
const p = document.createElement("div"); p.className = "mmhits";
p.innerHTML = `<div class="mmhits-ttl">这次想起了</div>` + rows.join("");
box.querySelector(".msgcol").appendChild(p);
};
