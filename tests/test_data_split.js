/* data.js 拆包回归（2026-10-18）
 * 1) 瘦身 data.js 只剩 index；2) 每个 index run 都有 run 文件；
 * 3) 拼回后与「二级拆包前」的数据集深度相等（拆包无损）；
 * 4) RP_LAZY.ensureRun 单飞/幂等/失败重试/就绪判定。
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { execFileSync } = require("child_process");

const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

/* 在干净沙盒里加载一组文件，返回 __DATA__ */
function loadData(files) {
  const sb = { console };
  sb.window = sb; sb.globalThis = sb;
  const ctx = vm.createContext(sb);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(WWW, f), "utf8"), ctx, { filename: f });
  }
  return sb.__DATA__;
}
function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEq(a[k], b[k]));
}

(async () => {
  /* 「拆包前」基准 = 引入 run_<id>_foreshadowing.js 那个提交的父提交
   * （foreshadowing 还在核心 run 文件里的完整形态）。不能直接用 HEAD：
   * HEAD 自己就是已二级拆包的状态，核心 run 文件里没有 foreshadowing，
   * 而拼回结果含 _fs 恢复的 foreshadowing，两边反而对不上（时序地雷：
   * 6607530 提交时 HEAD 还是拆包前，能过；提交后 HEAD 语义变了就炸）。
   * 多组断言共用，先提取。 */
  let orig = null;
  try {
    let base = "HEAD";
    try {
      const addCommit = execFileSync("git",
        ["log", "--diff-filter=A", "--format=%H", "--",
          "www/data/run_honglou_full_foreshadowing.js"],
        { encoding: "utf8" }).trim().split("\n")[0];
      if (addCommit) base = addCommit + "~1";
    } catch (e) { /* 没有 _fs 文件的历史（未二级拆）：用 HEAD */ }
    const headSrcs = {};
    const names = ["www/data.js", ...fs.readdirSync(path.join(WWW, "data"))
      .filter(f => /^run_.*\.js$/.test(f) && !/_foreshadowing\.js$/.test(f))
      .sort().map(f => "www/data/" + f)];
    for (const n of names) {
      /* execFileSync 不走 shell：cmd.exe 会把 <rev>^:<path> 的 ^ 当转义符吃掉，
       * 静默加载错提交的版本（曾导致 D9 假失败） */
      try { headSrcs[n] = execFileSync("git", ["show", base + ":" + n], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); } catch (e) {}
    }
    const sb = { console };
    sb.window = sb;
    const ctx = vm.createContext(sb);
    for (const n of Object.keys(headSrcs)) vm.runInContext(headSrcs[n], ctx, { filename: n });
    orig = sb.__DATA__;
  } catch (e) { /* git 不可用时跳过等价校验 */ }

  /* ---- 1) 瘦身 data.js ---- */
  const slimSize = fs.statSync(path.join(WWW, "data.js")).size;
  t("D1 data.js 瘦到 5KB 以下", slimSize < 5120);
  const D = loadData(["data.js"]);
  t("D2 index 保留 3 个 run", Array.isArray(D.index) && D.index.length === 3);
  t("D3 runs 是空壳", D.runs && Object.keys(D.runs).length === 0);
  t("D4 rp_cards 是空壳", D.rp_cards && Object.keys(D.rp_cards).length === 0);
  t("D5 index 字段完好（characters/has_worldcard）",
    D.index.every(r => Array.isArray(r.characters) && typeof r.has_worldcard === "boolean"));

  /* ---- 2) run 文件齐全（核心 + foreshadowing 二级） ---- */
  const runFiles = fs.readdirSync(path.join(WWW, "data")).filter(f => /^run_.*\.js$/.test(f)).sort();
  const coreFiles = runFiles.filter(f => !/_foreshadowing\.js$/.test(f));
  const fsFiles = runFiles.filter(f => /_foreshadowing\.js$/.test(f));
  t("D6 核心 run 文件数与 index 一致", coreFiles.length === D.index.length);
  for (const r of D.index) {
    t("D7 " + r.run_id + " 有核心 run 文件", coreFiles.includes("run_" + r.run_id + ".js"));
  }
  /* 二级拆不变量：原版有 foreshadowing 字段的 run 必有 _fs 文件，
   * 且核心 run 文件执行后该字段为 undefined（foretell 里的 foreshadowing_links
   * 是同名不同义的下级字段，不能靠字符串匹配，必须跑一遍看真字段）。 */
  if (orig) {
    const withFs = Object.keys(orig.runs).filter(id => "foreshadowing" in orig.runs[id]);
    t("D6b 每个含 foreshadowing 的 run 都有 _fs 文件",
      withFs.every(id => fsFiles.includes("run_" + id + "_foreshadowing.js")));
    for (const f of coreFiles) {
      const sb = { console, __DATA__: { index: [], runs: {}, rp_cards: {} } };
      sb.window = sb;
      const ctx = vm.createContext(sb);
      vm.runInContext(fs.readFileSync(path.join(WWW, "data", f), "utf8"), ctx, { filename: f });
      const rid = f.replace(/^run_/, "").replace(/\.js$/, "");
      t("D6c " + f + " 执行后 foreshadowing 为 undefined",
        sb.__DATA__.runs[rid].foreshadowing === undefined);
    }
  }

  /* ---- 3) 拼回与 git HEAD 原版深度相等 ---- */
  /* P1-b: rp_cards 现有阶段变体键(<字段>__early/mid/late), 是二级拆包之后
   * 人为补的派生数据, 不在「拆包前」的 git 基准里。本组断言比的是"拆分搬运"
   * 有没有丢东西, 不是"数据能不能演进" —— 两边先剥掉阶段变体键再比;
   * 变体键的在场与存活另立 D10b 钉住。 */
  function stripStageKeys(cards) {
    const out = {};
    Object.keys(cards || {}).forEach(function (rid) {
      out[rid] = (cards[rid] || []).map(function (c) {
        const cc = {}; Object.keys(c).forEach(k => { cc[k] = c[k]; });
        const f = {};
        Object.keys(c.fields || {}).forEach(function (k) {
          if (!/__(early|mid|late)$/.test(k)) f[k] = c.fields[k];
        });
        cc.fields = f;
        return cc;
      });
    });
    return out;
  }
  if (orig) {
    const merged = loadData(["data.js", ...runFiles.map(f => "data/" + f)]);
    t("D8 拼回 index 与原版相等", deepEq(merged.index, orig.index));
    t("D9 拼回 runs 与原版相等", deepEq(merged.runs, orig.runs));
    t("D10 拼回 rp_cards 与原版相等(剥阶段变体键)",
      deepEq(stripStageKeys(merged.rp_cards), stripStageKeys(orig.rp_cards)));
    t("D10b 宝玉/黛玉阶段变体键在场且拆包不丢",
      (function () {
        const cs = (merged.rp_cards || {}).honglou_full || [];
        function has(nm, k) {
          const c = cs.filter(x => x.name === nm)[0];
          return !!(c && c.fields && c.fields[k]);
        }
        return has("贾宝玉", "appearance_feature__early") && has("贾宝玉", "appearance_feature__late")
          && has("贾宝玉", "visual_identity__early") && has("贾宝玉", "visual_identity__late")
          && has("林黛玉", "appearance_feature__late") && has("林黛玉", "voice_dressing__early")
          && has("林黛玉", "voice_dressing__late");
      })());
    t("D11 run 数 = 原版 run 数", Object.keys(merged.runs).length === Object.keys(orig.runs).length);
  } else {
    t("D8-D11 git 不可用，跳过", true);
  }

  /* ---- 4) RP_LAZY.ensureRun ---- */
  function bootLazy(failSet) {
    const appended = [];
    const sb = {
      console, setTimeout, Promise,
      document: {
        createElement() { return { onload: null, onerror: null, src: "" }; },
        head: { appendChild(el) {
          appended.push(el.src);
          setTimeout(() => {
            if (failSet && failSet.has(el.src)) { if (el.onerror) el.onerror(); }
            else if (el.onload) el.onload();
          }, 0);
        } },
      },
    };
    sb.window = sb; sb.globalThis = sb;
    const ctx = vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(WWW, "rp", "lazy.js"), "utf8"), ctx, { filename: "lazy.js" });
    /* script 加载即填数据：模拟真实 data/run_*.js / run_*_fs.js 的行为。
       清安录的伏笔 mock 成 []——空数组也是数据，必须判「已就绪」。 */
    const runData = {}, fsData = {};
    for (const r of D.index) {
      runData["data/run_" + r.run_id + ".js"] = r.run_id;
      fsData["data/run_" + r.run_id + "_foreshadowing.js"] = r.run_id;
    }
    sb.document.head.appendChild = function(el) {
      appended.push(el.src);
      setTimeout(() => {
        if (failSet && failSet.has(el.src)) { if (el.onerror) el.onerror(); return; }
        var rid = runData[el.src], frid = fsData[el.src];
        sb.__DATA__ = sb.__DATA__ || {}; sb.__DATA__.runs = sb.__DATA__.runs || {};
        if (rid) sb.__DATA__.runs[rid] = { run_id: rid, novel: rid };
        if (frid) {
          if (!sb.__DATA__.runs[frid]) sb.__DATA__.runs[frid] = { run_id: frid };
          sb.__DATA__.runs[frid].foreshadowing = frid === "qinganlu" ? [] : [{ hook: "m" }];
        }
        if (el.onload) el.onload();
      }, 0);
    };
    return { lazy: sb.RP_LAZY, appended, sb };
  }

  const L = bootLazy();
  L.sb.__DATA__ = { index: D.index, runs: {}, rp_cards: {} };
  t("D12 未加载时 ensureRun 前 runs 为空", !L.sb.__DATA__.runs.honglou_full);
  const p1 = L.lazy.ensureRun("honglou_full");
  const p2 = L.lazy.ensureRun("honglou_full");
  t("D13 并发 ensureRun 返回同一 Promise", p1 === p2);
  await p1;
  t("D14 ensureRun 后 runs 有数据", !!L.sb.__DATA__.runs.honglou_full);
  t("D15 加载路径是 data/run_<id>.js", L.appended[0] === "data/run_honglou_full.js");
  const before = L.appended.length;
  await L.lazy.ensureRun("honglou_full");
  t("D16 已加载再 ensureRun 不发请求", L.appended.length === before);

  t("D17 ensureAllRuns 拉齐全部", await L.lazy.ensureAllRuns().then(() =>
    D.index.every(r => !!L.sb.__DATA__.runs[r.run_id])));
  t("D18 ensureRun(空) 直接 resolve", await L.lazy.ensureRun("").then(() => true));

  const B = bootLazy(new Set(["data/run_shuihu_full.js"]));
  B.sb.__DATA__ = { index: D.index, runs: {}, rp_cards: {} };
  let err = null;
  try { await B.lazy.ensureRun("shuihu_full"); } catch (e) { err = e; }
  t("D19 ensureRun 失败会 reject", !!err && /shuihu_full/.test(err.message));
  const afterFail = B.appended.length;
  await B.lazy.ensureRun("shuihu_full").catch(() => {});
  t("D20 失败后重试重新发请求", B.appended.length > afterFail);

  /* 非 index 里的 runId：文件不存在 → onerror → reject（不静默成功） */
  const C = bootLazy();
  C.sb.__DATA__ = { index: D.index, runs: {}, rp_cards: {} };
  let err2 = null;
  try { await C.lazy.ensureRun("no_such_run"); } catch (e) { err2 = e; }
  t("D21 不存在的 run 会 reject", !!err2);

  /* ---- 5) RP_LAZY.ensureRunFs（foreshadowing 二级拆） ---- */
  const F = bootLazy();
  F.sb.__DATA__ = { index: D.index, runs: { honglou_full: { run_id: "honglou_full" } }, rp_cards: {} };
  t("D22 ensureRunFs 前 foreshadowing 是 undefined", F.sb.__DATA__.runs.honglou_full.foreshadowing === undefined);
  const fp1 = F.lazy.ensureRunFs("honglou_full");
  const fp2 = F.lazy.ensureRunFs("honglou_full");
  t("D23 并发 ensureRunFs 返回同一 Promise", fp1 === fp2);
  await fp1;
  t("D24 ensureRunFs 后字段就绪", Array.isArray(F.sb.__DATA__.runs.honglou_full.foreshadowing));
  t("D25 加载路径是 data/run_<id>_foreshadowing.js", F.appended[0] === "data/run_honglou_full_foreshadowing.js");
  const fsBefore = F.appended.length;
  await F.lazy.ensureRunFs("honglou_full");
  t("D26 已就绪再 ensureRunFs 不发请求", F.appended.length === fsBefore);

  /* 空数组 [] 也是数据：ensureRun 完（字段未拆进来时是 undefined）后 ensureRunFs 到 [] 即就绪 */
  const Q = bootLazy();
  Q.sb.__DATA__ = { index: D.index, runs: {}, rp_cards: {} };
  await Q.lazy.ensureRun("qinganlu");
  t("D27 ensureRun 后空伏笔字段仍 undefined（等二级）", Q.sb.__DATA__.runs.qinganlu.foreshadowing === undefined);
  await Q.lazy.ensureRunFs("qinganlu");
  t("D28 ensureRunFs 后空数组 [] 判已就绪", Array.isArray(Q.sb.__DATA__.runs.qinganlu.foreshadowing)
    && Q.sb.__DATA__.runs.qinganlu.foreshadowing.length === 0);

  const FB = bootLazy(new Set(["data/run_shuihu_full_foreshadowing.js"]));
  FB.sb.__DATA__ = { index: D.index, runs: { shuihu_full: { run_id: "shuihu_full" } }, rp_cards: {} };
  let ferr = null;
  try { await FB.lazy.ensureRunFs("shuihu_full"); } catch (e) { ferr = e; }
  t("D29 ensureRunFs 失败会 reject", !!ferr && /shuihu_full/.test(ferr.message));
  const fsAfterFail = FB.appended.length;
  await FB.lazy.ensureRunFs("shuihu_full").catch(() => {});
  t("D30 失败后重试重新发请求", FB.appended.length > fsAfterFail);

  console.log(`data_split: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
