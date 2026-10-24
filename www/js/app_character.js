/* 浮生 · app 分段 17：角色详情页（落地页、卡片档案、人物弧光）
 * v41 从 app.js 原样迁出（原 app.js 第 5514–6133 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ============ 角色详情多 Tab (对标 C.AI 角色详情页: 资料/记忆/最近聊天) ============ */
let DETAIL = {runId:null, name:null, tab:"info", back:null};
window.charDetail = (runId, name, back)=>{
/* run 数据按需加载：详情页同步渲染，未就绪先拉再重放 */
if(isRealRun(runId) && !runReady(runId)){
  if(guardRun(runId, function(){ charDetail(runId, name, back); })) return;
}
DETAIL = {runId:runId, name:name, tab:"info", back:(back||null)};
renderDetail();
};
/* 游玩数据收藏/点赞开关（卡片详情落地页数据条用） */
window.toggleFavUI = ()=>{ try{ RP_STATS.toggleFav(DETAIL.runId, DETAIL.name); }catch(e){} renderDetail(); };
window.toggleLikeUI = ()=>{ try{ RP_STATS.toggleLike(DETAIL.runId, DETAIL.name); }catch(e){} renderDetail(); };
/* ---- 卡片详情落地页（P0）：徽章/数据条/CTA/简介/规格/开场/玩法说明/标签/档案 ----
 * 学电子姬AI 的 share 页结构，全部数据来自本地卡片 + 本地统计，不编造。 */
function cardOpenings(runId, name){
  let card = null;
  try{ card = (typeof RP !== "undefined" && RP.findCard) ? RP.findCard(runId, name) : null; }catch(e){}
  const out = [];
  const push = (t, label)=>{
    t = String(t == null ? "" : t).trim();
    if(t && !out.some(o=>o.text === t)) out.push({text: t, label: String(label || "")});
  };
  if(card){
    const g0 = (card.greeting && String(card.greeting).trim()) || "";
    if(g0) push(g0, "");
    (card.altGreetings || []).forEach(g=>push(g, ""));
  }
  /* 2026-10-07: 管线 openings.json (蒸馏产物, 带情境标签), 卡片开场之后追加 */
  try{
    var run = (window.__DATA__ && window.__DATA__.runs || {})[runId] || {};
    var pops = (run.openings || {})[name] || [];
    pops.forEach(function(p){
      push(p && (p.text || p), p && p.situation);
    });
  }catch(e){}
  return out.slice(0, 12);
}
function cardSettingChars(card){
  let n = 0;
  try{
    const f = card.fields || {};
    Object.keys(f).forEach(k=>{
      const v = f[k];
      if(typeof v === "string") n += v.length;
      else if(Array.isArray(v)) v.forEach(x=>{ n += String(x).length; });
    });
  }catch(e){}
  return n;
}
/* P1 徽章体系：id → 名称 + 说明（移动端点徽章看说明，即 tooltip） */
const BADGE_DEFS = {
  official: {label:"官方", desc:"浮生内置角色，由小说蒸馏管线从原著提炼，不是网上搬来的"},
  custom: {label:"自创", desc:"你在「创作 · 写卡」页亲手创建的角色"},
  imported: {label:"导入", desc:"从 SillyTavern 标准角色卡导入，原汁原味"},
  multiop: {label:"多开场", desc:"自带多个开场白，开局前可以挑一个喜欢的进"},
  longset: {label:"长篇设定", desc:"人设档案超过 3000 字，细节丰富，不容易聊崩"},
  regular: {label:"常玩", desc:"你已经和 TA 开过 5 局以上，是老搭档了"},
};
function badgeLabel(id){ return (BADGE_DEFS[id] || {}).label || id; }
/* 通用轻提示 toast（徽章说明等） */
let TIP_TOAST_TIMER = null;
function tipToast(html){
  let el = document.getElementById("tipToast");
  if(!el){ el = document.createElement("div"); el.id = "tipToast"; el.className = "achv-toast"; document.body.appendChild(el); }
  el.innerHTML = html;
  el.classList.add("show");
  if(TIP_TOAST_TIMER) clearTimeout(TIP_TOAST_TIMER);
  TIP_TOAST_TIMER = setTimeout(()=>el.classList.remove("show"), 2600);
}
window.badgeTip = (id)=>{
  const d = BADGE_DEFS[id]; if(!d) return;
  tipToast(`<b>${esc(d.label)}</b><br><span class="dim">${esc(d.desc)}</span>`);
};
function cardBadges(runId, card, openings, settingChars, st){
  const b = [];
  const runs = (window.__DATA__ && window.__DATA__.runs) || {};
  if(runs[runId]) b.push("official");
  if(runId === "custom") b.push("custom");
  if(runId === "imported") b.push("imported");
  if(openings.length > 1) b.push("multiop");
  if(settingChars >= 3000) b.push("longset");
  if(st && st.s >= 5) b.push("regular");
  return b.slice(0, 4);
}
function cardTags(card){
  const out = [];
  const push = t=>{
    t = String(t == null ? "" : t).trim();
    if(!t || out.indexOf(t) >= 0 || out.length >= 12) return;
    if(!isChipTag(t)) return;
    out.push(t);
  };
  try{
    if(card.novel) push(card.novel);
    const rt = (card.fields && card.fields.role_tags) || "";
    String(rt).split(/[；;、,，]/).forEach(push);
    if(card.raw && Array.isArray(card.raw.tags)) card.raw.tags.forEach(push);
  }catch(e){}
  return out;
}
/* 分类 chips 只收"身份式"短标签：过滤剧情描述长句（多为原文剧透，如"被宋江赐死…"） */
function isChipTag(t){
  if(t.length > 6) return false;
  if(/[。！？]$/.test(t)) return false;
  return true;
}
/* 用指定开场白开聊：清掉当前历史，进聊天时首条 AI 消息用该开场 */
window.chatWithOpening = (runId, name, idx)=>{
  try{
    saveHist(chatKey(runId, name), []);
    window.__pendingOpening = idx;
  }catch(e){ window.__pendingOpening = idx; }
  startChat(runId, name);
};
/* P1 开场选择器半屏：列出开场 + 随机开场 */
/* P0-15：原来只能点遮罩或直接挑一个开场，取消路径等于没有。
   补三样：顶部「取消」行、把把手做成可点、Esc 关闭。
   Esc 处理器只挂一次（openSheet 会被反复调用），靠 sheet 的 .on 判活。 */
