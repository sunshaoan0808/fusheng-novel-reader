/* 浮生 · app 分段 05：世界书编辑、编辑器 token 计数器、正则替换、任务管理
 * v41 从 app.js 原样迁出（原 app.js 第 937–1378 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ================= 世界书编辑 ================= */
/* ============ 编辑器 token 计数器 (对标 C.AI/Janitor: 实时用量条, 80%/100% 两档告警) ============ */
window.tokCount = (inputId, outId)=>{
const ids = Array.isArray(inputId) ? inputId : [inputId];
const out = document.getElementById(outId);
// 注意: RP_PROMPT 是顶层 const, 不挂 window, 用 typeof 判存在
if(!out || typeof RP_PROMPT === "undefined") return;
let txt = "";
ids.forEach(id=>{ const el = document.getElementById(id); if(el) txt += (el.value || "") + "\n"; });
const n = RP_PROMPT.estTokens(txt);
const max = (getRpCfg().maxContext || 8192);
const pct = Math.min(100, Math.round(n / max * 100));
const cls = pct >= 100 ? "over" : (pct >= 80 ? "warn" : "");
out.innerHTML = `<div class="tokbar"><div class="tokbar-fg ${cls}" style="width:${pct}%"></div></div>`
+ `<span class="toknum ${cls}">约 ${n} / ${max} tokens${pct >= 100 ? " · 已超上下文窗口！" : (pct >= 80 ? " · 接近上限" : "")}</span>`;
};
/* 世界书管理器的存储键。导入卡全部共用 runId="imported", 必须按卡隔离, 否则 A 卡
   写的条目会串进 B 卡的 prompt(键规则见 rp/scope.js)。name 省略时退回当前聊天那张卡
   (loreEditor 的调用链上, 聊天抽屉传 CHAT.runId; 产物页传的是蒸馏 RUN.run_id, 天然按书隔离)。 */
