/* 全套蒸馏移植回归 (2026-11-28): App 端蒸馏与 novel-distill 管线同源的断言。
 * 覆盖: 全套提示词组装标记 / 95 字段口径 / 全格式解析容忍 / 三道门 / 字段仲裁 /
 * 端到端增量链 (existing 回灌 + 门禁重摇 + 冲突落账)。只用 Node vm, 零依赖。 */
const fs = require("fs");
const vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const rp = f => fs.readFileSync(WWW + "/rp/" + f, "utf8");
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

function sandbox(extra) {
  const mem = new Map();
  const localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
    key: i => Array.from(mem.keys())[i] || null,
    get length() { return mem.size; },
    clear: () => mem.clear()
  };
  const sb = { localStorage, console, Date, Math, JSON, RegExp, Object, Array, String, Number,
    parseInt, parseFloat, setTimeout, clearTimeout, Promise, Map, Set };
  if (extra) Object.assign(sb, extra);
  const ctx = vm.createContext(sb);
  sb.window = sb; sb.globalThis = sb;
  return ctx;
}
const load = (ctx, files) => files.forEach(f => vm.runInContext(rp(f), ctx, { filename: f }));

(async function () {
  /* ── 1. 全套提示词模块 ─────────────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_prompt_full.js"]);
    const P = sb.DISTILL_PROMPT_FULL;
    t("提示词安全条款恰好一份", (P.text.match(/【数据安全条款/g) || []).length === 1);
    t("单角色版已剥多角色差分节", !P.text.includes("多角色蒸馏差分要求"));
    t("含 overlay 第7条未出场不嫁接", P.text.includes("未出场不嫁接"));
    t("含 overlay 不确定留空口径", P.text.includes("不确定") && P.text.includes("留空"));
    const fields = P.groups.reduce((a, g) => a.concat(g.fields), []);
    t("24 组", P.groups.length === 24);
    t("95 字段", fields.length === 95);
    t("字段无重复", new Set(fields).size === fields.length);
  }

  /* ── 2. 核心口径与解析 ─────────────────────────────────────────── */
  {
    const sb = sandbox({ DISTILL_CHUNK: { MAX_CHARS: 6000 } });
    load(sb, ["distill_prompt_full.js", "distill_core.js"]);
    const C = sb.DISTILL_CORE;
    t("FULL_MODE 开", C.FULL_MODE === true);
    t("PROFILE_FIELDS 95", C.PROFILE_FIELDS.length === 95);
    t("含 big_five/pressure_truth/ensemble_role",
      ["big_five", "pressure_truth", "ensemble_role"].every(f => C.PROFILE_FIELDS.includes(f)));
    t("CORE_FIELDS 18", C.CORE_FIELDS.length === 18);

    const md = [
      "## 林黛玉",
      "### 基础身份定位",
      "- core_identity: 贾府表小姐",
      "- **speech_style\": 言辞犀利含蓄",
      "- inner_conflict_两难: 这行是畸形字段名必须被剥掉",
      "- values: 守拙=8；任真=9（表面）",
      "### 冲突备注",
      "- core_traits: 备注里的伪字段不许进档案",
      "### 语言表达",
      "- typical_lines: 「每日家情思睡昏昏」"
    ].join("\n");
    const f = C.parseFullProfile(md, "林黛玉");
    t("解析取到 core_identity", f.core_identity === "贾府表小姐");
    /* 反引号字段名 (Laguna 真回复格式, 2026-11-28 真跑实测整批被误判空档案) */
    const mdBt = ["## 林黛玉", "### 基础身份定位", "- `core_identity`: 贾府表小姐 [ch001]", "- `values`: 守拙=8；任真=9 [ch001]"].join("\n");
    const fBt = C.parseFullProfile(mdBt, "林黛玉");
    t("反引号字段名被容忍解析", fBt.core_identity === "贾府表小姐 [ch001]" && fBt.values === "守拙=8；任真=9 [ch001]");
    t("引号误写字段被容忍解析", (f.speech_style || "").includes("犀利"));
    t("畸形字段名不入档", !("inner_conflict_两难" in f) && Object.keys(f).every(k => /^[a-z][a-z0-9_]*$/.test(k)));
    t("畸形行文本不混入上一字段", !(f.speech_style || "").includes("畸形"));
    t("冲突备注节伪字段被跳过", !("core_traits" in f));
    t("values 原样保留", f.values === "守拙=8；任真=9（表面）");
  }

  /* ── 3. 三道门 ─────────────────────────────────────────────────── */
  {
    const sb = sandbox({ DISTILL_CHUNK: { MAX_CHARS: 6000 } });
    load(sb, ["distill_prompt_full.js", "distill_core.js"]);
    const C = sb.DISTILL_CORE;
    t("占位词门禁命中", (C.checkGates({ timeline_stage: "未判定" }) || {}).kind === "placeholder");
    t("values 散文被拦", (C.checkGates({ values: "无自主价值观，完全跟随母亲" }) || {}).kind === "values");
    t("values 尾注脚放行", C.checkGates({ values: "护宗=8；守正=7；敬长=8；母性本能=9（被压抑）" }) === null);
    t("values 对照分隔放行", C.checkGates({ values: "服从誓言=9（表面）/ 情感失控=7（实际）" }) === null);
    t("values 带引用标注放行 (提示词规则17要求)", C.checkGates({ values: "勇气=6；智慧=8；亲情=7 [ch004-1]" }) === null);
    t("values 带引用与杂散反引号放行 (Laguna 真格式)", C.checkGates({ values: "勇气=6；智慧=8；自由=5 `[ch004-1]`" }) === null);
    t("values 散文带引用仍拦", (C.checkGates({ values: "母子情深最重要 [ch004-1]" }) || {}).kind === "values");
    t("values 旧坏样本仍拦", (C.checkGates({ values: "母子情深>名望地位" }) || {}).kind === "values");
    t("空字段不触发门禁", C.checkGates({ values: "", core_traits: "" }) === null);
    const idx = C.buildAliasIndex({ "黛玉": "林黛玉" });
    // 与管线 text.count 同口径: 别名是本名子串时重叠也计 (林黛玉x2 + 黛玉子串x3 = 5)
    t("出场计数 本名+别名", C.countMentions("林黛玉来了，黛玉坐下，林黛玉又说话", "林黛玉", idx) === 5);
  }

  /* ── 4. 字段仲裁 ───────────────────────────────────────────────── */
  {
    const sb = sandbox({ DISTILL_CHUNK: { MAX_CHARS: 6000 } });
    load(sb, ["distill_prompt_full.js", "distill_core.js"]);
    const C = sb.DISTILL_CORE;
    const st = C.createStore();
    C.applyToStore(st, { core_identity: "贾府表小姐", speech_style: "言辞犀利" }, "c1", "她是贾府表小姐，说话言辞犀利。");
    t("逐字命中 strength 落座", st.fields.core_identity.value === "贾府表小姐");
    C.applyToStore(st, { core_identity: "林家孤女" }, "c2", "林家孤女寄人篱下。");
    t("冻结字段 strength2 后不被覆盖", st.fields.core_identity.value === "贾府表小姐");
    C.applyToStore(st, { speech_style: "温婉柔顺" }, "c3", "她温婉柔顺地答话。");
    t("同强度冲突保旧值", st.fields.speech_style.value === "言辞犀利");
    t("冲突进队列", st.conflicts.length === 1 && st.conflicts[0].field === "speech_style");
    C.applyToStore(st, { speech_style: "言辞犀利" }, "c4", "旁白。");
    t("同值不记冲突", st.conflicts.length === 1);
  }

  /* ── 5. 端到端: 增量链 + 门禁重摇 + 出场跳过 ────────────────────── */
  {
    const calls = [];
    const attempts = {};
    const stubLLM = { chat: async (msgs, opts) => {
      const req = JSON.parse(msgs[1].content);
      calls.push({ system: msgs[0].content, req });
      const id = req.chunk_id, n = (attempts[id] = (attempts[id] || 0) + 1);
      if (id === "c1") return { content: "## 林黛玉\n### 基础身份定位\n- core_identity: 贾府表小姐\n- values: 守拙=8" };
      if (id === "c2" && n === 1) return { content: "## 林黛玉\n- timeline_stage: 未判定\n- values: 守拙=8" };
      if (id === "c2") return { content: "## 林黛玉\n- speech_style: 言辞犀利含蓄\n- values: 守拙=8；任真=9" };
      return { content: "" };
    } };
    const sb = sandbox({ DISTILL_CHUNK: { MAX_CHARS: 6000 }, DISTILL_LLM: stubLLM });
    load(sb, ["distill_prompt_full.js", "distill_core.js"]);
    const C = sb.DISTILL_CORE;
    const chunks = [
      { id: "c1", title: "一", stage: "early", text: "林黛玉进贾府，林黛玉见了贾母，林黛玉行礼。" },
      { id: "c2", title: "二", stage: "early", text: "林黛玉与宝玉相见，林黛玉说话，林黛玉含笑。" }
    ];
    const ckpt = {};
    const fin = await C.distillNovel(chunks, ["林黛玉", "路人甲"], { checkpoint: ckpt, concurrency: 2 });
    t("出场不足的角色无档案", !fin["路人甲"]);
    t("档案生成", !!fin["林黛玉"]);
    t("仲裁合并 core_identity 在", fin["林黛玉"].fields.core_identity === "贾府表小姐");
    t("第二块字段并入", (fin["林黛玉"].fields.speech_style || "").includes("犀利"));
    t("门禁重摇发生 (c2 调用两次)", attempts.c2 === 2);
    t("重摇后无门禁失败记录", (fin["林黛玉"].gateFailures || []).length === 0);
    t("checkpoint 落盘两块", !!(ckpt["c1|林黛玉"] && ckpt["c2|林黛玉"]));
    t("调用使用全套提示词", calls.every(c => c.system === sb.DISTILL_PROMPT_FULL.text));
    const second = calls.filter(c => c.req.chunk_id === "c2").pop();
    t("第二块带 existing 回灌且 incremental",
      second.req.update_mode === "incremental" && (second.req.existing_profiles || {})["林黛玉"].includes("贾府表小姐"));
    t("阶段桶保留 (early)", fin["林黛玉"].fields.early.core_identity === "贾府表小姐");
  }

  /* ── 6. 出场分散兜底: 每块都不足门槛的人物至少蒸最集中那块 ──────── */
  {
    const calls6 = [];
    const stubLLM6 = { chat: async (msgs) => {
      const req = JSON.parse(msgs[1].content);
      calls6.push(req.chunk_id);
      return { content: "## 稀客\n### 基础身份定位\n- core_identity: 偶尔路过的稀客\n- values: 守拙=8" };
    } };
    const sb = sandbox({ DISTILL_CHUNK: { MAX_CHARS: 6000 }, DISTILL_LLM: stubLLM6 });
    load(sb, ["distill_prompt_full.js", "distill_core.js"]);
    const C = sb.DISTILL_CORE;
    const chunks = [
      { id: "c3", title: "三", stage: "early", text: "稀客来了，稀客坐下喝茶。" },
      { id: "c4", title: "四", stage: "mid", text: "稀客又出现了。" }
    ];
    const fin = await C.distillNovel(chunks, ["稀客"], { checkpoint: {}, concurrency: 1 });
    t("兜底: 出场分散人物也有档案", !!fin["稀客"] && fin["稀客"].fields.core_identity === "偶尔路过的稀客");
    t("兜底: 只蒸出现最多的一块", calls6.length === 1 && calls6[0] === "c3");
  }

  /* ── 7. 全被门禁拦下的人物不静默消失: 留空条目 + gateFailures ──────── */
  {
    const stubLLM7 = { chat: async () => ({ content: "## 苦手\n### 基础身份定位\n- core_identity: 无名苦手\n- values: 重视家庭和睦待人宽厚" }) };
    const sb = sandbox({ DISTILL_CHUNK: { MAX_CHARS: 6000 }, DISTILL_LLM: stubLLM7 });
    load(sb, ["distill_prompt_full.js", "distill_core.js"]);
    const C = sb.DISTILL_CORE;
    const chunks = [{ id: "c5", title: "五", stage: "early", text: "苦手来了，苦手坐下，苦手喝茶。" }];
    const fin = await C.distillNovel(chunks, ["苦手"], { checkpoint: {}, concurrency: 1 });
    t("全拦人物留条目", !!fin["苦手"]);
    t("全拦条目 fields 为空", !!fin["苦手"] && !String(fin["苦手"].fields.core_identity || "").trim());
    t("全拦条目带 gateFailures", !!fin["苦手"] && (fin["苦手"].gateFailures || []).length === 1 && fin["苦手"].gateFailures[0].kind === "values");
  }

  console.log("distill_full_parity: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("ERROR:", e && e.stack || e); process.exit(1); });
