/* 浮生 · app 分段 19：v42 界面层——聊天「人」的呈现（立绘背景、头像名牌、旁白/对白分排）、AI 提笔等待态
 * v42 新增（非迁移）。只提供渲染辅助函数，由 renderChat / twStart / paintChatBg 等在运行期调用；
 * 本文件载入期不调用任何其它分段里的东西（见 js/INDEX.md 加载规则）。 */

/* ---------- 角色画像 ---------- */
/* 内置画像里的「白底线描/木刻」（PIL 灰度均值 > 0.6，2026-10-23 离线测得）。
   深色界面上直接铺白底图是一块刺眼的灰板，这类图改成「反相 + 滤色」只留墨线；
   彩色/深底画像正常叠。真机 WebView 走 file://，canvas 取像素会被污染，没法运行时测，只能离线标。 */
const UI_LIGHT_ART = new Set([
  "data/charimg/honglou/jiabaoyu.jpg", "data/charimg/honglou/jiamu.jpg", "data/charimg/honglou/lindaiyu.jpg",
  "data/charimg/honglou/liulaolao.jpg", "data/charimg/honglou/qingwen.jpg", "data/charimg/honglou/qinzhong.jpg",
  "data/charimg/honglou/wangfuren.jpg", "data/charimg/honglou/wangxifeng.jpg", "data/charimg/honglou/xiren.jpg",
  "data/charimg/honglou/xuebaochai.jpg", "data/charimg/shuihu/gongsunsheng.png", "data/charimg/shuihu/likui.png",
  "data/charimg/shuihu/linchong.jpg", "data/charimg/shuihu/lujunyi.png", "data/charimg/shuihu/songjiang.jpg",
  "data/charimg/shuihu/wusong.png", "data/charimg/shuihu/wuyong.gif"
]);
/* 角色的画像：卡自带 img/avatar（导入卡、写卡）优先，否则查内置 CHARIMG。
   返回 {url, light, own}；own=卡自带（多为头像式构图，可直接裁成小头像）。 */
function charPortrait(runId, name){
  let card = null;
  try{ if(typeof RP !== "undefined" && RP.findCard) card = RP.findCard(runId, name); }catch(e){}
  const own = card && (card.img || card.avatar);
  if(own) return {url: String(own), light: false, own: true};
  let novel = (card && card.novel) || "";
  try{
    if(!novel){ const r = (INDEX || []).find(x => x.run_id === runId); if(r) novel = r.novel; }
    if(!novel){ const c = (allChars() || []).find(x => x.name === name && (!runId || x.runId === runId)) ||
                          (allChars() || []).find(x => x.name === name); if(c) novel = c.novel; }
  }catch(e){}
  let url = "";
  try{ url = charImg(novel, name); }catch(e){}
  return url ? {url: url, light: UI_LIGHT_ART.has(url), own: false} : null;
}
/* 小头像：卡自带头像用图，内置整幅插画（人在画里只占一角）裁成 24px 只剩一团线，改用印章式首字 */
function chatAvatarHTML(runId, name, cls){
  const p = name ? charPortrait(runId, name) : null;
  const ch = esc(String(name || "?")[0]);
  if(p && p.own) return `<span class="mav ${cls || ""}" aria-hidden="true"><img src="${esc(p.url)}" alt="" loading="lazy" onerror="this.remove()">${ch}</span>`;
  return `<span class="mav ${cls || ""}" aria-hidden="true">${ch}</span>`;
}
/* AI 消息名牌：头像 + 名字（单聊/群聊/穿越都显示；穿越的「世界」用卷轴图标） */
function chatWhoHTML(name){
  if(CHAT.mode === "traverse") return `<div class="who whoav"><span class="mav mav-ic" aria-hidden="true">${icon("scroll", 13)}</span><span class="mname">${esc(name)}</span></div>`;
  const rid = CHAT.runId;
  return `<div class="who whoav">${chatAvatarHTML(rid, name)}<span class="mname">${esc(name)}</span></div>`;
}

