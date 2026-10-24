/* 推剧情(Push Story)穿越模式回归测试
 * 根因: togglePushStory 用 chatKey(CHAT.runId, CHAT.name) 武装, 穿越模式下
 * CHAT.runId 为空导致 key 变成垃圾值 "nd_pushstory_"; 且 sendTraverse 从未调用
 * AGENT_PUSHSTORY.injectPrompt, 推进指令在穿越聊天里永远进不了 prompt。
 * 修法: 武装 key 按模式取 nd_travchat_<travId>; sendTraverse 注入推进指令。
 */
const fs = require("fs");
const { APP_FILES: __APP_FILES, appSource: __appSource } = require("./lib_appsrc.js"); /* v41: app.js 拆分后按加载顺序取全部分段 */
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "../www/rp/agent_pushstory.js"), "utf8");

function freshEnv(){
  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  // 隔离每次 eval 的顶层 var
  const m = new (require("vm").Script)(src + "\n;this.AGENT_PUSHSTORY;");
  const ctx = require("vm").createContext({ localStorage: global.localStorage });
  return m.runInContext(ctx);
}

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }

// 1. 穿越 key 武装后，sendTraverse 的注入点能命中
let PS = freshEnv();
const wsIdT = "nd_travchat_abc123";
PS.arm(wsIdT, "natural");
ok("穿越注入命中", PS.injectPrompt(wsIdT).indexOf("剧情推进指令") >= 0);

// 2. 一次性：用完即解除
ok("一次性解除", PS.injectPrompt(wsIdT) === "");

// 3. event 模式文案
PS = freshEnv();
PS.arm(wsIdT, "event");
ok("event模式", PS.injectPrompt(wsIdT).indexOf("意外转折") >= 0);

// 4. 旧垃圾 key("") 不应命中真实会话
PS = freshEnv();
PS.arm(wsIdT, "natural");
ok("空key隔离", PS.injectPrompt("") === "");

// 5. app.js 武装 key 逻辑：穿越模式用 nd_travchat_ 前缀
const appSrc = __appSource(require("path").join(__dirname, "../www"));
ok("app.js穿越key分支", appSrc.indexOf('"nd_travchat_" + CHAT.travId') >= 0);

// 6. chat.js sendTraverse 有注入点
const chatSrc = fs.readFileSync(path.join(__dirname, "../www/rp/chat.js"), "utf8");
ok("sendTraverse注入点", chatSrc.indexOf("AGENT_PUSHSTORY.injectPrompt(wsIdT)") >= 0);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
