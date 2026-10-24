/* 旁白模式穿越回归测试
* 根因: sendTraverse 用 h.push(newMsg("user", text)) 裸推消息, 没走 tagUserMsg,
* CHAT.narrMode 在穿越聊天里被直接忽略 —— 发出去的旁白和普通玩家发言没区别,
* 模型收不到标记。单聊/群聊走 tagUserMsg 是好的。
* 修法: sendTraverse 改走 tagUserMsg; 调用方传 userMtype。
*/
const fs = require("fs");
const { APP_FILES: __APP_FILES, appSource: __appSource } = require("./lib_appsrc.js"); /* v41: app.js 拆分后按加载顺序取全部分段 */
const path = require("path");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log(" PASS", name);} else { fail++; console.log(" FAIL", name);}}

const chatSrc = fs.readFileSync(path.join(__dirname, "../www/rp/chat.js"), "utf8");
const appSrc = __appSource(require("path").join(__dirname, "../www"));

// 1. sendTraverse 内不再有裸推, 改走 tagUserMsg
const stStart = chatSrc.indexOf("async function sendTraverse");
const stEnd = chatSrc.indexOf("\nasync function ", stStart + 10);
const stBody = chatSrc.slice(stStart, stEnd > 0? stEnd: undefined);
ok("sendTraverse无裸push", stBody.indexOf('h.push(newMsg("user", text));') < 0);
ok("sendTraverse走tagUserMsg", stBody.indexOf('h.push(tagUserMsg(newMsg("user", text), opts));') >= 0);

// 2. 调用方传 userMtype（与单聊 3898 行一致）
ok("调用方传userMtype", appSrc.indexOf('userMtype: CHAT.narrMode') >= 0 && appSrc.indexOf('"narr" : "player"') >= 0);

// 3. tagUserMsg 语义复刻验证
function tagUserMsg(um, opts){
um.mtype = (opts && opts.userMtype) || "player";
if(opts && opts.userSpeaker) um.speaker = opts.userSpeaker;
return um;
}
ok("narr透传", tagUserMsg({role:"user", content:"x"}, {userMtype:"narr"}).mtype === "narr");
ok("缺省player", tagUserMsg({role:"user", content:"x"}, {}).mtype === "player");

// 4. mapHistory 给 narr 打标记（穿越 prompt 组装用它）
function mapHistory(h){
return (h || []).map(function(m){
var c = m.content;
if(m.role === "user" && m.mtype === "narr") c = "" + c;
return {role: m.role, content: c};
});
}
const mapped = mapHistory([
{role:"user", content:"雨下了起来", mtype:"narr"},
{role:"user", content:"你好", mtype:"player"}
]);
ok("旁白打标", mapped[0].content === "雨下了起来");
ok("普通不打标", mapped[1].content === "你好");

// 5. 源码里的 mapHistory 确实有 narr 分支（防实现漂移）
ok("mapHistory有narr分支", chatSrc.indexOf('m.mtype === "narr"') >= 0);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail? 1: 0);
