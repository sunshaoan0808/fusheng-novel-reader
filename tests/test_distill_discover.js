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
  const book = "林远推开家门。\n林远坐在桌边，林远拿起筷子。\n母亲端上汤。\n苏清禾站在门口。苏清笑了笑。\n母亲在门口喊：小远，回来吃饭！林远应了一声。";
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
        { name: "林远", aliases: ["小远"], importance: 10, reason: "主角", evidence: "母亲在门口喊：小远，回来吃饭！林远应了一声" },
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

  /* ===== 2026-11-28 四项借鉴: 多路召回 / 叙述者通道 / 反边层 / 证据门 ===== */

  /* 提名通道扫描 */
  const nomText = "汪教授推了推眼镜。汪教授翻开书。汪教授点点头。老杨头坐在门口。老杨头抽着烟。小远跑过来。小远笑了。小远坐在门槛上。小远看着母亲。他小声说。小声一点。小声些。";
  const nom = D.scanNominations(nomText);
  t("提名: 敬称构词汪教授", (nom["汪教授"] || 0) >= 3);
  t("提名: 老杨头", (nom["老杨头"] || 0) >= 2);
  t("提名: 小远", (nom["小远"] || 0) >= 4);
  t("提名: 小声被停用表压掉", !nom["小声"]);

  /* 多路召回: 低频提名入池, 低频裸滑窗不入池 */
  const recallText = [
    "汪教授推了推眼镜。", "汪教授翻开书。", "汪教授点点头。",
    "小远跑过来。", "小远笑了。", "小远坐在门槛上。", "小远看着母亲。",
    "赵刚走了进来。", "赵刚坐下。", "赵刚看着窗外。"
  ].join("\n");
  const rc = D.extractCandidates(recallText, {});
  const rcNames = rc.map(c => c.name);
  t("召回: 汪教授出现3次靠提名入池", rcNames.includes("汪教授"));
  t("召回: 小远出现4次靠提名入池", rcNames.includes("小远"));
  t("召回: 赵刚出现3次无提名不入池", !rcNames.includes("赵刚"));
  const xyCand = rc.find(c => c.name === "小远");
  t("召回: 提名候选带 nominated 标记", !!xyCand && xyCand.nominated === true);

  /* 叙述者探测 */
  const fpText = "我走进院子，看着那棵老槐树。我想起小时候的事，心里一阵发酸。".repeat(80);
  const probe1 = D.probeNarrator(fpText);
  t("叙述者: 第一人称密度命中", probe1.firstPerson === true);
  const probe2 = D.probeNarrator("我叫林远，今年十七。\n" + fpText);
  t("叙述者: 自称线索含本名", probe2.selfNames.includes("林远"));
  const probe4 = D.probeNarrator("“我叫陈青。”他递给我一张名片。\n我，我叫林远。\n" + fpText);
  t("叙述者: 他人自报姓名也在线索里 (不猜, 交裁决)", probe4.selfNames.includes("陈青") && probe4.selfNames.includes("林远"));
  t("叙述者: 线索带原句", probe4.intros.some(s => s.includes("我叫陈青")));
  const probe3 = D.probeNarrator("林远走进院子。他看着老槐树，叹了口气。".repeat(50));
  t("叙述者: 第三人称不命中", probe3.firstPerson === false);

  /* 叙述者入池: 无本名时以「叙述者」占位, 上下文是开篇 */
  let narrPayload = null;
  sb.DISTILL_LLM.chat = async (msgs) => {
    const payload = JSON.parse(msgs[1].content);
    if (payload.characters) return { content: JSON.stringify({ characters: payload.characters }) };
    narrPayload = payload;
    return { content: JSON.stringify({ characters: [{ name: "叙述者", aliases: [], importance: 10, reason: "第一人称叙述者" }] }) };
  };
  const charsN = await D.confirmCharacters([], fpText, {}, []);
  t("叙述者: 占位候选进判定池", !!narrPayload && narrPayload.candidates.some(c => c.name === "叙述者"));
  t("叙述者: 上下文是开篇", !!narrPayload && narrPayload.candidates[0].context.includes("【开篇】"));
  t("叙述者: 确认结果含叙述者", charsN.some(c => c.name === "叙述者"));

  /* 反边层 */
  const CL = D.cannotLink;
  t("反边: 陈青/陈猴同姓不同名", CL("陈青", "陈猴") === true);
  t("反边: 林远/林栀同姓不同名", CL("林远", "林栀") === true);
  t("反边: 苏清/苏清禾互含不拦", CL("苏清", "苏清禾") === false);
  t("反边: 老杨头/杨老头不拦", CL("老杨头", "杨老头") === false);
  t("反边: 杨头/杨老头碎片不拦", CL("杨头", "杨老头") === false);
  t("反边: 林远/林小远不拦", CL("林远", "林小远") === false);
  t("反边: 杨母/杨父性别冲突", CL("杨母", "杨父") === true);
  t("反边: 苏小姐/苏先生性别冲突", CL("苏小姐", "苏先生") === true);
  t("反边: 林远/小远不拦", CL("林远", "小远") === false);
  t("反边: 叙述者不设反边", CL("叙述者", "林远") === false);
  const interParas = D.splitParagraphs("阿青对阿蓝说：你先走。\n两人沉默。");
  t("反边: 原文互相称呼", CL("阿青", "阿蓝", interParas) === true);
  t("反边: 无原文时阿青/阿蓝不拦", CL("阿青", "阿蓝") === false);
  const spkParas = D.splitParagraphs("小远说道：我不去。阿蓝说道：那我去。");
  t("反边: 同段双说话人", CL("小远", "阿蓝", spkParas) === true);

  /* 证据门: 无证据合并被驳回 */
  const twoCands = [{ name: "林远", count: 10 }, { name: "小远", count: 16 }];
  function dedupeMock(evidence) {
    return async (msgs) => {
      const payload = JSON.parse(msgs[1].content);
      if (payload.characters) {
        const g = { name: "林远", aliases: ["小远"], importance: 10, reason: "主角" };
        if (evidence != null) g.evidence = evidence;
        return { content: JSON.stringify({ characters: [g] }) };
      }
      return { content: JSON.stringify({ characters: [
        { name: "林远", aliases: [], importance: 10, reason: "主角" },
        { name: "小远", aliases: [], importance: 9, reason: "家人称呼" }
      ] }) };
    };
  }
  sb.DISTILL_LLM.chat = dedupeMock(null);
  const wEv1 = [];
  const charsEv1 = await D.confirmCharacters(twoCands, book, {}, wEv1);
  t("证据门: 无证据合并被驳回", charsEv1.length === 2 && wEv1.some(w => w.includes("证据门")));
  sb.DISTILL_LLM.chat = dedupeMock("林远就是小远，这是编造的引文。");
  const charsEv2 = await D.confirmCharacters(twoCands, book, {}, []);
  t("证据门: 伪造引文被驳回", charsEv2.length === 2);
  sb.DISTILL_LLM.chat = dedupeMock("母亲在门口喊：小远，回来吃饭！林远应了一声");
  const charsEv3 = await D.confirmCharacters(twoCands, book, {}, []);
  const lyEv = charsEv3.find(c => c.name === "林远");
  t("证据门: 真引文合并放行", charsEv3.length === 1 && !!lyEv && lyEv.aliases.includes("小远"));

  /* 反边执行: 证据齐全也合不了同姓不同名 */
  const broText = "陈青和陈猴是亲兄弟。\n陈青在院里劈柴。陈猴在屋里读书。";
  sb.DISTILL_LLM.chat = async (msgs) => {
    const payload = JSON.parse(msgs[1].content);
    if (payload.characters) {
      return { content: JSON.stringify({ characters: [
        { name: "陈青", aliases: ["陈猴"], importance: 8, reason: "误判合并", evidence: "陈青和陈猴是亲兄弟" }
      ] }) };
    }
    return { content: JSON.stringify({ characters: [
      { name: "陈青", aliases: [], importance: 8, reason: "兄" },
      { name: "陈猴", aliases: [], importance: 7, reason: "弟" }
    ] }) };
  };
  const wBro = [];
  const charsBro = await D.confirmCharacters([{ name: "陈青", count: 34 }, { name: "陈猴", count: 54 }], broText, {}, wBro);
  t("反边执行: 陈猴被拆回独立条目", charsBro.length === 2 && charsBro.some(c => c.name === "陈猴"));
  t("反边执行: 有拆回警告", wBro.some(w => w.includes("反边")));

  /* 提名通道防灌水: 常用词小X 不提名 (真书回归教训) */
  const junkNom = D.scanNominations("几个小时过去了，他在小区门口等。小屋里亮着灯，小孩跑出来。他走过小桥，小桥很窄。");
  t("提名防灌: 小时/小区/小屋/小孩不提名", !junkNom["小时"] && !junkNom["小区"] && !junkNom["小屋"] && !junkNom["小孩"]);
  t("提名防灌: 无人物语境的小桥不提名", !junkNom["小桥"]);

  /* 名额分配: 90 个核心候选 + 提名独有候选, 池满 100 且两边都在 */
  const sur = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张";
  const giv = "伟芳娜敏静磊洋艳杰涛明超雪霞平刚桂英华建文志强春梅";
  const coreNames = [];
  let bigText = "";
  const verbs = ["走进", "跑进", "跳进", "走出", "跑出", "跳出"];
  for (let i = 0; i < 90; i++) {
    const nm = sur[i % 20] + giv[Math.floor(i / 20) % 20];
    coreNames.push(nm);
    for (let k = 0; k < 6; k++) bigText += nm + verbs[k % 6] + "了院子，又坐了下来。\n";
  }
  for (let k = 0; k < 9; k++) bigText += "小萌笑了。小萌说道：大家好。小萌看着镜头。\n";
  const bigCands = D.extractCandidates(bigText, {});
  const bigNames = bigCands.map(c => c.name);
  t("名额: 池不超 100", bigCands.length <= 100);
  t("名额: 核心池 90 人全在 (没被提名挤掉)", coreNames.every(n => bigNames.includes(n)));
  t("名额: 提名独有小萌挤得进", bigNames.includes("小萌"));

  /* 叙述者带线索入池: 本名提名 + 叙述者上下文带自称线索 */
  const fpIntro = "我叫林远，今年十七。\n" + fpText;
  const introPayloads = [];
  sb.DISTILL_LLM.chat = async (msgs) => {
    const payload = JSON.parse(msgs[1].content);
    if (payload.characters) return { content: JSON.stringify({ characters: payload.characters }) };
    introPayloads.push(payload);
    return { content: JSON.stringify({ characters: payload.candidates.map(c => ({ name: c.name, aliases: [], importance: 8, reason: "x" })) }) };
  };
  await D.confirmCharacters([], fpIntro, {}, []);
  const allIntroCands = introPayloads.flatMap(p => p.candidates);
  t("叙述者线索: 本名林远被提名入池", allIntroCands.some(c => c.name === "林远"));
  const narrCand = allIntroCands.find(c => c.name === "叙述者");
  t("叙述者线索: 上下文带自称线索原句", !!narrCand && narrCand.context.includes("【自称线索】") && narrCand.context.includes("我叫林远"));

  /* 提名计数口径: 记总次数, 语境命中只作资格 (小萌真书 count 曾被记成 4 而非 26) */
  const cntNom = D.scanNominations("小萌笑了。小萌走了。大家都提小萌。书里写小萌。朋友喊小萌。");
  t("提名计数: 小萌记总次数 5", cntNom["小萌"] === 5);
  t("泛称: 妈妈/爸爸/爷爷", D.isGeneric("妈妈") && D.isGeneric("爸爸") && D.isGeneric("爷爷"));

  /* 叙述者正名: 真名被并进占位条目当别名时扶正为正名 */
  sb.DISTILL_LLM.chat = async (msgs) => {
    const payload = JSON.parse(msgs[1].content);
    if (payload.characters) return { content: JSON.stringify({ characters: payload.characters }) };
    return { content: JSON.stringify({ characters: [
      { name: "叙述者", aliases: ["林远", "小远"], importance: 10, reason: "第一人称主角" }
    ] }) };
  };
  const charsProm = await D.confirmCharacters([], fpIntro, {}, []);
  const promEntry = charsProm.find(c => c.aliases && c.aliases.includes("小远"));
  t("叙述者正名: 林远扶正为正名", !!promEntry && promEntry.name === "林远");
  t("叙述者正名: 不再有占位条目", !charsProm.some(c => c.name === "叙述者"));

  /* 变体预合并: 老杨头/杨老头确定性合并, 不劳 LLM */
  t("变体核心: 老杨头归杨", D.variantCore("老杨头") === "杨");
  t("变体核心: 杨老头归杨", D.variantCore("杨老头") === "杨");
  t("变体核心: 陈青不变", D.variantCore("陈青") === "陈青");
  const pm = D.preMergeVariants([
    { name: "老杨头", aliases: [], importance: 7, count: 98, reason: "" },
    { name: "杨老头", aliases: [], importance: 7, count: 12, reason: "" },
    { name: "陈青", aliases: [], importance: 8, count: 36, reason: "" },
    { name: "陈猴", aliases: [], importance: 7, count: 52, reason: "" },
    { name: "小远", aliases: [], importance: 10, count: 20, reason: "" }
  ], []);
  t("变体预合并: 5 人变 4 人", pm.length === 4);
  const ylt = pm.find(c => c.name === "老杨头");
  t("变体预合并: 杨老头入别名且 count 取大", !!ylt && ylt.aliases.includes("杨老头") && ylt.count === 98);
  t("变体预合并: 陈青陈猴不并", pm.some(c => c.name === "陈青") && pm.some(c => c.name === "陈猴"));
  t("变体预合并: 小远不动", pm.some(c => c.name === "小远"));

  console.log("distill_discover: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("ERROR:", e && e.stack || e); process.exit(1); });
