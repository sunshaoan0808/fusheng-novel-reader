/* Diary 日志本测试：按 Tier1-9 行为规格逐条覆盖（验收人自写） */
const { createDiary } = require("../www/rp/diary.js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

/* 新增与校验 */
{
  const d = createDiary();
  ok("空白/非字符串 body 返回 null", d.add({ body: "   " }) === null && d.add({ body: 42 }) === null && d.add({}) === null && d.add(null) === null);
  const e1 = d.add({ body: "  今天去了河边  " });
  ok("body 原文存储、缺省字段", e1.id === 1 && e1.body === "  今天去了河边  " && e1.title === "" && e1.category === "misc" && e1.round === null && eq(e1.tags, []));
  const e2 = d.add({ title: "手记", body: "Rainy Day", category: "note", round: 3, tags: ["a", 7, "b"] });
  ok("全字段与 tags 过滤、 id 自增", e2.id === 2 && e2.title === "手记" && e2.category === "note" && e2.round === 3 && eq(e2.tags, ["a", "b"]));
  ok("get/count", d.get(1).body === "  今天去了河边  " && d.get(99) === null && d.count() === 2);
}

/* 列表：倒序、分类、分页 */
{
  const d = createDiary();
  d.add({ body: "one", category: "log" });
  d.add({ body: "two", category: "note" });
  d.add({ body: "three", category: "log" });
  ok("list 新到旧", eq(d.list().map(e => e.body), ["three", "two", "one"]));
  ok("list 分类过滤", eq(d.list({ category: "log" }).map(e => e.body), ["three", "one"]));
  ok("list offset/limit", eq(d.list({ offset: 1, limit: 1 }).map(e => e.body), ["two"]));
}

/* 检索 */
{
  const d = createDiary();
  d.add({ title: "河边散步", body: "天气很好" });
  d.add({ title: "夜话", body: "谈起 RIVER 的事" });
  ok("search 标题与正文大小写不敏感", eq(d.search("river").map(e => e.title), ["夜话"]) && eq(d.search("河边").map(e => e.title), ["河边散步"]));
  ok("search 空关键词返回空", eq(d.search(""), []) && eq(d.search("  "), []) && eq(d.search(null), []));
}

/* 删除与分类清单 */
{
  const d = createDiary();
  d.add({ body: "a", category: "x" });
  d.add({ body: "b", category: "y" });
  d.add({ body: "c", category: "x" });
  ok("categories 首次出现序去重", eq(d.categories(), ["x", "y"]));
  ok("remove 命中与未命中", d.remove(2) === true && d.remove(2) === false && d.count() === 2);
}

/* 快照与恢复 */
{
  const d = createDiary();
  d.add({ body: "first", category: "log", tags: ["t"] });
  d.add({ body: "second" });
  const snap = JSON.parse(JSON.stringify(d.snapshot()));
  const d2 = createDiary();
  ok("restore 往返一致", d2.restore(snap) === true && d2.count() === 2 && d2.get(1).body === "first" && eq(d2.get(1).tags, ["t"]));
  ok("restore 后 id 从 nextId 续", d2.add({ body: "third" }).id === 3);
  const before = d2.count();
  ok("非法快照返回 false 且不改状态", d2.restore(null) === false && d2.restore({}) === false && d2.restore({ entries: "x" }) === false && d2.count() === before);
  const d3 = createDiary();
  d3.restore({ entries: [{ id: 5, body: "old" }], nextId: 2 });
  ok("nextId 小于已有 id 时不冲突", d3.add({ body: "n1" }).id === 6 && d3.add({ body: "n2" }).id === 7);
}

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
