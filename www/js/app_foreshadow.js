/* 浮生 · app 分段 09：伏笔面板 + 剧情导出
 * v41 从 app.js 原样迁出（原 app.js 第 2434–2865 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ============ 伏笔面板 + 剧情导出 (对标 Talkie 剧情 "Foreshadowing Panel · EPUB Export") ============ */
/* 数据: RP_FORE (www/data/foreshadow_cal.js 蒸馏管线事件日历, 897 条伏笔) */
let FS_TAB = "unresolved";
/* B19 伏笔数据源是 www/data/foreshadow_cal.js: 纯《红楼梦》蒸馏产物, 无 runId 隔离
   (rp/foreshadow.js 直读 window.__CAL__)。非红楼聊天(导入卡/水浒/清安录…)打开面板
   看到的是别的书的伏笔 = 串味, 故按当前聊天所属小说的世界门禁。
   run 取法同 relRunFor: 蒸馏 run 走 __DATA__.runs[runId], 导入卡/custom 走
   RP.synthRunFor(runId,name) 的合成 run(带 novel)。 */
const FORE_NOVEL = "红楼梦";
function foreRunFor(runId, name){
  return relRunFor(runId, name);
}
/* B20: 门禁参数化 —— novelMaterial 按 NOV.runId/NOV.name 判定 (非 CHAT),
   与抽屉入口的 foreAvailable() 语义一致 */
