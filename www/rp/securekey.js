/* v41 API Key 安全存储（可选路径）/ optional secure storage for API keys
 *
 * 真机（Android 壳带 ndSecret* 桥）且自检通过时：
 *   受保护的 localStorage 项（nd_api_cfg_v1 / nd_distill_llm 的 .key，nd_api_profiles[i].key）
 *   写入时把 Key 剥出来交给原生 Android Keystore（AES-256-GCM）加密保存，localStorage 里只留空串 + 标记；
 *   读出时再把 Key 注回去。拦截点在 Storage.prototype，所以所有直接读 localStorage 的模块
 *   （app.js getCfg、distill_llm、soul_config、soul_runtime…）无需改动。
 * 其它环境（浏览器预览、单测 vm、旧版壳、Keystore 不可用）：完全不生效，行为与旧版一致（明文 localStorage）。
 * 任一步失败都回退明文写入，绝不丢 Key。
 * 必须在任何读取 API 配置的脚本之前加载（index.html <head>）。 */
(function(root){
  "use strict";
  var SENT = "\u0000ND_IO_ERROR";
  var MARK = "__nd_sec";
  /* 受保护项：obj = 顶层对象的 .key；arr = 数组每个元素的 .key */
  var PROTECTED = { "nd_api_cfg_v1": "obj", "nd_distill_llm": "obj", "nd_api_profiles": "arr" };
  var state = { enabled: false, reason: "init", migrated: 0 };
  var api = {
    PROTECTED: PROTECTED,
    enabled: function(){ return state.enabled; },
    status: function(){ return { enabled: state.enabled, reason: state.reason, migrated: state.migrated }; }
  };
  root.RP_SECURE = api;
  if(typeof module !== "undefined" && module.exports) module.exports = api;

  var A = root.Android;
  var hasBridge = !!(A && typeof A.ndSecretPut === "function" && typeof A.ndSecretGet === "function"
    && typeof A.ndSecretDel === "function");
  var SP = (typeof root.Storage === "function" && root.Storage.prototype) || null;
  var LS = null;
  try{ LS = root.localStorage || null; }catch(e){ LS = null; }
  if(!hasBridge){ state.reason = "no-bridge"; return; }
  if(!SP || !LS){ state.reason = "no-storage"; return; }

  function secName(k){ return k.replace(/[^A-Za-z0-9_.-]/g, "_") + "__key"; }
  function sPut(n, v){ try{ return A.ndSecretPut(n, v) === true; }catch(e){ return false; } }
  function sGet(n){ try{ var v = A.ndSecretGet(n); return v === undefined ? null : v; }catch(e){ return SENT; } }
  function sDel(n){ try{ return A.ndSecretDel(n) === true; }catch(e){ return false; } }

  /* 自检：写读删一次随机值，任何异常都不启用 */
  try{
    if(typeof A.ndSecretAvailable === "function" && A.ndSecretAvailable() !== true){ state.reason = "keystore-unavailable"; return; }
    var probe = "p" + Math.random().toString(36).slice(2) + Date.now();
    if(!sPut("nd_selftest", probe) || sGet("nd_selftest") !== probe){ state.reason = "selftest-failed"; return; }
    sDel("nd_selftest");
  }catch(e){ state.reason = "selftest-error"; return; }

  /* 写入：剥 Key → 原生加密；失败返回原文（明文回退） */
  function strip(k, raw){
    var kind = PROTECTED[k], o;
    try{ o = JSON.parse(raw); }catch(e){ return raw; }
    if(kind === "obj"){
      if(!o || typeof o !== "object" || Array.isArray(o)) return raw;
      var key = typeof o.key === "string" ? o.key : "";
      if(!key){ delete o[MARK]; sDel(secName(k)); return JSON.stringify(o); }
      if(!sPut(secName(k), key)) return raw;
      o.key = ""; o[MARK] = 1;
      return JSON.stringify(o);
    }
    if(kind === "arr"){
      if(!Array.isArray(o)) return raw;
      var keys = o.map(function(p){ return (p && typeof p === "object" && typeof p.key === "string") ? p.key : ""; });
      if(!keys.some(Boolean)){ o.forEach(function(p){ if(p && typeof p === "object") delete p[MARK]; }); sDel(secName(k)); return JSON.stringify(o); }
      if(!sPut(secName(k), JSON.stringify(keys))) return raw;
      o.forEach(function(p, i){ if(p && typeof p === "object" && keys[i]){ p.key = ""; p[MARK] = 1; } });
      return JSON.stringify(o);
    }
    return raw;
  }
  /* 读出：把 Key 注回去，并去掉标记；解密失败时 Key 为空串（用户需重填），不抛错 */
  function inject(k, raw){
    if(raw == null || raw.indexOf(MARK) < 0) return raw;
    var kind = PROTECTED[k], o;
    try{ o = JSON.parse(raw); }catch(e){ return raw; }
    var sec = sGet(secName(k));
    if(sec === SENT) sec = null;
    if(kind === "obj" && o && typeof o === "object" && !Array.isArray(o)){
      if(o[MARK]){ o.key = sec || ""; delete o[MARK]; }
      return JSON.stringify(o);
    }
    if(kind === "arr" && Array.isArray(o)){
      var keys = [];
      try{ keys = sec ? JSON.parse(sec) : []; }catch(e){ keys = []; }
      o.forEach(function(p, i){ if(p && typeof p === "object" && p[MARK]){ p.key = (keys && keys[i]) || ""; delete p[MARK]; } });
      return JSON.stringify(o);
    }
    return raw;
  }

  var oGet = SP.getItem, oSet = SP.setItem, oRem = SP.removeItem, oClr = SP.clear;
  function isLS(s){ return s === LS; }
  SP.getItem = function(k){
    var v = oGet.apply(this, arguments);
    if(isLS(this) && Object.prototype.hasOwnProperty.call(PROTECTED, k)){
      try{ return inject(String(k), v); }catch(e){ return v; }
    }
    return v;
  };
  SP.setItem = function(k, v){
    if(isLS(this) && Object.prototype.hasOwnProperty.call(PROTECTED, k)){
      var s = String(v);
      try{ s = strip(String(k), s); }catch(e){}
      return oSet.call(this, k, s);
    }
    return oSet.apply(this, arguments);
  };
  SP.removeItem = function(k){
    if(isLS(this) && Object.prototype.hasOwnProperty.call(PROTECTED, k)) sDel(secName(String(k)));
    return oRem.apply(this, arguments);
  };
  SP.clear = function(){
    if(isLS(this)){ try{ if(typeof A.ndSecretClear === "function") A.ndSecretClear(); }catch(e){} }
    return oClr.apply(this, arguments);
  };
  state.enabled = true; state.reason = "ok";

  /* 迁移：已有的明文 Key 立刻搬进 Keystore */
  Object.keys(PROTECTED).forEach(function(k){
    try{
      var raw = oGet.call(LS, k);
      if(raw == null || raw.indexOf(MARK) >= 0) return;
      var out = strip(k, raw);
      if(out !== raw && out.indexOf(MARK) >= 0){ oSet.call(LS, k, out); state.migrated++; }
    }catch(e){}
  });
})(typeof window !== "undefined" ? window : globalThis);
