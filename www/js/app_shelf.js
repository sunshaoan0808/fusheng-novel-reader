/* 浮生 · app 分段 02：书架/产物浏览（书目、人物列表、标签页）+ 红学三项展示
 * v41 从 app.js 原样迁出（原 app.js 第 107–575 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ================= 产物浏览 (原有) ================= */
function showRuns(){
__backAction = null;
titleEl.textContent = "浮生";
subEl.textContent = `${INDEX.length} 个蒸馏任务 · 离线浏览`;
if(!INDEX.length){ view.innerHTML = `<div class="empty">暂无任务</div>`; return; }
/* v42：书架顶部「继续上次」横幅 + 「最近聊过」头像条（无记录时给空态），书封下挂结识进度 */
let _top = "";
try{ _top = shelfTopHTML(); }catch(e){}
view.innerHTML = _top + `<div class="bookwall">` + INDEX.map(r=>{
let _pg = null; try{ _pg = shelfBookProgress(r); }catch(e){}
const cover = (window.BOOKCOVER||{})[r.novel];
const coverHtml = cover
  ? `<img class="bw-cover" src="${esc(cover)}" alt="${esc(r.novel)}封面" loading="lazy" onerror="this.src='bg/book_cover_default.jpg'">`
  : `<div class="bw-cover-default"><img src="bg/book_cover_default.jpg" alt=""><span>${esc(r.novel)}</span></div>`;
return `
<div class="bw-card" onclick="openRun('${jq(r.run_id)}')">
${coverHtml}
<div class="bw-info">
<div class="bw-name">${esc(r.novel)}</div>
<div class="bw-meta">${r.characters.length} 角色${r.has_plot?" · 剧情":""}${r.has_worldcard?" · 世界卡":""}</div>
${_pg?`<div class="bw-prog" role="progressbar" aria-label="已结识 ${_pg.met}/${_pg.total} 人" aria-valuenow="${_pg.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${_pg.pct}%"></i></div><div class="bw-progt">已结识 ${_pg.met}/${_pg.total} 人</div>`:""}
</div>
</div>`;}).join("") + `</div>`;
}

function openRun(runId){
/* P2-4: data.js 截断/损坏时给可读提示（与 boot 一致），不许 TypeError 白屏 */
const D = window.__DATA__;
if(!D || !D.runs){ view.innerHTML = `<div class="empty">数据未生成<br><span style="font-size:calc(12px * var(--fs))">请先运行 snapshot.py</span></div>`; return; }
RUN = D.runs[runId];
if(!RUN){
  /* run 数据按需加载：占位 → ensureRun → 重放本函数；仍缺失才是真缺失 */
  if(guardRun(runId, function(){ openRun(runId); })) return;
  view.innerHTML = `<div class="empty">该任务数据缺失</div>`; return;
}
tabs.classList.remove("hidden");
setTab("chars");
}

function setTab(t, keep){
__backAction = null;
TAB = t;
tabs.querySelectorAll("button").forEach(b=>
b.classList.toggle("active", b.dataset.tab===t));
titleEl.textContent = RUN.novel;
subEl.textContent = `${RUN.run_id} · ${RUN.n_chunks} 块`;
if(t==="chars") showChars();
else if(t==="outline") showOutline();
else if(t==="relations") showRelations();
else if(t==="storyline") showStoryline();
else if(t==="world") showWorldcard();
else showMore();
prependRunBanner();
}
/* 书封面横幅：run 详情各 tab 顶部统一展示（无封面则不展示） */
function prependRunBanner(){
try{
const cover = (window.BOOKCOVER||{})[RUN.novel];
if(!cover || !view) return;
if(view.firstElementChild && view.firstElementChild.classList.contains("runbanner")) return;
view.insertAdjacentHTML("afterbegin",
`<div class="runbanner"><img src="${esc(cover)}" alt="${esc(RUN.novel)}封面" loading="lazy" onerror="this.closest('.runbanner').remove()"></div>`);
}catch(e){}
}
tabs.querySelectorAll("button").forEach(b=>
b.addEventListener("click", ()=>setTab(b.dataset.tab)));

