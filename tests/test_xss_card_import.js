/* v41 XSS 复审回归（item 15 跟进）：恶意 ST 角色卡走真实导入链路
 *   parseCardJson → normalizeTavern → RP_CARDIMPORT.add（与 travImportFile / 粘贴导入同一调用序列），
 * 拿到真实 card.id 后渲染所有吃卡数据的界面——含上一轮没跑到的 id 型界面：
 *   走原著线选幕 plotlinePickCardStage(id)、世界补完 travWorldComplete('card', id)、补完结果页、
 *   卡片编辑器 editCard('imported', id)、AI 补完缺失层 cardGapfillPrompt(id)、肉身穿越/组团选主角等。
 * 断言（对每屏 innerHTML）：
 *   1) payload 不得解析成真标签（<img onerror> / <svg onload> / <b data-x> / <a href=javascript:>）；
 *   2) 每个 on*="..." 属性 HTML 解码后，payload 标记只能出现在 JS 字符串字面量内部（不得突破到代码层）；
 *   3) 不得出现 javascript: 链接。
 * 浏览器端全量复审脚本：tools/xss_card_audit.py（Playwright，开发期可选，不进运行时）。 */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const { APP_FILES } = require("./lib_appsrc.js");

function mkEl(){
  const el = {innerHTML: "", textContent: "", value: "", checked: false, files: null,
    classList: {add(){}, remove(){}, toggle(){}, contains(){ return false; }},
    style: {}, dataset: {}, children: [],
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){}, insertAdjacentHTML(){},
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){}, hasAttribute(){ return false; },
    closest(){ return null; }, scrollTo(){}, scrollIntoView(){}, focus(){}, click(){}, blur(){},
    getBoundingClientRect(){ return {left:0,top:0,right:0,bottom:0,width:0,height:0}; }};
  return el;
}
const els = {};
const ls = (function(){ const m = {}; return {
  getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; },
  key: i => Object.keys(m)[i] || null, get length(){ return Object.keys(m).length; }}; })();
