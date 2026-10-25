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
t("速度倍率单调递减", T("RP_MOTION.SPEEDS.map(s=>s.mult).join(',')") === "1.6,1,0.6,0.3");
t("默认柔和+标准", T("RP_MOTION.get().preset") === "soft" && T("RP_MOTION.get().speed") === "std");
t("默认已应用", ctx.__attrs["data-motion"] === "soft" && ctx.__vars["--anim-mult"] === "1");
T("RP_MOTION.setPreset('vivid')");
t("切绚烂即时应用", ctx.__attrs["data-motion"] === "vivid" && T("RP_MOTION.get().preset") === "vivid");
t("切绚烂落盘", JSON.parse(store["nd_motion_v1"]).preset === "vivid");
T("RP_MOTION.setSpeed('turbo')");
t("极快倍率0.3", ctx.__vars["--anim-mult"] === "0.3" && JSON.parse(store["nd_motion_v1"]).speed === "turbo");
t("非法预设回退柔和", T("RP_MOTION.setPreset('nope').preset") === "soft");
t("非法速度回退标准", T("RP_MOTION.setSpeed('nope').speed") === "std");
/* 持久化往返：新上下文同存储应读回 */
T("RP_MOTION.setPreset('fluid')"); T("RP_MOTION.setSpeed('slow')");
const ctx2 = mkCtx(store);
const T2 = (s)=>vm.runInContext(s, ctx2);
t("重载读回灵动+慢", T2("RP_MOTION.get().preset") === "fluid" && T2("RP_MOTION.get().speed") === "slow");
t("重载已应用慢速", ctx2.__vars["--anim-mult"] === "1.6" && ctx2.__attrs["data-motion"] === "fluid");

console.log(`motion: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
