/* SceneManager 场景状态测试：按 Tier1-10 行为规格逐条覆盖（验收人自写） */
const { createSceneManager } = require("../www/rp/scene.js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

function setup(){
  const s = createSceneManager();
  s.defineLocation("riverside", { name: "河边", backgrounds: { default: "river_day.png", night: "river_night.png", rain: "river_rain.png" } });
  s.defineLocation("room", { name: "闺房", backgrounds: { default: "room.png" } });
  return s;
}

/* 定义校验与初始状态 */
{
  const s = createSceneManager();
  ok("非法地点定义拒绝", s.defineLocation("", { name: "x", backgrounds: { default: "a.png" } }) === false &&
     s.defineLocation("a", { backgrounds: { default: "a.png" } }) === false &&
     s.defineLocation("b", { name: "x", backgrounds: {} }) === false &&
     s.defineLocation("c", { name: "x", backgrounds: { default: "" } }) === false &&
     s.defineLocation("d", { name: "x", backgrounds: { default: "a.png", night: "" } }) === false &&
     s.defineLocation("e", null) === false);
  const st = s.state();
  ok("初始状态无地点/上午/晴", st.location === null && st.locationName === null && st.time === "morning" && st.weather === "clear" && st.background === null);
  ok("初始 describe", s.describe() === "未知之地 · 上午 · 晴");
  ok("初始 trail 为空、resolveBackground 为 null", eq(s.trail(), []) && s.resolveBackground() === null);
}

/* 进入与背景回退链 */
{
  const s = setup();
  ok("enter 未定义地点返回 false", s.enter("nowhere") === false);
  ok("enter 成功、默认背景", s.enter("riverside") === true && s.resolveBackground() === "river_day.png");
  ok("时段键优先于天气键", (() => { s.setTime("night"); s.setWeather("rain"); return s.resolveBackground() === "river_night.png"; })());
  ok("无时段键时用天气键", (() => { s.setTime("afternoon"); return s.resolveBackground() === "river_rain.png"; })());
  ok("都无键时回 default", (() => { s.setWeather("clear"); return s.resolveBackground() === "river_day.png"; })());
  ok("state 快照字段齐全", (() => { const st = s.state(); return st.location === "riverside" && st.locationName === "河边" && st.time === "afternoon" && st.weather === "clear" && st.background === "river_day.png"; })());
  ok("describe 拼接中文名", s.describe() === "河边 · 下午 · 晴");
}

/* 枚举校验与未变不记 */
{
  const s = setup();
  s.enter("room");
  const trailLen = s.trail().length;
  ok("枚举外时段/天气拒绝且不改状态", s.setTime("evening") === false && s.setWeather("windy") === false &&
     s.state().time === "morning" && s.state().weather === "clear");
  ok("值未变返回 true 但不记 trail", s.setTime("morning") === true && s.enter("room") === true && s.trail().length === trailLen);
  ok("trail 记变更后完整状态", (() => { s.setTime("dusk"); const t = s.trail(); return t[t.length - 1].time === "dusk" && t[t.length - 1].location === "room"; })());
}

/* trail 上限 */
{
  const s = setup();
  s.enter("room");
  const periods = ["dawn", "morning", "noon", "afternoon", "dusk", "night", "midnight"];
  for (let i = 0; i < 105; i++) s.setTime(periods[i % periods.length]);
  ok("trail 至多 100 条", s.trail().length === 100);
}

/* 定义后外部篡改不影响内部 */
{
  const s = createSceneManager();
  const def = { name: "桥", backgrounds: { default: "bridge.png" } };
  s.defineLocation("bridge", def);
  def.backgrounds.default = "hacked.png";
  s.enter("bridge");
  ok("backgrounds 定义时拷贝", s.resolveBackground() === "bridge.png");
}

/* 事件 */
{
  const s = setup();
  const got = [];
  const off = s.onChange((snap) => got.push(snap));
  s.enter("riverside");
  s.setTime("morning");
  s.setWeather("snow");
  ok("onChange 仅实际变化时触发、带快照", got.length === 2 && got[0].location === "riverside" && got[1].weather === "snow");
  off();
  s.setTime("night");
  ok("退订后不再触发", got.length === 2);
  const s2 = setup();
  s2.onChange(() => { throw new Error("boom"); });
  ok("回调抛错不影响变更", s2.enter("room") === true && s2.state().location === "room");
}

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
