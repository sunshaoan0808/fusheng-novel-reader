/* 回归 (2026-11-23): UI 审计修复四件 ——
 * (1) theme-color/color-scheme 跟随主题(原生滚动条/表单控件/系统顶栏不再串色);
 * (2) .achv-toast 的 transition:all 改为只列 opacity/transform;
 * (3) 全局 :focus-visible 焦点环(a11y 补丁给了 tabindex, 这里补看得见的焦点);
 * (4) .msgtools/.ghostbar 小药丸按钮用 ::after 把命中高度撑到 44px(同 .aifillbtn 口径)。
 * 另注记: 图标按钮 aria-label 由 js/a11y.js 的 MutationObserver 兜底(标题/符号/类名表),
 * 静态模板里没写不等于没有, 本文件断言兜底表覆盖 backbtn/voicebub 的入口仍在。 */
const fs = require("fs"), vm = require("vm"), path = require("path");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };

const html = fs.readFileSync(path.join(WWW, "index.html"), "utf8");
const css = fs.readFileSync(path.join(WWW, "style.css"), "utf8");
const a11y = fs.readFileSync(path.join(WWW, "js/a11y.js"), "utf8");

/* (1a) 静态 meta 存在(首屏、JS 未跑时也有值) */
t("index.html 有 theme-color meta", /<meta name="theme-color" content="#[0-9a-f]{6}">/i.test(html));

/* (1b) apply() 行为: 深色主题 → dark + meta=bg; 浅色主题 → light + meta=bg */
{
  const store = {};
  const meta = { attrs: {}, setAttribute(k, v){ this.attrs[k] = v; } };
  const rootEl = { style: { setProperty(){} }, setAttribute(){} };
  const ctx = { console, setTimeout, clearTimeout,
    localStorage: { getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { documentElement: rootEl, querySelector: () => meta,
      getElementById: () => null, addEventListener: () => {} },
    navigator: {}, location: {} };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(WWW, "rp/theme.js"), "utf8"), ctx);
  vm.runInContext('RP_THEME.apply("moye")', ctx);
  t("墨夜 color-scheme=dark", rootEl.style.colorScheme === "dark");
  t("墨夜 theme-color=#12100d", meta.attrs.content === "#12100d");
  vm.runInContext('RP_THEME.apply("xuanzhi")', ctx);
  t("宣纸 color-scheme=light", rootEl.style.colorScheme === "light");
  t("宣纸 theme-color=#f6f1e3", meta.attrs.content === "#f6f1e3");
  vm.runInContext('RP_THEME.apply("songyan")', ctx);
  t("切回深色恢复 dark", rootEl.style.colorScheme === "dark" && meta.attrs.content === "#0e1418");
}

/* (2) transition:all 清零, toast 只动画 opacity/transform */
t("style.css 无 transition:all", !/transition\s*:\s*all/.test(css));
t("achv-toast 列明属性", /\.achv-toast\{[^}]*transition:opacity \.3s, transform \.3s/.test(css));

/* (3) 全局 focus-visible 焦点环 */
t("有全局 :focus-visible 规则", /button:focus-visible[^{]*\{[^}]*outline:2px solid var\(--gold-deep\)/.test(css));
t("focus 规则覆盖 div 按钮(role=button)", css.indexOf('[role="button"]:focus-visible') >= 0);

/* (4) 药丸按钮命中扩展到 44px */
t("msgtools 按钮有 ::after 命中扩展", /\.msgtools button::after[^}]*height:44px/.test(css));
t("ghostbar 按钮有 ::after 命中扩展", /\.ghostbar button::after[^}]*height:44px/.test(css));

/* aria 兜底仍在: a11y 观察者 + 类名表含 backbtn; voicebub 靠 title 优先规则 */
t("a11y 兜底观察者在", a11y.indexOf("MutationObserver") >= 0 && a11y.indexOf("labelButton") >= 0);
t("a11y 类名表含 backbtn", a11y.indexOf('"backbtn","返回"') >= 0);
t("a11y 优先用 title 作标签", a11y.indexOf('getAttribute("title")') >= 0);