/* 横滑轨道两端渐隐（P0-12 顶部标签行 / P1-23 chips 轨道）。
   纯 CSS 不知道轨道还有没有内容，所以用一个轻量 scroll/resize 监听维护
   .xedge-l / .xedge-r 两个类，由 CSS 变量把 mask 的渐隐长度在 0↔28px 之间切。
   scroll-snap 让一格一格停，触屏不再"滑到一半不知道停哪"。 */
function bindEdgeFade(el, snap){
  if(!el || el.__edgeFadeBound) return;
  el.__edgeFadeBound = true;
  if(snap) el.classList.add("xsnap");
  const upd = ()=>{
    const over = el.scrollWidth - el.clientWidth;
    el.classList.toggle("xedge-l", over > 2 && el.scrollLeft > 2);
    el.classList.toggle("xedge-r", over > 2 && el.scrollLeft < over - 2);
  };
  el.addEventListener("scroll", upd, {passive:true});
  if(typeof ResizeObserver === "function") new ResizeObserver(upd).observe(el);
  setTimeout(upd, 0);
  el.__edgeFadeUpdate = upd;
}
window.bindEdgeFade = bindEdgeFade;
window.refreshEdgeFades = (root)=>{
  (root||document).querySelectorAll("[data-xfade]").forEach(el=>{
    if(el.__edgeFadeUpdate) el.__edgeFadeUpdate();
  });
};
bindEdgeFade(tabs, true);   /* #tabs：6 个标签在 360px 下放不下，"更多"被硬切 */

function tagline(p){
/* 兼容两种档案格式: 红楼 `- **core_identity**: ...` / 水浒 `- core_identity: ...` */
const m = p.md.match(/(?:\*\*)?core_identity(?:\*\*)?:\s*([^\n]+)/)
|| p.md.match(/(?:\*\*)?core_traits(?:\*\*)?:\s*([^\n]+)/);
if(!m) return "";
const s = m[1].trim();
if(s.length <= 46) return s;
/* 按标点截断，避免"门户的…"这种半截词；CSS line-clamp 负责补 … */
const cut = s.slice(0, 46);
const pm = cut.match(/.*[，。；、！？]/);
return pm ? pm[0] : cut;
}
/* Janitor 式角色卡片网格 (v24) */
function charCoverCls(name){ let h=0; const s2=String(name||"?"); for(let i=0;i<s2.length;i++) h=(h*31+s2.charCodeAt(i))>>>0; return "cc"+(h%4); }
/* P2-26：alt 原本一律空串，读屏只会念一串"图片"。有真画像就给名字；
   默认剪影（avatar_default.jpg）是纯装饰 —— 名字就在下方正文里，标 aria-hidden 不重复朗读。
   注：这段注释不能塞进下面 return 的 `+` 链中间 —— 注释两侧的 `+` 会被解析成一元正号。 */
