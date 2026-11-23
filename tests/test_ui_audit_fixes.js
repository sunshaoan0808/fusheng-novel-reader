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

console.log(`test_ui_audit_fixes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
