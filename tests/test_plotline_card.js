/* 走原著线 · 导入卡回归
 * 1) 选书页：导入卡节 + 已补完/待补完 badge + 各自的点击目标
 * 2) 选幕页：锚点成幕；bible 缺失/anchors 空/全占位 → honest 空态（不编造幕）
 * 3) 开局：worldKind=card、无 plotrunId、anchorTitle=锚点文本、CHAT 走 traverse
 * 4) 从选书页进的补完页返回按钮回选书页（PLOTLINE_WB_BACK）
 * 写法同 test_immersive_ui：按标记从 app.js 抽源码 + 注入依赖跑。
 */
const fs = require("fs");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const { APP_FILES: __APP_FILES, appSource: __appSource } = require("./lib_appsrc.js"); /* v41: app.js 拆分后按加载顺序取全部分段 */
const src = __appSource(WWW);
const escSrc = fs.readFileSync(WWW + "/rp/escutil.js", "utf8");
const { jq, escH } = new Function(escSrc + "\nreturn {jq, escH};")();

let pass = 0, fail = 0;
function ok(name, cond){
  if(cond){ pass++; }
  else { fail++; console.log("FAIL:", name); }
}

/* 从 startMark 起括号配平抽一段（含 { }） */
function extract(startMark){
  const s = src.indexOf(startMark);
  if(s < 0) throw new Error("not found: " + startMark);
  let d = 0, i = s + startMark.length - 1;
  for(; i < src.length; i++){
    if(src[i] === "{") d++;
    else if(src[i] === "}"){ d--; if(d === 0) break; }
  }
  return src.slice(s, i + 1) + ";";
}
/* 抽 startMark → endMark(不含) 之间的整段源码（连续的若干函数） */
function span(startMark, endMark){
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark, a);
  if(a < 0 || b < 0) throw new Error("not found: " + startMark + " / " + endMark);
  return src.slice(a, b);
}

/* 依赖注入：把抽出的源码塞进 new Function 跑，返回入口 + 观察用的探针 */
const CORE = span("/* 走原著线：选书 → 选幕", "/* 导入卡·选幕")
            + extract("function plotlinePickCardStage(cardId){")
            + extract("function plotlineStartCard(cardId, anchorIdx){");

function makeEnv(o){
  o = o || {};
  const store = new Map();
  const view = { innerHTML: "" };
  const titleEl = { innerHTML: "" };
  const subEl = { textContent: "" };
  const cards = o.cards || [];
  const RP_CARDIMPORT = {
    list: ()=> cards,
    findById: (id)=> cards.find(c=>c.id === id) || null,
  };
  const calls = { sess: null, nav: [], complete: [] };
  const RP_TRAVERSE = {
    newSession: (opts)=>{ calls.sess = opts; return { id: "t_test" }; },
    worldDisplayName: (kind, id)=> "《" + ((RP_CARDIMPORT.findById(id)||{}).name || id) + "》的世界",
  };
  const RP_TRAVERSE2 = { extractSeed: ()=> ["种子文本"] };
  const win = { __DATA__: { index: o.index || [] }, scrollTo: ()=>{} };
  const deps = {
    window: win, localStorage: {
      getItem: (k)=> store.has(k) ? store.get(k) : null,
      setItem: (k, v)=> store.set(k, String(v)),
    },
    titleEl, subEl, view, icon: (n)=> "[" + n + "]",
    jq, esc: escH, RP_CARDIMPORT, RP_TRAVERSE, RP_TRAVERSE2,
    setNav: (n)=> calls.nav.push(n),
    travWorldComplete: (kind, id)=> calls.complete.push([kind, id]),
    document: { body: { classList: { remove: ()=>{} } } },
  };
  const names = Object.keys(deps);
  const fnSrc = `
    let __backAction = null;
    let CHAT = {mode:"single", runId:null, name:null};
    ${CORE}
    ${extract("window.travWorldComplete = (kind, id)=>{")}
    return {
      plotlinePickBook, plotlinePickCardStage, plotlineStartCard, plotlineCardAnchors,
      travWorldComplete: window.travWorldComplete,
      html: ()=> view.innerHTML,
      chat: ()=> CHAT,
      setFlag: (v)=>{ PLOTLINE_WB_BACK = v; },
      getFlag: ()=> PLOTLINE_WB_BACK,
      runBack: ()=> __backAction && __backAction(),
    };`;
  const env = new Function(...names, fnSrc)(...names.map(k=>deps[k]));
  return Object.assign(env, { calls, store, cards });
}

