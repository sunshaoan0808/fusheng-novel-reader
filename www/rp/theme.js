/* 命名主题（P2）：中式意象命名色板，纯本地，默认墨夜（当前视觉，不擅自改全局）
 * - CSS 侧用 [data-theme="..."] 覆盖 :root 变量；JS 只负责切换 + 持久化。
 * - 硬编码色值较多的地方已抽成 --topbar-bg / --glow 变量跟随主题。
 */
var RP_THEME = (function(){
"use strict";
var KEY = "nd_theme_v1";
var THEMES = [
  {id:"moye", name:"墨夜", wp:{kind:"auto"}, desc:"默认 · 暗夜底 + 琥珀金，沉浸的原点",
   vars:{
    "--bg":"#12100d","--bg2":"#171411","--card":"#1d1915","--card2":"#23201b",
    "--line":"#2d2720","--line-soft":"#242019",
    "--ink":"#ece4d3","--ink-dim":"#b3a88f","--ink-faint":"#9a917e",
    "--gold":"#d4a24e","--gold-deep":"#a97c2e","--gold-soft":"#f2ddab",
    "--red":"#d07864","--green":"#8fb573",
    "--topbar-bg":"#12100d","--glow":"#1e1913","--nav-bg":"rgba(23,20,17,.92)",
    "--shadow":"0 6px 24px rgba(0,0,0,.45)","--shadow-s":"0 2px 10px rgba(0,0,0,.28)"
   }},
  {id:"songyan", name:"松烟", wp:{kind:"gradient", id:"daiqing"}, desc:"松烟入墨 · 青黑底 + 石青，冷峻书卷气",
   vars:{
    "--bg":"#0e1418","--bg2":"#121a20","--card":"#162026","--card2":"#1b2830",
    "--line":"#28363f","--line-soft":"#202b33",
    "--ink":"#e3e9ea","--ink-dim":"#a7b5b9","--ink-faint":"#87959a",
    "--gold":"#7fb0a5","--gold-deep":"#5b8a80","--gold-soft":"#c2ded5",
    "--red":"#c98a7e","--green":"#93b586",
    "--topbar-bg":"#0e1418","--glow":"#14202a","--nav-bg":"rgba(18,26,32,.92)",
    "--shadow":"0 6px 24px rgba(0,0,0,.5)","--shadow-s":"0 2px 10px rgba(0,0,0,.32)"
   }},
  {id:"jiangxia", name:"绛霞", wp:{kind:"gradient", id:"zitan"}, desc:"暮色绛紫 · 黛紫底 + 绛红，浓烈戏剧感",
   vars:{
    "--bg":"#161114","--bg2":"#1b1418","--card":"#211920","--card2":"#271e26",
    "--line":"#392b33","--line-soft":"#2e232b",
    "--ink":"#f0e6e2","--ink-dim":"#bda7a2","--ink-faint":"#99817e",
    "--gold":"#d08a7e","--gold-deep":"#a26357","--gold-soft":"#f2c6b8",
    "--red":"#d07864","--green":"#9db383",
    "--topbar-bg":"#161114","--glow":"#241a20","--nav-bg":"rgba(27,20,24,.92)",
    "--shadow":"0 6px 24px rgba(0,0,0,.5)","--shadow-s":"0 2px 10px rgba(0,0,0,.32)"
   }},
  {id:"xuanzhi", name:"宣纸", light:true, wp:{kind:"gradient", id:"paper"}, desc:"日间 · 米纸底 + 墨字，白天读长文不刺眼",
   vars:{
    "--bg":"#f6f1e3","--bg2":"#f0e8d5","--card":"#fffaf0","--card2":"#faf3e2",
    "--line":"#ded2b8","--line-soft":"#e9e0c9",
    "--ink":"#2f2a21","--ink-dim":"#6d6350","--ink-faint":"#837963",
    "--gold":"#b3872c","--gold-deep":"#8f6a1d","--gold-soft":"#7c5c14",
    "--red":"#b14a3c","--green":"#5f7f42",
    "--topbar-bg":"#f6f1e3","--glow":"#fff6da","--nav-bg":"rgba(250,245,232,.94)",
    "--shadow":"0 6px 24px rgba(122,100,52,.16)","--shadow-s":"0 2px 10px rgba(122,100,52,.12)"
   }},
  {id:"qingci", name:"青瓷", light:true, wp:{kind:"gradient", id:"celadon"}, desc:"日间 · 淡青釉面 + 深青，清润安静",
   vars:{
    "--bg":"#ebf1ea","--bg2":"#e2ebdf","--card":"#fbfdf9","--card2":"#f3f7f1",
    "--line":"#ccd9c9","--line-soft":"#dde7da",
    "--ink":"#26332a","--ink-dim":"#5c6f60","--ink-faint":"#75866f",
    "--gold":"#5d8a6d","--gold-deep":"#49735a","--gold-soft":"#3c5f4b",
    "--red":"#b5503f","--green":"#5d8a4d",
    "--topbar-bg":"#ebf1ea","--glow":"#f4faf0","--nav-bg":"rgba(243,248,241,.94)",
    "--shadow":"0 6px 24px rgba(70,100,80,.16)","--shadow-s":"0 2px 10px rgba(70,100,80,.12)"
   }},
  {id:"tianqing", name:"天青", light:true, wp:{kind:"gradient", id:"skyqing"}, desc:"日间 · 雨过天青 + 黛蓝，通透清凉",
   vars:{
    "--bg":"#eaf0f4","--bg2":"#dfe9ef","--card":"#fcfeff","--card2":"#f2f7fa",
    "--line":"#c9d8e1","--line-soft":"#dae5ec",
    "--ink":"#24333e","--ink-dim":"#57707f","--ink-faint":"#6f8a99",
    "--gold":"#4d7f9d","--gold-deep":"#3c6884","--gold-soft":"#2f546c",
    "--red":"#b5503f","--green":"#5d8a5f",
    "--topbar-bg":"#eaf0f4","--glow":"#f2f9ff","--nav-bg":"rgba(241,247,250,.94)",
    "--shadow":"0 6px 24px rgba(60,90,110,.16)","--shadow-s":"0 2px 10px rgba(60,90,110,.12)"
   }},
  {id:"taoyao", name:"桃夭", light:true, wp:{kind:"gradient", id:"taohong"}, desc:"日间 · 淡桃粉 + 绛色，温柔明媚",
   vars:{
    "--bg":"#faf0ea","--bg2":"#f5e4da","--card":"#fffaf6","--card2":"#fdf2ec",
    "--line":"#ecd3c6","--line-soft":"#f3e0d4",
    "--ink":"#392b26","--ink-dim":"#7d6357","--ink-faint":"#93796b",
    "--gold":"#c06a52","--gold-deep":"#a04e3a","--gold-soft":"#86402f",
    "--red":"#b23c30","--green":"#6d8a52",
    "--topbar-bg":"#faf0ea","--glow":"#fff3e4","--nav-bg":"rgba(252,244,238,.94)",
    "--shadow":"0 6px 24px rgba(140,90,70,.16)","--shadow-s":"0 2px 10px rgba(140,90,70,.12)"
   }},
  {id:"qiuxiang", name:"秋香", light:true, wp:{kind:"gradient", id:"qiuxiangwp"}, desc:"日间 · 明人秋香色 + 橄榄金，古雅暖意",
   vars:{
    "--bg":"#f3f0da","--bg2":"#ece8c8","--card":"#fdfbee","--card2":"#f8f5e2",
    "--line":"#ddd8ae","--line-soft":"#e7e3c2",
    "--ink":"#32301e","--ink-dim":"#716d4a","--ink-faint":"#86825e",
    "--gold":"#8f8a35","--gold-deep":"#767126","--gold-soft":"#5f5c1e",
    "--red":"#b14a3c","--green":"#667f35",
    "--topbar-bg":"#f3f0da","--glow":"#fdfbe8","--nav-bg":"rgba(249,247,233,.94)",
    "--shadow":"0 6px 24px rgba(110,105,55,.16)","--shadow-s":"0 2px 10px rgba(110,105,55,.12)"
   }},
];
/* ============ 主题壁纸（2026-10-25 用户拍板：壁纸跟随主题） ============
 * 每套主题带自己的壁纸 wp：auto=不介入（卡背景/默认山水图照旧）、gradient=渐变、image=内置图。
 * 用户上传的图不再默认压过一切：它只是「自定义」背景来源，选用后才生效（见 getBgMode）。
 * 渐变表与 style.css 里 body[data-wallpaper] 的深色四款同值，另加日间浅色五款。 */
var WP_GRADIENTS = {
  xuanmo:    {name:"玄墨",   css:"linear-gradient(160deg,#14161c 0%,#1b1e28 45%,#12141a 100%)"},
  daiqing:   {name:"黛青",   css:"linear-gradient(160deg,#12211f 0%,#16302b 50%,#101c1a 100%)"},
  zhejin:    {name:"赭金",   css:"linear-gradient(160deg,#241b10 0%,#2e2113 50%,#1d150c 100%)"},
  zitan:     {name:"紫檀",   css:"linear-gradient(160deg,#221418 0%,#2c1a22 50%,#1a1114 100%)"},
  paper:     {name:"宣纸纹", css:"linear-gradient(160deg,#f7f2e4 0%,#efe6cf 55%,#f3ecd9 100%)"},
  celadon:   {name:"青瓷釉", css:"linear-gradient(160deg,#edf3ec 0%,#dfeadb 55%,#e7efe3 100%)"},
  skyqing:   {name:"天青冻", css:"linear-gradient(160deg,#ecf2f6 0%,#d9e6ee 55%,#e4edf3 100%)"},
  taohong:   {name:"桃红雾", css:"linear-gradient(160deg,#fbf1ec 0%,#f6ded2 55%,#f9e9e1 100%)"},
  qiuxiangwp:{name:"秋香雾", css:"linear-gradient(160deg,#f5f2dc 0%,#eae4ba 55%,#f1edd2 100%)"}
};
function wallpaperLabel(spec){
  if(!spec || spec.kind === "auto") return "跟随角色卡";
  if(spec.kind === "upload") return "自定义图";
  if(spec.kind === "image") return "内置图";
  if(spec.kind === "gradient") return (WP_GRADIENTS[spec.id] || {}).name || "渐变";
  return "";
}
/* 背景来源：theme=跟随当前主题壁纸；custom=用全局上传图（自定义壁纸） */
var BGKEY = "nd_bg_src_v1";
function getBgMode(){
  try{ return localStorage.getItem(BGKEY) === "custom" ? "custom" : "theme"; }catch(e){ return "theme"; }
}
function setBgMode(m){
  try{ localStorage.setItem(BGKEY, m === "custom" ? "custom" : "theme"); }catch(e){}
  return getBgMode();
}
/* ============ 自定义主题：用户命名的「色板基底 + 壁纸 + 字体」快照 ============ */
var CKEY = "nd_custom_themes_v1";
function listCustom(){
  try{
    var arr = JSON.parse(localStorage.getItem(CKEY) || "[]");
    return Array.isArray(arr) ? arr.filter(function(c){ return c && c.id && c.name; }) : [];
  }catch(e){ return []; }
}
function customById(id){
  var arr = listCustom();
  for(var i = 0; i < arr.length; i++) if(arr[i].id === id) return arr[i];
  return null;
}
function saveCustom(name, snap){
  var arr = listCustom();
  var entry = {id:"ct" + Date.now().toString(36), name:String(name || "我的主题"),
    base:(snap && snap.base) || "moye", wp:(snap && snap.wp) || {kind:"auto"},
    font:(snap && snap.font) || "", ts:Date.now()};
  arr.unshift(entry);
  try{ localStorage.setItem(CKEY, JSON.stringify(arr.slice(0, 24))); }catch(e){}
  return entry;
}
function removeCustom(id){
  var arr = listCustom().filter(function(c){ return c.id !== id; });
  try{ localStorage.setItem(CKEY, JSON.stringify(arr)); }catch(e){}
  return arr;
}
function get(){
  try{
    var id = localStorage.getItem(KEY);
    if(id && (THEMES.some(function(t){ return t.id === id; }) || customById(id))) return id;
  }catch(e){}
  return "moye";
}
function def(id){
  for(var i = 0; i < THEMES.length; i++) if(THEMES[i].id === id) return THEMES[i];
  var c = customById(id);
  if(c){
    var b = def(c.base);
    return {id:c.id, name:c.name, desc:"自定义主题", light:!!b.light, vars:b.vars,
            wp:c.wp || {kind:"auto"}, font:c.font || "", custom:true, base:b.id};
  }
  return THEMES[0];
}
/* 当前实际生效的壁纸规格：自定义主题用自己的；内置主题看背景来源 */
function effectiveWp(){
  var d = def(get());
  if(d.custom) return d.wp || {kind:"auto"};
  if(getBgMode() === "custom") return {kind:"upload"};
  return d.wp || {kind:"auto"};
}
function apply(id, keepBg){
  var d = def(id); id = d.id;
  var root = document.documentElement;
  root.setAttribute("data-theme", d.custom ? d.base : id);
  var vars = d.vars, k;
  for(k in vars){ if(Object.prototype.hasOwnProperty.call(vars, k)) root.style.setProperty(k, vars[k]); }
  try{ localStorage.setItem(KEY, id); }catch(e){}
  if(d.custom){ if(d.font){ try{ applyFont(d.font); }catch(e){} } }
  else if(!keepBg) setBgMode("theme"); /* 用户主动切内置主题 = 壁纸跟随主题；init 回放不重置来源 */
  return id;
}
/* ============ 字体组（内置开源字体，@font-face 在 style.css） ============
 * 每组 = 标题衬线（--serif）+ 正文（--sans）的搭配；切换写 CSS 变量 + 持久化。
 * 字体子集口径与既有思源宋体一致：GB2312 常用字 + latin 片，woff2 内置离线可用。
 * 授权均为 SIL OFL 1.1，可随 App 分发，明细见 www/fonts/LICENSES.md。 */
var FKEY = "nd_fontset_v1";
var SANS_SYS = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
var FONTSETS = [
  {id:"default", name:"默认", desc:"系统黑体正文 + 思源宋体标题",
   serif:'"Noto Serif SC","Songti SC",serif', sans:SANS_SYS},
  {id:"wenkai", name:"文楷", desc:"霞鹜文楷全文 · 楷体书卷气，长读舒适",
   serif:'"LXGW WenKai","Noto Serif SC","Songti SC",serif',
   sans:'"LXGW WenKai","PingFang SC","Microsoft YaHei",sans-serif'},
  {id:"songti", name:"宋体", desc:"思源宋体全文 · 正式排版感（含 400 正文重）",
   serif:'"Noto Serif SC","Songti SC",serif', sans:'"Noto Serif SC","Songti SC",serif'},
  {id:"maobi", name:"毛笔", desc:"马善政毛笔体标题 + 系统黑体正文",
   serif:'"Ma Shan Zheng","Noto Serif SC","Songti SC",serif', sans:SANS_SYS},
  {id:"deyi", name:"得意", desc:"得意黑标题（斜体海报感）+ 系统黑体正文",
   serif:'"Smiley Sans","Noto Serif SC",sans-serif', sans:SANS_SYS},
];
function fontDef(id){
  for(var i = 0; i < FONTSETS.length; i++) if(FONTSETS[i].id === id) return FONTSETS[i];
  return FONTSETS[0];
}
function getFont(){
  try{
    var id = localStorage.getItem(FKEY);
    if(id && FONTSETS.some(function(f){ return f.id === id; })) return id;
  }catch(e){}
  return "default";
}
function applyFont(id){
  var f = fontDef(id);
  var root = document.documentElement;
  root.style.setProperty("--serif", f.serif);
  root.style.setProperty("--sans", f.sans);
  try{ localStorage.setItem(FKEY, f.id); }catch(e){}
  return f.id;
}
function init(){
  /* 尽早执行，避免主题闪烁：脚本在 head 引入。keepBg=true：回放持久化状态，不重置背景来源 */
  try{ apply(get(), true); }catch(e){}
  try{ applyFont(getFont()); }catch(e){}
}
return {THEMES: THEMES, get: get, def: def, apply: apply, init: init,
        WP_GRADIENTS: WP_GRADIENTS, wallpaperLabel: wallpaperLabel,
        getBgMode: getBgMode, setBgMode: setBgMode, effectiveWp: effectiveWp,
        listCustom: listCustom, saveCustom: saveCustom, removeCustom: removeCustom,
        FONTSETS: FONTSETS, getFont: getFont, fontDef: fontDef, applyFont: applyFont};
})();
var RP_FONT = {SETS: RP_THEME.FONTSETS, get: RP_THEME.getFont, def: RP_THEME.fontDef, apply: RP_THEME.applyFont};

