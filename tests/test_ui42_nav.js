/* v42 底栏四栏：书架 / 聊天 / 创作 / 我的；老路由（distill/traverse/writer/settings）全部仍可达 */
const fs = require("fs"), path = require("path");
const WWW = fs.existsSync("assets/www") ? "assets/www" : "www";
const { appSource } = require("./lib_appsrc.js");
let pass = 0, fail = 0;
const t = (n, c) => { c ? pass++ : (fail++, console.log("FAIL:", n)); };
const html = fs.readFileSync(path.join(WWW, "index.html"), "utf8");
const src = appSource(WWW);
const navs = []; html.replace(/<nav id="mainnav"[\s\S]*?<\/nav>/, m => { m.replace(/data-nav="(\w+)"/g, (x, n) => navs.push(n)); return m; });
t("底栏恰好四栏且顺序为 书架/聊天/创作/我的", JSON.stringify(navs) === '["product","chat","create","me"]');
t("底栏文字", /data-nav="create"[^>]*>创作</.test(html) && /data-nav="me"[^>]*>我的</.test(html));
["distill", "traverse", "writer", "settings", "chat", "product", "tasks"].forEach(r =>
  t("老路由仍在 setNav 里: " + r, new RegExp('n==="' + r + '"').test(src)));
t("新路由 create/me 已接线", /n==="create"\)\{[^}]*showCreateHub\(\)/.test(src) && /n==="settings" \|\| n==="me"\)\{[^}]*showMe\(\)/.test(src));
t("高亮映射：蒸馏/穿越/写卡→创作，设置→我的", /distill:"create", traverse:"create", writer:"create", tasks:"create", settings:"me"/.test(src));
t("系统返回：创作子页回创作", /NAV === "distill" \|\| NAV === "traverse" \|\| NAV === "writer"\)\{ setNav\("create"\)/.test(src));
t("创作页三个入口指向原路由", ["distill", "traverse", "writer"].every(n => src.indexOf('{nav: "' + n + '"') >= 0) && src.indexOf("setNav('${jq(t.nav)}')") >= 0);
t("我的 = 原设置页 + 统计", /function showMe\(\)\{\s*showSettings\(\);/.test(src) && src.indexOf("meStatsHTML()") >= 0);
console.log(`ui42_nav: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