function charCardHTML(o){
return `<div class="charcard">`
+ (o.oncard?`<button type="button" class="charcard-hit" aria-label="${esc(o.name)}" onclick="${o.oncard}"></button>`:"")
+ `<div class="charcover ${charCoverCls(o.name)}">`
+ (o.tag?`<div class="tag">${esc(o.tag)}</div>`:"")
 + (o.img?`<img class="charimg" src="${esc(o.img)}" alt="${esc(o.name)}的画像" loading="lazy" onerror="this.src='bg/avatar_default.jpg'">`
        :`<img class="charimg" src="bg/avatar_default.jpg" alt="" aria-hidden="true">`)
+ `</div>`
+ `<div class="charbody"><div class="n">${esc(o.name)}</div>`
+ (o.stat?`<div class="statline">${esc(o.stat)}</div>`:"")
+ `<div class="s"${o.sum ? ` title="${esc(o.sum)}"` : ""}>${esc(o.sum||"")}</div>`
+ (o.ops?`<div class="ops">${o.ops}</div>`:"")
+ `</div></div>`;
}
// 角色卡画像: 查 window.CHARIMG (www/data/charimg.js), 无图返回 ""
function charImg(novel, name){
const m = window.CHARIMG||{};
return m[(novel||"")+"|"+(name||"")]||"";
}
function charSumFor(runId, name){
try{
if(runId==="custom"){
const c=(RP_WRITER.getCustomChars()||[]).find(x=>x.name===name);
if(c&&c.fields&&c.fields.core_identity) return String(c.fields.core_identity).slice(0,46);
}
const cards=((window.__DATA__&&window.__DATA__.rp_cards)||{})[runId]||[];
const cd=cards.find(x=>x.name===name);
if(cd){ const d=cd.description||cd.personality||""; if(d) return String(d).slice(0,46); }
const run=((window.__DATA__||{}).runs||{})[runId]||{};
const p=(run.profiles||[]).find(x=>x.name===name);
if(p) return tagline(p);
}catch(e){}
return "";
}
function showChars(){
const q = `<div class="searchwrap"><input id="q" placeholder="搜索人物…" oninput="filterChars(this.value)"></div>`;
view.innerHTML = `<div class="btnrow" style="margin-bottom:10px"><button class="btn ghost" onclick="groupPicker()">${icon("users")} 发起群聊</button></div>`
+ q + `<div id="clist">` + charList(RUN.profiles) + `</div>`;
}
/* B8 群聊成员来源。蒸馏 run 走 RUN.profiles; 导入卡组队走 allChars() 里的 imported 卡。
 * 两个入口共用 GROUP_CTX + startGroupChat, 所以 CHAT.runId 不再硬取 RUN.run_id ——
 * 导入卡群聊压根没有 run, CHAT.runId 恒为 "imported", 而 RP.findCard("imported", name)
 * 有专门分支(rp/chat.js), 群聊 prompt / soul / 世界书都能照常解析到卡, 不需要真 run。
 * allChars() 里的其它 runId(蒸馏 runId / custom)不混进来: 群聊只有一个 CHAT.runId,
 * 混编会让 findCard 用错源去查名字。 */
let GROUP_CTX = {runId:null, members:[], label:"", back:null};
/* 群聊可选成员卡片(两个入口共用渲染): pool 已是 {name, novel} 列表 */
function groupPickCards(pool){
  return pool.map(p=>`<label class="pickcard"><input type="checkbox" value="${esc(p.name)}">
${avatarHTML(null, p.name, "sm")}<div class="name">${esc(p.name)}</div>
${p.novel?`<div class="meta">${esc(p.novel)}</div>`:""}</label>`).join("");
}
window.groupPicker = ()=>{
__backAction = ()=>setTab("chars");
GROUP_CTX = {runId: RUN.run_id, members: RUN.profiles.map(p=>p.name), label: RUN.novel, back: ()=>setTab("chars")};
titleEl.textContent = "选择群聊成员"; subEl.textContent = RUN.novel + " · 至少选 2 人";
view.innerHTML = `<button class="back" onclick="setTab('chars')">${icon("back")} 返回人物</button>
<div id="gpick">` + groupPickCards(RUN.profiles.map(p=>({name:p.name, novel:""}))) + `</div>
<div class="field"><label>角色关系（可选，每行一条，格式：A是B的C）${RP_AIFILL.btn("grel_in","群聊角色关系","每行一条，格式：A是B的C，3~6条","群聊成员："+RUN.profiles.map(p=>p.name).join("、")+"；小说《"+RUN.novel+"》")}</label>
<textarea id="grel_in" rows="2" placeholder="林黛玉是贾宝玉的表妹"></textarea></div>
<div class="hint" style="margin:0 0 6px">关系会注入每轮群聊 prompt；建群后也可在群聊抽屉 → 角色关系里增删。</div>
<div class="actionbar"><button class="btn" style="flex:1" onclick="startGroupChat()">开始群聊</button></div>
<div style="height:76px"></div>`;
window.scrollTo(0,0);
};
/* 与其它导入卡组队 (B8): 成员来自 allChars() 里的导入卡, 不依赖任何蒸馏 run。
 * 导入卡之间没有共用的原著产物(静态关系/章节/世界卡), 这里直说 —— 不编造, 也不假装是故障。 */
