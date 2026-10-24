/* 浮生 · app 分段 04：TTS 朗读 + 语音气泡
 * v41 从 app.js 原样迁出（原 app.js 第 830–936 行，代码未改动）。经典脚本：顶层 function 仍是全局，
 * 顶层 const/let 进共享的全局词法作用域（其它脚本可按裸名访问，但不挂 window）。
 * 加载顺序见 index.html：js/app_*.js 按编号紧挨在 app.js 之前，顺序即原 app.js 内的先后。 */
/* ============ TTS 朗读 + 语音气泡 (对标商业 App: 可播放的气泡, 含时长/进度; 默认不存音频进历史) ============ */
const ttsCache = {};
let TTS_PLAY = null; // {key, idx, audio, local, startTs, estDur, prog, timer}
window.ttsEstDur = (text)=>{ // 中文约 4 字/秒, 保底 2 秒
const n = String(text||"").replace(/\s/g,"").length;
return Math.max(2, Math.ceil(n/4));
};
window.fmtDur = (s)=>{ s = Math.max(0, Math.round(s)); return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0"); };
window.ttsKey = (idx)=> chatHistKey() + "#" + idx;
function ttsClean(m){ return String((m&&m.content)||"").replace(/[*#`>\-\[\]()]/g,"").slice(0,800); }
function ttsPaint(){ // 只更新气泡 DOM, 不整页重绘(避免滚动跳动)
if(!TTS_PLAY) return;
const fg = document.getElementById("vbfg-"+TTS_PLAY.idx);
if(fg) fg.style.width = Math.round((TTS_PLAY.prog||0)*100) + "%";
const ic = document.getElementById("vbico-"+TTS_PLAY.idx);
if(ic) ic.innerHTML = icon("pause",13);
const b = document.getElementById("vb-"+TTS_PLAY.idx);
if(b) b.classList.add("playing");
}
function ttsPaintStopped(idx){
const fg = document.getElementById("vbfg-"+idx);
if(fg) fg.style.width = "0%";
const ic = document.getElementById("vbico-"+idx);
if(ic) ic.innerHTML = icon("play",13);
const b = document.getElementById("vb-"+idx);
if(b) b.classList.remove("playing");
}
function ttsTickStart(){ // 本地语音用计时器推进进度; 远端走 audio.timeupdate
if(TTS_PLAY && TTS_PLAY.timer) clearInterval(TTS_PLAY.timer);
if(!TTS_PLAY) return;
TTS_PLAY.timer = setInterval(()=>{
if(!TTS_PLAY) return;
if(TTS_PLAY.local){
const el = (Date.now()-TTS_PLAY.startTs)/1000/TTS_PLAY.estDur;
TTS_PLAY.prog = Math.min(0.99, el);
if(el >= 1){ const i = TTS_PLAY.idx; ttsStop(); ttsPaintStopped(i); return; }
}
ttsPaint();
}, 500);
}
window.ttsMsg = async (idx)=>{
const k = window.ttsKey(idx);
if(TTS_PLAY && TTS_PLAY.key===k){ const i = TTS_PLAY.idx; ttsStop(); ttsPaintStopped(i); return; }
ttsStop();
const h = getHistSafe(chatHistKey());
const m = h[idx]; if(!m || m.role!=="assistant") return;
const cfg = getCfg();
const text = ttsClean(m);
const estDur = window.ttsEstDur(text);
if(cfg.key && cfg.base && cfg.ttsModel){
try{
let url = ttsCache[k];
if(!url){
url = await RP_NET.tts(cfg, text, cfg.ttsModel, cfg.ttsVoice||"alloy");
/* v37: 缓存上限 20 条，淘汰时 revoke blob URL，避免长聊天持续泄漏内存 */
try{
  const _ks = Object.keys(ttsCache);
  if(_ks.length >= 20){
    const _old = _ks[0];
    try{ URL.revokeObjectURL(ttsCache[_old]); }catch(_){}
    delete ttsCache[_old];
  }
}catch(_){}
ttsCache[k] = url;
}
const a = new Audio(url);
TTS_PLAY = {key:k, idx:idx, audio:a, local:false, startTs:Date.now(), estDur:estDur, prog:0};
a.onended = ()=>{ const i = TTS_PLAY?TTS_PLAY.idx:idx; ttsStop(); ttsPaintStopped(i); };
a.ontimeupdate = ()=>{ if(TTS_PLAY && TTS_PLAY.key===k && a.duration) { TTS_PLAY.prog = a.currentTime/a.duration; ttsPaint(); } };
ttsPaint(); ttsTickStart();
achvUnlock("tts_1");
await a.play();
}catch(e){ TTS_PLAY = null; alert("TTS 失败：" + e.message); }
return;
}
/* 无远端 TTS 配置: 用手机自带免费语音兜底（对标猫箱端侧语音参考） */
if(!("speechSynthesis" in window)){ alert("先去「我的 · 设置」填 API 地址/Key 和 TTS 模型"); return; }
try{
const u = new SpeechSynthesisUtterance(text);
u.lang = "zh-CN";
window._localTtsOn = true;
TTS_PLAY = {key:k, idx:idx, audio:null, local:true, startTs:Date.now(), estDur:estDur, prog:0};
u.onend = u.onerror = ()=>{ if(TTS_PLAY && TTS_PLAY.key===k){ const i = TTS_PLAY.idx; ttsStop(); ttsPaintStopped(i); } };
ttsPaint(); ttsTickStart();
achvUnlock("tts_1");
speechSynthesis.speak(u);
}catch(e){ TTS_PLAY = null; window._localTtsOn = false; alert("本地语音失败：" + e.message); }
};
function ttsStop(){
if(TTS_PLAY){
if(TTS_PLAY.timer){ try{clearInterval(TTS_PLAY.timer);}catch(e){} }
if(TTS_PLAY.audio){ try{TTS_PLAY.audio.pause();}catch(e){} }
TTS_PLAY = null;
}
if(window._localTtsOn && ("speechSynthesis" in window)){ try{speechSynthesis.cancel();}catch(e){} window._localTtsOn = false; }
}
/* 语音气泡: 替代原来的小喇叭按钮, 含播放/暂停、进度条、预估时长 */
window.voiceBubbleHTML = (idx, m)=>{
const k = window.ttsKey(idx);
const playing = !!(TTS_PLAY && TTS_PLAY.key===k);
const dur = window.ttsEstDur(ttsClean(m));
return `<button class="voicebub${playing?" playing":""}" id="vb-${idx}" onclick="event.stopPropagation();ttsMsg(${jq(idx)})" title="点击播放/暂停">`
+ `<span class="vb-ico" id="vbico-${idx}">${icon(playing?"pause":"play",13)}</span>`
+ `<span class="vb-bar"><span class="vb-fg" id="vbfg-${idx}" style="width:${playing?Math.round((TTS_PLAY.prog||0)*100):0}%"></span></span>`
+ `<span class="vb-dur">${window.fmtDur(dur)}</span></button>`;
};

