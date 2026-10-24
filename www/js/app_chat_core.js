/* 浮生 · app 分段 06：RP 聊天核心（历史读写、渲染签名）、沉浸背景、聊天壁纸/全局壁纸
 * v41 从 app.js 原样迁出（原 app.js 第 1379–1902 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ================= RP 聊天 (RP 引擎) ================= */
const CFG_KEY = "nd_api_cfg_v1";
const RPCFG_KEY = "nd_rp_cfg_v1";
const getCfg = ()=>{ try{return JSON.parse(localStorage.getItem(CFG_KEY))||{}}catch(e){return{}}};
const saveCfg = (c)=>{ try{ localStorage.setItem(CFG_KEY, JSON.stringify(c)); }catch(e){ try{ rpToastOnce(isQuotaErr(e) ? "存储空间已满，API 配置未保存" : "API 配置保存失败"); }catch(_){} } };
const getRpCfg = ()=> Object.assign({maxContext:8192, respTokens:512, summaryModel:"",
  temperature:0.9, topP:1, ooc:true, preset:"classic", optCards:false, optCount:4, optMood:"none", ttsAuto:false, typewriter:true,
  worldsim:true, wsPerMsg:3, wsStepMin:30, wsWxAuto:true, wsWxEvery:5, temporal:true, leanmem:true,
  apex:true,
  memCycle:10, memPoolRatio:"50/30/20",
  memWindowN:60, /* Tier2 #12 新聊天记忆窗口, 默认 60 条 */
  ppaMode:"key", ppaModel:"",
  director:true, directorTier:"sentinel", directorStyle:"slowburn", directorEvery:5, directorStale:8, directorModel:""}, (function(){ try{ return JSON.parse(localStorage.getItem(RPCFG_KEY)||"{}") || {}; }catch(e){ return {}; } })());
const saveRpCfg = (c)=>{ try{ localStorage.setItem(RPCFG_KEY, JSON.stringify(c)); }catch(e){ try{ rpToastOnce(isQuotaErr(e) ? "存储空间已满，RP 设置未保存" : "RP 设置保存失败"); }catch(_){} } };
/* v37: 解析当前绑定的 ST 预设对象(未绑定返回 null); 传给 prompt 构建做预设组装 */
function resolveStPreset(){
try{
if(typeof RP_PRESET === "undefined") return null;
return RP_PRESET.get(getRpCfg().stPreset) || null;
}catch(e){ return null; }
}
const chatKey = (runId, name)=> `nd_chat_${runId}_${name}`;
/* P0-2/P0-3 修复：getHist 读失败（IO 异常/JSON 损坏）时抛错，绝不折叠成 []。
 * 调用方必须区分"读失败"与"确实无数据"：
 * - 纯展示类调用点用 getHistSafe(k)（失败当空渲染，绝不写回）；
 * - 任何"读后可能写回"的调用点必须 try/catch，失败时放弃写入并提示用户。 */
