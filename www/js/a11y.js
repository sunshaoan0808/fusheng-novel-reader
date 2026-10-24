/* v41 无障碍通用补丁 / generic accessibility pass
 *
 * 页面大量用 innerHTML 拼的 <div onclick> 当按钮、只有图标的 <button>，逐处改模板风险大且改不完。
 * 这里用一个 MutationObserver 统一兜底（只补属性，不改结构、不改行为）：
 *  1. 带 onclick 的非原生可交互元素（div/span/li…）→ role="button" + tabindex="0"；
 *     Enter / 空格 触发 click（原生 button/a/input/summary 不动）。
 *  2. 只有图标/单个符号、没有可读文字的 <button> → 补 aria-label（优先 title，其次已知类名/符号表）。
 *  3. 底栏 #mainnav：aria-label + 当前项 aria-current="page"；图标 span 已有 aria-hidden。
 * 每帧最多处理一次（rAF 合批），只扫新增子树，流式渲染时开销可忽略。 */
(function(root){
  "use strict";
  var doc = root.document;
  if(!doc || typeof root.MutationObserver !== "function") return;

  var NATIVE = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL|OPTION|DETAILS|AUDIO|VIDEO)$/;
  /* 只有符号时的读法 */
  var SYMBOL_LABEL = { "‹":"返回", "<":"返回", "›":"下一个", "×":"关闭", "✕":"关闭", "✖":"关闭", "x":"关闭",
    "↑":"上移", "↓":"下移", "+":"添加", "−":"减少", "-":"减少", "⋯":"更多", "…":"更多", "☰":"菜单" };
  /* 已知图标按钮类名 */
  var CLASS_LABEL = [["backbtn","返回"],["menubtn","菜单"],["back","返回"],["closebtn","关闭"],["close","关闭"],
    ["sendbtn","发送"],["narrbtn","旁白模式"],["atbtn","@ 点名"]];

  function readable(el){
    var t = (el.textContent || "").replace(/\s+/g, "");
    return t;
  }
  function labelButton(b){
    if(b.hasAttribute("aria-label") || b.hasAttribute("aria-labelledby")) return;
    var t = readable(b);
    if(t.length > 1 && !(t.length <= 2 && SYMBOL_LABEL[t])) return;   /* 有正常文字 */
    var lb = b.getAttribute("title") || "";
    if(!lb && t && SYMBOL_LABEL[t]) lb = SYMBOL_LABEL[t];
    if(!lb){
      for(var i = 0; i < CLASS_LABEL.length; i++){
        if(b.classList && b.classList.contains(CLASS_LABEL[i][0])){ lb = CLASS_LABEL[i][1]; break; }
      }
    }
    if(!lb && b.dataset && b.dataset.ico) lb = b.dataset.ico;
    if(lb) b.setAttribute("aria-label", lb);
  }
  function fixClickable(el){
    if(NATIVE.test(el.tagName)) return;
    /* 只为拦冒泡写的 onclick（如 onclick="event.stopPropagation()"）不是按钮 */
    if(/^\s*event\.stopPropagation\(\)\s*;?\s*$/.test(el.getAttribute("onclick") || "")) return;
    if(el.getAttribute("role") == null) el.setAttribute("role", "button");
    if(!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
  }
  function scan(rootEl){
    if(!rootEl || rootEl.nodeType !== 1) return;
    try{
      if(rootEl.hasAttribute("onclick")) fixClickable(rootEl);
      if(rootEl.tagName === "BUTTON") labelButton(rootEl);
      var cs = rootEl.querySelectorAll("[onclick]");
      for(var i = 0; i < cs.length; i++) fixClickable(cs[i]);
      var bs = rootEl.querySelectorAll("button");
      for(var j = 0; j < bs.length; j++) labelButton(bs[j]);
    }catch(e){}
  }
  function syncNav(){
    try{
      var nav = doc.getElementById("mainnav");
      if(nav){
        if(!nav.hasAttribute("aria-label")) nav.setAttribute("aria-label", "主导航");
        var bs = nav.querySelectorAll("button");
        for(var i = 0; i < bs.length; i++){
          if(bs[i].classList.contains("active")) bs[i].setAttribute("aria-current", "page");
          else bs[i].removeAttribute("aria-current");
        }
      }
      var tabs = doc.getElementById("tabs");
      if(tabs && !tabs.hasAttribute("aria-label")) tabs.setAttribute("aria-label", "书目分区");
    }catch(e){}
  }

  var pending = [], scheduled = false;
  var raf = root.requestAnimationFrame || function(f){ return setTimeout(f, 16); };
  function flush(){
    scheduled = false;
    var list = pending; pending = [];
    for(var i = 0; i < list.length; i++) if(list[i].isConnected !== false) scan(list[i]);
    syncNav();
  }
  function queue(n){ pending.push(n); if(!scheduled){ scheduled = true; raf(flush); } }

  var mo = new root.MutationObserver(function(muts){
    for(var i = 0; i < muts.length; i++){
      var m = muts[i];
      if(m.type === "childList"){
        for(var j = 0; j < m.addedNodes.length; j++) if(m.addedNodes[j].nodeType === 1) queue(m.addedNodes[j]);
      } else if(m.type === "attributes" && m.target && m.target.parentNode && m.target.parentNode.id === "mainnav"){
        if(!scheduled){ scheduled = true; raf(flush); }
      }
    }
  });

  /* 键盘激活：role=button 的非原生元素按 Enter/空格 = 点击 */
  doc.addEventListener("keydown", function(e){
    var k = e.key;
    if(k !== "Enter" && k !== " " && k !== "Spacebar") return;
    var el = e.target;
    if(!el || el.nodeType !== 1 || NATIVE.test(el.tagName)) return;
    if(el.getAttribute("role") !== "button" || el.isContentEditable) return;
    e.preventDefault();
    try{ el.click(); }catch(_){}
  }, true);

  function start(){
    scan(doc.body);
    syncNav();
    mo.observe(doc.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
  }
  if(doc.body) start(); else doc.addEventListener("DOMContentLoaded", start);

  root.RP_A11Y = { scan: scan, syncNav: syncNav };
})(typeof window !== "undefined" ? window : globalThis);