window.importedGroupPicker = ()=>{
const pool = (allChars() || []).filter(c => c.runId === "imported");
if(pool.length < 2){
__backAction = ()=>showChatPicker();
titleEl.textContent = "与其它导入卡组队"; subEl.textContent = "";
view.innerHTML = `<button class="back" onclick="showChatPicker()">${icon("back")} 返回</button>
<div class="empty">导入卡还不足 2 张<br>
<span style="font-size:calc(12px * var(--fs))">群聊至少需要 2 个角色。去「写卡 / 导入」再加一张。</span>
<br><button class="btn" style="margin-top:10px" onclick="setNav('writer')">去写卡</button></div>`;
window.scrollTo(0,0);
return;
}
__backAction = ()=>showChatPicker();
GROUP_CTX = {runId: "imported", members: pool.map(c=>c.name), label: "导入卡", back: ()=>showChatPicker()};
titleEl.textContent = "与其它导入卡组队"; subEl.textContent = "导入卡 · 至少选 2 张";
view.innerHTML = `<button class="back" onclick="showChatPicker()">${icon("back")} 返回</button>
<div id="gpick">` + groupPickCards(pool) + `</div>
<div class="field"><label>角色关系（可选，每行一条，格式：A是B的C）${RP_AIFILL.btn("grel_in","群聊角色关系","每行一条，格式：A是B的C，3~6条","群聊成员："+pool.map(c=>c.name).join("、")+"；均为导入卡，没有共同原著")}</label>
<textarea id="grel_in" rows="2" placeholder="A是B的师兄"></textarea></div>
<div class="hint" style="margin:0 0 6px">关系会注入每轮群聊 prompt；建群后也可在群聊抽屉 → 角色关系里增删。导入卡之间没有共用的静态人物关系，这里写什么就是什么，AI 不会替你补。</div>
<div class="actionbar"><button class="btn" style="flex:1" onclick="startGroupChat()">开始群聊</button></div>
<div style="height:76px"></div>`;
window.scrollTo(0,0);
};
window.startGroupChat = ()=>{
const sel = Array.from(document.querySelectorAll("#gpick input:checked")).map(i=>i.value);
/* 只认 GROUP_CTX.members 里有的名字: 页面上的复选框就是这些, 但仍做一次交集,
   避免 GROUP_CTX 与 DOM 不同步时把陌生名字写进群成员。 */
const ok = sel.filter(n => GROUP_CTX.members.indexOf(n) >= 0);
if(sel.length < 2){ alert("至少选 2 个人才能群聊"); return; }
if(ok.length !== sel.length){ alert("选中的成员已失效，请重新进入选择"); return; }
if(!GROUP_CTX.runId){ alert("群聊成员来源已失效，请重新进入"); return; }
/* runId 取自 GROUP_CTX（蒸馏 run 的 RUN.run_id, 或导入卡组的 "imported"），不再硬置 */
CHAT = {mode:"group", runId: GROUP_CTX.runId, name:null, members: ok, forcedSpeaker:null};
/* Tier3-22: 建群时可选设定角色关系（"A是B的C" 每行一条），注入群聊 prompt */
try{
const gkey = ok.slice().sort().join("_");
const relText = ((document.getElementById("grel_in")||{}).value || "").trim();
if(relText && typeof RP_GROUP!=="undefined"){
const pr = RP_GROUP.parseRelLines(relText, ok);
pr.ok.forEach(r=>RP_GROUP.addRel(CHAT.runId, gkey, r.a, r.b, r.rel));
if(pr.bad) alert("已设定 " + pr.ok.length + " 条角色关系，" + pr.bad + " 行格式不对被跳过（正确格式：A是B的C）。");
}
}catch(e){}
loadPov();
setNav("chat");
};
function charList(ps){
if(!ps.length) return `<div class="empty"><span class="big">${icon("masks",44)}</span>暂无人物卡</div>`;
return `<div class="chargrid">` + ps.map(p=>{let _st2="";
try{
if(typeof RP_STATS !== "undefined"){
const _s2 = RP_STATS.get(RUN.run_id, p.name);
if(_s2.s > 0) _st2 = "开局" + _s2.s + "次 · 平均" + RP_STATS.avgTurns(_s2).toFixed(0) + "轮/局";
}
}catch(e){}
return charCardHTML({
name:p.name, tag:RUN.novel, img:charImg(RUN.novel, p.name), sum:tagline(p)||"人物档案", stat:_st2,
oncard:`openChar('${jq(p.name)}')`,
ops:`<button class="go" onclick="event.stopPropagation();chatWith('${jq(RUN.run_id)}','${jq(p.name)}')">开聊</button>`
+`<button onclick="event.stopPropagation();openChar('${jq(p.name)}')">详情</button>`
});}).join("") + `</div>`;
}
/* v37: 轻量防抖（角色过滤 / 场景文本）。搜索框保持同步：test_chatsearch 依赖同步语义。 */
function debounce(fn, ms){
  var t = 0;
  return function(){
    var args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function(){ fn.apply(self, args); }, ms);
  };
}
window.filterChars = debounce((kw)=>{
const items = RUN.profiles.filter(p=>p.name.includes(kw));
$("#clist").innerHTML = charList(items);
}, 150);
window.openChar = (name)=>{
__backAction = ()=>setTab("chars");
const p = RUN.profiles.find(x=>x.name===name);
titleEl.textContent = p.name; subEl.textContent = RUN.novel;
const cimg = charImg(RUN.novel, p.name);
view.innerHTML = `<button class="back" onclick="setTab('chars')">${icon("back")} 返回人物</button>
${cimg?`<img class="charhero" src="${esc(cimg)}" alt="${esc(p.name)}画像" onerror="this.remove()">`:""}
<div class="btnrow" style="margin-bottom:10px"><button class="btn ghost" onclick="genPortrait('${jq(RUN.run_id)}','${jq(p.name)}')">${icon("palette")} 生成立绘</button></div>
<div class="card md">${md(p.md)}</div>
${charForetell(p.name)}
<div style="height:76px"></div>
<div class="actionbar"><button class="btn" style="flex:1" onclick="chatWith('${jq(RUN.run_id)}','${jq(p.name)}')">和 ${esc(p.name)} 聊天</button></div>`;
window.scrollTo(0,0);
};

