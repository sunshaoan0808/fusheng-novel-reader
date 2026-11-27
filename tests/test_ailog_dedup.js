/* 飞轮第二轮模拟实锤回归（2026-11-27）：复查分析把 10 条旧台账原样再列一遍，
 * 旧代码盲目追加致台账 10 条变 20 条、7 个完全同名；诊断正文里还可能漏进
 * 模型思考复述的 ```json 草稿，旧 parseIssues 取第一个块会抓错。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const rd = p => fs.readFileSync(WWW + p, "utf8");

function mkAilog(){
  const store = {};
  const ctx = { console, Date, JSON, Math, Promise, Set, Array, Object, String, Number,
    localStorage: { getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    window: {} };
  vm.createContext(ctx);
  vm.runInContext(rd("/rp/ailog.js"), ctx);
  return ctx.RP_AILOG;
}

async function main(){
  const A = mkAilog();
  /* parseIssues：取最后一个可解析的块 */
  const real = [{title: "真清单：英文泄漏", evidence: "e", severity: "high"}];
  const draft = [{title: "草稿：错块", evidence: "x", severity: "low"}];
  const withDraftFirst = "思考：我先列个草稿\n```json\n" + JSON.stringify(draft) + "\n```\n正文结论。\n```json\n" + JSON.stringify(real) + "\n```";
  const got1 = A.parseIssues(withDraftFirst);
  t("解析取最后一个块（草稿在前）", got1.length === 1 && got1[0].title === "真清单：英文泄漏");
  const withLeakedInstr = "正文。\n```json\n" + JSON.stringify(real) + "\n```\n思考复述：正文之后，另用一个 ```json 代码块输出问题清单\n";
  const got2 = A.parseIssues(withLeakedInstr);
  t("第一轮实测形态：真清单在前、后有未闭合复述块，仍取真清单", got2.length === 1 && got2[0].title === "真清单：英文泄漏");
  t("无块返回空数组", A.parseIssues("没有代码块").length === 0);

  /* addIssues：同名不翻倍，刷新证据；已验证的复发重开 */
  const A2 = mkAilog();
  A2.addIssues([{title: "提示词自相矛盾：滴酒不沾", evidence: "旧证据", severity: "high"}], 1000, ["r1"]);
  A2.addIssues([{title: "提示词自相矛盾：滴酒不沾", evidence: "新证据：记录7", severity: "high"}], 2000, ["r2"]);
  let iss = A2.loadIssues();
  t("同名只留一条", iss.length === 1);
  t("同名刷新证据与来源", iss[0].evidence === "新证据：记录7" && iss[0].srcIds.includes("r1") && iss[0].srcIds.includes("r2"));
  t("空白差异的同名也去重", (A2.addIssues([{title: " 提示词自相矛盾：滴酒不沾 ", evidence: "", severity: "high"}], 3000), A2.loadIssues().length) === 1);
  A2.setIssueStatus(iss[0].id, "verified");
  A2.addIssues([{title: "提示词自相矛盾：滴酒不沾", evidence: "又复发了", severity: "high"}], 4000);
  iss = A2.loadIssues();
  t("已验证的复发重开为 open（不另起一条）", iss.length === 1 && iss[0].status === "open" && iss[0].evidence === "又复发了");

  /* importIssues：同一包导两遍不翻倍 */
  const A3 = mkAilog();
  const pack = { app: "fusheng", kind: "ai-diag-log", records: [], analyses: [],
    issues: [{ ts: 1, title: "导入问题A", evidence: "", severity: "mid", status: "fixed", srcIds: [] }] };
  t("首导计入 1 条", A3.importObj(pack).issues === 1);
  t("重导同一包计入 0 条", A3.importObj(pack).issues === 0 && A3.loadIssues().length === 1);

  /* 端到端：第二轮复查重放——第一轮 10 条 + 第二轮清单（7 重叠 + 3 新） */
  const A4 = mkAilog();
  const round1 = ["记录4 叙事者代写主角", "记录4 思考链主动代写", "记录4 篇幅不足200字",
    "记录1/2/3 英文推理泄漏", "记录5 场景协议泄漏", "记录5 语气漂移亡夫",
    "提示词自相矛盾：滴酒不沾", "视角定义混乱", "场景协议格式未定义", "记录3 破戏谈规矩"];
  A4.addIssues(round1.map(x => ({title: x, evidence: "e", severity: "high"})), 1000);
  // analyze() 需先有记录：导包入一条
  A4.importObj({ app: "fusheng", kind: "ai-diag-log", records: [{ ts: 1, ms: 1, model: "m", messages: [{role: "user", content: "q"}], reply: "r" }], analyses: [], issues: [] });
  const round2 = round1.slice(0, 7).concat(["记录7/8 整段英文泄漏且截断", "记录1/2/3/7/8 英文泄漏", "视角定义歧义"]);
  const diag2 = "总评：健康度 55。\n```json\n" + JSON.stringify(round2.map(x => ({title: x, evidence: "新证据", severity: "high"}))) + "\n```";
  await A4.analyze(() => Promise.resolve(diag2), {}, 10);
  const final = A4.loadIssues();
  const titles = final.map(x => x.title);
  const dup = titles.filter((x, i) => titles.indexOf(x) !== i);
  t("第二轮重放：10 + 3 新 = 13 条", final.length === 13);
  t("第二轮重放：零完全同名重复", dup.length === 0);
  t("第二轮重放：新问题进了台账", titles.includes("记录7/8 整段英文泄漏且截断"));

  console.log("ailog_dedup: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log("FAIL: 异常", e); process.exit(1); });
