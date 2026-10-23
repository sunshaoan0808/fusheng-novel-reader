/* Check 属性判定器测试：按 Tier1-8 行为规格逐条覆盖，确定性随机源（验收人自写） */
const { createCheck } = require("../www/rp/check.js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

/* 可控随机源：setV(x) 让下一次 random() 返回 x；rollPercent = floor(x*100)+1 */
function rig(){
  let v = 0;
  const c = createCheck({ random: () => v });
  return { c, setV(x){ v = x; } };
}

/* 掷骰面 */
{
  const { c, setV } = rig();
  ok("rollDie 非法面数返回 null", c.rollDie(1) === null && c.rollDie(2.5) === null && c.rollDie("6") === null && c.rollDie(0) === null);
  setV(0);     ok("rollDie(6) 下限 1", c.rollDie(6) === 1);
  setV(0.999); ok("rollDie(6) 上限 6", c.rollDie(6) === 6);
  setV(0);     ok("rollPercent 下限 1", c.rollPercent() === 1);
  setV(0.999); ok("rollPercent 上限 100", c.rollPercent() === 100);
}

/* 四档判定 */
{
  const { c, setV } = rig();
  setV(0.495); let r = c.check({ attribute: 50 });
  ok("roll=target 判 success、margin 0", r.roll === 50 && r.target === 50 && r.success === true && r.tier === "success" && r.margin === 0);
  setV(0.505); r = c.check({ attribute: 50 });
  ok("roll>target 判 failure", r.roll === 51 && r.success === false && r.tier === "failure" && r.margin === -1);
  setV(0); r = c.check({ attribute: 5 });
  ok("roll=1 恒 critical", r.roll === 1 && r.tier === "critical" && r.success === true);
  setV(0.999); r = c.check({ attribute: 99 });
  ok("roll=100 恒 fumble", r.roll === 100 && r.tier === "fumble" && r.success === false);
}

/* 目标值算法：modifier/difficulty/钳制 */
{
  const { c, setV } = rig();
  setV(0.545); let r = c.check({ attribute: 50, modifier: 10, difficulty: 5 });
  ok("target = 50+10-5 = 55，roll 55 成功", r.target === 55 && r.roll === 55 && r.success === true);
  setV(0.495); r = c.check({ attribute: 150 });
  ok("target 上钳 99", r.target === 99);
  setV(0.015); r = c.check({ attribute: -20 });
  ok("target 下钳 1，roll 2 失败", r.target === 1 && r.roll === 2 && r.success === false && r.tier === "failure");
  setV(0.495); r = c.check({ attribute: 50, difficulty: "hard", modifier: "x" });
  ok("非有限 difficulty/modifier 被忽略不判 null", r !== null && r.target === 50);
}

/* 非法 attribute */
{
  const { c } = rig();
  ok("attribute 非有限/缺失/入参非法返回 null", c.check({ attribute: NaN }) === null && c.check({ attribute: "50" }) === null &&
     c.check({}) === null && c.check(null) === null && c.check() === null);
}

/* 历史上限与统计 */
{
  const { c, setV } = rig();
  setV(0);     c.check({ attribute: 50 });
  setV(0.999); c.check({ attribute: 50 });
  setV(0.495); c.check({ attribute: 50 });
  setV(0.505); c.check({ attribute: 50 });
  ok("stats 累计四档", eq(c.stats(), { total: 4, successes: 2, criticals: 1, fumbles: 1 }));
  ok("history 记录关键字段", c.history().length === 4 && c.history()[0].tier === "critical" && c.history()[0].target === 50);
  for (let i = 0; i < 51; i++){ setV(0.495); c.check({ attribute: 60 }); }
  ok("history 至多 50 条且统计不受影响", c.history().length === 50 && c.stats().total === 55 && c.history()[0].attribute === 60);
  c.clearHistory();
  ok("clearHistory 清历史不清统计", c.history().length === 0 && c.stats().total === 55);
}

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