window.__opensheetEsc = (e)=>{
  if(e.key !== "Escape") return;
  const sh = document.getElementById("opensheet");
  if(sh && sh.classList.contains("on")) openSheet(false);
};
try{
  if(document && typeof document.addEventListener === "function" && !window.__opensheetEscBound){
    window.__opensheetEscBound = true;
    document.addEventListener("keydown", window.__opensheetEsc);
  }
}catch(e){}
window.openSheet = (on, runId, name)=>{
let sh = document.getElementById("opensheet");
let sc = document.getElementById("openscrim");
if(!on){ if(sh) sh.classList.remove("on"); if(sc) sc.classList.remove("on"); return; }
const ops = cardOpenings(runId, name);
if(!sh){
sc = document.createElement("div"); sc.id = "openscrim"; sc.className = "scrim msscrim";
sc.onclick = ()=>openSheet(false);
document.body.appendChild(sc);
sh = document.createElement("div"); sh.id = "opensheet"; sh.className = "msgsheet";
sh.setAttribute("role","dialog"); sh.setAttribute("aria-modal","true");
sh.setAttribute("aria-label","选择开场");
document.body.appendChild(sh);
}
/* 把手也可点：点它 = 取消（原来它只是 4px 装饰条，用户看得出能拖却拖不动） */
const hd = sh.querySelector(".mshandle");
if(hd) hd.addEventListener("click", ()=>openSheet(false));
const nums = ["一","二","三","四","五","六","七","八"];
/* P0-15：面板内容。取消行放最上面（拇指可达），Esc 处理器见 __opensheetEsc。 */
sh.innerHTML = `<button class="msitem mscancel" onclick="openSheet(false)" aria-label="关闭开场选择">取消</button>`
+ `<div class="mshandle" role="separator" aria-hidden="true"></div><div class="msprev">选个开场，和 ${esc(name)} 开聊</div>`
+ ops.map((g, i)=>{
const prev = g.text.length > 64 ? g.text.slice(0, 64) + "…" : g.text;
const lab = g.label || ("开场" + (nums[i] || (i+1)));
return `<button class="msitem opitem" onclick="pickOpening('${jq(runId)}','${jq(name)}',${jq(i)})"><span class="opn">${esc(lab)}</span><span class="opp">${esc(prev)}</span></button>`;
}).join("")
+ `<button class="msitem" onclick="pickOpening('${jq(runId)}','${jq(name)}',-1)">随机开场</button>`;
sc.classList.add("on"); sh.classList.add("on");
/* 焦点进面板，Esc / Tab 都有落点 */
setTimeout(()=>{ const c=sh.querySelector(".mscancel"); if(c) c.focus(); }, 60);
};
window.pickOpening = (runId, name, idx)=>{
openSheet(false);
if(idx < 0){
const n = cardOpenings(runId, name).length;
idx = n ? Math.floor(Math.random() * n) : 0;
}
chatWithOpening(runId, name, idx);
};
function cardLandingHTML(runId, nm, card, run){
  const openings = cardOpenings(runId, nm);
  const settingChars = cardSettingChars(card);
  let st = null;
  try{ st = (typeof RP_STATS !== "undefined") ? RP_STATS.get(runId, nm) : null; }catch(e){}
  /* RP_STATS 缺失时的展示兜底（脚本加载顺序异常也不崩） */
  const SF = (typeof RP_STATS !== "undefined" && RP_STATS.fmt) ? RP_STATS.fmt : (n=>String(Math.round(n || 0)));
  const avgOf = (s)=>{ try{ return RP_STATS.avgTurns(s); }catch(e){ return 0; } };
  const badges = cardBadges(runId, card, openings, settingChars, st);
  let memN = 0;
  try{ const mst = (typeof RP_MEM !== "undefined") ? RP_MEM.get(runId, nm) : null; memN = (mst && mst.short ? mst.short.length : 0); }catch(e){}
  const novel = run.novel || card.novel || "";
  const brief = String((card.fields || {}).core_identity || "").split("\n")[0] || "";
  const tags = cardTags(card);
  let h = "";
  /* 1. 徽章行（v42：头像/名字/出处移到页首大立绘 charHeroHTML，这里只留徽章） */
  if(badges.length) h += `<div class="char-badges">` + badges.map(b=>`<span class="tagchip clickable" onclick="badgeTip('${b}')">${esc(badgeLabel(b))}</span>`).join("") + `</div>`;
  /* 2. 数据（v42：开局/轮数/token 消耗不再占首屏，收进可展开的「数据」；收藏/点赞移到头图右上角） */
  if(st && (st.s || st.t || st.fav || st.like)){
    const avg = avgOf(st), tot = st.pi + st.po;
    h += `<details class="card statfold"><summary class="t">数据 <span class="kv">开局 · 轮数 · 消耗</span></summary>`
      + `<div class="kv stat-line">开局 ${st.s} 次 · 共 ${st.t} 轮 · 平均 ${avg.toFixed(1)} 轮/局</div>`
      + `<div class="kv stat-line stat-line-sub">累计消耗约 ${SF(tot)} tokens <span class="stat-faint">(输入约${SF(st.pi)} / 输出约${SF(st.po)})</span></div>`
      + `</details>`;
  }
  /* 3. 简介 */
  if(brief) h += `<h2 class="sec">简介</h2><div class="card"><div class="card-brief">${esc(brief)}</div></div>`;
  /* 4. 规格网格 */
  const avgW = (st && st.s) ? (st.t / st.s).toFixed(0) + "轮/局" : "—";
  h += `<h2 class="sec">规格</h2><div class="specgrid">`
    + `<div class="spec"><div class="v">${openings.length ? openings.length + "个" : "AI生成"}</div><div class="k">开场</div></div>`
    + `<div class="spec"><div class="v">${settingChars ? "约" + SF(settingChars) + "字" : "—"}</div><div class="k">设定</div></div>`
    + `<div class="spec"><div class="v">${memN}条</div><div class="k">记忆</div></div>`
    + `<div class="spec"><div class="v">${avgW}</div><div class="k">平均轮数</div></div>`
    + `</div>`;
  /* 5. 开场列表 */
  if(openings.length){
    h += `<h2 class="sec">开场 · ${openings.length} 个</h2>`;
    h += openings.map((g, i)=>{
      /* cardOpenings() 返回 {text,label} 对象(P1 开场标签), 不是字符串。
         原来这里当字符串用 g.length/g.slice, 结果整页渲染成 [object Object]。 */
      const txt = String((g && g.text) || "");
      const prev = txt.length > 72 ? txt.slice(0, 72) + "…" : txt;
      return `<div class="card card--tap" onclick="chatWithOpening('${jq(runId)}','${jq(nm)}',${jq(i)})">`
        + `<div class="kv">开场${["一","二","三","四","五","六","七","八"][i] || (i+1)}</div>`
        + `<div class="opn-text">${esc(prev)}</div>`
        + `<div class="opn-go">用这个开场开聊 ›</div></div>`;
    }).join("");
  } else {
    h += `<div class="hint hint-tight">这张卡没有固定开场白，开聊后 AI 会根据人设现场生成开场。</div>`;
  }
  /* 6. 玩法说明（由本地数据自动生成，不编造）。P1-19：说明性文字默认折起来，
     详情页首屏要留给「这人是谁 / 怎么开聊」，不是三段使用手册。 */
  h += `<details class="card"><summary class="t">玩法说明</summary>`
    + `<div class="kvline"><b>怎么开始</b>：点「开始对话」${openings.length ? "，或挑一个开场进入" : ""}——${esc(nm)}会先和你打招呼，之后你说一句、它回一句。</div>`
    + `<div class="kvline"><b>它记得什么</b>：${memN ? "已经有 " + memN + " 条记忆，聊过的关键事不会忘" : "聊天中提到的关键信息会自动记下来，越聊越记得你们的事"}。</div>`
    + `<div class="kvline"><b>小贴士</b>：想换走向直接说；某句不满意可以重抽；重要的设定可以写进世界书长期生效。</div>`
    + `</details>`;
  /* 7. 标签 */
  if(tags.length) h += `<h2 class="sec">标签</h2><div class="tagrow">` + tags.map(t=>`<span class="tagchip">${esc(t)}</span>`).join("") + `</div>`;
  /* B7 卡片档案入口: 聚合页(worldbook/多开场/卡面字段/示例对话/标签/AI 补完标注),
     外加一份「蒸馏产物 · 导入卡天然没有」的缺席说明。蒸馏卡也能进, 只是那节会说明
     六大产物页在 run 侧、这里只看卡自带的东西。 */
  h += `<div class="btnrow" style="margin-top:8px"><button class="btn ghost" onclick="openCardArchive('${jq(runId)}','${jq(nm)}')">📁 卡片档案</button>`
    + `<button class="btn ghost srcbtn" onclick="viewCardSource('${jq(runId)}','${jq(nm)}')">📖 查看设定源码（只读学习）</button></div>`;
  /* 8. 档案（原有字段分组） */
  const groups = [["identity","身份"],["core","内核"],["speech","说话方式"],["appearance","外貌与举止"],["background","背景"]];
  const arch = groups.map(g=>{
    const txt = RP_PROMPT.renderFields(card, RP_PROMPT.LAYERS[g[0]]);
    return txt ? `<h2 class="sec">${g[1]}</h2><div class="card">`
      + txt.split("\n").map(l=>`<div class="kvline">${esc(l)}</div>`).join("") + `</div>` : "";
  }).join("");
  if(arch) h += `<h2 class="sec">档案</h2>` + arch.replace(/<h2 class="sec">[^<]*<\/h2>/g, "");
  /* 9. CTA（P1-19：原先顶部、底部各渲染一次巨型胶囊，把近 1/4 屏高吃掉，
     而这一页真正能做的动作只有一个。收成 sticky 底部单条，随滚动常驻。） */
  h += `<div class="ctadock"><button class="btn landcta" onclick="chatWith('${jq(runId)}','${jq(nm)}')">${typeof icon === "function" ? icon("chat",18) : ""} 开始对话</button></div>`;
  return h;
}
/* ============ B7 卡片档案聚合页 ============
 * 蒸馏剧本的六大产物页(人物/大纲/关系/剧情线/世界/更多)全部挂在 openRun() 之后的 RUN 上,
 * 导入卡没有 RUN.__DATA__.runs["imported"] 恒为 undefined, 所以那一整排 tab 结构上不可达。
 * 退一步把 openRun 分流到 charDetail 只是换个入口, 产品上仍然是"导入卡看不到自己的资料"。
 *
 * 这里做的是真的聚合: 把这张卡自带的东西(worldbook 条目 / 多开场白 / 示例对话 /
 * 场景·系统提示 / 标签 / aiFilled 标注)汇进一个可浏览面板, 世界书那节复用现成的
 * loreRowsHTML(与 renderLoreList 同款渲染器), 开场白那节复用 cardOpenings。
 *
 * 铁律: 只渲染卡上真实有的字段。蒸馏产物(profiles / sections / outline_md / 静态关系 /
 * 伏笔 / 冲突 / 判词脂批)导入卡天然没有, 这里逐条给 honest 空态 —— 说清"这是什么、
 * 为什么没有、可以怎么补", 绝不拿别处的数据凑数, 也不编一条静态关系出来。
 */
