/* 2026-11-23 接线审计回归: 防「一头热」失误复发 ——
 * (1) CSS 里裸用 var(--x)(无回退) 的变量必须有定义( --ink-soft 曾裸奔 );
 * (2) aifill 代笔的人设读取必须走 RP_PERSONA(裸键 nd_persona 已无人写入)。 */
const fs = require("fs"), path = require("path");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

/* (1) CSS 变量: 定义集 vs 裸用集 */
{
  const cssFiles = ["style.css", "ui42.css"].map(f => path.join(WWW, f));
  const css = cssFiles.map(f => fs.readFileSync(f, "utf8")).join("\n");
  const defined = new Set([...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(m => m[1]));
  /* JS 里 setProperty 的变量也算定义来源 */
  const jsAll = fs.readdirSync(path.join(WWW, "js")).concat(fs.readdirSync(path.join(WWW, "rp")))
    .filter(f => f.endsWith(".js"))
    .map(f => { try { return fs.readFileSync(path.join(WWW, "js", f), "utf8"); } catch(e) { return fs.readFileSync(path.join(WWW, "rp", f), "utf8"); } }).join("\n");
  for(const m of jsAll.matchAll(/setProperty\(\s*['"](--[a-zA-Z0-9-]+)['"]/g)) defined.add(m[1]);
  const bareUsed = new Set();
  for(const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)) bareUsed.add(m[1]);
  const missing = [...bareUsed].filter(v => !defined.has(v));
  t("CSS 裸用变量全部有定义 (缺失: " + missing.join(",") + ")", missing.length === 0);
  t("--ink-soft 不再被引用", !/var\(--ink-soft/.test(css));
}

/* (2) aifill personaCtx 走 RP_PERSONA */
{
  const store = { nd_persona_global: JSON.stringify({ name: "阿青", desc: "路过的剑客", extra: "", called: "青哥" }) };
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
  global.RP_PERSONA = { resolve: () => JSON.parse(store.nd_persona_global) };
  global.CHAT = { runId: "r1", mode: "single", name: "黛玉" };
  delete require.cache[require.resolve(path.join("..", WWW, "rp", "aifill.js"))];
  const AF = require(path.join("..", WWW, "rp", "aifill.js"));
  const ctx1 = AF._personaCtx();
  t("代笔人设读到全局人设", ctx1.indexOf("阿青") >= 0 && ctx1.indexOf("路过的剑客") >= 0);
  t("代笔人设带称呼", ctx1.indexOf("青哥") >= 0);
  /* 本聊覆盖优先于全局 */
  global.RP_PERSONA = { resolve: rid => rid === "r1" ? { name: "本聊名", desc: "", extra: "", called: "" } : JSON.parse(store.nd_persona_global) };
  t("本聊覆盖优先", AF._personaCtx().indexOf("本聊名") >= 0);
  /* 无人设时返回空串不抛 */
  global.RP_PERSONA = { resolve: () => null };
  t("无人设返回空串", AF._personaCtx() === "");
  const src = fs.readFileSync(path.join(WWW, "rp", "aifill.js"), "utf8");
  t("不再读裸键 nd_persona", !/getItem\("nd_persona"\)/.test(src));
}

console.log(`test_wiring_audit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
