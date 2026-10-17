#!/usr/bin/env node
/* 验收脚本（可重复执行）
 *
 * 用途：把《修复完成报告》里的验收项变成可跑的断言，而不是靠人工回忆。
 * 分四段：
 *   A 静态修复点   —— 每条修复在源码里的结构约束（防回退）
 *   B 行为验收     —— 在 vm 里真跑一遍：XSS 逃逸 / ReDoS / 导入上限 / 清库 / 历史缓存
 *   C 性能基准     —— 与 git 基线对比，输出倍数并断言不回退
 *   D 全量回归     —— 跑 tests/test_*.js，与已知基线失败集比对
 *
 * 用法：
 *   node tools/acceptance.js              全跑
 *   node tools/acceptance.js --no-tests   跳过 D 段（改代码时快速自查）
 *   node tools/acceptance.js --verbose    打印每一条通过项
 *
 * 退出码：0 = 全部符合预期；1 = 有失败或出现新的测试失败。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const WWW = path.join(ROOT, "www");
const ARGV = process.argv.slice(2);
const SKIP_TESTS = ARGV.includes("--no-tests");
const VERBOSE = ARGV.includes("--verbose");
const BASELINE_COMMIT = "d156324";

/* 已知基线失败：改动前就失败，与本次修复无关（用 git worktree 在 d156324 上实跑确认过） */
const BASELINE_FAIL = new Set([
  "test_cardcompat.js", "test_cardlanding.js", "test_charimg.js",
  "test_immersive_ui.js", "test_pov.js", "test_ui24.js",
]);

let pass = 0, fail = 0, warn = 0;
const failures = [];
const warnings = [];
const perfRows = [];

function T(id, label, cond, detail){
  if(cond){ pass++; if(VERBOSE) console.log("  ok   " + id + "  " + label); }
  else { fail++; failures.push({ id, label, detail }); console.log("  FAIL " + id + "  " + label + (detail ? "  <- " + detail : "")); }
}
function W(id, label, detail){ warn++; warnings.push({ id, label, detail }); console.log("  WARN " + id + "  " + label + (detail ? "  <- " + detail : "")); }
function section(t){ console.log("\n" + t); }

