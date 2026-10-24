/* 浮生 · app 分段 13：剧情线（发送/重生成/改写、剧情大纲）
 * v41 从 app.js 原样迁出（原 app.js 第 3823–4336 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ============ 剧情线 ============ */
const plotKey = ()=> CHAT.mode==="group"
  ? `nd_plot_${CHAT.runId}_g_${(CHAT.members||[]).slice().sort().join("_")}`
  : `nd_plot_${CHAT.runId}_${CHAT.name}`;
const getPlot = ()=>{ try{ return JSON.parse(localStorage.getItem(plotKey()))||null; }catch(e){ return null; } };
const savePlot = (p)=>{ try{ localStorage.setItem(plotKey(), JSON.stringify(p||{})); }catch(e){ try{ rpToastOnce(isQuotaErr(e) ? "存储空间已满，剧情线未保存" : "剧情线保存失败"); }catch(_){} } };
/* 剧情线 v27: 原著剧情大纲(读者可编辑)。数据源自蒸馏管线(www/data/char_plots.js)。
   char_plots.js 按 runId 分层: CHAR_PLOTS[runId][角色名]。分层是必须的 —— 不同书里
   同名角色只按名字取会泄露别的书的剧情。旧版本 char_plots.js 是扁平的
   CHAR_PLOTS[角色名], 这里保留兜底以兼容旧数据。
   用户保存过则以用户版为准(含清空); 群聊拼接各成员大纲。 */