function foreAvailableFor(runId, name){
  var run = foreRunFor(runId, name);
  return String((run && run.novel) || "") === FORE_NOVEL;
}
function foreAvailable(){
  return foreAvailableFor(CHAT.runId, CHAT.name);
}
/* 抽屉入口 (单聊/群聊共用): 非红楼梦世界返回空串, 按钮不渲染 */
/* v41 抽屉：导入/导出/正则/Prompt 诊断等低频项收进可折叠「高级」组；展开状态本机记住 */
function drawerAdvHTML(inner){
  let open = false;
  try{ open = localStorage.getItem("nd_drawer_adv_open") === "1"; }catch(e){}
  return `<details class="dadv"${open ? " open" : ""} ontoggle="try{localStorage.setItem('nd_drawer_adv_open', this.open?'1':'0')}catch(e){}">`
    + `<summary class="dadv-sum">高级 <span class="kv">导入 · 导出 · 正则 · 调试</span></summary>`
    + `<div class="dadv-body">${inner}</div></details>`;
}
function foreEntryHTML(){
  if(!foreAvailable()) return "";
  return `<button class="ditem" onclick="toggleDrawer(false);showForeshadow()">${icon("book-open")} 伏笔面板</button>`;
}
window.showForeshadow = ()=>{
if(!foreAvailable()){ rpToast("伏笔面板仅支持《红楼梦》蒸馏剧本"); return; }
if(typeof RP_FORE === "undefined" || !RP_FORE.items().length){ rpToast("伏笔数据未加载"); return; }
FS_TAB = "unresolved";
renderForeshadow();
};
window.fsTab = (t)=>{ FS_TAB = t; renderForeshadow(); };
function renderForeshadow(){
const run = foreRunFor(CHAT.runId, CHAT.name); /* 门禁已保证是《红楼梦》世界; 副标题按当前 run 取书名 */
__backAction = ()=>showChat();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
titleEl.innerHTML = icon("book-open") + " 伏笔面板";
const g = RP_FORE.group();
subEl.textContent = (run.novel || "红楼梦") + ` · 未回收 ${g.unresolved.length} · 已回收 ${g.resolved.length}`;
const list = FS_TAB === "resolved" ? g.resolved : g.unresolved;
const CAP = 200;
const cards = list.slice(0, CAP).map(x=>{
const e = x.e;
const resolved = RP_FORE.isResolved(e);
return `<div class="card card--tap" onclick="foreshadowChapter(${jq(e.ch)})" style="cursor:pointer">
<div style="font-size:calc(13px * var(--fs));margin-bottom:6px">${esc(e.s || "")}</div>
<div class="row"><span class="badge" style="${resolved?"":"background:#f5e6c8;color:#8a6d2f"}">${esc(RP_FORE.statusText(e))}</span>
<span class="kv">第 ${e.ch} 回</span>
<span class="kv">${esc(RP_FORE.peopleText(e))}</span>
<span style="flex:1"></span><span class="kv">›</span></div></div>`;
}).join("");
view.innerHTML = `<button class="back" onclick="showChat()">${icon("back")} 返回聊天</button>
<div class="dtabs">
<button class="dtab${FS_TAB==="unresolved"?" on":""}" onclick="fsTab('unresolved')">未回收 · ${g.unresolved.length}</button>
<button class="dtab${FS_TAB==="resolved"?" on":""}" onclick="fsTab('resolved')">已回收 · ${g.resolved.length}</button>
</div>
<div class="hint">状态按蒸馏数据推导: 有回收时间点的记为「已回收」。点任意条目跳转到对应回目的事件。</div>
${cards || `<div class="empty">暂无</div>`}
${list.length > CAP ? `<div class="hint">仅展示前 ${CAP} 条, 共 ${list.length} 条</div>` : ""}
<div style="height:40px"></div>`;
window.scrollTo(0,0);
}
/* 点击伏笔 -> 跳转对应回目 (事件日历/回目映射) */
window.foreshadowChapter = (ch)=>{
__backAction = ()=>renderForeshadow();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
titleEl.innerHTML = icon("book-open") + ` 第 ${ch} 回`;
subEl.textContent = "事件日历 · 回目事件";
const evs = (typeof RP_FORE !== "undefined") ? RP_FORE.chapterOf(ch) : [];
const KN = {event: "事件", foreshadowing: "伏笔", turning_point: "转折点", arc_turning_point: "弧光转折"};
const groups = {};
evs.forEach(x=>{ const k = x.e.k || "event"; (groups[k] = groups[k] || []).push(x); });
const body = Object.keys(groups).map(k=>
`<h2 class="sec">${KN[k] || k} · ${groups[k].length}</h2>` +
groups[k].map(x=>`<div class="card"><div style="font-size:calc(13px * var(--fs))">${esc(x.e.s || "")}</div>
<div class="kv" style="margin-top:4px">${esc(RP_FORE.peopleText(x.e))}</div></div>`).join("")
).join("") || `<div class="empty">该回目暂无事件</div>`;
view.innerHTML = `<button class="back" onclick="renderForeshadow()">${icon("back")} 返回伏笔面板</button>
${body}<div style="height:40px"></div>`;
window.scrollTo(0,0);
};
/* 聊天记录导出 TXT (纯文本: 时间 + 说话人 + 内容; EPUB 不做, TXT 保底) */
function downloadTxt(name, text){
try{
const blob = new Blob(["\ufeff" + text], {type: "text/plain;charset=utf-8"});
const a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = name;
document.body.appendChild(a); a.click();
setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); }catch(e){} a.remove(); }, 800);
}catch(e){ copyText(text); rpToast("下载失败, 已复制到剪贴板"); }
}
/* JSON 下载 (ST 制品导出用, 无 BOM) */
function downloadJson(name, obj){
downloadRaw(name, JSON.stringify(obj, null, 2), "application/json;charset=utf-8");
}
/* 原始文本下载 (无 BOM, JSONL 等用) */
function downloadRaw(name, text, mime){
try{
const blob = new Blob([text], {type: mime || "text/plain;charset=utf-8"});
const a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = name;
document.body.appendChild(a); a.click();
setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); }catch(e){} a.remove(); }, 800);
}catch(e){ copyText(text); rpToast("下载失败, 已复制到剪贴板"); }
}
window.exportChatTxt = ()=>{
const h = getHistSafe(chatHistKey());
if(!h.length){ rpToast("没有可导出的聊天记录"); return; }
const who = (m)=> m.role === "user" ? "我"
  : (CHAT.mode === "group" ? (m.speaker || "?") : (CHAT.name || "?"));
const txt = h.map(m=>{
const ts = m.ts ? new Date(m.ts).toLocaleString("zh-CN") : "";
return `[${ts}] ${who(m)}: ${m.content}`;
}).join("\n\n");
const nm = CHAT.mode === "group" ? "群聊" : (CHAT.name || "聊天");
downloadTxt(`${nm}_聊天记录.txt`, txt);
rpToast(`已导出 ${h.length} 条`);
};
/* ST 聊天记录导出(JSONL): 与 stChatParse/stChatToEntries 互逆, 可导回 ST */
window.exportChatJsonl = ()=>{
const h = getHistSafe(chatHistKey());
if(!h.length){ rpToast("没有可导出的聊天记录"); return; }
const p = (typeof RP_PERSONA !== "undefined") ? RP_PERSONA.getGlobal() : null;
const meta = {userName: (p && p.name) || "User",
  charName: CHAT.mode === "group" ? "群聊" : (CHAT.name || ""),
  chatMeta: getStChatMeta()};
const nm = CHAT.mode === "group" ? "群聊" : (CHAT.name || "聊天");
downloadRaw(`${nm}_st.jsonl`, stEntriesToJsonl(h, meta), "application/jsonl");
rpToast(`已导出 ${h.length} 条 (ST JSONL)`);
};
/* ST 聊天记录(JSONL) -> 本机消息条目。
 * ST 格式: 每行一个 JSON; 首行是会话元数据 {user_name, character_name, create_date, chat_metadata};
 * 消息行 {name, is_user, is_system, send_date, mes, extra, ...}。
 * 映射: is_user->user, is_system->system(进 prompt 时仍是 system, 忠实),
 * 其它->assistant(保留 speaker=name); send_date 解析失败回退 Date.now();
 * 空 mes 跳过; extra 字段(如构画 gouhua_snapshot、swipe 变体)原样保留进条目 stExtra,
 * 导出时写回; 首行 chat_metadata 按聊天另存, 覆盖导入时替换、导出时写回。 */
