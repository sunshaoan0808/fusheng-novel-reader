/* 按需加载的模块组 (2026-10-18)
 * 蒸馏的 23 个文件只在点"蒸馏"或用蒸馏包聊天时才需要，首屏不该下载/解析它们。
 * 顺序必须与原先 index.html 里一致：distill_quality 在模块初始化时就读
 * DISTILL_CORE.PROFILE_FIELDS，所以只能串行加载、不能并行。
 */
(function(){
"use strict";

var GROUPS = {
  distill: [
    "rp/distill_llm.js",
    "rp/distill_chunk.js",
    "rp/distill_core.js",
    "rp/distill_alias.js",
    "rp/distill_relations.js",
    "rp/distill_plot.js",
    "rp/distill_discover.js",
    "rp/distill_package.js",
    "rp/distill_provenance.js",
    "rp/distill_quality.js",
    "rp/distill_change.js",
    "rp/distill_library.js",
    "rp/distill_worldbook.js",
    "rp/distill_timeleak.js",
    "rp/distill_openings.js",
    "rp/distill_auditor.js",
    "rp/distill_playground.js",
    "rp/distill_probes.js",
    "rp/distill_backup.js",
    "rp/distill_macro.js",
    "rp/distill_memory.js",
    "rp/distill_style.js",
    "rp/distill_ui.js"
  ]
};

var state = {};    // name -> Promise（正在加载/已加载）
var loaded = {};   // name -> true（已全部就绪）

function loadOne(src){
  return new Promise(function(res, rej){
    var s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = function(){ res(); };
    s.onerror = function(){ rej(new Error("加载失败: " + src)); };
    (document.head || document.documentElement).appendChild(s);
  });
}

/* 串行加载一组；并发点进来复用同一个 Promise */
function ensureGroup(name){
  if(state[name]) return state[name];
  var list = GROUPS[name];
  if(!list) return Promise.resolve();
  state[name] = list.reduce(function(p, src){
    return p.then(function(){ return loadOne(src); });
  }, Promise.resolve()).then(function(){
    loaded[name] = true;
  }).catch(function(e){
    state[name] = null;   // 失败可重试，不把坏状态永久缓存
    throw e;
  });
  return state[name];
}

function groupReady(name){ return !!loaded[name]; }

window.RP_LAZY = { ensureGroup: ensureGroup, groupReady: groupReady, groups: GROUPS };
})();
