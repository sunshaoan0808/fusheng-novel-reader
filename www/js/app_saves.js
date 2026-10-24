/* 浮生 · app 分段 16：平行存档/故事树、Rewind 回溯、Persona、角色卡 PNG 导出
 * v41 从 app.js 原样迁出（原 app.js 第 5054–5513 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ============ 平行存档 (对标 Xclaw: 多时间线快照, 随时存档/加载/删除) ============ */
function savesKey(){ return "nd_saves_" + chatHistKey(); }
function getSaves(){
try{ const s = JSON.parse(localStorage.getItem(savesKey())||"[]"); return Array.isArray(s)?s:[]; }
catch(e){ return []; }
}
/* ============ P1-5: 平行存档故事树: 分支来源(按聊天维度记) ============ */
const BRANCH_KEY = "nd_branchsrc";
const getBranchSrc = ()=>{ try{ return JSON.parse(localStorage.getItem(BRANCH_KEY)) || {}; }catch(e){ return {}; } };
const setBranchSrc = (chatKey, saveId)=>{ const m = getBranchSrc(); m[chatKey] = saveId; try{ localStorage.setItem(BRANCH_KEY, JSON.stringify(m)); }catch(e){} };
/* 存档树: parentId 指向存在的存档才算父子, 否则按根节点平铺(兼容旧存档) */
function saveTree(){
const ss = getSaves();
const byId = {}; ss.forEach(s=>{ byId[s.id] = s; });
const children = {}, roots = [];
ss.forEach(s=>{
const pid = (s.parentId!=null && byId[s.parentId]) ? s.parentId : null;
if(pid==null) roots.push(s);
else (children[pid] = children[pid] || []).push(s);
});
roots.sort((a,b)=>b.ts-a.ts);
Object.keys(children).forEach(k=>children[k].sort((a,b)=>a.ts-b.ts));
return {roots, children};
}
window.openSaves = ()=>{ renderSaves(); };
function renderSaves(){
__backAction = ()=>showChat();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
const label = CHAT.mode==="group" ? ("群聊·"+CHAT.members.length+"人") : CHAT.name;
titleEl.innerHTML = icon("save")+" 平行存档"; subEl.textContent = label + " · 多时间线快照";
const fmtT = (ts)=> new Date(ts).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
/* P1-5: 故事树渲染(树形缩进 + 连线, 旧存档无 parentId 按平铺显示) */
const tree = saveTree();
let rows = "";
const walk = (s, depth, conn)=>{
const n = (s.history||[]).length;
const last = (s.history||[]).filter(m=>m.role==="assistant").slice(-1)[0];
const prev = last ? esc(String(last.content||"").slice(0,60)) : "（空）";
const badge = s.parentId ? ` <span class="badge">分支</span>` : "";
rows += `<div class="snode" style="margin-left:${depth*20}px">`
+ (depth?`<div class="stree">${conn}</div>`:"")
+ `<div class="card save-card"><div class="save-name">${esc(s.name||"未命名存档")}${badge}</div>`
+ `<div class="meta">${fmtT(s.ts)} · ${n} 条消息</div>`
+ `<div class="save-prev">${prev}</div>`
+ `<div class="btnrow" style="margin-top:8px">`
+ `<button class="btn" onclick="loadSaveSlot(${jq(s.id)})">${icon("download")} 加载</button>`
+ `<button class="btn ghost" onclick="renameSaveSlot(${jq(s.id)})">改名</button>`
+ `<button class="btn danger" onclick="delSaveSlot(${jq(s.id)})">删除</button>`
+ `</div></div></div>`;
(tree.children[s.id]||[]).forEach((c,i,arr)=>walk(c, depth+1, i===arr.length-1?"└─":"├─"));
};
tree.roots.forEach(s=>walk(s, 0, ""));
view.innerHTML = `<button class="back" onclick="showChat()">${icon("back")} 返回</button>
<div class="btnrow" style="margin-bottom:10px"><button class="btn" onclick="newSaveSlot()">＋ 新建存档</button></div>
<div class="hint">加载某个存档后, 新建的存档会从它分出一条分支, 形成故事树。</div>`
+ (rows ? `<div class="timeline">` + rows + `</div>` : `<div class="empty"><span class="big">${icon("save",44)}</span>还没有存档<br><span style="font-size:calc(12px * var(--fs))">在关键剧情点存个档，就能随时回到这条时间线，或从这里分出新的平行剧情</span></div>`)
+ `<div style="height:40px"></div>`;
window.scrollTo(0,0);
}
/* Tier2 #11: 本聊摘要框 (Janitor "Enter a summary for your chat. This will be included into the prompt as long-term memory.")。
 * 按聊天存, important 池最高优先级 (排在铁律之前), 1000 字。 */
