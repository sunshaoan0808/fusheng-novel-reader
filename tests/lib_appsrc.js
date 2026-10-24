/* 测试辅助（非测试文件，run_tests 只跑 test_*.js）：
 * v41 起 app.js 按区段拆到 www/js/*.js（index.html 里紧挨 app.js 之前按原顺序加载）。
 * 读 app.js 源码做 grep 断言 / 在 vm 里整段载入 app.js 的测试，统一经这里取：
 *   APP_FILES(WWW)  —— index.html 中 app.js 及其之前的 js/*.js，按加载顺序（相对 WWW 的路径）
 *   appSource(WWW)  —— 上述文件按加载顺序拼接的源码（与拆分前的 app.js 同序）
 * Test helper: the split-out app sections + app.js, in index.html load order. */
"use strict";
const fs = require("fs");
const path = require("path");
function APP_FILES(WWW){
  const html = fs.readFileSync(path.join(WWW, "index.html"), "utf8");
  const srcs = [];
  html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, s) => { srcs.push(s); return m; });
  const ai = srcs.indexOf("app.js");
  if(ai < 0) throw new Error("index.html 未找到 app.js");
  return srcs.slice(0, ai).filter(s => /^js\//.test(s)).concat(["app.js"]);
}
function appSource(WWW){
  return APP_FILES(WWW).map(f => fs.readFileSync(path.join(WWW, f), "utf8")).join("\n");
}
module.exports = { APP_FILES, appSource };
