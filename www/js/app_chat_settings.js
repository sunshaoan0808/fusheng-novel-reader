/* 浮生 · app 分段 18：浮生小助手、统一聊天设置面板、Prompt 诊断、角色召回通知、heartbeat
 * v41 从 app.js 原样迁出（原 app.js 第 6134–6645 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ===== 浮生小助手 UI (2026-10-07) ===== */
window.openAssistant = ()=>{
  if(document.getElementById("asst_win")) return;
  /* P0-3：抽屉原先只有自己一层，右侧 12px 亮缝直接露出底层页面，观感像错位。
     补一层遮罩压暗，抽屉才有"浮起来"的层次。 */
  var sc = document.createElement("div");
  sc.id = "asst_scrim";
  sc.onclick = function(){ closeAssistant(); };
  document.body.appendChild(sc);
  var w = document.createElement("div");
  w.id = "asst_win";
  w.setAttribute("role","dialog");
  w.setAttribute("aria-modal","true");
  w.setAttribute("aria-label","浮生小助手");
  w.innerHTML = `<div class="asst_head"><span>浮生小助手</span>
    <button class="btn ghost" style="padding:4px 10px" onclick="closeAssistant()"
      aria-label="关闭小助手">✕</button></div>
    <div class="asst_msgs" id="asst_msgs"></div>
    <div class="asst_chips" id="asst_chips"></div>
    <div class="asst_input">
      <input id="asst_in" placeholder="问我功能用法，或让我帮你创建东西…"
        onkeydown="if(event.key==='Enter')sendAssistant()">
      <button onclick="sendAssistant()">发送</button>
    </div>`;
  document.body.appendChild(w);
  renderAsstChips();
  asstSay("你好！我是浮生小助手。问我功能用法，或让我帮你创建角色/世界书。", false);
  setTimeout(function(){ var i = document.getElementById("asst_in"); if(i) i.focus(); }, 100);
};
window.closeAssistant = ()=>{
  var w = document.getElementById("asst_win"); if(w) w.remove();
  var s = document.getElementById("asst_scrim"); if(s) s.remove();
  var f = document.getElementById("asst_fab"); if(f){ f.style.pointerEvents = ""; }
};
/* Escape 关抽屉：guard 一下 document（部分内嵌环境/测试桩没有 addEventListener） */
try{
  if(document && typeof document.addEventListener === "function"){
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape" && document.getElementById("asst_win")) closeAssistant();
    });
  }
}catch(e){}
function renderAsstChips(){
  var c = document.getElementById("asst_chips"); if(!c) return;
  c.innerHTML = ASSISTANT.chips().map(function(ch){
    return `<button class="asst_chip" onclick="asstChip('${jq(ch.text)}')">${esc(ch.label)}</button>`;
  }).join("");
}
window.asstChip = (text)=>{
  var i = document.getElementById("asst_in"); if(i) i.value = text;
  sendAssistant();
};
function asstSay(text, isUser){
  var box = document.getElementById("asst_msgs"); if(!box) return;
  var d = document.createElement("div");
  d.className = "asst_msg " + (isUser ? "user" : "ai");
  d.textContent = text;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}
window.sendAssistant = async ()=>{
  var inp = document.getElementById("asst_in"); if(!inp) return;
  var text = inp.value.trim(); if(!text) return;
  inp.value = "";
  asstSay(text, true);
  asstSay("想一想…", false);
  var cfg = (typeof getCfg !== "undefined") ? getCfg() : {};
  try{
    var r = await ASSISTANT.chat(text, cfg,
      function(c, ms, t){ return RP_NET.complete(c, ms, t); });
    // 移除 "想一想"
    var box = document.getElementById("asst_msgs");
    if(box && box.lastChild) box.removeChild(box.lastChild);
    asstSay(r.text, false);
  }catch(e){
    var box2 = document.getElementById("asst_msgs");
    if(box2 && box2.lastChild) box2.removeChild(box2.lastChild);
    asstSay("出错了：" + e.message, false);
  }
};
/* ===== 统一聊天设置面板 (2026-10-07, 借鉴 Marinara Chat Settings) =====
 * 单聊天的所有主要配置一处搞定：Agent 开关、生成参数、世界状态 */