const loreNameOf = (runId, name)=> name || ((typeof CHAT !== "undefined" && CHAT && CHAT.runId === runId) ? CHAT.name : null);
const loreKey = (runId, name)=> RP_SCOPE.key("nd_lore_", runId, loreNameOf(runId, name));
const getLore = (runId, name)=>{
  try{ return RP_SCOPE.read(loreKey(runId, name), RP_SCOPE.legacyKey("nd_lore_", runId)); }
  catch(e){ return []; }
};
const saveLore = (runId, arr)=>{
  /* P1-8: 世界书增删改在 inline onclick 里调 saveLore，原先裸抛无提示且中断 renderLoreList */
  try{ RP_SCOPE.write(loreKey(runId), arr); }
  catch(e){ rpToastOnce(isQuotaErr(e) ? "存储空间已满，世界书保存失败" : "世界书保存失败"); }
};
const loreBack = {to:null};
window.loreEditor = (runId, backTo)=>{
__backAction = ()=>loreGoBack();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
loreBack.to = backTo || "more";
const run = ((window.__DATA__||{}).runs||{})[runId]||{};
titleEl.textContent = "世界书管理"; subEl.textContent = (run.novel ? run.novel + " · " : "") + "自建条目进 prompt";
renderLoreList(runId);
};
/* 世界书条目归一化展示 (Janitor schema; 老条目缺字段给默认值) */
function normLore(e, i){
if(typeof RP_LOREBOOK !== "undefined") return RP_LOREBOOK.normalize(e, i);
return {name: e.title||"", key: e.keys||e.trigger_keywords||[], content: e.content||"",
comment: "", keysecondary: [], selectiveLogic: 0, case_sensitive: false, matchWholeWords: true,
minMessages: 0, constant: !!e.constant, enabled: e.enabled!==false, probability: 100, priority: i+1,
inclusionGroup: [], groupWeight: 100, prioritizeInclusion: false, placement: "default",
placementPosition: "after", depth: null};
}
/* v41 空态：世界书条目没写标题时不再满屏「无标题」——依次取 备注 → 第一个触发词 → 正文开头 → 「条目 N」 */
function loreTitle(n, i){
  n = n || {};
  const t = String(n.name || n.title || n.comment || "").trim();
  if(t) return t;
  const k = (Array.isArray(n.key) ? n.key : (Array.isArray(n.keys) ? n.keys : [])).map(x=>String(x||"").trim()).filter(Boolean);
  if(k.length) return k[0];
  const c = String(n.content || "").replace(/\s+/g, " ").trim();
  if(c) return c.length > 14 ? c.slice(0, 14) + "…" : c;
  return "条目 " + ((i|0) + 1);
}
function renderLoreList(runId){
__backAction = ()=>loreGoBack();
const arr = getLore(runId);
view.innerHTML = `<button class="back" onclick="loreGoBack()">${icon("back")} 返回</button>
<div class="btnrow" style="margin-bottom:10px"><button class="btn" onclick="loreForm('${jq(runId)}')">${icon("plus")} 新增条目</button><button class="btn" onclick="importStLore('${jq(runId)}')">导入 ST 世界书</button><button class="btn ghost" onclick="exportStLore('${jq(runId)}')">导出 ST 世界书</button></div>
<div class="hint">自建条目和蒸馏产出的世界书一起参与关键词触发（常驻条目每轮必进），存在本机。列表顺序即优先级（越靠上越强），用 ↑↓ 调整。</div>
${arr.length ? "" : `<div class="empty">还没有世界书条目<br><button class="btn" style="margin-top:10px" onclick="loreForm('${jq(runId)}')">${icon("plus")} 去创建第一条</button></div>`}
${arr.map((e,i)=>{
const n = normLore(e,i);
const grp = (n.inclusionGroup||[]).join("、");
return `<div class="card"><div class="row"><div style="flex:1">
<div class="name">${esc(loreTitle(n,i))} ${n.constant?'<span class="badge warn">常驻</span>':""} ${!n.enabled?'<span class="badge">停用</span>':""}${grp?` <span class="badge">互斥组:${esc(grp)}</span>`:""}</div>
<div class="meta">触发词：${esc((n.key||[]).join("、")||"无")} · P${n.priority} · 概率 ${n.probability}%${n.minMessages?` · ${n.minMessages}条后激活`:""}${n.placement!=="default"?` · 锚定:${esc(n.placement)}`:""} · 约 ${RP_PROMPT.estTokens(n.content||"")} tok</div>
</div></div>
<div class="btnrow" style="margin-top:8px">
<button class="btn ghost" onclick="loreMove('${jq(runId)}',${jq(i)},-1)"${i===0?" disabled":""}>↑</button>
<button class="btn ghost" onclick="loreMove('${jq(runId)}',${jq(i)},1)"${i===arr.length-1?" disabled":""}>↓</button>
<button class="btn ghost" onclick="loreForm('${jq(runId)}',${jq(i)})">编辑</button>
<button class="btn ghost" onclick="loreToggle('${jq(runId)}',${jq(i)})">${!n.enabled?"启用":"停用"}</button>
<button class="btn danger" onclick="loreDel('${jq(runId)}',${jq(i)})">删除</button>
</div></div>`;}).join("") || `<div class="empty">还没有自建条目<br><button class="btn" style="margin-top:10px" onclick="loreForm('${jq(runId)}')">新增第一条</button></div>`}`;
window.scrollTo(0,0);
}
/* 上移/下移: 交换位置后重算 priority=index+1 (Janitor: priority 由排序派生, 无数字输入框) */
window.loreMove = (runId, i, dir)=>{
const a = getLore(runId);
const j = i + dir;
if(j < 0 || j >= a.length) return;
const t = a[i]; a[i] = a[j]; a[j] = t;
a.forEach((e, k)=>{ e.priority = k + 1; });
saveLore(runId, a); renderLoreList(runId);
};
window.loreGoBack = ()=>{ loreBack.to==="chat" ? showChat() : setTab("more"); };
window.loreToggle = (runId, i)=>{ const a = getLore(runId); a[i].enabled = a[i].enabled===false ? true : false; saveLore(runId, a); renderLoreList(runId); };
/* SillyTavern 世界书(JSON, entries 字典) -> 本机条目 (字段映射见 RP_LOREBOOK.importST, 规格 1.5) */
/* 老兜底: RP_LOREBOOK 未加载时用 */
function stLoreToEntries(d){
var raw = d && d.entries;
if(!raw) return null;
var list = Array.isArray(raw) ? raw : Object.keys(raw).map(function(k){ return raw[k]; });
var out = [];
list.forEach(function(e){
if(!e || !e.content) return;
var keys = (e.key||[]).concat(e.keysecondary||[]).map(function(x){ return String(x||"").trim(); }).filter(Boolean);
out.push({title: (e.comment||"").trim() || keys[0] || (String(e.content).replace(/\s+/g," ").trim().slice(0,14) || "无标题"), keys: keys,
content: String(e.content), priority: 60,
constant: !!e.constant, enabled: !e.disable, id: "st"+Date.now()+Math.floor(Math.random()*1e6)});
});
return out.length ? out : null;
}
window.importStLore = (runId)=>{
const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
inp.onchange = ()=>{
const f = inp.files[0]; if(!f) return;
const rd = new FileReader();
rd.onload = ()=>{
try{
const d = JSON.parse(rd.result);
const es = (typeof RP_LOREBOOK !== "undefined") ? RP_LOREBOOK.importST(d) : stLoreToEntries(d);
if(!es){ alert("解析失败: 不是 ST 世界书格式"); return; }
let a = getLore(runId); es.forEach(function(e){ a.push(e); });
if(typeof RP_LOREBOOK !== "undefined") a = RP_LOREBOOK.normalizeAll(a);
saveLore(runId, a); renderLoreList(runId);
alert("已导入 " + es.length + " 条世界书");
}catch(e){ alert("解析失败: " + e.message); }
};
rd.readAsText(f);
};
inp.click();
};
/* ST 正则导出(JSON 数组): stRuleToScript, 与 stRegexToRules 互逆, 可导回 ST */
window.exportStRegex = ()=>{
const a = getRegexUI(RX_CTX.runId, RX_CTX.name);
if(!a.length){ rpToast("没有可导出的正则规则"); return; }
downloadJson("regex_st.json", a.map(stRuleToScript));
rpToast(`已导出 ${a.length} 条正则 (ST 格式)`);
};
window.loreDel = (runId, i)=>{ if(!confirm("删除这条世界书？")) return; const a = getLore(runId); a.splice(i,1); saveLore(runId, a); renderLoreList(runId); };
/* ST 世界书导出(JSON): RP_LOREBOOK.exportST 的逆操作, 可导回 ST */
window.exportStLore = (runId)=>{
if(typeof RP_LOREBOOK === "undefined" || !RP_LOREBOOK.exportST){ rpToast("世界书模块未加载"); return; }
const a = getLore(runId);
if(!a.length){ rpToast("没有可导出的世界书条目"); return; }
downloadJson("lorebook_st.json", RP_LOREBOOK.exportST(a));
rpToast(`已导出 ${a.length} 条世界书 (ST 格式)`);
};
window.loreForm = (runId, i)=>{
__backAction = ()=>renderLoreList(runId);
const _ll = getLore(runId);
const _isNew = (i==null || !_ll[i]);
const n = normLore(_isNew ? {} : _ll[i], (i==null ? _ll.length : i));
const grpStr = (n.inclusionGroup||[]).join("、");
const logicOpts = [[0,"AND ANY（任一次级命中即纳入）"],[1,"NOT ALL（次级全命中才排除）"],[2,"NOT ANY（任一次级命中即排除）"],[3,"AND ALL（次级全命中才纳入）"]]
.map(o=>`<option value="${o[0]}"${n.selectiveLogic===o[0]?" selected":""}>${o[1]}</option>`).join("");
const placeOpts = [["default","默认（世界书段）"],["personality","人设段"],["scenario","场景段"],["exampleDialogs","示例对话段"]]
.map(o=>`<option value="${o[0]}"${n.placement===o[0]?" selected":""}>${o[1]}</option>`).join("");
titleEl.textContent = (_isNew?"新增":"编辑") + "世界书条目"; subEl.textContent = "";
/* AI 帮填上下文：小说名 */
const _loreNovel = ((((window.__DATA__||{}).runs||{})[runId]||{}).novel)||"";
const _loreCtx = "世界书条目" + (_loreNovel?("，出自小说《"+_loreNovel+"》"):"") + "；条目内容会被注入 AI 的 prompt";
view.innerHTML = `<button class="back" onclick="renderLoreList('${jq(runId)}')">${icon("back")} 返回列表</button>
<div class="field"><label>标题${RP_AIFILL.btn("l_title","世界书条目标题","2~8个字的人物名/地点名/势力名/物品名",_loreCtx)}</label><input id="l_title" value="${esc(n.name||"")}"></div>
<div class="field"><label>触发词（逗号/顿号分隔，消息里出现即触发；可用 /正则/flags 写法）${RP_AIFILL.btn("l_keys","世界书触发词","逗号/顿号分隔；根据标题联想读者聊天时可能提到的相关词，5~12个",_loreCtx)}</label><input id="l_keys" value="${esc((n.key||[]).join("、"))}" placeholder="如：大观园、贾府"></div>
<div class="field"><label>内容（进 prompt 的正文）${RP_AIFILL.btn("l_content","世界书内容","100~300字的设定正文，客观叙述、设定向",_loreCtx)}</label><textarea id="l_content" oninput="tokCount('l_content','l_tok')" style="width:100%;min-height:120px;background:#100e0b;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:10px">${esc(n.content||"")}</textarea><div class="tokline" id="l_tok"></div></div>
<div class="field"><label>优先级：第 ${n.priority} 位（在列表用 ↑↓ 调整顺序，越靠上越强）</label></div>
<div class="field"><label><input type="checkbox" id="l_const" style="width:auto" ${n.constant?"checked":""}> 常驻条目（每轮必进 prompt）</label></div>
<div class="field"><label><input type="checkbox" id="l_en" style="width:auto" ${n.enabled?"":"checked"}> 启用</label></div>
<details class="card" style="margin-top:4px"><summary style="cursor:pointer;padding:4px">高级选项（触发概率 / 互斥组 / 次级关键词 / 插入位置…）</summary>
<div style="padding:6px 2px">
<div class="field"><label>触发概率 %（0-100，掷骰决定是否注入）</label><input id="l_prob" type="number" min="0" max="100" step="1" value="${n.probability}"></div>
<div class="field"><label>最小消息数（N 条消息后才激活，0=立即）</label><input id="l_minmsg" type="number" min="0" step="1" value="${n.minMessages||0}"></div>
<div class="field"><label><input type="checkbox" id="l_case" style="width:auto" ${n.case_sensitive?"checked":""}> 区分大小写（对正则键无效）</label></div>
<div class="field"><label><input type="checkbox" id="l_whole" style="width:auto" ${n.matchWholeWords?"checked":""}> 整词匹配（king 不匹配 liking）</label></div>
<div class="field"><label>次级关键词（逗号/顿号分隔；用于纳入或排除）${RP_AIFILL.btn("l_keys2","世界书次级关键词","逗号分隔；补充的精细控制关键词，5~10个",_loreCtx)}</label><input id="l_keys2" value="${esc((n.keysecondary||[]).join("、"))}"></div>
<div class="field"><label>次级关键词逻辑</label><select id="l_logic">${logicOpts}</select></div>
<div class="field"><label>互斥组（逗号分隔；同组每次只激活一条）</label><input id="l_group" value="${esc(grpStr)}" placeholder="如：combat、social"></div>
<div class="field"><label>组内权重（同组随机挑选时的权重）</label><input id="l_gweight" type="number" min="1" step="1" value="${n.groupWeight||100}"></div>
<div class="field"><label><input type="checkbox" id="l_prioin" style="width:auto" ${n.prioritizeInclusion?"checked":""}> 组内按插入顺序而非权重挑选</label></div>
<div class="field"><label>插入位置（锚定到对应 prompt 段）</label><select id="l_place">${placeOpts}</select>
<select id="l_placepos" style="margin-top:6px"><option value="after"${n.placementPosition!=="before"?" selected":""}>该段之后</option><option value="before"${n.placementPosition==="before"?" selected":""}>该段之前</option></select></div>
<div class="field"><label>扫描深度（检测最近 N 条消息，1-10，空=默认 4）</label><input id="l_depth" type="number" min="1" max="10" value="${n.depth||""}" placeholder="默认"></div>
<div class="field"><label>备注（不进 prompt，仅自己看）${RP_AIFILL.btn("l_comment","世界书备注","一句话说明这条条目的用途，仅自己看",_loreCtx)}</label><input id="l_comment" value="${esc(n.comment||"")}"></div>
</div></details>
<div class="btnrow"><button class="btn" onclick="loreSave('${jq(runId)}',${jq(i==null?"null":i)})">保存</button></div>`;
tokCount("l_content","l_tok");
window.scrollTo(0,0);
};
window.loreSave = (runId, i)=>{
const splitKeys = (v)=> v.split(/[，,、]/).map(x=>x.trim()).filter(Boolean);
const keys = splitKeys($("#l_keys").value);
const keys2 = splitKeys($("#l_keys2").value);
const grp = splitKeys($("#l_group").value);
let prob = parseInt($("#l_prob").value); if(!isFinite(prob)) prob = 100; prob = Math.min(100, Math.max(0, prob));
let minmsg = parseInt($("#l_minmsg").value); if(!isFinite(minmsg) || minmsg < 0) minmsg = 0;
let gw = parseInt($("#l_gweight").value); if(!isFinite(gw) || gw < 1) gw = 100;
let depth = parseInt($("#l_depth").value); if(!isFinite(depth)) depth = null; else depth = Math.min(10, Math.max(1, depth));
const a = getLore(runId);
const e = {id: ((i==null || !a[i]) ? "u"+Date.now() : (a[i].id || "u"+Date.now())),
name: $("#l_title").value.trim()||"无标题", key: keys, content: $("#l_content").value.trim(),
comment: $("#l_comment").value.trim(), enabled: $("#l_en").checked, constant: $("#l_const").checked,
probability: prob, minMessages: minmsg, case_sensitive: $("#l_case").checked,
matchWholeWords: $("#l_whole").checked, keysecondary: keys2,
selectiveLogic: parseInt($("#l_logic").value)||0, inclusionGroup: grp, groupWeight: gw,
prioritizeInclusion: $("#l_prioin").checked, placement: $("#l_place").value,
placementPosition: $("#l_placepos").value, depth: depth,
priority: (i==null ? a.length+1 : i+1)};
if(!e.content){ alert("内容不能为空"); return; }
if(i==null) a.push(e); else a[i] = e;
saveLore(runId, a); renderLoreList(runId);
if(i==null) achvUnlock("lore_1");
};