function stChatParse(text){
const lines = String(text || "").split("\n");
const raw = [];
for(const ln of lines){ const s = ln.trim(); if(!s) continue;
try{ raw.push(JSON.parse(s)); }catch(e){ return null; } }
if(!raw.length) return null;
let meta = null; const msgs = [];
raw.forEach(function(o){
if(!o || typeof o !== "object") return;
if(!meta && o.mes === undefined && (o.character_name || o.user_name)){ meta = o; return; }
msgs.push(o);
});
return {meta: meta, msgs: msgs};
}
function stChatToEntries(parsed){
if(!parsed || !parsed.msgs) return [];
const out = [];
parsed.msgs.forEach(function(m){
if(!m || typeof m.mes !== "string" || !m.mes.trim()) return;
const role = m.is_user ? "user" : (m.is_system ? "system" : "assistant");
const e = {role: role, content: m.mes};
/* ST 扩展数据透传: message.extra(如构画 gouhua_snapshot、swipe 变体)原样保留,
 * 导出时写回, 经本机一进一出不丢失。 */
if(m.extra && typeof m.extra === "object"){
try{ const ex = JSON.parse(JSON.stringify(m.extra));
if(ex && Object.keys(ex).length) e.stExtra = ex; }catch(_){}
}
/* ST 的 send_date 如 "January 27, 2026 2:32am"(am 前无空格) Date.parse 吃不下，先规范化 */
let sd = String(m.send_date || "").replace(/(\d)(am|pm)\s*$/i, "$1 $2");
let ts = Date.parse(sd); e.ts = isNaN(ts) ? Date.now() : ts;
if(role === "assistant" && m.name) e.speaker = m.name;
out.push(e);
});
return out;
}
/* ST send_date 格式: "January 27, 2026 2:32am" (am 前无空格, 与 ST 一致) */
function stFormatDate(ts){
const d = new Date(+ts || Date.now());
const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
let h = d.getHours(); const ap = h >= 12 ? "pm" : "am"; h = h % 12; if(h === 0) h = 12;
const mm = (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() + " " + h + ":" + mm + ap;
}
/* 本机消息条目 -> ST 聊天记录 JSONL (stChatParse/stChatToEntries 的逆操作)。
 * entries: [{role:'user'|'assistant'|'system', content, ts, speaker}];
 * meta: {userName, charName}。首行写会话元数据, 其后每行一条消息。 */
function stEntriesToJsonl(entries, meta){
meta = meta || {};
const userName = meta.userName || "User", charName = meta.charName || "";
const first = {user_name: userName, character_name: charName,
create_date: stFormatDate((entries && entries[0] && entries[0].ts) || Date.now())};
/* 扩展数据透传: 首行 chat_metadata(如构画 sp-store/sp-memory/sp-theater/sp-ledger)原样写回 */
if(meta.chatMeta && typeof meta.chatMeta === "object" && Object.keys(meta.chatMeta).length)
first.chat_metadata = meta.chatMeta;
const lines = [JSON.stringify(first)];
(entries || []).forEach(function(e){
if(!e || typeof e.content !== "string" || !e.content.trim()) return;
const isUser = e.role === "user", isSys = e.role === "system";
const line = {
name: isUser ? userName : (e.speaker || charName),
is_user: isUser,
is_system: isSys,
send_date: stFormatDate(e.ts),
mes: e.content
};
/* 扩展数据透传: 消息级 extra(如 gouhua_snapshot)原样写回 */
if(e.stExtra && typeof e.stExtra === "object" && Object.keys(e.stExtra).length)
line.extra = e.stExtra;
/* Soul 元数据: _soul/_speakers/_turnId/_conflicts 进 extra.soul */
if(e._soul){
  line.extra = line.extra || {};
  line.extra.soul = {
    speakers: e._speakers || [],
    turnId: e._turnId || "",
    conflicts: (e._conflicts || []).map(function(c){ return {a: c.a, b: c.b}; }),
    conflictResolved: !!e._conflictResolved
  };
}
lines.push(JSON.stringify(line));
});
return lines.join("\n");
}
/* ST 扩展数据透传(chat_metadata): 构画等扩展把点线面间数据存在首行 chat_metadata
 * (sp-store/sp-memory/sp-theater/sp-ledger)。导入时按聊天存下, 导出时原样写回。
 * 只透传不解析, 不进 prompt, 不在 UI 展示。 */
const stChatMetaKey = ()=> "nd_stmeta_" + chatHistKey();
function getStChatMeta(){ try{ return JSON.parse(localStorage.getItem(stChatMetaKey())) || null; }catch(e){ return null; } }
function setStChatMeta(o){ try{
if(o && typeof o === "object" && Object.keys(o).length) localStorage.setItem(stChatMetaKey(), JSON.stringify(o));
else localStorage.removeItem(stChatMetaKey());
}catch(e){} }
/* ST 聊天记录导入: 聊天页抽屉 -> 选 .jsonl -> 确认页(目标/追加或覆盖) -> 写入当前单人聊天 */
let STCHAT_PENDING = null;
window.importStChat = ()=>{
if(CHAT.mode !== "single" || !CHAT.name){ alert("请先打开一个单人聊天再导入"); return; }
const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".jsonl,application/json";
inp.onchange = ()=>{
const f = inp.files[0]; if(!f) return;
const rd = new FileReader();
rd.onload = ()=>{
try{
const parsed = stChatParse(rd.result);
if(!parsed){ alert("解析失败: 不是 ST 聊天记录(JSONL, 每行一个 JSON)"); return; }
const entries = stChatToEntries(parsed);
if(!entries.length){ alert("解析失败: 文件里没有可导入的消息"); return; }
STCHAT_PENDING = {parsed: parsed, entries: entries, file: f.name};
stChatConfirm();
}catch(e){ alert("解析失败: " + e.message); }
};
rd.readAsText(f);
};
inp.click();
};
function stChatConfirm(){
const p = STCHAT_PENDING; if(!p) return;
__backAction = ()=>showChat();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
titleEl.innerHTML = icon("upload") + " 导入 ST 聊天记录";
const meta = p.parsed.meta || {};
const charName = meta.character_name || "";
const userName = meta.user_name || "";
const n = p.entries.length;
const tss = p.entries.map(e=>e.ts).filter(Boolean);
const range = tss.length ? (new Date(Math.min.apply(null, tss)).toLocaleString("zh-CN") + " ~ " + new Date(Math.max.apply(null, tss)).toLocaleString("zh-CN")) : "";
const nUser = p.entries.filter(e=>e.role === "user").length;
const nAsst = p.entries.filter(e=>e.role === "assistant").length;
const nSys = p.entries.filter(e=>e.role === "system").length;
const mismatch = charName && charName !== CHAT.name;
/* 扩展数据透传提示: 首行 chat_metadata(如构画点线面间)与消息 extra(如楼层快照) */
const chatMetaKeys = meta.chat_metadata && typeof meta.chat_metadata === "object"
? Object.keys(meta.chat_metadata) : [];
const hasChatMeta = chatMetaKeys.length > 0;
const nExtra = p.entries.filter(e=>e.stExtra).length;
subEl.textContent = p.file;
view.innerHTML = `<button class="back" onclick="showChat()">${icon("back")} 返回聊天</button>
<div class="card"><div class="kv">文件角色</div><div class="name">${esc(charName || "未知")}</div>
<div class="meta">玩家: ${esc(userName || "未知")}${range ? ` · ${esc(range)}` : ""}</div>
<div class="meta">共 ${n} 条消息（我 ${nUser} / AI ${nAsst}${nSys ? ` / 系统 ${nSys}` : ""}）</div>
${hasChatMeta ? `<div class="meta">含 ST 扩展数据（chat_metadata: ${esc(chatMetaKeys.slice(0,4).join("、"))}${chatMetaKeys.length>4?"…":""}），覆盖导入时会一并保留</div>` : ""}
${nExtra ? `<div class="meta">${nExtra} 条消息含 extra 扩展数据（如楼层快照），将保留并在导出时写回</div>` : ""}</div>
<div class="card"><div class="kv">导入到</div><div class="name">${esc(CHAT.name)}</div>
<div class="meta">当前单人聊天${mismatch ? ` · <span style="color:var(--danger)">文件中角色名「${esc(charName)}」与当前角色不一致，仍可导入</span>` : ""}</div></div>
<div class="field"><label>导入方式</label>
<label style="display:block;margin:6px 0"><input type="radio" name="stchat_mode" value="append" checked style="width:auto"> 追加到现有记录后面</label>
<label style="display:block;margin:6px 0"><input type="radio" name="stchat_mode" value="replace" style="width:auto"> 覆盖（清空当前聊天记录）</label></div>
<div class="meta" style="margin-bottom:10px">聊天记录最多保留 80 条，超出部分只保留最新的 80 条；swipe 变体等多轮回复只导入当前显示的一条；消息的 extra 扩展数据会一并保留，导出时写回。</div>
<button class="btn primary" onclick="doStChatImport()">开始导入</button>`;
}
window.doStChatImport = ()=>{
const p = STCHAT_PENDING; if(!p) return;
const mode = (document.querySelector('input[name="stchat_mode"]:checked') || {}).value || "append";
if(mode === "replace" && !confirm("确定清空当前聊天记录并导入？")) return;
const k = chatHistKey();
/* P0-3: 追加导入前严格读历史，读失败则中止导入（不能拿空数组覆盖真实历史） */
let cur = [];
if(mode === "append"){
try{ cur = getHist(k); }catch(e){ rpToast("聊天记录读取失败，导入已中止"); return; }
}
const merged = cur.concat(p.entries);
const saved = saveHist(k, merged);
/* 扩展数据透传: 覆盖模式连首行 chat_metadata 一起换(构画点线面间数据跟聊天走);
 * 追加模式保留当前聊天的, 只带走消息级 extra。 */
if(mode === "replace"){
const cm = p.parsed.meta && p.parsed.meta.chat_metadata;
setStChatMeta(cm && typeof cm === "object" ? cm : null);
}
STCHAT_PENDING = null;
/* P1-10: toast 播报实际入库条数——merged 超上限被 saveHist 截断时,
 p.entries.length 是谎报；被丢弃的是"最早的 droppedTotal 条"（含被挤掉的旧记录） */
const curKept = Math.max(0, cur.length - saved.dropped);
const fileKept = saved.kept - curKept;
rpToast(`已导入 ${fileKept} 条` +
  (saved.dropped ? `（超出 ${saved.max} 条上限，最早的 ${saved.dropped} 条已丢弃）` : ""));
showChat();
};
/* 构画便携包导入: 聊天页抽屉 -> 选 .json -> 确认页(模块清单/映射预览) -> 世界书+当前聊天
 * 模块映射(见 RP_GOUHUA): 点/线/面(大纲)/历/棱 -> 世界书条目; 间/面讨论 -> 聊天消息。
 * 只做数据吸收, 不解释构画功能; 世界书条目走既有 lorebook 存储, 照常参与触发。 */
let GOUHUA_PENDING = null;
window.importGouhua = ()=>{
if(CHAT.mode !== "single" || !CHAT.name){ alert("请先打开一个单人聊天再导入"); return; }
if(typeof RP_GOUHUA === "undefined" || !RP_GOUHUA.parsePortable){ rpToast("构画模块未加载"); return; }
const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
inp.onchange = ()=>{
const f = inp.files[0]; if(!f) return;
const rd = new FileReader();
rd.onload = ()=>{
const r = RP_GOUHUA.parsePortable(rd.result);
if(!r.ok){ alert("解析失败: " + r.message); return; }
GOUHUA_PENDING = {pkg: r.pkg, file: f.name};
gouhuaConfirm();
};
rd.readAsText(f);
};
inp.click();
};
function gouhuaConfirm(){
const p = GOUHUA_PENDING; if(!p) return;
__backAction = ()=>showChat();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
titleEl.innerHTML = icon("upload") + " 导入构画便携包";
subEl.textContent = p.file;
const rows = RP_GOUHUA.summarize(p.pkg);
const nLore = rows.reduce((a,r)=>a+r.lore, 0), nChat = rows.reduce((a,r)=>a+r.chat, 0);
view.innerHTML = `<button class="back" onclick="showChat()">${icon("back")} 返回聊天</button>
<div class="card"><div class="kv">数据包</div><div class="name">${esc(p.file)}</div>
<div class="meta">构画便携包 v${p.pkg.version}${p.pkg.exportedAt ? " · " + esc(p.pkg.exportedAt.slice(0,10)) : ""}</div>
<div class="meta">共 ${rows.length} 个模块 → 世界书 ${nLore} 条${nChat ? " + 聊天 " + nChat + " 条" : ""}</div></div>
<div class="card"><div class="kv">模块映射</div>
${rows.map(r=>`<div class="meta" style="margin:4px 0">· ${esc(r.label)} → ${esc(r.target)}</div>`).join("")}
<div class="meta" style="margin-top:8px">导入到：世界书（${esc(CHAT.name)} 所在世界）${nChat ? "＋当前聊天" : ""}</div></div>
<div class="meta" style="margin-bottom:10px">点/线/面(大纲)/历/棱进入世界书参与关键词触发；间(局外聊天)与面讨论追加到当前聊天记录后面。</div>
<button class="btn primary" onclick="doGouhuaImport()">开始导入</button>`;
}
window.doGouhuaImport = ()=>{
const p = GOUHUA_PENDING; if(!p) return;
const loreEntries = RP_GOUHUA.toLoreEntries(p.pkg);
const chatEntries = RP_GOUHUA.toChatEntries(p.pkg);
if(loreEntries.length && CHAT.runId){
const a = getLore(CHAT.runId);
loreEntries.forEach(e=>a.push(e));
saveLore(CHAT.runId, a);
}
if(chatEntries.length){
const k = chatHistKey();
let _gh = null;
try{ _gh = getHist(k); }catch(e){ rpToast("聊天记录读取失败，导入已中止"); return; }
saveHist(k, _gh.concat(chatEntries));
}
GOUHUA_PENDING = null;
rpToast(`已导入构画数据：世界书 ${loreEntries.length} 条，聊天 ${chatEntries.length} 条`);
showChat();
};
function copyText(t){
if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t); return; }
const ta = document.createElement("textarea");
ta.value = t; document.body.appendChild(ta); ta.select();
try{ document.execCommand("copy"); }catch(e){}
document.body.removeChild(ta);
}
window.copyMsg = (idx)=>{
const h = getHistSafe(chatHistKey());
copyText(h[idx].content);
};
window.delMsg = (idx)=>{
const k = chatHistKey();
let h = null;
try{ h = getHist(k); }catch(e){ rpToast("聊天记录读取失败"); return; }
h.splice(idx, 1);
saveHist(k, h); renderChat();
};
/* Tier2 #13: 消息已进记忆时, 删除前询问"删消息和记忆 / 只删消息" (对标 Janitor 删除对话框)。
 * 未进记忆 → 走旧 confirm 直删。 */
