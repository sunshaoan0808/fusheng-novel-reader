/* 指定位置重生回归测试
 * 根因1: 重生按钮只在最后一条 AI 消息(lastAI)上, 之前的 AI 消息没有重试入口。
 * 根因2: 穿越模式下 regenMsg 走 RP.regenerate(CHAT.runId,...), CHAT.runId 为空,
 *         prompt 组装用的卡全错, 等于坏的。
 * 修法: 所有 AI 消息工具条加 ↻ 重生 → regenMsgAt(idx);
 *        穿越模式末尾也走 regenMsgAt; regenMsgAt 截断历史后走 sendChatText 重发。
 */
const fs = require("fs");
const { APP_FILES: __APP_FILES, appSource: __appSource } = require("./lib_appsrc.js"); /* v41: app.js 拆分后按加载顺序取全部分段 */
const path = require("path");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }

const appSrc = __appSource(require("path").join(__dirname, "../www"));

// 1. 非末尾 AI 消息也有重生按钮
ok("非末尾有重生按钮",
  appSrc.indexOf('title="重生这条（会删掉它后面的消息）"') >= 0 &&
  appSrc.indexOf("regenMsgAt(${jq(idx)})") >= 0);

// 2. 穿越模式末尾走 regenMsgAt（不再调坏的 regenMsg）
const rbPos = appSrc.indexOf("const regenBtn");
ok("穿越分支存在", rbPos >= 0);
const branchSnippet = appSrc.slice(rbPos, rbPos + 300);
ok("穿越走regenMsgAt", branchSnippet.indexOf("regenMsgAt") >= 0 && branchSnippet.indexOf("traverse") >= 0);

// 3. regenMsgAt 函数存在且逻辑完整
ok("regenMsgAt定义", appSrc.indexOf("window.regenMsgAt = async (idx)=>") >= 0);
const fnStart = appSrc.indexOf("window.regenMsgAt");
const fnBody = appSrc.slice(fnStart, fnStart + 1200);
ok("截断历史", fnBody.indexOf("saveHist(k, h.slice(0, idx))") >= 0);
ok("走sendChatText重发", fnBody.indexOf("await sendChatText(userText)") >= 0);
ok("非末尾先确认", fnBody.indexOf("会删掉它后面的") >= 0);
ok("流式互斥", fnBody.indexOf("正在生成中") >= 0);
ok("找前一条用户消息", fnBody.indexOf('h[i].role === "user"') >= 0);

// 4. 逻辑单元测试：截断点计算
function truncateForRetry(h, idx){
  let uidx = -1;
  for(let i = idx - 1; i >= 0; i--){ if(h[i].role === "user"){ uidx = i; break; } }
  if(uidx < 0) return null;
  return { kept: h.slice(0, idx), resend: h[uidx].content, after: h.length - 1 - idx };
}
const h = [
  {role:"user", content:"u1"},
  {role:"assistant", content:"a1"},
  {role:"user", content:"u2"},
  {role:"assistant", content:"a2"},
  {role:"user", content:"u3"},
  {role:"assistant", content:"a3"},
];
let r = truncateForRetry(h, 3); // 重生 a2
ok("中间重生截断正确", r.kept.length === 3 && r.resend === "u2" && r.after === 2);
r = truncateForRetry(h, 5); // 重生末尾 a3
ok("末尾重生截断正确", r.kept.length === 5 && r.resend === "u3" && r.after === 0);
r = truncateForRetry(h, 1); // 重生 a1
ok("首条重生截断正确", r.kept.length === 1 && r.resend === "u1" && r.after === 4);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