function showOutline(){
const secs = RUN.sections.map((s,i)=>`
<div class="sec-card"><div class="sec-num">${i+1}</div>
<div><div class="t">${esc(s.title)}</div>
<div class="r2">${esc(s.chunk_range||"")}</div></div></div>`).join("");
view.innerHTML = `
${RUN.outline_md?`<div class="card md">${md(RUN.outline_md)}</div>`:""}
<h2 class="sec">分段大纲 · ${RUN.sections.length} 段</h2>
${secs || `<div class="empty">暂无分段大纲</div>`}`;
}

function showRelations(){
view.innerHTML = RUN.relations.map(r=>{
const m = r.metrics||{};
const bar = (label,v)=> v==null?"":`
<div class="kv"><span>${label}</span><span>${Math.round(v*100)}%</span></div>
<div class="meter"><i style="width:${Math.round(v*100)}%"></i></div>`;
const badges = [
r.co_occurrence_count?`<span class="badge">同现 ${r.co_occurrence_count} 次</span>`:"",
(r.valid_chapters&&r.valid_chapters.length)?`<span class="badge">${esc(String(r.valid_chapters[0]))}–${esc(String(r.valid_chapters[r.valid_chapters.length-1]))} 回</span>`:""
].join("");
return `<div class="rel">
<div class="rel-top">
${avatarHTML(null, r.source_character)}
<div style="flex:1"><div class="pair">${esc(r.source_character)} ↔ ${esc(r.target_character)}</div></div>
${avatarHTML(null, r.target_character)}
</div>
<div class="sum">${esc(r.relationship_summary||"")}</div>
${bar("信任",m.trust_level)}${bar("好感",m.affection_level)}${bar("冲突",m.conflict_potential)}
${badges?`<div class="rel-badges">${badges}</div>`:""}
</div>`;
}).join("") || `<div class="empty">暂无关系数据</div>`;
}

