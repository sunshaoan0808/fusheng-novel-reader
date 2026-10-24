/* v41 rp/securekey.js：API Key 走原生 Keystore 桥（模拟），无桥时完全不生效 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const SRC = fs.readFileSync(path.join(__dirname, "../www/rp/securekey.js"), "utf8");
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("ok - " + name); };

function mkEnv(bridge, initial){
  function Storage(){}
  Storage.prototype.getItem = function(k){ return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; };
  Storage.prototype.setItem = function(k, v){ this._d[k] = String(v); };
  Storage.prototype.removeItem = function(k){ delete this._d[k]; };
  Storage.prototype.clear = function(){ this._d = {}; };
  const ls = new Storage(); ls._d = Object.assign({}, initial || {});
  const ss = new Storage(); ss._d = {};
  const win = { Storage, localStorage: ls, sessionStorage: ss };
  if(bridge) win.Android = bridge;
  win.window = win;
  vm.createContext(win);
  vm.runInContext(SRC, win);
  return win;
}
function mkBridge(opts){
  opts = opts || {};
  const store = {};
  return { store,
    ndSecretAvailable(){ return !opts.unavailable; },
    ndSecretPut(n, v){ if(opts.putFail) return false; store[n] = "ENC(" + v + ")"; return true; },
    ndSecretGet(n){ if(!(n in store)) return null; if(opts.getBroken && n !== "nd_selftest") return "\u0000ND_IO_ERROR"; return store[n].slice(4, -1); },
    ndSecretDel(n){ delete store[n]; return true; },
    ndSecretClear(){ for(const k in store) delete store[k]; return true; } };
}

t("无桥：不启用，读写原样", () => {
  const w = mkEnv(null);
  assert.strictEqual(w.RP_SECURE.enabled(), false);
  w.localStorage.setItem("nd_api_cfg_v1", JSON.stringify({key:"sk-1", base:"b"}));
  assert.strictEqual(w.localStorage._d.nd_api_cfg_v1, JSON.stringify({key:"sk-1", base:"b"}));
});
t("有桥：Key 不落 localStorage，读回完整", () => {
  const b = mkBridge(); const w = mkEnv(b);
  assert.strictEqual(w.RP_SECURE.enabled(), true);
  w.localStorage.setItem("nd_api_cfg_v1", JSON.stringify({key:"sk-secret", base:"https://x", model:"m"}));
  assert.ok(w.localStorage._d.nd_api_cfg_v1.indexOf("sk-secret") < 0, "明文不应在 localStorage");
  assert.ok(b.store["nd_api_cfg_v1__key"].indexOf("sk-secret") >= 0);
  const back = JSON.parse(w.localStorage.getItem("nd_api_cfg_v1"));
  assert.deepStrictEqual(back, {key:"sk-secret", base:"https://x", model:"m"});
});
t("启动迁移已有明文 Key（含 profiles 数组）", () => {
  const b = mkBridge();
  const w = mkEnv(b, { nd_api_cfg_v1: JSON.stringify({key:"old", base:"b"}),
    nd_api_profiles: JSON.stringify([{name:"a", key:"ka"}, {name:"b", key:""}, {name:"c", key:"kc"}]) });
  assert.strictEqual(w.RP_SECURE.status().migrated, 2);
  assert.ok(w.localStorage._d.nd_api_profiles.indexOf("ka") < 0);
  assert.strictEqual(JSON.parse(w.localStorage.getItem("nd_api_cfg_v1")).key, "old");
  const pr = JSON.parse(w.localStorage.getItem("nd_api_profiles"));
  assert.deepStrictEqual(pr.map(p => p.key), ["ka", "", "kc"]);
  assert.ok(pr.every(p => !("__nd_sec" in p)));
});
t("桥写失败：回退明文，不丢 Key", () => {
  const b = mkBridge(); const w = mkEnv(b);
  b.ndSecretPut = () => false;
  w.localStorage.setItem("nd_api_cfg_v1", JSON.stringify({key:"sk-2"}));
  assert.strictEqual(JSON.parse(w.localStorage.getItem("nd_api_cfg_v1")).key, "sk-2");
});
t("自检失败不启用", () => {
  const w = mkEnv(mkBridge({putFail:true}));
  assert.strictEqual(w.RP_SECURE.enabled(), false);
  assert.strictEqual(mkEnv(mkBridge({unavailable:true})).RP_SECURE.enabled(), false);
});
t("解密失败：Key 读为空串不抛错", () => {
  const w = mkEnv(mkBridge({getBroken:true}));
  w.localStorage.setItem("nd_api_cfg_v1", JSON.stringify({key:"sk-3", base:"b"}));
  const o = JSON.parse(w.localStorage.getItem("nd_api_cfg_v1"));
  assert.strictEqual(o.key, ""); assert.strictEqual(o.base, "b");
});
t("removeItem / clear 同步清原生密文；非受保护项与 sessionStorage 不受影响", () => {
  const b = mkBridge(); const w = mkEnv(b);
  w.localStorage.setItem("nd_api_cfg_v1", JSON.stringify({key:"k"}));
  w.localStorage.setItem("nd_other", JSON.stringify({key:"plain"}));
  assert.strictEqual(w.localStorage._d.nd_other, JSON.stringify({key:"plain"}));
  w.sessionStorage.setItem("nd_api_cfg_v1", JSON.stringify({key:"s"}));
  assert.strictEqual(JSON.parse(w.sessionStorage._d.nd_api_cfg_v1).key, "s");
  w.localStorage.removeItem("nd_api_cfg_v1");
  assert.ok(!("nd_api_cfg_v1__key" in b.store));
  w.localStorage.setItem("nd_distill_llm", JSON.stringify({key:"d"}));
  w.localStorage.clear();
  assert.deepStrictEqual(Object.keys(b.store), []);
});
t("清空 Key 时删除原生密文", () => {
  const b = mkBridge(); const w = mkEnv(b);
  w.localStorage.setItem("nd_api_cfg_v1", JSON.stringify({key:"k"}));
  w.localStorage.setItem("nd_api_cfg_v1", JSON.stringify({key:"", base:"b"}));
  assert.ok(!("nd_api_cfg_v1__key" in b.store));
  assert.strictEqual(JSON.parse(w.localStorage.getItem("nd_api_cfg_v1")).key, "");
});
console.log(`\n${pass} passed`);
