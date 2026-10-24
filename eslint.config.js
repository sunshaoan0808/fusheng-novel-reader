/* 最小 ESLint 配置（仅开发期，运行时零依赖）。
 * www/ 是不经打包、靠 <script> 顺序共享全局的浏览器脚本，所以：
 *  - sourceType 用 script，不报未定义全局（模块之间靠全局互相引用）；
 *  - 只开能抓真 bug 的少量规则，不做风格约束。
 * 用法：npm i && npm run lint */
"use strict";
const browserGlobals = {
  window: "readonly", document: "readonly", navigator: "readonly", location: "readonly",
  localStorage: "readonly", sessionStorage: "readonly", indexedDB: "readonly",
  console: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
  setInterval: "readonly", clearInterval: "readonly", requestAnimationFrame: "readonly",
  fetch: "readonly", alert: "readonly", confirm: "readonly", prompt: "readonly",
  globalThis: "readonly", module: "writable", require: "readonly", process: "readonly",
  __dirname: "readonly", Blob: "readonly", URL: "readonly", FileReader: "readonly",
  TextEncoder: "readonly", TextDecoder: "readonly", AbortController: "readonly",
};
module.exports = [
  { ignores: ["www/data/**", "www/data.js", "www/proto/**", "node_modules/**", "android/**", "**/*.min.js"] },
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: browserGlobals },
    rules: {
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "warn",
      "no-unsafe-finally": "error",
      "no-func-assign": "error",
      "no-const-assign": "error",
      "no-redeclare": "off",
      "no-undef": "off",
      "valid-typeof": "error",
      "use-isnan": "error",
    },
  },
];
