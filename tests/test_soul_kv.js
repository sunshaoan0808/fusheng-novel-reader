/* v41 rp/soul_kv.js：共用 KV 桶；各 soul 扩展模块改用它后键名/语义不变、加载顺序正确 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const RP = path.join(__dirname, "../www/rp");
let pass = 0, fail = 0;
const ok = (n, c) => { if(c) pass++; else { fail++; console.log("FAIL:", n); } };
function ctxWith(){
  const store = {};
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const c = { localStorage: ls, RP_SOUL: { getSoul: () => ({}) }, console };
  c.globalThis = c; vm.createContext(c); return { c, store };
}
const KV = fs.readFileSync(path.join(RP, "soul_kv.js"), "utf8");
{
  const { c, store } = ctxWith(); vm.runInContext(KV, c);
  const b = c.RP_SOUL_KV.bucket("nd_soulq_");
  ok("globalThis 显式导出", c.globalThis.RP_SOUL_KV === c.RP_SOUL_KV);
  ok("k 拼前缀", b.k("c1") === "nd_soulq_c1");
  ok("g 缺省 {}", JSON.stringify(b.g("c1")) === "{}");
  b.s("c1", { a: 1 }); ok("s 写 JSON", store["nd_soulq_c1"] === '{"a":1}');
  ok("g 读回", b.g("c1").a === 1);
  store["nd_soulq_bad"] = "{oops"; ok("g 坏 JSON 返回 {}", JSON.stringify(b.g("bad")) === "{}");
  b.rm("c1"); ok("rm 删除", !("nd_soulq_c1" in store));
  c.localStorage.setItem = () => { throw new Error("quota"); };
  let threw = false; try{ b.s("c2", {}); }catch(e){ threw = true; } ok("s 写失败静默", !threw);
}
const html = fs.readFileSync(path.join(__dirname, "../www/index.html"), "utf8");
const users = fs.readdirSync(RP).filter(f => /^soul_.*\.js$/.test(f) && f !== "soul_kv.js" && /RP_SOUL_KV\.bucket\(/.test(fs.readFileSync(path.join(RP, f), "utf8")));
ok("至少 20 个模块改用共用桶", users.length >= 20);
const kvAt = html.indexOf('src="rp/soul_kv.js"');
users.forEach(f => {
  const src = fs.readFileSync(path.join(RP, f), "utf8");
  const pre = (src.match(/RP_SOUL_KV\.bucket\("([^"]+)"\)/) || [])[1];
  const { c, store } = ctxWith(); vm.runInContext(KV, c);
  let loaded = true; try{ vm.runInContext(src, c); }catch(e){ loaded = false; }
  ok(f + " 加载", loaded);
  ok(f + " 不再自带 k/g/s 三件套", !/function _?g\(c\)\{\s*try\{return JSON\.parse\(localStorage/.test(src));
  const at = html.indexOf('src="rp/' + f + '"');
  if(at >= 0) ok(f + " 排在 soul_kv.js 之后", kvAt >= 0 && kvAt < at);
  ok(f + " 前缀形如 nd_soulX_", /^nd_soul[a-z]+_$/.test(pre || ""));
});
console.log(pass + "/" + (pass + fail) + (fail ? "  FAIL " + fail : "  OK"));
process.exit(fail ? 1 : 0);