window.delMsgAsk = (idx)=>{
const k = chatHistKey();
const h = getHistSafe(k);
const m = h[idx]; if(!m) return;
msgSheet(false);
let inMem = false;
if(CHAT.mode === "single"){
try{ inMem = RP_MEM.msgInMemory(CHAT.runId, CHAT.name, m, h).inMemory; }catch(e){}
}
if(!inMem){
if(confirm("删除这条消息？")) window.delMsg(idx);
return;
}
const ov = document.createElement("div");
ov.className = "cfcheck";
ov.innerHTML = `<div class="cfbox"><div class="cfttl">删除这条消息？</div>`
+ `<div class="cfbody">${esc(RP_MEM.delAskText())}</div>`
+ `<div class="cfbtns"><button class="btn" id="delask_both">删除消息和记忆</button>`
+ `<button class="btn ghost" id="delask_msg">只删消息</button>`
+ `<button class="btn ghost" id="delask_cancel">取消</button></div></div>`;
document.body.appendChild(ov);
const done = ()=>ov.remove();
ov.querySelector("#delask_cancel").onclick = done;
ov.onclick = (e)=>{ if(e.target === ov) done(); };
ov.querySelector("#delask_both").onclick = ()=>{
window.delMsg(idx);
try{ RP_MEM.clear(CHAT.runId, CHAT.name); }catch(e){}
done();
};
ov.querySelector("#delask_msg").onclick = ()=>{ window.delMsg(idx); done(); };
};