const bundledPlotFor = (runId, name)=>{
  const all = window.CHAR_PLOTS || {};
  const layer = all[runId];
  if(layer && layer[name]) return layer[name];
  return all[name] || "";
};
const bundledPlot = ()=>{
  const names = CHAT.mode==="group" ? (CHAT.members||[]) : [CHAT.name];
  const parts = [];
  for(const n of names||[]){ const o = bundledPlotFor(CHAT.runId, n); if(o) parts.push(o); }
  return parts.join("\n\n");
};
const activePlotOutline = ()=>{
  const p = getPlot();
  if(p && p.updatedAt) return p.outline || "";
  return bundledPlot();
};
let pickLock = false;
window.pickOption = async (idx, oi)=>{
  if(pickLock) return;
  const h = getHistSafe(chatHistKey());
  const m = h[idx]; if(!m || m.role!=="assistant") return;
  const oc = parseOptCard(m.content); if(!oc || !oc.options[oi]) return;
  pickLock = true;
  try{ if(typeof RP_WIRING!=="undefined" && RP_WIRING.noteOptionPick) RP_WIRING.noteOptionPick(oc.options, oi); }catch(e){}
  try{ await sendChatText(oc.options[oi]); }finally{ pickLock = false; }
};
/* 后悔药：仅当"决策→你的选择→AI回复"恰好是最后三条消息时可回退 */
function repickInfo(){
  try{
    if(!CHAT || !CHAT.travId || typeof RP_PLOTRUN==="undefined") return null;
    const h = getHistSafe(chatHistKey());
    if(h.length < 3) return null;
    const aiReply = h[h.length-1], userPick = h[h.length-2], decMsg = h[h.length-3];
    if(!aiReply || aiReply.role!=="assistant") return null;
    if(!userPick || userPick.role!=="user") return null;
    if(!decMsg || decMsg.role!=="assistant") return null;
    const oc = parseOptCard(decMsg.content); if(!oc) return null;
    const t = String(userPick.content||"").trim();
    if(!oc.options.some(o=>String(o).trim()===t)) return null;
    return { decIdx: h.length-3 };
  }catch(e){ return null; }
}
window.repickOption = ()=>{
  const info = repickInfo();
  if(!info){ rpToast("之后已有新的对话，无法回退到决策点"); return; }
  if(!confirm("回到决策点重新选择？你的选择和 AI 的回复会被删除，剧情回退一步。")) return;
  const k = chatHistKey();
  let h = null;
  try{ h = getHist(k); }catch(e){ rpToast("聊天记录读取失败"); return; }
  h.splice(h.length-2, 2); /* 删掉"你的选择 + AI回复" */
  saveHist(k, h);
  try{
    const ts = (typeof RP_TRAVERSE!=="undefined") ? RP_TRAVERSE.get(CHAT.travId) : null;
    if(ts && ts.plotrunId && typeof RP_PLOTRUN!=="undefined"){
      const st = RP_PLOTRUN.load(ts.plotrunId);
      if(st) RP_PLOTRUN.revertLast(st);
    }
  }catch(e){}
  renderChat(true);
  rpToast("已回到决策点，重新选吧");
};
window.swipeMsg = (idx, dir)=>{
const k = chatKey(CHAT.runId, CHAT.name);
let h = null;
try{ h = getHist(k); }catch(e){ rpToast("聊天记录读取失败"); return; }
if(RP.swipe(h[idx], dir)){ saveHist(k, h); renderChat(); achvUnlock("swipe_1"); }
};
window.regenMsg = async ()=>{
/* P2-2: 与在飞流互斥——流式中重生会并发改同一批消息 */
if(STREAMING || document.getElementById("live")){ rpToast("正在生成中，等这条回复完成再重生"); return; }
const cfg = getCfg();
const rcfg = getRpCfg();
const k = chatHistKey();
/* P0-3: 历史读失败则拒绝重生（不能拿空历史去覆盖） */
let h = null;
try{ h = getHist(k); }catch(e){ rpToast("聊天记录读取失败"); return; }
let rname = CHAT.name;
if(CHAT.mode==="group"){
for(let i=h.length-1;i>=0;i--){ if(h[i].role==="assistant"&&h[i].speaker){ rname = h[i].speaker; break; } }
STREAM_SPEAKER = rname;
}
setStreaming(true);
/* P0-4: 本轮独立 signal + 登记在飞代数/会话键 */
const __rsig = streamSignal();
__liveGen = __rsig.__gen; __liveKey = k;
try{
const r = await RP.regenerate(CHAT.runId, rname, {
cfg: cfg, history: h, temperature: rcfg.temperature,
optCards: !!rcfg.optCards, optCount: rcfg.optCount, optMood: rcfg.optMood,
plotOutline: activePlotOutline(), scenario: scenarioInstr(),
pov: CHAT.pov || "player", person: CHAT.person || "second",
budget: {maxContext: rcfg.maxContext, response: rcfg.respTokens, preset: rcfg.preset, stPreset: resolveStPreset()},
onToken: streamToken,
signal: __rsig,
onSystem: (preview, stats)=>{ LAST_SYSTEM = preview + "\n\n【预算】" + JSON.stringify(stats); LAST_STATS = stats; recordLastPrompt(stats); },
});
saveHist(k, r.history);
achvUnlock("swipe_1");
}catch(e){
/* P0-3: 失败只提示，不拿空历史覆盖 */
rpToast("重新生成失败：" + (e && e.message ? e.message : e));
}finally{
STREAM_SPEAKER = null;
setStreaming(false);
renderChat();
}
};;
/* 指定位置重生：对任意一条 AI 消息重试。做法是截掉该条及之后的历史，
 * 用它前面那条用户消息走正常发送管线重生成 —— 三模式（单聊/群聊/穿越）通用，
 * 顺带修了 regenMsg 在穿越模式下 CHAT.runId 为空的坏 key 问题。 */
window.regenMsgAt = async (idx)=>{
if(STREAMING || document.getElementById("live")){ rpToast("正在生成中，等这条回复完成再重生"); return; }
const k = chatHistKey();
/* P0-3: 历史读失败则拒绝（不能拿空历史去覆盖） */
let h = null;
try{ h = getHist(k); }catch(e){ rpToast("聊天记录读取失败"); return; }
const m = h[idx];
if(!m || m.role !== "assistant"){ rpToast("这条不是 AI 回复"); return; }
/* 找它前面最后一条用户消息 */
let uidx = -1;
for(let i = idx - 1; i >= 0; i--){ if(h[i].role === "user"){ uidx = i; break; } }
if(uidx < 0){ rpToast("找不到对应的用户消息"); return; }
/* 非末尾：会删掉后面的消息，先确认 */
const after = h.length - 1 - idx;
if(after > 0){
if(!confirm(`重生这条回复会删掉它后面的 ${after} 条消息，继续吗？`)) return;
}
const userText = h[uidx].content;
saveHist(k, h.slice(0, idx));
renderChat();
await sendChatText(userText);
};
/* P0-4: 每轮发送独立 AbortController + 代数。旧的单全局 aborter 会被新发送覆盖，
 * 导致上一轮流永远无法取消；代数用于 streamToken 校验"这条 token 属于当前在飞的轮次"。 */