const getHist = (k)=>{
  /* v37 性能: JSON 解析缓存，挂在函数对象上（本函数被测试按源码段抽取执行，
   * 不能引用模块级变量）。渲染一轮会调 3+ 次 getHist，原先每次都全量 JSON.parse。
   * 返回浅拷贝数组：调用方 push 不会污染缓存，消息对象本身共享（字段修改与旧行为一致）。 */
  const C = getHist;
  if(!C.__cache) C.__cache = {raw:null, data:null};
  let raw = null;
  if(typeof RP_STORE!=="undefined" && typeof RP_STORE.getSyncStrict==="function"){
    raw = RP_STORE.getSyncStrict(k); /* 文件层持续读失败时抛错 */
  }else if(typeof RP_STORE!=="undefined"){
    if(typeof RP_STORE.getSync==="function"){ raw = RP_STORE.getSync(k); }
    else { raw = RP_STORE.cacheGet(k); }
  }
  if(raw == null){
    try{ raw = localStorage.getItem(k); }
    catch(e){ throw new Error("HIST_READ_FAIL"); }
  }
  let h;
  if(raw == null){
    h = [];
  }else if(raw === C.__cache.raw && C.__cache.data){
    h = C.__cache.data;
  }else{
    try{ h = JSON.parse(raw); }
    catch(e){ throw new Error("HIST_PARSE_FAIL"); }
    if(!Array.isArray(h)) throw new Error("HIST_PARSE_FAIL");
    C.__cache = {raw: raw, data: h};
  }
  /* 老消息补 mid（摘要水位 msg_id 制），只新增字段。缓存命中时 mid 已补齐，
   * 不会重复触发 saveHist 全量写回（修掉展示路径误写盘的旧问题）。 */
  let dirty = false;
  for(const m of h){
    if(m && !m.mid && !m.id){
      m.mid = (typeof nextMsgId==="function") ? nextMsgId()
        : ("m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      dirty = true;
    }
  }
  if(dirty) saveHist(k, h);
  return h.slice();
};
/* 纯展示类调用：读失败当空历史渲染，调用方保证不写回 */
const getHistSafe = (k)=>{ try{ return getHist(k); }catch(e){ return []; } };
/* 配额类错误识别（Chrome 22 / Firefox 1014 / 标准名） */
function isQuotaErr(e){ return !!e && (e.code===22 || e.code===1014 ||
  e.name==="QuotaExceededError" || e.name==="NS_ERROR_DOM_QUOTA_REACHED"); }
/* 节流 toast：同一消息 10 秒内只弹一次，避免刷屏 */
let __toastOnceAt = {};
function rpToastOnce(msg){
  const now = Date.now();
  if(__toastOnceAt[msg] && now - __toastOnceAt[msg] < 10000) return;
  __toastOnceAt[msg] = now;
  try{ rpToast(msg); }catch(e){}
}
/* v37 说明: 配置类读写函数会被 tests 按源码段单独抽取执行，因此容错必须
 * 内联在各自函数体内，不能依赖模块级 helper。 */
/* 聊天记录最多保留条数（P1-10：超出丢最早的，截断必须可见）。
 * 常量放在 saveHist 内部：tests/test_gethist_fallback.js 按源码段提取执行，要求自包含；
 * 调用方需要上限时用返回值里的 max。 */
const saveHist = (k,h)=>{
  const MAX_KEEP = 80;
  const dropped = Math.max(0, h.length - MAX_KEEP);
  const kept = h.length - dropped;
  const keptArr = dropped ? h.slice(-MAX_KEEP) : h;
  const s = JSON.stringify(keptArr);
  /* v37 性能: 同步刷新解析缓存，保证下一次 getHist 直接命中，不再重新 parse。
   * 挂函数对象以兼容测试的按段抽取执行。 */
  try{
    if(typeof getHist === "function"){
      getHist.__cache = {raw: s, data: keptArr};
    }
  }catch(e){}
  /* P0-3: localStorage 写入失败（配额满）必须让用户知道，不能静默，更不能抛到上层打断流程 */
  try{
    localStorage.setItem(k, s);
  }catch(e){
    rpToastOnce(isQuotaErr(e) ? "存储空间已满，聊天记录可能无法保存" : "聊天记录保存失败");
  }
  /* P1-10: 超上限截断不再静默丢。固定文案 + rpToastOnce 节流，长聊天不刷屏；
     导入场景的精确条数由导入方自己播报（见 doStChatImport）。 */
  if(dropped) rpToastOnce(`聊天记录最多保留 ${MAX_KEEP} 条，更早的消息已丢弃`);
  /* v37: 维护"最近聊天"轻量索引，避免 onResume 全量扫描解析所有聊天历史 */
  try{ if(typeof lastChatIndexUpdate === "function") lastChatIndexUpdate(k, keptArr, s); }catch(e){}
  /* P2: 大键双写 IDB（异步，失败静默回退 localStorage） */
  /* v36: 值缩小到文件层阈值下但旧文件还在时，必须把旧文件+标记清掉，
     否则下次冷启动 warmCache 会把旧大文件"复活"，盖掉 localStorage 里的新值。 */
  try{ if(typeof RP_STORE!=="undefined"){
    RP_STORE.cacheSet(k, s);
    if(typeof RP_STORE.hasFileKey==="function" && RP_STORE.hasFileKey(k) &&
       s.length <= (RP_STORE.FILE_MIN_BYTES || 262144)){
      RP_STORE.evictFile(k);
    } else {
      RP_STORE.syncBig(k, s);
    }
  } }catch(e){}
  return {kept: kept, dropped: dropped, max: MAX_KEEP};
};

let CHAT = {mode:"single", runId:null, name:null, members:[], forcedSpeaker:null};
/* P1 修复(2026-10-14): 成员名下划线双写转义, 避免 ['a_b','c'] 与 ['a','b_c'] 拼出同 key。
 * 无下划线的名字转义后不变, 老 key 保持兼容。 */
const groupKey = (runId, members)=> `nd_group_${runId}_${members.slice().sort().map(function(m){ return String(m).replace(/_/g, "__"); }).join("_")}`;
const chatHistKey = ()=> CHAT.mode==="group" ? groupKey(CHAT.runId, CHAT.members)
  : CHAT.mode==="traverse" ? `nd_travchat_${CHAT.travId}`
  : chatKey(CHAT.runId, CHAT.name);
let STREAM_SPEAKER = null;
let LAST_SYSTEM = "";
let LAST_STATS = null;

function allChars(){
const cards = (window.__DATA__ && window.__DATA__.rp_cards) || {};
const out = [];
try { RP_WRITER.getCustomChars().forEach(c=>out.push({runId:"custom", novel:c.novel, name:c.name})); } catch(e){}
try { RP_CARDIMPORT.list().forEach(c=>out.push({runId:"imported", novel:c.novel, name:c.name})); } catch(e){}
for(const r of INDEX){
const list = cards[r.run_id] || [];
if(list.length){ list.forEach(c=>out.push({runId:r.run_id, novel:r.novel, name:c.name})); }
else { const run = ((window.__DATA__||{}).runs||{})[r.run_id] || {};
(run.profiles||[]).forEach(p=>out.push({runId:r.run_id, novel:r.novel, name:p.name})); }
}
return out;
}
/* ===== 沉浸式聊天背景（CreatorSkin 式场景层） ===== */
/* 背景层 HTML：bglayer 放场景图（无图时透明，露出 .chatbg 的氛围渐变兜底） */
function chatBgHTML(){
return `<div class="chatbg" id="chatbg" aria-hidden="true"><div class="bglayer" id="chatbglayer"></div><div class="bgchar" id="chatbgchar"></div><div class="bgshade"></div><div class="bgdim"></div></div>`;
}
/* L2: 背景压暗状态机（猫箱 DimBackground 的轻量版）：
   chat=正常阅读 / sheet=消息操作菜单打开（加深压暗，聚焦菜单） */
const DimState = {
cur: "chat",
set(s){
if(this.cur === s) return;
this.cur = s;
document.body.dataset.dimstate = s;
}
};
window.DimState = DimState;
/* 用户上传壁纸：按聊天存（单聊/群聊/穿越各一套），IDB 落盘 + 内存镜像保证同步读取不闪。
   dataURL 在上传时已压缩到最长边 1080px JPEG，不会撑爆存储 */
const wallStoreKey = ()=> "nd_wallpaper_" + chatHistKey();
let WALL_MEM = {}; /* k -> {url, dim(0-70), blur(0-12)} */
/* 兼容老版本存的纯字符串 */
function normWall(v){
if(!v) return null;
if(typeof v === "string") return v.indexOf("data:") === 0 ? {url:v, dim:0, blur:0} : null;
return (v && v.url) ? {url:v.url, dim:Math.min(70, +v.dim || 0), blur:Math.min(12, +v.blur || 0)} : null;
}
function getWallOpts(){ return normWall(WALL_MEM[chatHistKey()]); }
/* 滤镜 CSS：调暗 + 模糊，保证用户自选亮图上文字依然可读 */
function wallFilterCSS(o){
if(!o) return "";
const dim = Math.min(70, Math.max(0, +o.dim || 0));
const blur = Math.min(12, Math.max(0, +o.blur || 0));
const parts = [];
if(dim > 0) parts.push("brightness(" + (1 - dim/100).toFixed(2) + ")");
if(blur > 0) parts.push("blur(" + blur + "px)");
return parts.join(" ");
}
async function warmWallpaper(){
const k = chatHistKey();
if(k in WALL_MEM) return getWallOpts();
let v = "";
try{ if(typeof RP_STORE!=="undefined") v = await RP_STORE.getItemAsync(wallStoreKey()) || ""; }catch(e){}
try{ v = JSON.parse(v); }catch(e){ /* 老版本存的是纯 dataURL 字符串 */ }
WALL_MEM[k] = v || null;
return getWallOpts();
}
/* 选背景优先级：单聊上传壁纸 > 全局壁纸 > 角色卡/穿越世界自带 bg > 内置默认图；
   图片加载失败回退渐变，绝不破图。
   预留 setChatBg(url)：以后世界状态/剧情推进可按场景切换背景 */
function pickChatBgURL(){
try{
const o = getWallOpts();
if(o && o.url) return o.url;
const g = getGlobalWallOpts();
if(g && g.url) return g.url;
if(CHAT.mode === "traverse" && typeof RP_TRAVERSE !== "undefined"){
const trav = RP_TRAVERSE.get(CHAT.travId); if(trav && trav.bg) return trav.bg;
}else if(CHAT.name && typeof allChars === "function"){
const c = (allChars() || []).find(x => x.runId === CHAT.runId && x.name === CHAT.name);
if(c && c.bg) return c.bg;
}
}catch(e){}
return "bg/chat_night.jpg";
}
function paintChatBg(){
const layer = document.getElementById("chatbglayer");
if(!layer) return;
const url = pickChatBgURL();
const filter = wallFilterCSS(getWallOpts() || getGlobalWallOpts());
const probe = new Image();
probe.onload = ()=>{ layer.style.backgroundImage = `url("${url}")`; layer.style.filter = filter; sampleBarColors(probe); };
probe.onerror = ()=>{ layer.style.backgroundImage = ""; layer.style.filter = ""; clearBarColors(); };
probe.src = url;
try{ paintChatPortrait(); }catch(e){} /* v42: 山水底图上叠角色立绘（用户壁纸优先） */
}
/* 三栏跟随背景色：从聊天背景图采样平均色，写成 CSS 变量给顶栏/世界条/底栏用。
   用户上传纯色壁纸换"背景色"时，三栏同步变色，不再是写死的深色。
   跨域图片会污染 canvas → getImageData 抛错 → try/catch 回退默认深色。 */
function sampleBarColors(img){
try{
const c = document.createElement("canvas"); c.width = c.height = 24;
const x = c.getContext("2d", {willReadFrequently:true});
x.drawImage(img, 0, 0, 24, 24);
const d = x.getImageData(0, 0, 24, 24).data;
let r = 0, g = 0, b = 0, m = 0;
for(let i = 0; i < d.length; i += 16){ r += d[i]; g += d[i+1]; b += d[i+2]; m++; }
r = Math.round(r/m); g = Math.round(g/m); b = Math.round(b/m);
const st = document.body.style;
st.setProperty("--barbg-head", "rgba(" + r + "," + g + "," + b + ",.58)");
st.setProperty("--barbg-bar", "rgba(" + r + "," + g + "," + b + ",.78)");
st.setProperty("--barbg-solid", "rgba(" + r + "," + g + "," + b + ",.94)");
/* 浅色背景时三栏文字转深色（body.bars-light），否则浅色字看不清 */
const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
document.body.classList.toggle("bars-light", lum > 0.6);
}catch(e){ clearBarColors(); }
}
function clearBarColors(){
try{
const st = document.body.style;
st.removeProperty("--barbg-head"); st.removeProperty("--barbg-bar"); st.removeProperty("--barbg-solid");
document.body.classList.remove("bars-light");
}catch(e){}
}
window.setChatBg = (url)=>{
const layer = document.getElementById("chatbglayer");
if(layer) layer.style.backgroundImage = url ? `url("${url}")` : "";
};
/* ============ 聊天壁纸（上传 / 恢复默认） ============ */
window.wallpaperEditor = (storeId)=>{
_wallStore = (storeId === "global") ? "global" : "chat";
const S = _wallStores[_wallStore];
__backAction = ()=>S.back();
document.body.classList.remove("chatmode","immersive"); /* P2-1: 切页同时清 immersive, 不留残 */
titleEl.innerHTML = S.title; subEl.textContent = S.sub;
const o = S.get(), cur = o && o.url;
const dim = o ? o.dim : 0, blur = o ? o.blur : 0;
view.innerHTML = `<button class="back" onclick="__backAction()">${icon("back")} 返回</button>
<div class="card" style="text-align:center">
${cur ? `<img id="wall_preview" src="${cur}" style="max-width:100%;border-radius:8px;filter:${wallFilterCSS(o)}" alt="当前壁纸">`
      : `<div style="padding:24px;color:var(--ink-faint)">当前使用默认壁纸<br><span style="font-size:calc(12px * var(--fs))">上传后可调暗度和模糊</span></div>`}
</div>
${cur ? `<div class="field"><label>暗度 <span id="wall_dim_v">${dim}%</span></label>
<input type="range" id="wall_dim" min="0" max="70" value="${dim}" oninput="wallOptUI()"></div>
<div class="field"><label>模糊 <span id="wall_blur_v">${blur}px</span></label>
<input type="range" id="wall_blur" min="0" max="12" value="${blur}" oninput="wallOptUI()"></div>` : ""}
<div class="btnrow">
<button class="btn" onclick="document.getElementById('wall_file').click()">上传图片</button>
${cur ? `<button class="btn ghost" onclick="clearWallpaperUI()">恢复默认</button>` : ""}
</div>
<input type="file" id="wall_file" accept="image/*" style="display:none" onchange="uploadWallpaperUI(this)">
<div class="hint">${escH(S.hint)}</div>
<div style="height:40px"></div>`;
window.scrollTo(0,0);
};
window.saveWallpaper = async (url, opts)=>{
const k = chatHistKey();
const o = Object.assign({url:url, dim:0, blur:0}, opts || {});
o.dim = Math.min(70, +o.dim || 0); o.blur = Math.min(12, +o.blur || 0);
WALL_MEM[k] = o;
try{ if(typeof RP_STORE!=="undefined") await RP_STORE.setItemAsync(wallStoreKey(), JSON.stringify(o)); }catch(e){}
};
/* 滑杆实时预览 + 防抖落盘 */
let _wallOptT = 0;
window.wallOptUI = ()=>{
const dim = +document.getElementById("wall_dim").value || 0;
const blur = +document.getElementById("wall_blur").value || 0;
document.getElementById("wall_dim_v").textContent = dim + "%";
document.getElementById("wall_blur_v").textContent = blur + "px";
const pv = document.getElementById("wall_preview");
if(pv) pv.style.filter = wallFilterCSS({dim:dim, blur:blur});
clearTimeout(_wallOptT);
_wallOptT = setTimeout(()=>{
const S = _wallStores[_wallStore] || _wallStores.chat;
const cur = S.get() || {url:""};
S.save(cur.url, {dim:dim, blur:blur});
}, 400);
};
window.uploadWallpaperUI = (input)=>{
const f = input.files && input.files[0];
input.value = "";
if(!f) return;
if(!/^image\//.test(f.type || "")){ alert("请选择图片文件"); return; }
const rd = new FileReader();
rd.onload = ()=>{
const img = new Image();
img.onload = ()=>{
try{
const MAX = 1080;
let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
if(!w || !h) throw new Error("图片尺寸异常");
const s = Math.min(1, MAX / Math.max(w, h));
w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
cv.getContext("2d").drawImage(img, 0, 0, w, h);
const url = cv.toDataURL("image/jpeg", 0.85);
const S = _wallStores[_wallStore] || _wallStores.chat;
S.save(url).then(()=>{ alert("壁纸已更换"); wallpaperEditor(_wallStore); });
}catch(e){ alert("图片处理失败：" + (e && e.message || e)); }
};
img.onerror = ()=>alert("图片读取失败，换一张试试");
img.src = rd.result;
};
rd.onerror = ()=>alert("文件读取失败");
rd.readAsDataURL(f);
};
window.clearWallpaperUI = async ()=>{
const S = _wallStores[_wallStore] || _wallStores.chat;
await S.clear();
alert("已恢复默认壁纸"); wallpaperEditor(_wallStore);
};
/* ============ 全局壁纸：所有聊天的默认背景；单聊单独设置的优先 ============ */
const GLOBAL_WALL_KEY = "nd_wallpaper_global";
let GLOBAL_WALL = null, _gwLoaded = false;
function getGlobalWallOpts(){ return normWall(GLOBAL_WALL); }
async function warmGlobalWall(){
if(_gwLoaded) return getGlobalWallOpts();
_gwLoaded = true;
let v = "";
try{ if(typeof RP_STORE!=="undefined") v = await RP_STORE.getItemAsync(GLOBAL_WALL_KEY) || ""; }catch(e){}
try{ v = JSON.parse(v); }catch(e){}
GLOBAL_WALL = v || null;
return getGlobalWallOpts();
}
window.saveGlobalWallpaper = async (url, opts)=>{
const o = Object.assign({url:url, dim:0, blur:0}, opts || {});
o.dim = Math.min(70, +o.dim || 0); o.blur = Math.min(12, +o.blur || 0);
GLOBAL_WALL = o;
try{ if(typeof RP_STORE!=="undefined") await RP_STORE.setItemAsync(GLOBAL_WALL_KEY, JSON.stringify(o)); }catch(e){}
};
window.clearGlobalWallpaper = async ()=>{
GLOBAL_WALL = null;
try{ if(typeof RP_STORE!=="undefined") await RP_STORE.removeItemAsync(GLOBAL_WALL_KEY); }catch(e){}
};
/* 壁纸编辑器：单聊 / 全局共用一套 UI，store 决定读写与返回 */
const _wallStores = {
chat:{ title:"🖼️ 聊天壁纸", sub:"只换这个聊天的背景，存在本机",
  hint:"图片会压缩到最长边 1080px 后存到本机，只影响当前聊天。单聊、群聊、穿越各用各的壁纸。图太亮看不清字时，调高暗度或加一点模糊。",
  get:()=>getWallOpts(), save:(u,o)=>saveWallpaper(u,o),
  clear:async ()=>{ const k = chatHistKey(); WALL_MEM[k] = null;
    try{ if(typeof RP_STORE!=="undefined") await RP_STORE.removeItemAsync(wallStoreKey()); }catch(e){} },
  back:()=>showChat() },
global:{ title:"🖼️ 全局壁纸", sub:"所有聊天的默认背景，存在本机",
  hint:"图片会压缩到最长边 1080px 后存到本机。所有聊天默认都用它；某个聊天单独设过壁纸的，仍用自己的那张。",
  get:()=>getGlobalWallOpts(), save:(u,o)=>saveGlobalWallpaper(u,o),
  clear:()=>clearGlobalWallpaper(), back:()=>setNav("settings") }
};
let _wallStore = "chat";
window.globalWallpaperEditor = ()=>wallpaperEditor("global");
/* 浮生暖系 (2026-10-15): soul 卡单聊时注入暖系角色头卡 + 快捷 chips */
function applySoulWarm(){
  try{
    var v = document.getElementById("view");
    var isSoul = (typeof RP_SOUL_WARM !== "undefined") &&
      CHAT && CHAT.name && RP_SOUL_WARM.hasSoul(CHAT.runId, CHAT.name);
    if(v) v.classList.toggle("soulwarm", !!isSoul);
    if(!isSoul) return;
    var run = ((window.__DATA__ || {}).runs || {})[CHAT.runId] || {};
    var head = document.getElementById("chathead");
    if(head && !document.getElementById("sw_chead")){
      var d = document.createElement("div");
      d.id = "sw_chead";
      d.innerHTML = RP_SOUL_WARM.cheadHTML(CHAT.runId, CHAT.name, run.novel);
      head.parentNode.insertBefore(d, head.nextSibling);
    }
    var bar = document.querySelector(".chatbar");
    if(bar && !document.getElementById("sw_quick")){
      var q = document.createElement("div");
      q.id = "sw_quick";
      q.innerHTML = RP_SOUL_WARM.quickChipsHTML(CHAT.runId, CHAT.name);
      bar.parentNode.insertBefore(q, bar);
    }
  }catch(e){}
}
async function showChat(){
/* run 数据按需加载：setNav("chat") 直达 / 会话恢复时 CHAT.runId 的数据可能还没拉 */
if(isRealRun(CHAT.runId) && !runReady(CHAT.runId) && typeof RP_LAZY !== "undefined"){
  try{ await RP_LAZY.ensureRun(CHAT.runId); }
  catch(e){ runLoadingFailed(e, function(){ showChat(); }); return; }
}
__backAction = ()=>exitChat();
document.body.classList.add("chatmode");
const cs = allChars();
const cfg = getCfg();
if(CHAT.mode==="group") return showGroupChat(cfg);
if(CHAT.mode==="traverse") return showTraverseChat(cfg);
if(!CHAT.name && cs.length){
const last = localStorage.getItem("nd_chat_last");
const f = cs.find(c=>`${c.runId}|${c.name}`===last) || cs[0];
CHAT = {runId:f.runId, name:f.name};
}
const run = ((window.__DATA__||{}).runs||{})[CHAT.runId] || {};
try{ if(CHAT.runId) loadWorldcard(CHAT.runId); }catch(e){} /* 世界卡预热：导演编排可用原著蓝图，fire-and-forget */
let memN = 0;
try{ const mst = RP_MEM.get(CHAT.runId, CHAT.name); memN = (mst && mst.short ? mst.short.length : 0); }catch(e){}
await warmWallpaper(); await warmGlobalWall(); /* 先读用户壁纸，避免先闪默认图 */
/* 消息操作发现性：首次进聊天提示一次"点一下消息有更多操作" */
try{
  if(!localStorage.getItem("nd_msgtools_tip")){
    localStorage.setItem("nd_msgtools_tip", "1");
    /* v41: 走提示队列，排在沉浸引导之后，不再靠固定 5.6s 错开 */
    setTimeout(()=>{ const _tip = ()=>{ if(NAV!=="chat") return false; rpToast("点一下消息，可以编辑 / 复制 / 重生 / 朗读"); };
      try{ (typeof window.rpTip==="function") ? window.rpTip(_tip, 2600) : _tip(); }catch(e){} }, 1500);
  }
}catch(e){}
view.innerHTML = `
${chatBgHTML()}
<div class="chathead" id="chathead">
<button class="backbtn" onclick="exitChat()">‹</button>
<div class="avatar">${esc((CHAT.name||"?")[0])}</div>
<div class="chead-main"><div class="cname">${esc(CHAT.name)}<span class="aimark">AI</span></div>
<div class="cstat">${run.novel?`<span>${esc(run.novel)}</span>`:""}<span id="chapter_hbadge" style="display:none;font-size:calc(11px * var(--fs));color:var(--gold);border:1px solid var(--line-soft);border-radius:999px;padding:1px 8px;cursor:pointer" onclick="chapterPicker()"></span><button onclick="toggleDrawer(false);openAlbum('${jq(CHAT.runId)}','${jq(CHAT.name)}')"><span class="mement">${icon("brain",15)} ${memN}条记忆</span>›</button></div></div>
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
<div class="dgrid"><button class="dtile" onclick="toggleDrawer(false);openAlbum('${jq(CHAT.runId)}','${jq(CHAT.name)}')"><span class="dtile-ic" aria-hidden="true">${icon("books",22)}</span><span class="dtile-lb">记忆事件簿</span></button><button class="dtile" onclick="toggleDrawer(false);openSaves()"><span class="dtile-ic" aria-hidden="true">${icon("save",22)}</span><span class="dtile-lb">平行存档</span></button><button class="dtile" onclick="toggleDrawer(false);wallpaperEditor()"><span class="dtile-ic" aria-hidden="true">${icon("image",22)}</span><span class="dtile-lb">聊天壁纸</span></button><button class="dtile" onclick="toggleDrawer(false);newChatSameRole()"><span class="dtile-ic" aria-hidden="true">${icon("plus",22)}</span><span class="dtile-lb">开新聊天</span></button></div>
<h3>切换角色</h3>
<div class="whorow" data-xfade>
${cs.map(c=>`<button class="whoami ${c.runId===CHAT.runId&&c.name===CHAT.name?"active":""}" data-swrun="${esc(c.runId)}" data-swname="${esc(c.name)}">
<div class="avatar sm">${esc(c.name[0])}</div>
<div><div class="name">${esc(c.name)}</div><div class="kv">${esc(c.novel)}</div></div>
</button>`).join("")}
</div>
<h3>叙事视角</h3>
${povChipsHTML()}
<h3>聊天</h3>
<button class="ditem" onclick="toggleDrawer(false);personaEditor('${jq(CHAT.runId)}','chat')">${icon("user")} 我的人设（本次覆盖）</button>
<button class="ditem" onclick="toggleDrawer(false);charDetail('${jq(CHAT.runId)}','${jq(CHAT.name)}')">${icon("user")} 角色详情</button>
<button class="ditem" onclick="toggleDrawer(false);showATasks()">${icon("chart")} 分析任务</button>
<button class="ditem" onclick="toggleDrawer(false);plotEditor()">${icon("book-open")} 剧情线</button>
${chapterEntryHTML(true)}
<button class="ditem" onclick="toggleDrawer(false);loreEditor('${jq(CHAT.runId)}','chat')">${icon("book-open")} 世界书管理</button>
<h3>AI 助手</h3>
<button class="ditem" onclick="toggleDrawer(false);openAssistant()">${icon("lightbulb")} 浮生小助手</button>
<button class="ditem" onclick="toggleDrawer(false);showRelManager()">${icon("users")} 关系管理</button>
<button class="ditem" onclick="toggleDrawer(false);showCardEvo()">${icon("edit")} 角色卡更新建议<span id="cardevo_badge"></span></button>
<h3>本次聊天设置</h3>
<button class="ditem" onclick="toggleDrawer(false);showChatSettings()">${icon("settings")} 聊天设置（Agent/参数/世界）</button>
${foreEntryHTML()}
<button class="ditem danger" onclick="toggleDrawer(false);clearChat()">${icon("trash")} 清空聊天记录</button>
${drawerAdvHTML(`<button class="ditem" onclick="toggleDrawer(false);exportChat()">${icon("copy")} 复制聊天记录</button>
<button class="ditem" onclick="toggleDrawer(false);exportChatTxt()">${icon("download")} 导出聊天 TXT</button>
<button class="ditem" onclick="toggleDrawer(false);exportChatJsonl()">${icon("download")} 导出 ST JSONL</button>
<button class="ditem" onclick="toggleDrawer(false);importStChat()">${icon("upload")} 导入 ST 聊天记录</button>
<button class="ditem" onclick="toggleDrawer(false);importGouhua()">${icon("upload")} 导入构画便携包</button>
<button class="ditem" onclick="toggleDrawer(false);regexEditor('${jq(CHAT.runId)}','${jq(CHAT.name)}','chat')">${icon("type")} 正则替换</button>
<button class="ditem" onclick="toggleDrawer(false);showSystem()">${icon("settings")} 人设 prompt 预览</button>
<button class="ditem" onclick="toggleDrawer(false);promptDiag()">${icon("chart")} Prompt 诊断</button>`)}
<h3>设置</h3>
<button class="ditem" onclick="exitChatTo('settings')">${icon("settings")} 大模型与 RP 设置</button>
</div>
${!cfg.key?`<div class="hint" style="margin:10px 14px">还没配大模型接口，先去「我的 · 设置」里填 API 地址/Key/模型，聊天才能用。Key 只存在你手机上。</div>`:""}`;
renderChat();
renderScenChips();
paintChatBg();
attachHeadHide();
updateChapterBadge();
applySoulWarm(); /* 浮生暖系: soul 卡时注入角色头卡 + 快捷 chips */
const k = chatKey(CHAT.runId, CHAT.name);
/* P0-2/P0-3: 读失败≠空历史。读失败时显示错误态并直接返回，绝不写打招呼语覆盖。 */
let __h0 = null, __h0ok = true;
try{ __h0 = getHist(k); }catch(e){ __h0ok = false; }
if(!__h0ok){
const _log = document.getElementById("chatlog");
if(_log) _log.innerHTML = `<div class="msg"><div class="msgcol"><div class="bubble">⚠️ 聊天记录读取失败（存储异常），未做任何写入。请稍后重进，历史数据仍在。</div></div></div>`;
return;
}
if(!__h0.length){
/* 游玩统计：空历史进聊天 = 一次开局（纯本地，RP_STATS） */
try{ if(typeof RP_STATS !== "undefined") RP_STATS.recordSession(CHAT.runId, CHAT.name); }catch(e){}
/* 指定开场开聊：详情页点某开场进来时，首条 AI 消息直接用该开场，不再随机/生成 */
const _po = window.__pendingOpening; window.__pendingOpening = null;
const _ops = (typeof cardOpenings === "function") ? cardOpenings(CHAT.runId, CHAT.name) : [];
if(_po != null && _ops[_po]){
saveHist(k, [{mid:(typeof nextMsgId==="function"?nextMsgId():"m"+Date.now().toString(36)), role:"assistant", content:_ops[_po].text, ts:Date.now()}]); renderChat();
}else{
RP.greeting(CHAT.runId, CHAT.name, cfg, run.novel).then(g=>{
/* P1-4: 写前再确认——await 窗口内用户可能已发消息；读失败则放弃写入 */
let _h2 = null;
try{ _h2 = getHist(k); }catch(e){ return; }
if(_h2.length) return;
saveHist(k, [{mid:(typeof nextMsgId==="function"?nextMsgId():"m"+Date.now().toString(36)), role:"assistant", content:g, ts:Date.now()}]); renderChat();
});
}
}
}

