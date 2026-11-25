/* 置顶事实验收（2026-11-25，借鉴 Tipsy pinned memory）：
* fact 条目可置顶/取消（版本链语义下读最新版）、达上限回 "limit"、
* renderBudgeted 单列段且不与重复。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www")? "assets/www": "www";
let pass = 0, fail = 0;
const t = (n, c) => { c? pass++: (fail++, console.log("FAIL:", n));};

const store = {};
const localStorage = {
getItem: k => (k in store? store[k]: null),
setItem: (k, v) => { store[k] = String(v);},
removeItem: k => { delete store[k];},
};
const ctx = {console, localStorage, getRpCfg: () => ({leanmem: true, memPoolRatio: "50/30/20"})};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(WWW + "/rp/memory.js", "utf8"), ctx);
const M = vm.runInContext("RP_MEM", ctx);
const M_FP = "\u3010\u7f6e\u9876\u4e8b\u5b9e\u3011"; // 置顶事实段标题（转义写法防写入管线剥离）
const M_PM = "\u3010\u753b\u50cf\u8bb0\u5fc6\u3011"; // 画像记忆段标题

M.save("r1", "甲", {mood: null, short: [], long: "", up_to: 0});
const a = M.addFact("r1", "甲", {text: "用户左腕有一道旧疤", cat: "外貌"});
const b = M.addFact("r1", "甲", {text: "用户不吃香菜", cat: "喜好"});
t("加事实成功", a.ok && b.ok);
const gf = M.getFacts(M.get("r1", "甲"));
const f1 = gf.manual.find(f => f.text.includes("旧疤"));
const f2 = gf.manual.find(f => f.text.includes("香菜"));
t("两条事实在册",!!f1 &&!!f2);

t("置顶成功", M.setFactPin("r1", "甲", f1.id, true) === true);
const gf2 = M.getFacts(M.get("r1", "甲"));
t("置顶标记落盘", gf2.manual.find(f => f.id === f1.id).pin === true);
t("未置顶条目无标记",!gf2.manual.find(f => f.id === f2.id).pin);

const out = M.renderBudgeted("r1", "甲", 1200, {query: ""});
t("渲染含置顶事实段", out.text.includes(M_FP));
const pinSec = out.text.split(M_FP)[1] || "";
t("置顶段含旧疤", pinSec.includes("旧疤"));
const profSec = (out.text.split(M_PM)[1] || "");
t("画像段不重复旧疤",!profSec.includes("旧疤"));
t("画像段仍含香菜", profSec.includes("香菜"));

t("取消置顶成功", M.setFactPin("r1", "甲", f1.id, false) === true);
const out2 = M.renderBudgeted("r1", "甲", 1200, {query: ""});
t("取消后无置顶段",!out2.text.includes(M_FP));
t("取消后旧疤回画像段", (out2.text.split(M_PM)[1] || "").includes("旧疤"));

/* 上限：置顶 12 条后第 13 条回 limit */
M.save("r2", "乙", {mood: null, short: [], long: "", up_to: 0});
let ids = [];
for(let i = 0; i < 13; i++){
const r = M.addFact("r2", "乙", {text: "事实编号" + i, cat: "其他"});
if(r.ok) ids.push(r.id);
}
const all = M.getFacts(M.get("r2", "乙")).manual;
let okN = 0, limitHit = false;
for(const f of all){
const rr = M.setFactPin("r2", "乙", f.id, true);
if(rr === true) okN++;
if(rr === "limit") limitHit = true;
}
t("置顶上限=12", okN === 12 && limitHit);

console.log(`fact_pin: ${pass} pass, ${fail} fail`);
process.exit(fail? 1: 0);