let __genSeq = 0, __curGen = 0;
const __genAborters = {};
/* 当前是否在流式中（任一轮次在飞）。页面重建输入栏时用它决定是否锁定输入。 */
let STREAMING = false;
/* streamToken 校验用：在飞轮次的代数 + 会话键。切会话/新轮次后旧 token 直接丢弃，防串台。 */
let __liveGen = 0, __liveKey = "";
function streamSignal(){
  const id = ++__genSeq; __curGen = id;
  const c = new AbortController();
  __genAborters[id] = c;
  const sig = c.signal; sig.__gen = id;
  return sig;
}
function __abortGen(id){
  const c = __genAborters[id];
  if(c){ try{ c.abort(); }catch(e){} delete __genAborters[id]; }
}
/* 停止当前在飞的轮次（停止按钮 / 切页 / 切会话时调用） */
function abortStreaming(){ __abortGen(__curGen); }
/* M6: 改写（猫箱 rewrite）：AI 润色本条回复、原意不变，原回复进候选可 swipe 切回 */
/* P2-2: 改写自身的重入锁（与 STREAMING 一起构成互斥） */
let REWRITING = false;
window.rewriteMsg = async (idx)=>{
/* P2-2: 与在飞流互斥——流式中改写同一条消息会并发覆盖；改写自身也不允许重入 */
if(STREAMING || REWRITING || document.getElementById("live")){ rpToast("正在生成中，等这条回复完成再改写"); return; }
REWRITING = true;
try{
const k = chatHistKey();
let h = null;
try{ h = getHist(k); }catch(e){ rpToast("聊天记录读取失败"); return; }
const m = h[idx];
if(!m || m.role!=="assistant" || m.content.indexOf("⚠️")===0) return;
const cfg = getCfg();
if(!cfg.key){ alert("还没配大模型接口"); return; }
const el = document.getElementById("smsg-"+idx);
const bub = el ? el.querySelector(".bubble") : null;
if(bub) bub.innerHTML = `<span style="color:var(--ink-faint);font-size:calc(13px * var(--fs))">改写中…</span>`;
try{
const prompt = "你是角色扮演对话的文字润色助手。把下面这条 AI 回复改写得更生动自然、更有文采，"
+ "但严格保持原意：不增删剧情要点，不改变说话人口吻，不添加原文没有的对话或旁白。"
+ "只输出改写后的正文，不要解释，不要加引号：\n\n" + m.content;
const out = await RP_NET.complete({base:cfg.base, key:cfg.key, model:cfg.model},
[{role:"user", content:prompt}], 0.8);
if(out && out.trim()){
const orig = m.content;
m.content = out.trim();
m.candidates = m.candidates || [orig];
if(m.candidates.indexOf(m.content)<0) m.candidates.push(m.content);
m.ci = m.candidates.length-1;
saveHist(k, h);
}
}catch(e){}
renderChat();
}finally{
REWRITING = false;
}
};
/* 输入栏（含旁白按钮；群聊多发言身份选择） */
function chatbarInner(disabled){
if(disabled) return `<div class="cb-inputrow"><input id="chat_in" disabled placeholder="生成中…"><button class="stopbtn" onclick="stopGen()" title="停止">${icon("stop",16)}</button></div>`;
const ph = CHAT.mode==="group" ? "在群里说点什么…"
: CHAT.mode==="traverse" ? `以${esc(travPlayerName())}的身份行动…`
: `和${esc(CHAT.name||"TA")}说点什么`;
const spk = CHAT.mode==="group"
? `<label class="cb-tool"><span class="cb-ico">🗣️</span><select id="spksel" onchange="setAsSpeaker(this.value)" title="发言身份"><option value="">我</option>`
+ CHAT.members.map(n=>`<option value="${esc(n)}"${CHAT.asSpeaker===n?" selected":""}>${esc(n)}</option>`).join("") + `</select></label>` : "";
/* Tier3-22: 群聊输入区点头像 @ 指定角色（@ 后本轮点名该角色先回） */
const atb = CHAT.mode==="group"
? `<button id="atbtn" class="cb-tool" onclick="toggleAtMenu(event)" title="＠ 指定角色：本轮点名 TA 先回"><span class="cb-ico">＠</span><span class="cb-tx">点名</span></button>` : "";
return `<div class="cb-tools" data-xfade>`
+ `<button id="pushbtn" class="cb-tool${CHAT.pushStory?" on":""}" onclick="togglePushStory(event)" title="推剧情：基于当前剧情生成新的发展"><span class="cb-ico">${icon("clapperboard",15)}</span><span class="cb-tx">推剧情</span></button>`
+ `<button id="narrbtn" class="cb-tool${CHAT.narrMode?" on":""}" onclick="toggleNarr()" title="旁白模式：发送场景/动作描写"><span class="cb-ico">${icon("scroll",15)}</span><span class="cb-tx">旁白</span></button>`
+ `${atb}${spk}`
+ `<button class="cb-tool" onclick="RP_AIFILL.fillChat(this)" title="AI 帮我说一句（只填入，不发送）"><span class="cb-ico">${icon("sparkles",15)}</span><span class="cb-tx">帮我说</span></button>`
+ `<button class="cb-tool" onclick="wireDiceRoll()" title="掷骰：掷一个 1-100 填入输入框，附在行动后面一起发，让 AI 按点数判定成败"><span class="cb-ico">${icon("dice",15)}</span><span class="cb-tx">掷骰</span></button>`
+ `</div>`
+ `<div class="cb-inputrow"><input id="chat_in" placeholder="${CHAT.narrMode?"写场景/动作/心理描写…":ph}" onkeydown="if(event.key==='Enter')sendChat()">`
+ `<button class="cbsend" onclick="sendChat()" title="发送">发送</button></div>`;
}
/* 掷骰按钮：掷 1-100 填入输入框（末尾已有骰签则换新签），不直接发送 */
window.wireDiceRoll = ()=>{
  const inp = document.getElementById("chat_in"); if(!inp) return;
  let roll = null;
  try{ if(typeof RP_WIRING!=="undefined" && RP_WIRING.rollPercent) roll = RP_WIRING.rollPercent(); }catch(e){}
  if(roll==null) roll = 1 + Math.floor(Math.random()*100);
  const tag = "（掷骰：" + roll + "）";
  const v = inp.value || "";
  inp.value = /（掷骰：\d+）\s*$/.test(v) ? v.replace(/（掷骰：\d+）\s*$/, tag) : (v ? v + " " + tag : tag);
  inp.focus();
};
window.toggleAtMenu = (ev)=>{
if(ev && ev.stopPropagation) ev.stopPropagation();
let m = document.getElementById("atmenu");
if(m){ m.remove(); return; }
if(CHAT.mode!=="group" || !(CHAT.members||[]).length) return;
m = document.createElement("div"); m.id = "atmenu"; m.className = "atmenu";
m.innerHTML = `<div class="athint">＠ 谁先回？</div>` + CHAT.members.map(n=>{
return `<button onclick="atMention('${jq(n)}')"><div class="avatar sm">${esc(n[0])}</div><span>${esc(n)}</span></button>`;
}).join("");
const bar = document.querySelector(".chatbar");
(bar || document.body).appendChild(m);
};
window.atMention = (name)=>{
const inp = document.getElementById("chat_in");
if(inp){
inp.value = ((inp.value||"").replace(/\s+$/,"") + " @" + name + " ").replace(/^ /,"");
inp.focus();
}
const m = document.getElementById("atmenu"); if(m) m.remove();
};
/* Push Story: 一键推剧情 (Marinara Narrative Director 思路) */
/* 推剧情选项弹窗：替代原生 confirm。返回 "natural"/"event"，点遮罩取消返回 null。 */
function pushStoryChoice(){
  return new Promise((resolve)=>{
    const old = document.getElementById("pushmask");
    if(old) old.remove();
    const mask = document.createElement("div");
    mask.id = "pushmask"; mask.className = "pushmask";
    mask.innerHTML = `<div class="pushcard" onclick="event.stopPropagation()">`
      + `<div class="pt">推剧情</div>`
      + `<div class="pd">选一种方式，基于当前剧情生成新的发展</div>`
      + `<div class="pushrow">`
      + `<button class="pushbtn primary" id="pushNatural">顺推<span class="sub">沿当前剧情往前走</span></button>`
      + `<button class="pushbtn" id="pushEvent">转折<span class="sub">加一个意外转折</span></button>`
      + `</div></div>`;
    const done = (v)=>{ mask.remove(); resolve(v); };
    mask.onclick = ()=> done(null);
    document.body.appendChild(mask);
    document.getElementById("pushNatural").onclick = ()=> done("natural");
    document.getElementById("pushEvent").onclick = ()=> done("event");
  });
}
window.togglePushStory = async (ev)=>{
  if(ev && ev.stopPropagation) ev.stopPropagation();
  /* P0: key 必须和注入点一致。穿越模式走 sendTraverse(wsIdT="nd_travchat_"+travId)，
     CHAT.runId 为空时旧代码会武装到垃圾 key "nd_pushstory_"，穿越里点了等于没点。 */
  var chatId = (CHAT.mode === "traverse" && CHAT.travId) ? ("nd_travchat_" + CHAT.travId)
    : (typeof chatKey !== "undefined" && CHAT.runId) ? chatKey(CHAT.runId, CHAT.name) : "";
  // 已武装则解除
  if(typeof AGENT_PUSHSTORY !== "undefined" && AGENT_PUSHSTORY.isArmed(chatId)){
    AGENT_PUSHSTORY.disarm(chatId);
    CHAT.pushStory = false;
    var b0 = document.getElementById("pushbtn"); if(b0) b0.classList.remove("on");
    return;
  }
  // 选模式（App 内弹窗，不用原生 confirm）
  var mode = await pushStoryChoice();
  if(!mode) return; // 点遮罩取消
  await pushStoryAdvance(chatId, mode);
};
/* 推剧情新实现：不删历史、不重生。追加一条推进触发，AI 基于全部剧情生成新的发展。
   触发消息渲染为居中注记（pushNote），不污染对话气泡。 */
