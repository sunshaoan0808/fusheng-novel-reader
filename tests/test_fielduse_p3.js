/* 蒸馏全利用三期验收（2026-11-24）：暗线与世界约束段（worldline）。
* 用红楼真数据组装：伏笔（未回收）/判词/世界约束/大纲必须在场，
* 已回收伏笔不得混入；导演叙事定位 narrativeBrief 有内容。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www")? "assets/www": "www";
let pass = 0, fail = 0;
const t = (n, c) => { c? pass++: (fail++, console.log("FAIL:", n));};

const ctx = { console, setTimeout, clearTimeout};
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(WWW + "/rp/worldline.js", "utf8"), ctx, {filename: "worldline.js"});
const W = vm.runInContext("RP_WORLDLINE", ctx);

const run = JSON.parse(fs.readFileSync(WWW + "/data/honglou_full.json", "utf8"));
const cards = JSON.parse(fs.readFileSync(WWW + "/data/rp_cards_honglou_full.json", "utf8"));
const cArr = Array.isArray(cards)? cards: Object.values(cards);
const daiyu = cArr.find(c => c.name === "林黛玉");
const baoyu = cArr.find(c => c.name === "贾宝玉");
t("黛玉/宝玉卡在",!!daiyu &&!!baoyu);

/* 判词全文断言需亲近档（2026-11-25 好感解锁门控后）：tier.gates.deep 开 */
const txt = W.build(run, {name: "林黛玉", present: ["林黛玉", "贾宝玉"], cards: [daiyu, baoyu], chapterIdx: 2, tier: {gates: {deep: true, voice: false}}});
t("组装出暗线段", txt.indexOf("") === 0);
t("含未回收伏笔", txt.indexOf("· 伏笔：") >= 0);
t("含判词", txt.indexOf("判词") >= 0 && txt.indexOf("玉带林中挂") >= 0);
t("含世界约束（守则适配/规则观/剧情限制其一）",
txt.indexOf("守则适配") >= 0 || txt.indexOf("规则观") >= 0 || txt.indexOf("剧情限制") >= 0);
t("含当前段大纲", txt.indexOf("当前段大纲") >= 0);
t("总长受控（<=1000）", txt.length <= 1000);

/* 已回收伏笔不得出现：构造小 run，全 resolved → 无伏笔行 */
const mini = {foreshadowing: [{hook: "已回收的钩子", status: "resolved", characters: ["林黛玉"]}], conflicts: [], sections: []};
const t2 = W.build(mini, {name: "林黛玉", present: ["林黛玉"], cards: [daiyu]});
t("全回收时无伏笔行", t2.indexOf("伏笔：") < 0);

/* 无关人物不带出黛玉判词 */
const t3 = W.build(run, {name: "刘姥姥", present: ["刘姥姥"], cards: [cArr.find(c => c.name === "刘姥姥") || {}], chapterIdx: -1});
t("刘姥姥局不带黛玉判词", t3.indexOf("玉带林中挂") < 0);

/* 导演叙事定位 */
const nb = W.narrativeBrief(daiyu);
t("narrativeBrief 有主题/功能", nb.indexOf("主题") >= 0 || nb.indexOf("功能") >= 0);
t("narrativeBrief 非空", nb.length > 10);

/* 冲突行：找一对同场冲突（用数据自身验证） */
const conf = run.conflicts.find(c => (c.parties || []).length >= 2);
if(conf){
const t4 = W.build(run, {name: conf.parties[0], present: conf.parties, cards: [daiyu], chapterIdx: -1});
t("同场冲突可注入", t4.indexOf("冲突：") >= 0);
}

console.log(`fielduse_p3: ${pass} pass, ${fail} fail`);
process.exit(fail? 1: 0);
