/* 浮生 · app 分段 10：消息编辑 + 长按消息菜单 + 切换会话/开聊入口
 * v41 从 app.js 原样迁出（原 app.js 第 2866–3078 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ============ P0-2 消息编辑: 原地改文本; 改用户消息后自动重生成其后 AI 回复 ============ */
window.editMsg = (idx)=>{
if(document.getElementById("live")){ alert("等这条生成完再编辑"); return; }
const msgs = document.querySelectorAll("#chatlog .msg");
const el = msgs[idx]; if(!el) return;
const bub = el.querySelector(".bubble"); if(!bub || bub.querySelector("textarea")) return;
let h = null;
try{ h = getHist(chatHistKey()); }catch(e){ rpToast("聊天记录读取失败"); return; }
const m = h[idx]; if(!m) return;
bub.dataset.orig = bub.innerHTML;
bub.innerHTML = `<textarea id="editbox" onclick="event.stopPropagation()" style="width:100%;min-height:80px;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px;font-size:calc(14px * var(--fs))">${esc(m.content)}</textarea>`
+ `<div class="btnrow" style="margin-top:6px" onclick="event.stopPropagation()"><button class="btn" onclick="editMsgSave(${jq(idx)})">保存${m.role==="user"?"并重生成":""}</button>`
+ `<button class="btn ghost" onclick="editMsgCancel(${jq(idx)})">取消</button></div>`;
const ta = document.getElementById("editbox");
if(ta){ ta.focus(); try{ ta.setSelectionRange(ta.value.length, ta.value.length); }catch(e){} }
};
window.editMsgCancel = (idx)=>{
const msgs = document.querySelectorAll("#chatlog .msg");
const el = msgs[idx]; if(!el) return;
const bub = el.querySelector(".bubble");
if(bub && ("orig" in bub.dataset)) bub.innerHTML = bub.dataset.orig;
};
/* ============ P0-3 长按消息统一操作菜单 (对标 C.AI 长按菜单) ============ */
window.pinChatMsg = (idx)=>{
if(CHAT.mode !== "single") return;
/* Tier2 #5: Pin 上限 5 条 (C.AI "Pin up to 5 messages") */
if(!RP_MEM.canPinChatMsg(CHAT.runId, CHAT.name)){ msgSheet(false); alert(RP_MEM.msgPinLimitMsg()); return; }
const h = getHistSafe(chatHistKey());
const m = h[idx]; if(!m) return;
const who = m.role === "user" ? "我" : (CHAT.name || "TA");
const st = RP_MEM.get(CHAT.runId, CHAT.name) || {};
st.short = st.short || [];
let nid = 1;
st.short.forEach(x=>{ if(x.id >= nid) nid = x.id + 1; });
st.short.push({id: nid, time: "手动置顶", ts: Date.now(),
fact: (who + "：" + String(m.content).replace(/<[^>]*>/g, "").slice(0, 120)),
view: "", pin: true});
st.updatedAt = Date.now();
RP_MEM.save(CHAT.runId, CHAT.name, st);
msgSheet(false);
achvUnlock("pin_1");
pinNudge(CHAT.runId, CHAT.name);
alert("已 Pin 为长期记忆 📌");
};
let _pressT = null, _pressFired = false;
window.msgPressStart = (ev, idx)=>{
_pressFired = false;
if(_pressT) clearTimeout(_pressT);
_pressT = setTimeout(()=>{ _pressFired = true; msgMenu(idx); }, 550);
};
window.msgPressEnd = ()=>{ if(_pressT){ clearTimeout(_pressT); _pressT = null; } };
window.msgMenu = (idx)=>{
msgPressEnd();
msgSheet(true, idx);
/* Tier2 #5: 首次长按弹一次教育气泡 (C.AI "To pin a memory, press and hold any chat message...") */
try{
if(!RP_MEM.pinEduSeen()){
RP_MEM.pinEduMark();
const sh = document.getElementById("msgsheet");
if(sh && !sh.querySelector(".pinedu")){
const b = document.createElement("div");
b.className = "pinedu";
b.textContent = RP_MEM.pinEduText(CHAT.name);
b.onclick = ()=>b.remove();
sh.insertBefore(b, sh.firstChild);
setTimeout(()=>{ if(b.parentNode) b.remove(); }, 8000);
}
}
}catch(e){}
};
window.msgSheet = (on, idx)=>{
DimState.set(on ? "sheet" : "chat"); /* L2: 菜单打开时压暗背景 */
let sh = document.getElementById("msgsheet");
let sc = document.getElementById("msgscrim");
if(!on){
if(sh) sh.classList.remove("on");
if(sc) sc.classList.remove("on");
return;
}
const h = getHistSafe(chatHistKey());
const m = h[idx]; if(!m) return;
if(!sh){
sc = document.createElement("div");
sc.id = "msgscrim"; sc.className = "scrim msscrim";
sc.onclick = ()=>msgSheet(false);
document.body.appendChild(sc);
sh = document.createElement("div");
sh.id = "msgsheet"; sh.className = "msgsheet";
document.body.appendChild(sh);
}
const isAI = m.role === "assistant";
const canPin = CHAT.mode === "single";
const rewritable = isAI && m.content.indexOf("⚠️")!==0 && m.content.indexOf("【OOC")!==0 && m.content.indexOf("（已停止")!==0;
const prev = String(m.content).replace(/<[^>]*>/g, "").slice(0, 40);
const item = (fn, ic, label, danger)=>
`<button class="msitem${danger?" danger":""}" onclick="${fn}">${icon(ic,16)} ${label}</button>`;
const close = "msgSheet(false);";
sh.innerHTML = `<div class="mshandle"></div><div class="msprev">${esc(prev)}${m.content.length>40?"…":""}</div>`
+ (canPin ? item(close+`pinChatMsg(${jq(idx)})`, "pin", "Pin 为长期记忆") : "")
+ (isAI ? item(close+`rateMsg(${jq(idx)},1)`, "thumb-up", m.rating===1?"已赞同":"赞同")
+ item(close+`rateMsg(${jq(idx)},-1)`, "thumb-down", m.rating===-1?"已反对":"反对") : "")
+ (rewritable ? item(close+`rewriteMsg(${jq(idx)})`, "repeat", "改写") : "")
+ item(close+`editMsg(${jq(idx)})`, "edit", "编辑")
+ item(close+`copyMsg(${jq(idx)})`, "copy", "复制")
+ (isAI ? item(close+`ttsMsg(${jq(idx)})`, "volume", "TTS 朗读") : "")
+ item(close+`delMsgAsk(${jq(idx)})`, "trash", "删除", true)
+ item(close+`rewindMsg(${jq(idx)})`, "history", "回溯到这里");
document.getElementById("msgscrim").classList.add("on");
sh.classList.add("on");
};
window.editMsgSave = async (idx)=>{
/* P2-2: 与在飞流互斥——流式中保存编辑会并发改同一批消息 */
if(STREAMING || document.getElementById("live")){ rpToast("正在生成中，等这条回复完成再编辑"); return; }
const ta = document.getElementById("editbox");
const nv = ta ? ta.value : "";
if(!nv.trim()){ alert("内容不能为空"); return; }
const k = chatHistKey();
let h = null;
try{ h = getHist(k); }catch(e){ rpToast("聊天记录读取失败"); return; }
const m = h[idx]; if(!m) return;
achvUnlock("edit_1");
if(m.role !== "user"){
// AI 消息: 只改文本, 不触发重生成; 保留 swipe 变体数组/评分
m.content = nv;
saveHist(k, h); renderChat();
return;
}
// 用户消息: 截掉其后所有消息, 弹出本条, 用现有发送管线重生成
const cfg0 = getCfg();
if(!cfg0.key || !cfg0.base || !cfg0.model){ alert("先去「我的 · 设置」配好 API 地址/Key/模型"); return; }
const um = h[idx];
saveHist(k, h.slice(0, idx));
// 保留原消息的旁白/代发言身份
const keepNarr = CHAT.narrMode, keepSpk = CHAT.asSpeaker;
CHAT.narrMode = (um.mtype === "narr");
CHAT.asSpeaker = um.speaker || null;
try{ await sendChatText(nv); }
finally{ CHAT.narrMode = keepNarr; CHAT.asSpeaker = keepSpk; }
};
/* M4: 长文本折叠开关 */
window.foldToggle = (btn)=>{
const b = btn.closest(".bubble"); if(!b) return;
const collapsed = b.classList.toggle("collapsed");
btn.textContent = collapsed ? "展开全文" : "收起";
};
window.toggleTools = (ev, idx)=>{
/* 沉浸式呼出栏的点按：吞掉，不弹编辑栏 */
if(window.__barsRevealTs && Date.now() - window.__barsRevealTs < 600){
  window.__barsRevealTs = 0;
  return;
}
if(_pressFired){ _pressFired = false; return; }
/* P2: 打字机动画中点气泡 = 立即打断完成 */
if(typeof twFinish!=="undefined" && TW.timer && TW.idx===idx){ twFinish(); return; }
if(ev.target.closest(".msgtools") || ev.target.closest(".swipe")) return;
const msgs = document.querySelectorAll("#chatlog .msg");
const el = msgs[idx];
if(!el) return;
const was = el.classList.contains("show-tools");
msgs.forEach(m=>m.classList.remove("show-tools"));
if(!was) el.classList.add("show-tools");
};
window.switchChat = (v)=>{
/* P0-4: 切会话前先取消在飞的流，否则旧流的 token 会写进新会话（串台）且旧流不可取消 */
abortStreaming();
const [runId, name] = v.split("|");
/* run 数据按需加载：冷启动从抽屉切到还没拉过的书，先补数据再渲染 */
if(isRealRun(runId) && !runReady(runId)){
  if(guardRun(runId, function(){ switchChat(v); })) return;
}
CHAT = {mode:"single", runId, name, members:[], forcedSpeaker:null};
/* P2-14: 指针写失败（配额满）不应中断切换，最坏只是下次冷启动回不到这个会话 */
try{ localStorage.setItem("nd_chat_last", v); }catch(e){}
showChat();
};
/* P0-1: 抽屉"切换角色"按钮改事件委托 —— runId/name 经 data-* 属性传递（esc 转义引号），
 * 不再拼进 onclick 字符串；委托绑在 document 上一次，drawer 每次重建 innerHTML 不受影响。 */