async function pushStoryAdvance(chatId, mode){
  if(typeof AGENT_PUSHSTORY !== "undefined") AGENT_PUSHSTORY.arm(chatId, mode);
  CHAT.pushStory = true;
  var b = document.getElementById("pushbtn"); if(b) b.classList.add("on");
  /* 触发文本：AI 侧看到完整指令 */
  var triggerText = mode === "event"
    ? "【系统】用户点击了推剧情（转折）。请根据以上全部剧情，写一段新的剧情发展：必须包含一个意外转折，且转折后局面实质改变。不要重写已有内容。"
    : "【系统】用户点击了推剧情（顺推）。请根据以上全部剧情，写一段新的剧情发展：让故事实质性往前走（人物做决定/冲突升级/新信息揭露/场景转换四选一）。不要重写已有内容。";
  try{
    await sendChatText(triggerText);
  }catch(e){}
  /* 把触发消息标记为居中注记并重渲染 */
  try{
    const k = chatHistKey();
    const h = getHist(k) || [];
    for(let i = h.length - 1; i >= 0; i--){
      if(h[i].role === "user" && h[i].content === triggerText){ h[i].pushNote = true; break; }
    }
    saveHist(k, h);
    renderChat(true);
  }catch(e){}
  /* 同步按钮状态：injectPrompt 是一次性的，生成走完即已消费 */
  try{
    if(typeof AGENT_PUSHSTORY !== "undefined" && !AGENT_PUSHSTORY.isArmed(chatId)){
      CHAT.pushStory = false;
      var b2 = document.getElementById("pushbtn"); if(b2) b2.classList.remove("on");
    }
  }catch(e2){}
}
window.toggleNarr = ()=>{
CHAT.narrMode = !CHAT.narrMode;
const b = document.getElementById("narrbtn");
if(b) b.classList.toggle("on", !!CHAT.narrMode);
const inp = document.getElementById("chat_in");
if(inp && !inp.disabled) inp.placeholder = CHAT.narrMode ? "📜 旁白：写场景/动作/心理描写…" : (CHAT.mode==="group" ? "在群里说点什么…" : `和${CHAT.name||"TA"}说点什么`);
};
window.setAsSpeaker = (v)=>{ CHAT.asSpeaker = v || null; };
function setStreaming(on){
STREAMING = !!on;
const bar = document.querySelector(".chatbar");
if(!bar) return;
bar.innerHTML = chatbarInner(STREAMING);
/* v42-10: 开始等回复 → 「X正在提笔…」；结束（完成/停止/出错都走 finally）→ 移除 */
if(STREAMING) showPenWait(); else hidePenWait();
}
/* 当前是否在流式生成中（供页面重建/测试查询） */
window.__isStreaming = ()=> STREAMING;
window.stopGen = ()=>{ abortStreaming(); };
const streamWho = ()=> STREAM_SPEAKER || CHAT.name || "TA";
/* v37 性能: 流式 token 合帧。
 * 原实现每个 token 都写 textContent 并读 scrollHeight（强制同步布局），500 token
 * 的回复 = 500 次 reflow，且 textContent += 会读回全文，累积成 O(n²)。
 * 现在：token 只累积到字符串，DOM 每帧（rAF）写一次，滚动判断也只在帧内做。 */
