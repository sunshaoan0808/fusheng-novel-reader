/* 浮生 · app 分段 03：run 数据按需加载门卫（data.js 拆包）、DAG/事件历/世界卡懒加载、立绘卡
 * v41 从 app.js 原样迁出（原 app.js 第 576–829 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ---------- run 数据按需加载门卫（2026-10-18 data.js 拆包）----------
 * data.js 只留 index；run 级 profiles/worldbook/rp_cards 在 data/run_<id>.js，
 * 由 RP_LAZY.ensureRun 按需拉（rp/lazy.js）。同步渲染入口（openRun/chatWith/
 * 详情页…）在数据未就绪时先画占位、到手后原样重放；消费点本身都有 || {} 兜底，
 * 最坏退空态，不会 TypeError 白屏。 */
function isRealRun(id){
  return typeof id === "string" && INDEX.some(r=>r.run_id===id);
}
function runReady(runId){
  return !!(window.__DATA__ && window.__DATA__.runs && window.__DATA__.runs[runId]);
}
function runLoadingFailed(e, replay){
  window.__retryAction = replay;
  view.innerHTML = `<div class="empty">数据加载失败<br><span style="font-size:calc(12px * var(--fs))">${escH(e && e.message || e)}</span><br><button class="btn" style="margin-top:12px" onclick="window.__retryAction&&window.__retryAction()">重试</button></div>`;
}
/* 单个 run 未就绪 → 占位 + ensureRun + 重放；返回 true 表示调用方应 return */
function guardRun(runId, replay, hint){
  if(runReady(runId) || typeof RP_LAZY === "undefined") return false;
  var r = INDEX.find(x=>x.run_id===runId);
  view.innerHTML = `<div class="empty">${hint || ("正在加载" + (r ? "《" + esc(r.novel) + "》" : "") + "数据…")}</div>`;
  RP_LAZY.ensureRun(runId).then(replay).catch(function(e){ runLoadingFailed(e, replay); });
  return true;
}
/* 全量 run 未齐 → 占位 + ensureAllRuns + 重放（聊天选择器/穿越页要全量角色） */
function guardAllRuns(replay, hint){
  var idx = (window.__DATA__ && window.__DATA__.index) || [];
  if(idx.every(r=>runReady(r.run_id)) || typeof RP_LAZY === "undefined") return false;
  view.innerHTML = `<div class="empty">${hint || "正在加载角色数据…"}</div>`;
  RP_LAZY.ensureAllRuns().then(replay).catch(function(e){ runLoadingFailed(e, replay); });
  return true;
}
/* 导演"无蓝图"提示 (B14): 原著因果蓝图(worldcard)只随蒸馏剧本自带, 导入卡/自创卡没有。
   rp/director.js 的 worldcardBrief 此时返回空串, 导演照常按通用模式编排 —— 这不是故障,
   界面上说清楚, 免得用户以为导演坏了。 */
