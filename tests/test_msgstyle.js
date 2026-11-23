/* 2026-11-23 对话样式三式(丙)回归:
 * (1) RP_MSGSTYLE 切片行为: 默认 frameless、apply 写 data-msgstyle、持久化、非法回落;
 * (2) CSS 覆盖层: 无框摘底/边/影、毛玻璃半透明+模糊+播放摘模糊、气泡无覆盖(基线即气泡);
 * (3) 设置页接线。 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const themeSrc = fs.readFileSync(path.join(WWW, "rp/theme.js"), "utf8");
const ui42 = fs.readFileSync(path.join(WWW, "ui42.css"), "utf8");
const prefs = fs.readFileSync(path.join(WWW, "js/app_prefs.js"), "utf8");
const appjs = fs.readFileSync(path.join(WWW, "app.js"), "utf8");

{
  const start = themeSrc.indexOf("var RP_MSGSTYLE = (function(){");
  const end = themeSrc.indexOf("})();", start) + 5;
  t("RP_MSGSTYLE 模块存在", start >= 0 && end > start);
  const store = {};
  const attrs = {};
  const ctx = { console,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(themeSrc.slice(start, end), ctx);
  const MS = vm.runInContext("RP_MSGSTYLE", ctx);
  t("默认无框且已写属性", MS.get() === "frameless" && attrs["data-msgstyle"] === "frameless");
  t("三式齐全(无框/毛玻璃/气泡)", MS.LEVELS.map(l => l.id).join(",") === "frameless,glass,bubble");
  MS.apply("glass", true);
  t("切毛玻璃: 属性+持久化", attrs["data-msgstyle"] === "glass" && store["nd_msgstyle_v1"] === "glass" && MS.get() === "glass");
  MS.apply("bogus", true);
  t("非法值回落无框", attrs["data-msgstyle"] === "frameless");
}
t("无框: 聊天泡摘底/边/影", /html\[data-msgstyle="frameless"\] body\.chatmode \.bubble\{\s*background:transparent; border-color:transparent; box-shadow:none/.test(ui42));
t("无框: 对白段去框且与旁白同缩进", /html\[data-msgstyle="frameless"\] \.bubble\.segd \.seg-dlg\{[^}]*background:transparent[^}]*padding:2px 6px 2px 12px/.test(ui42));
t("毛玻璃: 半透明+模糊", /html\[data-msgstyle="glass"\] body\.chatmode \.bubble,\s*html\[data-msgstyle="glass"\] \.bubble\.segd \.seg-dlg\{[^}]*color-mix\(in srgb, var\(--card\) 52%, transparent\)[^}]*blur\(14px\)/.test(ui42));
t("毛玻璃: 用户泡带金调+模糊", ui42.indexOf('html[data-msgstyle="glass"] body.chatmode .msg.me .bubble') >= 0);
t("毛玻璃: 播放中摘模糊防闪烁", /html\[data-msgstyle="glass"\] \.msg\.typing \.bubble,\s*html\[data-msgstyle="glass"\] \.msg\.typing \.bubble\.segd \.seg-dlg\{\s*-webkit-backdrop-filter:none/.test(ui42));
t("气泡式无覆盖(基线即气泡)", !/data-msgstyle="bubble"\]/.test(ui42));
t("设置页有对话样式卡", appjs.indexOf("对话样式") >= 0 && appjs.indexOf("chatstylebox") >= 0);
t("prefs 有 chatstyleCardsHTML/setChatStyleUI", prefs.indexOf("chatstyleCardsHTML") >= 0 && prefs.indexOf("setChatStyleUI") >= 0);

console.log(`test_msgstyle: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