const CARD_A = { id: "imp_done", name: "白月光", novel: "导入角色卡" };
const CARD_B = { id: "imp_new", name: "林黛玉", novel: "导入角色卡" };
const BIBLE = {
  bg: "大周朝，京城。旧党与新党在朝堂上对峙，边关战事吃紧。",
  anchors: ["雪夜初见", "朝堂风云", "边关急报", "花灯之约"],
  updatedAt: 1,
};

/* ---------- (a)(b) 选书页：导入卡节 ---------- */
{
  const env = makeEnv({ cards: [CARD_A, CARD_B] });
  env.store.set("nd_wb2_card_imp_done", JSON.stringify(BIBLE));
  env.plotlinePickBook();
  const html = env.html();
  ok("a 选书页列出导入卡节", html.indexOf("<h2 class=\"sec\">导入卡</h2>") >= 0);
  ok("a 已补完卡的 badge 是 导入卡·已补完",
     html.indexOf("导入卡·已补完") >= 0
     && /<div class="card card--tap" onclick="plotlinePickCardStage\('imp_done'\)">[\s\S]*?白月光[\s\S]*?导入卡·已补完/.test(html));
  ok("a 待补完卡的 badge 是 导入卡·待补完",
     /<div class="card card--tap" onclick="PLOTLINE_WB_BACK=true;travWorldComplete\('card','imp_new'\)">[\s\S]*?林黛玉[\s\S]*?导入卡·待补完/.test(html));
  ok("b 已补完卡不进补完页", html.indexOf("travWorldComplete('card','imp_done')") < 0);
}
/* 无导入卡 → 不渲染该节 */
{
  const env = makeEnv({ cards: [] });
  env.plotlinePickBook();
  ok("a 无导入卡时不渲染导入卡节", env.html().indexOf("导入卡") < 0);
}

/* ---------- (c) 选幕页 ---------- */
{
  const env = makeEnv({ cards: [CARD_A] });
  env.store.set("nd_wb2_card_imp_done", JSON.stringify(BIBLE));
  env.plotlinePickCardStage("imp_done");
  const html = env.html();
  ok("c 锚点成幕（标题=锚点文本 + 返回选书）",
     html.indexOf("选一幕 · 4 幕") >= 0 && html.indexOf("雪夜初见") >= 0
     && html.indexOf("花灯之约") >= 0
     && html.indexOf("plotlinePickBook()") >= 0
     && html.indexOf("plotlineStartCard('imp_done',0)") >= 0);
  /* v41：世界背景只在列表顶部出现一次，不再每幕重复 */
  ok("c 世界背景 bible.bg 只出现一次", html.split("大周朝，京城。旧党与新党在朝堂上对峙，边关战事吃紧。").length === 2);
}
{
  /* v41：锚点「标题：概要」拆出每幕自己的概要 */
  const env = makeEnv({ cards: [CARD_A] });
  env.store.set("nd_wb2_card_imp_done", JSON.stringify({ bg: "大周朝", anchors: ["雪夜初见：你在城门口救下一个受伤的少年", "朝堂风云", "长安 12:30 之约"] }));
  env.plotlinePickCardStage("imp_done");
  const html = env.html();
  ok("c 带冒号的锚点拆为标题+概要", /<div class="name">雪夜初见<\/div>[\s\S]*?<div class="st">你在城门口救下一个受伤的少年<\/div>/.test(html));
  ok("c 纯标题锚点不硬凑概要", /<div class="name">朝堂风云<\/div>\s*<div class="meta">[^<]*<span class="badge">AI 补完<\/span><\/div>\s*<\/div>/.test(html));
  ok("c 时间里的冒号不当分隔", html.indexOf('<div class="name">长安 12:30 之约</div>') >= 0);
}
{
  /* bible 缺失 */
  const env = makeEnv({ cards: [CARD_B] });
  env.plotlinePickCardStage("imp_new");
  const html = env.html();
  ok("c bible 缺失 → 空态提示去 AI 补完世界，无编造幕",
     html.indexOf("去 AI 补完世界") >= 0 && html.indexOf("card--tap") < 0
     && html.indexOf("选一幕") < 0 && html.indexOf("travWorldComplete('card','imp_new')") >= 0);
}
{
  /* anchors 为空数组 */
  const env = makeEnv({ cards: [CARD_B] });
  env.store.set("nd_wb2_card_imp_new", JSON.stringify({ bg: "设定", anchors: [], updatedAt: 1 }));
  env.plotlinePickCardStage("imp_new");
  const html = env.html();
  ok("c anchors 为空 → 空态，不造幕",
     html.indexOf("去 AI 补完世界") >= 0 && html.indexOf("card--tap") < 0 && html.indexOf("选一幕") < 0);
}
{
  /* 全是"（待补完）"占位 */
  const env = makeEnv({ cards: [CARD_B] });
  env.store.set("nd_wb2_card_imp_new", JSON.stringify({ bg: "设定", anchors: ["（待补完）","（待补完）","（待补完）"] }));
  env.plotlinePickCardStage("imp_new");
  const html = env.html();
  ok("c anchors 全占位 → 空态，占位文本不当幕标题",
     html.indexOf("去 AI 补完世界") >= 0 && html.indexOf("card--tap") < 0
     && html.indexOf("（待补完）") < 0 && html.indexOf("选一幕") < 0);
  ok("c plotlineCardAnchors 丢掉占位与空串",
     JSON.stringify(env.plotlineCardAnchors({ anchors: ["（待补完）", " ", "真锚点", null] })) === JSON.stringify(["真锚点"]));
}