/* (6) 2026-11-23 美化四组落地(甲质感/乙纵深/丙卡面/丁细节) */
{
  const ui42 = fs.readFileSync(path.join(WWW, "ui42.css"), "utf8");
  const appUi = fs.readFileSync(path.join(WWW, "js/app_ui.js"), "utf8");
  /* 甲: chatbg 质感层 */
  t("chatbg 有质感层 ::after", css.indexOf(".chatbg::after") >= 0);
  t("质感层含噪点 SVG", css.indexOf("feTurbulence") >= 0);
  t("质感层含墨晕渐变", /\.chatbg::after[^}]*radial-gradient\(90% 34%/.test(css));
  /* 乙: 气泡纵深 + 印章点 */
  t("AI 气泡改渐变+暖影", /\.bubble\{[^}]*linear-gradient\(180deg[^}]*box-shadow:0 4px 14px/.test(css));
  t("AI 气泡行高 26", /\.bubble\{[^}]*line-height:26px/.test(css));
  t("用户气泡斜向金渐变", /\.msg\.me \.bubble\{[^}]*linear-gradient\(135deg/.test(css));
  t("名牌渲染印章点", appUi.indexOf('class="seal"') >= 0);
  t("印章点样式在 ui42", /\.whoav \.seal\{[^}]*#c0392b/.test(ui42));
  /* 丙: 选角卡 */
  t("封面渐变压到 .92", css.indexOf("rgba(10,8,4,.92) 100%") >= 0);
  t("来源徽标毛玻璃胶囊", /\.charcover \.tag\{[^}]*border-radius:999px[^}]*blur\(8px\)/.test(css));
  t("卡身金线 ::before", /\.charbody::before\{[^}]*linear-gradient\(90deg, var\(--gold\)/.test(css));
  t("卡名带字距", /\.covermeta \.n\{[^}]*letter-spacing:\.05em/.test(css));
  /* 丁: 细节包 */
  t("封面淡入动画", css.indexOf("@keyframes charimg-in") >= 0 && /\.charcover \.charimg\{[^}]*animation:charimg-in/.test(css));
  t("淡入有 reduced-motion 兜底", /prefers-reduced-motion:reduce\)\{ \.charcover \.charimg\{ animation:none; \} \}/.test(css));
  t("数字等宽规则", css.indexOf("font-variant-numeric:tabular-nums") >= 0);
  t("卡名标题 balance", /\.covermeta \.n\{[^}]*text-wrap:balance/.test(css));
}

/* (7) 2026-11-23 美化第二批(戊书架/己装裱/庚玻璃/辛空态/壬分隔与旁白/癸动效/子纹样随主题) */
{
  const ui42 = fs.readFileSync(path.join(WWW, "ui42.css"), "utf8");
  const prefs = fs.readFileSync(path.join(WWW, "js/app_prefs.js"), "utf8");
  const wiring = fs.readFileSync(path.join(WWW, "rp/wiring.js"), "utf8");
  /* 戊 书架成套 */
  t("书封淡入", /\.bw-cover\{[^}]*animation:charimg-in/.test(css));
  t("书架信息区金线", /\.bw-info::before\{[^}]*linear-gradient\(90deg, var\(--gold\)/.test(css));
  t("run 横幅淡入", /\.runbanner img\{[^}]*animation:charimg-in/.test(css));
  /* 己 装裱 + 墨点 */
  t("大图装裱留白+金线", /\.charhero\{[^}]*padding:10px[^}]*inset 0 0 0 1px rgba\(212,162,78/.test(css));
  t("时间线墨点", /\.tl-item:before\{[^}]*radial-gradient\(circle at 35% 32%/.test(css));
  /* 庚 玻璃补完 */
  t("顶栏金线", /#topbar\{[^}]*border-bottom:1px solid rgba\(212,162,78,\.18\)/.test(css));
  t("聊天顶栏毛玻璃", /body\.chatmode \.chathead\{[^}]*backdrop-filter:blur\(14px\)/.test(css));
  t("底栏 blur 带饱和", /#mainnav\{[^}]*backdrop-filter:blur\(16px\) saturate/.test(css));
  /* 辛 空状态题跋 */
  t("聊天空状态有竖排淡印", prefs.indexOf('class="empty-seal"') >= 0);
  t("淡印样式竖排", /\.empty-seal\{[^}]*writing-mode:vertical-rl/.test(css));
  /* 壬 日期分隔 + 旁白楷体 */
  t("renderChat 预计算分隔集", prefs.indexOf("__sepSet") >= 0 && prefs.indexOf('class="daysep"') >= 0);
  t("daysep 样式两侧发丝线", /\.daysep::before, \.daysep::after/.test(css));
  t("旁白换文楷去斜体", /\.seg-nar\{[^}]*LXGW WenKai/.test(ui42) && !/\.seg-nar\{[^}]*font-style:italic/.test(ui42));
  /* 壬 时辰/农历行为: 从 app_prefs 抽出纯函数实测 */
  const mBlk = prefs.match(/const __LUNAR_DAYS[\s\S]*?function daySepText\(ts\)\{[\s\S]*?\n\}/);
  t("daySepText 函数可抽取", !!mBlk);
  if(mBlk){
    const ctx = { Intl, Date, console };
    vm.createContext(ctx);
    vm.runInContext(mBlk[0] + "\nthis.__f = daySepText;", ctx);
    const f = ctx.__f;
    t("23 点是子时初", /子时初$/.test(f(new Date(2026, 10, 23, 23, 30).getTime())));
    t("0 点是子时正", /子时正$/.test(f(new Date(2026, 10, 23, 0, 30).getTime())));
    t("13 点是未时初", /未时初$/.test(f(new Date(2026, 10, 23, 13, 0).getTime())));
    t("14 点是未时正", /未时正$/.test(f(new Date(2026, 10, 23, 14, 0).getTime())));
    t("日期段是农历表日名", /月(初|十|廿|三十)/.test(f(new Date(2026, 10, 23, 12, 0).getTime())));
  }
  /* 癸 动效补完 */
  t("stagger 延到第 8 张", css.indexOf(".chargrid .charcard:nth-child(8)") >= 0);
  t("好感数值带起止数据", wiring.indexOf('class="wire-num"') >= 0 && wiring.indexOf('data-from="') >= 0);
  t("renderChat 调用计数动画", prefs.indexOf("animateWireNum(log)") >= 0);
  t("计数动画 honor reduced-motion", prefs.indexOf("prefers-reduced-motion: reduce") >= 0);
  /* 子 纹样随主题 */
  t("墨晕走主题变量", /\.chatbg::after[^}]*color-mix\(in srgb, var\(--gold\)/.test(css));
  t("浅色主题质感收一档", css.indexOf('html[data-theme="xuanzhi"] .chatbg::after') >= 0);
}

/* (8) 2026-11-23 美化癸·方向感转场(菜单最后一件大件) */
{
  const core = fs.readFileSync(path.join(WWW, "js/app_core.js"), "utf8");
  t("方向关键帧齐备", css.indexOf("@keyframes viewin-fwd") >= 0 && css.indexOf("@keyframes viewin-back") >= 0);
  t("fwd/back 规则存在", css.indexOf('html[data-navdir="fwd"] #view') >= 0 && css.indexOf('html[data-navdir="back"] #view') >= 0);
  t("方向规则排在 vivid 之后(同分靠后胜出)",
    css.indexOf('html[data-navdir="fwd"] #view') > css.indexOf('html[data-motion="vivid"] #view'));
  t("系统返回键设 back", /__onBackPressed = \(\)=>\{\s*try\{\s*__setNavDir\("back"\)/.test(core));
  t("手势推断监听齐备", core.indexOf('t.closest(".backbtn")') >= 0
    && core.indexOf('".charcard, .bw-card, .travmode, .railcard"') >= 0);
  t("底栏切页清中性", core.indexOf('__setNavDir(""); setNav(b.dataset.nav)') >= 0);
  /* __setNavDir 行为实测: 抽函数 + DOM 桩 */
  const mFn = core.match(/let __navDirTimer = 0;\nfunction __setNavDir\(d\)\{[\s\S]*?\n\}/);
  t("__setNavDir 可抽取", !!mFn);
  if(mFn){
    const attrs = {};
    const ctx = {
      window: { matchMedia: null },
      document: { documentElement: {
        setAttribute: (k, v)=>{ attrs[k] = v; },
        removeAttribute: (k)=>{ delete attrs[k]; },
      } },
      setTimeout, clearTimeout, console,
    };
    ctx.matchMedia = ()=>({ matches: false });
    ctx.window.matchMedia = ctx.matchMedia;
    vm.createContext(ctx);
    vm.runInContext(mFn[0] + "\nthis.__f = __setNavDir;", ctx);
    ctx.__f("fwd");
    t("fwd 落属性", attrs["data-navdir"] === "fwd");
    ctx.__f("");
    t("空串清属性", !("data-navdir" in attrs));
    ctx.matchMedia = ()=>({ matches: true });
    ctx.__f("back");
    t("减少动态时不设方向", !("data-navdir" in attrs));
  }
}

/* (9) 2026-11-23 浅色主题旁白修正(用户真机截图: 深色阴影压浅壁纸灰糊突兀) */
{
  const ui42 = fs.readFileSync(path.join(WWW, "ui42.css"), "utf8");
  t("浅色主题旁白覆盖存在", ui42.indexOf('html[data-theme="xuanzhi"] .bubble.segd .seg-nar') >= 0);
  t("覆盖含浅色光晕", /qiuxiang"\] \.bubble\.segd \.seg-nar\{[^}]*text-shadow:0 1px 2px rgba\(255,253,245/.test(ui42));
  t("覆盖字色走 ink 76%", /qiuxiang"\] \.bubble\.segd \.seg-nar\{[^}]*color:color-mix\(in srgb, var\(--ink\) 76%/.test(ui42));
  t("深色主题旁白原样保留", /\.bubble\.segd \.seg-nar\{\s*color:var\(--ink-dim\)/.test(ui42));
}

console.log(`test_ui_audit_fixes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
