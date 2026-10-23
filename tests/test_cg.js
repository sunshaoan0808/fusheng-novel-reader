/* CgGallery 图鉴测试：按 Tier1-7 行为规格逐条覆盖（验收人自写） */
const { createCgGallery } = require("../www/rp/cg.js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

function setup(){
  const g = createCgGallery();
  g.register({ id: "cg1", title: "初见", art: "cg1.png" });
  g.register({ id: "cg2", title: "雨夜", art: "cg2.png", category: "story" });
  g.register({ id: "cg3", title: "", art: "cg3.png", category: "story" });
  g.register({ id: "cg4", title: "远行", art: "cg4.png" });
  return g;
}

/* 注册校验 */
{
  const g = createCgGallery();
  ok("合法注册返回 true", g.register({ id: "a", art: "a.png", title: "t" }) === true);
  ok("重复 id 拒绝", g.register({ id: "a", art: "b.png" }) === false);
  ok("非法参数拒绝", g.register({ id: "", art: "a.png" }) === false && g.register({ id: "b", art: "" }) === false &&
     g.register({ id: "c", art: "c.png", title: 5 }) === false && g.register({ id: "d", art: "d.png", category: 5 }) === false &&
     g.register(null) === false);
  ok("缺省 title/category", (() => { const h = createCgGallery(); h.register({ id: "x", art: "x.png" }); const e = h.list()[0]; return e.title === "" && e.category === "main" && e.unlocked === false; })());
}

/* 解锁与查询 */
{
  const g = setup();
  ok("未注册 unlock 返回 false", g.unlock("nope") === false);
  ok("首次解锁 true、重复 false", g.unlock("cg3") === true && g.unlock("cg3") === false);
  g.unlock("cg1");
  ok("unlockedIds 按解锁顺序", eq(g.unlockedIds(), ["cg3", "cg1"]));
  ok("isUnlocked", g.isUnlocked("cg1") === true && g.isUnlocked("cg2") === false);
  ok("list 注册顺序与 unlocked 标记", eq(g.list().map(e => e.id + ":" + e.unlocked), ["cg1:true", "cg2:false", "cg3:true", "cg4:false"]));
  ok("list 分类与 unlockedOnly 过滤", eq(g.list({ category: "story" }).map(e => e.id), ["cg2", "cg3"]) &&
     eq(g.list({ unlockedOnly: true }).map(e => e.id), ["cg1", "cg3"]) &&
     eq(g.list({ category: "story", unlockedOnly: true }).map(e => e.id), ["cg3"]));
  ok("progress 计数与 ratio", (() => { const p = g.progress(); return p.unlocked === 2 && p.total === 4 && p.ratio === 0.5; })());
  ok("空图鉴 progress ratio 记 0", createCgGallery().progress().ratio === 0);
}

/* 待播报队列 */
{
  const g = setup();
  g.unlock("cg1"); g.unlock("cg2");
  ok("drainNew 返回新解锁并清空", eq(g.drainNew(), ["cg1", "cg2"]) && eq(g.drainNew(), []));
  g.unlock("cg4");
  ok("再次解锁只报新增", eq(g.drainNew(), ["cg4"]));
}

/* 快照恢复 */
{
  const g = setup();
  g.unlock("cg2"); g.unlock("cg4");
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  const g2 = setup();
  let fired = 0;
  g2.onUnlock(() => fired++);
  ok("restore 返回恢复数且不触发事件不入队", g2.restore(snap) === 2 && fired === 0 && eq(g2.drainNew(), []) && eq(g2.unlockedIds(), ["cg2", "cg4"]));
  ok("restore 忽略未注册 id", g2.restore({ unlocked: ["ghost", "cg1"] }) === 1 && g2.isUnlocked("cg1") === true);
  ok("非法快照返回 0 不改状态", g2.restore(null) === 0 && g2.restore({}) === 0 && g2.restore({ unlocked: "x" }) === 0 && g2.progress().unlocked === 3);
}

/* 事件 */
{
  const g = setup();
  const got = [];
  const off = g.onUnlock((p) => got.push(p));
  g.unlock("cg1"); g.unlock("cg1"); g.unlock("cg2");
  ok("onUnlock 仅首次触发、payload 带 id/title", got.length === 2 && got[0].id === "cg1" && got[0].title === "初见");
  off();
  g.unlock("cg3");
  ok("退订后不再触发", got.length === 2);
}

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