/* ---------- (d) 开局 ---------- */
{
  const env = makeEnv({ cards: [CARD_A] });
  env.store.set("nd_wb2_card_imp_done", JSON.stringify(BIBLE));
  env.plotlineStartCard("imp_done", 2);
  const s = env.calls.sess;
  ok("d newSession: mode/worldKind/worldId 正确",
     !!s && s.mode === "plotline" && s.worldKind === "card" && s.worldId === "imp_done");
  ok("d newSession: plotrunId 为 falsy（导入卡无 RP_PLOTRUN）", !!s && !s.plotrunId);
  ok("d newSession: anchorTitle = 该条锚点文本", !!s && s.anchorTitle === "边关急报");
  ok("d newSession: worldName 带卡名", !!s && s.worldName.indexOf("白月光") >= 0);
  ok("d CHAT 切 traverse + setNav(chat)",
     env.chat().mode === "traverse" && env.chat().travId === "t_test"
     && env.calls.nav.length === 1 && env.calls.nav[0] === "chat");
}
{
  /* 锚点下标不存在 → 不开局（不静默造一个幕） */
  const env = makeEnv({ cards: [CARD_A] });
  env.store.set("nd_wb2_card_imp_done", JSON.stringify(BIBLE));
  env.plotlineStartCard("imp_done", 99);
  ok("d 锚点下标越界 → 不建会话不进聊天", env.calls.sess === null && env.calls.nav.length === 0);
}

/* ---------- 补完页返回目标 ---------- */
{
  const env = makeEnv({ cards: [CARD_B] });
  env.setFlag(true);
  env.travWorldComplete("card", "imp_new");
  ok("选书页进来的补完页：返回按钮回选书页",
     env.html().indexOf('class="back" onclick="plotlinePickBook()"') >= 0);
  env.runBack();  /* 系统返回键：确实退回选书页，而不是穿越首页 */
  ok("选书页进来的补完页：系统返回键回选书页（不弹回穿越首页）",
     env.html().indexOf(">导入卡</h2>") >= 0 && env.calls.nav.length === 0);
}
{
  const env = makeEnv({ cards: [CARD_B] });
  env.travWorldComplete("card", "imp_new");
  ok("其它入口的补完页：返回仍是穿越首页",
     env.html().indexOf('class="back" onclick="showTraverse()"') >= 0);
}

console.log(pass + "/" + (pass + fail) + (fail ? "  FAIL " + fail : "  OK"));
process.exit(fail ? 1 : 0);