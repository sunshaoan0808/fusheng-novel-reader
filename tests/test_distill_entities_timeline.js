/* 蒸馏补强二三期回归 (2026-11-28):
 * 地点/物品证据门合并 (mergeEntities) / 时间线构建 (buildTimeline) /
 * worldline 大事记与物品现状消费。纯函数, 无需 LLM 打桩。 */
const fs = require("fs");
const vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const rp = f => fs.readFileSync(WWW + "/rp/" + f, "utf8");
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

function sandbox() {
  const localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const sb = { localStorage, console, setTimeout, clearTimeout, Date, Math, JSON, Promise, Map, Set, RegExp, Error };
  const ctx = vm.createContext(sb);
  sb.window = sb; sb.globalThis = sb;
  ["distill_llm.js", "distill_worldbook.js", "distill_plot.js", "worldline.js"].forEach(f => vm.runInContext(rp(f), ctx, { filename: f }));
  return sb;
}

const sb = sandbox();
const WB = sb.DISTILL_WORLDBOOK, PLOT = sb.DISTILL_PLOT, WL = sb.RP_WORLDLINE;

/* ── mergeEntities: 证据门 ── */
const fullText = "听雨轩在城南的巷子深处，青砖灰瓦。林远把铜钥匙交给苏清禾。铜钥匙齿口磨得发亮。后来茶馆搬到了河边，人们都叫它河边茶馆。苏清禾在渡口把铜钥匙弄丢了。";
const perChunk = [
  { chunk_id: "c1", locations: [
      { name: "听雨轩", aliases: [], desc: "青砖灰瓦的茶馆", region: "城南", controller: "", access: "", evidence: "听雨轩在城南的巷子深处" },
      { name: "九天宫", aliases: [], desc: "云端宫殿", region: "", controller: "", access: "", evidence: "九天宫悬浮于云海之上" }
    ], items: [
      { name: "铜钥匙", desc: "齿口磨得发亮", owner: "林远", rules: "", status: "完好", evidence: "铜钥匙齿口磨得发亮" }
    ] },
  { chunk_id: "c2", locations: [
      { name: "河边茶馆", aliases: ["听雨轩"], desc: "搬到河边的茶馆，青砖灰瓦临水而建", region: "河边", controller: "", access: "", evidence: "人们都叫它河边茶馆" }
    ], items: [
      { name: "铜钥匙", desc: "", owner: "苏清禾", rules: "", status: "遗失", evidence: "苏清禾在渡口把铜钥匙弄丢了" }
    ] }
];
const merged = WB.mergeEntities(perChunk, fullText);
t("证据不在原文的地点被丢弃", merged.locations.length === 1 && merged.locations[0].name === "听雨轩");
t("别名归组: 河边茶馆并入听雨轩", merged.locations[0].aliases.join(",") === "河边茶馆" && merged.locations[0].freq === 2);
t("desc 取更长者", merged.locations[0].desc.indexOf("临水而建") >= 0);
t("first_chunk 记最早块", merged.locations[0].first_chunk === "c1");
t("物品持有人链按块序", (merged.items[0].owner_chain || []).join(">") === "林远>苏清禾");
t("物品现状取最新块", merged.items[0].status === "遗失");

/* ── buildTimeline ── */
const summaries = [
  { chunk_id: "c1", events: [
      "林远回到听雨轩",
      { event: "苏清禾交出铜钥匙", time_marker: "当夜", characters: ["苏清禾", "林远"], location: "听雨轩" }
    ], turning_points: ["林远回到听雨轩"], hooks: [{ hook: "铜钥匙的来历" }] },
  { chunk_id: "c2", events: [
      { event: "林远回到听雨轩", time_marker: "", characters: ["林远"], location: "" },
      { event: "铜钥匙的来历被揭开", time_marker: "次日", characters: ["苏清禾"], location: "渡口" }
    ], turning_points: [], hooks: [] }
];
const tl = PLOT.buildTimeline(summaries);
t("时间线去重后 3 条", tl.length === 3);
t("字符串事件兼容归一化", tl[0].event === "林远回到听雨轩" && tl[0].type === "turning");
t("结构化事件保留时间词与人物", tl[1].time_marker === "当夜" && tl[1].characters.join(",") === "苏清禾,林远" && tl[1].location === "听雨轩");
t("伏笔互含打 hook 标", tl[2].type === "hook");
t("seq 按书序递增", tl.map(e => e.seq).join(",") === "1,2,3");
t("normEvent 空对象安全", PLOT.normEvent(null).event === "" && PLOT.eventText("x") === "x");

/* ── worldline 消费 ── */
const run = { timeline: tl, items: merged.items };
const tLines = WL._timelineLines(run, ["林远"]);
t("大事记行含转折事件", tLines.some(l => l.indexOf("大事记") >= 0 && l.indexOf("林远回到听雨轩") >= 0));
t("大事记行带时间词", tLines.some(l => l.indexOf("[当夜]") >= 0));
const iLines = WL._itemLines(run);
t("物品现状只报非完好", iLines.length === 1 && iLines[0].indexOf("铜钥匙") >= 0 && iLines[0].indexOf("遗失") >= 0);
t("物品现状带原持有人", iLines[0].indexOf("苏清禾") >= 0);
t("无数据时静默", WL._timelineLines({}, []).length === 0 && WL._itemLines({}).length === 0);
const built = WL.build(run, { name: "林远", present: ["林远"], cards: [{ fields: {} }] });
t("build 注入大事记与物品现状", built.indexOf("大事记") >= 0 && built.indexOf("物品现状") >= 0);
t("build 无新数据仍可为空", WL.build({}, { name: "林远", present: [], cards: [] }) === "");

console.log("entities_timeline: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