const ARC_PROD = [
  ["人物档案 profiles", "导入卡只带一个角色自己的设定，没有同书其他角色的档案表。"],
  ["分段大纲 sections", "ST 卡不含分段大纲。导入时若有大纲正文，会出现在下面的「场景 · 系统提示」里。"],
  ["静态人物关系 relations", "ST 卡没有关系表。群聊时可以在「角色关系」里手写；单聊里聊天满 6 轮后，AI 抽取的动态关系会自动积累到「关系管理」。"],
  ["剧情线 event_dag", "因果事件 DAG 是蒸馏管线的产物，导入卡没有。卡片自带的 worldbook 条目已经列在下面。"],
  ["世界卡 worldcard", "世界卡只随蒸馏剧本生成，导入卡没有。卡片自带的世界书（若有）就是这里全部的世界设定。"],
  ["伏笔 / 冲突 / 修正", "伏笔、冲突点、反 OOC 纠错都是管线产物，导入卡没有。"],
  ["判词 / 脂批 / 方法论", "红楼专属的呈现层，导入卡没有。"],
];
window.archiveBack = ()=>{
  __backAction = null;
  try{ document.body.classList.remove("chatmode","immersive"); }catch(e){}
  renderDetail();
};
/* 世界书条目行: 与 renderLoreList 用同一套 normLore + 行样式, 不另写一份渲染器 */
function loreRowsHTML(arr){
  if(!arr.length) return "";
  return arr.map((e,i)=>{
    const n = normLore(e,i);
    return `<div class="card"><div class="row"><div style="flex:1">
<div class="name">${esc(loreTitle(n,i))} ${n.constant?'<span class="badge warn">常驻</span>':""} ${!n.enabled?'<span class="badge">停用</span>':""}</div>
<div class="meta">触发词：${esc((n.key||[]).join("、")||"无")} · P${n.priority} · 约 ${RP_PROMPT.estTokens(n.content||"")} tok</div>
</div></div>${n.content?`<div class="kvline">${esc(String(n.content).slice(0,220))}${String(n.content).length>220?"…":""}</div>`:""}</div>`;
  }).join("");
}
window.openCardArchive = (runId, nm)=>{
  const card = fullCardOf(runId, nm);
  __backAction = ()=>archiveBack();
  try{ document.body.classList.remove("chatmode","immersive"); }catch(e){}
  titleEl.textContent = (nm || "角色") + " · 卡片档案";
  subEl.textContent = "导入卡与自创卡自带的全部资料";
  if(!card){
    view.innerHTML = `<button class="back" onclick="archiveBack()">${icon("back")} 返回</button>
<div class="empty">找不到这张卡<br><span style="font-size:calc(12px * var(--fs))">它可能已被删除。</span></div>`;
    window.scrollTo(0,0);
    return;
  }
  const f = card.fields || {};
  let h = `<button class="back" onclick="archiveBack()">${icon("back")} 返回</button>`;

  /* 1. 设定正文: 复用 RP_PROMPT.renderFields + LAYERS(与落地页「档案」同一套渲染器) */
  const groups = [["identity","身份"],["core","内核"],["speech","说话方式"],["appearance","外貌与举止"],["background","背景"]];
  const arch = groups.map(g=>{
    const txt = RP_PROMPT.renderFields(card, RP_PROMPT.LAYERS[g[0]]);
    return txt ? `<h2 class="sec">${g[1]}</h2><div class="card">`
      + txt.split("\n").map(l=>`<div class="kvline">${esc(l)}</div>`).join("") + `</div>` : "";
  }).join("");
  h += arch ? `<h2 class="sec">角色字段</h2>` + arch.replace(/<h2 class="sec">[^<]*<\/h2>/g, "")
           : `<div class="empty">这张卡没有填角色字段<br><span style="font-size:calc(12px * var(--fs))">去卡片编辑器补上，prompt 立刻就能用。</span>
<br><button class="btn" style="margin-top:10px" onclick="editCard('${jq(runId === "imported" ? "imported" : "custom")}','${jq(card.id || "")}')">去编辑器</button></div>`;

  /* 2. 世界书: 卡自带条目(只读) + 本机自建条目(走现成的 loreEditor 渲染与编辑) */
  const wb = Array.isArray(card.worldbook) ? card.worldbook : [];
  /* v41 空态：两节都为 0 时合成一节「世界书」+ 去创建，不再连摆两个「· 0 条」空节 */
  const mine = getLore(runId, nm);
  if(!wb.length && !mine.length){
    h += `<h2 class="sec">世界书</h2>`
      + `<div class="empty">这张卡没有自带世界书，你也还没写条目<br><span style="font-size:calc(12px * var(--fs))">自建条目和卡片自带的世界书一起参与关键词触发。</span>`
      + `<br><button class="btn" style="margin-top:10px" onclick="loreEditor('${jq(runId)}')">${icon("plus")} 去创建世界书</button></div>`;
  } else {
    if(wb.length) h += `<h2 class="sec">世界书 · ${wb.length} 条（卡片自带）</h2>` + loreRowsHTML(wb);
    h += `<h2 class="sec">我写的世界书${mine.length ? " · " + mine.length + " 条" : ""}</h2>`;
    h += mine.length ? loreRowsHTML(mine)
      : `<div class="empty">还没写条目<br><span style="font-size:calc(12px * var(--fs))">自建条目和卡片自带的世界书一起参与关键词触发。</span></div>`;
    h += `<button class="btn ghost" style="margin-top:8px" onclick="loreEditor('${jq(runId)}')">打开世界书管理</button>`;
  }

  /* 3. 开场白: 复用 cardOpenings(与落地页同一份抽取逻辑) */
  const ops = cardOpenings(runId, nm);
  h += `<h2 class="sec">开场白 · ${ops.length} 个</h2>`;
  h += ops.length ? ops.map((g,i)=>{
    const txt = String((g && g.text) || "");
    const prev = txt.length > 90 ? txt.slice(0,90)+"…" : txt;
    return `<div class="card card--tap" onclick="chatWithOpening('${jq(runId)}','${jq(nm)}',${jq(i)})">`
      + `<div class="kv">${g && g.label ? esc(g.label) : "开场"+(["一","二","三","四","五","六","七","八"][i]||(i+1))}</div>`
      + `<div class="opn-text">${esc(prev)}</div><div class="opn-go">用这个开场开聊 ›</div></div>`;
  }).join("") : `<div class="empty">这张卡没有固定开场白<br><span style="font-size:calc(12px * var(--fs))">开聊后 AI 会根据人设现场生成。</span></div>`;

  /* 4. ST 一等字段 */
  const st = [["scenario","场景设定"],["systemPrompt","系统提示词"],
              ["postHistoryInstructions","历史后指令"],["creatorNotes","作者注"],
              ["depthPrompt","深度提示"],["creator","作者"]];
  const stRows = st.filter(x=>String((card[x[0]]||"")).trim())
    .map(x=>`<div class="kvline"><b>${x[1]}</b>：${esc(String(card[x[0]]).slice(0,300))}</div>`).join("");
  h += `<h2 class="sec">卡面字段</h2>`;
  h += stRows ? `<div class="card">${stRows}</div>`
    : `<div class="empty">这张卡没有额外的卡面字段<br><span style="font-size:calc(12px * var(--fs))">都是可选的，去卡片编辑器补。</span></div>`;

  /* 5. 示例对话 */
  h += `<h2 class="sec">示例对话</h2>`;
  h += String(card.exampleDialogue||"").trim()
    ? `<div class="card md">${md(card.exampleDialogue)}</div>`
    : `<div class="empty">没有示例对话<br><span style="font-size:calc(12px * var(--fs))">补几条 few-shot，角色口吻会稳很多。</span></div>`;

  /* 6. 标签 */
  const tags = cardTags(card);
  h += `<h2 class="sec">标签</h2>`;
  h += tags.length ? `<div class="tagrow">`+tags.map(t=>`<span class="tagchip">${esc(t)}</span>`).join("")+`</div>`
    : `<div class="empty">暂无标签</div>`;

  /* 7. AI 补完标注: 告诉用户哪些字段是模型补的, 不是原卡自带 */
  const af = card.aiFilled && typeof card.aiFilled === "object" ? card.aiFilled : {};
  const afKeys = Object.keys(af).filter(k=>af[k]);
  h += `<h2 class="sec">AI 补完</h2>`;
  h += afKeys.length
    ? `<div class="card"><div class="hint" style="margin:0 0 6px">这些字段是 AI 基于卡片原文推断补上的，原卡没有，请自行核对：</div>`
      + afKeys.map(k=>`<div class="kvline">${esc(RP_PROMPT.LABELS[k]||k)} <span class="dim">${esc(k)}</span> <span class="badge">AI 补完</span></div>`).join("")
      + `</div>`
    : `<div class="empty">这张卡没有任何 AI 补完字段<br><span style="font-size:calc(12px * var(--fs))">导入时可点「AI 补完缺失层」，补完的内容会在这里列出。</span></div>`;

  /* 8. 蒸馏产物缺席清单: 逐条解释为什么没有 + 怎么补 —— 这是聚合页存在的意义 */
  h += `<h2 class="sec">蒸馏产物 · 导入卡天然没有</h2>`
    + `<div class="card"><div class="hint" style="margin:0 0 8px">下面这些是蒸馏管线产物，导入卡不带。列出来是为了说明"为什么这里看不到"，不是占位。</div>`
    + ARC_PROD.map(x=>`<div class="kvline"><b>${x[0]}</b>：${esc(x[1])}</div>`).join("")
    + `</div>`;

  h += `<div style="height:76px"></div>`;
  view.innerHTML = h;
  window.scrollTo(0,0);
};

