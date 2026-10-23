/* ArtStage 立绘舞台测试：按 Tier1-6 行为规格逐条覆盖（验收人自写） */
const { createArtStage } = require("../www/rp/art.js");

let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; console.log("  PASS", name); } else { fail++; console.log("  FAIL", name); } }
function eq(a, b){ return JSON.stringify(a) === JSON.stringify(b); }

function setup(){
  const s = createArtStage();
  s.defineCharacter("lin", { expressions: { calm: "lin_calm.png", smile: "lin_smile.png", sad: "lin_sad.png" }, defaultExpression: "calm" });
  s.defineCharacter("xue", { expressions: { cold: "xue_cold.png", soft: "xue_soft.png" } });
  return s;
}

/* 定义与校验 */
{
  const s = createArtStage();
  ok("合法定义返回 true", s.defineCharacter("a", { expressions: { n: "a.png" } }) === true);
  ok("空 id/空表达式集/空图引用拒绝", s.defineCharacter("", { expressions: { n: "a.png" } }) === false &&
     s.defineCharacter("b", { expressions: {} }) === false &&
     s.defineCharacter("c", { expressions: { n: "" } }) === false &&
     s.defineCharacter("d", null) === false);
  ok("非法 defaultExpression 回退第一个键", (() => { const t = createArtStage(); t.defineCharacter("e", { expressions: { x: "x.png", y: "y.png" }, defaultExpression: "nope" }); return t.resolve("e") === "x.png"; })());
  ok("缺省 defaultExpression 取第一个键", (() => { const t = setup(); return t.resolve("xue") === "xue_cold.png"; })());
}

/* resolve 回退链与原型键防护 */
{
  const s = setup();
  ok("命中表情返回对应图", s.resolve("lin", "sad") === "lin_sad.png");
  ok("未命中表情回退默认图", s.resolve("lin", "angry") === "lin_calm.png");
  ok("未定义角色返回 null", s.resolve("ghost") === null && s.resolve("ghost", "sad") === null);
  ok("继承键名不算命中（toString/constructor 回退默认）", s.resolve("lin", "toString") === "lin_calm.png" && s.resolve("lin", "constructor") === "lin_calm.png");
}

/* show/hide/stage/current */
{
  const s = setup();
  ok("未定义角色 show 返回 false", s.show("ghost") === false && eq(s.stage(), []));
  ok("show 返回所用图并记实际表情名", s.show("lin", "smile") === "lin_smile.png" && eq(s.current("lin"), { expression: "smile", art: "lin_smile.png" }));
  ok("show 未知表情回退默认并记默认名", s.show("xue", "wow") === "xue_cold.png" && s.current("xue").expression === "cold");
  ok("stage 按首次上台顺序", eq(s.stage().map(e => e.id), ["lin", "xue"]));
  ok("重复 show 只更新图不改顺序", s.show("lin", "sad") === "lin_sad.png" && eq(s.stage().map(e => e.id), ["lin", "xue"]) && s.current("lin").art === "lin_sad.png");
  ok("hide 命中与未命中", s.hide("xue") === true && s.hide("xue") === false && s.current("xue") === null);
  s.clearStage();
  ok("clearStage 清空", eq(s.stage(), []));
}

/* applyCues */
{
  const s = setup();
  const changed = s.applyCues([
    { speaker: "lin", expression: "smile", text: "……" },
    { speaker: "ghost", expression: "sad" },
    { speaker: "xue" },
    { text: "无主旁白" },
    { speaker: "lin", expression: "smile" }
  ]);
  ok("applyCues 只记实际变图的角色", eq(changed, ["lin", "xue"]));
  ok("applyCues 后舞台状态正确", s.current("lin").art === "lin_smile.png" && s.current("xue").expression === "cold");
  ok("非数组 cues 返回空数组", eq(s.applyCues(null), []) && eq(s.applyCues("x"), []));
}

/* 事件 */
{
  const s = setup();
  const events = [];
  const off = s.onChange((e) => events.push(e));
  s.show("lin", "smile");
  s.show("lin", "smile");
  s.show("lin", "sad");
  s.hide("lin");
  ok("图变化与下台事件序列", eq(events.map(e => e.removed ? "removed" : e.art), ["lin_smile.png", "lin_sad.png", "removed"]));
  off();
  s.show("xue");
  ok("退订后不再收事件", events.length === 3);
}

console.log(pass + " pass, " + fail + " fail");
process.exit(fail ? 1 : 0);
