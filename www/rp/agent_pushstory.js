/* Push Story (2026-10-07): 借鉴 Marinara-Engine Narrative Director。
* 一次性按钮：卡文时点一下，下一条回复 AI 自动推进剧情，用完自动关闭。
* 两种模式：
* - natural: 顺着现有剧情往前推
* - event: 加一个合理的意外转折
*/
var AGENT_PUSHSTORY = (function(){
"use strict";

function keyOf(chatId){ return "nd_pushstory_" + chatId;}

/* 武装/解除 */
function arm(chatId, mode){
try{
localStorage.setItem(keyOf(chatId), JSON.stringify({mode: mode || "natural", armed: true}));
}catch(e){}
}
function disarm(chatId){
try{ localStorage.removeItem(keyOf(chatId));}catch(e){}
}
function isArmed(chatId){
try{
var v = JSON.parse(localStorage.getItem(keyOf(chatId)));
return v && v.armed? v.mode: null;
}catch(e){ return null;}
}

/* Pre-Generation: 注入推进指令，返回后自动解除 */
function injectPrompt(chatId){
var mode = isArmed(chatId);
if(!mode) return "";
disarm(chatId); // 一次性，用完即关
if(mode === "event"){
return "【剧情转折指令·必须执行】基于以上全部剧情，写一段新的剧情发展，必须包含一个意外转折：\n" +
"1. 转折要出人意料但合理：符合人物性格和世界观，禁止凭空编造与前文矛盾的设定；\n" +
"2. 转折必须实质性改变局面：转折发生后，人物不能再回到转折前的状态，不能当没发生过；\n" +
"3. 这是新的发展，不是重写：禁止重复已有剧情的内容和场景，禁止只在对话里暗示一下然后一切照旧。";
}
return "【剧情推进指令·必须执行】基于以上全部剧情，写一段新的剧情发展，让故事实质性往前走：\n" +
"1. 四选一，必须发生其中之一：人物做出一个决定、冲突升级、新信息揭露、场景转换到下一个关键地点；\n" +
"2. 检验标准：删掉这段新发展，故事应该倒退——达不到这个标准就是没推进，重写；\n" +
"3. 这是新的发展，不是重写：禁止重复已有剧情的对话和场景、禁止只写心理活动不行动。";
}

function getMode(chatId){
return isArmed(chatId);
}

return {
arm: arm,
disarm: disarm,
isArmed: isArmed,
getMode: getMode,
injectPrompt: injectPrompt
};
})();
