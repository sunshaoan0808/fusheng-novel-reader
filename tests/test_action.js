/* ActionManager 选项管理器测试：按 Tier1-4 行为规格逐条覆盖（验收人自写） */
const { createActionManager } = require("../www/rp/action.js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

/* 1. present 基本：身份、轮次、状态 */
{
  const m = createActionManager();
  ok("初始 idle 且无结算", m.state().status === "idle" && m.lastOutcome() === null);
  const st = m.present(["上前搭话", "转身离开", "保持沉默"]);
  ok("present 后 pending 且轮次 1", st.status === "pending" && st.round === 1);
  ok("选项带 id/index/text", eq(m.getOptions(), [
    { id: 0, text: "上前搭话", index: 0 },
    { id: 1, text: "转身离开", index: 1 },
    { id: 2, text: "保持沉默", index: 2 }
  ]));
}

/* 2. 归一化：数字转字符串、跳过非字符串、去空白、去重、限量 */
{
  const m = createActionManager();
  m.present(["  甲  ", 42, null, { x: 1 }, "甲", "乙", "丙", "丁", "戊"]);
  ok("归一化+去重+默认限量 4", eq(m.getOptions().map(o => o.text), ["甲", "42", "乙", "丙"]));
}

/* 3. 包裹剥离：成对才剥、错配不剥 */
{
  const m = createActionManager();
  m.present(["「回家」", "'出门'", "「错配'"]);
  ok("成对包裹剥离", m.getOptions()[0].text === "回家" && m.getOptions()[1].text === "出门");
  ok("错配包裹不剥", m.getOptions()[2].text === "「错配'");
}

/* 4. pick 成功路径与结算记录 */
{
  const m = createActionManager();
  let picked = null, pickCalls = 0;
  m.onPick((p) => { pickCalls++; picked = p; });
  m.present(["甲", "乙"]);
  const payload = m.pick(1);
  ok("pick 返回 payload", eq(payload, { id: 1, text: "乙", index: 1, round: 1 }));
  ok("onPick 触发一次且同 payload", pickCalls === 1 && eq(picked, payload));
  ok("pick 后状态 picked 且选项收起", m.state().status === "picked" && eq(m.getOptions(), []));
  const out = m.lastOutcome();
  ok("lastOutcome 记 picked 结算", out && out.status === "picked" && out.round === 1 && eq(out.picked, payload) && eq(out.options, ["甲", "乙"]));
  ok("已结算再 pick 返回 null", m.pick(0) === null && pickCalls === 1);
}

/* 5. pick 无效不改变状态；字符串序号可用 */
{
  const m = createActionManager();
  m.present(["甲", "乙"]);
  ok("越界 pick 返回 null 且仍 pending", m.pick(99) === null && m.state().status === "pending");
  const p = m.pick("0");
  ok("字符串序号可 pick", p && p.text === "甲");
}

/* 6. dismiss 与结算记录 */
{
  const m = createActionManager();
  ok("idle 时 dismiss 返回 false", m.dismiss() === false);
  m.present(["甲", "乙"]);
  ok("pending dismiss 返回 true", m.dismiss() === true);
  const out = m.lastOutcome();
  ok("lastOutcome 记 dismissed 结算", out && out.status === "dismissed" && out.picked === null && eq(out.options, ["甲", "乙"]));
  ok("dismissed 后 pick/dismiss 均无效", m.pick(0) === null && m.dismiss() === false);
}

/* 7. 替代：pending 时再 present，旧集结算为 replaced，轮次递增 */
{
  const m = createActionManager();
  m.present(["旧一", "旧二"]);
  m.present(["新一"]);
  const out = m.lastOutcome();
  ok("旧集结算为 replaced", out && out.status === "replaced" && out.round === 1 && eq(out.options, ["旧一", "旧二"]));
  ok("新集 pending 且轮次 2", m.state().status === "pending" && m.state().round === 2 && eq(m.getOptions().map(o => o.text), ["新一"]));
}

/* 8. 空 present：结算回 idle，轮次不倒退 */
{
  const m = createActionManager();
  m.present(["甲"]);
  m.pick(0);
  m.present(["乙"]);
  ok("picked 后再 present 轮次 2", m.state().round === 2);
  m.present([]);
  ok("空 present 回 idle", m.state().status === "idle" && eq(m.getOptions(), []));
  m.present(["丙"]);
  ok("轮次单调不重置", m.state().round === 3);
}

/* 9. 无效输入不抛错、状态不变 */
{
  const m = createActionManager();
  m.present(["甲"]);
  let threw = false;
  try { m.present(null); m.present("不是数组"); m.present(42); } catch (e) { threw = true; }
  ok("无效 present 不抛错", !threw);
  ok("无效 present 后仍是原集合", m.state().status === "pending" && eq(m.getOptions().map(o => o.text), ["甲"]));
}

/* 10. 配置：maxOptions 可配、非法回退默认 */
{
  const m = createActionManager({ maxOptions: 2 });
  m.present(["甲", "乙", "丙"]);
  ok("maxOptions=2 截断", m.getOptions().length === 2);
  const m2 = createActionManager({ maxOptions: 0 });
  m2.present(["甲", "乙", "丙", "丁", "戊"]);
  ok("maxOptions 非法回退默认 4", m2.getOptions().length === 4);
}

/* 11. onChange：每次变化一次、退订、回调抛错不影响状态 */
{
  const m = createActionManager();
  let calls = 0;
  const off = m.onChange(() => { calls++; });
  m.onChange(() => { throw new Error("boom"); });
  m.present(["甲", "乙"]);
  m.pick(0);
  ok("onChange 变化各一次且抛错被吞", calls === 2 && m.state().status === "picked");
  off();
  m.present(["丙"]);
  ok("退订后不再回调", calls === 2);
}

/* 12. getOptions 副本隔离 */
{
  const m = createActionManager();
  m.present(["甲", "乙"]);
  const opts = m.getOptions();
  opts[0].text = "篡改";
  opts.push({ id: 9, text: "伪造", index: 9 });
  ok("getOptions 副本隔离", m.getOptions().length === 2 && m.getOptions()[0].text === "甲");
}

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
