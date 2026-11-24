/* RP_SCENEIMG: 场景配图（2026-11-24 用户拍板双通道 MVP）
 * 通道 A「api」: 复用 RP_NET.generateImage（OpenAI 兼容 /images/generations，
 *   用设置里的 API 地址/Key + 生图模型）；通道 B「pollinations」: 免费 GET URL
 *   出图、无需 Key（限流与画质见设置页说明），返回图片 URL 直接存。
 * 触发两条：场景卡「配图」按钮（手动，界面层浮层）与 CG 定格自动落图
 *   （chat.js 在结算 notices 里见到 kind=cg 时调 autoCgImage，后台异步、
 *   失败静默，成功后由界面层按消息 mid 挂图落盘）。
 * prompt 程序拼装（场景卡字段 + 在场人物外貌 + 统一画风词），不额外花
 *   一次文本模型调用。开关：cfg.imgSrc 选通道（默认 pollinations），
 *   RP cfg.cgAuto 控自动落图（默认开），RP cfg.apex 无关。 */
var RP_SCENEIMG = (function(){
"use strict";
var PERIOD = {dawn: "清晨", morning: "上午", noon: "正午", afternoon: "午后", dusk: "黄昏", night: "夜晚", midnight: "深夜"};
var WX = {clear: "晴朗", cloudy: "多云", rain: "细雨", snow: "飘雪", fog: "薄雾", storm: "暴雨"};

function buildPrompt(scene, opts){
opts = opts || {};
scene = scene || {};
var parts = ["场景插画"];
if(scene.place) parts.push("地点：" + scene.place);
var per = PERIOD[scene.period] || scene.period || "";
var wx = scene.weatherName || WX[scene.weather] || scene.weather || "";
var meta = [per, wx].filter(Boolean).join("，");
if(meta) parts.push(meta);
if(scene.present && scene.present.length){
var pres = scene.present.map(function(nm){
var ap = opts.appearance && opts.appearance[nm];
return ap ? nm + "（" + String(ap).slice(0, 40) + "）" : nm;
}).join("、");
parts.push("在场：" + pres);
}
if(scene.diary) parts.push("画面：" + String(scene.diary).slice(0, 80));
else if(opts.excerpt) parts.push("画面：" + String(opts.excerpt).replace(/\s+/g, " ").slice(0, 60));
parts.push("细腻叙事插画，电影感构图，柔和光影，画面中不要出现文字");
return parts.join("。");
}

function channelOf(cfg, rpCfg){
var src = (cfg && cfg.imgSrc) || (rpCfg && rpCfg.imgSrc) || "pollinations";
if(src === "api")
return (cfg && cfg.base && cfg.key && cfg.imgModel) ? "api" : null;
return "pollinations";
}

function pollinationsUrl(prompt, seed){
return "https://image.pollinations.ai/prompt/" + encodeURIComponent(String(prompt || ""))
+ "?width=1024&height=640&seed=" + (seed == null ? 42 : seed) + "&model=flux";
}

/* 返回图片引用：api 通道是 data URL（b64），pollinations 是 https URL。
 * 界面层落盘前会把 data URL 压成 768 宽 JPEG（见 app_rundata shrinkImgForStore）。 */
async function generate(cfg, rpCfg, prompt, seed){
var ch = channelOf(cfg, rpCfg);
if(!ch) throw new Error("生图未配置：请在设置里选生图来源（自定义端点需填生图模型）");
if(ch === "api"){
if(typeof RP_NET === "undefined" || !RP_NET.generateImage) throw new Error("生图通道不可用");
return await RP_NET.generateImage(cfg, prompt, cfg.imgModel);
}
return pollinationsUrl(prompt, seed);
}

function cgAutoOn(){
try{
if(typeof getRpCfg !== "function") return true;
var c = getRpCfg();
return !c || c.cgAuto !== false;
}catch(e){ return true; }
}

var lastAutoAt = 0;
/* CG 定格自动落图：节流（35 秒内最多一张，Pollinations 免费档限流更严，
 * 撞限流也只是这张不出）、失败返回 null 静默。成功返回图片引用字符串。 */
async function autoCgImage(args){
try{
args = args || {};
var now = Date.now();
if(now - lastAutoAt < 35000) return null;
lastAutoAt = now;
var prompt = buildPrompt(args.scene, {appearance: args.appearance, excerpt: args.excerpt});
return await generate(args.cfg, null, prompt, (now % 100000));
}catch(e){ return null; }
}

return {
buildPrompt: buildPrompt, channelOf: channelOf,
pollinationsUrl: pollinationsUrl, generate: generate,
cgAutoOn: cgAutoOn, autoCgImage: autoCgImage
};
})();