window.showChatSettings = ()=>{
  var runId = CHAT.runId, name = CHAT.name;
  var chatId = (typeof chatKey !== "undefined") ? chatKey(runId, name) : (runId + "|" + name);
  var v = document.getElementById("view");

  // Agent 开关状态
  var lkOn = (typeof AGENT_LOREKEEPER !== "undefined") ? AGENT_LOREKEEPER.isEnabled() : true;
  var ctOn = (typeof AGENT_CONTINUITY !== "undefined") ? AGENT_CONTINUITY.isEnabled() : true;
  var ceOff = false;
  try{ ceOff = localStorage.getItem("nd_cardevo_off") === "1"; }catch(e){}
  var rdOff = false;
  try{ rdOff = localStorage.getItem("nd_reldyn_off") === "1"; }catch(e){}
  var pushMode = (typeof AGENT_PUSHSTORY !== "undefined") ? AGENT_PUSHSTORY.getMode(chatId) : null;

  // 生成参数 (per-chat)
  var tp = "", mt = "";
  try{
    tp = localStorage.getItem("nd_temp_" + chatId) || "";
    mt = localStorage.getItem("nd_maxtok_" + chatId) || "";
  }catch(e){}

  // 世界状态
  var wsHtml = "";
  try{
    if(typeof RP_WORLDSIM !== "undefined" && RP_WORLDSIM.enabled()){
      var st = RP_WORLDSIM.ensure(chatId, {novel: (((window.__DATA__||{}).runs||{})[runId]||{}).novel});
      var p = RP_WORLDSIM.curPlace(st);
      wsHtml = `<div class="card" style="margin-bottom:8px"><div style="font-weight:600;font-size:calc(13px * var(--fs));margin-bottom:8px">🌍 世界状态</div>
        <div style="font-size:calc(13px * var(--fs));margin-bottom:4px">时间：${esc(RP_WORLDSIM.fmtTime(st))}</div>
        <div style="font-size:calc(13px * var(--fs));margin-bottom:4px">天气：${esc(RP_WORLDSIM.weatherName(st.wx))} · 地点：${esc(p.name)}</div>
        ${(st.present && st.present.length) ? `<div style="font-size:calc(13px * var(--fs));margin-bottom:4px">在场：${esc(st.present.join("、"))}</div>` : ""}
        <div class="btnrow" style="margin-top:8px">
          <button class="btn" style="font-size:calc(12px * var(--fs))" onclick="wsAdjustTimePrompt()">⏰ 调时间</button>
          <button class="btn" style="font-size:calc(12px * var(--fs))" onclick="wsSetPlacePrompt()">📍 换地点</button>
        </div></div>`;
    }
  }catch(e){}

  var html = `<h2 class="sec">🎛️ 聊天设置</h2>
    <div style="font-size:calc(12px * var(--fs));color:var(--ink-faint);margin-bottom:12px">本次聊天的专属配置，不影响其他聊天</div>

    <div class="card" style="margin-bottom:8px"><div style="font-weight:600;font-size:calc(13px * var(--fs));margin-bottom:8px">🤖 AI 助手</div>
      ${asstToggle("📚 Lorebook Keeper", "聊天自动提炼世界书", lkOn, "toggleLK")}
      ${asstToggle("🔍 Continuity Checker", "检查逻辑矛盾", ctOn, "toggleCT")}
      ${asstToggle("📝 角色卡审计", "建议角色成长更新", !ceOff, "toggleCE")}
      ${asstToggle("🔗 关系动态", "聊天中关系演变", !rdOff, "toggleRD")}
      ${typeof RP_SOUL_ORCH!=="undefined" ? asstToggle("👥 Soul 多智能体", "多角色并行独立回应", (function(){ try{ return localStorage.getItem("nd_soulmode_off_"+soulChatId())!=="1"; }catch(e){ return true; } })(), "toggleSoulMode") : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
        <div><div style="font-size:calc(13px * var(--fs))">🚀 Push Story</div>
        <div style="font-size:calc(11px * var(--fs));color:var(--ink-faint)">${pushMode ? "已武装（" + (pushMode === "natural" ? "顺推" : "意外") + "），下条回复生效" : "一键推进剧情"}</div></div>
        <button class="btn" style="font-size:calc(12px * var(--fs));padding:4px 10px" onclick="togglePushStory(event);showChatSettings();">${pushMode ? "解除" : "武装"}</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:8px"><div style="font-weight:600;font-size:calc(13px * var(--fs));margin-bottom:8px">🎚️ 生成参数（本次聊天）</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <span style="font-size:calc(13px * var(--fs))">温度</span>
        <input id="cs_temp" type="number" step="0.1" min="0" max="2" value="${esc(tp)}" placeholder="默认"
          style="width:80px;padding:6px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:inherit">
        <span style="font-size:calc(13px * var(--fs))">最大token</span>
        <input id="cs_maxtok" type="number" step="100" min="100" value="${esc(mt)}" placeholder="默认"
          style="width:90px;padding:6px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:inherit">
        <button class="btn" style="font-size:calc(12px * var(--fs))" onclick="saveChatParams()">保存</button>
      </div>
      <div style="font-size:calc(11px * var(--fs));color:var(--ink-faint)">留空用全局设置。温度越高越发散，0-2。</div>
    </div>

    ${typeof RP_SOUL_CFG!=="undefined" ? `<div class="card" style="margin-bottom:8px"><div style="font-weight:600;font-size:calc(13px * var(--fs));margin-bottom:8px">🔌 Soul 模型（本次聊天覆盖）</div>
      <div style="font-size:calc(12px * var(--fs));color:var(--ink-faint);margin-bottom:6px">覆盖角色卡上的绑定，仅本次聊天有效</div>
      <div style="display:flex;gap:8px;align-items:center">
        <select id="cs_soul_profile" class="soulctl" style="flex:1;padding:6px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:inherit">
          <option value="">不覆盖（用角色绑定）</option>
          ${RP_SOUL_CFG.list().map(p=>`<option value="${esc(p.name)}" ${RP_SOUL_CFG.getChatOverride(chatId)===p.name?"selected":""}>${esc(p.name)} · ${esc(p.model||"")}</option>`).join("")}
        </select>
        <button class="btn soulctl" onclick="saveChatSoulProfile()">保存</button>
      </div></div>` : ""}

    ${wsHtml}

    ${typeof RP_SOUL_CFG!=="undefined" ? `<div id="soul_debug_wrap" style="margin-bottom:8px">${RP_SOUL_CFG.debugHTML()}</div>` : ""}
    ${typeof RP_SOUL_CFG!=="undefined" ? `<div id="soul_perf_wrap" style="margin-bottom:8px">${RP_SOUL_CFG.perfHTML()}${RP_SOUL_CFG.costHTML()}</div>` : ""}
    ${typeof RP_SOUL_CFG!=="undefined" ? `<div style="margin-bottom:8px">${RP_SOUL_CFG.fallbackHTML()}${RP_SOUL_CFG.promptPreviewHTML()}</div>` : ""}

    <div class="card" style="margin-bottom:8px"><div style="font-weight:600;font-size:calc(13px * var(--fs));margin-bottom:8px">🔗 快捷入口</div>
      <div class="btnrow">
        <button class="btn" style="font-size:calc(12px * var(--fs))" onclick="showRelManager()">关系管理</button>
        <button class="btn" style="font-size:calc(12px * var(--fs))" onclick="showCardEvo()">卡更新建议</button>
        <button class="btn" style="font-size:calc(12px * var(--fs))" onclick="loreEditor('${jq(CHAT.runId)}','chat')">世界书</button>
      </div>
    </div>

    <button class="btn" onclick="showChat()">返回聊天</button>`;
  v.innerHTML = html;
};
function asstToggle(name, desc, on, fn){
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
    <div><div style="font-size:calc(13px * var(--fs))">${name}</div>
    <div style="font-size:calc(11px * var(--fs));color:var(--ink-faint)">${desc}</div></div>
    <button class="btn${on ? " primary" : ""}" style="font-size:calc(12px * var(--fs));padding:4px 14px" onclick="${fn}();showChatSettings();">${on ? "开" : "关"}</button>
  </div>`;
}
window.toggleLK = ()=>{ AGENT_LOREKEEPER.setEnabled(!AGENT_LOREKEEPER.isEnabled()); };
window.toggleCT = ()=>{ AGENT_CONTINUITY.setEnabled(!AGENT_CONTINUITY.isEnabled()); };
window.toggleCE = ()=>{ AGENT_CARDEVO.setEnabled(localStorage.getItem("nd_cardevo_off") === "1"); };
window.toggleRD = ()=>{ AGENT_RELATIONS.setEnabled(localStorage.getItem("nd_reldyn_off") === "1"); };
/* Soul 开关的 chatId 必须与 chat.js sendGroup 里门禁用的 _sChatId 一致:
 * chatKey(runId, members.join(",")), 而不是 chatKey(runId, CHAT.name)
 * (群聊时 CHAT.name 为 null, 曾导致开关写错 key, 门禁永远读不到)。
 * 2026-10-13 修。 */
function soulChatId(){
  var nm = (CHAT.mode === "group" && CHAT.members && CHAT.members.length) ? CHAT.members.join(",") : CHAT.name;
  return (typeof chatKey !== "undefined") ? chatKey(CHAT.runId, nm) : (CHAT.runId + "|" + nm);
}
window.toggleSoulMode = ()=>{
  var chatId = soulChatId();
  try{
    var wasOff = localStorage.getItem("nd_soulmode_off_" + chatId) === "1";
    if(typeof RP_SOUL_ORCH !== "undefined") RP_SOUL_ORCH.setSoulMode(chatId, wasOff);
    if(wasOff && typeof RP_SOUL_CFG !== "undefined") RP_SOUL_CFG.maybeShowGuide(chatId);
  }catch(e){}
};
window.saveChatParams = ()=>{
  var chatId = soulChatId();
  var tp = document.getElementById("cs_temp").value, mt = document.getElementById("cs_maxtok").value;
  try{
    if(tp) localStorage.setItem("nd_temp_" + chatId, tp); else localStorage.removeItem("nd_temp_" + chatId);
    if(mt) localStorage.setItem("nd_maxtok_" + chatId, mt); else localStorage.removeItem("nd_maxtok_" + chatId);
  }catch(e){}
  alert("已保存");
};
window.saveChatSoulProfile = ()=>{
  var chatId = soulChatId();
  var v = document.getElementById("cs_soul_profile").value;
  try{
    if(typeof RP_SOUL_CFG !== "undefined") RP_SOUL_CFG.setChatOverride(chatId, v);
  }catch(e){}
  alert(v ? "已覆盖为「" + v + "」" : "已清除覆盖");
};
window.wsAdjustTimePrompt = ()=>{
  var m = prompt("推进多少分钟？（如 30）", "30");
  if(!m) return;
  var chatId = (typeof chatKey !== "undefined") ? chatKey(CHAT.runId, CHAT.name) : (CHAT.runId + "|" + CHAT.name);
  try{ RP_WORLDSIM.adjustTime(chatId, parseInt(m) || 0, {}); }catch(e){}
  showChatSettings();
};
window.wsSetPlacePrompt = ()=>{
  var p = prompt("去哪里？", "");
  if(!p) return;
  var chatId = (typeof chatKey !== "undefined") ? chatKey(CHAT.runId, CHAT.name) : (CHAT.runId + "|" + CHAT.name);
  try{ RP_WORLDSIM.moveTo(chatId, p, {}); }catch(e){}
  showChatSettings();
};
window.showSystem = ()=>{
if(!LAST_SYSTEM){ alert("先发一句话，引擎组装好人设 prompt 后这里才能预览。"); return; }
__backAction = ()=>showChat();
titleEl.textContent = "人设 prompt 预览"; subEl.textContent = CHAT.name||"";
view.innerHTML = `<button class="back" onclick="showChat()">${icon("back")} 返回聊天</button>
<pre style="white-space:pre-wrap;font-size:calc(13px * var(--fs));background:#fff;border:1px solid #e5e0d8;border-radius:10px;padding:12px">${esc(LAST_SYSTEM)}</pre>`;
window.scrollTo(0,0);
};

/* ============ P0-5 Prompt 诊断 (简洁版: 分段条 + 列表, 非极客面板) ============ */
function recordLastPrompt(stats){
window.__LAST_PROMPT__ = {stats: stats || null,
hasWorldsim: !!(stats && stats.hasWorldsim), hasDirector: !!(stats && stats.hasDirector),
memPools: (stats && stats.memPools) || null};
}
const DIAG_SEG_LABELS = {identity:"身份", persona:"玩家人设", narrator:"叙事者模式", core:"核心人设",
memory:"长期记忆", speech:"说话方式", appearance:"外貌与举止", examples:"对话示例", background:"背景", relations:"人物关系", lore:"世界书"};
const DIAG_POOL_LABELS = {important:"重要池（铁律/置顶/画像库/心境）", recent:"近期池（事件库）", similar:"长远池（记录库/往事）"};
/* 人设保真行 (Persistent Personas? 方法论落地): 只展示机制状态, 不编造偏离度分数。
 * 铁律/弧光 = 本轮 prompt 是否真实注入了对应段; 末尾纠偏恒为 ✓ (prompt 末位 system 必有);
 * 二遍对齐 = 上次对齐距今轮数与是否改动 (localStorage 记录, 如实呈现)。 */
const ppaFidelityText = ()=>{
try{
let key = null;
if(CHAT.mode === "group") key = groupKey(CHAT.runId, CHAT.members||[]);
else if(CHAT.mode === "traverse") key = "nd_travchat_" + CHAT.travId;
else key = chatKey(CHAT.runId, CHAT.name);
const raw = (typeof RP_PPA !== "undefined") ? RP_PPA.lastAlign(key) : null;
if(!raw) return "未运行";
const cur = getHistSafe(chatHistKey()).length;
const n = Math.max(0, cur - (raw.len||0));
return (n === 0 ? "本轮" : n + " 轮前") + (raw.changed ? " · 已修正" : " · 无修改");
}catch(e){ return "未运行"; }
};
window.promptDiag = ()=>{
const lp = window.__LAST_PROMPT__;
if(!lp || !lp.stats){ alert("先发一句话，引擎组装好 prompt 后这里才能诊断。"); return; }
const s = lp.stats;
const sysPct = Math.min(100, (s.sysTokens || 0) / Math.max(1, s.avail || 1) * 100);
const histPct = Math.min(100, (s.histTokens || 0) / Math.max(1, s.avail || 1) * 100);
const segRows = Object.keys(s.segTokens || {}).map(k=>
`<div class="storow"><span>${DIAG_SEG_LABELS[k] || k}</span><span>${s.segTokens[k]} tok</span></div>`).join("");
const poolRows = Object.keys(lp.memPools || {}).filter(k=>k in DIAG_POOL_LABELS).map(k=>{
const p = lp.memPools[k];
return `<div class="storow"><span>${DIAG_POOL_LABELS[k] || k}</span><span>${p.tokens} tok · ${p.items} 条${p.dropped ? ` · 丢弃 ${p.dropped}` : ""}${p.source ? ` · ${p.source}` : ""}${p.adjudicated ? ` · 冲突已消解${p.adjudReason ? "(" + esc(p.adjudReason) + ")" : ""}` : ""}</span></div>`;
}).join("");
const dropped = (s.droppedSegs || []).map(k=>DIAG_SEG_LABELS[k] || k).join("、");
/* v41: LAST_SYSTEM 是顶层 let，不在 window 上；以前读 window.LAST_SYSTEM 恒为空，铁律/弧光注入恒显示「未注入」 */
const sysPreview = String((typeof LAST_SYSTEM !== "undefined" && LAST_SYSTEM) || "");
const fidelityRows =
`<div class="storow"><span>铁律注入</span><span>${sysPreview.indexOf("【铁律记忆】")>=0?"✓ 已注入":"✗ 未注入"}</span></div>`+
`<div class="storow"><span>人物弧光注入</span><span>${sysPreview.indexOf("【人物弧光】")>=0?"✓ 已注入":"✗ 未注入"}</span></div>`+
`<div class="storow"><span>末尾纠偏指令</span><span>✓ 常驻</span></div>`+
`<div class="storow"><span>二遍对齐 PPA</span><span>${ppaFidelityText()}</span></div>`;
__backAction = ()=>showChat();
titleEl.innerHTML = icon("chart") + " Prompt 诊断"; subEl.textContent = CHAT.name || "";
view.innerHTML = `<button class="back" onclick="showChat()">${icon("back")} 返回聊天</button>
<div class="card"><div class="name" style="font-size:calc(14px * var(--fs))">预设：${esc(s.preset || "")}</div>
<div class="meta">上下文 ${s.maxCtx ?? "—"} · 可用预算 ${s.avail ?? "—"} tokens</div>
<div class="storbar"><div class="storbar-fg" style="width:${sysPct.toFixed(1)}%"></div></div>
<div class="storow"><span>系统段（含人设/记忆/世界书）</span><span>${s.sysTokens} tok</span></div>
<div class="storow"><span>聊天历史（保留 ${s.histKept ?? "—"} 条）</span><span>${s.histTokens ?? "—"} tok${s.histDropped ? ` · 丢弃最早 ${s.histDropped} 条` : ""}</span></div></div>
<div class="card"><div class="name" style="font-size:calc(14px * var(--fs))">各段 token</div>${segRows || '<div class="empty">无</div>'}</div>
<div class="card"><div class="name" style="font-size:calc(14px * var(--fs))">记忆三池</div>${poolRows || '<div class="empty">本轮未注入记忆</div>'}
<div class="storow"><span>世界模拟注入</span><span>${lp.hasWorldsim ? "有" : "无"}</span></div>
<div class="storow"><span>导演指令注入</span><span>${lp.hasDirector ? "有" : "无"}</span></div></div>
<div class="card"><div class="name" style="font-size:calc(14px * var(--fs))">人设保真</div>${fidelityRows}</div>
<div class="card"><div class="name" style="font-size:calc(14px * var(--fs))">丢弃情况</div>
<div class="kv">${dropped ? "整段丢弃：" + esc(dropped) : "无整段丢弃"}</div>
${(s.loreHits && s.loreHits.length) ? `<div class="kv" style="margin-top:6px">世界书命中：${s.loreHits.map(esc).join("、")}</div>` : ""}</div>
<div style="height:40px"></div>`;
window.scrollTo(0,0);
};

/* ============ Tier3-24: 角色召回本地通知（对标 Talkie 角色口吻推送）============
 * 只做本地通知，不做推送。触发时机保守：App 从后台回到前台（原生 onResume 回调
 * __onAppResumed，或冷启动）且距上次聊天超过 X 小时，发一条本地通知。
 * 真发动作走原生 JsBridge.notifyLocal；浏览器预览时无桥接，不真发。 */
const NOTIFY_KEY = "nd_notify_cfg";
const getNotifyCfg = ()=> Object.assign(
{on:false, hours:6, template:"{{npc_name}}：你回来了，{{username}}！", lastFired:0},
JSON.parse(localStorage.getItem(NOTIFY_KEY)||"{}"));
/* P2-14: 写入失败不能让"保存设置"流程抛异常跑到一半（配额满很常见） */
const saveNotifyCfg = (c)=>{ try{ localStorage.setItem(NOTIFY_KEY, JSON.stringify(c)); }
catch(e){ rpToastOnce(isQuotaErr(e) ? "存储空间已满，通知设置未保存" : "通知设置保存失败"); } };
/* 模板渲染：{{npc_name}} / {{username}}（参考 Talkie：{{npc_name}}: You're back, {{username}}!） */
function renderNotifyText(tpl, npcName, username){
return String(tpl||"")
.replace(/\{\{\s*npc_name\s*\}\}/g, String(npcName||"TA"))
.replace(/\{\{\s*username\s*\}\}/g, String(username||""));
}
/* 最近一次聊天活动：优先读轻量索引（v37），索引缺失/失效时才全量扫描。
 * 旧实现每次 onResume 都遍历全部 localStorage 键并 JSON.parse 每段聊天历史，
 * 多条长聊天时冷启动会多花数百毫秒主线程时间。 */
const LASTCHAT_IDX_KEY = "nd_lastchat_idx";
function histFp(raw){ raw = String(raw == null ? "" : raw); return raw.length + ":" + raw.slice(-24); }
function lastChatInfo(){
/* 快路径：索引由 saveHist 维护，不需要解析任何聊天历史。
 * 历史可能被整体替换（导入/存档恢复/清空），所以用"长度+尾部"指纹校验，
 * 失配就回退全量扫描并重写索引（自愈）。 */
try{
const idx = JSON.parse(localStorage.getItem(LASTCHAT_IDX_KEY) || "null");
if(idx && idx.key && typeof idx.ts === "number"){
const raw = localStorage.getItem(idx.key);
if(raw != null && idx.fp === histFp(raw)){
return {key:idx.key, ts:idx.ts, name:idx.name||"", group:!!idx.group};
}
}
}catch(e){}
let best = null;
const n = localStorage.length;
for(let i=0;i<n;i++){
const k = localStorage.key(i);
if(!k) continue;
let m = k.match(/^nd_chat_([^_]+)_(.+)$/) || k.match(/^nd_group_([^_]+)_(.+)$/);
if(!m) continue;
let h = null;
try{ h = JSON.parse(localStorage.getItem(k)||"[]"); }catch(e){}
if(!Array.isArray(h) || !h.length) continue;
const last = h[h.length-1];
const ts = (last && last.ts) || 0;
if(!ts || (best && ts <= best.ts)) continue;
const isGroup = k.indexOf("nd_group_")===0;
best = {key:k, ts:ts, name: isGroup ? (last.speaker || m[2].split("_")[0]) : m[2], group:isGroup};
}
/* 扫描结果回写索引，下一次走快路径 */
if(best){ try{ best.fp = histFp(localStorage.getItem(best.key)); localStorage.setItem(LASTCHAT_IDX_KEY, JSON.stringify(best)); }catch(e){} }
return best;
}
/* saveHist 写历史时同步维护索引（O(1)，不解析全量历史）。
 * 单独成函数：tests/test_gethist_fallback.js 按源码段抽取 saveHist 执行，
 * 用 typeof 守卫保证抽取环境下不报错。 */
function lastChatIndexUpdate(k, h, rawStr){
try{
if(!k || (k.indexOf("nd_chat_") !== 0 && k.indexOf("nd_group_") !== 0)) return;
const last = h && h.length ? h[h.length-1] : null;
const ts = (last && last.ts) || 0;
if(!ts){
/* 历史被清空：若索引指向本条，删掉索引，避免召回通知用到空会话 */
let cur = null;
try{ cur = JSON.parse(localStorage.getItem(LASTCHAT_IDX_KEY)||"null"); }catch(e){}
if(cur && cur.key === k) localStorage.removeItem(LASTCHAT_IDX_KEY);
return;
}
let cur = null;
try{ cur = JSON.parse(localStorage.getItem(LASTCHAT_IDX_KEY)||"null"); }catch(e){}
if(cur && cur.key !== k && (cur.ts||0) >= ts) return; /* 别的会话更新，不覆盖 */
const m = k.match(/^nd_chat_([^_]+)_(.+)$/) || k.match(/^nd_group_([^_]+)_(.+)$/);
const isGroup = k.indexOf("nd_group_") === 0;
const name = isGroup ? ((last && last.speaker) || (m ? m[2].split("_")[0] : "群聊")) : (m ? m[2] : "");
localStorage.setItem(LASTCHAT_IDX_KEY, JSON.stringify({key:k, ts:ts, name:name, group:isGroup, fp:histFp(rawStr != null ? rawStr : JSON.stringify(h))}));
}catch(e){}
}
function usernameOf(){
try{
const p = (typeof RP_PERSONA!=="undefined") ? RP_PERSONA.getGlobal() : null;
return (p && p.name) || "";
}catch(e){ return ""; }
}
window.maybeRecallNotify = ()=>{
try{
const cfg = getNotifyCfg();
if(!cfg.on) return false;
const bridge = (typeof window!=="undefined") ? window.Android : null;
if(!bridge || typeof bridge.notifyLocal!=="function") return false; /* 浏览器预览不真发 */
const last = lastChatInfo();
if(!last) return false;
const now = Date.now(), gap = Math.max(1, cfg.hours||6) * 3600 * 1000;
if(now - last.ts < gap) return false;
if(now - (cfg.lastFired||0) < gap) return false; /* 同一窗口只发一次 */
const text = renderNotifyText(cfg.template, last.name, usernameOf());
bridge.notifyLocal(String(last.name||"TA"), text);
cfg.lastFired = now; saveNotifyCfg(cfg);
return true;
}catch(e){ return false; }
};
/* 原生 onResume 回调入口 */
window.__onAppResumed = ()=>{ maybeRecallNotify(); };
window.saveNotifyUI = ()=>{
const c = getNotifyCfg();
c.on = !!document.getElementById("r_notify_on").checked;
const hh = parseInt(((document.getElementById("r_notify_hours")||{}).value||""), 10);
c.hours = (hh>=1 && hh<=168) ? hh : 6;
const t = ((document.getElementById("r_notify_tpl")||{}).value||"").trim();
if(t) c.template = t;
saveNotifyCfg(c);
alert(c.on ? "已开启：从后台回到前台、且超过 " + c.hours + " 小时没聊天时，会收到一条角色召回本地通知。" : "角色召回通知已关闭。");
};

/* ============ Tier3-25: 可编辑 heartbeat 主动消息（执行面，保守：仅前台） ============ */
function hbCheapModel(){
try{
const hb = (typeof RP_HB!=="undefined") ? RP_HB.getCfg() : {};
const rc = (typeof getRpCfg==="function") ? getRpCfg() : {};
return ((hb.model||"").trim()) || rc.summaryModel || "";
}catch(e){ return ""; }
}
/* 心跳目标聊天：优先当前聊天，否则最近一次有记录的聊天 */
function hbTargetChat(){
try{
if(typeof CHAT!=="undefined" && CHAT && (CHAT.name || CHAT.mode==="group") && typeof chatHistKey==="function"){
const k = chatHistKey(); const h = (typeof getHist==="function") ? getHistSafe(k) : [];
if(h && h.length) return {key:k, name: CHAT.mode==="group" ? (CHAT.members||[]).join("、") : CHAT.name};
}
}catch(e){}
const last = (typeof lastChatInfo==="function") ? lastChatInfo() : null;
return last ? {key:last.key, name:last.name} : null;
}
function renderHbLog(){
const box = document.getElementById("hb_log"); if(!box || typeof RP_HB==="undefined") return;
const c = RP_HB.getCfg();
const rows = (c.log||[]).slice().reverse().map(e=>{
const t = new Date(e.ts).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
return `<div class="storow"><span>${t} · ${e.need?"想主动说话":"无需打扰"}</span><span>${esc(String(e.message||"").slice(0,24))}</span></div>`;
}).join("");
box.innerHTML = (rows ? `<div class="kv" style="margin:8px 0 4px">最近检查记录</div>` + rows
: `<div class="hint">还没有检查记录。</div>`)
+ (c.enabled ? `<div class="kv">已启用 · ${RP_HB.FREQS[c.freq].name}（每 ${RP_HB.intervalOf(c.freq)} 轮用户消息检查一次）· 距上次 ${c.roundsSince||0} 轮</div>` : "");
}
window.saveHbUI = ()=>{
if(typeof RP_HB==="undefined"){ alert("心跳模块未加载"); return; }
const c = RP_HB.getCfg();
c.enabled = !!document.getElementById("r_hb_on").checked;
c.freq = ((document.getElementById("r_hb_freq")||{}).value)||"mid";
if(!RP_HB.FREQS[c.freq]) c.freq = "mid";
c.model = (((document.getElementById("r_hb_model")||{}).value)||"").trim();
const items = (((document.getElementById("r_hb_items")||{}).value)||"").split(/\n/).map(s=>s.trim()).filter(Boolean);
if(items.length) c.items = items;
RP_HB.saveCfg(c);
renderHbLog();
alert(c.enabled ? "心跳检查已启用（仅前台生效，后台不执行）。" : "心跳检查已关闭。");
};
let HB_TOAST_TIMER = null;
function hbToast(msg){
let el = document.getElementById("hbToast");
if(!el){ el = document.createElement("div"); el.id = "hbToast"; el.className = "achv-toast"; document.body.appendChild(el); }
el.innerHTML = msg;
el.classList.add("show");
if(HB_TOAST_TIMER) clearTimeout(HB_TOAST_TIMER);
HB_TOAST_TIMER = setTimeout(()=>el.classList.remove("show"), 3200);
}
window.hbCheckOnce = async ()=>{
if(typeof RP_HB==="undefined"){ alert("心跳模块未加载"); return; }
const cfg = (typeof getCfg==="function") ? getCfg() : {};
if(!cfg.key || !cfg.base || !cfg.model){ alert("先去「我的 · 设置」配好 API 地址/Key/模型"); return; }
const target = hbTargetChat();
if(!target || !target.key){ alert("还没有任何聊天记录，先去聊几句再检查。"); return; }
const model = hbCheapModel() || cfg.model;
if(!confirm("用模型「" + model + "」做一次心跳检查？（约 1 次小模型调用）")) return;
try{
const r = await RP_HB.runCheck({charName: target.name, hist: getHistSafe(target.key), model: model,
complete: (c2, ms, t)=> RP_NET.complete(Object.assign({}, cfg, {model:(c2&&c2.model)||model}), ms, t)});
try{ renderHbLog(); }catch(e){}
alert(r.ok ? (r.need ? "检查完成：角色想主动说——\n" + r.message + "\n（已记入日志，未自动发送）" : "检查完成：这次无需打扰。")
: "检查失败：" + (r.error||"未知错误"));
}catch(e){ alert("检查失败：" + e.message); }
};
/* 每轮用户消息后调用：轮次到达则在前台触发一次检查（fire-and-forget，不阻塞聊天） */
function hbAfterSend(){
try{
if(typeof RP_HB==="undefined") return;
const hb = RP_HB.getCfg();
if(!hb.enabled) return;
hb.roundsSince = (hb.roundsSince||0) + 1;
if(hb.roundsSince < RP_HB.intervalOf(hb.freq)){ RP_HB.saveCfg(hb); return; }
RP_HB.saveCfg(hb); /* runCheck 成功后会清零并写 log */
const cfg = (typeof getCfg==="function") ? getCfg() : {};
if(!cfg.key || !cfg.base || !cfg.model || typeof RP_NET==="undefined") return;
const target = hbTargetChat();
if(!target || !target.key) return;
const model = hbCheapModel() || cfg.model;
RP_HB.runCheck({charName: target.name, hist: getHistSafe(target.key), model: model,
complete: (c2, ms, t)=> RP_NET.complete(Object.assign({}, cfg, {model:(c2&&c2.model)||model}), ms, t)})
.then(r=>{ if(r && r.ok && r.need) hbToast("💓 心跳检查：" + esc(target.name) + "好像想主动和你说句话，去设置页看看"); })
.catch(()=>{});
}catch(e){}
}

