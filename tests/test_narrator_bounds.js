/* 叙事者模式硬边界回归 (2026-11-03)
 * 真机截图: 杨蓉名下旁白替主角写了动作/身体反应（塞面条、呛到、咳嗽），
 * 且角色以第一人称当旁白（"我的目光…"）。根因有二:
 *   1) NARRATOR_INSTR 只说"小说笔法+主动推进"，没给主角边界；
 *   2) ST 预设路径恒注入叙事者指令，却没有经典路径末尾的【玩家行动铁律】。
 * 本测试钉住: 叙事指令自带三条硬边界；两条组装路径末尾都有铁律压尾；
 * 非叙事预设不注入叙事者指令。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

const sb = { console, JSON, Math, Date, Object, Array, String, Number, RegExp,
  parseInt, parseFloat, setTimeout, clearTimeout };
vm.createContext(sb); sb.window = sb; sb.globalThis = sb;
vm.runInContext(fs.readFileSync(WWW + "/rp/prompt.js", "utf8"), sb, { filename: "prompt.js" });
vm.runInContext("globalThis.RP_PROMPT = RP_PROMPT;", sb); // const 不挂 global，显式导出
const P = sb.RP_PROMPT;
const card = { name: "杨蓉", fields: { core_identity: "早餐店老板娘", core_traits: "强势直接", speech_style: "语带嫌弃却心软", typical_lines: "妈给你下面条吃" } };
const hist = [{ role: "user", content: "谁让饭这么好吃呢" }];

/* 1. 经典 narr 预设: 叙事指令带硬边界 + 铁律在最后一条 */
{
  const r = P.buildMessages(card, { history: hist, novel: "测试书" }, { preset: "narr" });
  const sys = r.messages[0].content;
  const last = r.messages[r.messages.length - 1];
  t("narr 注入叙事者指令", sys.indexOf("【叙事者模式】") >= 0);
  t("叙事指令含主角铁律边界", sys.indexOf("主角铁律（最高优先级）") >= 0 && sys.indexOf("不许替玩家写") >= 0);
  t("叙事指令含旁白人称边界", sys.indexOf("旁白人称") >= 0 && sys.indexOf("只准出现在角色台词里") >= 0);
  t("叙事指令含推进方式边界", sys.indexOf("不靠替玩家行动") >= 0);
  t("铁律压尾（最后一条 system）", last.role === "system" && last.content.indexOf("【玩家行动铁律】") >= 0);
}

/* 2. 非 narr 预设: 不注入叙事者指令，铁律仍在 */
{
  const r = P.buildMessages(card, { history: hist, novel: "测试书" }, { preset: "classic" });
  const sys = r.messages[0].content;
  const last = r.messages[r.messages.length - 1];
  t("classic 不注入叙事者指令", sys.indexOf("【叙事者模式】") < 0);
  t("classic 铁律仍压尾", last.content.indexOf("【玩家行动铁律】") >= 0);
}

/* 3. ST 预设路径: charPers 带叙事指令，最后一条必须是铁律（原缺席） */
{
  sb.RP_PRESET = {
    sysTokens: () => 10,
    assemble: (preset, parts) => [
      { role: "system", content: parts.charDesc },
      { role: "system", content: parts.charPers }
    ].concat(parts.history || [])
  };
  const stP = { name: "stub", prompts: [{ marker: true, role: "system", identifier: "charPers" }] };
  const r = P.buildMessages(card, { history: hist, novel: "测试书" }, { stPreset: stP });
  const joined = r.messages.map(m => m.content).join("\n");
  const last = r.messages[r.messages.length - 1];
  t("ST 路径含叙事者指令", joined.indexOf("【叙事者模式】") >= 0);
  t("ST 路径叙事指令带硬边界", joined.indexOf("主角铁律（最高优先级）") >= 0);
  t("ST 路径铁律压尾（回归：原先缺席）",
    last.role === "system" && last.content.indexOf("【玩家行动铁律】") >= 0);
  t("ST 路径 stats 标记预设名", r.stats.stPreset === "stub");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
