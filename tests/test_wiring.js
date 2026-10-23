/* RP_WIRING 接线层测试：真实模块组装，验证区块结算链（验收人自写） */
const assert = (function(){ let p = 0, f = 0; return {
  ok(name, cond){ if(cond){ p++; console.log("  PASS", name); } else { f++; console.log("  FAIL", name); } },
  done(){ console.log(p + " pass, " + f + " fail"); process.exit(f ? 1 : 0); }
}; })();
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

/* Node 环境垫片：与浏览器一致的全局工厂 + localStorage */
const store = {};
global.localStorage = {
  getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem(k, v){ store[k] = String(v); },
  removeItem(k){ delete store[k]; }
};
global.createZoneStore = require("../www/rp/zonestore.js").createZoneStore;
global.createFavorEngine = require("../www/rp/status.js").createFavorEngine;
global.createTurnOrchestrator = require("../www/rp/onturn.js").createTurnOrchestrator;
global.createActionManager = require("../www/rp/action.js").createActionManager;
global.createArtStage = require("../www/rp/art.js").createArtStage;
global.createCgGallery = require("../www/rp/cg.js").createCgGallery;
global.createCheck = require("../www/rp/check.js").createCheck;
global.createDiary = require("../www/rp/diary.js").createDiary;
global.createSceneManager = require("../www/rp/scene.js").createSceneManager;
global.createNotificationCenter = require("../www/rp/system.js").createNotificationCenter;
global.RP_BEATS = require("../www/rp/beats.js");

const W = require("../www/rp/wiring.js");

