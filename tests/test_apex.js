const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www")? "assets/www": "www";
// APEX-MEM 记忆回归测试: 开关/版本链/迁移幂等/追加语义/剪枝/人物索引/冲突检测/裁决/端到端/渲染集成
// 注: 用 unicode 转义写标记，避免写入管线剥离导致假绿
const M_VERCHAIN = String.fromCharCode(0x3010) + "记录·版本链" + String.fromCharCode(0x3011);
const store = {};
const localStorage = {
getItem: (k)=> (k in store? store[k]: null),
setItem: (k, v)=>{ store[k] = String(v);},
removeItem: (k)=>{ delete store[k];},
};
let rpcfg = {leanmem: true, memPoolRatio: "50/30/20", temporal: true, apex: true};
const ctx = {console, localStorage, getRpCfg: ()=>Object.assign({}, rpcfg)};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(WWW + "/rp/memory.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync(WWW + "/rp/apex.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync(WWW + "/rp/prompt.js", "utf8"), ctx);
const RP_MEM = vm.runInContext("RP_MEM", ctx);
const RP_APEX = vm.runInContext("RP_APEX", ctx);

let pass = 0, fail = 0;
const t = (n, c)=>{ c? pass++: (fail++, console.log("FAIL:", n));};

(async ()=>{
/* ---------- 开关 ---------- */
t("apexOn 默认开", RP_APEX.on() === true);
rpcfg.apex = false;
t("apexOn 可关", RP_APEX.on() === false);
rpcfg.apex = true;

/* ---------- 版本链原语 ---------- */
let arr = [];
let v1 = RP_APEX.appendVersion(arr, "r3", 1, {gist: "宝钗去过梨香院"}, true);
arr.push(v1);
t("v1 戳正确", v1.v === 1 && v1.supersedes === null && v1.vid === "r3-1-v1" && v1.id === 1);
let v2 = RP_APEX.appendVersion(arr, "r3", 1, {gist: "宝钗没去过梨香院"}, false);
arr.push(v2);
t("v2 链指向上版", v2.v === 2 && v2.supersedes === v1.vid);
t("旧版仍在", arr.length === 2);
let lat = RP_APEX.latestOf(arr);
t("latestOf 只取最新", lat.length === 1 && lat[0].gist === "宝钗没去过梨香院");
let vers = RP_APEX.versionsOf(arr, 1);
t("versionsOf 按v升序", vers.length === 2 && vers[0].v === 1 && vers[1].v === 2);

/* ---------- ensure 迁移 ---------- */
RP_MEM.save("mg", "甲", {mood: null, short: [], long: "", up_to: 5, up_to_msg_id: "m4",
profile3: [{id: 1, text: "喜欢吃甜点", updatedAt: 111}], event3: [], record3: [{id: 1, gist: "旧记录"}], migrated3: true});
let st0 = RP_MEM.get("mg", "甲");
let er = RP_APEX.ensure(st0);
t("ensure 补v1", er.changed === true && st0.profile3[0].v === 1 && st0.profile3[0].supersedes === null &&
st0.profile3[0].vid === "p3-1-v1" && st0.record3[0].v === 1);
t("ensure 不丢水位", st0.up_to === 5 && st0.up_to_msg_id === "m4");
t("ensure 幂等", RP_APEX.ensure(st0).changed === false);

/* ---------- parseState3 追加语义 ---------- */
RP_MEM.save("w1", "乙", {mood: null, short: [], long: "", up_to: 0, up_to_msg_id: null, migrated3: true,
profile3: [], event3: [], record3: []});
const anaJSON = JSON.stringify({drop: false, profile: ["喜欢吃甜点"],
event: [{topic: "一起逛街买点心", t_anchor: "昨天", state: "很开心"}],
record: ["她说下次还要去那家店"]});
let next = RP_MEM.parseState3(anaJSON, RP_MEM.get("w1", "乙"), {from: "m1", to: "m2"});
t("首写 profile v1", next.profile3.length === 1 && next.profile3[0].v === 1 && next.profile3[0].text === "喜欢吃甜点");
t("首写 event v1", next.event3.length === 1 && next.event3[0].v === 1);
t("首写 record 带指针", next.record3[0].msg_from === "m1" && next.record3[0].v === 1);
RP_MEM.save("w1", "乙", next);
const ana2 = JSON.stringify({drop: false, profile: ["喜欢吃甜点和酸奶"],
event: [{topic: "一起逛街买点心", t_anchor: "今天", state: "又去了"}],
record: []});
let next2 = RP_MEM.parseState3(ana2, RP_MEM.get("w1", "乙"), null);
t("profile 改写追加 v2", next2.profile3.length === 2);
let lp = RP_APEX.latestOf(next2.profile3)[0];
t("profile 最新版是新文本", lp.v === 2 && lp.text === "喜欢吃甜点和酸奶" && lp.supersedes === next2.profile3[0].vid);
t("profile v1 仍在", RP_APEX.versionsOf(next2.profile3, lp.id)[0].text === "喜欢吃甜点");
let le = RP_APEX.latestOf(next2.event3)[0];
t("event 演化追加 merged=2", le.v === 2 && (le.merged || 0) === 2 && le.state.indexOf("又去了") >= 0);
t("event v1 仍在", next2.event3.length === 2 && RP_APEX.versionsOf(next2.event3, le.id)[0].state === "很开心");

/* ---------- capLogical ---------- */
let big = [];
for(let i = 1; i <= 25; i++) big.push(RP_APEX.appendVersion(big, "p3", i, {text: "t" + i}, true));
for(let k = 0; k < 5; k++) big.push(RP_APEX.appendVersion(big, "p3", 25, {text: "t25v"}, false));
let capped = RP_APEX.capLogical(big, 20);
let latc = RP_APEX.latestOf(capped);
t("capLogical 逻辑上限", latc.length === 20);
t("capLogical 最新版永不删", latc.some(e => e.id === 25 && e.v === 6));
t("capLogical 版本总数有界", capped.length <= 60);

/* ---------- 人物索引 ---------- */
const vocab = ["薛宝钗", "贾宝玉", "林黛玉"];
t("别名归一 宝钗→薛宝钗", RP_APEX.extractPersons("宝钗今天没去", vocab).indexOf("薛宝钗") >= 0);
t("全名命中", RP_APEX.extractPersons("薛宝钗来了", vocab).indexOf("薛宝钗") >= 0);
t("无命中", RP_APEX.extractPersons("今天天气不错", vocab).length === 0);
RP_MEM.save("px", "丙", {migrated3: true, profile3: [], up_to: 0, record3: [],
event3: [{vid: "e3-1-v1", id: 1, v: 1, ts: 1, supersedes: null, topic: "宝钗送燕窝", t_anchor: "今早", state: "宝钗送了燕窝粥"}]});
let idx = RP_APEX.buildPersonIndex(RP_MEM.get("px", "丙"), vocab);
t("人物索引建到薛宝钗", idx["薛宝钗"] && idx["薛宝钗"].length === 1 && idx["薛宝钗"][0].store === "event3");
t("vocabFor 含卡片名", RP_APEX.vocabFor({name: "薛宝钗"}).indexOf("薛宝钗") >= 0);

/* ---------- 冲突检测 ---------- */
t("对立词判定",!!RP_APEX.opposed("宝钗去过梨香院", "宝钗没去过梨香院"));
t("对立词反向",!!RP_APEX.opposed("宝钗没去过梨香院", "宝钗去过梨香院"));
t("无对立不误判",!RP_APEX.opposed("宝钗去过梨香院", "宝钗去过潇湘馆"));
const mkc = (id, gist, persons, ts)=>({entry: {id: id, vid: "r3-" + id + "-v1", v: 1, ts: ts}, text: gist, persons: persons});
let cfs = RP_APEX.findConflicts([
mkc(1, "宝钗去过梨香院", ["薛宝钗"], 1), mkc(2, "宝钗没去过梨香院", ["薛宝钗"], 2)]);
t("平行条目矛盾被检出", cfs.length === 1 && cfs[0].person === "薛宝钗");
t("同链新旧不算冲突", RP_APEX.findConflicts([
mkc(1, "宝钗去过梨香院", ["薛宝钗"], 1), mkc(1, "宝钗没去过梨香院", ["薛宝钗"], 2)]).length === 0);
t("不同人物不算冲突", RP_APEX.findConflicts([
mkc(1, "宝钗去过梨香院", ["薛宝钗"], 1), mkc(2, "黛玉没去过梨香院", ["林黛玉"], 2)]).length === 0);

/* ---------- 裁决 ---------- */
let adj = await RP_APEX.adjudicate(async ()=>'{"pick":"B","reason":"B更新且细节多"}', {}, "薛宝钗",
{entry: {id: 1, vid: "r3-1-v1", v: 1, ts: 1}, text: "宝钗去过梨香院", persons: ["薛宝钗"]},
{entry: {id: 2, vid: "r3-2-v1", v: 1, ts: 2}, text: "宝钗没去过梨香院", persons: ["薛宝钗"]}, "宝钗到底去没去？");
t("裁决选B", adj && adj.pick === "B" && adj.winnerVid === "r3-2-v1" && adj.loserVid === "r3-1-v1");
t("裁决理由透出", adj && adj.reason.indexOf("更新") >= 0);
t("裁决异常返回null", await RP_APEX.adjudicate(async ()=>{ throw new Error("x");}, {}, "p",
{entry: {id: 1, vid: "a", ts: 1}, text: "a", persons: []},
{entry: {id: 2, vid: "b", ts: 2}, text: "b", persons: []}, "q") === null);
t("裁决解析失败返回null", await RP_APEX.adjudicate(async ()=>"说不清楚", {}, "p",
{entry: {id: 1, vid: "a", ts: 1}, text: "a", persons: []},
{entry: {id: 2, vid: "b", ts: 2}, text: "b", persons: []}, "q") === null);

/* ---------- apexFor 端到端 ---------- */
RP_MEM.save("ax", "丁", {migrated3: true, apexMigrated: true, profile3: [], event3: [], up_to: 0,
record3: [
{vid: "r3-1-v1", id: 1, v: 1, ts: 100, supersedes: null, gist: "宝钗去过梨香院", msg_from: "m1", msg_to: "m2"},
{vid: "r3-2-v1", id: 2, v: 1, ts: 200, supersedes: null, gist: "宝钗没去过梨香院", msg_from: "m3", msg_to: "m4"}]});
let nCalls = 0;
let r1 = await RP_APEX.apexFor("ax", "丁", {name: "薛宝钗"}, "宝钗到底去没去过梨香院？",
{base: "", key: "", model: "m", summaryModel: "s"},
async ()=>{ nCalls++; return '{"pick":"B","reason":"B是最新记录"}';});
t("有矛盾调一次裁决", nCalls === 1);
t("裁决后只剩胜者", r1 && r1.adjudicated === true && r1.text.indexOf("没去过") >= 0 &&
r1.text.indexOf("r3-1-v1") < 0 && r1.text.indexOf("宝钗去过梨香院") < 0);
RP_MEM.save("ax2", "戊", {migrated3: true, profile3: [], event3: [], up_to: 0,
record3: [{vid: "r3-1-v1", id: 1, v: 1, ts: 100, supersedes: null, gist: "宝钗送了燕窝粥"}]});
let nCalls2 = 0;
let r2 = await RP_APEX.apexFor("ax2", "戊", {name: "薛宝钗"}, "宝钗送了什么？", {model: "m"},
async ()=>{ nCalls2++; return "{}";});
t("无矛盾零额外调用", nCalls2 === 0 && r2 && r2.text.indexOf("燕窝粥") >= 0 && r2.adjudicated === false);
rpcfg.apex = false;
t("apex 关闭返回null", await RP_APEX.apexFor("ax2", "戊", {name: "薛宝钗"}, "宝钗送了什么？", {model: "m"},
async ()=>{ nCalls2++; return "{}";}) === null);
t("关闭不调模型", nCalls2 === 0);
rpcfg.apex = true;

/* ---------- renderBudgeted 集成 ---------- */
let b = RP_MEM.renderBudgeted("ax", "丁", 600, {query: "宝钗去没去？",
apex: {text: M_VERCHAIN + "\n- 宝钗没去过梨香院", items: 1, adjudicated: true, reason: "B是最新记录", persons: ["薛宝钗"]}});
t("similar 池渲染版本链文本", b.text.indexOf("没去过") >= 0);
t("Inspector 冲突已消解标记", b.pools.similar.adjudicated === true && b.pools.similar.adjudReason === "B是最新记录");
t("similar 池来源标注", (b.pools.similar.source || "").indexOf("版本链") >= 0);

/* ---------- 老状态迁移端到端 ---------- */
RP_MEM.save("old1", "己", {mood: {state: "平静", filter: ""}, up_to_msg_id: "m9", up_to: 10,
short: [{id: 1, time: "昨天", fact: "一起逛街", view: ""}], long: "模糊旧印象"});
RP_MEM.renderBudgeted("old1", "己", 600, {});
let ost = RP_MEM.get("old1", "己");
t("老状态迁移三库", ost.migrated3 === true);
t("迁移条目补v1", ost.event3.length === 1 && ost.event3[0].v === 1 && ost.event3[0].vid === "e3-1-v1" &&
ost.event3[0].supersedes === null);
t("迁移不丢水位", ost.up_to_msg_id === "m9" && ost.up_to === 10);
let bOld = RP_MEM.renderBudgeted("old1", "己", 600, {query: "之前发生了什么"});
t("迁移后展示正常", bOld.text.indexOf("一起逛街") >= 0);

/* ---------- 三库编辑/作废 + factsOf 收最新版（2026-11-24） ---------- */
RP_MEM.save("sv", "庚", {mood: null, short: [], long: "", up_to: 0, migrated3: true,
profile3: [], event3: [], record3: []});
const sf = RP_MEM.addFact("sv", "庚", {text: "手动补充的习惯", cat: "偏好"});
t("addFact 成功", sf.ok === true);
const ef = RP_MEM.editFact("sv", "庚", sf.id, {text: "改后的习惯", cat: "怪癖"});
const gfA = RP_MEM.getFacts(RP_MEM.get("sv", "庚"));
t("editFact 后 getFacts 只见最新版（回归：曾新旧两版并列）", ef.ok === true && gfA.manual.length === 1 && gfA.manual[0].text === "改后的习惯");
t("factsChars 按最新版计（回归：曾翻倍）", RP_MEM.factsChars(RP_MEM.get("sv", "庚")) === "改后的习惯".length);
const nVerBefore = RP_APEX.versionsOf(RP_MEM.get("sv", "庚").profile3, sf.id).length;
t("delFact 改走作废：当前视图消失、版本历史保留", RP_MEM.delFact("sv", "庚", sf.id) === true
&& RP_MEM.getFacts(RP_MEM.get("sv", "庚")).manual.length === 0
&& RP_APEX.versionsOf(RP_MEM.get("sv", "庚").profile3, sf.id).length === nVerBefore + 1
&& RP_APEX.latestOf(RP_MEM.get("sv", "庚").profile3).filter(p=>p.id === sf.id)[0].void === true);
/* 稳定事实（非 Facts）编辑/作废 */
let stSv = RP_MEM.get("sv", "庚");
stSv.profile3.push(RP_APEX.appendVersion(stSv.profile3, "p3", 50, {text: "她住在潇湘馆", fromPin: true, updatedAt: Date.now()}, true));
RP_MEM.save("sv", "庚", stSv);
t("稳定事实可编辑且追加版本", RP_MEM.editStoreEntry("sv", "庚", "profile3", 50, {text: "她住在蘅芜苑"}).ok === true
&& RP_APEX.latestOf(RP_MEM.get("sv", "庚").profile3).filter(p=>p.id === 50)[0].text === "她住在蘅芜苑"
&& RP_APEX.versionsOf(RP_MEM.get("sv", "庚").profile3, 50).length === 2);
t("稳定事实拒绝空内容", RP_MEM.editStoreEntry("sv", "庚", "profile3", 50, {text: "  "}).ok === false);
t("Facts 条目不走 editStoreEntry", RP_MEM.editStoreEntry("sv", "庚", "profile3", sf.id, {text: "x"}).ok === false);
/* 事件编辑/作废 + 分析合并不救活 */
let stSv2 = RP_MEM.get("sv", "庚");
stSv2.event3.push(RP_APEX.appendVersion(stSv2.event3, "e3", 60, {topic: "雨夜送伞", t_anchor: "三月初三", state: "她把伞给了你", updatedAt: Date.now()}, true));
RP_MEM.save("sv", "庚", stSv2);
t("事件可编辑（主题/状态）", RP_MEM.editStoreEntry("sv", "庚", "event3", 60, {topic: "雨夜送伞", state: "她把伞给了你，自己淋湿"}).ok === true
&& RP_APEX.latestOf(RP_MEM.get("sv", "庚").event3).filter(e=>e.id === 60)[0].state.indexOf("淋湿") >= 0);
t("事件作废成功", RP_MEM.voidStoreEntry("sv", "庚", "event3", 60) === true
&& RP_APEX.latestOf(RP_MEM.get("sv", "庚").event3).filter(e=>e.id === 60)[0].void === true);
const ps3 = RP_MEM.parseState3(JSON.stringify({drop: false, profile: [], facts: [], record: [],
event: [{topic: "雨夜送伞", t_anchor: "三月初三", state: "后续发展"}]}), RP_MEM.get("sv", "庚"), null);
const ev60 = RP_APEX.latestOf(ps3.event3).filter(e=>e.id === 60)[0];
t("分析合并跳过作废事件（不救活）", !!ev60 && ev60.void === true);
t("作废事件不以新条目复活", !RP_APEX.latestOf(ps3.event3).some(e=>!e.void && e.topic === "雨夜送伞"));
/* 记录编辑/作废 + 召回与 prompt 排除 */
let stSv3 = RP_MEM.get("sv", "庚");
stSv3.record3.push(RP_APEX.appendVersion(stSv3.record3, "r3", 70, {gist: "宝钗去过梨香院", msg_from: 1, msg_to: 2}, true));
RP_MEM.save("sv", "庚", stSv3);
t("记录可编辑", RP_MEM.editStoreEntry("sv", "庚", "record3", 70, {gist: "宝钗没去过梨香院"}).ok === true
&& RP_APEX.latestOf(RP_MEM.get("sv", "庚").record3).filter(r=>r.id === 70)[0].gist === "宝钗没去过梨香院");
const rec1 = RP_APEX.retrieveApex("sv", "庚", "宝钗去过梨香院吗", ["宝钗"], 5);
t("未作废记录可召回", !!rec1 && rec1.cands.some(c=>c.entry.id === 70));
t("记录作废成功", RP_MEM.voidStoreEntry("sv", "庚", "record3", 70) === true);
const rec2 = RP_APEX.retrieveApex("sv", "庚", "宝钗去过梨香院吗", ["宝钗"], 5);
t("作废记录不再召回", !!rec2 && !rec2.cands.some(c=>c.entry.id === 70));
const bSv = RP_MEM.renderBudgeted("sv", "庚", 600, {query: "宝钗"});
t("作废记录不进 prompt 组装", bSv.text.indexOf("梨香院") < 0);
t("未知库名拒绝", RP_MEM.editStoreEntry("sv", "庚", "nope", 1, {text: "x"}).ok === false && RP_MEM.voidStoreEntry("sv", "庚", "nope", 1) === false);

console.log("apex: " + pass + " pass, " + fail + " fail");
process.exit(fail? 1: 0);
})().catch(e=>{ console.log("HARNESS ERROR", e); process.exit(1);});