/* ================= 正则替换 ================= */
const regexKey = (runId, name)=> `nd_regex_${runId}_${name}`;
const getRegexUI = (runId, name)=>{ try{return JSON.parse(localStorage.getItem(regexKey(runId,name)))||[]}catch(e){return[]}};
const saveRegexUI = (runId, name, arr)=>{ try{ localStorage.setItem(regexKey(runId,name), JSON.stringify(arr)); }catch(e){ try{ rpToastOnce(isQuotaErr(e) ? "存储空间已满，正则替换未保存" : "正则替换保存失败"); }catch(_){} } };
const regexBack = {to:null};
window.regexEditor = (runId, name, backTo)=>{
__backAction = ()=>regexGoBack();
RX_CTX.runId = runId; RX_CTX.name = name;
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
regexBack.to = backTo || "chat";
const names = name ? [name] : [];
renderRegexList(runId, names[0]||"");
};
/* S 级补全: 穿越抽屉的正则入口。魂穿按被附身角色名, 肉身/异世界按世界名存规则 */
window.travRegexEditor = ()=>{
const trav = (typeof RP_TRAVERSE !== "undefined") ? RP_TRAVERSE.get(CHAT.travId) : null;
if(!trav){ rpToast("穿越会话不存在"); return; }
const name = (typeof travRegexName === "function") ? travRegexName(trav)
  : ((trav.mode === "soul" && trav.charName) ? trav.charName : (trav.worldName || "穿越"));
regexEditor("trav", name, "trav");
};
function regexCharSel(runId, cur){
if(regexBack.to === "trav") return ""; /* 穿越: 角色固定, 不显示角色选择 */
const ms = (CHAT.mode==="group") ? CHAT.members : (CHAT.name ? [CHAT.name] : []);
if(!ms.length) return "";
return `<div class="field"><label>角色</label><select id="rx_char" onchange="renderRegexList('${jq(runId)}',this.value)">`
+ ms.map(n=>`<option value="${esc(n)}" ${n===cur?"selected":""}>${esc(n)}</option>`).join("") + `</select></div>`;
}
window.renderRegexList = (runId, name)=>{
__backAction = ()=>regexGoBack();
if(!name){ const ms=(CHAT.mode==="group")?CHAT.members:(CHAT.name?[CHAT.name]:[]); name = ms[0]||""; }
titleEl.textContent = "正则替换"; subEl.textContent = (name? name+" · ":"") + "只做查找替换，不执行代码";
const arr = name ? getRegexUI(runId, name) : [];
view.innerHTML = `<button class="back" onclick="regexGoBack()">${icon("back")} 返回</button>
${regexCharSel(runId, name)}
<div class="btnrow" style="margin-bottom:10px"><button class="btn" onclick="importStRegex()">${icon("download")} 导入 ST 脚本</button><button class="btn ghost" onclick="exportStRegex()">导出 ST 脚本</button><button class="btn" onclick="regexForm('${jq(runId)}','${jq(name)}')">${icon("plus")} 新增规则</button></div>
<div class="hint">AI 回复发出前按顺序执行：查找（正则）→ 替换为。如把"好的"替换成"好"，或统一口头禅。非法正则会被跳过。</div>
${arr.map((r,i)=>`
<div class="card">${r.name?`<div class="kv" style="color:var(--gold)">${esc(r.name)}${r.flags&&r.flags!=="g"?` <span style="color:var(--ink-faint)">/${esc(r.flags)}</span>`:""}</div>`:""}<div class="name" style="font-size:calc(13px * var(--fs))">${esc(r.find||"")} <span style="color:var(--ink-faint)">→</span> ${esc(String(r.replace||"")).slice(0,60)}</div>
<div class="meta">${r.enabled===false?"停用":"启用"}${r.markdownOnly?` · <span class="badge">markdown显示时</span>`:""}${r.promptOnly&&!r.markdownOnly?` · <span class="badge">纯prompt(不执行)</span>`:""}${r.minDepth!=null?` · 深度≥${r.minDepth}`:""}${r.maxDepth!=null?` · 深度≤${r.maxDepth}`:""}</div>
<div class="btnrow" style="margin-top:8px">
<button class="btn ghost" onclick="regexForm('${jq(runId)}','${jq(name)}',${jq(i)})">编辑</button>
<button class="btn ghost" onclick="regexToggle('${jq(runId)}','${jq(name)}',${jq(i)})">${r.enabled===false?"启用":"停用"}</button>
<button class="btn danger" onclick="regexDel('${jq(runId)}','${jq(name)}',${jq(i)})">删除</button>
</div></div>`).join("") || `<div class="empty">还没有规则</div>`}`;
window.scrollTo(0,0);
};
window.regexGoBack = ()=>{ showChat(); };
window.regexToggle = (runId, name, i)=>{ const a=getRegexUI(runId,name); a[i].enabled = a[i].enabled===false?true:false; saveRegexUI(runId,name,a); renderRegexList(runId,name); };
window.regexDel = (runId, name, i)=>{ if(!confirm("删除这条规则？")) return; const a=getRegexUI(runId,name); a.splice(i,1); saveRegexUI(runId,name,a); renderRegexList(runId,name); };
let RX_CTX = {runId:null, name:null};
/* SillyTavern 正则脚本 -> 本机规则。
 * ST 语义(源码 public/scripts/extensions/regex/engine.js 实证):
 * placement: 1=用户输入, 2=AI输出, 3=斜杠命令, 5=世界书, 6=推理块。
 * 本机只处理 AI 输出显示: 要求 placement 含 2。
 * markdownOnly: 只在 markdown 显示路径执行(本机气泡是 markdown 渲染, 视为显示路径);
 * promptOnly: 只在 prompt 构建时执行, 本机无此路径, 跳过并注明。
 * minDepth/maxDepth: 按 depth 过滤(新回复 depth=0), 字段保留。
 * 支持单个脚本对象或数组( ST 可导出多个)。 */
