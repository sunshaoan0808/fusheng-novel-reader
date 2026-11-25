/* UI 借鉴批验收（2026-11-25，Tipsy UI 四项）：卡面双入口 / 会话置顶 /
 * 心迹进度条 / 记忆用量条——接线静态断言（渲染层无法在 Node 真跑，
 * 由 XSS 闸门与全量回归兜底）。 */
const fs = require("fs");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const rd = p => fs.readFileSync(WWW + p, "utf8");

/* ① 卡面双入口 */
const mm = rd("/js/app_msgmenu.js");
t("chatWithScene 定义且先开入戏再进聊天", mm.includes("window.chatWithScene") && mm.includes("RP_SCENEPLAY.setOn(runId, name, true)"));
const shelf = rd("/js/app_shelf.js");
t("书架人物卡有入戏按钮与入戏中态", shelf.includes("chatWithScene(") && shelf.includes("入戏中"));
const picker = rd("/js/app_picker.js");
t("专辑卡有入戏按钮", picker.includes("chatWithScene("));

/* ② 会话置顶 */
const ui = rd("/js/app_ui.js");
t("置顶存储与切换", ui.includes("nd_chat_pins_v1") && ui.includes("window.toggleChatPin"));
t("最近聊过排序置顶优先", ui.includes("isChatPinned(b.runId, b.name)") && ui.includes("shelfRecent"));
t("置顶角标按钮走 jq", ui.includes("recent-pin") && ui.includes("toggleChatPin('${jq(x.runId)}','${jq(x.name)}')"));

/* ③ 心迹进度条 */
const ch = rd("/js/app_character.js");
t("心迹进度条与下一解锁预告", ch.includes("favbar") && ch.includes("下一解锁") && ch.includes("深层心迹已全部解锁"));

/* ④ 记忆用量条 */
const mem = rd("/js/app_memory.js");
t("用量条渲染（字数+置顶）", mem.includes("memmeter") && mem.includes("事实字数") && mem.includes("置顶事实"));

/* 样式齐备 */
const ui42 = rd("/ui42.css"), style = rd("/style.css");
t("recent-pin/favbar 样式在", ui42.includes(".recent-pin") && ui42.includes(".favbar"));
t("memmeter 样式在", style.includes(".memmeter"));

console.log("ui_borrows: " + pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