/* ---------- v42-10 等待态：「X正在提笔…」 ----------
 * 流式已开始、还没有 #live 气泡时，在聊天末尾放一行头像 + 「{角色名}正在提笔…」+ 金色墨点。
 * id 固定为 typing：streamToken 首个 token 到达时会移除它；setStreaming(false)（停止/出错/完成的 finally）也会移除。
 * 群聊：已知下一位发言者用其名，否则「对方」；穿越：「世界」。 */
function penWaitName(){
  let sp = null;
  try{ sp = (typeof STREAM_SPEAKER !== "undefined") ? STREAM_SPEAKER : null; }catch(e){ sp = null; }
  if(CHAT.mode === "group") return sp || "对方";
  if(CHAT.mode === "traverse") return sp || "世界";
  return sp || CHAT.name || "对方";
}
function penWaitHTML(name){
  return `<div class="msg penwait" id="typing" role="status" aria-live="polite"><div class="msgcol">`
    + `<div class="who whoav penwait-row">${CHAT.mode === "traverse" ? `<span class="mav mav-ic" aria-hidden="true">${icon("scroll", 13)}</span>` : chatAvatarHTML(CHAT.runId, name)}`
    + `<span class="penwait-t">${esc(name)}正在提笔…</span>`
    + `<span class="penwait-ink" aria-hidden="true"><i></i><i></i><i></i></span></div></div></div>`;
}
function hidePenWait(){ const t = document.getElementById("typing"); if(t) t.remove(); }
function showPenWait(){
  const streaming = (typeof window.__isStreaming === "function") ? window.__isStreaming() : false;
  if(!streaming || document.getElementById("live")) return;
  const log = document.getElementById("chatlog");
  if(!log) return;
  hidePenWait();
  const emp = log.querySelector(".empty"); if(emp) emp.remove();
  log.insertAdjacentHTML("beforeend", penWaitHTML(penWaitName()));
  try{ log.scrollTop = log.scrollHeight; }catch(e){}
}
window.showPenWait = showPenWait;
window.hidePenWait = hidePenWait;

/* ---------- 立绘背景 ---------- */
/* 当前聊天该铺谁的立绘：单聊 = 角色；群聊 = 最近一位发言者（没人说过话取第一位成员）；穿越不铺（世界自带背景） */
function chatPortraitWho(){
  if(CHAT.mode === "traverse") return null;
  if(CHAT.mode === "group"){
    try{
      const h = getHistSafe(chatHistKey());
      for(let i = h.length - 1; i >= 0; i--) if(h[i].role === "assistant" && h[i].speaker) return h[i].speaker;
    }catch(e){}
    return (CHAT.members || [])[0] || null;
  }
  return CHAT.name || null;
}
/* 用户自己设过壁纸（单聊或全局）就尊重壁纸，不再叠立绘；否则在山水底图上叠一层淡立绘 */
function paintChatPortrait(){
  const el = document.getElementById("chatbgchar");
  if(!el) return;
  let userWall = false;
  try{ const o = getWallOpts(), g = getGlobalWallOpts(); userWall = !!((o && o.url) || (g && g.url)); }catch(e){}
  const who = userWall ? null : chatPortraitWho();
  const p = who ? charPortrait(CHAT.runId, who) : null;
  const url = p ? p.url : "";
  if(el.dataset.url === url) return;
  el.dataset.url = url;
  el.classList.remove("on");
  const bg = el.parentNode;
  if(bg && bg.classList) bg.classList.remove("has-por");
  if(!url){ el.style.backgroundImage = ""; return; }
  const probe = new Image();
  probe.onload = ()=>{ if(el.dataset.url !== url) return;
    el.style.backgroundImage = `url("${url}")`; el.classList.toggle("inv", !!p.light); el.classList.add("on");
    if(bg && bg.classList) bg.classList.add("has-por"); };
  probe.onerror = ()=>{ if(el.dataset.url === url){ el.style.backgroundImage = ""; el.classList.remove("on"); } };
  probe.src = url;
}