function stRegexToRule(d){
if(!d || typeof d.findRegex !== "string") return null;
const placement = d.placement || [2];
if(placement.indexOf(2) < 0) return null;
let find = d.findRegex, flags = "g";
const m = d.findRegex.match(/^\/(.*)\/([a-z]*)$/s);
if(m){ find = m[1]; flags = ((m[2]||"").replace(/g/g,"")) + "g"; }
try{ new RegExp(find, flags); }catch(e){ return null; }
return {name: d.scriptName || "ST 导入", find: find, flags: flags,
replace: d.replaceString != null ? d.replaceString : "", enabled: !d.disabled,
markdownOnly: !!d.markdownOnly, promptOnly: !!d.promptOnly,
minDepth: (d.minDepth == null ? null : +d.minDepth),
maxDepth: (d.maxDepth == null ? null : +d.maxDepth),
trimStrings: Array.isArray(d.trimStrings) ? d.trimStrings : [],
runOnEdit: !!d.runOnEdit};
}
function stRegexToRules(d){
const list = Array.isArray(d) ? d : [d];
const out = [];
list.forEach(function(x){ const r = stRegexToRule(x); if(r) out.push(r); });
return out;
}
/* 本机正则规则 -> ST 正则脚本 (stRegexToRule 的逆操作)。
 * findRegex 写成 /find/flags 形式(ST 经典写法); placement 固定 [2](AI 输出,
 * 本机正则只处理 AI 输出显示路径)。 */
