/* 第三轮模拟实锤回归（2026-11-27）：①审核模型把 ``` 漏进 evidence，
 * parseIssues 整批归零 → 贪婪跨度+逐对象打捞；②标题记录号前缀导致
 * 近似重复落账 → normTitle 剥记录号；③审核无视复查要求 → missing 明示。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const rd = p => fs.readFileSync(WWW + p, "utf8");

const store = {};
const ctx = { console, Date, JSON, Math, Promise, Set, Array, Object, String, Number,
  localStorage: { getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  window: {} };
vm.createContext(ctx);
vm.runInContext(rd("/rp/ailog.js"), ctx);
const A = ctx.RP_AILOG, hook = ctx.window.__aiLogHook;

/* 坏样本：仿 diag3 真实形态——最后一个对象的 evidence 里漏进 ```json，
 * 其后还有重复对象，最后才收尾。非贪婪匹配必然在内嵌围栏处截断。 */
const garbled = "总评正文。\n```json\n[\n"
  + "  {\"title\": \"问题甲\", \"evidence\": \"证据一\", \"severity\": \"high\"},\n"
  + "  {\"title\": \"问题乙\", \"evidence\": \"证据二\", \"severity\": \"mid\"},\n"
  + "  {\"title\": \"问题丙\", \"evidence\": \"按```json\n"
  + "  {\"title\": \"问题甲\", \"evidence\": \"证据一\", \"severity\": \"high\"}\n"
  + "]\n```";
const salvaged = A.parseIssues(garbled);
t("坏块不再整批归零", salvaged.length >= 2);
t("干净对象被打捞", salvaged.some(x => x.title === "问题甲") && salvaged.some(x => x.title === "问题乙"));

/* 正常块走快速路径不受影响 */
const clean = "正文\n```json\n[{\"title\":\"正常问题\",\"evidence\":\"e\",\"severity\":\"low\"}]\n```";
const cp = A.parseIssues(clean);
t("正常块解析不变", cp.length === 1 && cp[0].title === "正常问题");
t("无块返回空数组", A.parseIssues("什么都没有").length === 0);

/* 记录号前缀去重 */
A.addIssues([{ title: "记录1/2/3 英文推理泄漏", evidence: "e", severity: "high" }], 100);
const add = A.addIssues([{ title: "英文推理泄漏", evidence: "e2", severity: "high" },
                         { title: "记录9 新问题", evidence: "e3", severity: "low" }], 200);
t("剥记录号后同题不重复落账", add === 1 && A.loadIssues().length === 2);

async function main(){
  hook({ ts: 1, ms: 1, model: "m", messages: [{ role: "user", content: "q" }], reply: "r" });
  let captured = null;
  await A.analyze((c, msgs) => { captured = msgs; return Promise.resolve("只有正文，没有复查块"); }, {}, 10);
  t("材料尾部带复查输出要求", captured[1].content.includes("复查输出要求") && captured[1].content.includes("verdicts"));
  const lr = A.getLastReview();
  t("无视复查要求时标 missing 不静默", lr && lr.missing === true);
  await A.analyze(() => Promise.resolve("正文\n```verdicts\n[{\"n\":1,\"verdict\":\"gone\"},{\"n\":2,\"verdict\":\"still\"}]\n```"), {}, 10);
  const lr2 = A.getLastReview();
  t("给出 verdicts 后 missing 消失且闭环推进", lr2 && !lr2.missing && lr2.closed === 1 && lr2.still === 1);
  const app = rd("/js/app_ailog.js");
  t("界面明示未给复查结论", app.includes("未给出结构化复查结论"));
  console.log("ailog_salvage: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log("FAIL: 异常", e); process.exit(1); });
