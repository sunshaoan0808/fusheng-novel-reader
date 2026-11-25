/* ScenePlay 入戏模式（2026-11-25 借鉴 Tipsy ScenePlay 的「打包」思路）：
 * 我们早有全部零件——世界模拟（场景状态）、选项卡（回复末尾行动选项）、
 * CG 自动配图、导演——缺的是把它们装成一个有名字的入口。
 * 入戏开 = 每轮强制 3 个推进选项 + 顶部入场场景横幅 + 场景感知；
 * 状态按聊持久化（runId|name），仅单聊。 */
var RP_SCENEPLAY = (function(){
"use strict";
var KEY = "nd_sceneplay_v1";
function load(){ try{ return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }catch(e){ return {}; } }
function save(m){ try{ localStorage.setItem(KEY, JSON.stringify(m)); }catch(e){} }
function keyOf(runId, name){ return (runId || "") + "|" + (name || ""); }
function isOn(runId, name){ return !!load()[keyOf(runId, name)]; }
function setOn(runId, name, on){
  var m = load(), k = keyOf(runId, name);
  if(on) m[k] = 1; else delete m[k];
  save(m);
  return !!on;
}
function toggle(runId, name){ return setOn(runId, name, !isOn(runId, name)); }
return {isOn: isOn, setOn: setOn, toggle: toggle, KEY: KEY};
})();
