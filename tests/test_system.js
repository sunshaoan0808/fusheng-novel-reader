/* SystemNotificationCenter 系统通知中心测试：按 Tier1-11 行为规格逐条覆盖（验收人自写） */
const { createNotificationCenter } = require("../www/rp/system.js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

/* 发布与缺省 */
{
  const c = createNotificationCenter();
  ok("空白/非字符串 text 与非法入参返回 null", c.post({ text: "  " }) === null && c.post({ text: 5 }) === null && c.post({}) === null && c.post(null) === null);
  const n = c.post({ text: "存档完成" });
  ok("缺省 kind/priority/channel/count/id", n.kind === "info" && n.priority === 0 && n.channel === "inline" && n.count === 1 && n.id === 1);
  ok("非法 channel 回退 inline，合法保留", c.post({ text: "a", channel: "banner" }).channel === "inline" && c.post({ text: "b", channel: "modal" }).channel === "modal");
  ok("text 原文存储不 trim", c.post({ text: " 好感+1 " }).text === " 好感+1 ");
  ok("非有限 priority 记 0", c.post({ text: "c", priority: NaN }).priority === 0);
}

/* 合并 */
{
  const c = createNotificationCenter();
  const a = c.post({ text: "好感+1", kind: "favor", priority: 1 });
  const b = c.post({ text: "好感+1", kind: "favor", priority: 3 });
  ok("同 kind+text+channel 合并：同 id、count 2、priority 取大", b.id === a.id && b.count === 2 && b.priority === 3 && c.count() === 1);
  c.post({ text: "好感+1", kind: "favor", channel: "toast" });
  ok("channel 不同不合并", c.count() === 2);
  c.post({ text: " 好感+1", kind: "favor" });
  ok("text 原文不同（带空格）不合并", c.count() === 3);
}

/* 排序、取走、清理 */
{
  const c = createNotificationCenter();
  c.post({ text: "low", priority: 0 });
  c.post({ text: "high1", priority: 5 });
  c.post({ text: "high2", priority: 5 });
  c.post({ text: "neg", priority: -1 });
  ok("pending 按 priority 降序、同级 id 升序", eq(c.pending().map(n => n.text), ["high1", "high2", "low", "neg"]));
  ok("peek 不清空", c.peek().length === 4 && c.count() === 4);
  const drained = c.drain();
  ok("drain 按序返回并清空", drained.length === 4 && c.count() === 0 && eq(c.pending(), []));
  c.post({ text: "x" }); c.post({ text: "y" });
  ok("clear 返回清掉条数", c.clear() === 2 && c.count() === 0);
}

/* 事件：含合并触发、收到的是副本、退订、抛错隔离 */
{
  const c = createNotificationCenter();
  const got = [];
  const off = c.onPost((n) => got.push(n));
  c.post({ text: "解锁新图", kind: "cg" });
  c.post({ text: "解锁新图", kind: "cg" });
  ok("onPost 新建与合并各触发一次", got.length === 2 && got[1].count === 2);
  got[0].priority = 999;
  ok("回调拿到副本，篡改不影响队列", c.pending()[0].priority === 0);
  off();
  c.post({ text: "another" });
  ok("退订后不再触发", got.length === 2);
  const c2 = createNotificationCenter();
  c2.onPost(() => { throw new Error("boom"); });
  ok("回调抛错不影响 post", c2.post({ text: "ok" }) !== null && c2.count() === 1);
}

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