/* ============ P0 红学三项展示 (run 侧已蒸馏, App 只做展示, 不进 prompt) ============ */
function methodologyCard(){
if((RUN||{}).run_id !== "honglou_full") return ""; /* P0 红学三项红楼专属 */
const mo = RUN.methodology;
if(!mo) return "";
const layers = (mo.layers||[]).map(l=>`<div class="st">· ${esc(l)}</div>`).join("");
const unc = (mo.uncovered||[]).map(u=>`<span class="badge">${esc(u)}</span>`).join("");
const moFull = `<div class="kv"><span>文本边界</span></div><div class="st">${esc(mo.boundary||"")}</div>
<div class="kv"><span>学派站位</span></div><div class="st">${esc(mo.school||"")}</div>
<div class="kv"><span>三层隔离</span></div>${layers}
<div class="kv"><span>有意不做</span></div><div class="wb-keys">${unc}</div>
<div class="meta">后四十回相关内容一律标注版本边界，不采信情节。</div>`;
return `<div class="card"><div class="name">版本与方法论</div>
<div class="st">前八十回通行本为界，不采程高后四十回；只做人物与情节蒸馏；L1 实证 / L2 引用 / L3 推测三层隔离。</div>
<button class="foldtoggle" onclick="var d=this.nextElementSibling;var h=d.classList.toggle('hidden');this.textContent=h?'展开全文':'收起';return false;">展开全文</button>
<div class="hidden">${moFull}</div></div>`;
}
function foretellHtml(){
if((RUN||{}).run_id !== "honglou_full") return ""; /* P0 红学三项红楼专属 */
const ft = RUN.foretell;
if(!ft || !ft.items || !ft.items.length) return "";
/* 同文本合并展示（如黛玉/宝钗合用一首判词）：只做展示层合并，数据不动 */
const merged = []; const seen = {};
ft.items.forEach(it=>{
const k = (it.text||"").replace(/\s+/g,"");
if(seen[k]){
const m = seen[k];
(it.characters||[]).forEach(c=>{ if(m.characters.indexOf(c)<0) m.characters.push(c); });
m.merged = true;
}else{
const c = Object.assign({}, it, {characters:(it.characters||[]).slice(), merged:false});
seen[k] = c; merged.push(c);
}
});
const items = merged.map(it=>{
const links = (it.foreshadowing_links||[]).length;
const title = it.merged ? it.characters.join("、") + "判词" : (it.title||"");
const note = it.merged ? "" : it.note;
return `<div class="rel"><div class="pair">${esc(title)}</div>
<div class="wb-keys"><span class="badge">${esc(it.type||"")}</span><span class="badge">${esc(it.collection||"")}</span>${links?`<span class="badge">应验链接 ${links}</span>`:""}</div>
<div class="st">${esc(it.text||"").replace(/\n/g,"<br>")}</div>
${note?`<div class="meta">${esc(note)}</div>`:""}</div>`;
}).join("");
return `<h2 class="sec">判词·红楼梦曲 · ${ft.items.length}</h2>`
+ `<div class="meta">曹雪芹原文内置预告（L1 文本实证），判词原文以第五回为准；应验链接指向伏笔条目。</div>` + items;
}
function zhipiHtml(){
if((RUN||{}).run_id !== "honglou_full") return ""; /* P0 红学三项红楼专属 */
const zp = RUN.zhipi;
if(!zp || !zp.items || !zp.items.length) return "";
const items = zp.items.map(it=>{
const beyond = !!it.reveals_beyond_scope;
return `<div class="rel"><div class="st">“${esc(it.text||"")}”</div>
<div class="wb-keys"><span class="badge">${esc(it.edition||"")}</span><span class="badge">${esc(it.chapter_ref||"")}</span>${beyond?`<span class="badge">版本边界</span>`:""}</div>
${(!beyond && it.relates_to)?`<div class="meta">关联：${esc(it.relates_to)}</div>`:""}
${beyond?`<div class="meta">透露八十回后情节，仅收录批语原文，不采信情节。</div>`:""}
${it.note?`<div class="meta">${esc(it.note)}</div>`:""}</div>`;
}).join("");
return `<h2 class="sec">脂批 · ${zp.items.length}</h2>`
+ `<div class="meta">清代脂批原文（公有领域），仅引用，不代表立场；不做身份考证。</div>` + items;
}
/* 人物详情页关联判词 */
function charForetell(name){
if((RUN||{}).run_id !== "honglou_full") return ""; /* P0 红学三项红楼专属 */
const ft = RUN.foretell;
if(!ft || !ft.items) return "";
const mine = ft.items.filter(it=>(it.characters||[]).indexOf(name)>=0);
if(!mine.length) return "";
return `<h2 class="sec">判词·红楼梦曲</h2>` + mine.map(it=>
`<div class="card"><div class="name">${esc(it.title||"")}</div>`
+ `<div class="wb-keys"><span class="badge">${esc(it.type||"")}</span><span class="badge">${esc(it.collection||"")}</span></div>`
+ `<div class="st">${esc(it.text||"").replace(/\n/g,"<br>")}</div></div>`).join("");
}