/* ---------- 旁白 / 对白分排 ----------
 * 模型输出的常见写法（本 app 的 prompt 不强制格式，导入卡/预设各有习惯）：
 *   1) 引号对白：「……」“……”『……』"……"，引号外是叙述；
 *   2) *动作* 或 （动作）/(动作) 包起来的舞台说明，其余是台词；
 *   3) 什么记号都没有——整段当台词（与 v41 一样一个气泡，不误判成旁白）。
 * 规则：引号内 = 对白；*…* / （…）内 = 旁白；无记号的散文——全文出现过引号则是旁白，否则是对白。
 * 在 md() 产出的 HTML 上做：逐段切成「旁白块 / 对白块」，跨块时把打开的行内标签（<b>/<mark>/<code>）
 * 先闭合再在下一块重开，保证每块都是合法 HTML；相邻同类块合并。 */
const SEG_Q = "\uE010"; /* &quot; 的占位，避免把实体拆开 */
const SEG_OPEN = {"「":"」", "“":"”", "『":"』"};
SEG_OPEN[SEG_Q] = SEG_Q;
function segSplitPara(inner, baseType){
  const toks = inner.replace(/&quot;/g, SEG_Q).split(/(<[^>]+>)/);
  const runs = []; const stack = [];
  let cur = {t: baseType, s: ""}, mode = "base", closer = "", depth = 0;
  const reopen = ()=> stack.map(x => x.open).join("");
  const flush = (nextType)=>{
    const closeTags = stack.slice().reverse().map(x => `</${x.name}>`).join("");
    runs.push({t: cur.t, s: cur.s + closeTags});
    cur = {t: nextType, s: reopen()};
  };
  for(const tk of toks){
    if(!tk) continue;
    if(tk[0] === "<"){
      const m = tk.match(/^<(\/)?([a-zA-Z0-9]+)/);
      if(m){
        if(m[1]){ for(let i = stack.length - 1; i >= 0; i--){ if(stack[i].name === m[2].toLowerCase()){ stack.splice(i, 1); break; } } }
        else if(!/\/>$/.test(tk) && !/^(br|img|hr|wbr)$/i.test(m[2])) stack.push({name: m[2].toLowerCase(), open: tk});
      }
      cur.s += tk; continue;
    }
    for(const ch of tk){
      if(mode === "base"){
        if(SEG_OPEN[ch]){ flush("dlg"); cur.s += ch; mode = "dlg"; closer = SEG_OPEN[ch]; }
        else if(ch === "*"){ flush("nar"); mode = "star"; }
        else if(ch === "（" || ch === "("){ flush("nar"); cur.s += ch; mode = "paren"; depth = 1; }
        else cur.s += ch;
      }else if(mode === "dlg"){
        cur.s += ch;
        if(ch === closer){ flush(baseType); mode = "base"; }
      }else if(mode === "star"){
        if(ch === "*"){ flush(baseType); mode = "base"; } else cur.s += ch;
      }else{ /* paren */
        cur.s += ch;
        if(ch === "（" || ch === "(") depth++;
        else if(ch === "）" || ch === ")"){ if(--depth <= 0){ flush(baseType); mode = "base"; } }
      }
    }
  }
  runs.push(cur);
  return runs.map(r => ({t: r.t, s: r.s.split(SEG_Q).join("&quot;")}))
    .filter(r => r.s.replace(/<[^>]*>/g, "").replace(/[\s\u3000]/g, "").length);
}
function chatSegHTML(html){
  html = String(html || "");
  const hasQuote = /[「“『]|&quot;/.test(html);
  const hasMark = hasQuote || /[*（(]/.test(html.replace(/<[^>]+>/g, ""));
  if(!hasMark) return `<div class="seg seg-dlg">${html}</div>`;
  const baseType = hasQuote ? "nar" : "dlg";
  const blocks = [];
  const push = (t, s)=>{ const last = blocks[blocks.length - 1]; if(last && last.t === t) last.s += s; else blocks.push({t: t, s: s}); };
  const re = /<(p|h[1-6]|blockquote|ul|ol|pre)\b[^>]*>[\s\S]*?<\/\1>/g;
  let m, at = 0;
  while((m = re.exec(html))){
    if(m.index > at){ const gap = html.slice(at, m.index); if(gap.trim()) push("dlg", gap); }
    at = re.lastIndex;
    if(m[1] === "p"){
      const inner = m[0].replace(/^<p\b[^>]*>/, "").replace(/<\/p>$/, "");
      segSplitPara(inner, baseType).forEach(r => push(r.t, `<p>${r.s}</p>`));
    }else push(m[1] === "blockquote" ? "nar" : "dlg", m[0]);
  }
  if(at < html.length){ const tail = html.slice(at); if(tail.trim()) push("dlg", tail); }
  if(!blocks.length) return `<div class="seg seg-dlg">${html}</div>`;
  return blocks.map(b => `<div class="seg seg-${b.t}">${b.s}</div>`).join("");
}
/* 哪些 AI 消息走分排：系统性提示（⚠️ 出错 / 【OOC / （已停止生成））保持原气泡 */
function chatSegEligible(m){
  if(!m || m.role !== "assistant") return false;
  const c = String(m.content || "");
  return c.indexOf("⚠️") !== 0 && c.indexOf("【OOC") !== 0 && c.indexOf("（已停止") !== 0;
}

/* ---------- 2. 角色页：大立绘头图 + 一句台词 + 性格关键词 ---------- */
/* 字段值可能是字符串，也可能是 {v, items:[...]}（蒸馏卡），统一摊平成若干行 */
function cardFieldLines(v){
  if(v == null) return [];
  if(Array.isArray(v)) return v.map(String);
  if(typeof v === "object") return [].concat(v.v ? [String(v.v)] : [], Array.isArray(v.items) ? v.items.map(String) : []);
  return [String(v)];
}
/* 去掉蒸馏证据标注 [S024-2]、列表符、包裹引号 */
function cardLineClean(s){
  return String(s || "").replace(/（\s*\[[^\]]*\]\s*）|\(\s*\[[^\]]*\]\s*\)|\[[A-Za-z]?\d[^\]]*\]/g, "")
    .replace(/^[\s\-–—·•\[\]'"]+|[\s\-–—\[\]'"]+$/g, "").replace(/-{3,}/g, "")
    .replace(/^[「“"『]+|[」”"』]+$/g, "").trim();
}
/* 一句台词：typical_lines 里挑 8–28 字、最接近 16 字的一句（太短不成句，太长一行放不下）；
   没有就退回身份一句话。全部取自卡上已有字段，不编造。 */
function cardQuote(card){
  const f = (card && card.fields) || {};
  const pool = [];
  cardFieldLines(f.typical_lines).forEach(l => String(l).split(/[；;\n]|(?<=^|[\s）)」”"\]])-\s|"\s+"/).forEach(x => {
    const c = cardLineClean(x); if(c) pool.push(c); }));
  let best = "", bd = 1e9;
  pool.forEach(c => { const n = c.length; if(n < 6 || n > 28) return; const d = Math.abs(n - 16); if(d < bd){ bd = d; best = c; } });
  if(best) return {text: best, quote: true};
  const ci = cardLineClean(cardFieldLines(f.core_identity)[0] || card.description || "");
  if(!ci) return null;
  const cut = ci.length > 30 ? (ci.slice(0, 30).match(/.*[，。；、！？]/) || [ci.slice(0, 30)])[0].replace(/[，；、]$/, "") : ci;
  return {text: cut, quote: false};
}
/* 性格关键词：core_traits → temperament_type → personality（导入卡），切成 2–6 字的短词，最多 5 个 */
function cardTraitTags(card){
  const f = (card && card.fields) || {};
  const out = [];
  [f.core_traits, f.temperament_type, f.personality, card && card.personality].forEach(v => {
    cardFieldLines(v).forEach(l => String(l).split(/[；;、,，。/|]/).forEach(x => {
      const c = cardLineClean(x).replace(/[（(][^）)]*[）)]/g, "").replace(/\s+/g, "");
      if(c.length >= 2 && c.length <= 6 && !/\d/.test(c) && out.indexOf(c) < 0 && out.length < 5) out.push(c);
    }));
  });
  return out;
}
function charHeroHTML(runId, nm, card, run){
  const p = charPortrait(runId, nm);
  const novel = (run && run.novel) || (card && card.novel) || "";
  const q = cardQuote(card || {});
  const traits = cardTraitTags(card || {});
  let st = null;
  try{ st = (typeof RP_STATS !== "undefined") ? RP_STATS.get(runId, nm) : null; }catch(e){}
  const img = p
    ? `<div class="chx-img${p.light ? " light" : ""}${p.own ? " own" : ""}" style="background-image:url(&quot;${esc(p.url)}&quot;)" role="img" aria-label="${esc(nm)}的画像"></div>`
    : `<div class="chx-img chx-noimg" aria-hidden="true"></div>`;
  return `<section class="chx" aria-label="${esc(nm)}">${img}<div class="chx-fade" aria-hidden="true"></div>`
    + `<button class="chx-back" onclick="detailBack()" aria-label="返回">${icon("back", 18)}</button>`
    + `<div class="chx-acts">`
    + `<button class="chx-act${st && st.fav ? " on" : ""}" onclick="toggleFavUI()" aria-pressed="${st && st.fav ? "true" : "false"}">${st && st.fav ? "★ 已收藏" : "☆ 收藏"}</button>`
    + `<button class="chx-act${st && st.like ? " on" : ""}" onclick="toggleLikeUI()" aria-pressed="${st && st.like ? "true" : "false"}">${icon("thumb-up", 14)} ${st && st.like ? "已点赞" : "点赞"}</button>`
    + `</div>`
    + `<div class="chx-txt"><div class="chx-name">${esc(nm)}</div>`
    + (novel ? `<div class="chx-novel">${esc(novel)}</div>` : "")
    + (q ? `<div class="chx-quote${q.quote ? "" : " plain"}">${q.quote ? "「" + esc(q.text) + "」" : esc(q.text)}</div>` : "")
    + (traits.length ? `<div class="chx-tags">` + traits.map(t => `<span class="chx-tag">${esc(t)}</span>`).join("") + `</div>` : "")
    + `</div></section>`;
}

