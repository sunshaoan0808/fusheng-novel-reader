const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
// 动效系统回归：RP_MOTION 预设组 × 速度档（存储/应用/回退）
let pass = 0, fail = 0;
const t = (n, c)=>{ c ? pass++ : (fail++, console.log("FAIL:", n)); };

function mkCtx(store){
  const attrs = {}, vars = {};
  const ctx = {console,
    localStorage: {getItem: k=>store[k] ?? null, setItem: (k,v)=>{ store[k] = String(v); }},
    document: {documentElement: {dataset: {}, setAttribute(k,v){ attrs[k] = v; }, style: {setProperty(k,v){ vars[k] = v; }}}},
  };
  ctx.__attrs = attrs; ctx.__vars = vars;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(WWW + "/rp/theme.js", "utf8"), ctx);
  return ctx;
}
const store = {};
const ctx = mkCtx(store);
const T = (s)=>vm.runInContext(s, ctx);
t("预设4组", T("RP_MOTION.PRESETS.length") === 4);
t("速度4档", T("RP_MOTION.SPEEDS.length") === 4);
t("速度倍率单调递减", T("RP_MOTION.SPEEDS.map(s=>s.mult).join(',')") === "1.4,1,0.7,0.45");
t("标准档倍率=1（CSS 原始时长即设计意图）", T("RP_MOTION.SPEEDS[1].mult") === 1);
t("默认柔和+标准", T("RP_MOTION.get().preset") === "soft" && T("RP_MOTION.get().speed") === "std");
t("默认已应用", ctx.__attrs["data-motion"] === "soft" && ctx.__vars["--anim-mult"] === "1");
T("RP_MOTION.setPreset('vivid')");
t("切绚烂即时应用", ctx.__attrs["data-motion"] === "vivid" && T("RP_MOTION.get().preset") === "vivid");
t("切绚烂落盘", JSON.parse(store["nd_motion_v1"]).preset === "vivid");
T("RP_MOTION.setSpeed('turbo')");
t("极快倍率0.45", ctx.__vars["--anim-mult"] === "0.45" && JSON.parse(store["nd_motion_v1"]).speed === "turbo");
t("非法预设回退柔和", T("RP_MOTION.setPreset('nope').preset") === "soft");
t("非法速度回退标准", T("RP_MOTION.setSpeed('nope').speed") === "std");
/* 持久化往返：新上下文同存储应读回 */
T("RP_MOTION.setPreset('fluid')"); T("RP_MOTION.setSpeed('slow')");
const ctx2 = mkCtx(store);
const T2 = (s)=>vm.runInContext(s, ctx2);
t("重载读回灵动+慢", T2("RP_MOTION.get().preset") === "fluid" && T2("RP_MOTION.get().speed") === "slow");
t("重载已应用慢速", ctx2.__vars["--anim-mult"] === "1.4" && ctx2.__attrs["data-motion"] === "fluid");

/* CSS 侧调校守卫（2026-11-24）：缓动令牌存在、呼吸幅度收敛、旧标定不许回潮 */
const css = fs.readFileSync(WWW + "/style.css", "utf8");
t("缓动令牌 --ease-out 已定义", css.indexOf("--ease-out:cubic-bezier(.22,1,.36,1)") >= 0);
t("呼吸幅度收敛 1.03", css.indexOf("transform:scale(1.03)") >= 0 && css.indexOf("scale(1.07)") < 0);
t("绚烂呼吸幅度收敛 1.05", css.indexOf("transform:scale(1.05)") >= 0 && css.indexOf("scale(1.12)") < 0);
t("壁纸层不再常驻 will-change", !/\.bglayer\{[^}]*will-change/.test(css));

console.log(`motion: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