window.chatsumCount = ()=>{
const ta = document.getElementById("chatsum_box"), c = document.getElementById("chatsum_cnt");
if(ta && c) c.textContent = ta.value.length + "/" + RP_MEM.CHATSUM_MAX;
};
window.saveChatSumUI = ()=>{
const ta = document.getElementById("chatsum_box");
if(!ta) return;
const r = RP_MEM.saveChatSummary(DETAIL.runId, DETAIL.name, ta.value);
chatsumCount();
alert(r.truncated ? "已保存（超 1000 字部分已截断）" : "本聊摘要已保存，每次对话会最先注入");
};
window.taCount = (taId, cntId, max)=>{
const ta = document.getElementById(taId), c = document.getElementById(cntId);
if(ta && c) c.textContent = ta.value.length + "/" + max;
};
window.ironlawCount = ()=>{
const ta = document.getElementById("ironlaw_box"), c = document.getElementById("ironlaw_cnt");
if(ta && c) c.textContent = ta.value.length + "/2000";
};
window.saveIronLawUI = ()=>{
const ta = document.getElementById("ironlaw_box");
const v = ta ? ta.value : "";
const card = RP.findCard(DETAIL.runId, DETAIL.name) || {};
const r = RP_MEM.saveIronLaw(DETAIL.runId, DETAIL.name, card.id || null, v);
ironlawCount();
alert(r.truncated ? "已保存（超 2000 字部分已截断）" : "铁律记忆已保存，对话时会永远最先注入");
};
/* Tier2 #15: 单聊选项 (concise 简洁回复开关), 按聊天存 */
const chatOptKey = (runId, name)=> `nd_chatopt_${runId}_${name}`;
const getChatOpt = (runId, name)=>{
try{ return Object.assign({concise:false}, JSON.parse(localStorage.getItem(chatOptKey(runId, name))||"{}")); }
catch(e){ return {concise:false}; }
};
const saveChatOpt = (runId, name, o)=>{
try{ localStorage.setItem(chatOptKey(runId, name), JSON.stringify(o||{})); }catch(e){}
};
window.saveConciseUI = ()=>{
const sw = document.getElementById("concise_sw");
if(!sw) return;
const o = getChatOpt(DETAIL.runId, DETAIL.name);
o.concise = !!sw.checked;
saveChatOpt(DETAIL.runId, DETAIL.name, o);
alert(sw.checked ? "简洁回复已开启" : "简洁回复已关闭");
};
/* Tier2 #9: 带复选框的确认弹窗 (C.AI "Copy facts and Story Memory to new chat" 风格)。
 * 返回 Promise: 勾选状态 true/false, 取消/点遮罩返回 null */
window.confirmCheck = (title, bodyHtml, checkLabel, okLabel)=>{
return new Promise((resolve)=>{
const ov = document.createElement("div");
ov.className = "cfcheck";
ov.innerHTML = `<div class="cfbox"><div class="cfttl">${esc(title)}</div><div class="cfbody">${bodyHtml}</div>`
+ `<label class="cfrow"><input type="checkbox" id="cfcheck_box" checked> ${esc(checkLabel)}</label>`
+ `<div class="cfbtns"><button class="btn ghost" id="cfcheck_cancel">取消</button>`
+ `<button class="btn" id="cfcheck_ok">${esc(okLabel||"确定")}</button></div></div>`;
document.body.appendChild(ov);
const done = (v)=>{ ov.remove(); resolve(v); };
ov.querySelector("#cfcheck_cancel").onclick = ()=>done(null);
ov.onclick = (e)=>{ if(e.target === ov) done(null); };
ov.querySelector("#cfcheck_ok").onclick = ()=>done(!!ov.querySelector("#cfcheck_box").checked);
});
};

