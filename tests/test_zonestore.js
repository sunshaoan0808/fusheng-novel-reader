/* ZoneStore 分区流式存储测试：按行为规格逐条覆盖（验收人自写） */
const { ZoneStore, createZoneStore } = require("../www/rp/zonestore.js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

/* 1. data 基本：开闭标签一次喂完，解析成对象，订阅触发 */
{
  const s = createZoneStore();
  s.declare("scene", { kind: "data" });
  let fired = null;
  s.onZoneComplete("scene", (v) => { fired = v; });
  s.begin();
  s.feed("scene", "<scene>地点: 她的房间\n时间: 19:15</scene>");
  ok("data 解析成对象", eq(s.get("scene"), { "地点": "她的房间", "时间": "19:15" }));
  ok("data complete 订阅触发且值一致", eq(fired, { "地点": "她的房间", "时间": "19:15" }));
}

/* 2. data 默认 hold+complete（规格 6）：半截不暴露、下一轮 hold 上轮值 */
{
  const s = createZoneStore();
  s.declare("scene", { kind: "data" });
  s.begin();
  s.feed("scene", "<scene>地点: 甲地");
  ok("data 默认 complete: 未闭合不暴露", s.get("scene") === undefined);
  s.feed("scene", "\n时间: 20:00</scene>");
  ok("data 闭合后可读", eq(s.get("scene"), { "地点": "甲地", "时间": "20:00" }));
  s.begin();
  ok("data 默认 hold: 新一轮未写仍返回上轮", eq(s.get("scene"), { "地点": "甲地", "时间": "20:00" }));
  s.feed("scene", "<scene>地点: 乙地</scene>");
  ok("data 新一轮闭合后更新", eq(s.get("scene"), { "地点": "乙地" }));
}

/* 3. 结束标签跨 chunk 切断（规格 7） */
{
  const s = createZoneStore();
  s.declare("narrative", { kind: "rows" });
  let fired = null;
  s.onZoneComplete("narrative", (v) => { fired = v; });
  s.begin();
  s.feed("narrative", "<narrative>第一行\n第二行</narr");
  ok("标签切断时不提交", fired === null);
  s.feed("narrative", "ative>");
  ok("标签拼回后提交全部行", eq(fired, ["第一行", "第二行"]));
  ok("提交后 get 返回完整行", eq(s.get("narrative"), ["第一行", "第二行"]));
}

/* 4. rows 流式只给完整行（规格 8） */
{
  const s = createZoneStore();
  s.declare("narrative", { kind: "rows" });
  s.begin();
  s.feed("narrative", "<narrative>第一行\n第二");
  ok("rows 半截行不给", eq(s.get("narrative"), ["第一行"]));
  s.feed("narrative", "行\n第三行写一半");
  ok("rows 只给已完整行", eq(s.get("narrative"), ["第一行", "第二行"]));
  s.feed("narrative", "</narrative>");
  ok("rows 闭合后给全部行", eq(s.get("narrative"), ["第一行", "第二行", "第三行写一半"]));
}

/* 5. rows 序号/符号剥离与正文保护（规格 2） */
{
  const s = createZoneStore();
  s.declare("narrative", { kind: "rows" });
  s.begin();
  s.feed("narrative", "<narrative>- 苹果\n1. 香蕉\n2) 橙子\n2024年，她推开门\n19:15 出发\n1.5 公里外</narrative>");
  ok("rows 标记剥离且正文数字不误伤", eq(s.get("narrative"), ["苹果", "香蕉", "橙子", "2024年，她推开门", "19:15 出发", "1.5 公里外"]));
}

/* 6. text 流式与默认值（规格 2/6）：默认无 hold/complete */
{
  const s = createZoneStore();
  s.declare("thought", { kind: "text" });
  s.begin();
  s.feed("thought", "<thought>想回家");
  ok("text 流式可读半截", s.get("thought") === "想回家");
  s.feed("thought", "，很想。</thought>");
  ok("text 闭合后全文", s.get("thought") === "想回家，很想。");
  s.begin();
  ok("text 默认无 hold: 新一轮未写返回 undefined", s.get("thought") === undefined);
}

/* 7. text 显式 hold（规格 4/6） */
{
  const s = createZoneStore();
  s.declare("thought", { kind: "text", hold: true });
  s.begin();
  s.feed("thought", "<thought>第一轮</thought>");
  s.begin();
  ok("text hold=true 时新一轮返回上轮值", s.get("thought") === "第一轮");
}

/* 8. get 时覆盖 hold/complete（规格 6） */
{
  const s = createZoneStore();
  s.declare("scene", { kind: "data" });
  s.begin();
  s.feed("scene", "<scene>地点: 丙地</scene>");
  s.begin();
  ok("get 覆盖 hold=false 后不返回上轮", s.get("scene", { hold: false, complete: false }) === undefined);
}

/* 9. begin 清空本轮缓冲（规格 3）：上轮半截不串味 */
{
  const s = createZoneStore();
  s.declare("thought", { kind: "text" });
  s.begin();
  s.feed("thought", "<thought>没写完的半截");
  s.begin();
  s.feed("thought", "<thought>新一轮</thought>");
  ok("begin 清掉上轮半截不串味", s.get("thought") === "新一轮");
}

/* 10. 引号/书名号剥离（规格 10） */
{
  const s = createZoneStore();
  s.declare("scene", { kind: "data" });
  s.declare("thought", { kind: "text" });
  s.begin();
  s.feed("scene", "<scene>地点: 「她的房间」</scene>");
  ok("data 值书名号剥离", eq(s.get("scene"), { "地点": "她的房间" }));
  s.feed("thought", "<thought>'只是想想'</thought>");
  ok("text 值单引号剥离", s.get("thought") === "只是想想");
}

/* 11. data 全角冒号解析 */
{
  const s = createZoneStore();
  s.declare("scene", { kind: "data" });
  s.begin();
  s.feed("scene", "<scene>地点：他的书房\n时间：21:05</scene>");
  ok("data 全角冒号可解析", eq(s.get("scene"), { "地点": "他的书房", "时间": "21:05" }));
}

/* 12. list 与未知形态（规格 2） */
{
  const s = createZoneStore();
  s.declare("action", { kind: "list" });
  s.declare("misc", { kind: "weird" });
  s.begin();
  s.feed("action", "<action>上前搭话\n转身离开</action>");
  ok("list 解析成字符串数组", eq(s.get("action"), ["上前搭话", "转身离开"]));
  s.feed("misc", "<misc>原样文字</misc>");
  ok("未知形态按 text 且内容不丢", s.get("misc") === "原样文字");
}

/* 13. 未声明 zone 的安全行为 */
{
  const s = createZoneStore();
  ok("未声明 get 返回 undefined", s.get("nope") === undefined);
  let threw = false;
  try { s.feed("nope", "x"); } catch (e) { threw = true; }
  ok("未声明 feed 不抛错", !threw);
}

/* 14. onZoneComplete 退订 */
{
  const s = createZoneStore();
  s.declare("thought", { kind: "text" });
  let n = 0;
  const off = s.onZoneComplete("thought", () => { n++; });
  s.begin();
  s.feed("thought", "<thought>一</thought>");
  off();
  s.feed("thought", "<thought>二</thought>");
  ok("退订后不再通知", n === 1);
}

/* 15. 多区交错投喂互不干扰、内容跨 chunk 拼接 */
{
  const s = createZoneStore();
  s.declare("scene", { kind: "data" });
  s.declare("thought", { kind: "text" });
  s.begin();
  s.feed("scene", "<scene>地点: 门");
  s.feed("thought", "<thought>紧张</thought>");
  s.feed("scene", "口</scene>");
  ok("多区交错投喂互不干扰", eq(s.get("scene"), { "地点": "门口" }) && s.get("thought") === "紧张");
}

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
