/* 蒸馏管线回归测试 (2026-10-17)
 * 这条管线此前 0 个测试，24 个模块 4400 行全靠人工试。这里把《蒸馏管线审计.md》
 * 里的 P0/P1/P2 逐条固化成断言，重点是"失败要吭声"：
 *   - 质量门能跑完（D1）
 *   - 别名章节不再整章跳过（D2）
 *   - 正文 100% 进模型（D3）
 *   - 断点续跑真的复用结果（D4）
 *   - 判据收敛后不再误报关系（D7）
 *   - 故障显示"未完成"而不是"通过"（D8）
 * 只用 Node 内置 vm，零依赖。
 */
const fs = require("fs");
const vm = require("vm");

const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const rp = f => fs.readFileSync(WWW + "/rp/" + f, "utf8");

let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

/* 极简浏览器环境：localStorage + window + fetch 桩 */
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
  const sb = {
    localStorage, console, Date, Math, JSON, RegExp, Object, Array, String, Number,
    parseInt, parseFloat, setTimeout, clearTimeout, Promise, Map, Set,
    escH: s => String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
    fetch: () => Promise.reject(new Error("no net in test"))
  };
  if (extra) Object.assign(sb, extra);
  const ctx = vm.createContext(sb);
  sb.window = sb; sb.globalThis = sb;
  return ctx;
}
const load = (ctx, files) => files.forEach(f => vm.runInContext(rp(f), ctx, { filename: f }));