function noBlueprintNote(runId){
  try{
    if(runId && getWorldcard(runId) &&
       ((getWorldcard(runId).directorDefinitions||[]).length)) return "";
    const idx = (((window.__DATA__||{}).index)||[]).find(r=>r && r.run_id===runId);
    if(idx && idx.has_worldcard) return "";
  }catch(e){}
  return "当前无原著因果蓝图（仅蒸馏剧本自带）：导演按通用模式编排剧情节奏，不引用原著事件。";
}
/* 骨架屏占位：n 个 shimmer 条，替换纯文字"加载中…" */
function skeletonHTML(n){
  n = Math.max(1, Math.min(6, n || 3));
  const ws = [94, 82, 88, 76];
  let h = `<div class="skelwrap" aria-hidden="true">`;
  for(let i=0;i<n;i++) h += `<div class="skel" style="width:${ws[i%ws.length]}%"></div>`;
  return h + `</div>`;
}
/* 世界卡 coverage.gaps 管线黑话 → 用户可读文案 */
function humanizeGap(g){
  let s = String(g == null ? "" : g);
  const m = s.match(/主题层未命中(.+?)关键词/);
  if(m){
    const kinds = m[1].replace(/economy\/culture/g, "经济/文化").replace(/\//g, "、");
    return kinds + "相关描写较少，世界书暂未收录";
  }
  s = s.replace(/(\d+)\s*个?\s*chunk/gi, "$1 段文本");
  return s;
}
function showWorldcard(){
  const runId = RUN.run_id;
  _wcData = null;
  view.innerHTML = skeletonHTML(4);
  const typeName = {setting:"世界概览",lore:"世界暗线",npcs:"次要人物",factions:"阵营",items:"道具",rules:"世界规则",economy:"经济",culture:"文化"};
  const render = (wc)=>{
    if(!wc || !wc.worldBookEntries){
      /* P2-5: 加载失败 ≠ 确实没有数据，分开文案并给重试 */
      view.innerHTML = _wcFailed[runId]
        ? `<div class="empty">世界卡数据加载失败<br><span style="font-size:calc(12px * var(--fs));color:var(--muted,#888)">文件缺失或读取出错</span><br><button class="btn ghost" style="margin-top:10px" onclick="retryWorldcard()">重试</button></div>`
        : `<div class="empty">暂无世界卡数据<br><span style="font-size:calc(12px * var(--fs));color:var(--muted,#888)">管线执行 worldcard 阶段后自动出现</span></div>`;
      prependRunBanner();
      return;
    }
    _wcData = wc;
    const entries = wc.worldBookEntries;
    const dd = (wc.directorDefinitions||[])[0] || {};
    const stages = dd.stages||[], nodes = dd.nodes||[], actors = dd.characters||[];
    const gaps = (dd.coverage||{}).gaps||[];
    const types = {};
    entries.forEach(e=>{ (types[e.entryType]=types[e.entryType]||[]).push(e); });
    const head = `<div class="card"><div class="kvline"><b>${esc(wc.name||"世界卡")}</b> `
      + `<span class="badge" title="世界卡对原著内容的覆盖情况">${wc.novelMaterialStatus==="complete"?"完整":"部分覆盖"}</span></div>`
      + `<div class="statgrid">`
      + `<div class="stat"><div class="v">${entries.length}</div><div class="k">世界书</div></div>`
      + `<div class="stat"><div class="v">${stages.length}</div><div class="k">导演分幕</div></div>`
      + `<div class="stat"><div class="v">${nodes.length}</div><div class="k">剧情节点</div></div>`
      + `<div class="stat"><div class="v">${actors.length}</div><div class="k">演员</div></div>`
      + `</div>`
      + (gaps.length?`<div class="kvline" style="color:var(--muted,#888);font-size:calc(12px * var(--fs))">待补：${esc(gaps.slice(0,3).map(humanizeGap).join("；"))}${gaps.length>3?"…":""}</div>`:"")
      + `</div>`;
    const conflict = dd.coreConflict
      ? `<h2 class="sec">核心冲突</h2><div class="card"><div class="st">${esc(dd.coreConflict)}</div>`
        + ((dd.anchors||[]).length?`<div class="wb-keys">${dd.anchors.map(a=>`<span class="badge">${esc(a)}</span>`).join("")}</div>`:"") + `</div>`
      : "";
    const stageHtml = stages.length ? `<h2 class="sec">导演分幕 · ${stages.length}</h2>` + stages.slice(0,40).map(s=>{
      const ns = nodes.filter(n=>n.stageId===s.id);
      return `<details class="card"><summary><b>${esc(s.title)}</b> <span class="badge">${ns.length} 节点</span></summary>`
        + (s.description?`<div class="st" style="margin:6px 0">${esc(s.description)}</div>`:"")
        + ns.slice(0,30).map(n=>`<div class="sec-item"><div class="t">${esc(n.title||"")}${n.execution==="foreground"?' <span class="badge">前台</span>':""}</div><div class="r">${esc((n.intent||"").slice(0,60))}</div></div>`).join("")
        + (ns.length>30?`<div class="r">…还有 ${ns.length-30} 个节点</div>`:"") + `</details>`;
    }).join("") : "";
    const search = `<h2 class="sec">世界书检索</h2><div class="card">`
      + `<div class="searchwrap"><input id="wc-q" placeholder="搜世界书…（如：伏魔殿）" oninput="wcSearch()"></div>`
      + `<div class="wb-keys">` + Object.keys(types).map(k=>`<span class="badge">${esc(typeName[k]||k)} ${types[k].length}</span>`).join("") + `</div>`
      + `<div id="wc-res" style="margin-top:8px"></div></div>`;
    const npcList = types.npcs||[];
    const npcHtml = npcList.length ? `<h2 class="sec">次要人物 · ${npcList.length}</h2>`
      + npcList.slice(0,60).map(e=>`<div class="rel"><div class="pair">${esc((e.key||[])[0]||"")}</div><div class="st">${esc(e.content||"").replace(/\n/g,"<br>")}</div></div>`).join("")
      + (npcList.length>60?`<div class="empty">…还有 ${npcList.length-60} 人，用上方检索查找</div>`:"") : "";
    const itemList = types.items||[];
    const itemHtml = itemList.length ? `<h2 class="sec">道具 · ${itemList.length}</h2>`
      + itemList.map(e=>`<div class="sec-item"><div class="t">${esc(e.content||"")}</div></div>`).join("") : "";
    view.innerHTML = head + conflict + stageHtml + search + npcHtml + itemHtml;
    prependRunBanner();
    window.scrollTo(0,0);
  };
  loadWorldcard(runId).then(function(wc){ if(TAB === "world") render(wc); });
}
function wcSearch(){
  const qEl = document.getElementById("wc-q"), box = document.getElementById("wc-res");
  if(!box || !_wcData) return;
  const kw = ((qEl&&qEl.value)||"").trim();
  if(!kw){ box.innerHTML = ""; return; }
  const hits = _wcData.worldBookEntries.filter(e=>
    (e.content||"").indexOf(kw)>=0 || (e.comment||"").indexOf(kw)>=0 ||
    (e.key||[]).join(" ").indexOf(kw)>=0).slice(0,50);
  box.innerHTML = hits.map(e=>`<div class="rel"><div class="pair">${esc(e.comment||"")} <span class="badge">${esc(e.entryType||"")}</span></div><div class="st">${esc((e.content||"").slice(0,200))}</div></div>`).join("")
    || `<div class="empty">无匹配<br><button class="btn ghost sm" style="margin-top:8px" onclick="wcClearSearch()">清空搜索</button></div>`;
}
window.wcClearSearch = ()=>{
  const qEl = document.getElementById("wc-q");
  if(qEl) qEl.value = "";
  wcSearch();
};

function showMore(){
/* 伏笔二级拆包（data.js 拆包之二）：foreshadowing 不在 run 文件里，
   未就绪先拉再渲染；下面 RUN.foreshadowing.length 不容 undefined。 */
if(RUN && RUN.run_id && RUN.foreshadowing === undefined && typeof RP_LAZY !== "undefined"){
  var _rid = RUN.run_id;
  view.innerHTML = `<div class="empty">正在加载伏笔数据…</div>`;
  RP_LAZY.ensureRunFs(_rid).then(function(){ if(TAB === "more") showMore(); })
    .catch(function(e){ runLoadingFailed(e, function(){ showMore(); }); });
  return;
}
const wb = RUN.worldbook;
let wbHtml = "";
if(wb && wb.length){
const cats = {};
wb.forEach(e=>{ (cats[e.category||"其他"] = cats[e.category||"其他"]||[]).push(e); });
wbHtml = `<h2 class="sec">世界观 · ${wb.length} 条</h2>
<div class="btnrow" style="margin-bottom:10px"><button class="btn ghost" onclick="loreEditor(RUN.run_id,'more')">${icon("edit")} 管理世界书</button></div>` + Object.keys(cats).map(c=>
`<div class="wb-cat">${esc(c)}</div>` + cats[c].map(e=>{ const n = normLore(e, 0); return `
<div class="rel"><div class="pair">${esc(loreTitle(n,0))}</div>
<div class="st">${esc(n.content||"")}</div>
${(n.key||[]).length?`<div class="wb-keys">${n.key.map(k=>`<span class="badge">${esc(k)}</span>`).join("")}</div>`:""}
${n.probability<100?`<div class="wb-keys"><span class="badge">概率 ${n.probability}%</span></div>`:""}
</div>`;}).join("")).join("");
}
const arcHtml = `<h2 class="sec">人物弧光 · ${RUN.arcs.length}</h2>` +
(RUN.arcs.map(a=>`<div class="card"><div class="name">${esc(a.character||a.name||"")}</div>
<div class="meta">${esc(a.arc_type||"")}</div>
<div class="md">${md(a.summary||a.description||"")}</div></div>`).join("") || `<div class="empty">暂无弧光</div>`);
const fsHtml = `<h2 class="sec">伏笔 · ${RUN.foreshadowing.length}</h2>` +
(RUN.foreshadowing.slice(0,50).map(f=>`
<div class="sec-item"><div class="t">${esc(f.hook||"")}</div>
<div class="r">${esc(f.status||"")} ${esc(f.payoff_chunk||"")}</div></div>`).join("") ||
`<div class="empty">暂无伏笔</div>`);
const cfHtml = `<h2 class="sec">冲突点 · ${RUN.conflicts.length}</h2>` +
(RUN.conflicts.slice(0,50).map(c=>`
<div class="sec-item"><div class="t">${esc(c.title||c.desc||"")}</div>
<div class="r">${esc(c.chunk_range||c.evidence||"")}</div></div>`).join("") ||
`<div class="empty">暂无冲突点</div>`);
/* P0 红学三项: 方法论声明置顶, 判词曲紧随伏笔(应验链接), 脂批殿后 */
/* v41 空态：弧光/伏笔/冲突点为 0 的节不再各占一个「· 0」标题 + 空块，合成一行说明 */
const _emptySecs = [[RUN.arcs,"人物弧光"],[RUN.foreshadowing,"伏笔"],[RUN.conflicts,"冲突点"]].filter(x=>!(x[0]||[]).length).map(x=>x[1]);
const _emptyLine = _emptySecs.length ? `<div class="hint" style="margin:14px 2px">本书暂无${_emptySecs.join("、")}数据</div>` : "";
view.innerHTML = methodologyCard() + wbHtml + ((RUN.arcs||[]).length ? arcHtml : "") + ((RUN.foreshadowing||[]).length ? fsHtml : "") + foretellHtml() + ((RUN.conflicts||[]).length ? cfHtml : "") + zhipiHtml() + _emptyLine;
}
/* 立绘取卡 (B11): 蒸馏 run 从 __DATA__.rp_cards[runId] 取; 导入卡在 rp_cards 里没有这个键,
   恒 f={} —— 回落卡片库(判 RP_CARDIMPORT 在场)。外貌相关字段名取自 rp/prompt.js 的 LABELS:
   appearance_feature(外貌) / visual_identity(视觉识别) / physical_marks(身体印记) /
   voice_dressing(声音着装)。ST 卡导入不写这些字段, 此时该段留空, 绝不编造。 */
function portraitCardFor(runId, name){
  try{
    const cards = ((window.__DATA__||{}).rp_cards||{})[runId]||[];
    const c = cards.find(x=>x.name===(name||"")) || null;
    /* 蒸馏 run 已有真 run 时, rp_cards 里查不到就是真没有, 不拿同名导入卡串味 */
    if(c || (((window.__DATA__||{}).runs||{})[runId])) return c;
  }catch(e){}
  try{
    if(typeof RP_CARDIMPORT!=="undefined") return RP_CARDIMPORT.find(name||"") || null;
  }catch(e){}
  return null;
}
/* 卡片里到底有没有外貌可用文本 (genPortrait 的提示门禁) */
function hasAppearanceFor(runId, name){
  const f = ((portraitCardFor(runId, name)||{}).fields)||{};
  return [f.appearance_feature, f.visual_identity, f.physical_marks]
    .some(v=>String(v==null?"":v).trim()!=="");
}
/* 卡上没有外貌文本时, 生图浮层里的一行引导 (B11)。prompt 那一段留空, 不编造长相。 */
function portraitNoAppHint(runId, name){
  if(hasAppearanceFor(runId, name)) return "";
  return `<div class="hint" style="margin:6px 0">这张卡没有外貌描述，prompt 的「外貌」一栏留空（不编造长相）。
    可到「穿越 › 我的卡」点该卡的「编辑」，在角色字段的「外貌（appearance_feature）」补一句再生成。</div>`;
}
function portraitPrompt(runId, name){
const c = portraitCardFor(runId, name);
const f = (c&&c.fields)||{};
const novel = ((window.__DATA__||{}).runs||{})[runId];
const nv = (novel&&novel.novel)||((c&&c.novel)||"");
return `中国古典小说人物立绘，${name}，《${nv}》中的人物。外貌：${f.appearance_feature||f.visual_identity||""}。气质服饰：${f.voice_dressing||""}。工笔国风插画风格，半身像，纯色背景，高质量。`;
}
window.genPortrait = (runId, name)=>{
const cfg = getCfg();
if(!cfg.key||!cfg.base||!cfg.imgModel){ alert("先去「我的 · 设置」填 API 地址/Key 和生图模型"); return; }
const prompt = portraitPrompt(runId, name);
const ov = document.createElement("div");
ov.className = "viewer";
ov.innerHTML = `<div class="vbox">
<div class="vhead"><span>${esc(name)} · 立绘</span><button onclick="this.closest('.viewer').remove()">✕</button></div>
<textarea id="v_prompt">${esc(prompt)}</textarea>
${portraitNoAppHint(runId, name)}
<div class="vimg" id="v_img"><div class="empty">点「生成」开始画</div></div>
<div class="btnrow">
<button class="btn" id="v_gen">${icon("palette")} 生成</button>
<button class="btn ghost" id="v_save" style="display:none">保存</button>
</div></div>`;
document.body.appendChild(ov);
ov.querySelector("#v_gen").onclick = async ()=>{
const box = ov.querySelector("#v_img");
box.innerHTML = `<div class="empty">画画中…（约十几秒）</div>`;
try{
const url = await RP_NET.generateImage(cfg, ov.querySelector("#v_prompt").value, cfg.imgModel);
/* v37 安全: 生图返回的 url 来自远端网关(不可信), 未转义直插 src 可被 " 截断属性注入。
 * 只放行 data:image/ 与 https:, 其余拒绝渲染。 */
const safeUrl = (typeof url === "string" && /^(data:image\/|https:\/\/)/i.test(url)) ? url : "";
if(!safeUrl){ box.innerHTML = `<div class="empty">失败：图片地址不合法</div>`; return; }
box.innerHTML = `<img src="${escH(safeUrl)}">`;
const sv = ov.querySelector("#v_save");
sv.style.display = "";
sv.onclick = ()=>{
const a = document.createElement("a");
a.href = url; a.download = name + "-立绘.png";
document.body.appendChild(a); a.click(); a.remove();
};
}catch(e){ box.innerHTML = `<div class="empty">失败：${esc(e.message)}</div>`; }
};
};