/* S-11: 双复选框确认框 (开新聊天: 带走记忆 + 同时清除长期记忆) */
window.confirmCheck2 = (title, bodyHtml, labels, okLabel)=>{
return new Promise((resolve)=>{
const ov = document.createElement("div");
ov.className = "cfcheck";
ov.innerHTML = `<div class="cfbox"><div class="cfttl">${esc(title)}</div><div class="cfbody">${bodyHtml}</div>`
+ labels.map((l,i)=>`<label class="cfrow"><input type="checkbox" class="cfcheck2_box" data-i="${i}"${i===0?" checked":""}> ${esc(l)}</label>`).join("")
+ `<div class="cfbtns"><button class="btn ghost" id="cfcheck2_cancel">取消</button>`
+ `<button class="btn" id="cfcheck2_ok">${esc(okLabel||"确定")}</button></div></div>`;
document.body.appendChild(ov);
const done = (v)=>{ ov.remove(); resolve(v); };
ov.querySelector("#cfcheck2_cancel").onclick = ()=>done(null);
ov.onclick = (e)=>{ if(e.target === ov) done(null); };
ov.querySelector("#cfcheck2_ok").onclick = ()=>{
const boxes = ov.querySelectorAll(".cfcheck2_box");
done(Array.prototype.map.call(boxes, b=>!!b.checked));
};
});
};

/* P2-43：App 内统一弹窗组件。
 * 不用原生 alert()/confirm()/prompt()：系统弹窗样式不可控、和深墨鎏金语言割裂、
 * 在 Android WebView 里还会被系统主题染成浅色。这里复用已有的 .cfcheck/.cfbox
 * 遮罩弹窗（confirmCheck 同一套 DOM 与 CSS），只补三种调用形态。
 *   uiMessage(title, html)          -> Promise<void>          只读说明（长文自动滚动）
 *   uiConfirm(title, html, okLabel) -> Promise<boolean|null>  取消/遮罩/Esc = null
 *   uiPrompt(title, html, value, o) -> Promise<string|null>   取消 = null（空串是合法输入）
 * bodyHtml 走 HTML（要支持 <br> 与链接），调用方自己 esc。 */
function cfDialog(title, bodyHtml, footHtml, opts){
  opts = opts || {};
  /* 同一时刻只允许一个弹窗：并发调用（连点两个按钮、脚本批量触发）会把弹窗叠成三层，
     Esc 却只关最上面那层。屏幕上看到的是最新那个意图，所以先强制关掉旧的（按取消结算），
     再开新的 —— 保住最新意图，也保证 DOM 里永远只有一个 .cfcheck。 */
  const prev = document.querySelector(".cfcheck");
  if(prev && typeof prev.__forceClose === "function") prev.__forceClose();
  const ov = document.createElement("div");
  ov.className = "cfcheck";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.innerHTML = `<div class="cfbox"><div class="cfttl">${esc(title)}</div>`
    + `<div class="cfbody${opts.scroll ? " scroll" : ""}">${bodyHtml}</div>`
    + `<div class="cfbtns">${footHtml}</div></div>`;
  document.body.appendChild(ov);
  const done = (v)=>{
    if(ov.__closed) return;          /* 遮罩与 Esc 可能同时触发，只结算一次 */
    ov.__closed = true;
    ov.remove();
    try{ document.removeEventListener("keydown", onKey, true); }catch(e){}
    if(opts.onClose) opts.onClose(v);
  };
  ov.__forceClose = ()=>done();
  const onKey = (e)=>{ if(e.key === "Escape") done(); };
  try{ document.addEventListener("keydown", onKey, true); }catch(e){}
  ov.onclick = (e)=>{ if(e.target === ov) done(); };
  return { ov: ov, done: done };
}
window.uiMessage = (title, bodyHtml)=> new Promise((resolve)=>{
  const d = cfDialog(title, bodyHtml,
    `<button class="btn" id="cfmsg_ok">知道了</button>`,
    { scroll:true, onClose: ()=>resolve() });
  d.ov.querySelector("#cfmsg_ok").onclick = ()=>d.done();
});
window.uiConfirm = (title, bodyHtml, okLabel)=> new Promise((resolve)=>{
  const d = cfDialog(title, bodyHtml,
    `<button class="btn ghost" id="cfy_no">取消</button>`
    + `<button class="btn" id="cfy_yes">${esc(okLabel||"确定")}</button>`,
    /* 结算值一律走 done(v)：取消/Esc/遮罩/被后来的弹窗顶掉都是无参 done() → null，
       确认走 done(true)。不要在 onclick 里再补一次 resolve —— done() 内部的
       onClose 已经先结算，后面那次会被静默丢弃，确认键就变成了"取消"。 */
    { scroll:true, onClose: (v)=>resolve(v === undefined ? null : v) });
  d.ov.querySelector("#cfy_no").onclick = ()=>d.done();
  d.ov.querySelector("#cfy_yes").onclick = ()=>d.done(true);
});
window.uiPrompt = (title, bodyHtml, value, opts)=> new Promise((resolve)=>{
  opts = opts || {};
  const ph = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : "";
  const ml = !!opts.multiline;
  const d = cfDialog(title, bodyHtml
    + `<${ml ? "textarea" : "input"} class="cfinput" id="cfp_in"${ph}${ml ? ` rows="${opts.rows||5}"` : ""}>`
    + `${ml ? esc(value == null ? "" : String(value)) : ""}</${ml ? "textarea" : "input"}>`,
    `<button class="btn ghost" id="cfp_no">取消</button>`
    + `<button class="btn" id="cfp_yes">${esc(opts.okLabel||"确定")}</button>`,
    { scroll:true, onClose: (v)=>resolve(v === undefined ? null : v) });
  const inp = d.ov.querySelector("#cfp_in");
  if(!ml) inp.value = value == null ? "" : String(value);
  const ok = ()=>d.done(inp.value);      /* 空串是合法输入，照原样回传 */
  d.ov.querySelector("#cfp_no").onclick = ()=>d.done();
  d.ov.querySelector("#cfp_yes").onclick = ok;
  /* 单行输入走回车提交，多行输入留给换行 —— 和聊天输入框的直觉一致 */
  if(!ml) inp.addEventListener("keydown", (e)=>{ if(e.key === "Enter"){ e.preventDefault(); ok(); } });
  try{ inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }catch(e){}
});
/* Tier2 #9: 开新聊天 — 同一角色开新会话, 可选带走 Pin 与记忆。
 * 先自动备份当前聊天为存档, 再清空历史+记忆(可选恢复记忆快照), 空历史触发开场白。 */
