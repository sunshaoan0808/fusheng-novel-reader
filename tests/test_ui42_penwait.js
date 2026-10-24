/* v42-10 等待态「X正在提笔…」：名字选择 / 结构 / 显隐条件（vm + 极简 DOM 桩） */
const fs = require("fs"), vm = require("vm"), path = require("path");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const els = {};
const log = { html: "", insertAdjacentHTML(_p, h){ this.html += h; els.typing = { remove(){ delete els.typing; log.html = log.html.replace(/<div class="msg penwait"[\s\S]*$/, ""); } }; },
  querySelector(){ return null; }, scrollHeight: 0, scrollTop: 0 };
let streaming = false;
const ctx = {console, CHAT: {mode: "single", runId: "r", name: "黛玉"}, INDEX: [], icon: () => "<svg></svg>",
  charImg: () => "", charPortrait: () => null, allChars: () => [], getHistSafe: () => [], chatHistKey: () => "k",
  document: { getElementById: (id) => id === "chatlog" ? log : (els[id] || null) }};
ctx.window = ctx; ctx.window.__isStreaming = () => streaming; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(WWW, "rp/escutil.js"), "utf8"), ctx);
vm.runInContext("const esc = escH; let STREAM_SPEAKER = null;", ctx);
vm.runInContext(fs.readFileSync(path.join(WWW, "js/app_ui.js"), "utf8"), ctx);
const R = (c) => vm.runInContext(c, ctx);

t("单聊用角色名", R("penWaitName()") === "黛玉");
R('CHAT.mode="group"');
t("群聊未知下一位 → 对方", R("penWaitName()") === "对方");
R('STREAM_SPEAKER="晴雯"');
t("群聊已知下一位 → 其名", R("penWaitName()") === "晴雯");
R('CHAT.mode="single"; STREAM_SPEAKER=null');
const h = R('penWaitHTML("黛<b>")');
t("id=typing + role=status", /id="typing"/.test(h) && /role="status"/.test(h));
t("文案「X正在提笔…」且名字转义", h.indexOf("黛&lt;b&gt;正在提笔…") >= 0 && h.indexOf("<b>") < 0);
t("带头像与三枚墨点", /class="mav/.test(h) && (h.match(/<i><\/i>/g) || []).length === 3);
R("showPenWait()");
t("未在流式中不显示", !els.typing);
streaming = true; R("showPenWait()");
t("流式中显示", !!els.typing && log.html.indexOf("黛玉正在提笔…") >= 0);
R("showPenWait()");
t("重复调用不叠加", (log.html.match(/id="typing"/g) || []).length === 1);
els.live = {}; R("hidePenWait(); showPenWait()");
t("已有 live 气泡不显示", !els.typing);
delete els.live; R("showPenWait(); hidePenWait()");
t("hidePenWait 移除", !els.typing);
/* 接线：setStreaming / renderChat 末尾调用；流式首 token 仍移除 #typing */
const pl = fs.readFileSync(path.join(WWW, "js/app_plotline.js"), "utf8");
const pf = fs.readFileSync(path.join(WWW, "js/app_prefs.js"), "utf8");
t("setStreaming 接线", /function setStreaming[\s\S]{0,300}showPenWait\(\); else hidePenWait\(\)/.test(pl));
t("streamToken 首 token 移除 #typing", /getElementById\("typing"\)\.remove\(\)/.test(pl));
t("renderChat 末尾接线", /function renderChat[\s\S]*?showPenWait\(\)[\s\S]*?\n}\n\/\* S-4/.test(pf));
const css = fs.readFileSync(path.join(WWW, "ui42.css"), "utf8");
t("动画只在 no-preference 下", /prefers-reduced-motion:no-preference\)\{\s*\.penwait-ink i\{ animation/.test(css));
console.log(`ui42_penwait: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