/* 2026-10-07: 因果事件 DAG 剧情线 (蒸馏管线 event_dag.json, 启发式)。
 * 懒加载 www/data/event_dag_<run_id>.js, 主干路径渲染为时间线。 */
let _dagCache = {};
function showStoryline(){
  const runId = RUN.run_id;
  view.innerHTML = skeletonHTML(3);
  const render = (dag, failed)=>{
    if(!dag || !dag.nodes || !dag.nodes.length){
      /* P2-5: 加载失败 ≠ 确实没有数据，分开文案并给重试 */
      view.innerHTML = failed
        ? `<div class="empty">剧情线数据加载失败<br><span style="font-size:calc(12px * var(--fs))">文件缺失或读取出错</span><br><button class="btn ghost" style="margin-top:10px" onclick="showStoryline()">重试</button></div>`
        : `<div class="empty">暂无剧情线数据</div>`;
      return;
    }
    const byId = {};
    dag.nodes.forEach(n=>{ byId[n.id] = n; });
    const paths = (dag.main_paths || []).slice(0, 3);
    const head = `<div class="card"><div class="kvline"><b>事件节点</b>：${dag.nodes.length} 个</div>`
      + `<div class="kvline"><b>因果边</b>：${(dag.edges || []).length} 条</div>`
      + `<div class="kvline"><b>主干剧情线</b>：${paths.length} 条</div>`
      + `<div style="color:var(--muted,#888);font-size:calc(12px * var(--fs));margin-top:6px">启发式因果图（关键词重叠+转折点加成），非人工定稿</div></div>`;
    const body = paths.map((p, pi)=>{
      const items = p.node_ids.map((nid)=>{
        const n = byId[nid] || {};
        const tp = n.kind === "turning_point";
        return `<div class="tl-item${tp ? " tp" : ""}">`
          + `<div class="tl-dot">${tp ? "◆" : "●"}</div>`
          + `<div class="tl-body"><div class="tl-text">${esc(n.text || "")}</div>`
          + `<div class="tl-meta">${esc(n.chunk_id || "")}${tp ? ' <span class="badge">转折点</span>' : ""}</div>`
          + `</div></div>`;
      }).join("");
      return `<h2 class="sec">主干 ${["一","二","三"][pi] || (pi+1)} · ${p.length} 个事件</h2>`
        + `<div class="tl">${items}</div>`;
    }).join("");
    view.innerHTML = head + body;
    window.scrollTo(0, 0);
  };
  if(_dagCache[runId]){ render(_dagCache[runId]); return; }
  /* file:// 下 fetch 不可用, 用 script 标签动态加载 (export 写 window.__DAG_<run_id>) */
  var gk = "__DAG_" + runId;
  if(window[gk]){ _dagCache[runId] = window[gk]; render(window[gk]); return; }
  var s = document.createElement("script");
  s.src = "data/event_dag_" + encodeURIComponent(runId) + ".js";
  s.onload = function(){ var dag = window[gk] || null; _dagCache[runId] = dag; if(TAB === "storyline") render(dag); };
  s.onerror = function(){ if(TAB === "storyline") render(null, true); };
  document.head.appendChild(s);
}

