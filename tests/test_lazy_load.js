/* 按需加载器（rp/lazy.js）的回归测试
 * 关键行为：串行加载（顺序不能乱）、单飞（并发只加载一次）、失败可重试。
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

function makeDom(failSet) {
  const appended = [];
  const document = {
    createElement() { return { onload: null, onerror: null, src: "" }; },
    head: {
      appendChild(el) {
        appended.push(el.src);
        setTimeout(() => {
          if (failSet && failSet.has(el.src)) { if (el.onerror) el.onerror(); }
          else if (el.onload) el.onload();
        }, 0);
      }
    },
    documentElement: {}
  };
  return { document, appended };
}

function boot(failSet) {
  const { document, appended } = makeDom(failSet);
  const sb = { console, setTimeout, clearTimeout, Promise, Math, JSON, Object, Array, String, document };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(WWW, "rp", "lazy.js"), "utf8"), ctx, { filename: "lazy.js" });
  return { lazy: sb.RP_LAZY, appended };
}

(async () => {
  const { lazy, appended } = boot();
  const manifest = lazy.groups.distill;

  t("L1 清单里是 23 个蒸馏文件", manifest.length === 23);
  t("L2 加载前不算就绪", lazy.groupReady("distill") === false);

  // 两个入口同时点：只应加载一次
  const p1 = lazy.ensureGroup("distill");
  const p2 = lazy.ensureGroup("distill");
  t("L3 并发调用返回同一个 Promise", p1 === p2);
  await p1;
  t("L4 串行按清单顺序加载", JSON.stringify(appended) === JSON.stringify(manifest));
  t("L5 加载完成后就绪", lazy.groupReady("distill") === true);

  const before = appended.length;
  await lazy.ensureGroup("distill");
  t("L6 已加载后再次调用不重复请求", appended.length === before);

  t("L7 distill_ui 排在最后（它依赖前面的模块）", manifest[manifest.length - 1] === "rp/distill_ui.js");
  t("L8 未知分组直接 resolve", await lazy.ensureGroup("nope").then(() => true));

  // 失败 → reject，且不把坏状态缓存住（重试还能再试）
  const bad = new Set(["rp/distill_core.js"]);
  const b = boot(bad);
  let err = null;
  try { await b.lazy.ensureGroup("distill"); } catch (e) { err = e; }
  t("L9 加载失败会 reject", !!err && /distill_core/.test(err.message));
  t("L10 失败后不算就绪", b.lazy.groupReady("distill") === false);
  const afterFail = b.appended.length;
  await b.lazy.ensureGroup("distill").catch(() => {});
  t("L11 失败后重试会重新发起请求", b.appended.length > afterFail);

  console.log(`lazy_load: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
