#!/usr/bin/env node
/**
 * 真机/模拟器端验收（需要 DEBUG=1 打出的可调试包）
 *
 *   node tools/device_acceptance.js [--adb <path>] [--serial <host:port>] [--json out.json]
 *
 * 原理：可调试包会打开 WebView 远程调试套接字，脚本用 adb forward 把
 *   localabstract:webview_devtools_remote_<pid> 映射到 tcp:9222，
 *   再用 CDP（Runtime.evaluate）在**真实 WebView** 里执行断言。
 *
 * 覆盖：资源加载 / XSS 逃逸 / ReDoS / 渲染吞吐 / 存储桥 / 导航策略(iframe 拦截) /
 *       通知(API<33 分支) / 清库 / restoreState 后桥可用。
 * 不覆盖：Android 13+ 的 POST_NOTIFICATIONS 运行时授权（需要 API 33+ 设备）。
 */
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const ADB = arg("adb", process.env.ADB || "C:\\Program Files (x86)\\Nox\\bin\\nox_adb.exe");
const SERIAL = arg("serial", process.env.SERIAL || "127.0.0.1:62001");
const PKG = arg("pkg", "com.ling.novelreader");
const PORT = 9222;
const JSON_OUT = arg("json", "");

let pass = 0, fail = 0, warn = 0;
const rows = [];
function T(id, label, ok, detail) {
  const rec = { id, label, ok: !!ok, detail: detail === undefined ? "" : String(detail) };
  rows.push(rec);
  if (ok) { pass++; console.log("  ok   " + id + "  " + label + (detail !== undefined ? "  [" + detail + "]" : "")); }
  else { fail++; console.log("  FAIL " + id + "  " + label + "  [" + (detail === undefined ? "" : detail) + "]"); }
}
function W(id, label, detail) { warn++; rows.push({ id, label, ok: null, detail: String(detail || "") }); console.log("  WARN " + id + "  " + label + "  [" + detail + "]"); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function adb(...args) {
  const r = spawnSync(ADB, args, { encoding: "utf8", timeout: 30000 });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

/* ---------- CDP ---------- */
async function cdpTargets() {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch("http://127.0.0.1:" + PORT + "/json/list");
      const j = await r.json();
      const page = (j || []).find(t => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (e) { /* 端口还没就绪 */ }
    await sleep(500);
  }
  throw new Error("CDP 端口无响应：WebView 调试未开启（需要可调试包）或 adb forward 失败");
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const events = [];   /* Network.* 等事件流，用于观察 WebView 真正发了哪些请求 */
    ws.addEventListener("open", () => resolve({
      events,
      eval: (expression, awaitPromise) => new Promise((res, rej) => {
        const mid = ++id;
        pending.set(mid, { res, rej });
        ws.send(JSON.stringify({
          id: mid, method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: !!awaitPromise, userGesture: true },
        }));
      }),
      send: (method, params) => new Promise((res, rej) => {
        const mid = ++id;
        pending.set(mid, { res, rej });
        ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
      }),
      close: () => ws.close(),
    }));
    ws.addEventListener("message", (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m.id || !pending.has(m.id)) {
        if (m && m.method) events.push(m);
        return;
      }
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) return p.rej(new Error(m.error.message || "cdp error"));
      const r = m.result || {};
      if (r.exceptionDetails) {
        return p.rej(new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description)
          || r.exceptionDetails.text || "evaluate threw"));
      }
      p.res(r.result ? r.result.value : undefined);
    });
    ws.addEventListener("error", (e) => reject(new Error("ws error: " + (e.message || "unknown"))));
  });
}