function stRuleToScript(r){
r = r || {};
return {scriptName: r.name || "novel-reader",
findRegex: "/" + (r.find || "") + "/" + (r.flags || "g"),
replaceString: r.replace != null ? r.replace : "",
disabled: r.enabled === false,
placement: [2],
markdownOnly: !!r.markdownOnly,
promptOnly: !!r.promptOnly,
minDepth: (r.minDepth == null ? null : +r.minDepth),
maxDepth: (r.maxDepth == null ? null : +r.maxDepth),
trimStrings: Array.isArray(r.trimStrings) ? r.trimStrings : [],
runOnEdit: !!r.runOnEdit};
}
window.importStRegex = ()=>{
const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
inp.onchange = ()=>{
const f = inp.files[0]; if(!f) return;
const rd = new FileReader();
rd.onload = ()=>{
try{
const d = JSON.parse(rd.result);
const rs = stRegexToRules(d);
if(!rs.length){ alert("解析失败: 不是 ST 正则脚本, 或没有作用于 AI 输出的脚本(本机正则只处理 AI 输出显示)"); return; }
const purePrompt = rs.filter(r=>r.promptOnly && !r.markdownOnly).length;
const a = getRegexUI(RX_CTX.runId, RX_CTX.name);
rs.forEach(function(r){ a.push(r); });
saveRegexUI(RX_CTX.runId, RX_CTX.name, a); renderRegexList(RX_CTX.runId, RX_CTX.name);
alert("已导入 " + rs.length + " 条正则" + (purePrompt ? "；其中 " + purePrompt + " 条为纯 promptOnly(只在 prompt 构建时执行)，本机无此路径，已保留但不执行" : ""));
}catch(e){ alert("解析失败: " + e.message); }
};
rd.readAsText(f);
};
inp.click();
};
window.regexForm = (runId, name, i)=>{
__backAction = ()=>renderRegexList(runId, name);
const _rl = getRegexUI(runId, name);
const r = (i==null || !_rl[i]) ? {find:"", replace:"", enabled:true} : _rl[i];
titleEl.textContent = (i==null?"新增":"编辑")+"正则规则"; subEl.textContent = name;
view.innerHTML = `<button class="back" onclick="renderRegexList('${jq(runId)}','${jq(name)}')">${icon("back")} 返回列表</button>
<div class="field"><label>查找（正则表达式）${RP_AIFILL.btn("x_find","正则查找式","用自然语言描述想匹配的文本，只输出正则表达式本身，不要解释","文本替换规则")}</label><input id="x_find" value="${esc(r.find||"")}" placeholder="如：好的|嗯嗯"></div>
<div class="field"><label>替换为（可用 $1 引用分组）${RP_AIFILL.btn("x_rep","正则替换文本","写替换后的文本，可用 $1 $2 引用分组，只输出替换文本","文本替换规则；查找式："+(r.find||"（未填）"))}</label><input id="x_rep" value="${esc(r.replace||"")}" oninput="tokCount('x_rep','x_tok')"><div class="tokline" id="x_tok"></div></div>
<div class="field"><label><input type="checkbox" id="x_en" style="width:auto" ${r.enabled===false?"":"checked"}> 启用</label></div>
<div class="btnrow"><button class="btn" onclick="regexSave('${jq(runId)}','${jq(name)}',${jq(i==null?"null":i)})">保存</button></div>`;
tokCount("x_rep","x_tok");
window.scrollTo(0,0);
};
window.regexSave = (runId, name, i)=>{
const find = $("#x_find").value;
if(!find){ alert("查找不能为空"); return; }
try{ new RegExp(find); }catch(e){ alert("正则写错了："+e.message); return; }
const r = {find, replace: $("#x_rep").value, enabled: $("#x_en").checked};
const a = getRegexUI(runId, name);
if(i==null) a.push(r); else a[i] = r;
saveRegexUI(runId, name, a); renderRegexList(runId, name);
};
/* ================= 任务管理 ================= */
const TASKS_KEY = "nd_tasks_v1";
const getTasks = ()=>{ try{return JSON.parse(localStorage.getItem(TASKS_KEY))||[]}catch(e){return[]}};
const saveTasks = (t)=>{ try{ localStorage.setItem(TASKS_KEY, JSON.stringify(t)); }catch(e){ try{ rpToastOnce(isQuotaErr(e) ? "存储空间已满，任务未保存" : "任务保存失败"); }catch(_){} } };

