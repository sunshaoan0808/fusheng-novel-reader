/* 浮生 · app 分段 15：记忆事件簿、记忆日记、事实增改删、记忆转小说
 * v41 从 app.js 原样迁出（原 app.js 第 4552–5053 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ============ 记忆事件簿 (对标 Talkie Memory Album + C.AI 记忆 Pin) ============ */
let ALBUM = {runId:null, name:null, back:null};
let ALBUM_KIND = ""; /* Tier2 #14: 事件分型筛选，空=全部 */
window.albumKindFilter = (k)=>{ ALBUM_KIND = k || ""; renderAlbum(); };
window.openAlbum = (runId, name, back)=>{
ALBUM = {runId:runId, name:name, back:(typeof back==="function"?back:null)};
renderAlbum();
};
function albumBack(){
if(ALBUM.back) ALBUM.back();
else showChat();
}
/* ============ Tier3-23: 记忆日记（Memory Diary 形态）============
 * auto-memories（自动抽取）/ pinned-memories（Pin/永久）两节，按时间倒序，日期分组头 */
function diaryTs(m){ /* 条目时间戳：ts 优先，其次解析 time 文本，否则 0（未知时间） */
if(m && m.ts) return m.ts;
if(m && m.time){ const t = Date.parse(m.time); if(!isNaN(t)) return t; }
return 0;
}
function diaryDayLabel(ts){
if(!ts) return "未知时间";
const d = new Date(ts), now = new Date();
const day = (x)=> new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
const diff = Math.round((day(now) - day(d)) / 86400e3);
const md = (d.getMonth() + 1) + "月" + d.getDate() + "日";
if(diff === 0) return "今天 · " + md;
if(diff === 1) return "昨天 · " + md;
if(d.getFullYear() === now.getFullYear()) return md;
return d.getFullYear() + "年" + md;
}
function diarySectionHTML(title, ic, items, evCard){
if(!items.length) return "";
const sorted = items.slice().sort((a,b)=>diaryTs(b) - diaryTs(a));
let html = "", lastDay = null;
sorted.forEach(m=>{
const day = diaryDayLabel(diaryTs(m));
if(day !== lastDay){ html += `<div class="diary-day">${esc(day)}</div>`; lastDay = day; }
html += evCard(m);
});
return `<h2 class="sec">${icon(ic,14)} ${title}</h2><div class="timeline">${html}</div>`;
}
function renderAlbum(){
const runId = ALBUM.runId, nm = ALBUM.name;
__backAction = ()=>albumBack();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
let st = RP_MEM.get(runId, nm);
/* LeanMem: 事件簿打开时确保三库已迁移 (幂等), 展示分流结果 */
if(st && RP_MEM.leanmemOn && RP_MEM.leanmemOn()) st = RP_MEM.migrate3(runId, nm, st);
const short = (st && st.short) || [];
const pinned = short.filter(m=>m.pin);
const rest = short.filter(m=>!m.pin);
const h = getHistSafe(`nd_chat_${runId}_${nm}`);
let up = 0, dn = 0;
h.forEach(m=>{ if(m.role==="assistant"){ if(m.rating===1) up++; else if(m.rating===-1) dn++; } });
titleEl.innerHTML = icon("books")+" 记忆事件簿"; subEl.textContent = nm + " · 记忆日记";
/* P1-8: 长期记忆库用量条 */
const ms = RP_MEM.memStats(runId, nm);
const muPct = Math.min(100, Math.round(ms.events / Math.max(1, ms.shortMax) * 100));
const muBar = `<div class="mem-usage"><div class="mu-bar"><div class="mu-fill" style="width:${muPct}%"></div></div>
<div class="mu-label">长期记忆 ${ms.events}/${ms.shortMax} · 置顶 ${ms.pinned}/${ms.pinMax} · 长远印象 ${ms.longN}/1</div></div>`
+ (ms.pinned >= ms.pinMax ? `<div class="hint warn">置顶已达 ${ms.pinned} 条, 建议整理：取消不重要的置顶, 让最重要的记忆排在前面。（只是提醒, 不会禁止继续置顶）</div>` : "");
/* Tier2 #19: 记忆快照状态行 (对标猫箱 BotMemorySnapshot 状态机) */
const msl = RP_MEM.memStatusLine(runId, nm);
const memStatusHtml = (msl.state !== "idle")
? `<div class="memstatus ${msl.state}"${msl.state==="fail"?' onclick="retryMemAnalyze()" style="cursor:pointer"':""}>${esc(msl.text)}</div>` : "";
const evCard = (m)=>{
const id = m.id;
return `<div class="tl-item${m.pin?" gold":""}"><div class="card alb-event${m.pin?" pinned":""}">`
+ `<div class="alb-time">${esc(m.time||"往事")}${m.pin ? ' <span class="badge warn">' + icon("pin",13) + ' 置顶</span>' : ""}</div>`
+ `<div class="alb-fact">${esc(m.fact||"")}</div>`
+ (m.view?`<div class="alb-view">此刻看法：${esc(m.view)}</div>`:"")
+ `<div class="btnrow" style="margin-top:8px">`
+ `<button class="btn ghost" onclick="memPin(${jq(id)})">${m.pin?"取消置顶":icon("pin",14)+" 置顶"}</button>`
+ `<button class="btn ghost" onclick="memEditForm(${jq(id)})">✏️ 编辑</button>`
+ `<button class="btn ghost" onclick="memCopyCard(${jq(id)})">📋 复制卡片</button>`
+ `<button class="btn danger" onclick="memDel(${jq(id)})">删除</button>`
+ `</div></div></div>`;
};
const apexAlb = (typeof RP_APEX !== "undefined") && (getRpCfg().apex !== false) && !!(st && st.migrated3);
const P3alb = apexAlb ? RP_APEX.latestOf(st.profile3) : ((st && st.profile3) || []);
const E3alb = apexAlb ? RP_APEX.latestOf(st.event3) : ((st && st.event3) || []);
const R3alb = apexAlb ? RP_APEX.latestOf(st.record3) : ((st && st.record3) || []);
/* 第 3 项: profile3 relationship 段分段渲染 (stage/boundaries/type/communicationPreferences/currentLocation) */
const relSeg = (p)=>{
const r = p && p.relationship; if(!r) return "";
const parts = [["stage","阶段"],["boundaries","边界"],["type","类型"],["communicationPreferences","沟通偏好"],["currentLocation","当前位置"]]
.filter(kv=>r[kv[0]]).map(kv=>kv[1]+"："+r[kv[0]]);
return parts.length ? `<div class="alb-sub">关系 · ${esc(parts.join("；"))}</div>` : "";
};
/* 第 3 项: event3 结构化字段分段渲染 (老数据缺字段=undefined, 容错跳过) */
const evStruct = (e)=>{
const L = (typeof RP_LOREBOOK !== "undefined") ? RP_LOREBOOK.EVENT_FIELD_LABELS : null;
const keys = ["location","participants","agreements","type","status","emotionalTone","attitudeToUser","relationshipImpact"];
const fb = {location:"地点",participants:"参与者",agreements:"约定与任务",type:"类型",status:"状态",emotionalTone:"情感基调",attitudeToUser:"对用户的态度",relationshipImpact:"关系影响"};
const parts = keys.filter(k=>e && e[k]).map(k=>((L&&L[k])||fb[k])+"："+e[k]);
return parts.length ? `<div class="alb-sub">${esc(parts.join("；"))}</div>` : "";
};
/* 第 4 项: Facts 独立分区 (自动区/手动区, 带分类标签, 可编辑/手动添加) */
const factsHtml = (()=>{
if(!(st && st.migrated3)) return "";
const gf = RP_MEM.getFacts(st), fz = RP_MEM.factsChars(st), fmax = RP_MEM.FACTS_MAX_CHARS;
const factRow = (f)=>`<div class="alb-fact">· <span class="badge">${esc(f.cat||"其他")}</span> ${esc(f.text||"")}`
+ `<div class="btnrow" style="margin-top:6px"><button class="btn ghost" onclick="factForm(${jq(f.id)})">编辑</button><button class="btn danger" onclick="factDel(${jq(f.id)})">删除</button></div></div>`;
const edu = `<div class="facts-edu">角色会留意聊天中的细节——外貌、怪癖、关系等，自动记成事实并随时间更新；你也可以随时编辑或补充。`
+ `<details><summary>原文说明 (C.AI)</summary>`
+ `<div class="facts-en">"Your Characters pay attention. As you chat, they pick up on details about everyone mentioned in the conversation - appearance, quirks, relationships, and more. These facts update automatically over time."</div>`
+ `<div class="facts-en">"You can edit or add facts about Characters whenever you want."</div>`
+ `<div class="facts-en">"Changes are captured automatically, kept up to date, and always editable."</div>`
+ `</details></div>`;
return `<h2 class="sec">事实 Facts</h2><div class="card">${edu}`
+ `<div class="alb-time">自动事实 · ${gf.auto.length} 条（聊天中自动抽取更新）</div>`
+ (gf.auto.map(factRow).join("") || '<div class="empty">多聊几句，事实会自动出现在这里</div>')
+ `<div class="alb-time" style="margin-top:8px">手动事实 · ${gf.manual.length} 条（你亲手添加）</div>`
+ (gf.manual.map(factRow).join("") || '<div class="empty">暂无</div>')
+ `<div class="btnrow" style="margin-top:8px"><button class="btn" onclick="factForm()">+ 添加事实</button></div>`
+ `<div class="hint">事实总字数 ${fz}/${fmax}，超限请删除或缩短一条事实。</div></div>`;
})();
const P3stable = P3alb.filter(p=>!RP_MEM.isFactEntry(p));
const apexHist = (arr, id, fmt)=>{
  if(!apexAlb || typeof RP_APEX === "undefined") return "";
  const vers = RP_APEX.versionsOf(arr || [], id);
  if(vers.length <= 1) return "";
  const olds = vers.slice(0, -1).reverse().map(v=>`<div class="alb-fact" style="opacity:.62">v${v.v||1} · ${esc(fmt(v))}</div>`).join("");
  return `<details class="alb-hist"><summary>历史版本（${vers.length - 1}）</summary>${olds}</details>`;
};
/* Tier2 #14: 事件分型筛选 (对标星野记忆 card kind); Tier2 #10: 永久记忆按钮 */
const kindChips = `<div class="kindchips">` + ["", "事件", "心情", "关系", "初见"].map(k=>
`<button class="kindchip${ALBUM_KIND===k?" on":""}" onclick="albumKindFilter('${jq(k)}')">${k||"全部"}</button>`).join("") + `</div>`;
const E3shown = ALBUM_KIND ? E3alb.filter(e=>RP_MEM.kindLabel(e)===ALBUM_KIND) : E3alb;
const ev3Card = (e)=>{
const kind = RP_MEM.kindLabel(e);
return `<div class="alb-fact">· ${esc((e.t_anchor?e.t_anchor+" ":"")+(e.topic||""))}${e.state?" —— "+esc(e.state):""}${evStruct(e)}`
+ ` <span class="badge">${kind}</span>`
+ (e.perm?` <span class="badge warn">${icon("pin",11)} 永久</span>`:"")
+ `${(e.merged||0)>1?` <span class="badge">合并×${e.merged}</span>`:""}${(e.v||1)>1?` <span class="badge">v${e.v}</span>`:""}`
+ `<div class="btnrow" style="margin-top:6px"><button class="btn ghost" onclick="toggleEventPerm(${jq(e.id)})">${e.perm?"取消永久":"设为永久"}</button></div></div>`
+ apexHist(st.event3,e.id,x=>(x.t_anchor?x.t_anchor+" ":"")+(x.topic||"")+(x.state?" —— "+x.state:""));
};
view.innerHTML = `<button class="back" onclick="albumBack()">${icon("back")} 返回</button>
${muBar}
${memStatusHtml}
<div class="alb-stats">${icon("brain",14)} ${short.length} 条记忆 · ${icon("pin",13)} ${pinned.length} 条置顶 · ${icon("thumb-up",13)} ${up} ${icon("thumb-down",13)} ${dn}</div>`
+ (st && st.mood && st.mood.state
? `<div class="card alb-mood"><div class="alb-time">当前心境</div><div class="alb-fact">${esc(st.mood.state)}${st.mood.filter?" —— "+esc(st.mood.filter):""}</div></div>` : "")
+ ((st && st.migrated3)
? `<h2 class="sec">三库记忆（LeanMem 分流）</h2>`
+ `<div class="card"><div class="alb-time">画像库 · 稳定事实 ${P3stable.length} 条${apexAlb ? "（版本链）" : ""}</div>`
+ (P3stable.map(p=>`<div class="alb-fact">· ${esc(p.text||"")}${relSeg(p)}${(p.v||1)>1?` <span class="badge">v${p.v}</span>`:""}</div>`+apexHist(st.profile3,p.id,x=>x.text||"")).join("")||'<div class="empty">暂无</div>') + `</div>`
+ `<div class="card"><div class="alb-time">事件库 · 带时间锚 ${E3alb.length} 条（可演化合并）${apexAlb ? "（版本链）" : ""}</div>`
+ kindChips
+ (E3shown.slice().reverse().map(e=>ev3Card(e)).join("")||'<div class="empty">暂无</div>') + `</div>`
+ `<div class="card"><div class="alb-time">记录库 · 原文索引 ${R3alb.filter(r=>!r.legacy).length} 条（只追加不改写）${apexAlb ? "（版本链）" : ""}</div>`
+ (R3alb.filter(r=>!r.legacy).slice().reverse().map(r=>`<div class="alb-fact">· ${esc(r.gist||"")}${(r.msg_from||r.msg_to)?` <span style="opacity:.6">（原文 ${esc(r.msg_from||"?")}→${esc(r.msg_to||"")}）</span>`:""}${(r.v||1)>1?` <span class="badge">v${r.v}</span>`:""}</div>`+apexHist(st.record3,r.id,x=>x.gist||"")).join("")||'<div class="empty">暂无</div>') + `</div>`
+ factsHtml
: "")
+ `<div class="hint">记忆日记：聊天中自动抽取的点滴按时间倒序排列；置顶的是永久记忆，AI 永远优先记住。</div>`
+ diarySectionHTML("置顶记忆 · pinned-memories", "pin", pinned, evCard)
+ diarySectionHTML("自动记忆 · auto-memories", "clock", rest, evCard)
+ (st && st.long ? `<h2 class="sec">长远印象</h2><div class="card"><div class="alb-fact">${esc(st.long)}</div></div>` : "")
+ (!short.length && !(st && st.long) ? `<div class="empty"><span class="big">${icon("brain",44)}</span>还没有记忆<br><span style="font-size:calc(12px * var(--fs))">每 ${(getRpCfg().memCycle||10)} 条消息自动整理一次</span><br><button class="btn ghost" style="margin-top:10px" onclick="albumBack()">去聊天产生记忆</button></div>` : "")
+ `<div class="btnrow" style="margin-top:12px"><button class="btn" onclick="memoryNovel()">${icon("book-open")} 转成小说</button><button class="btn ghost" onclick="showNovel3()">${icon("scroll")} 分章小说 · 可改写</button></div>
<div style="height:40px"></div>`;
window.scrollTo(0,0);
}
/* P1-8: Pin 达 30 条时软提示, 不禁止 */
function pinNudge(runId, name){
try{
const ms = RP_MEM.memStats(runId, name);
if(ms.pinned === ms.pinMax)
alert(`置顶记忆已达 ${ms.pinMax} 条, 建议整理不重要的置顶。\n（只是提醒, 不会禁止继续置顶）`);
}catch(e){}
}
window.memPin = (id)=>{
const cur = RP_MEM.togglePin(ALBUM.runId, ALBUM.name, id);
if(cur) pinNudge(ALBUM.runId, ALBUM.name);
renderAlbum();
};
window.memDel = (id)=>{
if(!confirm("删除这条记忆？")) return;
RP_MEM.delItem(ALBUM.runId, ALBUM.name, id);
renderAlbum();
};
/* v36: 自动记忆条目编辑（P0 事件簿"查看/编辑/删除"补齐编辑入口） */
window.memEditForm = (id)=>{
const runId = ALBUM.runId, nm = ALBUM.name;
__backAction = ()=>renderAlbum();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
const st = RP_MEM.get(runId, nm);
const m = ((st && st.short)||[]).find(x=>x.id==id);
if(!m){ alert("记忆不存在"); return; }
titleEl.innerHTML = icon("books")+" 编辑记忆"; subEl.textContent = nm;
view.innerHTML = `<button class="back" onclick="renderAlbum()">${icon("back")} 返回事件簿</button>
<div class="card">
<div class="field"><label>时间</label><input id="me_time" value="${esc(m.time||"")}" placeholder="如：三月初三"></div>
<div class="field"><label>事实${RP_AIFILL.btn("me_fact","关于"+nm+"的记忆事实","一句话，如：她在雨夜把伞给了你","角色"+nm+"；记忆原文：\\n"+(m.fact||""))}</label><textarea id="me_fact" rows="3" placeholder="这条记忆记录的事实">${esc(m.fact||"")}</textarea></div>
<div class="field"><label>此刻看法（可选）</label><input id="me_view" value="${esc(m.view||"")}" placeholder="她/你现在怎么看这件事"></div>
<div class="btnrow"><button class="btn" onclick="memEditSave(${jq(id)})">保存</button></div></div>`;
window.scrollTo(0,0);
};
window.memEditSave = (id)=>{
const r = RP_MEM.editItem(ALBUM.runId, ALBUM.name, id, {
  fact: $("#me_fact").value, view: $("#me_view").value, time: $("#me_time").value});
if(!r.ok){ alert(r.err==="empty" ? "事实内容不能为空。" : "保存失败，请重试。"); return; }
renderAlbum();
};
/* Tier2 #10: 永久记忆切换 (Talkie "Select the event you want Talkie to remember permanently…")。
 * 达上限时用 Talkie 原文 toast。 */
