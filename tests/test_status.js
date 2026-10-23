/* FavorEngine 好感引擎测试：按 Tier1-3 行为规格逐条覆盖（验收人自写） */
const { createFavorEngine } = require("../www/rp/status.js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

/* 1. 人名键增量 + 累加 */
{
  const e = createFavorEngine();
  const r1 = e.applyStatus({ "林黛玉好感": "+2" });
  ok("人名键增量 changes", eq(r1.changes, [{ name: "林黛玉", delta: 2, total: 2, mode: "increment" }]));
  ok("favorOf 当前值", e.favorOf("林黛玉") === 2);
  e.applyStatus({ "林黛玉好感": "+3" });
  ok("增量累加", e.favorOf("林黛玉") === 5);
  ok("has 已建档", e.has("林黛玉") === true && e.has("贾宝玉") === false);
}

/* 2. 裸键归属 defaultTarget；没传则忽略 */
{
  const e = createFavorEngine();
  e.applyStatus({ "林黛玉好感": "+10" });
  const r = e.applyStatus({ "好感": "-1" }, { defaultTarget: "林黛玉" });
  ok("裸键归属 defaultTarget", r.changes.length === 1 && e.favorOf("林黛玉") === 9);
  const r2 = e.applyStatus({ "好感": "-1" });
  ok("无 defaultTarget 裸键忽略", r2.changes.length === 0 && e.favorOf("林黛玉") === 9);
}

/* 3. 好感度后缀键 */
{
  const e = createFavorEngine();
  e.applyStatus({ "贾宝玉好感度": "+10" });
  ok("好感度后缀解析人名", e.favorOf("贾宝玉") === 10);
}

/* 4. 绝对设定 mode=set，delta 为实际差值 */
{
  const e = createFavorEngine();
  e.applyStatus({ "林黛玉好感": "+4" });
  const r = e.applyStatus({ "林黛玉好感": "35" });
  ok("绝对设定", eq(r.changes, [{ name: "林黛玉", delta: 31, total: 35, mode: "set" }]));
}

/* 5. 钳制与实际生效量 */
{
  const e = createFavorEngine();
  const r = e.applyStatus({ "甲好感": "+1000" });
  ok("钳制上限 100 且 delta 为实际量", r.changes[0].total === 100 && r.changes[0].delta === 100);
  e.applyStatus({ "甲好感": "10" });
  const r2 = e.applyStatus({ "甲好感": "-50" });
  ok("钳制下限 0 且 delta 为实际量", r2.changes[0].total === 0 && r2.changes[0].delta === -10);
  const r3 = e.applyStatus({ "甲好感": "+0" });
  ok("零变化不进 changes", r3.changes.length === 0);
}

/* 6. 无关键与不可解析值忽略 */
{
  const e = createFavorEngine();
  const r = e.applyStatus({ "心情": "平静", "地点": "花园", "乙好感": "很多" });
  ok("无关键/无数字一律忽略", r.changes.length === 0);
}

/* 7. 值形态：带单位、全角符号、数字类型 */
{
  const e = createFavorEngine();
  e.applyStatus({ "甲好感": "+2点" });
  ok("带单位增量", e.favorOf("甲") === 2);
  e.applyStatus({ "甲好感": "＋3" });
  ok("全角加号按增量", e.favorOf("甲") === 5);
  const r = e.applyStatus({ "乙好感": 35 });
  ok("数字类型按设定", r.changes.length === 1 && r.changes[0].mode === "set" && e.favorOf("乙") === 35);
}

/* 8. 等级与 ratio */
{
  const e = createFavorEngine();
  e.applyStatus({ "甲好感": "38" });
  const lv = e.levelOf("甲");
  ok("等级 38 为平淡", lv.value === 38 && lv.levelIndex === 1 && lv.levelName === "平淡" && Math.abs(lv.ratio - 0.38) < 1e-9);
  e.applyStatus({ "甲好感": "85" });
  const lv2 = e.levelOf("甲");
  ok("等级 85 为倾心", lv2.levelIndex === 4 && lv2.levelName === "倾心");
  const lv0 = e.levelOf("路人");
  ok("未建档等级按初始值", lv0.value === 0 && lv0.levelIndex === 0 && lv0.levelName === "疏远");
}

/* 9. 自定义配置：初始值、范围、阈值 */
{
  const e = createFavorEngine({ initial: 10, min: 0, max: 50 });
  ok("自定义初始值", e.favorOf("甲") === 10);
  e.applyStatus({ "甲好感": "80" });
  ok("自定义上限钳制", e.favorOf("甲") === 50 && e.levelOf("甲").ratio === 1);
}

/* 10. allFavor 是副本 */
{
  const e = createFavorEngine();
  e.applyStatus({ "甲好感": "+5" });
  const all = e.allFavor();
  all["甲"] = 999;
  ok("allFavor 副本隔离", e.favorOf("甲") === 5 && eq(e.allFavor(), { "甲": 5 }));
}

/* 11. 快照/恢复 */
{
  const e = createFavorEngine();
  e.applyStatus({ "甲好感": "+30", "乙好感": "12" });
  const snap = e.snapshot();
  const e2 = createFavorEngine();
  e2.restore(JSON.parse(JSON.stringify(snap)));
  ok("快照恢复往返一致", eq(e2.allFavor(), { "甲": 30, "乙": 12 }));
  let threw = false;
  try {
    e2.restore(null);
    e2.restore({ data: { "丙": "abc", "丁": 25, "戊": 9999 } });
  } catch (err) { threw = true; }
  ok("恢复非法输入不抛错、坏条目忽略、值钳制", !threw && e2.favorOf("丁") === 25 && e2.favorOf("戊") === 100 && e2.has("丙") === false);
}

/* 12. onChange：非空才触发一次、退订 */
{
  const e = createFavorEngine();
  let calls = 0, lastChanges = null;
  const off = e.onChange((changes) => { calls++; lastChanges = changes; });
  e.applyStatus({ "心情": "平静" });
  ok("空变化不触发 onChange", calls === 0);
  e.applyStatus({ "甲好感": "+1", "乙好感": "+2" });
  ok("一次 apply 触发一次且带全部 changes", calls === 1 && lastChanges.length === 2);
  off();
  e.applyStatus({ "甲好感": "+1" });
  ok("退订后不再触发", calls === 1);
}

/* 13. reset */
{
  const e = createFavorEngine();
  e.applyStatus({ "甲好感": "+30", "乙好感": "+20" });
  e.reset("甲");
  ok("reset 单人回初始且除名", e.favorOf("甲") === 0 && e.has("甲") === false && e.favorOf("乙") === 20);
  e.reset();
  ok("reset 全部", eq(e.allFavor(), {}));
}

/* 14. 异常输入健壮性 */
{
  const e = createFavorEngine();
  let threw = false, r;
  try {
    r = e.applyStatus(null);
    e.applyStatus("不是对象");
    e.applyStatus([1, 2]);
    e.applyStatus({ "好感": "+1" }, {});
  } catch (err) { threw = true; }
  ok("异常输入不抛错且返回空 changes", !threw && eq(r, { changes: [] }));
}

/* 15. 同轮同人多条依次生效 */
{
  const e = createFavorEngine();
  const r = e.applyStatus({ "好感": "+1", "林黛玉好感": "+2" }, { defaultTarget: "林黛玉" });
  ok("同轮同人多条依次生效", e.favorOf("林黛玉") === 3 && r.changes.length === 2 && r.changes[1].total === 3);
}

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