window.newChatSameRole = async ()=>{
if(CHAT.mode !== "single") return;
/* S-11 (对标 Kindroid chat_break wipe_cascaded): 开新聊天可选同时清除长期记忆 */
const r = await confirmCheck2("开新聊天",
`和 <b>${esc(CHAT.name)}</b> 开启一段新的聊天？<br>当前聊天会自动备份为一条存档。`,
["带走 Pin 与记忆", "同时清除长期记忆"], "开新聊天");
if(r === null) return;
const ok = r[0], wipeMem = r[1];
const k = chatHistKey();
const def = new Date().toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
const ss = getSaves();
let _bkHist = null;
try{ _bkHist = getHist(k); }catch(e){ rpToast("聊天记录读取失败，备份已中止"); return; }
const slot = {id: Date.now(), name: "自动备份 " + def, ts: Date.now(),
parentId: getBranchSrc()[k] || null,
history: _bkHist,
mem: RP_MEM.get(CHAT.runId, CHAT.name),
plot: getPlot()};
ss.push(slot);
try{ localStorage.setItem(savesKey(), JSON.stringify(ss)); }
catch(e){ alert("自动备份失败，请先手动新建存档"); return; }
let memSnap = null;
if(ok && !wipeMem){
const st = RP_MEM.get(CHAT.runId, CHAT.name) || {};
memSnap = {pinned: ((st.short||[]).filter(m=>m&&m.pin)),
profile3: st.profile3, event3: st.event3, record3: st.record3, mood: st.mood, migrated3: st.migrated3};
}
saveHist(k, []);
RP_MEM.clear(CHAT.runId, CHAT.name);
if(ok && !wipeMem && memSnap){
const st2 = RP_MEM.get(CHAT.runId, CHAT.name) || {};
st2.short = (memSnap.pinned||[]).slice();
st2.profile3 = memSnap.profile3; st2.event3 = memSnap.event3; st2.record3 = memSnap.record3;
st2.mood = memSnap.mood; st2.migrated3 = memSnap.migrated3;
st2.up_to = 0; st2.up_to_msg_id = null; st2.watermark = null;
RP_MEM.save(CHAT.runId, CHAT.name, st2);
}
setBranchSrc(k, slot.id);
LAST_STATS = null;
showChat();
};