window.toggleEventPerm = (id)=>{
const st = RP_MEM.get(ALBUM.runId, ALBUM.name) || {};
const apexW = (typeof RP_APEX !== "undefined") && RP_MEM.leanmemOn() && RP_APEX.on();
const latest = apexW ? RP_APEX.latestOf(st.event3) : ((st && st.event3) || []);
const hit = latest.filter(e=>e && String(e.id) === String(id))[0];
const r = RP_MEM.setEventPerm(ALBUM.runId, ALBUM.name, id, !(hit && hit.perm));
if(r === "limit") alert(RP_MEM.permLimitMsg());
renderAlbum();
};
/* Tier2 #19: 记忆快照失败 → 手动重试 (用摘要模型对最近消息跑一次分析) */
window.retryMemAnalyze = async ()=>{
const runId = ALBUM.runId, nm = ALBUM.name;
try{
const cfg = getCfg();
const h = getHistSafe(`nd_chat_${runId}_${nm}`);
if(!h.length){ alert("还没有聊天记录"); return; }
const card = RP.findCard(runId, nm) || {};
const hint = (((card.fields||{}).core_traits||"") + " " + ((card.fields||{}).speech_style||"")).trim();
await RP_MEM.maybeAnalyze(runId, nm, h, cfg,
function(c, ms, t){ return RP_NET.complete(c, ms, t); }, hint);
}catch(e){
try{ RP_MEM.setMemStatus(ALBUM.runId, ALBUM.name, "fail"); }catch(e2){}
}
renderAlbum();
};
window.memCopyCard = (id)=>{
const st = RP_MEM.get(ALBUM.runId, ALBUM.name);
const m = ((st && st.short)||[]).find(x=>x.id==id);
if(!m) return;
copyText(`📌 记忆快照 · ${ALBUM.name}\n时间：${m.time||"往事"}\n事实：${m.fact||""}${m.view?"\n此刻看法："+m.view:""}`);
alert("记忆卡片已复制");
};
/* ============ Facts 事实增改删 (第 4 项: 独立产品面, 自动区+手动区, 分类, 2000 字上限) ============ */
window.factForm = (fid)=>{
const runId = ALBUM.runId, nm = ALBUM.name;
__backAction = ()=>renderAlbum();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
const st = RP_MEM.get(runId, nm);
const gf = RP_MEM.getFacts(st);
const all = gf.auto.concat(gf.manual);
const f = (fid != null) ? all.find(x=>x.id==fid) : null;
titleEl.innerHTML = icon("books")+" "+(f?"编辑事实":"添加事实"); subEl.textContent = nm;
const cats = RP_MEM.FACT_CATS.map(c=>`<option value="${c}"${f&&f.cat===c?" selected":""}>${c}</option>`).join("");
view.innerHTML = `<button class="back" onclick="renderAlbum()">${icon("back")} 返回事件簿</button>
<div class="card"><div class="alb-time">Select fact category · 选择事实分类</div>
<div class="field"><label>分类</label><select id="f_cat">${cats}</select></div>
<div class="field"><label>事实内容${RP_AIFILL.btn("f_text","关于"+nm+"的事实","一句话事实，如：她左眉有一颗小痣；可从最近聊天里提炼","角色"+nm+"；最近对话：\n"+RP_AIFILL._recentChatCtx(8,"nd_chat_"+runId+"_"+nm))}</label><input id="f_text" value="${esc(f?(f.text||""):"")}" placeholder="如：她左眉有一颗小痣"></div>
<div class="hint">事实总字数上限 ${RP_MEM.FACTS_MAX_CHARS} 字，当前 ${RP_MEM.factsChars(st)} 字。</div>
<div class="btnrow"><button class="btn" onclick="factSave(${jq(fid==null?"null":fid)})">保存</button></div></div>`;
window.scrollTo(0,0);
};
window.factSave = (fid)=>{
const runId = ALBUM.runId, nm = ALBUM.name;
const opt = {text: $("#f_text").value, cat: $("#f_cat").value};
const r = (fid==null) ? RP_MEM.addFact(runId, nm, opt) : RP_MEM.editFact(runId, nm, fid, opt);
if(!r.ok && r.err === "over"){
alert("事实总字数已达上限（"+RP_MEM.FACTS_MAX_CHARS+"字），请删除或缩短一条事实后再添加。\nYour Story and Facts exceeds allowed text limit, try removing or shortening another fact.");
return;
}
if(!r.ok){ alert("保存失败，请重试。\nFailed to save fact. Please try again."); return; }
alert("Fact saved successfully · 事实已保存");
renderAlbum();
};
window.factDel = (fid)=>{
if(!confirm("确定删除这条事实吗？此操作不可撤销。\nAre you sure you want to delete this Smart Fact? This action cannot be undone.")) return;
RP_MEM.delFact(ALBUM.runId, ALBUM.name, fid);
renderAlbum();
};
/* ============ 记忆转小说 (对标猫箱记忆转小说: 记忆事件 → 小说体阅读) ============ */
window.memoryNovel = ()=>{
const runId = ALBUM.runId, nm = ALBUM.name;
__backAction = ()=>renderAlbum();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
const st = RP_MEM.get(runId, nm);
titleEl.innerHTML = icon("book-open")+" 记忆小说"; subEl.textContent = nm + " · 由记忆整理成篇";
const cnNum = ["一","二","三","四","五","六","七","八","九","十"];
const cn = (i)=> i < 10 ? cnNum[i] : String(i+1);
/* P2: 小说风格模板（白话直叙/古风/戏剧化），选择后写入 AI 润色 prompt */
const nst = (typeof RP_APPEAR!=="undefined") ? RP_APPEAR.getNovelStyle() : "plain";
const chHead = (i, time)=> nst==="gufeng" ? `第${cn(i)}回 · ${esc(time||"往事")}`
  : nst==="drama" ? `场景${cn(i)} · ${esc(time||"往事")}`
  : `第${cn(i)}章 · ${esc(time||"往事")}`;
let body = "";
const short = (st && st.short) || [];
if(short.length){
body = short.map((m,i)=>
`<div class="nov-ch"><div class="nov-chh">${chHead(i, m.time)}</div>`
+ `<div class="nov-p">${esc(m.fact||"")}</div>`
+ (m.view?`<div class="nov-p nov-view">—— ${esc(m.view)}</div>`:"")
+ `</div>`).join("");
} else {
// 无记忆时退化为聊天记录对话体
const h = getHistSafe(`nd_chat_${runId}_${nm}`).slice(-30);
body = h.length ? h.map(m=>{
const who = m.role==="user" ? "我" : nm;
return `<div class="nov-p"><b>${esc(who)}</b>：${esc(m.content)}</div>`;
}).join("") : `<div class="empty">还没有内容可写</div>`;
}
view.innerHTML = `<button class="back" onclick="renderAlbum()">${icon("back")} 返回事件簿</button>
<div class="novel">
<div class="nov-title">${esc(nm)} 的记忆</div>
${st && st.mood && st.mood.state ? `<div class="nov-mood">题记 · ${esc(st.mood.state)}${st.mood.filter?" —— "+esc(st.mood.filter):""}</div>` : ""}
${body}
${st && st.long ? `<div class="nov-ch"><div class="nov-chh">尾声</div><div class="nov-p">${esc(st.long)}</div></div>` : ""}
</div>
<div class="btnrow" style="margin-top:12px"><button class="btn ghost" onclick="exportNovel()">${icon("upload")} 复制全文</button></div>
<div class="card" style="margin-top:12px"><div class="field"><label>小说风格（AI 润色用）</label>
<select id="novelStyle" onchange="RP_APPEAR.setNovelStyle(this.value);memoryNovel()">${(typeof RP_APPEAR!=="undefined"?RP_APPEAR.novelStyleKeys():["plain"]).map(k=>`<option value="${k}"${k===nst?" selected":""}>${RP_APPEAR.MEMNOVEL_STYLES[k].name} · ${RP_APPEAR.MEMNOVEL_STYLES[k].desc}</option>`).join("")}</select></div>
<div class="btnrow"><button class="btn" onclick="novelPolish()">${icon("edit")} AI 按此风格润色成篇</button></div>
<div class="hint">润色会把当前页面文字发给已配置的大模型，按所选风格重写一遍。</div></div>
<div style="height:40px"></div>`;
window.scrollTo(0,0);
};
/* P2: AI 按风格模板润色记忆小说（风格写入 prompt） */
window.novelPolish = async ()=>{
const el = document.querySelector(".novel");
if(!el || !el.innerText.trim()){ alert("没有可润色的内容"); return; }
const cfg = getCfg();
if(!cfg.base || !cfg.key){ alert("请先去「我的 · 设置」配置大模型接口"); return; }
if(!confirm("把全文发给大模型按所选风格润色一遍？")) return;
const style = (typeof RP_APPEAR!=="undefined") ? RP_APPEAR.getNovelStyle() : "plain";
const styleName = (typeof RP_APPEAR!=="undefined") ? RP_APPEAR.MEMNOVEL_STYLES[style].name : "";
const material = el.innerText || "";
el.innerHTML = `<div class="empty">AI 正在以「${esc(styleName)}」风格润色…</div>`;
try{
const prompt = RP_APPEAR.novelStylePrompt(style, material);
const out = await RP_NET.complete({base:cfg.base, key:cfg.key, model:cfg.model},
[{role:"user", content: prompt}], 0.8);
if(out && out.trim()){
const paras = out.trim().split(/\n{2,}|\n/).filter(s=>s.trim());
el.innerHTML = paras.map(p=>`<div class="nov-p">${esc(p.trim())}</div>`).join("");
}else{
alert("润色失败，保留原文"); memoryNovel();
}
}catch(e){ alert("润色失败："+e.message); memoryNovel(); }
};
window.exportNovel = ()=>{
const el = document.querySelector(".novel");
if(!el) return;
copyText(el.innerText);
alert("全文已复制");
};
/* ============ 记忆转小说 · 分章改写 (对标猫箱 novel/*: 生成->分章节->可改写) ============ */
/* 三步: 1 生成章节列表 -> 2 逐章改写正文(先概要后正文) -> 3 阅读 / 导出 TXT; 全本地存储 nd_novel_<chatId> */
let NOV = {runId: null, name: null};
window.showNovel3 = ()=>{
if(typeof RP_NOVEL === "undefined"){ rpToast("小说模块未加载"); return; }
NOV = {runId: ALBUM.runId, name: ALBUM.name};
renderNovel3();
};
function novelChatId(){
/* v37: 群聊/穿越会话的存储键是 nd_group_/nd_travchat_ 格式，硬拼 nd_chat_ 会让
 * "分章小说"对这两类会话永远读到空历史。当前会话匹配时直接复用 chatHistKey()。 */
try{
  if(typeof CHAT !== "undefined" && CHAT && CHAT.runId === NOV.runId && CHAT.name === NOV.name){
    return chatHistKey();
  }
}catch(e){}
return `nd_chat_${NOV.runId}_${NOV.name}`;
}
function novelMaterial(){
const runId = NOV.runId, name = NOV.name;
let facts = "";
try{
const st = RP_MEM.get(runId, name);
facts = ((st && st.short) || []).slice(-20).map(m=>`· ${m.time || "往事"}: ${m.fact || ""}`).join("\n");
}catch(e){}
const h = getHistSafe(novelChatId()).slice(-40);
const hist = h.map(m=>`${m.role === "user" ? "我" : name}: ${m.content}`).join("\n");
let cal = "";
try{
/* B20 同名导入卡串味修复: foreshadow_cal 是纯《红楼梦》蒸馏产物, 非红楼世界
   不注入"故事大事记"(空 = buildMaterial 不拼该段, 不编造) */
if(typeof RP_FORE !== "undefined" && foreAvailableFor(runId, name)){
cal = RP_FORE.all().filter(e=>e.k !== "foreshadowing" && (e.c || []).indexOf(name) >= 0)
.slice(0, 40).map(e=>`第${e.ch}回: ${e.s}`).join("\n");
}
}catch(e){}
return RP_NOVEL.buildMaterial(facts, hist, cal);
}
function novelStatusBadge(ch){
if(ch.status === RP_NOVEL.ST_DONE) return `<span class="badge">已完成</span>`;
if(ch.status === RP_NOVEL.ST_WRITING) return `<span class="badge" style="background:#e3f0ff;color:#2b6cb0">生成中…</span>`;
return `<span class="badge" style="background:#f5e6c8;color:#8a6d2f">概要已出</span>`;
}
function renderNovel3(){
__backAction = ()=>renderAlbum();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
titleEl.innerHTML = icon("scroll") + " 小说工坊";
subEl.textContent = NOV.name + " · 生成→改写→导出";
const novel = RP_NOVEL.getNovel(novelChatId());
let body = "";
if(!novel){
body = `<div class="empty"><span class="big">${icon("scroll",44)}</span>还没有章节规划<br><span style="font-size:calc(12px * var(--fs))">AI 会按聊天记录与记忆事件, 先出章节列表 (标题+梗概), 再逐章扩写正文</span><br>
<button class="btn" style="margin-top:10px" onclick="novelPlan()">✨ 生成章节</button></div>`;
}else{
body = `<div class="card"><div class="name" style="font-size:calc(15px * var(--fs))">${esc(novel.title || "")}</div>
<div class="kv">${novel.chapters.length} 章 · ${novel.chapters.filter(c=>c.status===RP_NOVEL.ST_DONE).length} 章正文已完成</div></div>` +
novel.chapters.map((ch, i)=>`<div class="card">
<div class="row"><div><div class="name" style="font-size:calc(14px * var(--fs))">${/^第.{1,4}章/.test(ch.title||"") ? esc(ch.title) : `第${i + 1}章 · ${esc(ch.title)}`}</div>
<div class="kv">${esc(ch.overview || "")}</div></div>${novelStatusBadge(ch)}</div>
<div class="btnrow" style="margin-top:8px">
<button class="btn ghost" onclick="novelRewriteUI(${jq(i)})">✏️ ${ch.status===RP_NOVEL.ST_DONE?"再次改写":"生成正文"}</button>
${ch.status === RP_NOVEL.ST_DONE ? `<button class="btn ghost" onclick="novelRead()">📖 阅读</button>` : ""}
</div><div id="nrw_${i}"></div></div>`).join("") +
`<div class="btnrow" style="margin-top:12px">
<button class="btn ghost" onclick="if(confirm('重新规划会清空现有章节, 继续?'))novelPlan(true)">🔄 重新规划</button>
<button class="btn ghost" onclick="novelExportTxt()">${icon("download")} 导出 TXT</button>
<button class="btn danger ghost" onclick="if(confirm('删除这本小说?')){RP_NOVEL.delNovel(novelChatId());renderNovel3();}">删除</button>
</div>`;
}
view.innerHTML = `<button class="back" onclick="renderAlbum()">${icon("back")} 返回事件簿</button>
${body}<div style="height:40px"></div>`;
window.scrollTo(0,0);
}
/* 第一步: 生成章节列表 */
window.novelPlan = async (force)=>{
if(typeof RP_NOVEL === "undefined") return;
const cfg = getCfg();
if(!cfg.key || !cfg.base){ alert("先去「我的 · 设置」填 API 地址和 Key"); return; }
const mat = novelMaterial();
if(!mat.trim()){ rpToast("没有足够的聊天记录或记忆可写"); return; }
rpToast("正在规划章节…");
try{
const chapters = await RP_NOVEL.planChapters(mat, NOV.name, cfg,
function(c, ms, t){ return RP_NET.complete(c, ms, t); });
RP_NOVEL.saveNovel(novelChatId(), RP_NOVEL.newNovelDoc(NOV.name, chapters));
rpToast(`已生成 ${chapters.length} 章`);
renderNovel3();
}catch(e){ rpToast("章节规划失败, 请重试"); }
};
/* 第二步: 单章改写 (章节名+概要+一句话指令 -> 重生成正文) */
window.novelRewriteUI = (i)=>{
const box = document.getElementById("nrw_" + i);
if(!box) return;
box.innerHTML = `<div class="field" style="margin-top:8px"><label>改写要求 (可空, 直接点生成=按概要扩写正文)</label>
<input id="nrw_in_${i}" placeholder="如: 写得更悬疑一点, 加一段雨夜对话"></div>
<div class="btnrow"><button class="btn" id="nrw_go_${i}" onclick="novelRewriteDo(${jq(i)})">🚀 生成本章正文</button></div>`;
const inp = document.getElementById("nrw_in_" + i);
if(inp) inp.focus();
};
window.novelRewriteDo = async (i)=>{
const cfg = getCfg();
if(!cfg.key || !cfg.base){ alert("先去「我的 · 设置」填 API 地址和 Key"); return; }
const novel = RP_NOVEL.getNovel(novelChatId());
if(!novel || !novel.chapters[i]){ rpToast("章节不存在"); return; }
const inp = document.getElementById("nrw_in_" + i);
const instruction = inp ? inp.value.trim() : "";
novel.chapters[i].status = RP_NOVEL.ST_WRITING;
RP_NOVEL.saveNovel(novelChatId(), novel);
renderNovel3();
try{
await RP_NOVEL.rewriteChapter(novel, i, instruction, cfg,
function(c, ms, t){ return RP_NET.complete(c, ms, t); });
const nv2 = RP_NOVEL.getNovel(novelChatId()) || novel;
RP_NOVEL.saveNovel(novelChatId(), nv2);
rpToast(`第 ${i + 1} 章正文已生成`);
}catch(e){
const nv3 = RP_NOVEL.getNovel(novelChatId());
if(nv3 && nv3.chapters[i] && nv3.chapters[i].status === RP_NOVEL.ST_WRITING){
nv3.chapters[i].status = nv3.chapters[i].content ? RP_NOVEL.ST_DONE : RP_NOVEL.ST_PLANNED;
RP_NOVEL.saveNovel(novelChatId(), nv3);
}
rpToast("本章生成失败, 请重试");
}
renderNovel3();
};
/* 第三步: 阅读 */
window.novelRead = ()=>{
__backAction = ()=>renderNovel3();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
const novel = RP_NOVEL.getNovel(novelChatId());
if(!novel){ renderNovel3(); return; }
titleEl.innerHTML = icon("book-open") + " " + esc(novel.title || "小说");
subEl.textContent = NOV.name;
const cnNum = ["一","二","三","四","五","六","七","八","九","十"];
view.innerHTML = `<button class="back" onclick="renderNovel3()">${icon("back")} 返回工坊</button>
<div class="novel"><div class="nov-title">${esc(novel.title || "")}</div>` +
novel.chapters.map((ch, i)=>{
const cn = i < 10 ? cnNum[i] : String(i + 1);
const paras = String(ch.content || "(本章正文尚未生成)").split(/\n{2,}|\n/).filter(s=>s.trim());
return `<div class="nov-ch"><div class="nov-chh">第${cn}章 · ${esc(ch.title)}</div>` +
paras.map(p=>`<div class="nov-p">${esc(p.trim())}</div>`).join("") + `</div>`;
}).join("") + `</div>
<div class="btnrow" style="margin-top:12px"><button class="btn ghost" onclick="novelExportTxt()">${icon("download")} 导出 TXT</button></div>
<div style="height:40px"></div>`;
window.scrollTo(0,0);
};
/* 第三步: 导出 TXT (纯文本, EPUB 不做) */
window.novelExportTxt = ()=>{
const novel = RP_NOVEL.getNovel(novelChatId());
if(!novel){ rpToast("还没有小说可导出"); return; }
downloadTxt(`${novel.title || "小说"}.txt`, RP_NOVEL.exportTxt(novel));
rpToast("已导出 TXT");
};
