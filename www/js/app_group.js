/* 浮生 · app 分段 07：群聊 + 群聊角色关系编辑器
 * v41 从 app.js 原样迁出（原 app.js 第 1903–2095 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ================= 群聊 ================= */
async function showGroupChat(cfg){
/* 群成员可能跨 run：开群前确保全量 run 数据就绪（失败有兜底，不阻断） */
try{ await RP_LAZY.ensureAllRuns(); }catch(e){}
__backAction = ()=>exitChat();
try{ if(CHAT.runId) loadWorldcard(CHAT.runId); }catch(e){} /* 世界卡预热，fire-and-forget */
const ms = CHAT.members;
const k = chatHistKey();
const gkey = ms.slice().sort().join("_");
const gorder = RP_GROUP.getOrder(CHAT.runId, gkey);
const stack = ms.slice(0,4).map(n=>avatarHTML(CHAT.runId, n, "sm stacka")).join("");
await warmFonts(); /* 先把字体等回来再画历史，避免整页换字重排闪烁 */
await warmWallpaper(); await warmGlobalWall(); await warmChatMedia(); /* 先读用户壁纸与本聊天图片，避免连环 pop-in */
view.innerHTML = `
${chatBgHTML()}
<div class="chathead" id="chathead">
<button class="backbtn" onclick="exitChat()">‹</button>
<div class="stack">${stack}</div>
<div class="cname">群聊 · ${ms.length} 人<span class="aimark">AI</span><small>${esc(ms.join("、"))}</small> <span id="chapter_hbadge" style="display:none;font-size:calc(11px * var(--fs));color:var(--gold);border:1px solid var(--line-soft);border-radius:999px;padding:1px 8px;cursor:pointer" onclick="chapterPicker()"></span></div>
<button class="menubtn" onclick="toggleChatSearch()" title="搜索聊天记录">${icon("search")}</button>
<button class="menubtn" onclick="toggleDrawer(true)" title="菜单">${icon("menu")}</button>
</div>
<div class="chatwrap">
<div id="ctxbar"></div>
<div id="chatsearch"></div>
<div id="chatlog"></div>
<div id="scenbar" class="scenbar"></div>
<div class="chatbar">${chatbarInner(STREAMING)}</div>
</div>
<div class="scrim" id="scrim" onclick="toggleDrawer(false)"></div>
<div class="drawer" id="drawer">
<div class="dgrid"><button class="dtile" onclick="toggleDrawer(false);openSaves()"><span class="dtile-ic" aria-hidden="true">${icon("save",22)}</span><span class="dtile-lb">平行存档</span></button><button class="dtile" onclick="toggleDrawer(false);wallpaperEditor()"><span class="dtile-ic" aria-hidden="true">${icon("image",22)}</span><span class="dtile-lb">聊天壁纸</span></button><button class="dtile" onclick="toggleDrawer(false);plotEditor()"><span class="dtile-ic" aria-hidden="true">${icon("book-open",22)}</span><span class="dtile-lb">剧情线</span></button><button class="dtile" onclick="toggleDrawer(false);loreEditor('${jq(CHAT.runId)}','chat')"><span class="dtile-ic" aria-hidden="true">${icon("books",22)}</span><span class="dtile-lb">世界书</span></button></div>
<h3>发言顺序</h3>
<div class="povrow" style="margin-bottom:6px">
<button class="povchip ${gorder==="natural"?"on":""}" onclick="setGroupOrder('natural')">${icon("dice")} 自然发言</button>
<button class="povchip ${gorder==="list"?"on":""}" onclick="setGroupOrder('list')">${icon("repeat")} 按序轮流</button>
</div>
<div class="hint" style="margin:0 0 4px">自然：被点名者优先，其余按发言欲随机加入，一轮最多 3 人依次发言</div>
<h3>群聊成员 · 点名字定下一个人说</h3>
${ms.map(n=>{const tv=RP_GROUP.getTalk(CHAT.runId,n);
return `<div class="gmember"><button class="whoami ${CHAT.forcedSpeaker===n?"active":""}" onclick="forceSpeaker('${jq(n)}')">
${avatarHTML(CHAT.runId, n, "sm")}
<div><div class="name">${esc(n)}${CHAT.forcedSpeaker===n?" · 下一个说":""}</div></div>
</button><div class="talkrow"><span>发言欲</span><input type="range" min="0" max="100" step="5" value="${tv}" oninput="setTalkVal('${jq(n)}',this.value)"><b>${tv}</b></div></div>`;}).join("")}
<h3>角色关系 · 注入群聊 prompt</h3>
<div id="grelbox"></div>
<h3>叙事视角</h3>
${povChipsHTML()}
<h3>聊天</h3>
<button class="ditem" onclick="toggleDrawer(false);openAssistant()">${icon("lightbulb")} 浮生小助手</button>
<button class="ditem" onclick="toggleDrawer(false);showATasks()">${icon("chart")} 分析任务</button>
${chapterEntryHTML(false)}
<button class="ditem" onclick="toggleDrawer(false);personaEditor(null,'chat')">${icon("user")} 我的人设（全局）</button>
${foreEntryHTML()}
<button class="ditem danger" onclick="toggleDrawer(false);clearChat()">${icon("trash")} 清空聊天记录</button>
${drawerAdvHTML(`<button class="ditem" onclick="toggleDrawer(false);exportChat()">${icon("copy")} 复制聊天记录</button>
<button class="ditem" onclick="toggleDrawer(false);exportChatTxt()">${icon("download")} 导出聊天 TXT</button>
<button class="ditem" onclick="toggleDrawer(false);exportChatJsonl()">${icon("download")} 导出 ST JSONL</button>
<button class="ditem" onclick="toggleDrawer(false);regexEditor('${jq(CHAT.runId)}',null,'chat')">${icon("type")} 正则替换</button>
<button class="ditem" onclick="toggleDrawer(false);showSystem()">${icon("settings")} 人设 prompt 预览</button>`)}
<h3>设置</h3>
<button class="ditem" onclick="exitChatTo('settings')">${icon("settings")} 大模型与 RP 设置</button>
</div>
${!cfg.key?`<div class="hint" style="margin:10px 14px">还没配大模型接口，先去「我的 · 设置」里填 API 地址/Key/模型，聊天才能用。Key 只存在你手机上。</div>`:""}`;
attachHeadHide(); /* 先定栏位显隐再渲染，免进场滚动被钳走（同单聊） */
renderScenChips();
renderChat();
renderGRelBox();
paintChatBg();
updateChapterBadge();
/* 浮生暖系: soul 多智能体群聊时用暖系底 */
try{
  var _soulOn = (typeof RP_SOUL_ORCH !== "undefined") &&
    RP_SOUL_ORCH.shouldUseSoulMode(CHAT.runId, CHAT.members, soulChatId());
  var _v = document.getElementById("view");
  if(_v) _v.classList.toggle("soulwarm", !!_soulOn);
}catch(e){}
/* P0-2/P0-3: 读失败≠空历史，失败时直接返回，绝不写打招呼语覆盖。 */
let __gh0 = null;
try{ __gh0 = getHist(k); }catch(e){
const _glog = document.getElementById("chatlog");
if(_glog) _glog.innerHTML = `<div class="msg"><div class="msgcol"><div class="bubble">⚠️ 聊天记录读取失败（存储异常），未做任何写入。请稍后重进，历史数据仍在。</div></div></div>`;
return;
}
if(!__gh0.length){
const sp = ms[Math.floor(Math.random()*ms.length)];
const run = ((window.__DATA__||{}).runs||{})[CHAT.runId] || {};
RP.greeting(CHAT.runId, sp, cfg, run.novel).then(g=>{
let _gh2 = null;
try{ _gh2 = getHist(k); }catch(e){ return; }
if(_gh2.length) return;
saveHist(k, [{role:"assistant", speaker:sp, content:g, ts:Date.now()}]); renderChat();
});
}
}
window.forceSpeaker = (n)=>{
CHAT.forcedSpeaker = (CHAT.forcedSpeaker===n) ? null : n;
toggleDrawer(false); showChat();
};
window.setGroupOrder = (v)=>{
const gk = (CHAT.members||[]).slice().sort().join("_");
RP_GROUP.setOrder(CHAT.runId, gk, v);
toggleDrawer(false); showChat();
};
window.setTalkVal = (n, v)=>{
RP_GROUP.setTalk(CHAT.runId, n, v);
const b = event && event.target ? event.target.parentElement.querySelector("b") : null;
if(b) b.textContent = v;
};
/* ============ Tier3-22: 群聊抽屉里的角色关系编辑器 ============ */
function renderGRelBox(){
const box = document.getElementById("grelbox"); if(!box) return;
if(typeof RP_GROUP==="undefined" || CHAT.mode!=="group"){ box.innerHTML=""; return; }
const gkey = (CHAT.members||[]).slice().sort().join("_");
const rels = RP_GROUP.getRels(CHAT.runId, gkey);
const ms = CHAT.members||[];
const opt = (sel)=> ms.map(n=>`<option value="${esc(n)}"${n===sel?" selected":""}>${esc(n)}</option>`).join("");
box.innerHTML = (rels.length
? rels.map((r,i)=>`<div class="grelrow"><span>${esc(r.a)} 是 ${esc(r.b)} 的 ${esc(r.rel)}</span><button class="btn ghost" onclick="gRelDel(${jq(i)})">删</button></div>`).join("")
/* B8: 导入卡群聊没有 run, 也就不存在"蒸馏出的静态人物关系"可继承。
   这时候编辑器不假装有关系表可读, 老实说明: 关系得自己写, 写什么就是什么, AI 不补。 */
: `<div class="hint" style="margin:0 0 6px">${CHAT.runId === "imported"
? "导入卡之间没有共用的静态人物关系。这里写什么就是什么，会注入每轮群聊 prompt，AI 不会替你补。"
: '还没设定关系，如"林黛玉是贾宝玉的表妹"，会注入每轮群聊 prompt。'}</div>`)
 + `<div class="greladd"><select id="grel_a">${opt(ms[0])}</select><span>是</span><select id="grel_b">${opt(ms[1]||ms[0])}</select><span>的</span><input id="grel_r" placeholder="表妹/师徒…"><button class="btn" onclick="gRelAdd()">＋</button></div>`;
}
window.gRelAdd = ()=>{
const a = ($("#grel_a")||{}).value, b = ($("#grel_b")||{}).value, r = (($("#grel_r")||{}).value||"").trim();
if(!a || !b || !r){ alert("把 A / B / 关系都填上"); return; }
const gkey = (CHAT.members||[]).slice().sort().join("_");
RP_GROUP.addRel(CHAT.runId, gkey, a, b, r);
renderGRelBox();
};
window.gRelDel = (i)=>{
const gkey = (CHAT.members||[]).slice().sort().join("_");
RP_GROUP.delRel(CHAT.runId, gkey, i);
renderGRelBox();
};
function showChatPicker(){
/* allChars() 要全量 run 的角色列表：数据未齐先拉齐再渲染 */
if(guardAllRuns(function(){ showChatPicker(); })) return;
__backAction = null;
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
titleEl.textContent = "选个角色开聊";
subEl.textContent = "";
const cs = allChars();
/* 未配 API Key 时的瘦横幅（跳过新手引导的用户在这里被接住） */
let keyBanner = "";
try{ if(!(getCfg().key)) keyBanner = `<div class="apibanner" onclick="setNav('settings')"><span>⚠️ 还没配置 API Key，配好才能开始聊天</span><span class="ab-go">去设置 ›</span></div>`; }catch(e){}
if(!cs.length){
view.innerHTML = `<div class="empty"><span class="big">${icon("masks",44)}</span>还没有角色<br><span style="font-size:calc(12px * var(--fs))">去「创作 · 写卡」创建你的第一个角色</span><br><button class="btn" style="margin-top:10px" onclick="setNav('writer')">去写卡</button></div>`;
return;
}
/* P1 多轨道发现：最近玩过 / 我的收藏 / 换一批看看（横滑轨道，本地计算） */
const recent = recentPlayed(cs, 8);
let favs = [];
try{ favs = cs.filter(c=>{ try{ return RP_STATS.get(c.runId, c.name).fav; }catch(e){ return false; } }); }catch(e){}
const shuffled = shuffle(cs.slice()).slice(0, 8);
/* P1 分类 chips 带数量：按标签过滤全部角色 */
const counts = tagCountsOf(cs);
const active = window.PICKER_TAG || "";
const list = active ? cs.filter(c=>charTagsOf(c.runId, c.name).indexOf(active) >= 0) : cs;
/* B8: 导入卡组队入口。蒸馏 run 的群聊在 run 人物页里(发起群聊按钮), 导入卡没有 run,
   入口只能落在这个选人页 —— allChars() 里 runId==="imported" 的卡 ≥2 张才显示。 */
const _impCnt = (allChars() || []).filter(c => c.runId === "imported").length;
const groupEntry = _impCnt >= 2
  ? `<div class="btnrow" style="margin-bottom:10px"><button class="btn ghost" onclick="importedGroupPicker()">${icon("users")} 与其它导入卡组队 · ${_impCnt} 张</button></div>`
  : `<div class="hint hint-tight" style="margin:0 0 10px">导入卡还不满 2 张，暂时组不了群（导入 1 张就能开）。</div>`;
view.innerHTML = keyBanner + dailyStripHTML() + groupEntry +
(recent.length ? railHTML("🕘 最近玩过", recent) : "")
+ (favs.length ? railHTML("⭐ 我的收藏", favs) : "")
+ albumRailHTML()
+ railHTML(`🎲 换一批看看 <button class="btn ghost sm" style="margin-left:4px" onclick="event.stopPropagation();showChatPicker()">↻</button>`, shuffled)
+ chipsHTML(counts, active, cs.length)
+ `<h2 class="sec">全部角色 · ${list.length}</h2>`
+ (list.length ? `<div class="chargrid">` + list.map(c=>{
/* 游玩统计：卡片上显示开局次数与平均轮数（纯本地，RP_STATS） */
let _sum = charSumFor(c.runId,c.name)||"点我直接开聊";
let _stat = "";
try{
if(typeof RP_STATS !== "undefined"){
const _st = RP_STATS.get(c.runId, c.name);
if(_st.s > 0) _stat = "开局" + _st.s + "次 · 平均" + RP_STATS.avgTurns(_st).toFixed(0) + "轮/局";
}
}catch(e){}
return charCardHTML({name:c.name, tag:c.novel, img:charImg(c.novel, c.name), sum:_sum, stat:_stat,
oncard:`chatWith('${jq(c.runId)}','${jq(c.name)}')`,
ops:`<button class="go" onclick="event.stopPropagation();chatWith('${jq(c.runId)}','${jq(c.name)}')">开聊</button>`
+`<button onclick="event.stopPropagation();charDetail('${jq(c.runId)}','${jq(c.name)}','picker')">详情</button>`});
}).join("") + `</div>` : `<div class="empty">这个标签下还没有角色<br><button class="btn ghost sm" style="margin-top:8px" onclick="pickTag('')">清除筛选</button></div>`);
try{ window.scrollTo(0,0); }catch(e){}
}