/* ---------- 3. 书架：继续上次 / 最近聊过 / 书封结识进度 ---------- */
/* 游玩统计原样读（RP_STATS 不暴露全量列表；只读不写） */
function shelfStatsAll(){
  try{ const d = JSON.parse(localStorage.getItem("nd_playstats_v1")); return (d && typeof d === "object") ? d : {}; }catch(e){ return {}; }
}
function shelfNovelOf(runId){
  if(runId === "custom") return "自创角色";
  if(runId === "imported") return "导入角色卡";
  const r = (INDEX || []).find(x => x.run_id === runId);
  return r ? r.novel : "";
}
/* 最近聊过：按最后活跃时间倒序（开过局的才算） */
function shelfRecent(n){
  const d = shelfStatsAll();
  return Object.keys(d).map(k => { const i = k.indexOf("|"); return {runId: k.slice(0, i), name: k.slice(i + 1), st: d[k] || {}}; })
    .filter(x => x.runId && x.name && (x.st.s > 0 || x.st.t > 0))
    .sort((a, b) => (b.st.last || 0) - (a.st.last || 0)).slice(0, n || 10);
}
/* 上次聊天：nd_chat_last（startChat/switchChat 写入）+ 该会话确有记录 */
function shelfLastChat(){
  let v = null;
  try{ v = localStorage.getItem("nd_chat_last"); }catch(e){}
  if(!v || v.indexOf("|") < 0) return null;
  const i = v.indexOf("|"), runId = v.slice(0, i), name = v.slice(i + 1);
  let h = [];
  try{ h = getHistSafe(chatKey(runId, name)); }catch(e){}
  const st = shelfStatsAll()[v] || {};
  if(!h.length && !(st.s > 0)) return null;
  let snip = "";
  for(let j = h.length - 1; j >= 0; j--){ if(h[j] && h[j].role === "assistant" && h[j].content){ snip = String(h[j].content); break; } }
  snip = snip.replace(/[*#>`]/g, "").replace(/\s+/g, " ").trim();
  return {runId: runId, name: name, novel: shelfNovelOf(runId), snip: snip.length > 40 ? snip.slice(0, 40) + "…" : snip, turns: st.t || 0};
}
window.resumeLastChat = ()=>{ const l = shelfLastChat(); if(l) startChat(l.runId, l.name); };
/* 每本书「已结识 X/Y 人」：开过局的角色数 / 书中角色数 */
function shelfBookProgress(r){
  const total = (r.characters || []).length;
  if(!total) return null;
  const d = shelfStatsAll();
  const met = r.characters.filter(n => { const s = d[r.run_id + "|" + n]; return s && (s.s > 0 || s.t > 0); }).length;
  return met ? {met: met, total: total, pct: Math.round(met * 100 / total)} : null;
}
function shelfTopHTML(){
  const last = shelfLastChat();
  const recent = shelfRecent(10);
  let h = "";
  if(last){
    const p = charPortrait(last.runId, last.name);
    h += `<button class="resume" onclick="resumeLastChat()" aria-label="继续上次：和${esc(last.name)}的聊天">`
      + (p ? `<span class="resume-img${p.light ? " light" : ""}" style="background-image:url(&quot;${esc(p.url)}&quot;)" aria-hidden="true"></span>` : "")
      + `<span class="resume-txt"><span class="resume-k">继续上次</span>`
      + `<span class="resume-n">${esc(last.name)}<span class="resume-b">${esc(last.novel ? "《" + last.novel + "》" : "")}</span></span>`
      + (last.snip ? `<span class="resume-s">${esc(last.snip)}</span>` : "")
      + `</span><span class="resume-go" aria-hidden="true">${icon("chat", 16)} 续聊</span></button>`;
  }
  if(recent.length){
    h += `<h2 class="sec shelf-sec">最近聊过</h2><div class="recentrow" data-xfade>`
      + recent.map(x => `<button class="recent" onclick="startChat('${jq(x.runId)}','${jq(x.name)}')">`
        + chatAvatarHTML(x.runId, x.name, "lg")
        + `<span class="recent-n">${esc(x.name)}</span><span class="recent-b">${esc(shelfNovelOf(x.runId))}</span></button>`).join("")
      + `</div>`;
  }
  if(!last && !recent.length){
    h += `<div class="shelf-empty"><img src="bg/empty_state.jpg" alt="" aria-hidden="true"><div class="shelf-empty-t">还没有聊过的人</div>`
      + `<div class="shelf-empty-s">挑一本书翻开，书里的人都在等你开口。聊过之后，这里会留着「继续上次」。</div></div>`;
  }
  return h + `<h2 class="sec shelf-sec">书架</h2>`;
}

/* ---------- 4. 底栏四栏：创作中心 / 我的 ---------- */
/* 创作：原「蒸馏 / 穿越 / 写卡」三个顶层页收进这里，路由名与函数都不变（setNav('distill') 等照常可用） */
function showCreateHub(){
  __backAction = null;
  document.body.classList.remove("chatmode", "immersive");
  titleEl.textContent = "创作"; subEl.textContent = "蒸馏一本书 · 穿进书里 · 写一张卡";
  const tiles = [
    {nav: "distill", ic: "sparkles", seal: "蒸", name: "蒸馏", desc: "把一部小说蒸馏成可对话的角色、剧情线与世界书"},
    {nav: "traverse", ic: "masks", seal: "穿", name: "穿越", desc: "魂穿、走原著线、肉身穿越、组团——进入书里活"},
    {nav: "writer", ic: "edit", seal: "写", name: "写卡", desc: "从零写一张角色卡，或导入 / 编辑已有的卡"},
  ];
  view.innerHTML = `<div class="hubgrid">` + tiles.map(t =>
    `<button class="hubtile" onclick="setNav('${jq(t.nav)}')"><span class="hub-seal" aria-hidden="true">${t.seal}</span>`
    + `<span class="hub-ic" aria-hidden="true">${icon(t.ic, 22)}</span>`
    + `<span class="hub-n">${t.name}</span><span class="hub-d">${t.desc}</span><span class="hub-go" aria-hidden="true">›</span></button>`).join("")
    + `</div>`
    + `<button class="hubassist" onclick="openAssistant()"><span class="hub-ic" aria-hidden="true">${icon("lightbulb", 18)}</span>`
    + `<span><span class="hub-n">浮生小助手</span><span class="hub-d">不知道从哪下手？问它功能怎么用，或让它帮你建角色、写世界书</span></span></button>`;
}
/* 我的：原「设置」整页 + 顶部一块本机游玩统计（数据只读 nd_playstats_v1，纯本地） */
function meStatsHTML(){
  const d = shelfStatsAll();
  let s = 0, t = 0, tok = 0, met = 0, fav = [];
  Object.keys(d).forEach(k => { const x = d[k] || {};
    s += x.s || 0; t += x.t || 0; tok += (x.pi || 0) + (x.po || 0);
    if(x.s > 0 || x.t > 0) met++;
    if(x.fav){ const i = k.indexOf("|"); fav.push({runId: k.slice(0, i), name: k.slice(i + 1)}); } });
  const F = (typeof RP_STATS !== "undefined" && RP_STATS.fmt) ? RP_STATS.fmt : (n => String(n));
  return `<div class="mehead"><div class="me-t">我的浮生</div>`
    + `<div class="megrid">`
    + `<div class="mecell"><b>${met}</b><span>结识角色</span></div>`
    + `<div class="mecell"><b>${s}</b><span>开局次数</span></div>`
    + `<div class="mecell"><b>${t}</b><span>对话轮数</span></div>`
    + `<div class="mecell"><b>${F(tok)}</b><span>约 tokens</span></div>`
    + `</div>`
    + (fav.length ? `<div class="me-fav"><span class="kv">收藏</span><div class="recentrow" data-xfade>` + fav.map(x =>
        `<button class="recent" onclick="charDetail('${jq(x.runId)}','${jq(x.name)}')">${chatAvatarHTML(x.runId, x.name, "lg")}<span class="recent-n">${esc(x.name)}</span></button>`).join("") + `</div></div>` : "")
    + `<div class="kv me-note">统计只存本机，token 为估算值</div></div>`;
}
function showMe(){
  showSettings();
  titleEl.textContent = "我的"; subEl.textContent = "游玩数据 · 设置";
  try{ view.insertAdjacentHTML("afterbegin", meStatsHTML()); }catch(e){}
}

/* ---------- 7. 墨晕转场 ---------- */
/* #view 的直接子节点被整体替换、且「页面签名」（NAV + 标题 + 首节点类名）变了，才算换页——
   蒸馏进度轮询之类的同页重绘不触发。首屏（boot）不放，遵守 DESIGN.md「首屏不做无用户意图的动效」。
   墨晕从最近一次点按的位置洇开。纯装饰：reduced-motion 下 CSS 直接 display:none。 */
(function(){
  try{
    if(typeof document === "undefined" || typeof MutationObserver === "undefined" || !document.getElementById) return;
    const v = document.getElementById("view"); if(!v || !v.nodeType) return;
    let fx = null, last = null, armed = false, tx = 50, ty = 45;
    document.addEventListener("pointerdown", (e)=>{ try{ tx = Math.round(e.clientX / window.innerWidth * 100); ty = Math.round(e.clientY / window.innerHeight * 100); }catch(_){} }, {passive: true, capture: true});
    const sig = ()=>{ const t = document.getElementById("title"); const f = v.firstElementChild;
      return (typeof NAV !== "undefined" ? NAV : "") + "|" + (t ? t.textContent : "") + "|" + (f ? f.className : ""); };
    new MutationObserver(()=>{
      const s = sig();
      if(s === last) return;
      const first = last === null; last = s;
      if(first || !armed) return;
      if(!fx){ fx = document.createElement("div"); fx.id = "inkfx"; fx.setAttribute("aria-hidden", "true"); document.body.appendChild(fx); }
      fx.style.setProperty("--ink-x", tx + "%"); fx.style.setProperty("--ink-y", ty + "%");
      fx.style.transformOrigin = tx + "% " + ty + "%";
      fx.classList.remove("go"); void fx.offsetWidth; fx.classList.add("go");
    }).observe(v, {childList: true});
    /* 首屏渲染完之后才开始放 */
    setTimeout(()=>{ armed = true; }, 1500);
  }catch(e){}
})();
