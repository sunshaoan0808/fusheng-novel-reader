/* v41 Soul 扩展模块共用的 localStorage 读写 / shared JSON-bucket storage for soul_h…soul_zz
 * 原先 soul_i/k/l/m/r…x/y/zz/aa…ak 每个文件各抄一份 k()/g()/s() 三件套（键前缀不同）。
 * 现统一为 RP_SOUL_KV.bucket(prefix) → {k, g, s, rm}，键名与读写语义与原实现逐字节一致：
 *   k(c)   = prefix + c
 *   g(c)   = JSON.parse(localStorage[k(c)] || "{}")，失败返回 {}
 *   s(c,o) = localStorage[k(c)] = JSON.stringify(o)，失败静默
 * 必须在这些 soul_*.js 之前加载（index.html 已排好）。显式挂到 globalThis，
 * 避免顶层 const/var 在某些宿主里拿不到（见 beats.js 的教训）。 */
var RP_SOUL_KV = (function(){
  "use strict";
  function bucket(prefix){
    prefix = String(prefix || "");
    function k(c){ return prefix + c; }
    function g(c){ try{ return JSON.parse(localStorage.getItem(k(c)) || "{}"); }catch(e){ return {}; } }
    function s(c, o){ try{ localStorage.setItem(k(c), JSON.stringify(o)); }catch(e){} }
    function rm(c){ try{ localStorage.removeItem(k(c)); }catch(e){} }
    return { k:k, g:g, s:s, rm:rm, prefix:prefix };
  }
  return { bucket: bucket };
})();
if(typeof globalThis !== "undefined") globalThis.RP_SOUL_KV = RP_SOUL_KV;
if(typeof module !== "undefined" && module.exports) module.exports = RP_SOUL_KV;