(async function () {

  /* ── D1 质量门：能跑完，且内部异常可见 ───────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_package.js", "distill_provenance.js", "distill_llm.js",
      "distill_core.js", "distill_quality.js"]);
    const P = sb.DISTILL_PACKAGE, Q = sb.DISTILL_QUALITY;

    const none = Q.check("pkg_not_exist");
    t("D1 包不存在时返回 fail 而不是抛异常", none.level === "fail" && none.checks[0].id === "pkg");

    const pkg = P.createPackage("测试书");
    pkg.characters = [{ name: "林黛玉", importance: 9 }];
    P.updatePackage(pkg);
    P.saveCharacterCard(pkg.id, "林黛玉", {
      name: "林黛玉",
      _distill: {
        core_identity: "寄居贾府的孤女 [canon:ch001]",
        core_traits: "敏感多疑,多愁善感,才思敏捷,言辞锋利",
        speech_style: "语带机锋,常含讥诮,喜用反问与双关",
        typical_lines: "我就知道,别人不挑剩下的也不给我；你既这么说,我走就是了",
        background: "母亲早逝,父亲病故,孤身寄居外祖母家中,常自伤身世",
        soul_goal: "在无依无靠的处境中求得一处安身立命之地",
        key_bonds: "贾宝玉(知己),薛宝钗(情敌),紫鹃(侍女)",
        evidence: "黛玉葬花一节,以花自况,道尽寄人篱下之悲"
      }
    });
    P.saveData(pkg.id, "relations", [{ source_character: "林黛玉", target_character: "贾宝玉" }]);
    P.saveData(pkg.id, "provenance", {
      facts: [
        { character: "林黛玉", field: "core_identity", value: "孤女", source: "canon", chunk_id: "ch001" },
        { character: "林黛玉", field: "core_traits", value: "敏感", source: "canon", chunk_id: "ch002" }
      ]
    });

    let r = null;
    try { r = Q.check(pkg.id); } catch (e) { r = null; }
    t("D1 check() 不抛异常（原为 TypeError: undefined.filter）", !!r);
    t("D1 返回完整结构", !!r && typeof r.score === "number" && Array.isArray(r.checks) && r.checks.length >= 5);
    t("D1 字段完整度不再恒 fail", !!r && r.checks.some(c => c.id === "fields" && c.level === "pass"));
    t("D1 渲染不崩", typeof Q.renderReport(r) === "string" && Q.renderReport(r).indexOf("质量门") >= 0);

    // 内部异常必须变成一条可见的 fail 检查项
    const savedPkg = P.getPackage;
    P.getPackage = function () { throw new Error("模拟内部错误"); };
    let err = null;
    try { err = Q.check(pkg.id); } catch (e) { err = null; }
    t("D1 内部异常被转成 fail 检查项（不再整块空白）",
      !!err && err.level === "fail" && err.checks[0].id === "internal");
    P.getPackage = savedPkg;
  }

  /* ── D6 字段口径同源 ─────────────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_core.js", "distill_package.js", "distill_provenance.js", "distill_quality.js"]);
    const core = sb.DISTILL_CORE.PROFILE_FIELDS;
    const qual = sb.DISTILL_QUALITY.PROFILE_FIELDS;
    t("D6 质量门字段集 === 提示词字段集", JSON.stringify(core) === JSON.stringify(qual));
    t("D6 提示词文本覆盖全部字段",
      core.every(f => sb.DISTILL_CORE.SYSTEM_PROMPT.indexOf(f) >= 0));
  }

  /* ── D2 别名命中 ─────────────────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_core.js"]);
    const C = sb.DISTILL_CORE;
    const idx = C.buildAliasIndex({ "黛玉": "林黛玉", "玉": "林黛玉", "宝玉": "贾宝玉" });
    t("D2 正名命中", C.appearsIn("林黛玉来了", "林黛玉", idx) === true);
    t("D2 别名命中", C.appearsIn("黛玉来了", "林黛玉", idx) === true);
    t("D2 单字别名被忽略（避免「玉」满篇误命中）", C.appearsIn("这块玉很好", "林黛玉", idx) === false);
    t("D2 无关注释不命中", C.appearsIn("薛宝钗来了", "林黛玉", idx) === false);

    let calls = 0;
    sb.DISTILL_LLM.chat = m => {
      calls++;
      const u = JSON.parse(m[1].content);
      return Promise.resolve({ content: "- **core_identity**: " + u.character, model: "stub" });
    };
    const chunks = [
      { id: "ch001", text: "黛玉进了房，坐下不语。".repeat(20), stage: "early" },
      { id: "ch002", text: "黛玉又哭了半日。".repeat(20), stage: "mid" },
      { id: "ch003", text: "黛玉葬花。".repeat(20), stage: "late" }
    ];
    const res = await C.distillNovel(chunks, ["林黛玉"], { aliasMap: { "黛玉": "林黛玉" }, batchProfiles: false });
    t("D2 别名-only 正文三块全部蒸馏（原为 0 次调用）", calls === 3 && res["林黛玉"] && res["林黛玉"].chunks === 3);
  }

  /* ── D3 正文覆盖率 ───────────────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_chunk.js"]);
    const C = sb.DISTILL_CHUNK;
    let text = "";
    const para = "他站在桥头，看着远处的灯火，心里想着那些再也回不去的旧事。".repeat(4);
    while (text.length < 120000) text += para + "\n";
    const chunks = C.chunkNovel(text);
    const maxLen = Math.max.apply(null, chunks.map(c => c.chars));
    t("D3 默认块长不超过摘录上限", maxLen <= C.MAX_CHARS);
    t("D3 不会出现被 slice 截断的块", chunks.every(c => c.chars <= C.MAX_CHARS));
    // 由块长反推起点，验证真正送进 LLM 的区间覆盖全文
    let start = 0, covered = 0, curS = -1, curE = -1;
    chunks.map(c => {
      const s = start;
      start += c.chars - C.DEFAULT_OVERLAP;
      return [s, s + Math.min(C.MAX_CHARS, c.chars)];
    }).forEach(sp => {
      if (sp[0] > curE) { if (curE > 0) covered += curE - curS; curS = sp[0]; curE = sp[1]; }
      else curE = Math.max(curE, sp[1]);
    });
    if (curE > 0) covered += curE - curS;
    t("D3 正文覆盖率 100%（原为 84%）", covered >= text.length);
  }

  /* ── 章节打包：块数下降但一个字都不能丢 ─────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_chunk.js"]);
    const C = sb.DISTILL_CHUNK;
    const paras = [];
    for (let c = 1; c <= 60; c++) {
      const body = ("风雪夜里，他站在桥头看着远处的灯火，想起第" + c + "次分别。".repeat(60)).slice(0, 1500);
      paras.push(body);
    }
    const text = paras.map((b, i) => "第" + (i + 1) + "章　风雪夜\n" + b).join("\n");
    const chunks = C.chunkNovel(text);
    const chapters = C.splitChapters(text, "^第[一二三四五六七八九十百千零0-9]+[回章].*");
    t("打包后块数远少于章节数", chapters.length === 60 && chunks.length < 30);
    t("打包后每块不超过上限", chunks.every(c => c.chars <= C.MAX_CHARS));
    // 每章正文必须完整落在某个块里（块由整章拼接而来，所以应能整段命中）
    const joined = chunks.map(c => c.text).join("\n");
    const lost = chapters.filter(ch => {
      const body = ch.body.trim();
      return body && joined.indexOf(body) < 0;
    });
    t("打包不丢正文（每章原文都能在块里找到）", lost.length === 0);
    t("块 id 全书唯一", new Set(chunks.map(c => c.id)).size === chunks.length);
  }

  /* ── D15 chunkText 参数离谱也不能死循环 ─────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_chunk.js"]);
    const C = sb.DISTILL_CHUNK;
    const body = ("甲".repeat(159) + "。").repeat(10);
    const r = C.chunkText(body, 300, 200);
    t("D15 overlap ≥ maxChars/3 时仍能终止", Array.isArray(r) && r.length > 0 && r.length < 200);
    const r2 = C.chunkText(body, 300, 300);
    t("D15 overlap ≥ maxChars 时仍能终止", Array.isArray(r2) && r2.length > 0 && r2.length < 200);
  }

  /* ── D4/D11 断点续跑与中止 ───────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_core.js"]);
    const C = sb.DISTILL_CORE;
    let calls = 0;
    sb.DISTILL_LLM.chat = m => {
      calls++;
      const u = JSON.parse(m[1].content);
      return Promise.resolve({ content: "- **core_identity**: " + u.character + "@" + u.chunk_id, model: "stub" });
    };
    const chunks = [
      { id: "ch001", text: "林黛玉来了。".repeat(20), stage: "early" },
      { id: "ch002", text: "林黛玉走了。".repeat(20), stage: "late" }
    ];
    const ck = {};
    await C.distillNovel(chunks, ["林黛玉"], { checkpoint: ck, batchProfiles: false });
    t("D4 checkpoint 存的是结果对象而不是 true",
      typeof ck["ch001|林黛玉"] === "object" && !!ck["ch001|林黛玉"].fields);
    const first = calls;
    const res2 = await C.distillNovel(chunks, ["林黛玉"], { checkpoint: ck, batchProfiles: false });
    t("D4 续跑 0 次调用", calls - first === 0);
    t("D4 续跑后档案完整（原为 0 张卡）", !!res2["林黛玉"] && res2["林黛玉"].chunks === 2);

    // 旧格式断点（值为 true）无法还原内容，应按未完成重算
    const legacy = { "ch001|林黛玉": true, "ch002|林黛玉": true };
    const before = calls;
    const res3 = await C.distillNovel(chunks, ["林黛玉"], { checkpoint: legacy, batchProfiles: false });
    t("D4 旧布尔断点按未完成重算", calls - before === 2 && res3["林黛玉"].chunks === 2);

    let n = 0;
    sb.DISTILL_LLM.chat = () => { n++; return Promise.resolve({ content: "- **core_identity**: x" }); };
    const five = [1, 2, 3, 4, 5].map(i => ({ id: "c" + i, text: "甲出现了。".repeat(5), stage: "mid" }));
    const ra = await C.distillNovel(five, ["甲"], { checkpoint: {}, batchProfiles: false, shouldAbort: () => n >= 2 });
    t("D11 中止后立即停止调用", n === 2);
    t("D11 中止保留已完成部分", ra["甲"] && ra["甲"].chunks === 2);
  }

  /* ── D7 关系判据 ─────────────────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_relations.js"]);
    const R = sb.DISTILL_RELATIONS;
    t("D7 无交互无引号不命中", R.hasExplicitInteraction("两人沉默不语") === false);
    t("D7 「知道」不再误命中（道=知道）", R.hasExplicitInteraction("天下没有人知道") === false);
    t("D7 「道路」不再误命中", R.hasExplicitInteraction("这条道路很长") === false);
    t("D7 对话引号命中", R.hasExplicitInteraction("黛玉笑道：“你来了。”") === true);
    t("D7 具体动作命中", R.hasExplicitInteraction("他拉住她的手") === true);

    const names = ["甲", "乙"];
    const chunks = [];
    for (let k = 0; k < 20; k++) chunks.push({ id: "ch" + k, text: "甲站在院里。乙知道这件事的来龙去脉。" });
    const edges = R.extractPairs(chunks, names, {}, {});
    t("D7 纯共现不产出 strong 边", edges.filter(e => e.corroboration.level === "strong").length === 0);
  }

  /* ── D8 审计/探针的三态语义 ─────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_package.js", "distill_auditor.js", "distill_probes.js"]);
    const pkg = sb.DISTILL_PACKAGE.createPackage("测试书");
    pkg.characters = [{ name: "甲", importance: 5 }];
    sb.DISTILL_PACKAGE.updatePackage(pkg);
    sb.DISTILL_PACKAGE.saveCharacterCard(pkg.id, "甲", { name: "甲", _distill: { core_identity: "书生" } });

    sb.DISTILL_LLM.chat = () => Promise.reject(new Error("模拟网关故障"));
    const a = await sb.DISTILL_AUDITOR.audit(pkg.id, "甲", {});
    t("D8 审计失败返回 pass=null（原为 pass=true）", a.pass === null);
    t("D8 审计失败带 status=error", a.status === "error");

    const p = await sb.DISTILL_PROBES.probe(pkg.id, "甲", {});
    t("D8 探针失败返回 pass=null", p.pass === null);
    t("D8 探针失败题单列", p.error_count === p.results.length && p.error_count > 0);
    t("D8 失败题 ooc 为 null 而非 false", p.results.every(r => r.ooc === null));

    // 模型返回非 JSON 也不能算通过
    sb.DISTILL_LLM.chat = () => Promise.resolve({ content: "抱歉，我无法审计", model: "stub" });
    const a2 = await sb.DISTILL_AUDITOR.audit(pkg.id, "甲", {});
    t("D8 非 JSON 审计结果不算通过", a2.pass === null && a2.status === "unparsed");
  }

  /* ── D9 字段接线与标注剥离 ─────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["prompt.js"]);
    vm.runInContext("globalThis.RP_PROMPT = RP_PROMPT;", sb);   // const 不挂到 global 对象上
    const P = sb.RP_PROMPT;
    t("D9 LAYERS.background 含 background 字段",
      P.LAYERS.background.indexOf("background") >= 0);
    const out = P.renderFields({ fields: { core_identity: "孤女 [canon:ch001]" } }, ["core_identity"]);
    t("D9 prompt 里剥掉 [canon:chXXX] 标注", out.indexOf("[canon") < 0 && out.indexOf("孤女") >= 0);
    const out2 = P.renderFields({ fields: { core_traits: "敏感 [ref:ch012]，孤僻 [inference]" } }, ["core_traits"]);
    t("D9 其它四态标注也剥掉", out2.indexOf("[ref") < 0 && out2.indexOf("[inference") < 0);
  }

  /* ── D13 删除覆盖各存储层 ───────────────────────────────────── */
  {
    const removed = [];
    const sb = sandbox({
      RP_STORE: {
        cacheSet: () => {}, syncBig: () => {}, getSync: () => null,
        removeItemAsync: k => { removed.push(k); },
        evictFile: () => {}
      }
    });
    load(sb, ["distill_package.js"]);
    const P = sb.DISTILL_PACKAGE;
    const pkg = P.createPackage("要删的书");
    pkg.characters = [{ name: "甲" }, { name: "乙" }];
    P.updatePackage(pkg);
    P.saveData(pkg.id, "relations", []);
    P.saveData(pkg.id, "plot", { sections: [] });
    P.deletePackage(pkg.id);
    const need = ["_meta", "_char_甲", "_char_乙", "_relations", "_plot"];
    t("D13 删除点名所有分区的 key（不依赖 localStorage 枚举）",
      need.every(s => removed.some(k => k.indexOf("nd_package_" + pkg.id + s) === 0)));
    t("D13 走 RP_STORE.removeItemAsync（能清掉 IDB/文件层）", removed.length >= need.length);
    t("D13 包索引里已移除", P.listPackages().every(x => x.id !== pkg.id));
  }

  /* ── D24 同毫秒创建不撞 id ──────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_package.js"]);
    const ids = [];
    for (let i = 0; i < 50; i++) ids.push(sb.DISTILL_PACKAGE.createPackage("书" + i).id);
    t("D24 50 次连续创建 id 全不同", new Set(ids).size === 50);
  }

  /* ── D19/D22 时序泄漏结果落盘，质量门可复现 ─────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_package.js", "distill_provenance.js", "distill_llm.js",
      "distill_core.js", "distill_quality.js", "distill_timeleak.js"]);
    const P = sb.DISTILL_PACKAGE, Q = sb.DISTILL_QUALITY;
    const pkg = P.createPackage("时序书");
    pkg.characters = [{ name: "甲", importance: 5 }];
    P.updatePackage(pkg);
    P.saveCharacterCard(pkg.id, "甲", { name: "甲", _distill: { core_identity: "书生" } });
    P.saveData(pkg.id, "timeleak", [{ character: "甲", term: "结局", stage: "late" }]);
    const r = Q.check(pkg.id);
    t("D22 质量门读包内 timeleak 数据（不再依赖同会话全局）",
      r.checks.some(c => c.id === "timeleak" && c.level === "fail"));
    P.saveData(pkg.id, "timeleak", []);
    const r2 = Q.check(pkg.id);
    t("D22 无泄漏时给出 pass 而不是跳过",
      r2.checks.some(c => c.id === "timeleak" && c.level === "pass"));
  }

  /* ── D16 重编译不丢分层 ────────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_package.js", "distill_llm.js", "distill_library.js"]);
    const P = sb.DISTILL_PACKAGE;
    const pkg = P.createPackage("分层书");
    pkg.characters = [{ name: "甲", importance: 5 }];
    P.updatePackage(pkg);
    P.saveCharacterCard(pkg.id, "甲", {
      name: "甲",
      _distill: {
        core_identity: "书生 [canon:ch001]",
        early: { core_identity: "少年 [canon:ch001]" },
        mid: { core_identity: "秀才 [canon:ch005]" },
        late: { core_identity: "进士 [canon:ch009]" }
      }
    });
    P.saveData(pkg.id, "provenance", {
      facts: [{ character: "甲", field: "core_identity", value: "书生", source: "canon", chunk_id: "ch001" }]
    });
    sb.DISTILL_LIBRARY.recompileCard(pkg.id, "甲");
    const card = P.getCharacterCard(pkg.id, "甲");
    t("D16 重编译后 early/mid/late 仍在",
      !!card._distill.early && !!card._distill.mid && !!card._distill.late);
    t("D16 顶层字段被更新", card._distill.core_identity.indexOf("书生") === 0);
  }

  /* ── D12 4xx 不重试，5xx 才重试 ─────────────────────────────── */
  {
    const mk = status => {
      let n = 0;
      const sb = sandbox({
        fetch: () => { n++; return Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) }); }
      });
      load(sb, ["distill_llm.js"]);
      sb.DISTILL_LLM.saveCfg({ baseUrl: "https://x.test/v1", key: "k", model: "m" });
      return { sb, calls: () => n };
    };
    const a = mk(401);
    let e1 = null;
    try { await a.sb.DISTILL_LLM.chat([{ role: "user", content: "hi" }]); } catch (e) { e1 = e; }
    t("D12 401 只调用 1 次（原来重试 3 次白等 6 秒）", a.calls() === 1);
    t("D12 401 错误信息可读", !!e1 && /401/.test(e1.message) && /未授权/.test(e1.message));

    const b = mk(500);
    let e2 = null;
    try { await b.sb.DISTILL_LLM.chat([{ role: "user", content: "hi" }]); } catch (e) { e2 = e; }
    t("D12 500 仍然重试 3 次", b.calls() === 3);
    t("D12 5xx 最终抛出", !!e2);
  }

  /* ── D21 开场白 prompt 不含 [object Object] ─────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_openings.js"]);
    let sent = "";
    sb.DISTILL_LLM.chat = m => {
      sent = m.map(x => x.content).join("\n");
      return Promise.resolve({ content: '{"openings":[{"text":"你好。"}]}' });
    };
    await sb.DISTILL_OPENINGS.generateOpenings("甲", {
      core_identity: "书生",
      early: { core_identity: "少年" },
      mid: { core_identity: "秀才" },
      late: { core_identity: "进士" }
    }, {});
    t("D21 分层对象不拼成 [object Object]", sent.indexOf("[object Object]") < 0);
    t("D21 字符串字段仍然进 prompt", sent.indexOf("书生") >= 0);
  }

  /* ── A 批量画像：一块一次调用，产出全部角色 ─────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_core.js"]);
    const C = sb.DISTILL_CORE;
    const chunks = [
      { id: "c1", text: "甲与乙同行。".repeat(20), stage: "early" },
      { id: "c2", text: "甲与乙争执。".repeat(20), stage: "mid" },
      { id: "c3", text: "甲与乙告别。".repeat(20), stage: "late" }
    ];
    let calls = 0, batchCalls = 0;
    sb.DISTILL_LLM.chat = function (msgs) {
      calls++;
      const sys = msgs[0].content || "";
      const u = JSON.parse(msgs[1].content);
      if (sys.indexOf("严格 JSON") >= 0) {
        batchCalls++;
        const map = {};
        u.characters.forEach(n => { map[n] = { core_identity: n + "@" + u.chunk_id, core_traits: "冷静", background: "背景够十个字以上的描述" }; });
        return Promise.resolve({ content: "```json\n" + JSON.stringify({ characters: map }) + "\n```" });
      }
      return Promise.resolve({ content: "- **core_identity**: " + u.character });
    };
    const res = await C.distillNovel(chunks, ["甲", "乙"], { checkpoint: {} });
    t("A1 批量模式每块只调用一次（3 块 2 人 → 3 次）", batchCalls === 3 && calls === 3);
    t("A1 两人都有 3 块档案", res["甲"] && res["甲"].chunks === 3 && res["乙"] && res["乙"].chunks === 3);
    t("A1 代码块围栏内的 JSON 能解析", /@c[123]/.test(res["甲"].fields.core_identity));

    // 续跑: 全部命中后不应再调用
    const before = calls;
    const res2 = await C.distillNovel(chunks, ["甲", "乙"], { checkpoint: {} });
    t("A2 无断点时重跑仍会调用", calls > before);
    const ck = {};
    await C.distillNovel(chunks, ["甲"], { checkpoint: ck });
    const before2 = calls;
    const res3 = await C.distillNovel(chunks, ["甲"], { checkpoint: ck });
    t("A2 断点命中后批量不复跑", calls === before2 && res3["甲"].chunks === 3);
  }

  /* ── A 批量失败/漏角色的兜底 ─────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_core.js"]);
    const C = sb.DISTILL_CORE;
    const chunks = [{ id: "c1", text: "甲与乙同行。".repeat(20), stage: "mid" }];

    // 整批返回非 JSON → 回退逐人
    let calls = 0, singles = 0;
    sb.DISTILL_LLM.chat = function (msgs) {
      calls++;
      const sys = msgs[0].content || "";
      if (sys.indexOf("严格 JSON") >= 0) return Promise.resolve({ content: "抱歉，我无法完成" });
      singles++;
      return Promise.resolve({ content: "- **core_identity**: 单人结果" });
    };
    const r = await C.distillNovel(chunks, ["甲", "乙"], { checkpoint: {} });
    t("A3 批量解析失败回退逐人", calls === 3 && singles === 2);
    t("A3 回退后仍产出档案", r["甲"] && r["乙"]);

    // 批量只返回一个角色 → 缺的那个单人补跑
    let calls2 = 0, singles2 = 0;
    sb.DISTILL_LLM.chat = function (msgs) {
      calls2++;
      const sys = msgs[0].content || "";
      const u = JSON.parse(msgs[1].content);
      if (sys.indexOf("严格 JSON") >= 0) {
        return Promise.resolve({ content: JSON.stringify({ characters: { "甲": { core_identity: "只有甲" } } }) });
      }
      singles2++;
      return Promise.resolve({ content: "- **core_identity**: 补跑" });
    };
    const r2 = await C.distillNovel(chunks, ["甲", "乙"], { checkpoint: {} });
    t("A4 批量漏角色时单人补跑", calls2 === 2 && singles2 === 1);
    t("A4 补跑的角色也有档案", !!r2["乙"]);
  }

  /* ── C 并发 ─────────────────────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_core.js"]);
    const C = sb.DISTILL_CORE;
    const chunks = [];
    for (let i = 0; i < 12; i++) chunks.push({ id: "c" + i, text: "甲出现了。".repeat(5), stage: "mid" });
    let inflight = 0, peak = 0;
    sb.DISTILL_LLM.chat = async () => {
      inflight++; peak = Math.max(peak, inflight);
      await new Promise(r => setTimeout(r, 20));
      inflight--;
      return { content: "- **core_identity**: x" };
    };
    const t0 = Date.now();
    await C.distillNovel(chunks, ["甲"], { checkpoint: {}, batchProfiles: false, concurrency: 1 });
    const serialMs = Date.now() - t0;
    peak = 0;
    const t1 = Date.now();
    await C.distillNovel(chunks, ["甲"], { checkpoint: {}, batchProfiles: false, concurrency: 3 });
    const parMs = Date.now() - t1;
    t("C1 3 路并发时同时在飞 3 个请求", peak === 3);
    t("C1 并发确实更快", parMs < serialMs * 0.6);

    peak = 0;
    await C.distillNovel(chunks, ["甲"], { checkpoint: {}, batchProfiles: false, concurrency: 1 });
    t("C2 concurrency=1 退回串行", peak === 1);
    peak = 0;
    await C.distillNovel(chunks, ["甲"], { checkpoint: {}, batchProfiles: false, concurrency: 99 });
    t("C2 并发上限被夹到 8", peak <= 8);
  }

  /* ── 关系丰富批量 ───────────────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_relations.js"]);
    const R = sb.DISTILL_RELATIONS;
    const mk = n => Array.from({ length: n }, (_, i) => ({
      source_character: "甲" + i, target_character: "乙" + i,
      _both_core: true, _evidence: ["他们在一处说话"]
    }));

    let calls = 0;
    sb.DISTILL_LLM.chat = (msgs) => {
      calls++;
      const u = JSON.parse(msgs[1].content);
      return Promise.resolve({
        content: JSON.stringify({
          edges: u.pairs.map(p => ({ a: p.a, b: p.b, relation: "朋友", summary: "常在一处", affinity: 3 }))
        })
      });
    };
    const e1 = mk(20);
    await R.enrichEdges(e1, () => {}, {});
    t("R1 20 条边 → 3 次调用（每批 8 条）", calls === 3);
    t("R1 全部边都被丰富", e1.every(e => e.relation === "朋友" && e.affinity === 3));

    // 整批返回非 JSON → 逐条兜底
    let calls2 = 0, singles = 0;
    sb.DISTILL_LLM.chat = (msgs) => {
      calls2++;
      const u = JSON.parse(msgs[1].content);
      if (u.pairs && u.pairs.length > 1) return Promise.resolve({ content: "抱歉，无法处理" });
      singles++;
      return Promise.resolve({ content: JSON.stringify({ relation: "点头之交", summary: "x", affinity: 1 }) });
    };
    const e2 = mk(4);
    await R.enrichEdges(e2, () => {}, {});
    t("R2 批量失败逐条兜底", calls2 === 5 && singles === 4);
    t("R2 兜底后每条都有关系", e2.every(e => e.relation === "点头之交"));

    // 已丰富的边不重复请求（续跑）
    let calls3 = 0;
    sb.DISTILL_LLM.chat = () => { calls3++; return Promise.resolve({ content: "{}" }); };
    await R.enrichEdges(e1, () => {}, {});
    t("R3 已丰富的边不重复请求", calls3 === 0);
  }

  /* ── 画像与梗概同块产出 ─────────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_chunk.js", "distill_core.js", "distill_plot.js"]);
    const C = sb.DISTILL_CORE, P = sb.DISTILL_PLOT;
    const chunks = [
      { id: "c1", title: "第一章", text: "甲进了院子。".repeat(30), stage: "early" },
      { id: "c2", title: "第二章", text: "甲出了城。".repeat(30), stage: "late" }
    ];
    let calls = 0;
    sb.DISTILL_LLM.chat = (msgs) => {
      calls++;
      const u = JSON.parse(msgs[1].content);
      const map = {};
      (u.characters || []).forEach(n => { map[n] = { core_identity: n + "@" + u.chunk_id }; });
      return Promise.resolve({
        content: JSON.stringify({
          summary: { events: ["事件" + u.chunk_id], turning_points: [], hooks: ["悬念"] },
          characters: map
        })
      });
    };
    const ck = {};
    const prof = await C.distillNovel(chunks, ["甲"], { checkpoint: ck, withPlotSummary: true });
    t("S1 梗概与画像同一次调用（2 块 → 2 次）", calls === 2);
    t("S1 画像正常产出", prof["甲"] && prof["甲"].chunks === 2);
    t("S1 梗概写进 checkpoint", !!ck["sum_c1"] && !!ck["sum_c2"]);

    const before = calls;
    const sums = await P.summarizeChunks(chunks, ["甲"], {}, { checkpoint: ck });
    t("S2 剧情阶段直接复用，0 次调用", calls === before && sums.length === 2);
    t("S2 梗概形状正确（chunk_id/hooks.setup_chunk）",
      sums[0].chunk_id === "c1" && sums[0].events[0] === "事件c1" &&
      sums[0].hooks[0].setup_chunk === "c1");

    // 没有角色出现的块也要产梗概
    const ck2 = {};
    const only = [{ id: "c9", title: "第九章", text: "此处无人物只有风雪。".repeat(20), stage: "mid" }];
    let calls2 = 0;
    sb.DISTILL_LLM.chat = () => {
      calls2++;
      return Promise.resolve({ content: JSON.stringify({ summary: { events: ["风雪"] }, characters: {} }) });
    };
    await C.distillNovel(only, ["甲"], { checkpoint: ck2, withPlotSummary: true });
    t("S3 无角色的块仍产出梗概", calls2 === 1 && !!ck2["sum_c9"]);
  }

  /* ── 开场白：分批 + 并发 ───────────────────────────────────── */
  {
    const sb = sandbox();
    load(sb, ["distill_llm.js", "distill_package.js", "distill_openings.js"]);
    const P = sb.DISTILL_PACKAGE, O = sb.DISTILL_OPENINGS;
    const pkg = P.createPackage("开场白书");
    const names = ["甲", "乙", "丙", "丁", "戊", "己", "庚"];
    pkg.characters = names.map(n => ({ name: n, importance: 5 }));
    P.updatePackage(pkg);
    names.forEach(n => P.saveCharacterCard(pkg.id, n, {
      name: n, _distill: { core_identity: n + "是个书生", core_traits: "冷静" }
    }));

    let calls = 0, inflight = 0, peak = 0, batchCalls = 0;
    sb.DISTILL_LLM.chat = async (msgs) => {
      calls++; inflight++; peak = Math.max(peak, inflight);
      await new Promise(r => setTimeout(r, 15));
      inflight--;
      const sys = msgs[0].content || "";
      if (sys.indexOf("每个角色") >= 0) {
        batchCalls++;
        const u = JSON.parse(msgs[1].content);
        const map = {};
        u.characters.forEach(c => {
          map[c.name] = [
            { situation: "初见", text: c.name + "抬眼看你。" },
            { situation: "日常", text: "嗯。" },
            { situation: "冲突", text: "你错了。" }
          ];
        });
        return Promise.resolve({ content: JSON.stringify({ openings: map }) });
      }
      return Promise.resolve({ content: JSON.stringify({ openings: [{ situation: "单人", text: "单人开场" }] }) });
    };

    const res = await O.generateAll(pkg.id, names, {});
    t("O1 7 人按 3 人一批 → 3 次调用（3+3+1，末组单人；原来 7 次）", calls === 3 && batchCalls === 2);
    t("O1 每人 3 条且内容对应本人", res["甲"].length === 3 && res["甲"][0].text.indexOf("甲") === 0);
    t("O1 并发执行（同时在飞 ≥2）", peak >= 2);
    t("O1 卡片的 first_mes 被写回",
      P.getCharacterCard(pkg.id, "乙").first_mes === "乙抬眼看你。");
    t("O1 输出里只有本人台词（无串味）",
      res["丙"].every(o => o.text.indexOf("甲") < 0 && o.text.indexOf("丁") < 0));

    // 批量漏人 → 单人补
    let calls2 = 0, singles = 0;
    sb.DISTILL_LLM.chat = (msgs) => {
      calls2++;
      const sys = msgs[0].content || "";
      if (sys.indexOf("每个角色") >= 0) {
        const u = JSON.parse(msgs[1].content);
        const map = {};
        u.characters.slice(0, 2).forEach(c => { map[c.name] = [{ situation: "初见", text: "批量" }]; });
        return Promise.resolve({ content: JSON.stringify({ openings: map }) });
      }
      singles++;
      return Promise.resolve({ content: JSON.stringify({ openings: [{ situation: "补", text: "补跑" }] }) });
    };
    const res2 = await O.generateAll(pkg.id, ["甲", "乙", "丙"], { concurrency: 1 });
    t("O2 批量漏掉的角色单个补跑", singles === 1 && res2["丙"][0].text === "补跑");

    // 整批解析失败 → 全部回退单人
    let calls3 = 0, singles3 = 0;
    sb.DISTILL_LLM.chat = (msgs) => {
      calls3++;
      if ((msgs[0].content || "").indexOf("每个角色") >= 0) return Promise.resolve({ content: "抱歉" });
      singles3++;
      return Promise.resolve({ content: JSON.stringify({ openings: [{ situation: "s", text: "兜底" }] }) });
    };
    const res3 = await O.generateAll(pkg.id, ["甲", "乙", "丁"], { concurrency: 1 });
    t("O3 整批失败全部回退单人", calls3 === 4 && singles3 === 3 && res3["丁"][0].text === "兜底");
  }

  console.log(`distill_pipeline: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
