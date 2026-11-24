/* 蒸馏全利用一期验收（2026-11-24）：
 * - speech/core/identity/background 常驻段补入的字段真实渲染（用真卡数据）
 * - emotion 情境包 anger_style 可被愤怒关键词触发
 * - arc_blocker 进 renderArcPrompt
 * - maxContext 默认 32768 + 存量迁移（=8192 才迁，用户自设值不动） */
const fs = require("fs"), vm = require("vm");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

/* ---------- prompt / arc / portrait（自包含模块） ---------- */
const ctx = { console, setTimeout, clearTimeout };
ctx.window = ctx; vm.createContext(ctx);
for(const f of ["rp/prompt.js", "rp/arc.js", "rp/portrait.js"])
  vm.runInContext(fs.readFileSync(WWW + "/" + f, "utf8"), ctx, {filename: f});

const shuihu = JSON.parse(fs.readFileSync(WWW + "/data/rp_cards_shuihu_full.json", "utf8"));
const shArr = Array.isArray(shuihu) ? shuihu : Object.values(shuihu);
const honglou = JSON.parse(fs.readFileSync(WWW + "/data/rp_cards_honglou_full.json", "utf8"));
const hlArr = Array.isArray(honglou) ? honglou : Object.values(honglou);

const render = (card, layer) => vm.runInContext("RP_PROMPT.renderFields", ctx)(card, vm.runInContext("RP_PROMPT.LAYERS." + layer, ctx));

/* speech: 句尾习惯/连接词出现（水浒卡微特征 10/10 全） */
const micro = shArr.find(c => c.fields.sentence_endings && c.fields.connective_tokens);
t("水浒有微特征全卡", !!micro);
if(micro){
  const sp = render(micro, "speech");
  t("speech 含句尾习惯", sp.indexOf("句尾习惯") >= 0);
  t("speech 含连接词", sp.indexOf("连接词") >= 0);
}
/* core: thinking_style */
const thinker = shArr.find(c => c.fields.thinking_style) || hlArr.find(c => c.fields.thinking_style);
t("有 thinking_style 卡", !!thinker);
if(thinker) t("core 含思维方式", render(thinker, "core").indexOf("思维方式") >= 0);
/* identity/background: identity_anchor/world_belong/stance_stability */
const anch = hlArr.find(c => c.fields.identity_anchor);
if(anch) t("identity 含身份锚点", render(anch, "identity").indexOf("身份锚点") >= 0);
const bgc = hlArr.find(c => c.fields.world_belong && c.fields.stance_stability);
if(bgc){
  const bg = render(bgc, "background");
  t("background 含世界归属", bg.indexOf("世界归属") >= 0);
  t("background 含立场稳定性", bg.indexOf("立场稳定性") >= 0);
}
/* arc_blocker */
const arcCard = hlArr.find(c => c.fields.arc_blocker && c.fields.arc_start);
t("红楼有 arc_blocker 卡", !!arcCard);
if(arcCard){
  const ap = vm.runInContext("RP_ARC.renderArcPrompt", ctx)(arcCard, "honglou_full");
  t("弧光含当前阻碍", ap.indexOf("当前阻碍") >= 0);
}
/* portrait emotion: anger_style 触发 */
const angry = hlArr.find(c => c.fields.anger_style) || shArr.find(c => c.fields.anger_style);
t("有 anger_style 卡", !!angry);
if(angry){
  const r = vm.runInContext("RP_PORTRAIT.enrich", ctx)(angry, "他气得发抖，愤怒地拍了桌子", []);
  t("愤怒情境命中 emotion 包", r.hits.some(h => (h.pack || h) === "emotion") || r.text.indexOf("愤怒表达") >= 0);
  t("命中含 anger_style 字段", r.text.indexOf("愤怒表达") >= 0 || JSON.stringify(r.hits).indexOf("anger_style") >= 0);
}

/* ---------- maxContext 默认 + 迁移（加载 app_chat_core） ---------- */
function loadCore(seed){
  const store = {};
  if(seed) store["nd_rp_cfg_v1"] = JSON.stringify(seed);
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
  const c2 = { console, localStorage, setTimeout, clearTimeout, setInterval: () => 0, clearInterval(){} };
  c2.window = c2; vm.createContext(c2);
  vm.runInContext(fs.readFileSync(WWW + "/js/app_chat_core.js", "utf8"), c2, {filename: "app_chat_core.js"});
  return { ctx: c2, store };
}
const fresh = loadCore(null);
t("无存量时默认 maxContext=32768", vm.runInContext("getRpCfg().maxContext", fresh.ctx) === 32768);
const mig = loadCore({maxContext: 8192, respTokens: 2000, _migResp2000: 1});
t("存量 8192 迁移到 32768", vm.runInContext("getRpCfg().maxContext", mig.ctx) === 32768);
t("迁移标记已写", JSON.parse(mig.store["nd_rp_cfg_v1"])._migCtx32k === 1);
const keep = loadCore({maxContext: 16384});
t("用户自设 16384 不动", vm.runInContext("getRpCfg().maxContext", keep.ctx) === 16384);

console.log(`fielduse_p1: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
