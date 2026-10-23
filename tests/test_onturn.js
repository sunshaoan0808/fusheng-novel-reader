/* TurnOrchestrator 轮次结算编排器测试：按 Tier1-5 行为规格逐条覆盖（验收人自写） */
const { createTurnOrchestrator } = require("../www/rp/onturn.js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }
function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

(async function main(){

/* 1. 注册校验与管理面 */
{
  const o = createTurnOrchestrator();
  ok("注册成功返回 true", o.register("a", () => {}) === true);
  ok("同名重复注册拒绝", o.register("a", () => {}) === false);
  ok("空名/非函数拒绝", o.register("", () => {}) === false && o.register("x", 42) === false);
  o.register("b", () => {});
  ok("names 按注册顺序", eq(o.names(), ["a", "b"]));
  ok("has/setEnabled/unregister 命中与未命中", o.has("a") === true && o.setEnabled("a", false) === true &&
     o.setEnabled("zzz", true) === false && o.unregister("b") === true && o.unregister("b") === false &&
     eq(o.names(), ["a"]));
}

/* 2. 顺序执行 + outcomes 传递 */
{
  const o = createTurnOrchestrator();
  const order = [];
  o.register("first", () => { order.push("first"); return 10; });
  o.register("second", (ctx) => { order.push("second"); return ctx.outcomes.first + 1; });
  const rep = await o.settle({});
  ok("按注册顺序执行", eq(order, ["first", "second"]));
  ok("outcomes 供后续步骤读取", rep.results[1].value === 11 && rep.okCount === 2 && rep.failCount === 0 && rep.total === 2);
}

/* 3. 异步步骤被 await（后步必须等前步完成） */
{
  const o = createTurnOrchestrator();
  let flag = false;
  o.register("slow", async () => { await delay(25); flag = true; return "done"; });
  o.register("after", () => flag);
  const rep = await o.settle();
  ok("异步步骤 await 后再跑下一步", rep.results[0].value === "done" && rep.results[1].value === true);
}

/* 4. 失败隔离：同步抛错与异步拒绝都不拖垮后续 */
{
  const o = createTurnOrchestrator();
  let thirdRan = false;
  o.register("ok1", () => 1);
  o.register("bad", () => { throw new Error("炸了"); });
  o.register("badAsync", async () => { throw new Error("拒了"); });
  o.register("ok2", () => { thirdRan = true; return 2; });
  const rep = await o.settle();
  ok("失败计数与错误信息", rep.okCount === 2 && rep.failCount === 2 && rep.results[1].error === "炸了" && rep.results[2].error === "拒了");
  ok("失败后继续执行", thirdRan === true);
}

/* 5. 禁用步骤跳过：记 skipped、不触发 onStep、函数不跑 */
{
  const o = createTurnOrchestrator();
  let ran = false, stepEvents = [];
  o.onStep((e) => stepEvents.push(e.name));
  o.register("off", () => { ran = true; }, { enabled: false });
  o.register("on", () => 1);
  const rep = await o.settle();
  ok("禁用步骤 skipped 记录", rep.skippedCount === 1 && rep.results[0].skipped === true && ran === false);
  ok("跳过步骤不触发 onStep", eq(stepEvents, ["on"]));
}

/* 6. 防重入与 isRunning */
{
  const o = createTurnOrchestrator();
  o.register("slow", async () => { await delay(40); });
  const p1 = o.settle();
  ok("结算中 isRunning 为 true", o.isRunning() === true);
  const r2 = await o.settle();
  ok("重入调用返回 null", r2 === null);
  const rep = await p1;
  ok("首轮结算完成且 isRunning 复位", rep !== null && rep.okCount === 1 && o.isRunning() === false);
}

/* 7. 轮次注入：自增、外部提供优先 */
{
  const o = createTurnOrchestrator();
  o.register("noop", () => {});
  const r1 = await o.settle();
  const r2 = await o.settle();
  const r3 = await o.settle({ round: 99 });
  ok("轮次自增 1、2", r1.round === 1 && r2.round === 2);
  ok("外部 round 优先", r3.round === 99);
}

/* 8. 空编排器与 settle(null) */
{
  const o = createTurnOrchestrator();
  let settled = null;
  o.onSettled((rep) => { settled = rep; });
  const rep = await o.settle(null);
  ok("无步骤报告全零", rep.total === 0 && rep.okCount === 0 && rep.failCount === 0 && rep.skippedCount === 0 && eq(rep.results, []));
  ok("空结算也触发 onSettled", settled === rep);
}

/* 9. undefined 返回值记成功；事件内容与退订 */
{
  const o = createTurnOrchestrator();
  o.register("nothing", () => undefined);
  const stepEvents = [];
  const off = o.onStep((e) => stepEvents.push(e));
  const rep = await o.settle();
  ok("undefined 返回记成功", rep.results[0].ok === true && ("value" in rep.results[0]));
  ok("onStep 事件带 name/ok/round", stepEvents.length === 1 && stepEvents[0].name === "nothing" && stepEvents[0].ok === true && stepEvents[0].round === 1);
  off();
  await o.settle();
  ok("退订后不再收 onStep", stepEvents.length === 1);
}

/* 10. 事件回调抛错不影响结算 */
{
  const o = createTurnOrchestrator();
  o.onSettled(() => { throw new Error("listener boom"); });
  o.onStep(() => { throw new Error("listener boom"); });
  o.register("a", () => 7);
  const rep = await o.settle();
  ok("监听器抛错被吞、结算照常", rep.okCount === 1 && rep.results[0].value === 7);
}

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("  FAIL 顶层异常", e && e.message); console.log(pass + " pass, " + (fail + 1) + " fail"); process.exit(1); });
