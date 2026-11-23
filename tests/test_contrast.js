/* 2026-11-23 对比度与文字阴影回归:
 * (1) 8 套主题全部文字令牌 vs 四个背景令牌 WCAG 对比度 >= 4.5(用户实报"有的看不清"后立的守卫);
 * (2) RP_TSHADOW 三档模块行为(切片求值): 默认 soft、apply 写 data-tshadow、持久化;
 * (3) 设置页接线 + CSS 覆盖层 + immstrip/wirechip 两处定点修复在位。 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const themeSrc = fs.readFileSync(path.join(WWW, "rp/theme.js"), "utf8");
const css = fs.readFileSync(path.join(WWW, "style.css"), "utf8");
const ui42 = fs.readFileSync(path.join(WWW, "ui42.css"), "utf8");
const prefs = fs.readFileSync(path.join(WWW, "js/app_prefs.js"), "utf8");
const appjs = fs.readFileSync(path.join(WWW, "app.js"), "utf8");

/* (1) 对比度全量守卫 */
function lum(hex){
  const n = parseInt(hex.slice(1), 16);
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(n >> 16 & 255) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255);
}
function ratio(a, b){ const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
{
  const TEXT = ["--ink", "--ink-dim", "--ink-faint", "--gold", "--gold-soft", "--gold-deep", "--red", "--green"];
  const BGS = ["--bg", "--bg2", "--card", "--card2"];
  const re = /\{id:"(\w+)", name:"[^"]+",(?: light:true,)? wp:\{[^}]*\}, desc:"[^"]*",\s*vars:\{(.*?)\}\}/gs;
  let m, themes = 0, worst = 99, worstDesc = "";
  while((m = re.exec(themeSrc))){
    themes++;
    const vars = {};
    for(const vm2 of m[2].matchAll(/"(--[\w-]+)":"(#[0-9a-fA-F]{6})"/g)) vars[vm2[1]] = vm2[2];
    for(const tk of TEXT) for(const bg of BGS){
      const r = ratio(vars[tk], vars[bg]);
      if(r < worst){ worst = r; worstDesc = `${m[1]} ${tk} on ${bg}`; }
    }
  }
  t("解析到 8 套主题", themes === 8);
  t(`全部文字令牌对比度 >= 4.5 (最差 ${worst.toFixed(2)} @ ${worstDesc})`, worst >= 4.5);
}

/* (2) RP_TSHADOW 行为(切片求值, 只依赖 localStorage/document) */
{
  const start = themeSrc.indexOf("var RP_TSHADOW = (function(){");
  const end = themeSrc.indexOf("})();", start) + 5;
  t("RP_TSHADOW 模块存在", start >= 0 && end > start);
  const store = {};
  const attrs = {};
  const ctx = { console,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(themeSrc.slice(start, end), ctx);
  const TS = vm.runInContext("RP_TSHADOW", ctx);
  t("默认 soft 且已写 data-tshadow", TS.get() === "soft" && attrs["data-tshadow"] === "soft");
  t("三档齐全", TS.LEVELS.map(l => l.id).join(",") === "off,soft,strong");
  TS.apply("off", true);
  t("切关: 属性与持久化同步", attrs["data-tshadow"] === "off" && store["nd_tshadow_v1"] === "off" && TS.get() === "off");
  TS.apply("bogus", true);
  t("非法档位回落 soft", attrs["data-tshadow"] === "soft");
}

/* (3) 接线与定点修复 */
t("设置页有文字阴影卡", appjs.indexOf("文字阴影") >= 0 && appjs.indexOf("tshadowbox") >= 0);
t("prefs 有 tshadowCardsHTML/setTShadowUI", prefs.indexOf("tshadowCardsHTML") >= 0 && prefs.indexOf("setTShadowUI") >= 0);
t("off 覆盖层在位(!important)", /html\[data-tshadow="off"\] \.seg-nar,[\s\S]*?text-shadow:none !important/.test(ui42));
t("strong 旁白覆盖(带 .bubble.segd 压过基线)", ui42.indexOf('html[data-tshadow="strong"] .bubble.segd .seg-nar') >= 0);
t("strong 浅色旁白是光晕版", ui42.indexOf('html[data-tshadow="strong"][data-theme="tianqing"] .bubble.segd .seg-nar') >= 0);
t("immstrip 固定浅字", /body\.chatmode\.immersive \.immstrip\{[^}]*color:#ddd5bf/.test(css));
t("resume-s 浅色主题换光晕", ui42.indexOf('html[data-theme="tianqing"] .resume-s') >= 0 && /data-theme="qiuxiang"\] \.resume-s\{\s*text-shadow:0 1px 2px rgba\(255,253,245/.test(ui42));
t("resume-s 浓档+浅色是强光晕不是黑影", ui42.indexOf('html[data-tshadow="strong"][data-theme="tianqing"] .resume-s') >= 0);
t("wirechip 深色主题浅字版", css.indexOf('html[data-theme="moye"] .wirechip.favor') >= 0 && css.indexOf('html[data-theme="jiangxia"] .wirechip.cg') >= 0);

console.log(`test_contrast: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