/* 事件日历懒加载（file:// 下用 script 标签），穿越事件选择器用 */
let _calCache = {};
let _calFailed = {}; /* P2-5: 加载失败标记——区分"加载失败"与"确实没有日历" */
function loadEventCal(runId){
  if(!runId) return Promise.resolve(null);
  if(_calCache[runId]) return Promise.resolve(_calCache[runId]);
  var gk = "__EVENTCAL_" + runId;
  if(window[gk]){ _calCache[runId] = window[gk]; return Promise.resolve(window[gk]); }
  return new Promise(function(resolve){
    var s = document.createElement("script");
    s.src = "data/event_calendar_" + encodeURIComponent(runId) + ".js";
    s.onload = function(){ var cal = window[gk] || null; _calCache[runId] = cal; _calFailed[runId] = false; resolve(cal); };
    s.onerror = function(){ _calFailed[runId] = true; resolve(null); };
    document.head.appendChild(s);
  });
}
/* 2026-10-07: 世界卡 (蒸馏管线 worldcard.json)。
 * 懒加载 www/data/worldcard_<run_id>.js, 渲染世界概览/导演蓝图/世界书检索/次要人物/道具。 */
let _wcCache = {};
let _wcData = null;
let _wcFailed = {}; /* P2-5: 加载失败标记——区分"加载失败"与"确实没有世界卡" */
/* 世界卡懒加载（file:// 下用 script 标签），世界 tab 与导演系统共用 */
function loadWorldcard(runId){
  if(!runId) return Promise.resolve(null);
  /* 导入卡共用 runId="imported", 蒸馏管线只给 __DATA__.runs 里的 run 出 worldcard_*.js,
     这里发请求必然 404。导演与世界 tab 已经走"无蓝图"分支(rp/director.js worldcardBrief),
     短路掉这一次注定失败的 script 加载; 调用点(聊天预热/世界 tab/魂穿开局)一并覆盖。 */
  if(runId === "imported") return Promise.resolve(null);
  var gk = "__WORLDCARD_" + runId;
  if(window[gk]){ _wcCache[runId] = window[gk]; return Promise.resolve(window[gk]); }
  return new Promise(function(res){
    var s = document.createElement("script");
    s.src = "data/worldcard_" + encodeURIComponent(runId) + ".js";
    s.onload = function(){ var wc = window[gk] || null; _wcCache[runId] = wc; res(wc); };
    s.onerror = function(){ _wcFailed[runId] = true; res(null); };
    document.head.appendChild(s);
  });
}
/* P2-5: 世界卡加载失败后的重试——清失败标记与缓存，重新拉一遍 */
window.retryWorldcard = ()=>{
  const runId = RUN && RUN.run_id;
  delete _wcFailed[runId]; delete _wcCache[runId];
  try{ delete window["__WORLDCARD_" + runId]; }catch(e){}
  showWorldcard();
};
function getWorldcard(runId){
  if(!runId) return null;
  return _wcCache[runId] || window["__WORLDCARD_" + runId] || null;
}
