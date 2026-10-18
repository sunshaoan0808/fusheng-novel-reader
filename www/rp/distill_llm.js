/* App 端蒸馏 LLM 直连客户端 (2026-10-07)。
 * 不走服务器, App 直接调在线 LLM 网关 (OpenAI 兼容接口)。
 * API Key 由用户在设置页填写, 存 localStorage (nd_llm_key)。
 */
var DISTILL_LLM = (function(){
"use strict";

function cfg(){
  /* v37 安全: 不再内置任何第三方默认网关。旧版本默认 baseUrl 指向第三方域名，
   * 且会继承主配置的 Key（用户主配置 base 为空时，Key 会被发往该域名）。
   * 现在 baseUrl 必须由用户显式配置，缺失时调用侧直接报错，绝不静默外发 Key。 */
  var c = {baseUrl: "", key: "", model: ""};
  var s = {};
  try{
    s = JSON.parse(localStorage.getItem("nd_distill_llm") || "{}");
    if(s.baseUrl) c.baseUrl = s.baseUrl;
    if(s.key) c.key = s.key;
    if(s.model) c.model = s.model;
  }catch(e){}
  /* 复用主设置页已配置的 LLM（用户投诉：蒸馏不应再填一遍 Key）。
     优先级：蒸馏独立配置 > 主设置 nd_api_cfg_v1。
     注意：只继承 main.base 时才算同一端点；main.base 为空则不继承 baseUrl。 */
  if(!c.key){
    try{
      var main = JSON.parse(localStorage.getItem("nd_api_cfg_v1") || "{}");
      if(main.key){ c.key = main.key; c._fromMain = true; }
      if(!s.baseUrl && main.base) c.baseUrl = main.base;
      if(!s.model && main.model) c.model = main.model;
    }catch(e){}
  }
  return c;
}

function saveCfg(c){
  localStorage.setItem("nd_distill_llm", JSON.stringify(c));
}

// 调用统计
var _stats = {calls: 0, errors: 0, totalMs: 0, startTime: 0};
function getStats(){
  return {calls: _stats.calls, errors: _stats.errors, totalMs: _stats.totalMs};
}
function resetStats(){
  _stats.calls = 0; _stats.errors = 0; _stats.totalMs = 0; _stats.startTime = 0;
}
function fmtStats(){
  var s = (_stats.totalMs / 1000).toFixed(0);
  return "调用 " + _stats.calls + " 次" + (_stats.errors ? " (失败 " + _stats.errors + ")" : "") + " · 耗时 " + s + "s";
}

/* 错误分流: 4xx（除 429）是参数/鉴权问题, 重试 3 次只是让用户多等 6 秒;
 * 5xx、429、网络中断、超时才算可重试。 */
function mkHttpError(status){
  var hint = status === 401 ? " 未授权(Key 无效)"
    : status === 403 ? " 无权限"
    : status === 404 ? " 接口不存在"
    : status === 429 ? " 请求过于频繁"
    : "";
  var e = new Error("HTTP " + status + hint);
  e.status = status;
  e.retryable = (status === 429 || status >= 500);
  return e;
}

async function chat(messages, opts){
  opts = opts || {};
  var c = cfg();
  if(!c.key) throw new Error("未配置 LLM API Key, 请到设置页填写");
  if(!c.baseUrl) throw new Error("未配置蒸馏 LLM 接口地址, 请到设置页填写（出于安全考虑不再使用任何内置默认地址）");
  _stats.calls++;
  var t0 = Date.now();
  var model = opts.model || c.model;
  if(!model) throw new Error("未指定蒸馏模型, 请到设置页填写");
  var url = c.baseUrl.replace(/\/$/, "") + "/chat/completions";
  // 60s 对"6000 字正文 + 8 字段输出"在慢模型/慢网下并不宽裕, 默认放宽到 120s
  var timeoutMs = opts.timeoutMs || 120000;
  var lastErr = null;
  /* v37: 去掉硬编码的第三方 fallback 模型——它会让用户 Key 被发往非预期模型/渠道。 */
  var models = [model];
  for(var mi = 0; mi < models.length; mi++){
    var fatal = false;
    for(var attempt = 0; attempt < 3; attempt++){
      var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function(){ try{ ctrl.abort(); }catch(_){} }, timeoutMs) : null;
      try{
        // 批量画像一次要产出多个角色的档案，输出会明显变长；不显式给上限时
        // 部分网关按 4096 截断，JSON 会断在半途 → 解析失败 → 回退逐人（很慢）。
        var body = {model: models[mi], messages: messages, temperature: opts.temp || 0.7};
        var maxTok = parseInt(opts.maxTokens, 10);
        if(maxTok > 0) body.max_tokens = maxTok;
        var r = await fetch(url, {
          method: "POST",
          headers: {"Content-Type": "application/json", "Authorization": "Bearer " + c.key},
          body: JSON.stringify(body),
          signal: ctrl ? ctrl.signal : undefined
        });
        if(!r.ok) throw mkHttpError(r.status);
        var d = await r.json();
        var content = (((d.choices || [])[0] || {}).message || {}).content || "";
        if(!content.trim()) throw new Error("空正文");
        _stats.totalMs += Date.now() - t0;
        return {content: content, model: models[mi]};
      }catch(e){
        lastErr = e;
        if(e && e.name === "AbortError"){
          lastErr = new Error("请求超时 (" + Math.round(timeoutMs / 1000) + "s)");
          lastErr.retryable = true;
        }
        // 不可重试的错误直接冒泡, 不要拿 6 秒换同一个 401
        if(lastErr && lastErr.retryable === false){ fatal = true; break; }
        if(attempt < 2) await new Promise(res=>setTimeout(res, 2000 * (attempt + 1)));
      }finally{
        if(timer) clearTimeout(timer);
      }
    }
    if(fatal) break;
  }
  _stats.errors++;
  _stats.totalMs += Date.now() - t0;
  throw lastErr || new Error("LLM 调用失败");
}

return {cfg: cfg, saveCfg: saveCfg, chat: chat, getStats: getStats, resetStats: resetStats, fmtStats: fmtStats};
})();
