/* data.js 拆包回归（2026-10-18）
 * 1) 瘦身 data.js 只剩 index；2) 每个 index run 都有 run 文件；
 * 3) 拼回后与 git HEAD 的原版 data.js 深度相等（拆包无损）；
 * 4) RP_LAZY.ensureRun 单飞/幂等/失败重试/就绪判定。
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { execSync } = require("child_process");

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
  /* ---- 1) 瘦身 data.js ---- */
  const slimSize = fs.statSync(path.join(WWW, "data.js")).size;
  t("D1 data.js 瘦到 5KB 以下", slimSize < 5120);
  const D = loadData(["data.js"]);
  t("D2 index 保留 3 个 run", Array.isArray(D.index) && D.index.length === 3);
  t("D3 runs 是空壳", D.runs && Object.keys(D.runs).length === 0);
  t("D4 rp_cards 是空壳", D.rp_cards && Object.keys(D.rp_cards).length === 0);
  t("D5 index 字段完好（characters/has_worldcard）",
    D.index.every(r => Array.isArray(r.characters) && typeof r.has_worldcard === "boolean"));

  /* ---- 2) run 文件齐全 ---- */
  const runFiles = fs.readdirSync(path.join(WWW, "data")).filter(f => /^run_.*\.js$/.test(f)).sort();
  t("D6 run 文件数与 index 一致", runFiles.length === D.index.length);
  for (const r of D.index) {
    t("D7 " + r.run_id + " 有 run 文件", runFiles.includes("run_" + r.run_id + ".js"));
  }

  /* ---- 3) 拼回与 git HEAD 原版深度相等 ---- */
  let orig = null;
  try {
    const src = execSync("git show HEAD:www/data.js", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const sb = { console };
    sb.window = sb;
    vm.runInContext(src, vm.createContext(sb), { filename: "data.js@HEAD" });
    orig = sb.__DATA__;
  } catch (e) { /* git 不可用时跳过等价校验 */ }
  if (orig) {
    const merged = loadData(["data.js", ...runFiles.map(f => "data/" + f)]);
    t("D8 拼回 index 与原版相等", deepEq(merged.index, orig.index));
    t("D9 拼回 runs 与原版相等", deepEq(merged.runs, orig.runs));
    t("D10 拼回 rp_cards 与原版相等", deepEq(merged.rp_cards, orig.rp_cards));
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
    /* run 文件加载即填数据：模拟真实 data/run_*.js 的行为 */
    const runData = {};
    for (const r of D.index) runData["data/run_" + r.run_id + ".js"] = r.run_id;
    const origCreate = sb.document.createElement;
    sb.document.createElement = function() {
      const el = origCreate();
      const src = runData[el.src || ""];
      const realOnload = el.onload;
      return el;
    };
    /* 简化：直接在 appendChild 成功后写数据（onload 之前） */
    sb.document.head.appendChild = function(el) {
      appended.push(el.src);
      setTimeout(() => {
        const rid = runData[el.src];
        if (failSet && failSet.has(el.src)) { if (el.onerror) el.onerror(); return; }
        if (rid) { sb.__DATA__ = sb.__DATA__ || {}; sb.__DATA__.runs = sb.__DATA__.runs || {}; sb.__DATA__.runs[rid] = { run_id: rid, novel: rid }; }
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

  console.log(`data_split: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