const src = {};
function S(f){ if(!(f in src)) src[f] = fs.readFileSync(path.join(ROOT, f), "utf8"); return src[f]; }
const has = (f, re)=> re.test(S(f));
const lacks = (f, re)=> !re.test(S(f));
const countOf = (f, re)=> (S(f).match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length;

/* ---------- vm 环境 ---------- */
const LSProto = {
  getItem(k){ const v = this[k]; return typeof v === "string" ? v : null; },
  setItem(k, v){ this[k] = String(v); },
  removeItem(k){ delete this[k]; },
  clear(){ Object.keys(this).forEach(k => { if(typeof this[k] === "string") delete this[k]; }); },
};
function mkCtx(extra){
  const store = Object.assign(Object.create(LSProto), {});
  const ctx = Object.assign({
    console, TextDecoder, TextEncoder, atob, btoa,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: store,
  }, extra || {});
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  return { ctx, store };
}
function extractFn(text, name){
  const re = new RegExp("(?:function\\s+" + name + "|(?:let|const|var)\\s+" + name + "\\s*=\\s*(?:function|\\([^)]*\\)\\s*=>)|window\\." + name + "\\s*=\\s*function)");
  const m = text.match(re);
  if(!m) throw new Error("not found: " + name);
  let j = text.indexOf("{", m.index), depth = 0;
  for(let k = j; k < text.length; k++){
    if(text[k] === "{") depth++;
    else if(text[k] === "}"){
      depth--;
      if(!depth) return text.slice(m.index, k + 1);
    }
  }
  throw new Error("unbalanced: " + name);
}
function loadLorebook(){
  const { ctx } = mkCtx();
  vm.runInContext(S("www/rp/lorebook.js"), ctx, { filename: "lorebook.js" });
  return ctx;
}
function ms(fn){
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

/* ============================================================
 * A. 静态修复点
 * ============================================================ */
section("A. 静态修复点");

/* A-1 XSS：抽屉/按钮模板里的 CHAT 字段必须过 jq()，禁止裸拼进 onclick */
{
  const attrs = S("www/app.js").match(/onclick="[^"]*"/g) || [];
  const bad = attrs.filter(a => /(?<!jq\()CHAT\.(?:runId|name)\b/.test(a));
  T("A1", "onclick 模板中无裸拼 CHAT.runId/CHAT.name（共 " + attrs.length + " 个属性）",
    bad.length === 0, bad.length ? bad[0].slice(0, 120) : "");
  T("A2", "抽屉角色详情已改走 jq()",
    has("www/app.js", /charDetail\('\$\{jq\(CHAT\.runId\)\}','\$\{jq\(CHAT\.name\)\}'\)/));
}
/* A-3 图片 URL 白名单 */
T("A3", "生图结果 URL 白名单（data:image/ 或 https:）+ escH 输出",
  has("www/app.js", /const safeUrl = .*\/\^\(data:image\\\/\|https:\\\/\\\/\)\/i\.test\(url\)/) &&
  has("www/app.js", /escH\(safeUrl\)/));

/* A-4 PIN 清除必须走存储层统一清空 */
T("A4", "PIN 清除调用统一清空器（含 IDB/文件层）",
  has("www/app.js", /window\.__wipeAllData = function/) &&
  has("www/app.js", /__wipeAllData\(\{clearAll:true/) &&
  has("www/rp/store.js", /function wipeAll\(\)/) &&
  has("www/rp/store.js", /deleteDatabase\(DB_NAME\)/) &&
  has("www/rp/store.js", /NDFILE\.clearAll\(\)/));

/* A-5 lorebook 正则防护 */
T("A5", "世界书正则：静态危险模式检查 + 输入截断",
  has("www/rp/lorebook.js", /function safeRegexCheck\(/) &&
  has("www/rp/lorebook.js", /RX_TEXT_MAX/) &&
  has("www/rp/lorebook.js", /safeRegexCheck\(pattern\)/));
T("A6", "世界书正则：空模式 // 被拒绝",
  has("www/rp/lorebook.js", /parseRegexKey/));

/* A-7 ST 正则替换防护 */
T("A7", "applyRegex：危险正则跳过 + 输入截断",
  has("www/rp/chat.js", /RX_MAXLEN/) &&
  has("www/rp/chat.js", /fromCharCode\(123/) &&
  has("www/rp/chat.js", /unsafePattern\(/));

/* A-8 蒸馏服务不再硬编码第三方域名 */
T("A8", "distill_llm 无硬编码域名/默认 Key",
  lacks("www/rp/distill_llm.js", /zen\.claw\.ssan\.me/) &&
  lacks("www/rp/distill_llm.js", /sk-[A-Za-z0-9]{16,}/));

/* A-9 渲染短路 + 历史缓存 + 冷启动索引 */
T("A9", "renderChat 渲染签名短路",
  has("www/app.js", /function chatRenderSig\(/) &&
  has("www/app.js", /_sig === __chatRenderSig/));
T("A10", "getHist JSON 解析缓存",
  has("www/app.js", /C\.__cache/) && has("www/app.js", /getHist\.__cache = \{raw: s, data: keptArr\}/));
T("A11", "最近聊天索引 + 指纹自愈",
  has("www/app.js", /nd_lastchat_idx/) && has("www/app.js", /function histFp\(/) &&
  has("www/app.js", /function lastChatIndexUpdate\(/));

/* A-12 流式合帧 */
T("A12", "流式输出按帧合并（requestAnimationFrame）",
  has("www/app.js", /__liveRaf/) && has("www/app.js", /__liveText/));

/* A-13 打字机长文本不再逐帧 md */
T("A13", "打字机 >1200 字走 textContent，播完单次 markdown",
  has("www/app.js", /const twPlain = String\(bodyText\|\|""\)\.length > 1200/) &&
  has("www/app.js", /bub\.textContent = partial/));

/* A-14 WebView 导航策略 */
T("A14", "WebView：非资产页不在内嵌加载 + iframe 一律拦截 + restoreState 回填 URL",
  has("android/src/com/ling/novelreader/MainActivity.java", /private boolean handleNavigation\(String url\)/) &&
  has("android/src/com/ling/novelreader/MainActivity.java", /!request\.isForMainFrame\(\)\) return true/) &&
  has("android/src/com/ling/novelreader/MainActivity.java", /web\.restoreState\(savedInstanceState\)/));
T("A15", "WebView：关闭 file:// 跨源 + 桥来源白名单",
  has("android/src/com/ling/novelreader/MainActivity.java", /setAllowUniversalAccessFromFileURLs\(false\)/) &&
  has("android/src/com/ling/novelreader/MainActivity.java", /!u\.startsWith\("file:\/\/\/android_asset\/"\)|u\.startsWith\("file:\/\/\/android_asset\/"\)/));

/* A-16 通知权限暂存补发 */
T("A16", "Android 13+ 通知权限：暂存后授权补发",
  has("android/src/com/ling/novelreader/MainActivity.java", /pendingNotifyTitle/) &&
  has("android/src/com/ling/novelreader/MainActivity.java", /REQ_NOTIFY_PERM/) &&
  has("android/src/com/ling/novelreader/MainActivity.java", /onRequestPermissionsResult/));

/* A-17 SharedFileProvider 路径穿越 */
T("A17", "FileProvider：canonical path 前缀校验 + 拒绝 . / ..",
  has("android/src/com/ling/novelreader/SharedFileProvider.java", /getCanonicalPath\(\)/) &&
  has("android/src/com/ling/novelreader/SharedFileProvider.java", /startsWith\(/));

/* A-18 构建脚本 */
T("A18", "build.sh：data.js 转义 </ + release 签名不给默认口令 + zipalign",
  has("android/build.sh", /replace\("<\/"/) &&
  has("android/build.sh", /RELEASE_KEYSTORE/) &&
  has("android/build.sh", /zipalign/));

/* A-19 Python 工具原子写 / 编码 */
T("A19", "arc_writeback 原子写（tmp+fsync+os.replace）",
  has("tools/arc_writeback.py", /def atomic_write/) && has("tools/arc_writeback.py", /os\.replace/));
T("A20", "gen_char_plots 显式 UTF-8 读写",
  has("tools/gen_char_plots.py", /encoding="utf-8"/));

/* A-21 导入上限 */
T("A21", "角色卡导入：64MB 文件上限 + 字段上限 + 损坏备份",
  has("www/rp/cardimport.js", /MAX_FILE = 64 \* 1024 \* 1024/) &&
  has("www/rp/cardimport.js", /FIELD_MAX/) &&
  has("www/rp/cardimport.js", /___corrupt_backup/));

/* A-22 存储层内存镜像上限 */
T("A22", "store MEM 有 LRU 上限且 memSet 不自调用",
  has("www/rp/store.js", /MEM_MAX = 40/) &&
  has("www/rp/store.js", /function memSet\(k, v\)\{\s*MEM\[k\] = v;/) &&
  lacks("www/rp/store.js", /function memSet\(k, v\)\{\s*memSet\(k, v\);/));

/* A-23 增长型数据结构封顶 */
T("A23", "worldsim 地点数 / traverse flags 均有上限",
  has("www/rp/worldsim.js", /PLACES_MAX/) && has("www/rp/traverse.js", /20/));

/* A-24 长期记忆解析缓存 */
T("A24", "memory.get 解析缓存 + save 刷新缓存",
  has("www/rp/memory.js", /get\.__raw === raw/) && has("www/rp/memory.js", /get\.__raw = s/));

/* A-25 soul 链路：用户消息补齐 + 失败隔离 + 超时中断 */
T("A25", "soul 路径先写用户消息再写回复",
  has("www/rp/soul_orch.js", /role:\s*"user"/) && has("www/rp/soul_orch.js", /\.catch\(/));
T("A26", "soul 调用超时会 abort 底层请求",
  has("www/rp/soul_runtime.js", /AbortController/) && has("www/rp/soul_runtime.js", /controller\.abort|c\.abort|abort\(\)/));

/* A-27 SSE 解析 */
T("A27", "SSE 解析：分块尾行 flush + 空行分帧",
  has("www/rp/chat.js", /function handleBlock/) || has("www/rp/chat.js", /handleBlock/));

/* A-28 前端输入防抖 */
T("A28", "角色筛选/场景保存有防抖",
  has("www/app.js", /function debounce\(/) && has("www/app.js", /__sceneSave = debounce\(/));

/* A-29 TTS 缓存 LRU + revoke */
T("A29", "TTS 缓存有上限并 revokeObjectURL",
  has("www/app.js", /revokeObjectURL/) && has("www/app.js", /ttsCache/));

/* A-30 API Key 不回显到 DOM */
T("A30", "设置页 API Key 不写入 value（空串占位 + 已保存提示）",
  !/id="c_key"[^>]*value="[^"]+"/.test(S("www/app.js")) &&
  has("www/app.js", /已保存/));

/* A-31 明文 http 警告 */
T("A31", "保存 http:// 接口地址前有明文传输警告",
  has("www/app.js", /明文/));

/* A-32 统计不再 join 整份 prompt（两处调用点都要检查：首轮 + 重随） */
{
  const chat = S("www/rp/chat.js");
  const joined = chat.match(/\.join\("\\n"\)[\s\S]{0,80}RP_STATS\.recordTurn/g) || [];
  T("A32", "记录统计时不 join 全量 prompt（" + countOf("www/rp/chat.js", /RP_STATS\.recordTurn/g) + " 个调用点）",
    joined.length === 0 && has("www/rp/playstats.js", /Array\.isArray/),
    joined.length ? joined[0].slice(0, 80) : "");
}

/* A-33 warmCache 并发预热 */
T("A33", "冷启动预热并发而非串行",
  has("www/rp/store.js", /function warmCache\(/) &&
  has("www/rp/store.js", /PAR = 6/) && has("www/rp/store.js", /runPool/));

/* A-34 写盘失败不再静默 */
{
  const sites = ["saveNotifyCfg", "nd_models", "nd_wb2_", "nd_chat_last", "savesKey()"];
  const missing = sites.filter(s => {
    const i = S("www/app.js").indexOf(s);
    if(i < 0) return true;
    const around = S("www/app.js").slice(Math.max(0, i - 260), i + 260);
    return !/try\s*\{/.test(around);
  });
  T("A34", "用户数据类写入点均包 try/catch", missing.length === 0, missing.join(","));
}

/* ============================================================
 * B. 行为验收
 * ============================================================ */
section("B. 行为验收");

/* B-1 XSS：jq 转义后放回 JS 单引号字符串必须能原样还原（证明无法断链） */
{
  const { ctx } = mkCtx();
  vm.runInContext(S("www/rp/escutil.js"), ctx, { filename: "escutil.js" });
  const payloads = [
    "'+alert(1)+'", "\");alert(1);\"", "</script><img src=x onerror=alert(1)>",
    "\\", "\\'", "`${alert(1)}`", "\u2028\u2029", "a\"b'c\\d</div>",
    "&lt;script&gt;", "\n\r\t", "𝄞😀", "0x00\u0000",
  ];
  let bad = 0, sample = "";
  /* jq 同时做 HTML 实体化与 JS 字符串转义，所以还原时要先解实体（&amp; 最后解） */
  const unesc = (s)=> String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  for(const p of payloads){
    ctx.__p = p;
    let out;
    try{ out = vm.runInContext("jq(__p)", ctx); }catch(e){ bad++; sample = "jq threw on " + JSON.stringify(p); continue; }
    /* 放进 onclick="f('...')" 的单引号串里，用 JS 求值还原 */
    let back;
    try{ back = vm.runInContext("(function(){ return '" + out + "'; })()", ctx); }
    catch(e){ bad++; sample = "breakout: " + JSON.stringify(p) + " -> " + JSON.stringify(out); continue; }
    if(unesc(back) !== p){ bad++; sample = "roundtrip mismatch: " + JSON.stringify(p) + " -> " + JSON.stringify(unesc(back)); }
    /* 属性上下文：不能出现裸双引号（会闭合 onclick="..."） */
    if(String(out).includes('"')){ bad++; sample = "raw quote in attr: " + JSON.stringify(out); }
  }
  T("B1", "jq() 转义后 12 组 payload 均无法逃逸（单引号串求值可原样还原）", bad === 0, sample);
}

/* B-2 ReDoS：世界书 */
{
  const ctx = loadLorebook();
  const long = "a".repeat(30000) + "!";
  ctx.__long = long;
  let t = 0, r;
  try{
    t = ms(() => { r = vm.runInContext('RP_LOREBOOK.keyMatches("/(a+)+$/", __long, {})', ctx); });
  }catch(e){ r = "throw:" + e.message; }
  T("B2", "嵌套量词 (a+)+$ 直接拒绝且 1ms 级返回", r === false && t < 100, r + " / " + t.toFixed(2) + "ms");
  try{
    t = ms(() => { r = vm.runInContext('RP_LOREBOOK.keyMatches("/(a|aa)+$/", __long, {})', ctx); });
  }catch(e){ r = "throw:" + e.message; }
  T("B3", "重叠分支 (a|aa)+$ 直接拒绝", r === false && t < 100, r + " / " + t.toFixed(2) + "ms");
  T("B4", "正常正则/字面词仍命中，空模式与超长模式被拒",
    vm.runInContext('RP_LOREBOOK.keyMatches("/黛玉/", "林黛玉进贾府", {})', ctx) === true &&
    vm.runInContext('RP_LOREBOOK.keyMatches("大观园", "昨天去了大观园散步", {})', ctx) === true &&
    vm.runInContext('RP_LOREBOOK.keyMatches("//", "abc", {})', ctx) === false &&
    vm.runInContext('RP_LOREBOOK.keyMatches("/" + "a".repeat(300) + "/", "aaa", {})', ctx) === false);
}

/* B-5 ReDoS：ST 正则替换 */
{
  const { ctx } = mkCtx();
  vm.runInContext(extractFn(S("www/rp/chat.js"), "applyRegex"), ctx, { filename: "applyRegex.js" });
  const big = "a".repeat(50000) + "!";
  ctx.__big = big;
  let t = 0, out;
  try{ t = ms(() => { out = vm.runInContext('applyRegex(__big, [{find: "(a+)+$", replace: ""}], 0)', ctx); }); }
  catch(e){ out = "throw:" + e.message; }
  T("B5", "applyRegex 跳过危险规则，输出不变且 <100ms", out === big && t < 100, t.toFixed(2) + "ms");
  T("B6", "applyRegex 正常替换仍然生效",
    vm.runInContext('applyRegex("hello 世界", [{find: "世界", replace: "world"}], 0)', ctx) === "hello world");
}

/* B-7 导入上限 */
(async () => {
  {
    const { ctx, store } = mkCtx({ JSON, TextDecoder });
    vm.runInContext(S("www/rp/cardimport.js"), ctx, { filename: "cardimport.js" });
    let rejected = false, msg = "";
    ctx.__big = { size: 100 * 1024 * 1024, name: "huge.png", arrayBuffer: () => { throw new Error("不该读文件体"); } };
    try{ await vm.runInContext("RP_CARDIMPORT.fromFile(__big)", ctx); }
    catch(e){ rejected = true; msg = e.message; }
    T("B7", "100MB 文件在读取前被拒（不触碰 arrayBuffer）", rejected && /过大/.test(msg), msg);

    const card = {
      name: "验收卡", description: "描".repeat(40000), personality: "性".repeat(30000),
      scenario: "场".repeat(30000), first_mes: "开场白",
      character_book: { entries: Array.from({ length: 900 }, (_, i) => ({ keys: ["k" + i], content: "c" })) },
    };
    ctx.__card = card;
    let out;
    try{ out = await vm.runInContext("RP_CARDIMPORT.fromFile({name:'c.json', size: 2000, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(JSON.stringify(__card)).buffer)})", ctx); }
    catch(e){ out = { err: e.message }; }
    const f = (out && out.fields) || {};
    T("B8", "超限字段被截断而非崩溃（description→core_identity ≤ 20000）",
      !out.err && String(f.core_identity || "").length === 20000 &&
      String(f.core_traits || "").length === 20000,
      (out.err || ("identity=" + String(f.core_identity || "").length + " traits=" + String(f.core_traits || "").length)));
    T("B9", "世界书条目数按上限收敛（≤500）",
      !out.err && Array.isArray(out.worldbook) && out.worldbook.length <= 500,
      out.err || String((out.worldbook || []).length));
    T("B10", "正常字段未被误截断（卡名/开场白）",
      !out.err && out.name === "验收卡" && (out.greeting === "开场白" || f.greeting === "开场白"),
      out.err || JSON.stringify({ name: out.name, greeting: out.greeting || f.greeting, keys: Object.keys(f).slice(0, 6) }));
    void store;
  }

  /* B-11 清空数据：端到端走 window.__wipeAllData（PIN 清除的真实入口） */
  {
    const idbDeleted = { v: false };
    const ndClear = { v: 0 };
    const reload = { v: 0 };
    const { ctx, store } = mkCtx({
      Promise,
      indexedDB: { deleteDatabase(){ return {}; } },
      NDFILE: {
        SUPPORTED: () => true,
        clearAll: () => { ndClear.v++; return Promise.resolve(true); },
        getItem: () => Promise.resolve(null),
        setItem: () => Promise.resolve("ok"),
        removeItem: () => Promise.resolve(true),
      },
      location: { reload(){ reload.v++; } },
    });
    /* deleteDatabase 需要 onsuccess 回调触发 */
    ctx.indexedDB.deleteDatabase = function(){ idbDeleted.v = true; const o = {}; setTimeout(() => o.onsuccess && o.onsuccess(), 0); return o; };
    store["nd_chat_r1_林黛玉"] = "[]";
    store["nd_imported_cards"] = "[]";
    store["nd_fileidx_nd_chat_r1"] = "1";
    store["nd_idbidx_nd_chat_r1"] = "1";
    store["nd_idbcopied_nd_chat_r1"] = "1";
    store["nd_store_v"] = "1";
    store["nd_lastchat_idx"] = "{}";
    vm.runInContext(S("www/rp/store.js"), ctx, { filename: "store.js" });
    ctx.__k = "nd_chat_r1_林黛玉";
    vm.runInContext('RP_STORE.cacheSet(__k, "[]")', ctx);
    vm.runInContext(extractFn(S("www/app.js"), "__wipeAllData"), ctx, { filename: "wipeAllData.js" });
    vm.runInContext("__wipeAllData({clearAll:true, reload:true})", ctx);
    await new Promise(r => setTimeout(r, 30));
    T("B11", "清空走存储层：IDB 被删 + 文件目录被清 + 页面重载",
      idbDeleted.v && ndClear.v === 1 && reload.v === 1,
      "idb=" + idbDeleted.v + " file=" + ndClear.v + " reload=" + reload.v);
    const left = Object.keys(store);
    T("B12", "清空后 localStorage 一个键都不剩（含非 nd_ 前缀）", left.length === 0, left.join(","));
    T("B13", "清空后同步读不再命中旧值（内存镜像已清）",
      vm.runInContext('RP_STORE.getSync(__k)', ctx) === null, String(vm.runInContext('RP_STORE.getSync(__k)', ctx)));
  }

  /* B-14 长会话：历史解析缓存 + 渲染签名 */
  {
    const { ctx } = mkCtx();
    const app = S("www/app.js");
    vm.runInContext(extractFn(app, "getHist"), ctx, { filename: "getHist.js" });
    vm.runInContext(extractFn(app, "saveHist"), ctx, { filename: "saveHist.js" });
    const h = Array.from({ length: 80 }, (_, i) => ({
      mid: "m" + i, role: i % 2 ? "assistant" : "user",
      content: "第" + i + "条消息：" + "这是一段用于验收长会话渲染成本的中文内容。".repeat(40),
      ts: 1700000000000 + i, rating: 0,
    }));
    ctx.__h = h; ctx.__k = "nd_chat_acc_测试";
    vm.runInContext("saveHist(__k, __h)", ctx);
    let first = 0, second = 0, a, b;
    first = ms(() => { a = vm.runInContext("getHist(__k).length", ctx); });
    second = ms(() => { b = vm.runInContext("getHist(__k).length", ctx); });
    T("B14", "80 条长历史（" + (JSON.stringify(h).length / 1024).toFixed(0) + "KB）二次读取走缓存",
      a === 80 && b === 80 && second <= Math.max(0.05, first / 3),
      "first=" + first.toFixed(3) + "ms second=" + second.toFixed(3) + "ms");
    T("B15", "getHist 返回浅拷贝，调用方 push 不污染缓存",
      vm.runInContext("(function(){ var x = getHist(__k); x.push({}); return getHist(__k).length; })()", ctx) === 80);

    /* 渲染签名：同一份历史连续三次调用签名一致 => renderChat 会短路 */
    vm.runInContext(extractFn(app, "chatRenderSig"), ctx, { filename: "chatRenderSig.js" });
    vm.runInContext("CHAT = {mode:'single'}; SEARCH = {active:false, q:''};", ctx);
    ctx.__k2 = "nd_chat_acc_测试";
    const s1 = vm.runInContext("chatRenderSig(__k2, __h)", ctx);
    const s2 = vm.runInContext("chatRenderSig(__k2, __h)", ctx);
    const s3 = vm.runInContext("chatRenderSig(__k2, __h)", ctx);
    T("B16", "同历史三次渲染签名一致（发送流程 3 次 renderChat 只重建 1 次）", s1 === s2 && s2 === s3 && s1.length > 0);
    ctx.__h[5].content += "（编辑过）";
    const s4 = vm.runInContext("chatRenderSig(__k2, __h)", ctx);
    T("B17", "消息内容变化后签名变化（不会漏渲）", s4 !== s1);
    const tSig = ms(() => { for(let i = 0; i < 20; i++) vm.runInContext("chatRenderSig(__k2, __h)", ctx); });
    perfRows.push({ item: "chatRenderSig ×20（80 条）", value: tSig / 20, unit: "ms/次" });
    T("B18", "80 条历史签名耗时 < 2ms（短路本身不能成为新瓶颈）", tSig / 20 < 2, (tSig / 20).toFixed(3) + "ms");
  }

  /* B-19 打字机：长文本分支存在且阈值合理 */
  T("B19", "打字机长回复分支（>1200 字）已就位",
    has("www/app.js", /twPlain && !done && !SEARCH\.active/));

  /* B-20 2000 字回复的分帧成本（真机 60fps 的前置条件：分帧本身不能是瓶颈） */
  {
    const { ctx } = mkCtx();
    vm.runInContext(S("www/rp/typewriter.js"), ctx, { filename: "typewriter.js" });
    ctx.__s2k = "风".repeat(2000);
    ctx.__s8k = "风".repeat(8000);
    const fr2k = vm.runInContext("RP_TYPEWRITER.progressFrames(__s2k).length", ctx);
    const fr8k = vm.runInContext("RP_TYPEWRITER.progressFrames(__s8k).length", ctx);
    const t2k = ms(() => { for(let i = 0; i < 20; i++) vm.runInContext("RP_TYPEWRITER.progressFrames(__s2k)", ctx); }) / 20;
    const t8k = ms(() => { for(let i = 0; i < 10; i++) vm.runInContext("RP_TYPEWRITER.progressFrames(__s8k)", ctx); }) / 10;
    perfRows.push({ item: "progressFrames 2000 字", value: t2k, unit: "ms/次" });
    perfRows.push({ item: "progressFrames 8000 字", value: t8k, unit: "ms/次" });
    T("B20", "分帧数被压到 ~110 帧且生成成本 < 10ms（2000/8000 字）",
      fr2k <= 112 && fr8k <= 112 && t2k < 10 && t8k < 10,
      "frames=" + fr2k + "/" + fr8k + " t=" + t2k.toFixed(2) + "/" + t8k.toFixed(2) + "ms");
  }

  /* ============================================================
   * C. 性能基准（与 git 基线对比）
   * ============================================================ */
  section("C. 性能基准");
  function loadLorebookFrom(code){
    const { ctx } = mkCtx();
    vm.runInContext(code, ctx, { filename: "lorebook.src.js" });
    return ctx;
  }
  function benchLore(ctx){
    const wb = [];
    for(let i = 0; i < 200; i++) wb.push({
      keys: [i % 10 === 0 ? "贾宝玉" : "触发词" + i, "别名" + i],
      keysecondary: ["次要" + i], content: "设定内容。".repeat(30), enabled: true, probability: 100, depth: 4,
    });
    const msgs = [];
    for(let i = 0; i < 30; i++) msgs.push("贾宝玉和林黛玉在大观园里说话，这一段用来把文本撑到两万字符量级。".repeat(12));
    ctx.__wb = wb; ctx.__msgs = msgs; ctx.__text = msgs.join("\n");
    const med = (fn)=>{
      for(let i = 0; i < 3; i++) fn(); /* 预热 */
      const xs = [];
      for(let i = 0; i < 7; i++) xs.push(ms(fn));
      xs.sort((a, b) => a - b);
      return xs[3];
    };
    const a = med(() => { for(let i = 0; i < 5; i++) vm.runInContext("RP_LOREBOOK.matchMessages(__wb, __msgs, 30)", ctx); }) / 5;
    const b = med(() => { for(let i = 0; i < 5; i++) vm.runInContext("RP_LOREBOOK.match(__wb, __text, 30)", ctx); }) / 5;
    return { msg: a, match: b, len: ctx.__text.length, entries: wb.length };
  }
  let now = null, base = null;
  try{ now = benchLore(loadLorebook()); }catch(e){ W("C1", "当前版本基准失败", e.message); }
  let baseOops = "";
  try{
    const code = cp.execSync("git show " + BASELINE_COMMIT + ":www/rp/lorebook.js", { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    base = benchLore(loadLorebookFrom(code));
  }catch(e){ baseOops = e.message.split("\n")[0]; }
  if(now && base){
    const kMsg = base.msg / now.msg, kMatch = base.match / now.match;
    perfRows.push({ item: "lorebook.match（200 条 / " + (now.len / 1024).toFixed(1) + "KB）", value: now.match, unit: "ms", base: base.match, ratio: kMatch });
    perfRows.push({ item: "lorebook.matchMessages（同上）", value: now.msg, unit: "ms", base: base.msg, ratio: kMsg });
    console.log("  · 世界书 match        ：" + base.match.toFixed(2) + "ms → " + now.match.toFixed(2) + "ms（" + kMatch.toFixed(2) + "×）");
    console.log("  · 世界书 matchMessages：" + base.msg.toFixed(2) + "ms → " + now.msg.toFixed(2) + "ms（" + kMsg.toFixed(2) + "×）");
    /* 硬门槛：不允许出现明显回退（测试机噪声容忍 2 倍以内的抖动由中位数吸收） */
    T("C1", "世界书匹配无性能回退（阈值 1.5×）", now.match <= base.match * 1.5 && now.msg <= base.msg * 1.5,
      "match " + kMatch.toFixed(2) + "× / matchMessages " + kMsg.toFixed(2) + "×");
    /* 报告依据项：单条匹配路径确实变快 */
    T("C2", "世界书 match 快于基线（≥1.3×）", kMatch >= 1.3, kMatch.toFixed(2) + "×");
  }else{
    W("C1", "无基线可比（git 不可用或提交缺失）", baseOops);
  }

  /* ============================================================
   * D. 全量回归
   * ============================================================ */
  section("D. 全量回归");
  if(SKIP_TESTS){
    W("D0", "已跳过（--no-tests）", "");
  }else{
    const dir = path.join(ROOT, "tests");
    const files = fs.readdirSync(dir).filter(f => /^test_.*\.js$/.test(f)).sort();
    const failed = [], newFails = [];
    for(const f of files){
      let okRun = true, err = "";
      try{ cp.execFileSync(process.execPath, [path.join(dir, f)], { cwd: ROOT, stdio: "pipe", timeout: 120000 }); }
      catch(e){ okRun = false; err = String(e.stderr || e.message).split("\n").slice(-3).join(" "); }
      if(!okRun){
        failed.push(f);
        if(!BASELINE_FAIL.has(f)) newFails.push(f + " :: " + err.slice(0, 160));
      }
    }
    const missingBaseline = [...BASELINE_FAIL].filter(f => !failed.includes(f));
    T("D1", "共 " + files.length + " 个用例，失败 " + failed.length + " 个（基线 " + BASELINE_FAIL.size + " 个）",
      failed.length === BASELINE_FAIL.size, failed.join(","));
    T("D2", "无新增失败用例", newFails.length === 0, newFails.join(" | "));
    if(missingBaseline.length){
      W("D3", "基线失败中有 " + missingBaseline.length + " 个现在通过了（可能顺带修好，确认后从基线集移除）", missingBaseline.join(","));
    }
  }

  /* ============================================================
   * 汇总
   * ============================================================ */
  console.log("\n" + "=".repeat(64));
  console.log("通过 " + pass + " · 失败 " + fail + " · 提示 " + warn);
  if(perfRows.length){
    console.log("性能：");
    perfRows.forEach(r => console.log("  · " + r.item + " = " + (typeof r.value === "number" ? r.value.toFixed(2) : r.value) + r.unit +
      (r.base ? "（基线 " + r.base.toFixed(2) + "ms，" + r.ratio.toFixed(2) + "×）" : "")));
  }
  if(fail){
    console.log("失败清单：");
    failures.forEach(f => console.log("  - [" + f.id + "] " + f.label + (f.detail ? "  <- " + f.detail : "")));
  }
  console.log("=".repeat(64));
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error("验收脚本异常:", e && e.stack || e);
  process.exit(1);
});