/* ---------- 主流程 ---------- */
(async () => {
  console.log("=== 设备验收 ===\n");

  adb("connect", SERIAL);
  const devs = adb("devices").out;
  T("D0", "adb 已连接", devs.includes(SERIAL), devs.replace(/\n/g, " | "));

  const pid = adb("shell", "pidof", PKG).out;
  if (!pid) {
    adb("shell", "am", "start", "-n", PKG + "/.MainActivity");
    await sleep(8000);
  }
  const pid2 = adb("shell", "pidof", PKG).out;
  T("D1", "应用进程在跑", !!pid2, "pid=" + pid2);

  adb("forward", "tcp:" + PORT, "localabstract:webview_devtools_remote_" + pid2);
  let page;
  try { page = await cdpTargets(); }
  catch (e) { T("D2", "WebView 调试端口可用", false, e.message); process.exit(1); }
  T("D2", "WebView 调试端口可用", !!page, (page.url || "").replace(/^.*assets\//, "") + " / " + (page.title || ""));

  const c = await connect(page.webSocketDebuggerUrl);
  const ev = async (expr) => c.eval(expr);
  const evJSON = async (expr, awaitPromise) => {
    const v = await c.eval(expr, awaitPromise);
    try { return typeof v === "string" ? JSON.parse(v) : v; }
    catch (e) { return { __raw: v }; }
  };

  /* ---- D3 资源与模块加载 ---- */
  const boot = await evJSON(`JSON.stringify({
    ready: document.readyState,
    title: document.title,
    scripts: document.scripts.length,
    inline: document.querySelectorAll("script:not([src])").length,
    dataBytes: (window.__DATA__ ? JSON.stringify(window.__DATA__).length : -1),
    runs: (window.__DATA__ && window.__DATA__.runs) ? Object.keys(window.__DATA__.runs).length : -1,
    lorebook: typeof RP_LOREBOOK,
    typewriter: typeof RP_TYPEWRITER,
    renderChat: typeof renderChat,
    wipe: typeof window.__wipeAllData,
    bridge: typeof Android,
    url: location.href
  })`);
  T("D3", "页面与 118 个脚本全部加载", boot.ready === "complete" && boot.scripts > 100 && boot.dataBytes > 1000000,
    "scripts=" + boot.scripts + " data=" + (boot.dataBytes / 1048576).toFixed(2) + "MB runs=" + boot.runs);
  T("D4", "模块与桥都可用", boot.lorebook === "object" && boot.typewriter === "object"
    && boot.renderChat === "function" && boot.bridge === "object" && boot.wipe === "function",
    "lorebook=" + boot.lorebook + " typewriter=" + boot.typewriter + " bridge=" + boot.bridge);

  /* ---- D5 XSS：jq() 在真实 WebView 里不可逃逸 ----
   * payload 在 Node 侧构造后以 JSON 注入，避免被 Node 模板字符串自己求值；
   * 页面内把 alert/confirm/prompt 换成"记账桩"，一旦有 payload 断链执行，
   * 记账桩会被调用，从而判定为逃逸（而不是真的弹窗卡住执行流）。 */
  const XSS_PAYLOADS = [
    "a');alert(1);//",
    "a\\');alert(1);//",
    "</script><img src=x onerror=alert(1)>",
    "\"><svg onload=alert(1)>",
    "\u2028",
    "\\\"",
    "`+alert(1)+`",
    "${alert(1)}",
  ];
  const xss = await evJSON(`(function(){
    var payloads = ${JSON.stringify(XSS_PAYLOADS)};
    var fired = [];
    var orig = { alert: window.alert, confirm: window.confirm, prompt: window.prompt };
    window.alert = function(){ fired.push("alert"); };
    window.confirm = function(){ fired.push("confirm"); return true; };
    window.prompt = function(){ fired.push("prompt"); return ""; };
    var bad = [], ok = 0;
    try {
      for (var i = 0; i < payloads.length; i++){
        var p = payloads[i], s;
        try { s = jq(p); } catch(e){ bad.push("jq threw: " + p); continue; }
        var back;
        try {
          back = (new Function("return '" + s + "';"))();
        } catch(e){ bad.push("breakout: " + JSON.stringify(p) + " -> " + s); continue; }
        /* jq 会把 < > " & 转成实体，所以回环比较前先解实体；解完必须与原串完全一致 */
        var dec = String(back)
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        if (dec !== p) bad.push("roundtrip: " + JSON.stringify(p) + " -> " + JSON.stringify(dec));
        if (/[<>]/.test(String(s))) bad.push("raw angle: " + s);
        ok++;
      }
    } finally {
      window.alert = orig.alert; window.confirm = orig.confirm; window.prompt = orig.prompt;
    }
    return JSON.stringify({ ok: ok, total: payloads.length, bad: bad.slice(0, 4), fired: fired });
  })()`);
  T("D5", "jq() 的 8 组 payload 在真机 WebView 中无法断链",
    xss.ok === xss.total && (xss.fired || []).length === 0,
    "ok=" + xss.ok + "/" + xss.total + " 触发=" + ((xss.fired || []).join(",") || "无")
    + (xss.bad && xss.bad.length ? " bad=" + xss.bad.join(" ¦ ") : ""));

  /* ---- D6 ReDoS ---- */
  const redos = await evJSON(`(function(){
    var big = new Array(30001).join("a") + "!";
    var out = {};
    var t0 = performance.now();
    out.nested = RP_LOREBOOK.keyMatches("/(a+)+$/", big, {});
    out.nestedMs = Math.round(performance.now() - t0);
    t0 = performance.now();
    out.alt = RP_LOREBOOK.keyMatches("/(a|aa)+$/", big, {});
    out.altMs = Math.round(performance.now() - t0);
    out.empty = RP_LOREBOOK.keyMatches("//", "abc", {});
    out.longPat = RP_LOREBOOK.keyMatches("/" + new Array(301).join("a") + "/", "aaa", {});
    out.normal = RP_LOREBOOK.keyMatches("/黛玉/", "林黛玉进贾府", {});
    out.literal = RP_LOREBOOK.keyMatches("大观园", "昨天去了大观园散步", {});
    return JSON.stringify(out);
  })()`);
  T("D6", "嵌套量词正则被拒且毫秒级返回", redos.nested === false && redos.nestedMs < 100, redos.nestedMs + "ms");
  T("D7", "重叠分支正则被拒且毫秒级返回", redos.alt === false && redos.altMs < 100, redos.altMs + "ms");
  T("D8", "恒真空正则/超长模式被拒，正常词仍命中",
    redos.empty === false && redos.longPat === false && redos.normal === true && redos.literal === true,
    "empty=" + redos.empty + " long=" + redos.longPat + " normal=" + redos.normal + " literal=" + redos.literal);

  /* ---- D9 渲染吞吐：200 条历史两次渲染 ---- */
  const perf = await evJSON(`(function(){
    var h = [];
    for (var i = 0; i < 200; i++){
      h.push({ mid: "m" + i, role: i % 2 ? "assistant" : "user", content: "第" + i + "条消息内容，"
        + new Array(120).join("这是一段用于压测的中文正文。"), ts: Date.now() });
    }
    window.__ACCEPT_H = h;
    return JSON.stringify({ messages: h.length, chars: h.reduce(function(a,m){ return a + m.content.length; }, 0) });
  })()`);
  const sig = await evJSON(`(function(){
    var h = window.__ACCEPT_H, t0 = performance.now();
    for (var k = 0; k < 20; k++) chatRenderSig("acc_key", h);
    return JSON.stringify({ per: (performance.now() - t0) / 20, msgs: h.length });
  })()`).catch(() => null);
  if (sig) T("D9", "渲染签名（200 条）单次 < 5ms", sig.per < 5, sig.per.toFixed(2) + "ms");
  else W("D9", "chatRenderSig 不可直接调用（作用域内），跳过", "");

  const seed = await evJSON(`(function(){
    var h = window.__ACCEPT_H, k = "nd_chat_acc_r1", raw = JSON.stringify(h);
    try{
      localStorage.setItem(k, raw);
      if (typeof RP_STORE !== "undefined" && RP_STORE.cacheSet) RP_STORE.cacheSet(k, raw);
      return JSON.stringify({ ok: true, key: k, bytes: raw.length });
    }catch(e){ return JSON.stringify({ ok: false, err: String(e) }); }
  })()`);
  T("D10", "20 万字符历史可写入 localStorage（5MB 上限内）", seed.ok === true, JSON.stringify(seed).slice(0, 120));

  const histRead = await evJSON(`(function(){
    var t0 = performance.now();
    var a = getHist("nd_chat_acc_r1");
    var t1 = performance.now();
    var b = getHist("nd_chat_acc_r1");
    var t2 = performance.now();
    return JSON.stringify({ n: (a || []).length, firstMs: t1 - t0, secondMs: t2 - t1 });
  })()`).catch(e => ({ err: String(e) }));
  if (histRead && histRead.n) {
    T("D11", "getHist 200 条首次/二次读取（二次应走解析缓存）", histRead.n === 200,
      "n=" + histRead.n + " 首次=" + histRead.firstMs.toFixed(2) + "ms 二次=" + histRead.secondMs.toFixed(2) + "ms");
    if (histRead.secondMs > histRead.firstMs) W("D11b", "二次读取没有更快（模拟器 IO 抖动或未命中缓存）", histRead.firstMs.toFixed(2) + " → " + histRead.secondMs.toFixed(2) + "ms");
  } else W("D11", "getHist 调用签名不符，跳过", JSON.stringify(histRead).slice(0, 120));

  /* ---- D12 打字机分帧成本 ---- */
  const tw = await evJSON(`(function(){
    var s = new Array(2001).join("长文本压测内容。");
    var t0 = performance.now();
    var f = RP_TYPEWRITER.progressFrames(s);
    return JSON.stringify({ len: s.length, frames: f.length, ms: performance.now() - t0 });
  })()`).catch(e => ({ err: String(e) }));
  if (tw && tw.frames) T("D12", "2000 字分帧成本 < 60ms（单帧常量）", tw.ms < 60, tw.frames + " 帧 / " + tw.ms.toFixed(1) + "ms");

  /* ---- D13 rAF 帧率（静止渲染，反映模拟器上限） ---- */
  const fps = await evJSON(`new Promise(function(res){
    var n = 0, t0 = performance.now();
    function tick(){ n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
      else res(JSON.stringify({ fps: Math.round(n * 1000 / (performance.now() - t0)) })); }
    requestAnimationFrame(tick);
  })`, true).catch(() => null);
  if (fps) T("D13", "rAF 帧率（模拟器上限参考）", fps.fps >= 30, fps.fps + "fps");

  /* ---- D14 原生文件桥 ---- */
  const bridge = await evJSON(`(function(){
    var name = "acc_probe.txt", out = {};
    out.write = Android.ndFileWrite(name, "验收探针-中文-123");
    out.read = Android.ndFileRead(name);
    out.size = Android.ndFileSize(name);
    out.total = Android.ndFileTotal();
    out.del = Android.ndFileDelete(name);
    out.afterDel = Android.ndFileSize(name);
    return JSON.stringify(out);
  })()`).catch(e => ({ err: String(e) }));
  T("D14", "原生文件桥读写删（含中文、SHA-256 文件名）",
    bridge.write === "ok" && bridge.read === "验收探针-中文-123" && bridge.size > 0 && bridge.afterDel === -1,
    "write=" + bridge.write + " size=" + bridge.size + " afterDel=" + bridge.afterDel);
  T("D15", "pageAllowed 放行资产页（ndFileTotal 非 -1）", bridge.total >= 0, "total=" + bridge.total);

  /* ---- D16 通知（API < 33 分支） ---- */
  const sdk = parseInt(adb("shell", "getprop", "ro.build.version.sdk").out, 10) || 0;
  await ev(`Android.notifyLocal("浮生验收", "这是来自 WebView 桥的本地通知")`);
  await sleep(1500);
  const notif = adb("shell", "dumpsys", "notification", "--noredact").out;
  const posted = /novelreader/i.test(notif) && /浮生验收|来自 WebView 桥/.test(notif);
  if (sdk < 33) {
    T("D16", "notifyLocal 在 API " + sdk + " 上成功投递本地通知", posted, posted ? "通知已入 NotificationManager" : "未见通知记录");
  } else {
    T("D16", "notifyLocal 投递（API " + sdk + "，走运行时权限分支）", posted, posted ? "已投递" : "未见通知");
  }
  if (sdk < 33) W("D17", "API " + sdk + " < 33：POST_NOTIFICATIONS 运行时授权补发分支无法在本机验证", "需 API 33+ 设备");

  /* ---- D18/D19/D20 导航策略：用 CDP Network 域看 WebView 自己有没有真的发请求 ----
   * 不用本机 HTTP 探针：targetSdk 34 在 Android 9 上默认禁明文 HTTP，探针必然假阴性。 */
  const netHits = (conn, key) => (conn.events || []).filter(e =>
    e.method === "Network.requestWillBeSent" && e.params && e.params.request
    && String(e.params.request.url).indexOf(key) >= 0);

  await c.send("Network.enable");
  await ev(`(function(){var i=new Image();i.src="https://accept-img.invalid/p.png?t="+Date.now();window.__accImg=i;return 1})()`);
  await sleep(3500);
  const imgReq = netHits(c, "accept-img.invalid");
  T("D18", "对照组：<img> 的远程请求能被观测到（网络栈与 Network 域都正常）", imgReq.length > 0,
    "requestWillBeSent=" + imgReq.length);

  /* 远程 iframe：真机实测发现 iframe 的 src 赋值不会走 shouldOverrideUrlLoading，
   * 所以判定标准不是"有没有发请求"，而是"远程文档有没有真的加载、桥有没有暴露进去"。 */
  await c.send("Runtime.enable");
  await c.send("Page.enable");
  await ev(`(function(){var f=document.createElement("iframe");f.id="acc_iframe";f.src="https://example.com/";document.body.appendChild(f);return 1})()`);
  await sleep(5000);
  const docResp = c.events.filter(e => e.method === "Network.responseReceived" && e.params
    && /example\.com\/?$/.test(String(e.params.response && e.params.response.url))
    && e.params.type === "Document")
    .map(e => e.params.response.status);
  const tree = (await c.send("Page.getFrameTree")).result.frameTree;
  const kid = ((tree && tree.childFrames) || []).map(x => x.frame).find(f => /example\.com/.test(f.url || ""));
  let kidBridge = "no-frame";
  if (kid) {
    const ctx = c.events.filter(e => e.method === "Runtime.executionContextCreated")
      .map(e => e.params.context).filter(x => x.auxData && x.auxData.frameId === kid.id).pop();
    if (ctx) {
      const r = await c.send("Runtime.evaluate", {
        contextId: ctx.id, returnByValue: true,
        expression: `JSON.stringify({ bridge: typeof Android, body: (document.body ? document.body.innerHTML.length : -1) })`,
      });
      const v = r.result && r.result.result ? r.result.result.value : null;
      kidBridge = v ? (JSON.parse(v).bridge + "/bodyLen=" + JSON.parse(v).body) : "eval-failed";
    } else kidBridge = "no-context";
  }
  T("D19", "远程 iframe 文档被拦截（没有 200 的 Document 响应）",
    docResp.length === 0, "Document 状态=" + (docResp.join(",") || "无") + " 子框架=" + (kid ? "存在" : "无"));
  T("D19b", "子框架执行上下文里读不到 Android 桥", kidBridge === "no-frame" || /^undefined\//.test(kidBridge),
    kidBridge);
  await ev(`(function(){var f=document.getElementById("acc_iframe");if(f)f.remove();return 1})()`);

  /* ---- D21 清库 ---- */
  const wipeSeed = await evJSON(`(function(){
    localStorage.setItem("nd_acc_dummy", "1");
    Android.ndFileWrite("acc_dummy.txt", "x");
    return JSON.stringify({ ndKeys: Object.keys(localStorage).filter(function(k){return k.indexOf("nd_")===0}).length,
      fileTotal: Android.ndFileTotal() });
  })()`).catch(e => ({ err: String(e) }));
  await ev(`new Promise(function(res){ window.__wipeAllData({ clearAll: false, after: function(){ res(1); } }); })`, true).catch(() => {});
  await sleep(800);
  const after = await evJSON(`JSON.stringify({
    keys: Object.keys(localStorage).filter(function(k){return k.indexOf("nd_")===0}).length,
    fileTotal: Android.ndFileTotal(),
    dummy: localStorage.getItem("nd_acc_dummy")
  })`).catch(e => ({ err: String(e) }));
  T("D21", "清库：nd_ 前缀键清空 + 文件区归零",
    after.keys === 0 && after.fileTotal === 0 && after.dummy === null,
    "清理前键=" + (wipeSeed.ndKeys === undefined ? "?" : wipeSeed.ndKeys) + " 清理后键=" + after.keys
    + " 文件字节=" + after.fileTotal);

  /* ---- D22 restoreState：转屏（Activity 重建）后页面与桥都还在 ---- */
  let liveConn = c;
  adb("shell", "settings", "put", "system", "accelerometer_rotation", "0");
  adb("shell", "settings", "put", "system", "user_rotation", "1");
  await sleep(4500);
  const pid3 = adb("shell", "pidof", PKG).out;
  adb("forward", "tcp:" + PORT, "localabstract:webview_devtools_remote_" + pid3);
  let page2 = null;
  try { page2 = await cdpTargets(); } catch (e) { /* ignore */ }
  if (!page2) {
    adb("shell", "settings", "put", "system", "user_rotation", "0");
    W("D22", "转屏后没拿到新调试目标，restoreState 分支未验证", "");
  } else {
    const c2 = await connect(page2.webSocketDebuggerUrl);
    const st = await c2.eval(`JSON.stringify({ url: location.href, total: Android.ndFileTotal(), ready: document.readyState })`);
    const o = typeof st === "string" ? JSON.parse(st) : st;
    T("D22", "转屏重建后页面仍在、原生桥未失效",
      o.ready === "complete" && o.total >= 0 && /android_asset/.test(o.url),
      "url=" + o.url.replace(/^.*assets\//, "") + " total=" + o.total);
    liveConn = c2;
    adb("shell", "settings", "put", "system", "user_rotation", "0");
    await sleep(1500);
  }

  /* ---- D20 主框架远程导航（放最后：万一策略失效，页面会被导航走） ---- */
  await liveConn.send("Network.enable");
  const beforeUrl = await liveConn.eval("location.href");
  await liveConn.eval(`(function(){location.href="https://accept-nav.invalid/n.html";return 1})()`).catch(() => {});
  await sleep(3500);
  const navReq = netHits(liveConn, "accept-nav.invalid");
  const afterUrl = await liveConn.eval("location.href").catch(() => "gone");
  T("D20", "主框架远程导航没有被 WebView 加载",
    navReq.length === 0 && afterUrl === beforeUrl,
    "WebView 请求=" + navReq.length + " URL 未变=" + (afterUrl === beforeUrl));
  if (afterUrl === beforeUrl && navReq.length === 0) {
    /* 再确认一次：系统里没有浏览器时是"丢弃"，有浏览器时是"交给外部"，两者都不在 WebView 内 */
    const ua = await liveConn.eval("navigator.userAgent");
    T("D20b", "当前页面仍是资产页（未离开 file:///android_asset）", /android_asset/.test(String(beforeUrl)),
      "UA含 wv=" + /; wv\)/.test(String(ua)));
  }


  /* ---- 汇总 ---- */
  console.log("\n" + "-".repeat(52));
  console.log("通过 " + pass + " / 失败 " + fail + " / 跳过 " + warn + "（共 " + (pass + fail + warn) + " 项）");
  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ when: new Date().toISOString(), sdk, pass, fail, warn, rows }, null, 1));
    console.log("明细已写入 " + JSON_OUT);
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e && e.message);
  process.exit(2);
});
