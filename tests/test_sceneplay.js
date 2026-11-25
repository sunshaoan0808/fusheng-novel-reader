/* ScenePlay 入戏打包验收（2026-11-25）：开关持久化/按聊隔离 +
 * 接线静态断言（工具条按钮、sendChat 强制选项、横幅刷新点、沉浸兜底）。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

const store = {};
const ctx = {console, localStorage: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(WWW + "/rp/sceneplay.js", "utf8"), ctx);
const S = vm.runInContext("RP_SCENEPLAY", ctx);

t("默认关", S.isOn("r1", "甲") === false);
t("toggle 开", S.toggle("r1", "甲") === true && S.isOn("r1", "甲") === true);
t("按聊隔离", S.isOn("r1", "乙") === false && S.isOn("r2", "甲") === false);
t("toggle 关", S.toggle("r1", "甲") === false && S.isOn("r1", "甲") === false);
S.setOn("r1", "甲", true);
t("setOn 落盘可重读", JSON.parse(store["nd_sceneplay_v1"])["r1|甲"] === 1);

const plot = fs.readFileSync(WWW + "/js/app_plotline.js", "utf8");
t("工具条有入戏按钮", plot.includes('id="spbtn"') && plot.includes("toggleScenePlay(event)"));
t("sendChat 强制选项", plot.includes("RP_SCENEPLAY.isOn(CHAT.runId, CHAT.name)") && plot.includes("sendOpts.optCount = 3"));
t("toggleScenePlay 已定义", plot.includes("window.toggleScenePlay"));
const hud = fs.readFileSync(WWW + "/js/app_chat_hud.js", "utf8");
t("横幅刷新函数在", hud.includes("function refreshSceneBanner()") && hud.includes("spbanner"));
const prefs = fs.readFileSync(WWW + "/js/app_prefs.js", "utf8");
t("renderChat 调横幅刷新", prefs.includes("refreshSceneBanner()"));
const css = fs.readFileSync(WWW + "/style.css", "utf8");
t("沉浸兜底隐藏横幅", css.includes("body.chatmode.immersive .spbanner"));
const idx = fs.readFileSync(WWW + "/index.html", "utf8");
t("index 加载 sceneplay.js", idx.includes("rp/sceneplay.js"));

console.log("sceneplay: " + pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
