/* 送礼互动（2026-11-25 借鉴 Tipsy 送礼涨好感）：
 * 礼物单由角色卡的喜好/厌恶字段现场生成——目录是通用雅物，
 * 命中 preference_like 的是「心头好」(+8)，命中 dislike_hate 的是
 * 「忌讳」(-3，送错也有戏)，其余是「心意」(+3)。
 * 送礼后留一张一次性纸条（pending note），下一轮 sendMessage 消费并
 * 注入 system，让角色在回复里自然反应（与 Push Story 同制）。
 * 好感落账走 RP_WIRING.applyFavorDelta（与 AI 结算同一本账）。 */
var RP_GIFT = (function(){
"use strict";

var CATALOG = [
  {id:"book",  name:"诗集书卷", keys:["书","诗","读","字画","文房","笔墨","字"]},
  {id:"tea",   name:"明前香茶", keys:["茶","品茗","茗"]},
  {id:"flower",name:"时令鲜花", keys:["花","赏花","园","兰","菊","梅"]},
  {id:"rouge", name:"胭脂水粉", keys:["胭脂","水粉","妆","脂粉","美容"]},
  {id:"sachet",name:"安神香囊", keys:["香囊","熏香","安神","香"]},
  {id:"fan",   name:"湘竹折扇", keys:["扇","折扇"]},
  {id:"pastry",name:"精致糕点", keys:["糕","点心","吃","食","甜","零嘴"]},
  {id:"jade",  name:"温润玉佩", keys:["玉","佩","首饰","金银","珠宝"]},
  {id:"censer",name:"小叶香炉", keys:["香炉","焚香","佛","禅","礼佛"]},
  {id:"wine",  name:"陈年佳酿", keys:["酒","饮","豪饮"]},
];
var DELTAS = {"心头好": 8, "心意": 3, "忌讳": -3};

function hitAny(text, keys){
  if(!text) return false;
  for(var i = 0; i < keys.length; i++) if(text.indexOf(keys[i]) >= 0) return true;
  return false;
}
function classify(card, gift){
  var f = (card && card.fields) || {};
  var hate = String(f.dislike_hate || "");
  var like = String(f.preference_like || "");
  if(hitAny(hate, gift.keys)) return "忌讳";
  if(hitAny(like, gift.keys)) return "心头好";
  return "心意";
}
function optionsFor(card){
  var out = CATALOG.map(function(g){
    var kind = classify(card, g);
    return {id: g.id, name: g.name, kind: kind, delta: DELTAS[kind]};
  });
  var rank = {"心头好": 0, "心意": 1, "忌讳": 2};
  out.sort(function(a, b){ return rank[a.kind] - rank[b.kind]; });
  return out;
}

var notes = {}; // runId|name -> 一次性纸条文本
function keyOf(runId, name){ return (runId || "") + "|" + (name || ""); }

function give(runId, name, giftId, card){
  var gift = null;
  for(var i = 0; i < CATALOG.length; i++) if(CATALOG[i].id === giftId) gift = CATALOG[i];
  if(!gift) return null;
  var kind = classify(card, gift);
  var delta = DELTAS[kind];
  var total = null;
  try{
    if(typeof RP_WIRING !== "undefined" && RP_WIRING.applyFavorDelta){
      var r = RP_WIRING.applyFavorDelta(runId, name, delta);
      if(r) total = r.total;
    }
  }catch(e){}
  var flavor = kind === "心头好" ? "这正合你的喜好" :
    kind === "忌讳" ? "这恰是你平日厌恶之物" : "这是一份寻常心意";
  notes[keyOf(runId, name)] =
    "【送礼】用户刚刚送了你一份礼物：「" + gift.name + "」（" + flavor + "）。" +
    "请在接下来的回复中自然地对此作出符合你性格的反应，不要跳出角色解释数值或机制。";
  return {gift: gift, kind: kind, delta: delta, total: total};
}
function consumeNote(runId, name){
  var k = keyOf(runId, name);
  var n = notes[k] || "";
  if(n) delete notes[k];
  return n;
}

return {CATALOG: CATALOG, optionsFor: optionsFor, classify: classify,
  give: give, consumeNote: consumeNote};
})();
