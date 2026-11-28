/* DISTILL_LLM 400 处置回归 (2026-11-28):
 * - 非 2xx 时错误信息带上接口返回正文片段 (不再只有干巴巴的 HTTP 400)
 * - 400 且带 temperature 时, 自动去掉 temperature 重试一次并能成功
 * - 401 等鉴权错误不重试、立即冒泡 */
const fs = require("fs");
const vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

function makeSb(fetchImpl) {
  const mem = new Map();
  mem.set("nd_distill_llm", JSON.stringify({ baseUrl: "https://x.test/v1", key: "k", model: "deepseek-v4.1-flash-free" }));
  const localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
    key: i => Array.from(mem.keys())[i] || null,
    get length() { return mem.size; },
    clear: () => mem.clear()
  };
  const sb = { localStorage, console, Date, Math, JSON, RegExp, Object, Array, String, Number,
    parseInt, parseFloat, setTimeout, clearTimeout, Promise, Map, Set, fetch: fetchImpl };
  const ctx = vm.createContext(sb);
  sb.window = sb; sb.globalThis = sb;
  vm.runInContext(fs.readFileSync(WWW + "/rp/distill_llm.js", "utf8"), ctx, { filename: "distill_llm.js" });
  return sb;
}
const okResp = () => ({ ok: true, status: 200,
  text: async () => "",
  json: async () => ({ choices: [{ message: { content: "好的" }, finish_reason: "stop" }] }) });
const errResp = (status, body) => ({ ok: false, status,
  text: async () => body, json: async () => ({}) });

(async function () {
  /* A: 400(temperature) -> 去温重试成功 */
  {
    const bodies = [];
    let n = 0;
    const sb = makeSb(async (url, init) => {
      bodies.push(JSON.parse(init.body));
      n++;
      return n === 1 ? errResp(400, '{"error":{"message":"temperature is not supported for this model"}}') : okResp();
    });
    const r = await sb.DISTILL_LLM.chat([{ role: "user", content: "hi" }]);
    t("A 去温重试后成功", r.content === "好的");
    t("A 共两次请求", bodies.length === 2);
    t("A 首请求带 temperature", bodies[0].temperature === 0.7);
    t("A 重试请求无 temperature", !("temperature" in bodies[1]));
  }
  /* B: 持续 400 -> 冒泡且带正文原因 */
  {
    let n = 0;
    const sb = makeSb(async () => { n++; return errResp(400, '{"error":{"message":"bad request: unknown field"}}'); });
    let err = null;
    try { await sb.DISTILL_LLM.chat([{ role: "user", content: "hi" }]); } catch (e) { err = e; }
    t("B 最终失败冒泡", !!err);
    t("B 错误带正文原因", !!err && err.message.includes("unknown field"));
    t("B 错误带状态码", !!err && err.message.includes("HTTP 400"));
    t("B 只重试一次 (2 次请求)", n === 2);
  }
  /* C: 401 不重试 */
  {
    let n = 0;
    const sb = makeSb(async () => { n++; return errResp(401, '{"error":{"message":"invalid api key"}}'); });
    let err = null;
    try { await sb.DISTILL_LLM.chat([{ role: "user", content: "hi" }]); } catch (e) { err = e; }
    t("C 401 冒泡且带原因", !!err && err.message.includes("invalid api key"));
    t("C 401 只请求一次", n === 1);
  }
  console.log("distill_llm_400: " + pass + " pass, " + fail + " fail");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("ERROR:", e && e.stack || e); process.exit(1); });
