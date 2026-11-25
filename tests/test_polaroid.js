/* 拍立得显影验收（2026-11-25，借鉴 Tipsy PolaroidStudio）：
 * 新鲜标记集合的功能测试（从 app_ui.js 抽出真实代码跑）+ 接线静态断言。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const rd = p => fs.readFileSync(WWW + p, "utf8");

/* 功能：抽出 markFreshImg/isFreshImg 真代码，用假时钟验过期 */
const ui = rd("/js/app_ui.js");
const m = ui.match(/window\.__freshImgs[\s\S]*?function isFreshImg[\s\S]*?\n}\n/);
t("新鲜标记代码可抽取", !!m);
if(m){
  const timers = [];
  const ctx = { window: {}, setTimeout: (fn, ms)=>{ timers.push({fn, ms}); return timers.length; } };
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  const url = "data:image/jpeg;base64,XXXX";
  t("未标记不是新鲜", ctx.isFreshImg(url) === false);
  ctx.markFreshImg(url);
  t("标记后新鲜", ctx.isFreshImg(url) === true);
  t("摘除定时器已排（2.6s）", timers.length === 1 && timers[0].ms === 2600);
  timers[0].fn();
  t("到期后不再新鲜", ctx.isFreshImg(url) === false);
  t("空 url 不标记", ctx.markFreshImg("") === undefined && ctx.isFreshImg("") === false);
}

/* 接线 */
const prefs = rd("/js/app_prefs.js");
t("CG 卡带 polaroid 类与 developing 条件", prefs.includes("cgtpl polaroid") && prefs.includes("isFreshImg(cgSafe)"));
t("CG 回挂时标记新鲜", prefs.includes("markFreshImg(stored)"));
t("场景卡图带相纸框", ui.includes("polaroid sm") && ui.includes("isFreshImg(safeImg)"));
const rundata = rd("/js/app_rundata.js");
t("场景配图保存时标记新鲜", rundata.includes("markFreshImg(stored)"));
const css = rd("/ui42.css");
t("显影关键帧与相纸样式在", css.includes("@keyframes polaroidDevelop") && css.includes(".polaroid") && css.includes("prefers-reduced-motion"));

console.log("polaroid: " + pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