(async function main(){

/* 1. 无区块回复原样透传 */
{
  const raw = "她望着窗外的雨，轻轻叹了口气。";
  const r = await W.settleReply(raw, { runId: "r1", name: "林黛玉" });
  assert.ok("无区块透传 cleanText 不变、report 为 null", r.cleanText === raw && r.report === null && eq(r.favorChanges, []));
}

/* 2. 全区块结算 */
{
  const raw = [
    "雨声渐密，她把书合上，抬眼看你。",
    "<status> 好感: +5 </status>",
    "<scene>",
    "地点: 潇湘馆",
    "时段: night",
    "天气: rain",
    "</scene>",
    "<cg>moon001</cg>",
    "<diary>黛玉第一次主动留我喝茶</diary>",
    "<actions>",
    "坐下喝茶",
    "告辞离开",
    "</actions>"
  ].join("\n");
  const r = await W.settleReply(raw, { runId: "r1", name: "林黛玉" });
  assert.ok("正文剥离全部分区", r.cleanText === "雨声渐密，她把书合上，抬眼看你。");
  assert.ok("十步全 ok", r.report && r.report.failCount === 0 && r.report.okCount === 10);
  assert.ok("好感变化 +5 到 5", r.favorChanges.length === 1 && r.favorChanges[0].name === "林黛玉" && r.favorChanges[0].delta === 5 && r.favorChanges[0].total === 5);
  assert.ok("favorOf 查询一致", W.favorOf("r1", "林黛玉") === 5);
  assert.ok("场景状态落地", r.sceneState && r.sceneState.locationName === "潇湘馆" && r.sceneState.time === "night" && r.sceneState.weather === "rain");
  assert.ok("CG 已解锁", W.engines.gallery.isUnlocked("moon001") === true);
  assert.ok("通知按优先级（cg 先于 favor）", r.notices.length === 2 && r.notices[0].kind === "cg" && r.notices[1].kind === "favor");
  assert.ok("日志落一条且 round 对齐", W.engines.diary.count() === 1 && W.engines.diary.list()[0].round === r.report.round);
  assert.ok("选项已 present", r.pendingActions && eq(r.pendingActions.options.map(o => o.text), ["坐下喝茶", "告辞离开"]));
  assert.ok("好感快照已持久化", typeof store["rp_wire_favor_v1"] === "string" && store["rp_wire_favor_v1"].indexOf("林黛玉") >= 0);
}

/* 3. 第二轮增量与具名键（全角冒号） */
{
  const r = await W.settleReply("正文。\n<status>\n好感: +3\n贾母好感： 40\n</status>", { runId: "r1", name: "林黛玉" });
  assert.ok("同引擎累积到 8", W.favorOf("r1", "林黛玉") === 8);
  assert.ok("具名键设定模式", r.favorChanges.some(c => c.name === "贾母" && c.total === 40 && c.mode === "set"));
}

/* 4. 剧本行驱动立绘状态 */
{
  W.engines.stage.defineCharacter("林黛玉", { expressions: { "害羞": "lin_shy.png", "平静": "lin_calm.png" } });
  const raw = "- 谁: '林黛玉'  表情: '害羞'  说: '才、才没有呢'\n<status> 好感: +1 </status>";
  const r = await W.settleReply(raw, { runId: "r1", name: "林黛玉" });
  const cur = W.engines.stage.current("林黛玉");
  assert.ok("立绘按表情切换", cur && cur.art === "lin_shy.png" && cur.expression === "害羞");
}

/* 5. 未闭合区块不吞正文 */
{
  const raw = "正文一句。\n<status> 好感: +3";
  const r = await W.settleReply(raw, { runId: "r1", name: "林黛玉" });
  assert.ok("未闭合区块时正文原样", r.cleanText === raw);
}

/* 6. 开关与指令 */
{
  assert.ok("启用时指令含 status 区块", W.instruction().indexOf("<status>") >= 0);
  W.setEnabled(false);
  assert.ok("停用后指令为空、结算透传", W.instruction() === "");
  const r = await W.settleReply("正文。\n<status> 好感: +9 </status>", { runId: "r1", name: "林黛玉" });
  assert.ok("停用时不结算", r.report === null && W.favorOf("r1", "林黛玉") === 9);
  W.setEnabled(true);
}

/* 7. check 区块判定 */
{
  const r = await W.settleReply("她纵身一跃。\n<check>\n属性: 60\n难度: 10\n</check>", { runId: "r1", name: "林黛玉" });
  assert.ok("check 结果 target=50、roll 合法", r.checkResult && r.checkResult.target === 50 && r.checkResult.roll >= 1 && r.checkResult.roll <= 100);
  const expectTier = r.checkResult.roll === 1 ? "critical" : r.checkResult.roll === 100 ? "fumble" : r.checkResult.roll <= 50 ? "success" : "failure";
  assert.ok("check tier 与 roll/target 一致", r.checkResult.tier === expectTier);
  assert.ok("check 通知已发", r.notices.some(n => n.kind === "check"));
  assert.ok("check 区块已剥离", r.cleanText === "她纵身一跃。");
}

/* 8. revertFavor：重生回滚上一候选再结算 */
{
  const a = await W.settleReply("甲版。\n<status> 好感: +10 </status>", { runId: "r2", name: "宝玉" });
  assert.ok("候选甲结算到 10", W.favorOf("r2", "宝玉") === 10);
  const b = await W.settleReply("乙版。\n<status> 好感: +4 </status>", { runId: "r2", name: "宝玉", revertFavor: a.favorChanges });
  assert.ok("回滚甲版后只剩乙版 4", W.favorOf("r2", "宝玉") === 4 && b.favorChanges[0].total === 4);
}

/* 9. skipFavor：穿越口径只剥区块不动好感 */
{
  const before = W.favorOf("r2", "宝玉");
  const r = await W.settleReply("穿越正文。\n<status> 好感: +9 </status>", { runId: "trav:t1", name: "宝玉", skipFavor: true });
  assert.ok("skipFavor 好感不变、正文照剥", W.favorOf("r2", "宝玉") === before && r.cleanText === "穿越正文。" && eq(r.favorChanges, []));
}

/* 10. worldsim 标记合流进 scene */
{
  global.RP_WORLDSIM = { parseMarkers(t){
    return t.indexOf("⟦地点=怡红院⟧") >= 0 ? { place: "怡红院", weather: 3, timeAdd: 0 } : { place: null, weather: null, timeAdd: 0 };
  } };
  const r = await W.settleReply("她进了院子。⟦地点=怡红院⟧\n<status> 好感: +1 </status>", { runId: "r1", name: "林黛玉" });
  assert.ok("标记地点合流 scene", r.sceneState && r.sceneState.locationName === "怡红院");
  assert.ok("标记天气数字 id 映射 rain", r.sceneState && r.sceneState.weather === "rain");
  delete global.RP_WORLDSIM;
}

/* 11. 选项生命周期：卡点选与文本对账 */
{
  const out = W.noteOptionPick(["甲", "乙", "丙"], 1);
  const lo = W.engines.actions.lastOutcome();
  assert.ok("noteOptionPick 结算 picked 乙", lo && lo.status === "picked" && lo.picked && lo.picked.text === "乙");
  await W.settleReply("正文。\n<actions>\n向前走\n留下来\n</actions>", { runId: "r1", name: "林黛玉" });
  W.noteUserText("留下来");
  assert.ok("noteUserText 命中记 picked", W.engines.actions.lastOutcome().status === "picked" && W.engines.actions.lastOutcome().picked.text === "留下来");
  await W.settleReply("正文。\n<actions>\n向前走\n留下来\n</actions>", { runId: "r1", name: "林黛玉" });
  W.noteUserText("我自己想干别的");
  assert.ok("noteUserText 未命中记 dismissed", W.engines.actions.lastOutcome().status === "dismissed");
}

/* 12. defineArt / rollCheck 冒烟 */
{
  assert.ok("defineArt 注册成功", W.defineArt("宝玉", { "平静": "by.png" }) === true);
  const rc = W.rollCheck({ attribute: 50 });
  assert.ok("rollCheck 返回合法结果", rc && ["critical", "success", "failure", "fumble"].indexOf(rc.tier) >= 0 && rc.target === 50);
}

/* 13. 气泡结算条 wireHTML */
{
  const html = W.wireHTML({
    favorChanges: [{ name: "林黛玉", delta: 5, total: 62 }],
    notices: [
      { kind: "favor", text: "林黛玉 好感 +5（当前 62）" },
      { kind: "cg", text: "图鉴 +cg_x", count: 2 },
      { kind: "check", text: "判定（属性 50）：掷出 23，成功" }
    ]
  });
  assert.ok("wireHTML 好感 chip 带当前值", html.indexOf("林黛玉 好感 +5 · 当前 62") >= 0);
  assert.ok("wireHTML 好感通知不重复", (html.match(/好感 \+5/g) || []).length === 1);
  assert.ok("wireHTML cg 通知带 ×2", html.indexOf("图鉴 +cg_x ×2") >= 0 && html.indexOf('wirechip cg') >= 0);
  assert.ok("wireHTML 空输入为空串", W.wireHTML(null) === "" && W.wireHTML({ favorChanges: [], notices: [] }) === "");
}

/* 14. 立绘自动建档 + stageHTML */
{
  const text = "- 谁: '晴雯'  表情: '害羞'  说: '公子……'\n<status> 好感: +2 </status>";
  const r = await W.settleReply(text, { runId: "r3", name: "晴雯" });
  const cur = W.engines.stage.current("晴雯");
  assert.ok("未注册说话人自动建档并上台", cur && cur.expression === "害羞" && cur.art === "letter");
  const html = W.stageHTML();
  assert.ok("stageHTML 含名字/表情/焦点类", html.indexOf("晴雯") >= 0 && html.indexOf("害羞") >= 0 && html.indexOf("stagechip on") >= 0);
  W.defineArt("晴雯", { "微笑": "img/qw.png" });
  await W.settleReply("- 谁: '晴雯'  表情: '微笑'  说: '嗯。'\n<status> 好感: +1 </status>", { runId: "r3", name: "晴雯" });
  assert.ok("defineArt 真图后 stageHTML 出 img", W.stageHTML().indexOf('<img class="stageimg" src="img/qw.png"') >= 0);
}

/* 15. rollPercent 范围 */
{
  let okAll = true;
  for (let i = 0; i < 200; i++) { const v = W.rollPercent(); if (!(v >= 1 && v <= 100)) okAll = false; }
  assert.ok("rollPercent 恒在 1..100", okAll);
}

assert.done();
})().catch(function(e){ console.log("  FAIL 顶层异常", e && e.stack || e); process.exit(1); });