/* 取卡片全量对象（RP.findCard 对导入/自创卡会裁剪字段，只读视图/导出用全量） */
function fullCardOf(runId, name){
try{
if(runId === "imported" && typeof RP_CARDIMPORT !== "undefined"){
const c = RP_CARDIMPORT.find(name); if(c) return c;
}
if(runId === "custom" && typeof RP_WRITER !== "undefined"){
const c = RP_WRITER.findCustom(name); if(c) return c;
}
}catch(e){}
return (typeof RP !== "undefined" && RP.findCard) ? RP.findCard(runId, name) : null;
}
/* P2 开源卡：只读设定视图（对照学习，不可编辑） */
window.viewCardSource = (runId, name)=>{
__backAction = ()=>charDetail(runId, name);
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
const card = fullCardOf(runId, name);
titleEl.innerHTML = icon("books") + " 设定源码"; subEl.textContent = name + " · 只读";
if(!card){
view.innerHTML = `<button class="back" onclick="charDetail('${jq(runId)}','${jq(name)}')">${icon("back")} 返回</button><div class="empty">找不到这张卡</div>`;
return;
}
const f = card.fields || {};
const fkeys = Object.keys(f);
const wb = card.worldbook || [];
const line = (k, v)=>`<div class="kvline"><b>${esc(k)}</b>：${esc(String(v == null ? "" : v))}</div>`;
let h = `<button class="back" onclick="charDetail('${jq(runId)}','${jq(name)}')">${icon("back")} 返回</button>`
+ `<div class="hint" style="margin:2px 0 10px">开源卡：设定对所有人只读开放，可对照学习写卡思路，不可在此编辑。</div>`
+ `<div class="card"><div class="name" style="font-size:calc(14px * var(--fs))">基本信息</div>`
+ line("名字", card.name) + line("出处", card.novel || runId)
+ (card.creator ? line("作者", card.creator) : "")
+ (card.characterVersion ? line("版本", card.characterVersion) : "")
+ line("字段数", fkeys.length) + line("世界书", wb.length + " 条") + `</div>`;
const ops = cardOpenings(runId, name);
if(ops.length){
h += `<h2 class="sec">开场白 · ${ops.length}</h2><div class="card">`
+ ops.map((g, i)=>`<div class="kvline"><b>${esc(g.label || ("开场" + (["一","二","三","四","五","六","七","八"][i] || (i+1))))}</b>：${esc(g.text)}</div>`).join("") + `</div>`;
}
if(fkeys.length){
h += `<h2 class="sec">人设字段 · ${fkeys.length}</h2><div class="card">`
+ fkeys.map(k=>line(k, Array.isArray(f[k]) ? f[k].join(" / ") : f[k])).join("") + `</div>`;
}
if(wb.length){
h += `<h2 class="sec">世界书 · ${wb.length}</h2><div class="card">`
+ wb.slice(0, 20).map((w,wi)=>`<div class="kvline"><b>${esc(w.name || (Array.isArray(w.key) ? w.key[0] : w.key) || loreTitle(w, wi))}</b> <span class="kv">${esc(String(w.keys || w.keywords || "").toString().slice(0, 60))}</span></div>`).join("")
+ (wb.length > 20 ? `<div class="kv">…还有 ${wb.length - 20} 条</div>` : "") + `</div>`;
}
h += `<div class="btnrow" style="margin-top:12px"><button class="btn" onclick="copyCardJson('${jq(runId)}','${jq(name)}')">复制设定 JSON</button></div><div style="height:40px"></div>`;
view.innerHTML = h;
window.scrollTo(0, 0);
};
window.copyCardJson = (runId, name)=>{
const card = fullCardOf(runId, name);
if(!card) return;
const clean = {name: card.name, novel: card.novel, fields: card.fields || {},
greeting: card.greeting || "", altGreetings: card.altGreetings || [],
scenario: card.scenario || "", tags: (card.raw && card.raw.tags) || []};
copyText(JSON.stringify(clean, null, 2), "设定 JSON 已复制");
};
function detailBack(){
if(DETAIL.back === "picker") setNav("chat");
else if(typeof DETAIL.back === "function") DETAIL.back();
else if(CHAT.name) showChat();
else setNav("chat");
}
window.charTab = (t)=>{ DETAIL.tab = t; renderDetail(); };
window.detailOpenAlbum = ()=>{ openAlbum(DETAIL.runId, DETAIL.name, ()=>renderDetail()); };
function renderDetail(){
const runId = DETAIL.runId, nm = DETAIL.name;
__backAction = ()=>detailBack();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
const card = RP.findCard(runId, nm) || {name:nm, fields:{}};
const run = ((window.__DATA__||{}).runs||{})[runId] || {};
titleEl.innerHTML = icon("user")+" "+esc(nm); subEl.textContent = run.novel || "";
const tabs = [["info","资料"],["memory","记忆"],["chat","最近聊天"],["arc","人物弧光"],["soul","灵魂包"]];
let body = "";
if(DETAIL.tab === "info"){
/* P0 卡片详情落地页：徽章/数据条/CTA/简介/规格/开场/玩法说明/标签/档案 */
body = cardLandingHTML(runId, nm, card, run) || `<div class="empty">还没有资料，多聊几句就会有了</div>`;
} else if(DETAIL.tab === "memory"){
const st = RP_MEM.get(runId, nm);
const n = (st && st.short && st.short.length) || 0;
/* P0-2: 铁律记忆框 (400 字常驻, 进 important 池最高优先级) */
const _dc = RP.findCard(runId, nm) || {};
const _iron = RP_MEM.getIronLaw(runId, nm, _dc.id || null);
/* Tier2 #11: 本聊摘要框 — 和铁律卡并列 */
const _chatsum = RP_MEM.getChatSummary(runId, nm);
/* Tier2 #15: 简洁回复开关 (Janitor "Snappier, more concise replies.") */
const _copt = getChatOpt(runId, nm);
body = `<div class="card"><div class="name" style="font-size:calc(14px * var(--fs))">铁律记忆 · 永远最先注入${RP_AIFILL.btn("ironlaw_box","对"+nm+"的铁律","3~5条硬性要求，一条一行，如：绝不在人前提起穿越者的身份；对黛玉永远温柔","角色扮演：约束 AI 扮演 "+nm+" 时必须遵守的铁律")}</div>`
+ `<div class="meta">不用等它自己学会的重要事实：对${esc(nm)}的硬性要求（如绝不做的事、必须遵守的设定），2000 字以内，每次对话必带，立即可用</div>`
+ `<div class="field" style="margin:8px 0 0"><textarea id="ironlaw_box" rows="4" maxlength="2000" placeholder="如：绝不在人前提起穿越者的身份；对黛玉永远温柔…" oninput="ironlawCount()">${esc(_iron)}</textarea></div>`
+ `<div class="btnrow"><span class="kv" id="ironlaw_cnt">${_iron.length}/2000</span><span style="flex:1"></span><button class="btn" onclick="saveIronLawUI()">保存铁律</button></div></div>`
+ `<div class="card"><div class="name" style="font-size:calc(14px * var(--fs))">本聊摘要 · 手写长期记忆${RP_AIFILL.btn("chatsum_box","和"+nm+"的聊天摘要","2~3句话概括你和这个角色的当前关系与共同经历", "角色 "+nm+"；最近对话：\n"+RP_AIFILL._recentChatCtx(8,"nd_chat_"+runId+"_"+nm))}</div>`
+ `<div class="meta">一句话概括这段聊天（1000 字以内），每次对话会最先注入，作为长期记忆</div>`
+ `<div class="field" style="margin:8px 0 0"><textarea id="chatsum_box" rows="3" maxlength="1000" placeholder="如：我们是青梅竹马，正在一起调查家族旧事…" oninput="chatsumCount()">${esc(_chatsum)}</textarea></div>`
+ `<div class="btnrow"><span class="kv" id="chatsum_cnt">${_chatsum.length}/1000</span><span style="flex:1"></span><button class="btn" onclick="saveChatSumUI()">保存摘要</button></div></div>`
+ `<div class="card"><div class="name" style="font-size:calc(14px * var(--fs))">回复风格</div>`
+ `<div class="field"><label><input id="concise_sw" type="checkbox" style="width:auto" ${_copt.concise?"checked":""}> 简洁回复（Snappier：回答简短精炼，节奏轻快；关掉则回复更长）</label></div>`
+ `<div class="btnrow"><button class="btn" onclick="saveConciseUI()">保存</button></div></div>`
+ `<div class="card"><div class="name" style="font-size:calc(14px * var(--fs))">${st&&st.mood&&st.mood.state?esc(st.mood.state):"还没有心境记录"}</div>`
+ `<div class="meta">${n} 条近期记忆${st&&st.long?" · 有长远印象":""}</div>`
+ `<div class="btnrow" style="margin-top:8px"><button class="btn" onclick="detailOpenAlbum()">${icon("books")} 打开记忆事件簿</button></div></div>`;
} else if(DETAIL.tab === "arc"){
body = renderArcBody(runId, nm, card);
} else if(DETAIL.tab === "soul"){
body = (typeof RP_SOUL_CFG !== "undefined") ? RP_SOUL_CFG.soulViewHTML(card, runId, nm) : "<div class=\"empty\">Soul 模块未加载</div>";
} else {
const h = getHistSafe(`nd_chat_${runId}_${nm}`).slice(-10);
body = (h.map(m=>{
const who = m.role==="user" ? "我" : nm;
return `<div class="card"><div class="kv">${esc(who)}</div><div style="font-size:calc(13px * var(--fs))">${esc(m.content.slice(0,120))}${m.content.length>120?"…":""}</div></div>`;
}).join("") || `<div class="empty">还没有聊天记录</div>`)
+ `<div class="btnrow" style="margin-top:12px"><button class="btn" onclick="chatWith('${jq(runId)}','${jq(nm)}')">${icon("chat")} 和${esc(nm)}开聊</button><button class="btn ghost" onclick="soulAnchors('${jq(runId)}','${jq(nm)}')">${icon("user")} 魂穿成${esc(nm)}</button></div>`;
}
/* v42：页首大立绘（含返回、收藏/点赞）；非资料页也补一条常驻「开始对话」 */
const _dock = DETAIL.tab === "info" ? "" : `<div class="ctadock"><button class="btn landcta" onclick="chatWith('${jq(runId)}','${jq(nm)}')">${icon("chat",18)} 开始对话</button></div>`;
view.innerHTML = charHeroHTML(runId, nm, card, run) + `
<div class="dtabs" role="tablist" aria-label="角色资料分区">` + tabs.map(t=>`<button class="dtab${DETAIL.tab===t[0]?" on":""}" role="tab" aria-selected="${DETAIL.tab===t[0]?"true":"false"}" onclick="charTab('${jq(t[0])}')">${t[1]}</button>`).join("") + `</div>
${body}${_dock}<div style="height:40px"></div>`;
/* v41: tab 条可横滑，当前 tab 滚进可视区（只动 tab 条自身，不动页面） */
try{ const _on = view.querySelector(".dtab.on"), _bar = view.querySelector(".dtabs");
  if(_on && _bar && _bar.scrollWidth > _bar.clientWidth) _bar.scrollLeft = Math.max(0, _on.offsetLeft - _bar.offsetLeft - 16); }catch(e){}
window.scrollTo(0,0);
}
/* ============ P0-3 人物弧光展示区 ============ */
function renderArcBody(runId, nm, card){
if(typeof RP_ARC === "undefined") return `<div class="empty">弧光模块未加载</div>`;
const s = RP_ARC.arcSummary(card, runId);
if(!s.type && !s.start && !s.mids.length && !s.end) return `<div class="empty">该角色暂无人物弧光资料</div>`;
const opts = [s.defaultStage].concat(RP_ARC.STAGES.filter(x=>x && x !== s.defaultStage));
const stageSel = `<div class="field" style="margin:0"><label>当前阶段（切换后按本卡记住）</label>`
+ `<select id="arcstage_sel" onchange="arcStageChange('${jq(runId)}','${jq(nm)}')">`
+ opts.map(o=>`<option value="${esc(o)}"${o===s.stage?" selected":""}>${esc(o)}</option>`).join("")
+ `</select></div>`;
const mids = s.mids.map((m,i)=>`<div class="kvline"><span class="kv">${i+1}.</span> ${esc(m)}</div>`).join("");
return `<div class="card"><div class="t">人物弧光 · ${esc(s.typeLabel || s.type || "")}${s.typeLabel ? "弧" : ""}</div>`
+ `<div class="meta">当前阶段：${esc(s.stage || "未定")}</div></div>`
+ `<div class="card">${stageSel}</div>`
+ (s.start ? `<h2 class="sec">起 · 开局</h2><div class="card"><div class="kvline">${esc(s.start)}</div></div>` : "")
+ (mids ? `<h2 class="sec">承转 · ${s.mids.length} 个转折</h2><div class="card">${mids}</div>` : "")
+ (s.end ? `<h2 class="sec">合 · 结局</h2><div class="card"><div class="kvline">${esc(s.end)}</div></div>` : "");
}
window.arcStageChange = (runId, nm)=>{
const sel = document.getElementById("arcstage_sel");
if(!sel || typeof RP_ARC === "undefined") return;
const card = (typeof RP !== "undefined" && RP.findCard(runId, nm)) || {name:nm, fields:{}};
RP_ARC.setStage(card, runId, sel.value);
renderDetail();
};
 /* 关系管理页：查看动态关系 + 锁定/解锁 */
 /* 关系静态层的 run 兜底 (B10): 导入卡/custom 没有真 run (__DATA__.runs 里没这个键),
    静态关系恒空。取不到真 run 时回落 Phase 2 的 RP.synthRunFor 合成 run (novel/worldbook/
    relations), 蒸馏 runId 一律走真 run, 原逻辑不变; RP 未加载时也保持原来的 run={}。 */
 function relRunFor(runId, name){
   var run = ((window.__DATA__||{}).runs||{})[runId] || null;
   if(run) return run;
   try{
     if(typeof RP!=="undefined" && typeof RP.synthRunFor==="function")
       return RP.synthRunFor(runId, name) || {};
   }catch(e){}
   return {};
 }
 /* 非蒸馏 run(导入卡/自创卡)又没有静态关系时的空态: 说清"为什么空"和"怎么变出来" */
 function relEmptyText(runId){
   if((((window.__DATA__||{}).runs||{})[runId])) return "暂无关系数据";
   return "本卡没有蒸馏出的静态关系：聊天中 AI 会自动抽取人物关系并积累到这里，锁定后 AI 不会再改动。";
 }
 window.showRelManager = ()=>{
   var runId = CHAT.runId, name = CHAT.name;
   var run = relRunFor(runId, name);
   var rels = (typeof AGENT_RELATIONS !== "undefined")
     ? AGENT_RELATIONS.merged(runId, run.relations, name) : (run.relations || []);
   var myRels = rels.filter(function(r){
     return r.source_character === name || r.target_character === name;
   });
   var v = document.getElementById("view");
   var html = `<h2 class="sec">${icon("users")} 关系管理</h2>
     <div style="font-size:calc(12px * var(--fs));color:var(--ink-faint);margin-bottom:12px">聊天中关系会自动演变，锁定的关系 AI 不会再动</div>`;
   if(!myRels.length) html += `<div class="card"><div style="font-size:calc(13px * var(--fs));color:var(--ink-faint)">${esc(relEmptyText(runId))}</div></div>`;
  myRels.forEach(function(r){
    var other = r.source_character === name ? r.target_character : r.source_character;
    var locked = r._locked;
    var dyn = r._dynamic ? " <span style='font-size:calc(11px * var(--fs));color:#e8a13c'>动态</span>" : "";
    html += `<div class="card" style="margin-bottom:8px;padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><b>${esc(other)}</b>${dyn}<br>
        <span style="font-size:calc(13px * var(--fs));color:var(--ink-faint)">${esc(r.relationship_summary || r.type || "")}</span></div>
        <button class="btn${locked ? " primary" : ""}" style="font-size:calc(12px * var(--fs));padding:4px 10px"
          onclick="AGENT_RELATIONS.setLock('${jq(runId)}','${jq(name)}','${jq(other)}',${!locked},'${jq(name)}');showRelManager();">
          ${locked ? "🔒 已锁定" : "🔓 锁定"}</button>
      </div></div>`;
  });
  html += `<button class="btn" onclick="showChat()">返回聊天</button>`;
  v.innerHTML = html;
};
/* 角色卡更新建议页 */
window.showCardEvo = ()=>{
  var runId = CHAT.runId, name = CHAT.name;
  var list = (typeof AGENT_CARDEVO !== "undefined") ? AGENT_CARDEVO.getSuggestions(runId, name) : [];
  var pending = list.filter(function(s){ return s.status === "pending"; });
  var v = document.getElementById("view");
  var html = `<h2 class="sec">${icon("edit")} 角色卡更新建议 (${pending.length} 待处理)</h2>
    <div style="font-size:calc(12px * var(--fs));color:var(--ink-faint);margin-bottom:12px">AI 观察到角色在聊天中的持久变化，建议更新到卡上。每条都要你确认，不会自动改。</div>`;
  if(!pending.length) html += `<div class="card"><div style="font-size:calc(13px * var(--fs));color:var(--ink-faint)">暂无待处理建议。聊得久一点，AI 会发现角色的成长。</div></div>`;
  pending.forEach(function(s, i){
    var idx = list.indexOf(s);
    html += `<div class="card" style="margin-bottom:8px;padding:12px">
      <div style="font-size:calc(12px * var(--fs));color:var(--ink-faint)">字段：${esc(s.field)}</div>
      <div style="font-size:calc(13px * var(--fs));margin:6px 0"><b>建议：</b>${esc(s.newVal)}</div>
      <div style="font-size:calc(12px * var(--fs));color:var(--ink-faint)">理由：${esc(s.reason || "")}</div>
      <div class="btnrow" style="margin-top:8px">
        <button class="btn primary" style="font-size:calc(12px * var(--fs))" onclick="acceptCardEvo(${jq(idx)})">接受</button>
        <button class="btn" style="font-size:calc(12px * var(--fs))" onclick="AGENT_CARDEVO.reject('${jq(runId)}','${jq(name)}',${idx});showCardEvo();">拒绝</button>
      </div></div>`;
  });
  html += `<button class="btn" onclick="showChat()">返回聊天</button>`;
  v.innerHTML = html;
};
window.acceptCardEvo = (idx)=>{
  var runId = CHAT.runId, name = CHAT.name;
  var s = AGENT_CARDEVO.accept(runId, name, idx);
  if(s && s.field){
    // 写入卡片 (localStorage 自定义卡或运行时)
    try{
      var ck = "nd_cardfield_" + runId + "_" + name + "_" + s.field;
      localStorage.setItem(ck, s.newVal);
    }catch(e){}
  }
  showCardEvo();
};