window.newSaveSlot = async ()=>{
const def = new Date().toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
const name = prompt("存档名称", "存档 " + def);
if(name === null) return;
/* Tier2 #9: 存档时可选是否带走 Pin 与记忆 (C.AI "Copy facts and Story Memory to new chat") */
const carry = CHAT.mode === "single" ? await confirmCheck("新建存档",
"是否把当前的记忆快照一起存入存档？<br>加载该存档时会恢复这些记忆。",
"带走 Pin 与记忆", "保存存档") : null;
if(CHAT.mode === "single" && carry === null) return;
const k = chatHistKey();
const ss = getSaves();
const id = Date.now();
let _svHist = null;
try{ _svHist = getHist(k); }catch(e){ rpToast("聊天记录读取失败，存档已中止"); return; }
const slot = {id: id, name: (name||"").trim() || ("存档"+(ss.length+1)), ts: Date.now(),
parentId: getBranchSrc()[k] || null, /* P1-5: 记录分支来源 */
history: _svHist,
mem: (CHAT.mode==="single" && carry) ? RP_MEM.get(CHAT.runId, CHAT.name) : null,
plot: getPlot()};
ss.push(slot);
try{ localStorage.setItem(savesKey(), JSON.stringify(ss)); }
catch(e){ alert("存档失败：存储空间不足，试试删除旧存档"); return; }
setBranchSrc(k, id); /* 新存档成为当前分支位置, 下次存档继续从这里分叉 */
achvUnlock("save_1");
if(slot.parentId) achvUnlock("branch_1");
renderSaves();
};
window.loadSaveSlot = (id)=>{
const s = getSaves().find(x=>x.id==id);
if(!s) return;
if(!confirm(`加载「${s.name}」？\n当前聊天记录会被替换。建议先新建存档备份当前进度。`)) return;
const k = chatHistKey();
saveHist(k, s.history || []);
if(CHAT.mode==="single" && s.mem) RP_MEM.save(CHAT.runId, CHAT.name, s.mem);
try{ savePlot(s.plot === undefined ? null : s.plot); }catch(e){}
LAST_STATS = null;
setBranchSrc(k, s.id); /* P1-5: 加载后, 后续存档从这里分叉 */
showChat();
};
/* ============ Tier3-21: 长按 Rewind 回溯分支（对标 Talkie Rewind）============
 * 回溯到第 idx 条消息：之后的消息移入一个新分支存档（复用平行存档/分支机制，
 * parentId 链向当前分支源），当前聊天只保留到 idx。
 * 双上限（抄 Talkie 文案，中文化）：单次最多 20 条；仅支持近 7 天消息。 */