function showTasks(){
__backAction = null;
titleEl.textContent = "蒸馏任务";
subEl.textContent = "手机上排队, 发给 Muse 去跑";
const ts = getTasks();
view.innerHTML = `
<div class="btnrow"><button class="btn" onclick="taskForm()">＋ 新建任务</button></div>
<div class="hint">手机跑不了蒸馏 (要调大模型)。在这里把"想跑什么"记下来,
一键复制发给 Muse, 跑完后新版 App 会带上产物。</div>
<div id="tlist">${taskList(ts)}</div>`;
}
function taskList(ts){
return ts.map(t=>`
<div class="card task">
<div class="name">${esc(t.novel)}<span class="st">排队中</span></div>
<div class="meta">${esc(t.id)} · ${esc(t.created_at)}</div>
<div style="margin-top:6px">${(t.characters||[]).map(c=>`<span class="badge">${esc(c)}</span>`).join("")}</div>
${t.scope_chapters?`<div class="meta">章节: ${esc(t.scope_chapters)}</div>`:""}
${t.scope_scenes?`<div class="meta">场景: ${esc(t.scope_scenes)}</div>`:""}
${t.note?`<div class="meta">备注: ${esc(t.note)}</div>`:""}
<div class="btnrow">
<button class="btn ghost" onclick="copyTask('${jq(t.id)}')">复制发给 Muse</button>
<button class="btn danger" onclick="delTask('${jq(t.id)}')">删除</button>
</div>
</div>`).join("") || `<div class="empty">还没有任务, 点上面新建一个</div>`;
}
window.taskForm = ()=>{
__backAction = ()=>showTasks();
titleEl.textContent = "新建蒸馏任务"; subEl.textContent = "";
view.innerHTML = `
<div class="field"><label>小说名</label><input id="f_novel" placeholder="如: 红楼梦"></div>
<div class="field"><label>人物 (逗号分隔)</label><input id="f_chars" placeholder="如: 贾宝玉,林黛玉"></div>
<div class="field"><label>章节范围 (可选, 如 1-10)</label><input id="f_chapters" placeholder="留空=全书"></div>
<div class="field"><label>场景关键词 (可选)</label><input id="f_scenes" placeholder="如: 大观园"></div>
<div class="field"><label>备注 (可选)</label><textarea id="f_note" placeholder="其他要求…"></textarea></div>
<div class="btnrow">
<button class="btn" onclick="saveTask()">保存到队列</button>
<button class="btn ghost" onclick="showTasks()">取消</button>
</div>`;
};
window.saveTask = ()=>{
const v = (id)=> $(id).value.trim();
const novel = v("#f_novel");
if(!novel){ alert("请填小说名"); return;}
const ts = getTasks();
const t = {
id: "task-" + Date.now().toString(36),
novel,
characters: v("#f_chars").split(/[,，、]/).map(s=>s.trim()).filter(Boolean),
scope_chapters: v("#f_chapters"),
scope_scenes: v("#f_scenes"),
note: v("#f_note"),
status: "queued",
created_at: new Date().toLocaleString("zh-CN",{hour12:false}),
};
ts.unshift(t); saveTasks(ts); showTasks();
};
window.delTask = (id)=>{
if(!confirm("删除这个任务?")) return;
saveTasks(getTasks().filter(t=>t.id!==id)); showTasks();
};
window.copyTask = (id)=>{
const t = getTasks().find(x=>x.id===id);
if(!t) return;
const lines = [`帮我跑个蒸馏任务:`, `小说: ${t.novel}`];
if(t.characters.length) lines.push(`人物: ${t.characters.join(",")}`);
if(t.scope_chapters) lines.push(`章节范围: ${t.scope_chapters}`);
if(t.scope_scenes) lines.push(`场景: ${t.scope_scenes}`);
if(t.note) lines.push(`备注: ${t.note}`);
copyText(lines.join("\n"), "已复制, 去聊天里发给 Muse 吧");
};
function copyText(text, okMsg){
const done = ()=>alert(okMsg||"已复制");
if(navigator.clipboard && navigator.clipboard.writeText){
navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text, done));
}else fallbackCopy(text, done);
}
function fallbackCopy(text, done){
const ta = document.createElement("textarea");
ta.value = text; ta.style.position="fixed"; ta.style.opacity="0";
document.body.appendChild(ta); ta.select();
try{ document.execCommand("copy"); done();}catch(e){ alert("复制失败, 请手动长按复制");}
document.body.removeChild(ta);
}