const document = {
  body: mkEl(), head: mkEl(), documentElement: mkEl(),
  getElementById: id => els[id] || (els[id] = mkEl()),
  querySelector: sel => { const mm = String(sel).match(/^#([\w-]+)$/); return mm ? (els[mm[1]] || (els[mm[1]] = mkEl())) : null; },
  querySelectorAll: () => [], createElement: () => mkEl(), addEventListener(){},
};
const DATA = {
  index: [{run_id: "r1", novel: "红楼梦", characters: ["林黛玉"], n_chunks: 10}],
  runs: {r1: {run_id: "r1", novel: "红楼梦", worldbook: [], relations: [], profiles: []}},
  rp_cards: {r1: [{name: "林黛玉", fields: {core_identity: "林如海之女"}}]},
};
const ctx = {localStorage: ls, document, console: {log(){}, warn(){}, error(){}, info(){}},
  alert(){}, confirm(){ return false; }, prompt(){ return null; },
  setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
  requestAnimationFrame: () => 0, fetch: () => Promise.reject(new Error("no net")),
  scrollTo(){}, devicePixelRatio: 2, navigator: {userAgent: "node"},
  Image: function(){ const el = mkEl(); el.src = ""; return el; }};
ctx.window = ctx; ctx.globalThis = ctx; ctx.__DATA__ = DATA;
vm.createContext(ctx);
for(const f of ["data.js", "icons.js", "data/char_plots.js", "rp/escutil.js", "rp/prompt.js", "rp/persona.js",
  "rp/memory.js", "rp/tasks.js", "rp/cardwriter.js", "rp/ooc.js", "rp/chat.js", "rp/aifill.js",
  "rp/group.js", "rp/cardexport.js", "rp/cardimport.js", "rp/traverse.js", "rp/traverse2.js"].concat(APP_FILES(WWW))){
  vm.runInContext(fs.readFileSync(WWW + "/" + f, "utf8"), ctx, {filename: f});
}
vm.runInContext("window.__DATA__=" + JSON.stringify(DATA) + "; INDEX = window.__DATA__.index;", ctx);

let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

/* ---- 恶意卡 ---- */
const pl = tag => `<img src=x onerror="__XSS('${tag}')"><svg onload="__XSS('${tag}s')"></svg>`
  + `<a href="javascript:__XSS('${tag}j')">L</a>'"><b data-x=${tag}>`;
const ATTR_NAME = `林'"><img src=x onerror=__XSS('ATTR')>\`\${__XSS('TPL')}\`</textarea><svg/onload=__XSS('ATTR2')>\\');__XSS('BS');//`;
function mkcard(name, s){
  return {spec: "chara_card_v2", spec_version: "2.0", data: {
    name, nickname: pl("nick"+s), description: pl("desc"+s), personality: pl("pers"+s), scenario: pl("scen"+s),
    first_mes: pl("first"+s), mes_example: "<START>\n{{user}}: hi\n{{char}}: " + pl("mes"+s),
    creator_notes: pl("notes"+s), system_prompt: pl("sys"+s), post_history_instructions: pl("phi"+s),
    alternate_greetings: [pl("alt1"+s), pl("alt2"+s)], group_only_greetings: [pl("grp"+s)],
    tags: [pl("tag"+s), "javascript:__XSS('tagj')"], creator: pl("creator"+s), character_version: pl("ver"+s),
    assets: [{type: "icon", uri: "javascript:__XSS('asset')", name: pl("asset"+s), ext: "png"}],
    character_book: {name: pl("book"+s), entries: [{keys: [pl("key"+s)], content: pl("wb"+s), comment: pl("wbc"+s),
      name: pl("wbn"+s), enabled: true, insertion_order: 1, constant: true}]},
    extensions: {depth_prompt: {prompt: pl("depth"+s), depth: 4}, example_dialogue: pl("exd"+s)}}};
}
const ids = vm.runInContext(`(function(cards){ return cards.map(function(c){
  var card = RP_CARDIMPORT.normalizeTavern(RP_CARDIMPORT.parseCardJson(JSON.stringify(c)));
  RP_CARDIMPORT.add(card); return card.id; }); })`, ctx)([mkcard("恶意卡甲", "A"), mkcard(ATTR_NAME, "B")]);
t("导入链路返回真实 card.id", ids.length === 2 && ids.every(id => typeof id === "string" && /^imp/.test(id)));
const cards = ids.map(id => vm.runInContext("RP_CARDIMPORT.findById", ctx)(id));
t("findById 能按 id 取回卡", cards.every(Boolean) && cards[1].name === ATTR_NAME);
/* AI 补完的世界设定同属不可信文本（模型可被卡内容诱导输出 HTML） */
ids.forEach(id => ls.setItem("nd_wb2_card_" + id, JSON.stringify({kind: "card", id,
  bg: pl("wbbg"), anchors: [pl("anc1") + "：" + pl("syn1"), pl("anc2")]})));

/* ---- 扫描 ---- */
function htmlDecode(s){
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function outsideStrings(js){
  let q = null, out = "";
  for(let i = 0; i < js.length; i++){
    const ch = js[i];
    if(q){ if(ch === "\\"){ i++; continue; } if(ch === q) q = null; continue; }
    if(ch === "'" || ch === '"' || ch === "`"){ q = ch; continue; }
    out += ch;
  }
  return out;
}
function scan(html){
  const bad = [];
  const tagRe = /<(img|svg|b|a)\b[^>]*>/gi; let m;
  while((m = tagRe.exec(html))){
    const tag = m[0];
    if(/\bon(error|load)\s*=/i.test(tag) && /__XSS/.test(tag)) bad.push("live handler tag: " + tag.slice(0, 80));
    if(/^<b\b/i.test(tag) && /data-x=/i.test(tag)) bad.push("parsed payload tag: " + tag.slice(0, 80));
    if(/^<a\b/i.test(tag) && /href\s*=\s*["']?\s*javascript:/i.test(tag)) bad.push("javascript: link: " + tag.slice(0, 80));
  }
  const attrRe = /\son[a-z]+="([^"]*)"/gi;
  while((m = attrRe.exec(html))){
    const code = htmlDecode(m[1]);
    if(/__XSS/.test(outsideStrings(code))) bad.push("JS breakout in handler: " + code.slice(0, 100));
    /* 处理器必须仍是合法 JS：引号被提前闭合（如 esc() 的 &#39; 解码回 '）会变成语法错误或注入 */
    try{ new vm.Script("(function(event){" + code + "\n})"); }
    catch(e){ bad.push("handler no longer parses (" + e.message + "): " + code.slice(0, 100)); }
  }
  if(/(?:href|src)\s*=\s*["']?\s*javascript:/i.test(html)) bad.push("javascript: URL attribute");
  return bad;
}

const view = () => els["view"].innerHTML;
const call = (expr) => { try{ vm.runInContext(expr, ctx); return null; }catch(e){ return e; } };
const nameA = JSON.stringify(cards[0].name), nameB = JSON.stringify(cards[1].name);
const screens = [];
ids.forEach((id, i) => {
  const c = JSON.stringify(id), n = i ? nameB : nameA;
  screens.push(
    ["走原著线·选幕", `plotlinePickCardStage(${c})`, true],
    ["世界补完(从选书页进)", `PLOTLINE_WB_BACK=true; travWorldComplete('card',${c})`, true],
    ["世界补完(从穿越首页进)", `PLOTLINE_WB_BACK=false; travWorldComplete('card',${c})`, true],
    ["世界补完结果页", `window._wbDraft={kind:'card',id:${c},bg:${JSON.stringify(pl("draft"))},anchors:[${JSON.stringify(pl("draft2"))}]}; travWorldCompleteView()`, true],
    ["卡片编辑器", `editCard('imported',${c})`, true],
    ["AI 补完缺失层", `cardGapfillPrompt(${c},['ooc_redline','soul_goal'],[])`, false],
    ["走原著线·选书", `plotlinePickBook()`, false],
    ["卡片档案页", `openCardArchive('imported',${n})`, false],
    ["角色详情", `charDetail('imported',${n})`, false],
    ["肉身穿越·捏身份", `bodyIdentity('card',${c})`, false],
    ["组团·选主角", `partyPickMain('card',${c})`, false],
    ["异世界·选角色", `isekaiPickSrc()`, false],
    ["穿越首页", `showTraverse()`, false],
  );
});
let rendered = 0;
for(const [label, expr, mustRender] of screens){
  els["view"].innerHTML = "";
  const err = call(expr);
  const html = view() + (els["title"] ? els["title"].innerHTML : "");
  if(mustRender) t(label + " 可渲染（" + (err ? err.message : "ok") + "）", !err && html.length > 0);
  if(html.length) rendered++;
  const bad = scan(html);
  t(label + " 无未转义 sink", bad.length === 0);
  if(bad.length) console.log("  " + label + ":", bad.slice(0, 3).join("\n    "));
}
t("id 型界面确实带出了卡内容（扫描有效性）", (function(){
  call(`plotlinePickCardStage(${JSON.stringify(ids[1])})`);
  return /anc1/.test(view()) && /&lt;img/.test(view());
})());
t("属性破坏型卡名在 onclick 中仍是字符串字面量", (function(){
  call(`openCardArchive('imported',${nameB})`);
  const h = view();
  return /onclick="[^"]*chatWithOpening\('imported','林/.test(h) && scan(h).length === 0;
})());
t("至少渲染了 10 屏", rendered >= 10);
/* 扫描器自检：故意的裸拼必须被抓到 */
t("扫描器能抓裸 innerHTML", scan(`<div>${pl("ctl")}</div>`).length > 0);
t("扫描器能抓 onclick 字符串突破", scan(`<div onclick="f('x');__XSS(1)">`).length > 0);
t("扫描器不误报合法转义", scan(`<div onclick="f('a\\'&quot;__XSS')">&lt;img onerror=__XSS&gt;</div>`).length === 0);

console.log(`xss_card_import: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