/* ============ 动效（2026-10-25 用户要求：几组可选 + 可调速） ============
 * 预设组决定「哪些动效在跑」，速度档决定「跑多快」：CSS 侧关键动画/过渡时长
 * 统一写成 calc(时长 * var(--anim-mult))，JS 只切 html[data-motion] 与 --anim-mult。
 * 本脚本在 head 执行，模块加载即应用持久化状态，进页无动效闪烁。 */
var RP_MOTION = (function(){
"use strict";
var KEY = "nd_motion_v1";
var PRESETS = [
  {id:"still", name:"静止", desc:"关掉全部动效，页面切换瞬时完成"},
  {id:"soft",  name:"柔和", desc:"默认 · 页面轻淡入、最新消息浮现、背景慢呼吸"},
  {id:"fluid", name:"灵动", desc:"进聊天时最近消息依次浮现，卡片错落入场"},
  {id:"vivid", name:"绚烂", desc:"灵动之上 · 页面缩放淡入、背景呼吸更明显、消息带轻缩放"}
];
var SPEEDS = [
  {id:"slow", name:"慢",   mult:1.6},
  {id:"std",  name:"标准", mult:1},
  {id:"fast", name:"快",   mult:0.6},
  {id:"turbo",name:"极快", mult:0.3}
];
function presetDef(id){ for(var i = 0; i < PRESETS.length; i++) if(PRESETS[i].id === id) return PRESETS[i]; return PRESETS[1]; }
function speedDef(id){ for(var i = 0; i < SPEEDS.length; i++) if(SPEEDS[i].id === id) return SPEEDS[i]; return SPEEDS[1]; }
function load(){
  try{
    var o = JSON.parse(localStorage.getItem(KEY) || "null");
    if(o && presetDef(o.preset).id === o.preset) return {preset:o.preset, speed:speedDef(o.speed).id};
  }catch(e){}
  /* 没存过：系统要求减少动态时默认静止，否则柔和 */
  var still = false;
  try{ still = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }catch(e){}
  return {preset: still ? "still" : "soft", speed:"std"};
}
function apply(o, persist){
  var p = presetDef(o && o.preset), s = speedDef(o && o.speed);
  try{
    var root = document.documentElement;
    if(root){
      root.setAttribute("data-motion", p.id);
      if(root.dataset) root.dataset.motion = p.id;
      if(root.style && root.style.setProperty) root.style.setProperty("--anim-mult", String(s.mult));
    }
  }catch(e){}
  if(persist){ try{ localStorage.setItem(KEY, JSON.stringify({preset:p.id, speed:s.id})); }catch(e){} }
  return {preset:p.id, speed:s.id};
}
function get(){ return load(); }
function setPreset(id){ var o = load(); o.preset = presetDef(id).id; return apply(o, true); }
function setSpeed(id){ var o = load(); o.speed = speedDef(id).id; return apply(o, true); }
try{ apply(load(), false); }catch(e){}
return {PRESETS: PRESETS, SPEEDS: SPEEDS, get: get, apply: apply,
        setPreset: setPreset, setSpeed: setSpeed, presetDef: presetDef, speedDef: speedDef};
})();
