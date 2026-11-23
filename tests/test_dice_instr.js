"use strict";
/* 掷骰判定指令回归(2026-11-23 用户实报: 掷骰 10 被 AI 无视):
 * 骰签此前只是消息里的裸标签, 无口径无档位无强制。本测试钉住:
 * (1) diceInstrFor 按点数定档、口径文案齐备、无骰签不出指令;
 * (2) buildMessages 真的把 ctx.extraPrompt 作为末尾 system 注入(经典路径实测);
 * (3) chat.js 三处 ctx 透传 + app_plotline 发送/穿越两路接线。 */
const fs = require("fs");
const vm = require("vm");
let pass = 0, fail = 0;
function t(name, cond){ if(cond) pass++; else { fail++; console.log("  FAIL " + name); } }
function load(p){ return fs.readFileSync(p, "utf8"); }

const plot = load("www/js/app_plotline.js");
const chat = load("www/rp/chat.js");
const promptSrc = load("www/rp/prompt.js");

/* (1) 定档与指令生成: 抽函数实测 */
const mBlk = plot.match(/function diceTierOf\(roll\)\{[\s\S]*?window\.diceInstrFor = \(text\)=>\{[\s\S]*?\n\};/);
t("指令生成块可抽取", !!mBlk);
if(mBlk){
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(mBlk[0], ctx);
  const f = ctx.window.diceInstrFor;
  t("无骰签不出指令", f("我们走吧") === "" && f("") === "");
  t("1 点大成功", /档位：大成功。/.test(f("（掷骰：1）")));
  t("5 点大成功", /档位：大成功。/.test(f("（掷骰：5）")));
  t("6 点成功", /档位：成功。/.test(f("（掷骰：6）")));
  t("10 点成功(用户实报案例)", /档位：成功。/.test(f("（掷骰：10）")) && f("（掷骰：10）").indexOf("10/100") >= 0);
  t("35 点成功", /档位：成功。/.test(f("（掷骰：35）")));
  t("36 点部分成功", /档位：部分成功/.test(f("（掷骰：36）")));
  t("65 点部分成功", /档位：部分成功/.test(f("（掷骰：65）")));
  t("66 点失败", /档位：失败。/.test(f("（掷骰：66）")));
  t("95 点失败", /档位：失败。/.test(f("（掷骰：95）")));
  t("96 点大失败", /档位：大失败。/.test(f("（掷骰：96）")));
  t("100 点大失败", /档位：大失败。/.test(f("（掷骰：100）")));
  t("行动+骰签可识别", /42\/100/.test(f("翻墙进去（掷骰：42）")));
  t("指令含强制口径", f("（掷骰：10）").indexOf("禁止无视点数") >= 0);
  t("指令覆盖只发骰签", f("（掷骰：10）").indexOf("只发了骰签") >= 0);
}

/* (2) buildMessages 集成: extraPrompt 压尾注入 */
eval(promptSrc + "\n;globalThis.RP_PROMPT = RP_PROMPT;");
const P = globalThis.RP_PROMPT;
const card = { name: "杨蓉", fields: { core_identity: "测试人物" } };
const hist = [{ role: "user", content: "（掷骰：10）" }];
const DICE = "【掷骰判定·必须执行】玩家本轮掷骰 10/100，档位：成功。";
const b1 = P.buildMessages(card, { novel: "测试书", history: hist, extraPrompt: DICE }, { maxContext: 8192 });
const last1 = b1.messages[b1.messages.length - 1];
t("经典路径末尾 system 是骰指令", last1.role === "system" && last1.content.indexOf("掷骰判定") >= 0);
t("preview 含骰指令", b1.preview.indexOf("掷骰判定") >= 0);
const b2 = P.buildMessages(card, { novel: "测试书", history: hist }, { maxContext: 8192 });
t("无 extraPrompt 不注入", !b2.messages.some(m => String(m.content).indexOf("掷骰判定") >= 0));

/* (3) 接线钉子 */
t("chat.js 三处 ctx 透传", (chat.match(/extraPrompt: opts\.extraPrompt \|\| ""/g) || []).length === 3);
t("prompt.js 有压尾注入块", promptSrc.indexOf("if(ctx.extraPrompt)") >= 0);
t("sendOpts 接线", plot.indexOf("extraPrompt: diceInstrFor(text),") >= 0);
t("穿越路合并骰指令", plot.indexOf("[travExtraPrompt(CHAT.travId, text), diceInstrFor(text)]") >= 0);

console.log("test_dice_instr: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