if(typeof document!=="undefined" && document.addEventListener){
document.addEventListener("click", (e)=>{
const b = e.target && e.target.closest ? e.target.closest("[data-swrun]") : null;
if(!b || !b.dataset) return;
switchChat(b.dataset.swrun + "|" + b.dataset.swname);
});
}
window.chatWith = (runId, name)=>{
/* 蒸馏包的角色卡存在 distill_* 命名空间里，模块是按需加载的：
   冷启动后直接开聊蒸馏包时先把它们拉起来，否则 findCard 找不到卡。 */
if(typeof runId === "string" && runId.indexOf("distill_") === 0 && typeof DISTILL_PACKAGE === "undefined"){
  view.innerHTML = `<div class="empty">正在加载蒸馏模块…</div>`;
  RP_LAZY.ensureGroup("distill").then(function(){ chatWith(runId, name); })
    .catch(function(e){ view.innerHTML = `<div class="empty">蒸馏模块加载失败<br><span style="font-size:calc(12px * var(--fs))">${escH(e.message)}</span></div>`; });
  return;
}
/* run 数据按需加载（data.js 拆包）：真蒸馏 run 未就绪时先拉数据再开聊。
   imported/custom 没有 run 文件，isRealRun 排除，不会误发 404。 */
if(isRealRun(runId) && !runReady(runId)){
  if(guardRun(runId, function(){ chatWith(runId, name); })) return;
}
/* P1 开场选择器：多开场卡片且非指定开场进入时，先弹半屏选开场 */
if(window.__pendingOpening == null){
let ops = [];
try{ ops = cardOpenings(runId, name); }catch(e){}
if(ops.length > 1){ openSheet(true, runId, name); return; }
}
startChat(runId, name);
};
function startChat(runId, name){
CHAT = {mode:"single", runId, name, members:[], forcedSpeaker:null};
loadPov();
LAST_STATS = null;
try{ localStorage.setItem("nd_chat_last", `${runId}|${name}`); }catch(e){}
setNav("chat");
}