let __liveText = "", __liveRaf = 0;
function streamToken(tok){
/* P0-4: 只写"当前在飞轮次 + 当前会话"的 token。切会话/新轮次后旧流的 token 直接丢弃，防串台。 */
if(__liveGen !== __curGen || chatHistKey() !== __liveKey) return;
/* P2-2: 页面隐藏(切后台)时不往不可见 DOM 追加 token。流不中断，回前台后继续追加，
   完成时照常 saveHist + renderChat 落全文，不会写坏状态。 */
if(typeof document !== "undefined" && document.hidden){ return; }
let live = document.getElementById("live");
if(!live){
const log0 = $("#chatlog");
if(document.getElementById("typing")) document.getElementById("typing").remove();
if(log0) log0.insertAdjacentHTML("beforeend",
`<div class="msg"><div class="msgcol">${chatWhoHTML(streamWho())}<div class="bubble" id="live"></div></div></div>`); /* v42: 流式气泡也带头像名牌 */
live = document.getElementById("live");
__liveText = "";
}
__liveText += tok;
if(__liveRaf) return;   /* 本帧已排期，继续累积即可 */
const flush = ()=>{
__liveRaf = 0;
const el = document.getElementById("live");
const lg = $("#chatlog");
if(!el || !lg) return;
el.textContent = __liveText;
if(chatNearBottom()){ markProgScroll(); lg.scrollTop = lg.scrollHeight; }
};
if(typeof requestAnimationFrame === "function"){ __liveRaf = requestAnimationFrame(flush); }
else flush();
}
window.sendChat = ()=>{
const inp = $("#chat_in");
const text = inp.value.trim();
if(!text) return;
inp.value = "";
sendChatText(text);
};
window.sendChatText = async (text)=>{
text = String(text||"").trim();
if(!text) return;
const cfg = getCfg();
if(!cfg.key ||!cfg.base ||!cfg.model){ alert("先去「我的 · 设置」配好 API 地址/Key/模型"); return;}
const rcfg = getRpCfg();
const k = chatHistKey();
/* P0-3: 历史读失败则拒绝发送（不能拿空历史去覆盖） */
let h = null;
try{ h = getHist(k); }catch(e){ rpToast("聊天记录读取失败，发送已取消"); return; }
setStreaming(true);
/* P0-4: 本轮独立 signal + 登记在飞代数/会话键 */
const __sig = streamSignal();
__liveGen = __sig.__gen; __liveKey = k;
const t = $("#typing"); if(t) t.remove();
const isGroup = CHAT.mode==="group";
const isTrav = CHAT.mode==="traverse";
let speakers = [];
if(isGroup){
let lastSp = null;
for(let i=h.length-1;i>=0;i--){ if(h[i].role==="assistant"&&h[i].speaker){ lastSp = h[i].speaker; break; } }
const gkey = CHAT.members.slice().sort().join("_");
if(CHAT.forcedSpeaker){ speakers = [CHAT.forcedSpeaker]; }
else if(RP_GROUP.getOrder(CHAT.runId, gkey)==="list"){
  const nx = RP_GROUP.nextInList(CHAT.members, lastSp);
  speakers = nx ? [nx] : [];
}else{
  speakers = RP_GROUP.planSpeakers(text, CHAT.members,
    RP_GROUP.talkMapFor(CHAT.runId, CHAT.members), lastSp, {maxSpeakers: RP_GROUP.MAX_SPEAKERS});
}
CHAT.forcedSpeaker = null;
STREAM_SPEAKER = speakers[0] || null;
}
if(isTrav) STREAM_SPEAKER = "世界";
showPenWait(); /* v42-10: 发言者已定，刷新等待态名字 */
try{
/* Tier2 #15: 简洁回复开关 (Janitor "Snappier, more concise replies"): 单聊且打开时,
 * system 追加简洁指令, maxTokens 压到 300 以内, 透传 concise 到 prompt 构建 */
const conciseOn = CHAT.mode==="single" && getChatOpt(CHAT.runId, CHAT.name).concise;
const sendOpts = {
cfg: Object.assign({}, cfg, {maxContext: rcfg.maxContext, summaryModel: rcfg.summaryModel}),
history: h,
temperature: rcfg.temperature, topP: rcfg.topP,
maxTokens: conciseOn ? Math.min(rcfg.respTokens, 300) : rcfg.respTokens,
concise: conciseOn,
optCards: !!rcfg.optCards, optCount: rcfg.optCount, optMood: rcfg.optMood,
plotOutline: activePlotOutline(), scenario: scenarioInstr(), oocOn: rcfg.ooc,
sceneText: getSceneText(), /* S-7 高权重场景 */
chapterIdx: getChapterIdx(), /* 章节进度：角色知识截止 */
userMtype: CHAT.narrMode ? "narr" : (CHAT.asSpeaker ? "npc" : "player"),
userSpeaker: CHAT.asSpeaker || null,
pov: CHAT.pov || "player", person: CHAT.person || "second",
onUserMsg: ()=>{ renderChat(true); },
budget: {maxContext: rcfg.maxContext, response: rcfg.respTokens, preset: rcfg.preset, stPreset: resolveStPreset()},
signal: __sig, onToken: streamToken,
onSpeaker: (sp)=>{ STREAM_SPEAKER = sp; showPenWait(); /* v42-10: 群聊下一位提笔 */ },
onSpeakerDone: ()=>{ saveHist(k, h); renderChat(); },
onPush: ()=>{ saveHist(k, h); },
onSystem: (preview, stats)=>{ LAST_SYSTEM = preview + "\n\n【预算】" + JSON.stringify(stats); LAST_STATS = stats; recordLastPrompt(stats); },
/* PPA 二遍对齐: 档位/模型经由 opts.ppa 透传; onAligning 在气泡上提示"对齐中…" */
ppa: {mode: rcfg.ppaMode||"key", model: (rcfg.ppaModel||"").trim(), summaryModel: rcfg.summaryModel||""},
onAligning: (on, finalText)=>{
  const live = document.getElementById("live");
  if(on){ if(live && !document.getElementById("ppa-aligning")) live.insertAdjacentHTML("beforeend", `<span id="ppa-aligning" style="opacity:.55">（对齐中…）</span>`); }
  else { const a = document.getElementById("ppa-aligning"); if(a) a.remove(); if(live && finalText != null) live.textContent = finalText; }
},
};
/* 走原著线：当前节点是前台决策点时，强制开启剧情选项卡（3 选项点选） */
try{
  if(isTrav && CHAT && CHAT.travId && typeof RP_PLOTRUN!=="undefined"
    && RP_PLOTRUN.decisionNode(CHAT.travId)){
    sendOpts.optCards = true; sendOpts.optCount = 3;
  }
}catch(e){}
/* P1: 出戏值检测（穿越模式下每次玩家发言都算一次） */
if(isTrav) travOocCheck(CHAT.travId, text);
const r = isGroup
? await RP.sendGroup(CHAT.runId, CHAT.members, speakers, text, sendOpts)
: isTrav
? await RP.sendTraverse(CHAT.travId, text, {
  cfg: sendOpts.cfg, history: h, temperature: sendOpts.temperature,
  topP: sendOpts.topP, maxTokens: sendOpts.maxTokens, budget: sendOpts.budget,
  optCards: sendOpts.optCards, optCount: sendOpts.optCount, optMood: sendOpts.optMood,
  signal: sendOpts.signal, onToken: sendOpts.onToken, onPush: sendOpts.onPush,
  onUserMsg: sendOpts.onUserMsg, onSystem: sendOpts.onSystem,
  userMtype: CHAT.narrMode ? "narr" : "player",
  ppa: sendOpts.ppa, onAligning: sendOpts.onAligning,
  extraPrompt: travExtraPrompt(CHAT.travId, text)})
: await RP.send(CHAT.runId, CHAT.name, text, sendOpts);
saveHist(k, r.history);
/* 走原著线：本轮结束后推进剧情节点（幂等；发送失败/中断不推进） */
try{
  if(!r.aborted && !r.failed && CHAT && CHAT.travId && typeof RP_TRAVERSE!=="undefined"){
    const _ts2 = RP_TRAVERSE.get(CHAT.travId);
    if(_ts2 && _ts2.plotrunId && typeof RP_PLOTRUN!=="undefined"){
      const _st2 = RP_PLOTRUN.load(_ts2.plotrunId);
      if(_st2 && _st2.currentNodeId){
        const _wasFin = RP_PLOTRUN.isFinished(_st2);
        RP_PLOTRUN.completeNode(_st2, _st2.currentNodeId, text);
        if(!_wasFin && RP_PLOTRUN.isFinished(_st2)) achvUnlock("plotline_1");
      }
    }
  }
}catch(e){}
achvUnlock("first_chat");
try{ hbAfterSend(); }catch(e){} /* Tier3-25: 心跳轮次计数（仅前台，不阻塞） */
if(r.aborted){
/* P0-3: 读失败时只提示、不写回（不能拿空数组覆盖真实历史） */
let hh = null;
try{ hh = getHist(k); }catch(e2){ rpToast("聊天记录读取失败"); }
if(hh){ hh.push({role:"assistant", content:"（已停止生成）", ts:Date.now()}); saveHist(k, hh); }
}else if(getRpCfg().ttsAuto){
/* P1-1: 自动朗读 AI 回复 */
const li = r.history.length-1;
if(r.history[li] && r.history[li].role==="assistant"){ try{ ttsMsg(li); }catch(e){} }
}
}catch(e){
/* P0-3: 读失败时只提示、不写回 */
let hh = null;
try{ hh = getHist(k); }catch(e2){ rpToast("聊天记录读取失败"); }
if(hh){ hh.push({role:"assistant", speaker: (speakers[0]||null), content:`⚠️ 出错了：${e.message}`, ts:Date.now()}); saveHist(k, hh); }
else{ rpToast("发送失败："+e.message); }
}finally{
/* P0-3: 收尾必须执行——setStreaming(false) 进 finally，任何异常都不能让输入框永久锁死 */
STREAM_SPEAKER = null;
setStreaming(false);
renderChat();
}
};
/* 剧情线编辑器 v27: 原著剧情大纲, 读者可自行编辑 */
