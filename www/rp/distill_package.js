/* 剧本包管理 (2026-10-07 v2): 一本书 = 一个剧本包。
 * 结构: meta + characters/ + relations + plot/ + worldbook
 * 存储: localStorage (小包) / IndexedDB (大包，复用 RP_STORE)
 */
var DISTILL_PACKAGE = (function(){
"use strict";

var PREFIX = "nd_package_";
var INDEX_KEY = "nd_package_index";

// 混合存储: 小数据走 localStorage，大数据自动搬到 IndexedDB/文件层
function _storeSet(key, json){
  var ok = true;
  try{ localStorage.setItem(key, json); }catch(e){
    ok = false;
    typeof RP_WARN!=="undefined"&&RP_WARN.saveFail("剧本包保存失败", e);
  }
  try{
    if(typeof RP_STORE !== "undefined"){
      RP_STORE.cacheSet(key, json);
      RP_STORE.syncBig(key, json);
    }
  }catch(e){}
  return ok;
}
function _storeGet(key){
  var s = null;
  try{
    if(typeof RP_STORE !== "undefined"){
      s = (RP_STORE.getSync || RP_STORE.cacheGet).call(RP_STORE, key);
    }
  }catch(e){}
  if(s == null){
    try{ s = localStorage.getItem(key); }catch(e){}
  }
  return s;
}
function _storeDel(key){
  try{ localStorage.removeItem(key); }catch(e){}
  try{
    /* 只删 localStorage 会漏掉 RP_STORE 已搬到 IndexedDB / 文件层的那份，
     * 于是"删了的包"仍占着空间、还能被 getSync 读回来。 */
    if(typeof RP_STORE !== "undefined" && RP_STORE.removeItemAsync) RP_STORE.removeItemAsync(key);
    else if(typeof RP_STORE !== "undefined" && RP_STORE.evictFile) RP_STORE.evictFile(key);
  }catch(e){}
}

/* 剧本包内的固定数据分区 (saveData 用到的 key)，删除时要逐个点名，
 * 不能只依赖 localStorage 枚举 —— 大包的数据根本不在 localStorage 里。 */
var DATA_KEYS = ["relations", "plot", "worldbook", "provenance", "audits", "probes",
  "openings", "unanchored", "change_log"];

function listPackages(){
  try{
    return JSON.parse(_storeGet(INDEX_KEY) || "[]");
  }catch(e){ return []; }
}

function saveIndex(idx){
  _storeSet(INDEX_KEY, JSON.stringify(idx));
}

function createPackage(novelName){
  var id = "pkg_" + Date.now().toString(36);
  var pkg = {
    id: id,
    novel: novelName,
    created: Date.now(),
    characters: [],  // [{name, aliases, importance, count}]
    // 角色卡、关系、剧情存分开的 key
  };
  var idx = listPackages();
  idx.push({id: id, novel: novelName, created: pkg.created, charCount: 0});
  saveIndex(idx);
  _storeSet(PREFIX + id + "_meta", JSON.stringify(pkg));
  return pkg;
}

function getPackage(id){
  try{
    return JSON.parse(_storeGet(PREFIX + id + "_meta") || "null");
  }catch(e){ return null; }
}

function updatePackage(pkg){
  _storeSet(PREFIX + pkg.id + "_meta", JSON.stringify(pkg));
  var idx = listPackages();
  var item = idx.find(function(x){ return x.id === pkg.id; });
  if(item){
    item.charCount = pkg.characters.length;
    item.updated = Date.now();
    saveIndex(idx);
  }
}

// 角色卡
function saveCharacterCard(pkgId, name, card){
  _storeSet(PREFIX + pkgId + "_char_" + name, JSON.stringify(card));
}

function getCharacterCard(pkgId, name){
  try{
    return JSON.parse(_storeGet(PREFIX + pkgId + "_char_" + name) || "null");
  }catch(e){ return null; }
}

function listCharacterCards(pkgId){
  var pkg = getPackage(pkgId);
  if(!pkg) return [];
  return pkg.characters.map(function(c){
    var card = getCharacterCard(pkgId, c.name);
    return {name: c.name, aliases: c.aliases, importance: c.importance, hasCard: !!card};
  });
}

// 关系 / 剧情 / 世界书
function saveData(pkgId, key, data){
  _storeSet(PREFIX + pkgId + "_" + key, JSON.stringify(data));
}

function getData(pkgId, key){
  try{
    return JSON.parse(_storeGet(PREFIX + pkgId + "_" + key) || "null");
  }catch(e){ return null; }
}

function deletePackage(id){
  var pkg = getPackage(id);
  // 已知 key 全点名（不依赖 localStorage 枚举：搬到 IDB/文件层的键枚举不到）
  var keys = [PREFIX + id + "_meta"];
  DATA_KEYS.forEach(function(k){ keys.push(PREFIX + id + "_" + k); });
  ((pkg && pkg.characters) || []).forEach(function(c){
    keys.push(PREFIX + id + "_char_" + c.name);
  });
  // 兜底：localStorage 里还能枚举到的同前缀键
  try{
    for(var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if(k && k.indexOf(PREFIX + id) === 0 && keys.indexOf(k) < 0) keys.push(k);
    }
  }catch(e){}
  keys.forEach(function(k){ _storeDel(k); });
  var idx = listPackages().filter(function(x){ return x.id !== id; });
  saveIndex(idx);
}

// 导出为 JSON (分享)
function exportPackage(id){
  var pkg = getPackage(id);
  if(!pkg) return null;
  var out = {
    meta: pkg,
    characters: {},
    relations: getData(id, "relations"),
    plot: getData(id, "plot"),
    worldbook: getData(id, "worldbook")
  };
  pkg.characters.forEach(function(c){
    out.characters[c.name] = getCharacterCard(id, c.name);
  });
  // T1: 标记已备份
  try{
    if(typeof DISTILL_BACKUP !== "undefined") DISTILL_BACKUP.markBackedUp(id);
  }catch(e){}
  return out;
}

return {
  listPackages: listPackages,
  createPackage: createPackage,
  getPackage: getPackage,
  updatePackage: updatePackage,
  saveCharacterCard: saveCharacterCard,
  getCharacterCard: getCharacterCard,
  listCharacterCards: listCharacterCards,
  saveData: saveData,
  getData: getData,
  deletePackage: deletePackage,
  exportPackage: exportPackage
};
})();
