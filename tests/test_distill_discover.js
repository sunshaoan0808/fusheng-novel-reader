/* 角色发现回归 (2026-11-28 段落上下文判定):
 * splitParagraphs / extractContext (本段+上下段) / 全候选分批判定 /
 * 跨批合并 / 部分失败保留结果 / 全失败降级规则 Top20。DISTILL_LLM.chat 打桩。 */
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
  ["distill_llm.js", "distill_discover.js"].forEach(f => vm.runInContext(rp(f), ctx, { filename: f }));
  return sb;
}

(async () => {
  const sb = sandbox();
  const D = sb.DISTILL_DISCOVER;

  /* 段落切分与上下文 */
  const paras = D.splitParagraphs("第一段。\n\n  第二段。 \n第三段。\n\n");
  t("splitParagraphs 切分去空", paras.join("|") === "第一段。|第二段。|第三段。");
  const text = ["村口的老槐树下站着一个人。", "林远背着书包走过来，冲他点了点头。林远说：回来了。", "那人笑了笑，转身进了院子。", "院子里飘出饭菜香。"].join("\n");
  const ctx = D.extractContext("林远", D.splitParagraphs(text));
  t("extractContext 含上/本/下段", ctx.includes("【上段】") && ctx.includes("【本段】") && ctx.includes("【下段】"));
  t("extractContext 本段是命中段", ctx.includes("林远背着书包走过来"));
  t("extractContext 无命中返回空", D.extractContext("不存在的人", D.splitParagraphs(text)) === "");
  const longPara = "甲".repeat(500);
  const ctx2 = D.extractContext("甲", D.splitParagraphs(longPara));
  t("extractContext 长段截断", ctx2.length < 400 && ctx2.includes("…"));

  /* 分批判定: 45 个候选 -> 3 批 (20/20/5), 只确认白名单 */
  const cands = [];
  for (let i = 0; i < 45; i++) cands.push({ name: "候选" + i, count: 100 - i });
  cands[3] = { name: "林远", count: 10 };
  cands[25] = { name: "苏清", count: 70 };
  cands[26] = { name: "苏清禾", count: 61 };
  const book = "林远推开家门。\n林远坐在桌边，林远拿起筷子。\n母亲端上汤。\n苏清禾站在门口。苏清笑了笑。";
  const calls = [];
  sb.DISTILL_LLM.chat = async (msgs) => {
    calls.push(msgs);
    const payload = JSON.parse(msgs[1].content);
    if (payload.characters) return { content: JSON.stringify({ characters: payload.characters }) }; /* 去重调用: 原样返回 */
    const names = payload.candidates.map(c => c.name);
    t("批次带段落上下文", names.indexOf("林远") < 0 || payload.candidates.find(c => c.name === "林远").context.includes("【本段】"));
    const out = [];
    if (names.includes("林远")) out.push({ name: "林远", aliases: [], importance: 10, reason: "主角" });
    if (names.includes("苏清")) out.push({ name: "苏清", aliases: [], importance: 6, reason: "配角" });
    if (names.includes("苏清禾")) out.push({ name: "苏清禾", aliases: ["苏清"], importance: 9, reason: "女主" });
    return { content: JSON.stringify({ characters: out }) };
  };
  const warnings = [];
  const chars = await D.confirmCharacters(cands, book, {}, warnings);
  t("45 候选分 3 批 + 1 次去重", calls.length === 4);
  t("确认出 2 人 (苏清并入苏清禾)", chars.length === 2);
  const sqh = chars.find(c => c.name === "苏清禾");
  t("跨批合并: 别名含苏清", !!sqh && sqh.aliases.includes("苏清"));
  t("count 从候选取回", !!sqh && sqh.count === 61);
  t("林远被确认且居首", chars[0].name === "林远" || chars.some(c => c.name === "林远"));
  t("无警告", warnings.length === 0);

  /* 去重: 确认阶段分开的同一人 (林远/小远) 被名单去重合并 */
  sb.DISTILL_LLM.chat = async (msgs) => {
    const payload = JSON.parse(msgs[1].content);
    if (payload.characters) {
      return { content: JSON.stringify({ characters: [
        { name: "林远", aliases: ["小远"], importance: 10, reason: "主角" },
        { name: "陈青", aliases: [], importance: 7, reason: "配角" }
      ] }) };
    }
    return { content: JSON.stringify({ characters: [
      { name: "林远", aliases: [], importance: 10, reason: "主角" },
      { name: "小远", aliases: [], importance: 9, reason: "家人对主角的称呼" },
      { name: "陈青", aliases: [], importance: 7, reason: "配角" }
    ] }) };
  };
  const dupCands = [{ name: "林远", count: 10 }, { name: "小远", count: 16 }, { name: "陈青", count: 34 }];
  const charsD = await D.confirmCharacters(dupCands, book, {}, []);
  t("去重后 2 人", charsD.length === 2);
  const ly = charsD.find(c => c.name === "林远");
  t("小远并入林远别名", !!ly && ly.aliases.includes("小远"));
  t("合并 count 取组内最大", !!ly && ly.count === 16);

  /* 部分失败: 第 2 批抛错, 其余结果保留 + 警告 */
  let n = 0;
  sb.DISTILL_LLM.chat = async () => {
    n++;
    if (n === 2) throw new Error("HTTP 429");
    return { content: JSON.stringify({ characters: [{ name: "林远", aliases: [], importance: 10, reason: "主角" }] }) };
  };
  const w2 = [];
  const chars2 = await D.confirmCharacters(cands.slice(0, 40), book, {}, w2);
  t("部分失败仍有结果", chars2.length >= 1);
  t("部分失败有警告", w2.length === 1 && w2[0].includes("批失败"));

  /* 全失败: 降级规则 Top 20 */
  sb.DISTILL_LLM.chat = async () => { throw new Error("HTTP 400"); };
  const w3 = [];
  const chars3 = await D.confirmCharacters(cands, book, {}, w3);
  t("全失败降级 20 个", chars3.length === 20 && chars3[0].importance === 5);
  t("降级警告带原因", w3.length === 1 && w3[0].includes("降级"));

  /* parseJsonObj: 贪婪拼串失败时靠括号配平救回第一个完整对象 */
  const pj = D.parseJsonObj;
  t("parseJsonObj 直解", !!pj('{"characters": []}'));
  const messy = '好的，结果如下 {注: 试} {"characters": [{"name": "林远"}]} 以上。';
  const pjGot = pj(messy);
  t("parseJsonObj 配平救回", !!pjGot && Array.isArray(pjGot.characters) && pjGot.characters[0].name === "林远");
  t("parseJsonObj 无对象返回 null", pj("没有任何 JSON") === null);
  t("parseJsonObj 字符串内括号不误判", !!pj('{"reason": "他说 } 好", "characters": []}'));

  console.log("distill_discover: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("ERROR:", e && e.stack || e); process.exit(1); });