const REWIND_MAX = 20, REWIND_DAYS = 7;
function rewindCheck(h, idx){
const tail = h.length - (idx + 1);
if(tail > REWIND_MAX) return {ok:false, code:"count", max:REWIND_MAX};
const m = h[idx];
const ts = m && m.ts;
if(ts && Date.now() - ts > REWIND_DAYS * 86400 * 1000)
return {ok:false, code:"age", days:REWIND_DAYS};
return {ok:true};
}
/* S-12 回溯点吸附 (对标 Kindroid rewind_messages): 单聊按"轮"回溯, 吸附到最近一条用户消息 */
function snapRewindIdx(h, idx){
let j = idx;
while(j > 0 && h[j] && h[j].role !== "user") j--;
return (h[j] && h[j].role === "user") ? j : idx;
}
window.rewindMsg = (idx)=>{
const k = chatHistKey();
let h = null;
try{ h = getHist(k); }catch(e){ rpToast("聊天记录读取失败"); return; }
const m = h[idx]; if(!m) return;
if(CHAT.mode === "single") idx = snapRewindIdx(h, idx);
const chk = rewindCheck(h, idx);
if(!chk.ok){
if(chk.code === "count")
alert("单次最多只能回溯 " + chk.max + " 条消息。\n请选择更靠后的消息再回溯。");
else
alert("目前仅支持回溯近 " + chk.days + " 天内的消息。");
return;
}
const tail = h.slice(idx + 1);
if(!tail.length){ alert("这条已经是最后一条消息，没有可回溯的内容。"); return; }
if(!confirm("回溯到这条消息？\n之后 " + tail.length + " 条消息将移入新分支，当前聊天只保留到这里。")) return;
const ss = getSaves();
const id = Date.now();
const nm = new Date().toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
const slot = {id: id, name: "回溯分支·" + nm, ts: Date.now(),
parentId: getBranchSrc()[k] || null, /* 复用平行存档分支机制：链向当前分支源 */
history: tail,
mem: CHAT.mode === "single" ? RP_MEM.get(CHAT.runId, CHAT.name) : null,
plot: getPlot()};
ss.push(slot);
try{ localStorage.setItem(savesKey(), JSON.stringify(ss)); }
catch(e){ alert("存档失败：存储空间不足，试试删除旧存档"); return; }
saveHist(k, h.slice(0, idx + 1));
setBranchSrc(k, id);
if(slot.parentId) achvUnlock("branch_1");
alert("已回溯：之后 " + tail.length + " 条消息已移入新分支「" + slot.name + "」，可在「平行存档」里查看或加载。");
try{ renderChat(); }catch(e){}
};
window.renameSaveSlot = (id)=>{
const ss = getSaves();
const s = ss.find(x=>x.id==id);
if(!s) return;
const name = prompt("存档名称", s.name||"");
if(name === null) return;
s.name = (name||"").trim() || s.name;
/* P2-14: 存档重命名写失败必须让用户知道，否则以为改了其实没改 */
try{ localStorage.setItem(savesKey(), JSON.stringify(ss)); }
catch(e){ rpToastOnce(isQuotaErr(e) ? "存储空间已满，存档名未保存" : "存档名保存失败"); return; }
renderSaves();
};
window.delSaveSlot = (id)=>{
const s = getSaves().find(x=>x.id==id);
if(!confirm(`删除存档「${s?s.name:""}」？`)) return;
try{ localStorage.setItem(savesKey(), JSON.stringify(getSaves().filter(x=>x.id!=id))); }
catch(e){ rpToastOnce(isQuotaErr(e) ? "存储空间已满，存档未删除" : "存档删除失败"); return; }
/* P1-5: 删掉的是当前分支源 -> 清掉, 避免新存档挂到悬空节点 */
const k = chatHistKey();
if(getBranchSrc()[k]==id){ const m = getBranchSrc(); delete m[k]; try{localStorage.setItem(BRANCH_KEY, JSON.stringify(m));}catch(e){} }
renderSaves();
};
/* ============ Persona: 全局用户人设 + 按聊天覆盖 ============ */
window.personaEditor = (scope, from)=>{
const isOverride = !!scope;
const p = (isOverride ? RP_PERSONA.getOverride(scope) : RP_PERSONA.getGlobal()) || {name:"", desc:"", extra:"", called:""};
__backAction = ()=>{ from==="settings" ? showSettings() : showChat(); };
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
titleEl.innerHTML = icon("user")+" 我的人设";
subEl.textContent = isOverride ? "仅本次聊天生效（覆盖全局人设）" : "全局生效：以后所有聊天都会告诉 AI 你是谁";
view.innerHTML = `<button class="back" onclick="__backAction()">${icon("back")} 返回</button>
<div class="field"><label>称呼 / 名字${RP_AIFILL.btn("p_name","玩家名字","2~4个字的名字或昵称","RP 应用的玩家人设")}</label>
<input id="p_name" placeholder="希望 AI 怎么称呼你" value="${esc(p.name||"")}" oninput="tokCount(['p_name','p_called','p_desc','p_extra'],'p_tok')"></div>
<div class="field"><label>TA 怎么称呼我${RP_AIFILL.btn("p_called","AI 对玩家的专属称呼","如：主人、小可爱、林先生，2~6个字","RP 应用的玩家人设")}</label>
<input id="p_called" placeholder="如：主人、小可爱、林先生（TA 对你的专属称呼）" value="${esc(p.called||"")}" oninput="tokCount(['p_name','p_called','p_desc','p_extra'],'p_tok')"></div>
<div class="field"><label>自我描述${RP_AIFILL.btn("p_desc","玩家自我描述","年龄、职业、性格、说话习惯，2~4句话，第一人称","RP 应用的玩家人设")}</label>
<textarea id="p_desc" rows="4" placeholder="年龄、职业、性格、说话习惯……" oninput="tokCount(['p_name','p_called','p_desc','p_extra'],'p_tok')">${esc(p.desc||"")}</textarea></div>
<div class="field"><label>补充说明（可选）${RP_AIFILL.btn("p_extra","玩家补充偏好","希望 AI 记住的偏好、和角色的关系设定，2~3句话","RP 应用的玩家人设")}</label>
<textarea id="p_extra" rows="3" placeholder="希望 AI 记住的偏好、你们的关系设定……" oninput="tokCount(['p_name','p_called','p_desc','p_extra'],'p_tok')">${esc(p.extra||"")}</textarea></div>
<div class="tokline" id="p_tok"></div>
<div class="btnrow"><button class="btn" onclick="savePersonaUI(${isOverride?`'${jq(scope)}`:"null"},'${jq(from)}')">保存</button>
<button class="btn ghost" onclick="importStPersona()">导入 ST 人设</button>
<button class="btn ghost" onclick="exportStPersonaUI()">导出 ST 人设</button>
${isOverride && RP_PERSONA.getOverride(scope) ? `<button class="btn ghost" onclick="RP_PERSONA.saveOverride('${jq(scope)}',null);__backAction()">清除本次覆盖</button>` : ""}
</div>
<div class="hint">保存后，人设会以【玩家人设】段注入每轮 prompt，紧跟在角色身份说明之后。</div>
<div style="height:40px"></div>`;
tokCount(['p_name','p_called','p_desc','p_extra'],'p_tok');
window.scrollTo(0,0);
};
window.savePersonaUI = (scope, from)=>{
const p = {name: document.getElementById("p_name").value.trim(),
           called: document.getElementById("p_called").value.trim(),
           desc: document.getElementById("p_desc").value.trim(),
           extra: document.getElementById("p_extra").value.trim()};
if(scope) RP_PERSONA.saveOverride(scope, p); else RP_PERSONA.saveGlobal(p);
__backAction();
};
/* ST 人设导入: 解析后填入表单(不自动保存), 点保存生效; 批量文件取第一个并提示 */
window.importStPersona = ()=>{
const inp = document.createElement("input");
inp.type = "file"; inp.accept = ".json,application/json";
inp.onchange = ()=>{
const f = inp.files[0]; if(!f) return;
const rd = new FileReader();
rd.onload = ()=>{
try{
const arr = RP_PERSONA.stPersonaParse(JSON.parse(rd.result));
const p0 = arr[0];
document.getElementById("p_name").value = p0.name;
document.getElementById("p_called").value = p0.called;
document.getElementById("p_desc").value = p0.desc;
document.getElementById("p_extra").value = p0.extra;
tokCount(["p_name","p_called","p_desc","p_extra"], "p_tok");
rpToast(arr.length > 1 ? `共 ${arr.length} 个人设，已填入「${p0.name}」，点保存生效` : `已填入人设「${p0.name}」，点保存生效`);
}catch(e){ alert("解析失败: " + e.message); }
};
rd.readAsText(f);
};
inp.click();
};
/* ST 人设导出: 读当前表单, {name, description, title, called, avatar} */
window.exportStPersonaUI = ()=>{
const g = (id)=>{ const el = document.getElementById(id); return el ? el.value.trim() : ""; };
const p = {name: g("p_name"), called: g("p_called"), desc: g("p_desc"), extra: g("p_extra")};
if(!p.name && !p.desc && !p.extra && !p.called){ rpToast("人设为空，先填写再导出"); return; }
downloadJson("persona_st.json", RP_PERSONA.stPersonaExport(p));
rpToast("已导出 ST 人设");
};
/* ============ 角色卡 PNG 导出 + 分享 ============ */
window.exportCard = async (id)=>{
const c = RP_WRITER.findCustom(id);
if(!c) return;
try{
const r = await RP_CARDEXPORT.exportAndShare(c);
if(r.shared){ alert("已调起系统分享"); return; }
__backAction = ()=>showWriter();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
titleEl.textContent = "角色卡 PNG"; subEl.textContent = c.name;
view.innerHTML = `<button class="back" onclick="showWriter()">${icon("back")} 返回</button>
<div class="card" style="text-align:center"><img src="${r.dataUrl}" style="max-width:100%;border-radius:8px" alt="角色卡"></div>
<div class="btnrow"><button class="btn" onclick="copyText(document.getElementById('cardjson').value);alert('卡片 JSON 已复制')">复制卡片 JSON</button></div>
<textarea id="cardjson" style="display:none">${esc(r.json)}</textarea>
<div class="hint">PNG 内已嵌入 Tavern v2 卡数据，可直接导入 SillyTavern。</div>
<div style="height:40px"></div>`;
window.scrollTo(0,0);
}catch(e){ alert("导出失败：" + (e && e.message || e)); }
};
